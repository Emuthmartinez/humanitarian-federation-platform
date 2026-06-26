import { parse } from 'csv-parse/sync';
import type { FederatedPersonRecord, PersonStatus, StrongIdentifier } from './schemas.js';
import { FederatedPersonRecordSchema, PersonStatuses } from './schemas.js';
import { normalizeIdentifierValue, normalizeName, scorePersonMatch } from './matching.js';
import type { PersonMatchResult } from './matching.js';

export type CsvPersonColumnField =
  | 'id'
  | 'eventId'
  | 'source'
  | 'externalId'
  | 'externalUrl'
  | 'displayName'
  | 'givenName'
  | 'familyName'
  | 'age'
  | 'admin1'
  | 'admin2'
  | 'status'
  | 'lastSeenAt'
  | 'sourceUpdatedAt'
  | 'updatedAt'
  | 'nationalId'
  | 'passport'
  | 'sourceRecordId'
  | 'otherIdentifier'
  | 'photoHash'
  | 'identifierCountryCode';

export type CsvPersonColumnMapping = Partial<Record<CsvPersonColumnField, string>>;

export interface CsvPersonInputOptions {
  eventId?: string;
  source?: string;
  fallbackExternalUrlBase?: string;
  identifierCountryCode?: string;
  ignoreStatus?: boolean;
  defaultStatus?: PersonStatus;
  statusMap?: Record<string, PersonStatus>;
  columns?: CsvPersonColumnMapping;
  sourceRefColumns?: string[];
}

export interface CsvPersonRecordRef {
  rowNumber: number;
  record: FederatedPersonRecord;
  sourceDetails?: Record<string, string>;
}

export interface CsvPersonParseSuccess extends CsvPersonRecordRef {
  ok: true;
}

export interface CsvPersonParseFailure {
  ok: false;
  rowNumber: number;
  errors: string[];
}

export type CsvPersonParseResult = CsvPersonParseSuccess | CsvPersonParseFailure;

export interface CsvDuplicateCandidate {
  leftRow: number;
  rightRow: number;
  left: FederatedPersonRecord;
  right: FederatedPersonRecord;
  result: PersonMatchResult;
}

export interface CsvPersonDedupeIndexOptions {
  maxBucketSize?: number;
  minScore?: number;
}

export interface CsvPersonDedupeRunOptions extends CsvPersonInputOptions, CsvPersonDedupeIndexOptions {
  maxRows?: number;
}

export interface CsvSkippedBucket {
  key: string;
  size: number;
}

export interface ParseCsvPersonRecordsResult {
  rowsRead: number;
  records: CsvPersonRecordRef[];
  rejectedRows: CsvPersonParseFailure[];
  sourceColumns: string[];
}

export interface CsvDuplicateReviewRow {
  candidateType: 'candidate_duplicate';
  leftRow: number;
  rightRow: number;
  leftId: string;
  rightId: string;
  leftSource: string;
  rightSource: string;
  leftExternalId: string;
  rightExternalId: string;
  leftName: string;
  rightName: string;
  score: number;
  confidence: PersonMatchResult['confidence'];
  method: PersonMatchResult['method'];
  related: boolean;
  reason: string;
  recommendedAction: 'coordinator_review';
}

export interface CsvCandidatePersonGroupMember {
  rowNumber: number;
  id: string;
  source: string;
  externalId: string;
  externalUrl: string;
  displayName: string;
  age?: number | null;
  admin1?: string | null;
  admin2?: string | null;
  status: PersonStatus;
  sourceDetails?: Record<string, string>;
}

export interface CsvCandidatePersonGroup {
  groupId: string;
  groupType: 'candidate_person_group';
  memberCount: number;
  candidatePairCount: number;
  sources: string[];
  sourceRefs: Array<{
    source: string;
    externalId: string;
    rowNumber: number;
    sourceDetails?: Record<string, string>;
  }>;
  representative: {
    displayName: string;
    age?: number | null;
    admin1?: string | null;
    admin2?: string | null;
  };
  confidence: PersonMatchResult['confidence'];
  maxScore: number;
  methods: PersonMatchResult['method'][];
  members: CsvCandidatePersonGroupMember[];
  recommendedAction: 'coordinator_review';
}

