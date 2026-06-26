import { z } from 'zod';
import {
  findCsvPersonDuplicateCandidates,
  parseCsvPersonRecords,
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

const MAX_CSV_UPLOAD_BYTES = 20_000_000;

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
    candidates: CsvDedupeReviewCandidate[];
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
  };
  const parseResult = parseCsvPersonRecords(parsed.csvText, personOptions);
  const recordsByRowNumber = new Map(parseResult.records.map((record) => [record.rowNumber, record]));

  const deterministicCandidates = parsed.deterministic.enabled
    ? findCsvPersonDuplicateCandidates(parseResult.records, {
      maxBucketSize: parsed.deterministic.maxBucketSize,
      minScore: parsed.deterministic.minScore,
    }).map(deterministicCandidateToReview)
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
      candidates: deterministicCandidates,
    },
    embedding: embeddingResponse,
  };
}
