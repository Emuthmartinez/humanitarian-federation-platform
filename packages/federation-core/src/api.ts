import { z } from 'zod';
import {
  findCsvPersonDuplicateCandidates,
  groupCsvPersonCandidates,
  parseCsvPersonRecords,
  type CsvCandidatePersonGroup,
  type CsvDuplicateCandidate,
  type CsvPersonColumnMapping,
  type CsvPersonInputOptions,
  type CsvPersonParseFailure,
  type CsvPersonRecordRef,
} from './csv-dedupe.js';
import { PersonStatuses, type FederatedPersonRecord, type PersonStatus } from './schemas.js';
import {
  buildCsvEmbeddingInputs,
  embedCsvRecords,
  findEmbeddingDuplicateCandidates,
  type EmbeddedCsvRecord,
  type EmbeddingCandidateOptions,
  type EmbeddingDuplicateCandidate,
  type EmbeddingProvider,
} from './embeddings.js';
import {
  buildGroupedPersonViewModel,
  type GroupedPersonViewModel,
} from './grouped-view.js';

const MAX_CSV_UPLOAD_BYTES = 20_000_000;
const MAX_PUBLIC_INTAKE_PAYLOAD_CHARS = 5_000_000;
const MAX_PUBLIC_INTAKE_URLS = 50;

export const PublicIntakePayloadFormats = ['json', 'csv', 'url_list', 'text', 'unknown'] as const;
export const PublicIntakeSubmissionKinds = [
  'person',
  'entity',
  'need',
  'status',
  'media',
  'url_list',
  'mixed',
  'unknown',
] as const;
export const PublicIntakeReceivedVia = ['public_api', 'discord', 'web_form', 'partner_forward', 'unknown'] as const;
export const PublicIntakeReviewStatuses = ['received_for_review', 'triaged', 'promoted', 'ignored', 'spam'] as const;
export const PublicIntakeRecommendedActions = [
  'operator_triage',
  'scrape_source',
  'dedupe_review',
  'canonical_record_created',
  'ignored_no_action',
  'spam_or_abuse',
] as const;
export const PublicIntakeProcessedRecordKinds = [
  'person',
  'entity',
  'need',
  'status',
  'media',
  'map_report',
  'other',
] as const;

const PublicHttpUrlSchema = z.string().trim().url().max(1_000).refine((value) => /^https?:\/\//i.test(value), {
  message: 'must use http or https',
});

const IntakeTimestampSchema = z.string().trim().min(1).max(80).refine((value) => Number.isFinite(Date.parse(value)), {
  message: 'must be a valid timestamp',
});

export const PublicDataIntakeSubmissionRecordSchema = z.object({
  id: z.string().trim().min(1).max(160),
  eventId: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(160),
  sourceUrl: PublicHttpUrlSchema.nullish(),
  submittedAt: IntakeTimestampSchema,
  updatedAt: IntakeTimestampSchema.optional(),
  receivedVia: z.enum(PublicIntakeReceivedVia).default('public_api'),
  payloadFormat: z.enum(PublicIntakePayloadFormats),
  submissionKind: z.enum(PublicIntakeSubmissionKinds).default('unknown'),
  payload: z.unknown(),
  payloadSizeChars: z.number().int().nonnegative().max(MAX_PUBLIC_INTAKE_PAYLOAD_CHARS),
  urlsToReview: z.array(PublicHttpUrlSchema).max(MAX_PUBLIC_INTAKE_URLS).default([]),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  submittedByPrivate: z.string().trim().min(1).max(200).nullish(),
  contactPrivate: z.string().trim().min(1).max(500).nullish(),
  notePrivate: z.string().trim().min(1).max(2_000).nullish(),
  warnings: z.array(z.string().trim().min(1).max(300)).max(50).default([]),
  reviewStatus: z.enum(PublicIntakeReviewStatuses).default('received_for_review'),
  recommendedAction: z.enum(PublicIntakeRecommendedActions).default('operator_triage'),
  processedRecordKind: z.enum(PublicIntakeProcessedRecordKinds).nullish(),
  processedRecordId: z.string().trim().min(1).max(160).nullish(),
  processedRecordUrl: PublicHttpUrlSchema.nullish(),
  processedAt: IntakeTimestampSchema.nullish(),
  publicReviewNote: z.string().trim().min(1).max(500).nullish(),
  disclosure: z.literal('restricted_unverified_public_submission')
    .default('restricted_unverified_public_submission'),
}).strict();