export interface CsvPersonDedupeSummary {
  rowsRead: number;
  validRecords: number;
  rejectedRows: number;
  candidatePairs: number;
  candidateGroups: number;
  skippedBuckets: CsvSkippedBucket[];
}

export interface CsvPersonDedupeRunResult {
  summary: CsvPersonDedupeSummary;
  candidates: CsvDuplicateReviewRow[];
  groups: CsvCandidatePersonGroup[];
  rejectedRows: CsvPersonParseFailure[];
  sourceColumns: string[];
}

const DEFAULT_EVENT_ID = 'csv-dedupe';
const DEFAULT_SOURCE = 'csv-import';
const DEFAULT_EXTERNAL_URL_BASE = 'https://local.invalid/federation-csv/';
const DEFAULT_MAX_BUCKET_SIZE = 1_000;
const DEFAULT_MIN_SCORE = 0.68;
const DEFAULT_MAX_ROWS = 100_000;

const DEFAULT_COLUMN_ALIASES: Record<CsvPersonColumnField, readonly string[]> = {
  id: ['id', 'person_id', 'platform_id'],
  eventId: ['event_id', 'eventid', 'crisis_event_id'],
  source: ['source', 'source_name', 'partner', 'partner_id'],
  externalId: ['external_id', 'externalid', 'record_id', 'source_id', 'case_id'],
  externalUrl: ['external_url', 'externalurl', 'source_url', 'url', 'link'],
  displayName: ['display_name', 'displayname', 'name', 'full_name', 'fullname', 'person_name'],
  givenName: ['given_name', 'givenname', 'first_name', 'firstname', 'nombre'],
  familyName: ['family_name', 'familyname', 'last_name', 'lastname', 'surname', 'apellido'],
  age: ['age', 'years_old', 'edad'],
  admin1: ['admin1', 'admin_1', 'state', 'province', 'region', 'department'],
  admin2: ['admin2', 'admin_2', 'city', 'municipality', 'county', 'district'],
  status: ['status', 'person_status'],
  lastSeenAt: ['last_seen_at', 'lastseenat'],
  sourceUpdatedAt: ['source_updated_at', 'sourceupdatedat', 'updated_by_source_at'],
  updatedAt: ['updated_at', 'updatedat'],
  nationalId: ['national_id', 'nationalid', 'cedula', 'ci', 'dni', 'document_id'],
  passport: ['passport', 'passport_number'],
  sourceRecordId: ['source_record_id', 'sourcerecordid'],
  otherIdentifier: ['identifier', 'other_identifier'],
  photoHash: ['photo_hash', 'photohash', 'image_hash'],
  identifierCountryCode: ['identifier_country_code', 'country_code', 'country'],
};

const STATUS_VALUES = new Set<string>(PersonStatuses);

function normalizeHeader(value: string): string {
  return value
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanCell(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function cell(row: Record<string, unknown>, field: CsvPersonColumnField, columns: CsvPersonColumnMapping): string | undefined {
  const requested = columns[field];
  if (requested) {
    const requestedValue = cleanCell(row[requested]);
    if (requestedValue) return requestedValue;
  }

  const aliases = new Set(DEFAULT_COLUMN_ALIASES[field].map(normalizeHeader));
  for (const [header, value] of Object.entries(row)) {
    if (aliases.has(normalizeHeader(header))) {
      const resolved = cleanCell(value);
      if (resolved) return resolved;
    }
  }

  return undefined;
}

function valueForHeader(row: Record<string, unknown>, header: string): string | undefined {
  const direct = cleanCell(row[header]);
  if (direct) return direct;
  const normalized = normalizeHeader(header);
  for (const [candidateHeader, value] of Object.entries(row)) {
    if (normalizeHeader(candidateHeader) === normalized) return cleanCell(value);
  }
  return undefined;
}

function sourceDetailsFromRow(
  row: Record<string, unknown>,
  sourceRefColumns: readonly string[] | undefined,
): Record<string, string> | undefined {
  if (!sourceRefColumns || sourceRefColumns.length === 0) return undefined;
  const details: Record<string, string> = {};
  for (const column of sourceRefColumns) {
    const value = valueForHeader(row, column);
    if (value) details[column] = value;
  }
  return Object.keys(details).length > 0 ? details : undefined;
}

function parseAge(value: string | undefined): number | null | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`age "${value}" must be an integer`);
  return parsed;
}

