import { parse } from 'csv-parse/sync';
import { z } from 'zod';

export const EmbeddingDimensions = [128, 256, 512, 1408] as const;
export type EmbeddingDimension = (typeof EmbeddingDimensions)[number];

export type EmbeddingDuplicateConfidence = 'likely' | 'possible' | 'review';

export interface CsvEmbeddingInputOptions {
  eventId: string;
  source: string;
  idColumn?: string;
  externalIdColumn?: string;
  idPrefix?: string;
  includeColumns?: string[];
  excludeColumns?: string[];
  requiredColumns?: string[];
  maxRows?: number;
  maxTextLength?: number;
}

export interface CsvEmbeddingInputRow {
  id: string;
  eventId: string;
  source: string;
  externalId: string;
  rowNumber: number;
  text: string;
  includedColumns: string[];
  excludedColumns: string[];
  truncated: boolean;
}

export interface CsvEmbeddingRejectedRow {
  rowNumber: number;
  externalId: string | null;
  reason: string;
}

export interface CsvEmbeddingInputResult {
  rows: CsvEmbeddingInputRow[];
  rejectedRows: CsvEmbeddingRejectedRow[];
  sourceColumns: string[];
  excludedColumns: string[];
}

export interface EmbeddingInput {
  id: string;
  text: string;
}

export interface EmbeddingResult {
  id: string;
  vector: number[];
  provider: string;
  model: string;
  dimension: number;
}

export interface EmbeddingProvider {
  embed(inputs: readonly EmbeddingInput[]): Promise<EmbeddingResult[]>;
}

export interface EmbeddedCsvRecord extends CsvEmbeddingInputRow {
  vector: number[];
  provider: string;
  model: string;
  dimension: number;
}

export interface EmbeddingCandidateOptions {
  reviewThreshold?: number;
  possibleThreshold?: number;
  likelyThreshold?: number;
}

export interface EmbeddingDuplicateCandidate {
  id: string;
  candidateId: string;
  eventId: string;
  score: number;
  method: 'embedding';
  confidence: EmbeddingDuplicateConfidence;
  reason: string;
}

export interface VertexMultimodalEmbeddingProviderConfig {
  projectId: string;
  location: string;
  accessToken?: string;
  getAccessToken?: () => string | Promise<string>;
  model?: string;
  dimension?: EmbeddingDimension;
  apiEndpoint?: string;
  maxBatchSize?: number;
  fetch?: FetchLike;
}