export type PublicIntakePayloadFormat = (typeof PublicIntakePayloadFormats)[number];
export type PublicIntakeSubmissionKind = (typeof PublicIntakeSubmissionKinds)[number];
export type PublicIntakeReceivedViaType = (typeof PublicIntakeReceivedVia)[number];
export type PublicIntakeReviewStatus = (typeof PublicIntakeReviewStatuses)[number];
export type PublicIntakeRecommendedAction = (typeof PublicIntakeRecommendedActions)[number];
export type PublicIntakeProcessedRecordKind = (typeof PublicIntakeProcessedRecordKinds)[number];
export type PublicDataIntakeSubmissionRecord = z.infer<typeof PublicDataIntakeSubmissionRecordSchema>;

export interface PublicDataIntakeEndpointOptions {
  defaultEventId?: string;
  defaultSource?: string;
  receivedVia?: PublicIntakeReceivedViaType;
  now?: Date | string;
  idPrefix?: string;
}

export interface PublicDataIntakeReceipt {
  id: string;
  eventId: string;
  source: string;
  status: PublicIntakeReviewStatus;
  authentication: 'none_required';
  submittedAt: string;
  updatedAt?: string;
  payloadFormat: PublicIntakePayloadFormat;
  submissionKind: PublicIntakeSubmissionKind;
  payloadSizeChars: number;
  urlCount: number;
  warnings: string[];
  recommendedAction: PublicIntakeRecommendedAction;
  processedAt?: string | null;
  processedRecord?: {
    kind?: PublicIntakeProcessedRecordKind;
    id?: string;
    url?: string;
  } | null;
  publicReviewNote?: string | null;
  pollAfterSeconds?: number | null;
  statusUrl?: string;
  message: string;
  disclosure: 'restricted_unverified_public_submission';
}

export interface PublicDataIntakeEndpointResponse {
  submission: PublicDataIntakeSubmissionRecord;
  receipt: PublicDataIntakeReceipt;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function serializeIntakePayload(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error('public intake payload is required');
  if (serialized.length > MAX_PUBLIC_INTAKE_PAYLOAD_CHARS) {
    throw new Error(`public intake payload must be ${MAX_PUBLIC_INTAKE_PAYLOAD_CHARS} characters or less`);
  }
  return serialized;
}

function normalizeIntakeTimestamp(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

function addIntakeWarning(warnings: string[], message: string): void {
  if (warnings.length < 50 && !warnings.includes(message)) warnings.push(message);
}

function optionalStringField(
  input: Record<string, unknown>,
  field: string,
  maxLength: number,
  warnings: string[],
): string | undefined {
  if (!(field in input)) return undefined;
  const value = input[field];
  if (typeof value !== 'string') {
    addIntakeWarning(warnings, `${field} was not a string; stored in the raw payload only`);
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) {
    addIntakeWarning(warnings, `${field} was longer than ${maxLength} characters; stored in the raw payload only`);
    return undefined;
  }
  return trimmed;
}

function optionalStringArrayField(
  input: Record<string, unknown>,
  field: string,
  maxItems: number,
  maxLength: number,
  warnings: string[],
): string[] {
  if (!(field in input)) return [];
  const value = input[field];
  if (!Array.isArray(value)) {
    addIntakeWarning(warnings, `${field} was not an array; stored in the raw payload only`);
    return [];
  }

  const tags: string[] = [];
  for (const item of value) {
    if (tags.length >= maxItems) break;
    if (typeof item !== 'string') {
      addIntakeWarning(warnings, `${field} included a non-string item; stored in the raw payload only`);
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.length > maxLength) {
      addIntakeWarning(warnings, `${field} included an item longer than ${maxLength} characters; stored in the raw payload only`);
      continue;
    }
    tags.push(trimmed);
  }
  return tags;
}

function parseEnumValue<T extends readonly string[]>(
  values: T,
  value: unknown,
  field: string,
  warnings: string[],
): T[number] | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    addIntakeWarning(warnings, `${field} was not a string; stored in the raw payload only`);
    return undefined;
  }
  const trimmed = value.trim();
  if ((values as readonly string[]).includes(trimmed)) return trimmed as T[number];
  addIntakeWarning(warnings, `${field} "${trimmed}" is not recognized; stored in the raw payload only`);
  return undefined;
}