function parseStatus(value: string | undefined, statusMap: Record<string, PersonStatus> = {}): PersonStatus | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (statusMap[normalized]) return statusMap[normalized];
  if (!STATUS_VALUES.has(normalized)) {
    throw new Error(`status "${value}" is not one of: ${PersonStatuses.join(', ')}`);
  }
  return normalized as PersonStatus;
}

function displayNameFromRow(row: Record<string, unknown>, columns: CsvPersonColumnMapping): string | undefined {
  const displayName = cell(row, 'displayName', columns);
  if (displayName) return displayName;

  const nameParts = [
    cell(row, 'givenName', columns),
    cell(row, 'familyName', columns),
  ].filter((value): value is string => !!value);
  return nameParts.length > 0 ? nameParts.join(' ') : undefined;
}

function optionalCountry(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const country = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error(`country code "${value}" must be ISO-3166 alpha-2`);
  return country;
}

function fallbackExternalUrl(base: string, externalId: string): string {
  const parsedBase = new URL(base);
  if (!parsedBase.pathname.endsWith('/')) parsedBase.pathname = `${parsedBase.pathname}/`;
  return new URL(encodeURIComponent(externalId), parsedBase).href;
}

function isUsableIdentifier(type: StrongIdentifier['type'], value: string): boolean {
  const normalized = normalizeIdentifierValue(value);
  if (!normalized) return false;

  const weakValues = new Set([
    '0',
    '00',
    '000',
    'NA',
    'NAN',
    'N/A',
    'NO',
    'NOAPLICA',
    'NOPORTA',
    'NOPORTADOCUMENTO',
    'NOPOSEE',
    'NINGUNO',
    'SINCI',
    'SINDOCUMENTO',
    'SINDOCUMENTACION',
    'DESCONOCIDO',
    'PORCONFIRMAR',
    'UNKNOWN',
    'NONE',
    'NULL',
  ]);
  if (weakValues.has(normalized)) return false;
  if (type === 'national_id' || type === 'passport') {
    return normalized.length >= 4 && /\d/.test(normalized);
  }
  return normalized.length >= 3;
}

function addIdentifier(
  identifiers: StrongIdentifier[],
  seen: Set<string>,
  type: StrongIdentifier['type'],
  value: string | undefined,
  countryCode?: string,
): void {
  if (!value) return;
  if (!isUsableIdentifier(type, value)) return;
  const comparable = `${type}:${countryCode ?? ''}:${normalizeIdentifierValue(value)}`;
  if (seen.has(comparable)) return;
  seen.add(comparable);
  identifiers.push({ type, value, countryCode });
}

function zodErrorMessages(error: unknown): string[] {
  if (error && typeof error === 'object' && 'issues' in error) {
    const issues = (error as { issues?: Array<{ path?: unknown[]; message: string }> }).issues;
    if (Array.isArray(issues)) {
      return issues.map((issue) => {
        const path = Array.isArray(issue.path) && issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
        return `${path}${issue.message}`;
      });
    }
  }
  return [error instanceof Error ? error.message : String(error)];
}