type FetchLike = (
  url: string,
  init: {
    method: 'POST';
    headers: Record<string, string>;
    body: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  text: () => Promise<string>;
}>;

const CsvOptionsSchema = z.object({
  eventId: z.string().trim().min(1).max(120),
  source: z.string().trim().min(1).max(120),
  idColumn: z.string().trim().min(1).max(160).optional(),
  externalIdColumn: z.string().trim().min(1).max(160).optional(),
  idPrefix: z.string().trim().min(1).max(200).optional(),
  includeColumns: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  excludeColumns: z.array(z.string().trim().min(1).max(160)).max(120).optional(),
  requiredColumns: z.array(z.string().trim().min(1).max(160)).max(80).optional(),
  maxRows: z.number().int().positive().max(100_000).default(10_000),
  maxTextLength: z.number().int().positive().max(20_000).default(4_000),
}).strict();

const VertexSerializableConfigSchema = z.object({
  projectId: z.string().trim().min(1),
  location: z.string().trim().min(1),
  accessToken: z.string().trim().min(1).optional(),
  model: z.string().trim().min(1).default('multimodalembedding@001'),
  dimension: z.union([
    z.literal(128),
    z.literal(256),
    z.literal(512),
    z.literal(1408),
  ]).default(128),
  apiEndpoint: z.string().trim().min(1).optional(),
  maxBatchSize: z.number().int().positive().max(128).default(1),
}).strict();

type ParsedVertexConfig = z.infer<typeof VertexSerializableConfigSchema> & {
  getAccessToken?: () => string | Promise<string>;
  fetch?: FetchLike;
};

const VertexPredictionResponseSchema = z.object({
  predictions: z.array(z.object({
    textEmbedding: z.array(z.number().finite()).min(1),
  }).passthrough()),
}).passthrough();

const DEFAULT_SENSITIVE_COLUMN_MARKERS = [
  'address',
  'caregiver',
  'caseworker',
  'cedula',
  'ci',
  'claimant',
  'contact',
  'coordinate',
  'document',
  'dni',
  'email',
  'family',
  'fuente',
  'hash',
  'identity',
  'lat',
  'latitude',
  'lng',
  'lon',
  'longitude',
  'national_id',
  'nota',
  'note',
  'passport',
  'phone',
  'photo',
  'private',
  'proof',
  'source',
  'street',
  'whatsapp',
] as const;

const DEFAULT_REVIEW_THRESHOLD = 0.975;
const DEFAULT_POSSIBLE_THRESHOLD = 0.985;
const DEFAULT_LIKELY_THRESHOLD = 0.99;

function normalizeColumnName(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isSensitiveEmbeddingColumn(column: string): boolean {
  const normalized = normalizeColumnName(column);
  if (!normalized) return true;
  if (normalized === 'id' || normalized.endsWith('_id')) return true;
  return DEFAULT_SENSITIVE_COLUMN_MARKERS.some((marker) => normalized.includes(marker));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCell(row: Record<string, unknown>, column: string): string {
  const value = row[column];
  if (value == null) return '';
  return String(value).trim();
}

function buildColumnLookup(columns: readonly string[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const column of columns) {
    const normalized = normalizeColumnName(column);
    if (normalized && !lookup.has(normalized)) lookup.set(normalized, column);
  }
  return lookup;
}

function resolveColumn(
  lookup: Map<string, string>,
  requested: string | undefined,
  label: string,
): string | undefined {
  if (!requested) return undefined;
  const resolved = lookup.get(normalizeColumnName(requested));
  if (!resolved) throw new Error(`CSV ${label} column "${requested}" was not found`);
  return resolved;
}

function resolveColumns(
  lookup: Map<string, string>,
  requested: readonly string[] | undefined,
  label: string,
): string[] {
  if (!requested) return [];
  return requested.map((column) => {
    const resolved = resolveColumn(lookup, column, label);
    if (!resolved) throw new Error(`CSV ${label} column "${column}" was not found`);
    return resolved;
  });
}

function ensureUniqueColumns(columns: readonly string[]): void {
  const seen = new Set<string>();
  const blank = columns.find((column) => !normalizeColumnName(column));
  if (blank !== undefined) throw new Error('CSV contains a blank column header');

  const duplicate = columns.find((column) => {
    const normalized = normalizeColumnName(column);
    if (seen.has(normalized)) return true;
    seen.add(normalized);
    return false;
  });
  if (duplicate) throw new Error(`CSV contains duplicate column "${duplicate}" after normalization`);
}

function buildEmbeddingText(
  row: Record<string, unknown>,
  columns: readonly string[],
  maxTextLength: number,
): { text: string; truncated: boolean } {
  const parts = columns
    .map((column) => {
      const value = readCell(row, column);
      return value ? `${column}: ${value}` : '';
    })
    .filter((part) => part.length > 0);

  const text = parts.join('\n').trim();
  if (text.length <= maxTextLength) return { text, truncated: false };
  return { text: text.slice(0, maxTextLength), truncated: true };
}

function scoreOptions(options: EmbeddingCandidateOptions): Required<EmbeddingCandidateOptions> {
  const thresholds = {
    reviewThreshold: options.reviewThreshold ?? DEFAULT_REVIEW_THRESHOLD,
    possibleThreshold: options.possibleThreshold ?? DEFAULT_POSSIBLE_THRESHOLD,
    likelyThreshold: options.likelyThreshold ?? DEFAULT_LIKELY_THRESHOLD,
  };

  for (const [name, value] of Object.entries(thresholds)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error(`${name} must be a finite number between 0 and 1`);
    }
  }

  if (
    thresholds.reviewThreshold > thresholds.possibleThreshold ||
    thresholds.possibleThreshold > thresholds.likelyThreshold
  ) {
    throw new Error('embedding thresholds must be ordered review <= possible <= likely');
  }

  return thresholds;
}

function confidenceForScore(
  score: number,
  thresholds: Required<EmbeddingCandidateOptions>,
): EmbeddingDuplicateConfidence | null {
  if (score >= thresholds.likelyThreshold) return 'likely';
  if (score >= thresholds.possibleThreshold) return 'possible';
  if (score >= thresholds.reviewThreshold) return 'review';
  return null;
}

function vertexPredictUrl(projectId: string, location: string, model: string, apiEndpoint?: string): string {
  const host = apiEndpoint ?? `${location}-aiplatform.googleapis.com`;
  return `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:predict`;
}

async function parseJsonResponse(responseText: string): Promise<unknown> {
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    throw new Error('Vertex AI embedding response was not valid JSON');
  }
}

async function resolveAccessToken(config: ParsedVertexConfig): Promise<string> {
  const token = config.getAccessToken ? await config.getAccessToken() : config.accessToken;
  if (!token || !token.trim()) throw new Error('Vertex AI access token was empty');
  return token.trim();
}

function parseVertexConfig(config: VertexMultimodalEmbeddingProviderConfig): ParsedVertexConfig {
  const { getAccessToken, fetch, ...serializableConfig } = config;
  if (!!serializableConfig.accessToken === !!getAccessToken) {
    throw new Error('provide exactly one of accessToken or getAccessToken');
  }
  if (getAccessToken && typeof getAccessToken !== 'function') {
    throw new Error('getAccessToken must be a function');
  }
  if (fetch && typeof fetch !== 'function') {
    throw new Error('fetch must be a function');
  }

  return {
    ...VertexSerializableConfigSchema.parse(serializableConfig),
    getAccessToken,
    fetch,
  };
}

export function buildCsvEmbeddingInputs(
  csvText: string,
  options: CsvEmbeddingInputOptions,
): CsvEmbeddingInputResult {
  if (!csvText.trim()) throw new Error('CSV input is empty');

  const parsedOptions = CsvOptionsSchema.parse(options);
  let sourceColumns: string[] = [];
  const parsed = parse(csvText, {
    bom: true,
    columns: (headers: string[]) => {
      sourceColumns = headers.map((header) => String(header).trim());
      ensureUniqueColumns(sourceColumns);
      return sourceColumns;
    },
    skip_empty_lines: true,
    trim: true,
  }) as unknown;

  if (!Array.isArray(parsed) || !parsed.every(isRecord)) {
    throw new Error('CSV parser returned an unexpected row shape');
  }

  if (parsed.length > parsedOptions.maxRows) {
    throw new Error(`CSV has ${parsed.length} rows; maxRows is ${parsedOptions.maxRows}`);
  }

  const lookup = buildColumnLookup(sourceColumns);
  const idColumn = resolveColumn(lookup, parsedOptions.idColumn, 'id');
  const externalIdColumn = resolveColumn(lookup, parsedOptions.externalIdColumn, 'external id');
  const requestedIncludeColumns = parsedOptions.includeColumns
    ? resolveColumns(lookup, parsedOptions.includeColumns, 'include')
    : sourceColumns;
  const requestedExcludeColumns = resolveColumns(lookup, parsedOptions.excludeColumns, 'exclude');
  const requiredColumns = resolveColumns(lookup, parsedOptions.requiredColumns, 'required');
  const explicitExcludes = new Set(requestedExcludeColumns.map(normalizeColumnName));
  const includedColumns = requestedIncludeColumns.filter((column) => (
    !explicitExcludes.has(normalizeColumnName(column)) && !isSensitiveEmbeddingColumn(column)
  ));
  const blockedRequestedColumns = requestedIncludeColumns.filter(isSensitiveEmbeddingColumn);

  if (blockedRequestedColumns.length > 0 && parsedOptions.includeColumns) {
    throw new Error(`CSV embedding input cannot include sensitive columns: ${blockedRequestedColumns.join(', ')}`);
  }

  const excludedColumns = sourceColumns.filter((column) => !includedColumns.includes(column));
  const seenIds = new Set<string>();
  const rows: CsvEmbeddingInputRow[] = [];
  const rejectedRows: CsvEmbeddingRejectedRow[] = [];

  parsed.forEach((row, index) => {
    const rowNumber = index + 2;
    const externalId = externalIdColumn ? readCell(row, externalIdColumn) : `csv-row-${rowNumber}`;
    const idValue = idColumn ? readCell(row, idColumn) : '';
    const id = idValue || `${parsedOptions.idPrefix ?? `${parsedOptions.eventId}:${parsedOptions.source}`}:${externalId}`;

    const missingRequiredColumn = requiredColumns.find((column) => !readCell(row, column));
    if (externalIdColumn && !externalId) {
      rejectedRows.push({ rowNumber, externalId: null, reason: 'external id column is blank' });
      return;
    }
    if (missingRequiredColumn) {
      rejectedRows.push({ rowNumber, externalId, reason: `required column "${missingRequiredColumn}" is blank` });
      return;
    }
    if (seenIds.has(id)) {
      rejectedRows.push({ rowNumber, externalId, reason: 'embedding id duplicates another row' });
      return;
    }

    const { text, truncated } = buildEmbeddingText(row, includedColumns, parsedOptions.maxTextLength);
    if (!text) {
      rejectedRows.push({ rowNumber, externalId, reason: 'no public-safe columns available for embedding' });
      return;
    }

    seenIds.add(id);
    rows.push({
      id,
      eventId: parsedOptions.eventId,
      source: parsedOptions.source,
      externalId,
      rowNumber,
      text,
      includedColumns,
      excludedColumns,
      truncated,
    });
  });

  return {
    rows,
    rejectedRows,
    sourceColumns,
    excludedColumns,
  };
}

export async function embedCsvRecords(
  rows: readonly CsvEmbeddingInputRow[],
  provider: EmbeddingProvider,
): Promise<EmbeddedCsvRecord[]> {
  const results = await provider.embed(rows.map((row) => ({ id: row.id, text: row.text })));
  if (results.length !== rows.length) {
    throw new Error(`embedding provider returned ${results.length} results for ${rows.length} rows`);
  }

  return rows.map((row, index) => {
    const result = results[index];
    if (!result || result.id !== row.id) {
      throw new Error(`embedding provider result order mismatch at row ${row.rowNumber}`);
    }
    return {
      ...row,
      vector: result.vector,
      provider: result.provider,
      model: result.model,
      dimension: result.dimension,
    };
  });
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0) throw new Error('embedding vectors must not be empty');
  if (a.length !== b.length) throw new Error('embedding vectors must have the same dimension');

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!Number.isFinite(left) || !Number.isFinite(right)) {
      throw new Error('embedding vectors must contain only finite numbers');
    }
    dot += left * right;
    leftMagnitude += left * left;
    rightMagnitude += right * right;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    throw new Error('embedding vectors must not have zero magnitude');
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