function normalizeHttpUrl(value: unknown, field: string, warnings: string[]): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string') {
    addIntakeWarning(warnings, `${field} was not a URL string; stored in the raw payload only`);
    return undefined;
  }
  const parsed = PublicHttpUrlSchema.safeParse(value);
  if (!parsed.success) {
    addIntakeWarning(warnings, `${field} was not an http(s) URL; stored in the raw payload only`);
    return undefined;
  }
  return parsed.data;
}

function normalizeUrlCandidate(value: string): string | null {
  const trimmed = value.trim().replace(/[),.;\]]+$/u, '');
  const parsed = PublicHttpUrlSchema.safeParse(trimmed);
  return parsed.success ? parsed.data : null;
}

function extractUrlsFromText(value: string): string[] {
  const matches = value.match(/\bhttps?:\/\/[^\s<>"']+/giu) ?? [];
  return matches.flatMap((match) => {
    const normalized = normalizeUrlCandidate(match);
    return normalized ? [normalized] : [];
  });
}

function collectUrlsToReview(value: unknown, urls: Set<string>, depth = 0): void {
  if (urls.size >= MAX_PUBLIC_INTAKE_URLS || depth > 8) return;
  if (typeof value === 'string') {
    for (const url of extractUrlsFromText(value)) {
      if (urls.size >= MAX_PUBLIC_INTAKE_URLS) return;
      urls.add(url);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrlsToReview(item, urls, depth + 1);
    return;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectUrlsToReview(item, urls, depth + 1);
  }
}

function looksLikeCsvText(value: string): boolean {
  const lines = value.trim().split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return lines.length >= 2 && lines[0].includes(',') && lines[1].includes(',');
}

function inferPayloadFormat(input: unknown, urlsToReview: string[], warnings: string[]): PublicIntakePayloadFormat {
  if (isRecord(input)) {
    const explicit = parseEnumValue(PublicIntakePayloadFormats, input.payloadFormat, 'payloadFormat', warnings);
    if (explicit) return explicit;
    if (typeof input.csvText === 'string') return 'csv';
    if (typeof input.text === 'string') return looksLikeCsvText(input.text) ? 'csv' : 'text';
    if ((input.url || input.urls || input.links) && urlsToReview.length > 0) return 'url_list';
    return 'json';
  }
  if (Array.isArray(input)) return 'json';
  if (typeof input === 'string') {
    if (normalizeUrlCandidate(input)) return 'url_list';
    return looksLikeCsvText(input) ? 'csv' : 'text';
  }
  return 'unknown';
}

export function redactPublicDataIntakeSubmissionReceipt(
  submission: PublicDataIntakeSubmissionRecord,
): PublicDataIntakeReceipt {
  const processedRecord = submission.processedRecordKind || submission.processedRecordId || submission.processedRecordUrl
    ? {
        ...(submission.processedRecordKind ? { kind: submission.processedRecordKind } : {}),
        ...(submission.processedRecordId ? { id: submission.processedRecordId } : {}),
        ...(submission.processedRecordUrl ? { url: submission.processedRecordUrl } : {}),
      }
    : null;

  return {
    id: submission.id,
    eventId: submission.eventId,
    source: submission.source,
    status: submission.reviewStatus,
    authentication: 'none_required',
    submittedAt: submission.submittedAt,
    updatedAt: submission.updatedAt ?? submission.submittedAt,
    payloadFormat: submission.payloadFormat,
    submissionKind: submission.submissionKind,
    payloadSizeChars: submission.payloadSizeChars,
    urlCount: submission.urlsToReview.length,
    warnings: submission.warnings,
    recommendedAction: submission.recommendedAction,
    processedAt: submission.processedAt ?? null,
    processedRecord,
    publicReviewNote: submission.publicReviewNote ?? null,
    pollAfterSeconds: submission.reviewStatus === 'received_for_review' || submission.reviewStatus === 'triaged'
      ? 30
      : null,
    message: 'Submission received for restricted operator review. Poll the receipt status until processing is complete; it will not be published or merged automatically.',
    disclosure: submission.disclosure,
  };
}

export function handlePublicDataIntakeEndpointRequest(
  requestBody: unknown,
  options: PublicDataIntakeEndpointOptions = {},
): PublicDataIntakeEndpointResponse {
  const warnings: string[] = [];
  const submittedAt = normalizeIntakeTimestamp(options.now);
  const serializedPayload = serializeIntakePayload(requestBody);
  const input = isRecord(requestBody) ? requestBody : {};
  const urlSet = new Set<string>();
  collectUrlsToReview(requestBody, urlSet);
  const urlsToReview = Array.from(urlSet).slice(0, MAX_PUBLIC_INTAKE_URLS);
  const eventId = optionalStringField(input, 'eventId', 120, warnings) ?? options.defaultEventId ?? 'public-intake';
  const source = optionalStringField(input, 'source', 160, warnings) ?? options.defaultSource ?? 'anonymous-public-intake';
  const sourceUrl = normalizeHttpUrl(input.sourceUrl ?? input.url, 'sourceUrl', warnings);
  const submissionKind = parseEnumValue(
    PublicIntakeSubmissionKinds,
    input.submissionKind ?? input.kind,
    'submissionKind',
    warnings,
  ) ?? 'unknown';
  const receivedVia = options.receivedVia ?? parseEnumValue(
    PublicIntakeReceivedVia,
    input.receivedVia,
    'receivedVia',
    warnings,
  ) ?? 'public_api';
  const idPrefix = options.idPrefix ?? 'public-intake';
  const id = `${idPrefix}:${stableHash(`${eventId}|${source}|${submittedAt}|${serializedPayload}`)}`;
  const submission = PublicDataIntakeSubmissionRecordSchema.parse({
    id,
    eventId,
    source,
    sourceUrl,
    submittedAt,
    updatedAt: submittedAt,
    receivedVia,
    payloadFormat: inferPayloadFormat(requestBody, urlsToReview, warnings),
    submissionKind,
    payload: requestBody,
    payloadSizeChars: serializedPayload.length,
    urlsToReview,
    tags: optionalStringArrayField(input, 'tags', 20, 80, warnings),
    submittedByPrivate: optionalStringField(input, 'submittedBy', 200, warnings),
    contactPrivate: optionalStringField(input, 'contact', 500, warnings),
    notePrivate: optionalStringField(input, 'note', 2_000, warnings),
    warnings,
    reviewStatus: 'received_for_review',
    recommendedAction: 'operator_triage',
    disclosure: 'restricted_unverified_public_submission',
  });

  return {
    submission,
    receipt: redactPublicDataIntakeSubmissionReceipt(submission),
  };
}

const GroupedPersonViewOptionsSchema = z.object({
  sourceLabelById: z.record(
    z.string().trim().min(1).max(160),
    z.string().trim().min(1).max(240),
  ).optional(),
  defaultSourceLabel: z.string().trim().min(1).max(240).optional(),
  sourceUrlColumn: z.string().trim().min(1).max(160).optional(),
  sourceLabelColumn: z.string().trim().min(1).max(160).optional(),
  maxSourceUrlsPerReport: z.number().int().positive().max(20).optional(),
  localizedStatusValues: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  excludeModerationDecisions: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
}).strict().default({});

export const GroupedPersonViewEndpointRequestSchema = z.object({
  groupSummaryCsvText: z.string().min(1).max(MAX_CSV_UPLOAD_BYTES),
  groupedReportsCsvText: z.string().min(1).max(MAX_CSV_UPLOAD_BYTES),
  view: GroupedPersonViewOptionsSchema,
}).strict();

export type GroupedPersonViewEndpointRequest = z.infer<typeof GroupedPersonViewEndpointRequestSchema>;

export interface GroupedPersonViewEndpointResponse {
  view: GroupedPersonViewModel;
}

export function handleGroupedPersonViewEndpointRequest(
  request: GroupedPersonViewEndpointRequest,
): GroupedPersonViewEndpointResponse {
  const parsed = GroupedPersonViewEndpointRequestSchema.parse(request);
  return {
    view: buildGroupedPersonViewModel(
      parsed.groupSummaryCsvText,
      parsed.groupedReportsCsvText,
      parsed.view,
    ),
  };
}

const CsvPersonColumnMappingSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  eventId: z.string().trim().min(1).max(160).optional(),
  source: z.string().trim().min(1).max(160).optional(),
  externalId: z.string().trim().min(1).max(160).optional(),
  externalUrl: z.string().trim().min(1).max(160).optional(),
  displayName: z.string().trim().min(1).max(160).optional(),
  givenName: z.string().trim().min(1).max(160).optional(),
  familyName: z.string().trim().min(1).max(160).optional(),
  age: z.string().trim().min(1).max(160).optional(),
  admin1: z.string().trim().min(1).max(160).optional(),
  admin2: z.string().trim().min(1).max(160).optional(),
  status: z.string().trim().min(1).max(160).optional(),
  lastSeenAt: z.string().trim().min(1).max(160).optional(),
  sourceUpdatedAt: z.string().trim().min(1).max(160).optional(),
  updatedAt: z.string().trim().min(1).max(160).optional(),
  nationalId: z.string().trim().min(1).max(160).optional(),
  passport: z.string().trim().min(1).max(160).optional(),
  sourceRecordId: z.string().trim().min(1).max(160).optional(),
  otherIdentifier: z.string().trim().min(1).max(160).optional(),
  photoHash: z.string().trim().min(1).max(160).optional(),
  identifierCountryCode: z.string().trim().min(1).max(160).optional(),
}).strict();

const DeterministicDedupeOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  maxBucketSize: z.number().int().positive().max(100_000).optional(),
  minScore: z.number().min(0).max(1).optional(),
}).strict().default({ enabled: true });