export function csvRowToPersonRecord(
  row: Record<string, unknown>,
  rowNumber: number,
  options: CsvPersonInputOptions = {},
): CsvPersonParseResult {
  try {
    const columns = options.columns ?? {};
    const eventId = cell(row, 'eventId', columns) ?? options.eventId ?? DEFAULT_EVENT_ID;
    const source = cell(row, 'source', columns) ?? options.source ?? DEFAULT_SOURCE;
    const externalId = cell(row, 'externalId', columns) ?? `csv-row-${rowNumber}`;
    const displayName = displayNameFromRow(row, columns);
    const identifierCountryCode = optionalCountry(
      cell(row, 'identifierCountryCode', columns) ?? options.identifierCountryCode,
    );
    const identifiers: StrongIdentifier[] = [];
    const seenIdentifiers = new Set<string>();

    addIdentifier(identifiers, seenIdentifiers, 'national_id', cell(row, 'nationalId', columns), identifierCountryCode);
    addIdentifier(identifiers, seenIdentifiers, 'passport', cell(row, 'passport', columns), identifierCountryCode);
    addIdentifier(identifiers, seenIdentifiers, 'source_record_id', cell(row, 'sourceRecordId', columns));
    addIdentifier(identifiers, seenIdentifiers, 'other', cell(row, 'otherIdentifier', columns), identifierCountryCode);

    const rawRecord = {
      id: cell(row, 'id', columns) ?? `${source}:${externalId}`,
      eventId,
      source,
      externalId,
      externalUrl: cell(row, 'externalUrl', columns) ?? fallbackExternalUrl(
        options.fallbackExternalUrlBase ?? DEFAULT_EXTERNAL_URL_BASE,
        externalId,
      ),
      displayName,
      age: parseAge(cell(row, 'age', columns)),
      admin1: cell(row, 'admin1', columns),
      admin2: cell(row, 'admin2', columns),
      status: options.ignoreStatus
        ? options.defaultStatus ?? 'unknown'
        : parseStatus(cell(row, 'status', columns), options.statusMap) ?? options.defaultStatus ?? 'unknown',
      lastSeenAt: cell(row, 'lastSeenAt', columns),
      sourceUpdatedAt: cell(row, 'sourceUpdatedAt', columns),
      updatedAt: cell(row, 'updatedAt', columns),
      strongIdentifiers: identifiers,
      photoHash: cell(row, 'photoHash', columns),
    };

    return {
      ok: true,
      rowNumber,
      record: FederatedPersonRecordSchema.parse(rawRecord),
      sourceDetails: sourceDetailsFromRow(row, options.sourceRefColumns),
    };
  } catch (error) {
    return {
      ok: false,
      rowNumber,
      errors: zodErrorMessages(error),
    };
  }
}

export function parseCsvPersonRecords(
  csvText: string,
  options: CsvPersonInputOptions = {},
): ParseCsvPersonRecordsResult {
  if (!csvText.trim()) throw new Error('CSV input is empty');

  let sourceColumns: string[] = [];
  const rows = parse(csvText, {
    bom: true,
    columns: (headers: string[]) => {
      sourceColumns = headers.map((header) => String(header).trim());
      return sourceColumns;
    },
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  }) as unknown;

  if (!Array.isArray(rows) || !rows.every((row) => typeof row === 'object' && row !== null && !Array.isArray(row))) {
    throw new Error('CSV parser returned an unexpected row shape');
  }

  const records: CsvPersonRecordRef[] = [];
  const rejectedRows: CsvPersonParseFailure[] = [];

  rows.forEach((row, index) => {
    const parsed = csvRowToPersonRecord(row as Record<string, unknown>, index + 2, options);
    if (parsed.ok) records.push(parsed);
    else rejectedRows.push(parsed);
  });

  return {
    rowsRead: rows.length,
    records,
    rejectedRows,
    sourceColumns,
  };
}