export function rankEmbeddingCandidates(
  record: EmbeddedCsvRecord,
  candidates: readonly EmbeddedCsvRecord[],
  options: EmbeddingCandidateOptions = {},
): EmbeddingDuplicateCandidate[] {
  const thresholds = scoreOptions(options);

  return candidates
    .filter((candidate) => candidate.id !== record.id && candidate.eventId === record.eventId)
    .map((candidate) => {
      const score = Number(cosineSimilarity(record.vector, candidate.vector).toFixed(3));
      const confidence = confidenceForScore(score, thresholds);
      if (!confidence) return null;
      return {
        id: record.id,
        candidateId: candidate.id,
        eventId: record.eventId,
        score,
        method: 'embedding' as const,
        confidence,
        reason: 'embedding similarity suggests a candidate duplicate for coordinator review',
      };
    })
    .filter((candidate): candidate is EmbeddingDuplicateCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score);
}

export function findEmbeddingDuplicateCandidates(
  records: readonly EmbeddedCsvRecord[],
  options: EmbeddingCandidateOptions = {},
): EmbeddingDuplicateCandidate[] {
  const candidates: EmbeddingDuplicateCandidate[] = [];

  for (let leftIndex = 0; leftIndex < records.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < records.length; rightIndex += 1) {
      const [candidate] = rankEmbeddingCandidates(records[leftIndex], [records[rightIndex]], options);
      if (candidate) candidates.push(candidate);
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function createVertexMultimodalEmbeddingProvider(
  config: VertexMultimodalEmbeddingProviderConfig,
): EmbeddingProvider {
  const parsedConfig = parseVertexConfig(config);
  const runtimeFetch = parsedConfig.fetch ?? (globalThis as { fetch?: FetchLike }).fetch;
  if (!runtimeFetch) throw new Error('fetch is required to call Vertex AI embeddings');

  return {
    async embed(inputs: readonly EmbeddingInput[]): Promise<EmbeddingResult[]> {
      if (inputs.length === 0) return [];
      const results: EmbeddingResult[] = [];
      const url = vertexPredictUrl(
        parsedConfig.projectId,
        parsedConfig.location,
        parsedConfig.model,
        parsedConfig.apiEndpoint,
      );
      const accessToken = await resolveAccessToken(parsedConfig);

      for (let index = 0; index < inputs.length; index += parsedConfig.maxBatchSize) {
        const batch = inputs.slice(index, index + parsedConfig.maxBatchSize);
        const blankInput = batch.find((input) => !input.text.trim());
        if (blankInput) throw new Error(`embedding input "${blankInput.id}" has empty text`);

        const response = await runtimeFetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instances: batch.map((input) => ({ text: input.text })),
            parameters: {
              dimension: parsedConfig.dimension,
            },
          }),
        });

        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(`Vertex AI embedding request failed with HTTP ${response.status} ${response.statusText}`);
        }

        const payload = await parseJsonResponse(responseText);
        const parsedPayload = VertexPredictionResponseSchema.safeParse(payload);
        if (!parsedPayload.success) {
          throw new Error('Vertex AI embedding response did not include textEmbedding vectors');
        }
        if (parsedPayload.data.predictions.length !== batch.length) {
          throw new Error(`Vertex AI returned ${parsedPayload.data.predictions.length} predictions for ${batch.length} inputs`);
        }

        parsedPayload.data.predictions.forEach((prediction, predictionIndex) => {
          if (prediction.textEmbedding.length !== parsedConfig.dimension) {
            throw new Error(`Vertex AI returned dimension ${prediction.textEmbedding.length}; expected ${parsedConfig.dimension}`);
          }
          results.push({
            id: batch[predictionIndex].id,
            vector: prediction.textEmbedding,
            provider: 'google-vertex-ai',
            model: parsedConfig.model,
            dimension: parsedConfig.dimension,
          });
        });
      }

      return results;
    },
  };
}