const EmbeddingDedupeOptionsSchema = z.object({
  enabled: z.boolean().default(false),
  idColumn: z.string().trim().min(1).max(160).optional(),
  externalIdColumn: z.string().trim().min(1).max(160).optional(),
  includeColumns: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  excludeColumns: z.array(z.string().trim().min(1).max(160)).max(120).optional(),
  requiredColumns: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  maxRows: z.number().int().positive().max(100_000).optional(),
  maxTextLength: z.number().int().positive().max(20_000).optional(),
  reviewThreshold: z.number().min(0).max(1).optional(),
  possibleThreshold: z.number().min(0).max(1).optional(),
  likelyThreshold: z.number().min(0).max(1).optional(),
}).strict().default({ enabled: false });

export const CsvDedupeEndpointRequestSchema = z.object({
  csvText: z.string().min(1).max(MAX_CSV_UPLOAD_BYTES),
  eventId: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(120),
  fallbackExternalUrlBase: z.string().trim().url().optional(),
  identifierCountryCode: z.string().trim().length(2).optional(),
  columns: CsvPersonColumnMappingSchema.default({}),
  ignoreStatus: z.boolean().default(false),
  defaultStatus: z.enum(PersonStatuses).optional(),
  statusMap: z.record(z.string(), z.enum(PersonStatuses)).optional(),
  sourceRefColumns: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  deterministic: DeterministicDedupeOptionsSchema,
  embedding: EmbeddingDedupeOptionsSchema,
}).strict();