function nameTokens(value: string): string[] {
  return normalizeName(value).split(' ').filter((token) => token.length > 1);
}

function ageBucket(age: number | null | undefined): string | null {
  if (age == null) return null;
  return String(Math.floor(age / 5));
}

export function csvPersonBlockKeys(record: FederatedPersonRecord): string[] {
  const keys: string[] = [];

  for (const identifier of record.strongIdentifiers) {
    const value = normalizeIdentifierValue(identifier.value);
    if (value) keys.push(`strong:${identifier.type}:${identifier.countryCode ?? ''}:${value}`);
  }

  if (record.photoHash) keys.push(`photo:${record.photoHash.toLowerCase()}`);

  const tokens = nameTokens(record.displayName);
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : null;
  const fullName = tokens.join(' ');
  const locality = normalizeName(record.admin2 ?? record.admin1 ?? '');
  const bucket = ageBucket(record.age);

  if (fullName.length >= 6) keys.push(`full-name:${fullName}`);
  if (first && last) {
    if (locality && bucket) keys.push(`name-local-age:${first}:${last}:${locality}:${bucket}`);
    if (locality) keys.push(`name-local:${first}:${last}:${locality}`);
    if (bucket) keys.push(`name-age:${first}:${last}:${bucket}`);
  } else if (first && locality && bucket) {
    keys.push(`name1-local-age:${first}:${locality}:${bucket}`);
  }

  return [...new Set(keys)];
}

function shouldKeepCandidate(result: PersonMatchResult, minScore: number): boolean {
  return result.related || result.confidence === 'review' || result.score >= minScore;
}

export class CsvPersonDedupeIndex {
  private readonly buckets = new Map<string, CsvPersonRecordRef[]>();
  private readonly seenPairs = new Set<string>();
  private readonly skipped = new Map<string, CsvSkippedBucket>();
  private readonly maxBucketSize: number;
  private readonly minScore: number;

  constructor(options: CsvPersonDedupeIndexOptions = {}) {
    this.maxBucketSize = options.maxBucketSize ?? DEFAULT_MAX_BUCKET_SIZE;
    this.minScore = options.minScore ?? DEFAULT_MIN_SCORE;
    if (!Number.isInteger(this.maxBucketSize) || this.maxBucketSize < 1) {
      throw new Error('maxBucketSize must be a positive integer');
    }
    if (!Number.isFinite(this.minScore) || this.minScore < 0 || this.minScore > 1) {
      throw new Error('minScore must be a finite number between 0 and 1');
    }
  }

  add(ref: CsvPersonRecordRef): CsvDuplicateCandidate[] {
    const keys = csvPersonBlockKeys(ref.record);
    const candidates = new Map<number, CsvPersonRecordRef>();

    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (!bucket) continue;
      if (bucket.length > this.maxBucketSize) {
        this.skipped.set(key, { key, size: bucket.length });
        continue;
      }
      for (const candidate of bucket) candidates.set(candidate.rowNumber, candidate);
    }

    const matches: CsvDuplicateCandidate[] = [];
    for (const candidate of candidates.values()) {
      const pairKey = `${Math.min(candidate.rowNumber, ref.rowNumber)}:${Math.max(candidate.rowNumber, ref.rowNumber)}`;
      if (this.seenPairs.has(pairKey)) continue;
      this.seenPairs.add(pairKey);

      const result = scorePersonMatch(candidate.record, ref.record);
      if (shouldKeepCandidate(result, this.minScore)) {
        matches.push({
          leftRow: candidate.rowNumber,
          rightRow: ref.rowNumber,
          left: candidate.record,
          right: ref.record,
          result,
        });
      }
    }

    for (const key of keys) {
      const bucket = this.buckets.get(key);
      if (bucket) {
        bucket.push(ref);
      } else {
        this.buckets.set(key, [ref]);
      }
    }