export type CsvDedupeEndpointRequest = z.infer<typeof CsvDedupeEndpointRequestSchema>;

export interface CsvDedupeEndpointHandlerOptions {
  embeddingProvider?: EmbeddingProvider;
}

export interface CsvDedupeReviewRecord {
  rowNumber: number;
  id: string;
  externalId: string;
  source: string;
  displayName?: string;
  age?: number | null;
  admin1?: string | null;
  admin2?: string | null;
  status?: PersonStatus;
}

export interface CsvDedupeReviewCandidate {
  candidateType: 'deterministic' | 'embedding';
  leftRow: number;
  rightRow: number;
  left: CsvDedupeReviewRecord;
  right: CsvDedupeReviewRecord;
  score: number;
  confidence: string;
  method: string;
  related?: boolean;
  reason: string;
  recommendedAction: 'coordinator_review';
}

export interface CsvDedupeEndpointResponse {
  rowsRead: number;
  validRows: number;
  rejectedRows: CsvPersonParseFailure[];
  sourceColumns: string[];
  deterministic: {
    enabled: boolean;
    candidatePairs: number;
    candidateGroups: number;
    candidates: CsvDedupeReviewCandidate[];
    groups: CsvCandidatePersonGroup[];
  };
  embedding: {
    enabled: boolean;
    embeddedRows: number;
    rejectedRows: Array<{ rowNumber: number; externalId: string | null; reason: string }>;
    excludedColumns: string[];
    provider?: string;
    model?: string;
    dimension?: number;
    candidatePairs: number;
    candidates: CsvDedupeReviewCandidate[];
  };
}

function reviewRecordFromPerson(rowNumber: number, record: FederatedPersonRecord): CsvDedupeReviewRecord {
  return {
    rowNumber,
    id: record.id,
    externalId: record.externalId,
    source: record.source,
    displayName: record.displayName,
    age: record.age,
    admin1: record.admin1,
    admin2: record.admin2,
    status: record.status,
  };
}

function reviewRecordFromEmbedding(row: EmbeddedCsvRecord): CsvDedupeReviewRecord {
  return {
    rowNumber: row.rowNumber,
    id: row.id,
    externalId: row.externalId,
    source: row.source,
  };
}

function deterministicCandidateToReview(candidate: CsvDuplicateCandidate): CsvDedupeReviewCandidate {
  return {
    candidateType: 'deterministic',
    leftRow: candidate.leftRow,
    rightRow: candidate.rightRow,
    left: reviewRecordFromPerson(candidate.leftRow, candidate.left),
    right: reviewRecordFromPerson(candidate.rightRow, candidate.right),
    score: candidate.result.score,
    confidence: candidate.result.confidence,
    method: candidate.result.method,
    related: candidate.result.related,
    reason: candidate.result.reason,
    recommendedAction: 'coordinator_review',
  };
}

function embeddingCandidateToReview(
  candidate: EmbeddingDuplicateCandidate,
  embeddedById: Map<string, EmbeddedCsvRecord>,
  recordsByRowNumber: Map<number, CsvPersonRecordRef>,
): CsvDedupeReviewCandidate {
  const leftEmbedding = embeddedById.get(candidate.id);
  const rightEmbedding = embeddedById.get(candidate.candidateId);
  if (!leftEmbedding || !rightEmbedding) throw new Error('embedding candidate references an unknown row');

  const leftRecord = recordsByRowNumber.get(leftEmbedding.rowNumber);
  const rightRecord = recordsByRowNumber.get(rightEmbedding.rowNumber);

  return {
    candidateType: 'embedding',
    leftRow: leftEmbedding.rowNumber,
    rightRow: rightEmbedding.rowNumber,
    left: leftRecord
      ? reviewRecordFromPerson(leftRecord.rowNumber, leftRecord.record)
      : reviewRecordFromEmbedding(leftEmbedding),
    right: rightRecord
      ? reviewRecordFromPerson(rightRecord.rowNumber, rightRecord.record)
      : reviewRecordFromEmbedding(rightEmbedding),
    score: candidate.score,
    confidence: candidate.confidence,
    method: candidate.method,
    reason: candidate.reason,
    recommendedAction: 'coordinator_review',
  };
}