    return matches.sort((a, b) => b.result.score - a.result.score);
  }

  skippedBuckets(): CsvSkippedBucket[] {
    return [...this.skipped.values()].sort((a, b) => b.size - a.size || a.key.localeCompare(b.key));
  }
}

export function findCsvPersonDuplicateCandidates(
  records: readonly CsvPersonRecordRef[],
  options: CsvPersonDedupeIndexOptions = {},
): CsvDuplicateCandidate[] {
  const index = new CsvPersonDedupeIndex(options);
  const candidates: CsvDuplicateCandidate[] = [];
  for (const record of records) candidates.push(...index.add(record));
  return candidates.sort((a, b) => b.result.score - a.result.score);
}

export function toCsvDuplicateReviewRow(candidate: CsvDuplicateCandidate): CsvDuplicateReviewRow {
  return {
    candidateType: 'candidate_duplicate',
    leftRow: candidate.leftRow,
    rightRow: candidate.rightRow,
    leftId: candidate.left.id,
    rightId: candidate.right.id,
    leftSource: candidate.left.source,
    rightSource: candidate.right.source,
    leftExternalId: candidate.left.externalId,
    rightExternalId: candidate.right.externalId,
    leftName: candidate.left.displayName,
    rightName: candidate.right.displayName,
    score: candidate.result.score,
    confidence: candidate.result.confidence,
    method: candidate.result.method,
    related: candidate.result.related,
    reason: candidate.result.reason,
    recommendedAction: 'coordinator_review',
  };
}

class CandidateGroupUnionFind {
  private readonly parent = new Map<number, number>();

  add(value: number): void {
    if (!this.parent.has(value)) this.parent.set(value, value);
  }

  find(value: number): number {
    const parent = this.parent.get(value);
    if (parent == null) {
      this.add(value);
      return value;
    }
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent.set(value, root);
    return root;
  }

  union(left: number, right: number): void {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot === rightRoot) return;
    this.parent.set(Math.max(leftRoot, rightRoot), Math.min(leftRoot, rightRoot));
  }
}

function confidenceRank(confidence: PersonMatchResult['confidence']): number {
  switch (confidence) {
    case 'confirmed':
      return 5;
    case 'likely':
      return 4;
    case 'possible':
      return 3;
    case 'review':
      return 2;
    case 'none':
      return 1;
  }
}

function bestConfidence(candidates: readonly CsvDuplicateCandidate[]): PersonMatchResult['confidence'] {
  return candidates
    .map((candidate) => candidate.result.confidence)
    .sort((a, b) => confidenceRank(b) - confidenceRank(a))[0] ?? 'none';
}

function memberFromRecord(ref: CsvPersonRecordRef): CsvCandidatePersonGroupMember {
  return {
    rowNumber: ref.rowNumber,
    id: ref.record.id,
    source: ref.record.source,
    externalId: ref.record.externalId,
    externalUrl: ref.record.externalUrl,
    displayName: ref.record.displayName,
    age: ref.record.age,
    admin1: ref.record.admin1,
    admin2: ref.record.admin2,
    status: ref.record.status,
    ...(ref.sourceDetails ? { sourceDetails: ref.sourceDetails } : {}),
  };
}

function representativeForMembers(
  members: readonly CsvCandidatePersonGroupMember[],
): CsvCandidatePersonGroup['representative'] {
  const sorted = [...members].sort((a, b) => {
    const completeness = (member: CsvCandidatePersonGroupMember) =>
      Number(member.age != null) + Number(!!member.admin1) + Number(!!member.admin2);
    return completeness(b) - completeness(a) || a.rowNumber - b.rowNumber;
  });
  const representative = sorted[0];
  if (!representative) throw new Error('candidate group cannot be empty');
  return {
    displayName: representative.displayName,
    age: representative.age,
    admin1: representative.admin1,
    admin2: representative.admin2,
  };
}