export async function handleCsvDedupeEndpointRequest(
  request: CsvDedupeEndpointRequest,
  options: CsvDedupeEndpointHandlerOptions = {},
): Promise<CsvDedupeEndpointResponse> {
  const parsed = CsvDedupeEndpointRequestSchema.parse(request);
  const personOptions: CsvPersonInputOptions = {
    eventId: parsed.eventId,
    source: parsed.source,
    fallbackExternalUrlBase: parsed.fallbackExternalUrlBase,
    identifierCountryCode: parsed.identifierCountryCode,
    ignoreStatus: parsed.ignoreStatus,
    defaultStatus: parsed.defaultStatus,
    statusMap: parsed.statusMap,
    columns: parsed.columns as CsvPersonColumnMapping,
    sourceRefColumns: parsed.sourceRefColumns,
  };
  const parseResult = parseCsvPersonRecords(parsed.csvText, personOptions);
  const recordsByRowNumber = new Map(parseResult.records.map((record) => [record.rowNumber, record]));

  const rawDeterministicCandidates = parsed.deterministic.enabled
    ? findCsvPersonDuplicateCandidates(parseResult.records, {
      maxBucketSize: parsed.deterministic.maxBucketSize,
      minScore: parsed.deterministic.minScore,
    })
    : [];
  const deterministicCandidates = rawDeterministicCandidates.map(deterministicCandidateToReview);
  const deterministicGroups = parsed.deterministic.enabled
    ? groupCsvPersonCandidates(parseResult.records, rawDeterministicCandidates)
    : [];

  const embeddingResponse: CsvDedupeEndpointResponse['embedding'] = {
    enabled: parsed.embedding.enabled,
    embeddedRows: 0,
    rejectedRows: [],
    excludedColumns: [],
    candidatePairs: 0,
    candidates: [],
  };

  if (parsed.embedding.enabled) {
    if (!options.embeddingProvider) {
      throw new Error('embeddingProvider is required when embedding dedupe is enabled');
    }

    const embeddingInputs = buildCsvEmbeddingInputs(parsed.csvText, {
      eventId: parsed.eventId,
      source: parsed.source,
      idColumn: parsed.embedding.idColumn,
      externalIdColumn: parsed.embedding.externalIdColumn,
      includeColumns: parsed.embedding.includeColumns,
      excludeColumns: parsed.embedding.excludeColumns,
      requiredColumns: parsed.embedding.requiredColumns,
      maxRows: parsed.embedding.maxRows,
      maxTextLength: parsed.embedding.maxTextLength,
    });
    const embedded = await embedCsvRecords(embeddingInputs.rows, options.embeddingProvider);
    const embeddedById = new Map(embedded.map((record) => [record.id, record]));
    const embeddingOptions: EmbeddingCandidateOptions = {
      reviewThreshold: parsed.embedding.reviewThreshold,
      possibleThreshold: parsed.embedding.possibleThreshold,
      likelyThreshold: parsed.embedding.likelyThreshold,
    };
    const embeddingCandidates = findEmbeddingDuplicateCandidates(embedded, embeddingOptions)
      .map((candidate) => embeddingCandidateToReview(candidate, embeddedById, recordsByRowNumber));
    const firstEmbedded = embedded[0];

    embeddingResponse.embeddedRows = embedded.length;
    embeddingResponse.rejectedRows = embeddingInputs.rejectedRows;
    embeddingResponse.excludedColumns = embeddingInputs.excludedColumns;
    embeddingResponse.provider = firstEmbedded?.provider;
    embeddingResponse.model = firstEmbedded?.model;
    embeddingResponse.dimension = firstEmbedded?.dimension;
    embeddingResponse.candidatePairs = embeddingCandidates.length;
    embeddingResponse.candidates = embeddingCandidates;
  }

  return {
    rowsRead: parseResult.rowsRead,
    validRows: parseResult.records.length,
    rejectedRows: parseResult.rejectedRows,
    sourceColumns: parseResult.sourceColumns,
    deterministic: {
      enabled: parsed.deterministic.enabled,
      candidatePairs: deterministicCandidates.length,
      candidateGroups: deterministicGroups.length,
      candidates: deterministicCandidates,
      groups: deterministicGroups,
    },
    embedding: embeddingResponse,
  };
}