export function groupCsvPersonCandidates(
  records: readonly CsvPersonRecordRef[],
  candidates: readonly CsvDuplicateCandidate[],
): CsvCandidatePersonGroup[] {
  const recordsByRow = new Map(records.map((record) => [record.rowNumber, record]));
  const union = new CandidateGroupUnionFind();

  for (const candidate of candidates) {
    union.union(candidate.leftRow, candidate.rightRow);
  }

  const rowGroups = new Map<number, CsvPersonRecordRef[]>();
  for (const candidate of candidates) {
    for (const rowNumber of [candidate.leftRow, candidate.rightRow]) {
      const record = recordsByRow.get(rowNumber);
      if (!record) throw new Error(`candidate references unknown row ${rowNumber}`);
      const root = union.find(rowNumber);
      const group = rowGroups.get(root);
      if (group) {
        if (!group.some((member) => member.rowNumber === rowNumber)) group.push(record);
      } else {
        rowGroups.set(root, [record]);
      }
    }
  }

  return [...rowGroups.entries()]
    .map(([root, refs]) => {
      const members = refs
        .map(memberFromRecord)
        .sort((a, b) => a.rowNumber - b.rowNumber);
      const groupCandidates = candidates.filter((candidate) => (
        union.find(candidate.leftRow) === root && union.find(candidate.rightRow) === root
      ));
      const maxScore = Math.max(...groupCandidates.map((candidate) => candidate.result.score));
      const methods = [...new Set(groupCandidates.map((candidate) => candidate.result.method))]
        .sort((a, b) => a.localeCompare(b));
      const sourceRefs = members.map((member) => ({
        source: member.source,
        externalId: member.externalId,
        rowNumber: member.rowNumber,
        ...(member.sourceDetails ? { sourceDetails: member.sourceDetails } : {}),
      }));

      return {
        groupId: `candidate-person-group:${root}`,
        groupType: 'candidate_person_group' as const,
        memberCount: members.length,
        candidatePairCount: groupCandidates.length,
        sources: [...new Set(members.map((member) => member.source))].sort((a, b) => a.localeCompare(b)),
        sourceRefs,
        representative: representativeForMembers(members),
        confidence: bestConfidence(groupCandidates),
        maxScore,
        methods,
        members,
        recommendedAction: 'coordinator_review' as const,
      };
    })
    .sort((a, b) => b.maxScore - a.maxScore || b.memberCount - a.memberCount || a.groupId.localeCompare(b.groupId));
}

export function dedupeParsedCsvPersonRecords(
  parsed: ParseCsvPersonRecordsResult,
  options: CsvPersonDedupeIndexOptions = {},
): CsvPersonDedupeRunResult {
  const index = new CsvPersonDedupeIndex(options);
  const rawCandidates: CsvDuplicateCandidate[] = [];
  const candidates: CsvDuplicateReviewRow[] = [];

  for (const record of parsed.records) {
    for (const candidate of index.add(record)) {
      rawCandidates.push(candidate);
      candidates.push(toCsvDuplicateReviewRow(candidate));
    }
  }
  const groups = groupCsvPersonCandidates(parsed.records, rawCandidates);

  return {
    summary: {
      rowsRead: parsed.rowsRead,
      validRecords: parsed.records.length,
      rejectedRows: parsed.rejectedRows.length,
      candidatePairs: candidates.length,
      candidateGroups: groups.length,
      skippedBuckets: index.skippedBuckets(),
    },
    candidates,
    groups,
    rejectedRows: parsed.rejectedRows,
    sourceColumns: parsed.sourceColumns,
  };
}

export function dedupeCsvPersonCsvText(
  csvText: string,
  options: CsvPersonDedupeRunOptions = {},
): CsvPersonDedupeRunResult {
  const parsed = parseCsvPersonRecords(csvText, options);
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error('maxRows must be a positive integer');
  if (parsed.rowsRead > maxRows) throw new Error(`CSV row count exceeds maxRows ${maxRows}`);
  return dedupeParsedCsvPersonRecords(parsed, options);
}
