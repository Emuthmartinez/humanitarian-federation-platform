#!/usr/bin/env node
import { createReadStream, createWriteStream, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse';
import process from 'node:process';
import type { Writable } from 'node:stream';
import {
  CsvPersonDedupeIndex,
  csvRowToPersonRecord,
  groupCsvPersonCandidates,
  toCsvDuplicateReviewRow,
  type CsvDuplicateCandidate,
  type CsvPersonColumnField,
  type CsvPersonColumnMapping,
  type CsvPersonRecordRef,
} from '../csv-dedupe.js';

interface CliOptions {
  inputPath: string | null;
  outputPath: string | null;
  groupsOutputPath: string | null;
  rejectsPath: string | null;
  eventId?: string;
  source?: string;
  fallbackExternalUrlBase?: string;
  identifierCountryCode?: string;
  ignoreStatus: boolean;
  maxBucketSize?: number;
  minScore?: number;
  columns: CsvPersonColumnMapping;
  sourceRefColumns: string[];
  help: boolean;
}

type CsvWritable = Pick<Writable, 'end' | 'write'>;

const COLUMN_FIELDS = new Set<CsvPersonColumnField>([
  'id',
  'eventId',
  'source',
  'externalId',
  'externalUrl',
  'displayName',
  'givenName',
  'familyName',
  'age',
  'admin1',
  'admin2',
  'status',
  'lastSeenAt',
  'sourceUpdatedAt',
  'updatedAt',
  'nationalId',
  'passport',
  'sourceRecordId',
  'otherIdentifier',
  'photoHash',
  'identifierCountryCode',
]);

const CANDIDATE_HEADERS = [
  'candidate_type',
  'left_row',
  'right_row',
  'left_id',
  'right_id',
  'left_source',
  'right_source',
  'left_external_id',
  'right_external_id',
  'left_name',
  'right_name',
  'score',
  'confidence',
  'method',
  'related',
  'reason',
  'recommended_action',
];

function usage(): string {
  return [
    'Usage: humanitarian-dedupe-csv <people.csv|-> [options]',
    '',
    'Options:',
    '  --output <path>                    Write candidate review CSV to a file instead of stdout',
    '  --groups-output <path>             Write grouped candidate people to restricted JSON',
    '  --rejects <path>                   Write rejected row numbers and validation errors',
    '  --event-id <id>                    Default event id when the CSV has no event column',
    '  --source <source>                  Default source when the CSV has no source column',
    '  --base-url <url>                   Fallback link-back base URL for rows without URLs',
    '  --identifier-country-code <code>   Country code for national/passport identifiers',
    '  --ignore-status                    Ignore source status columns that are not person statuses',
    '  --max-bucket-size <n>              Skip candidate scoring for oversized blocks (default 1000)',
    '  --min-score <n>                    Include non-related scored pairs at or above n (default 0.68)',
    '  --column <field=header>            Map a field to a CSV header; repeat as needed',
    '  --source-ref-column <header>       Preserve a CSV column in group sourceRefs; repeat as needed',
    '  --help                            Show this help',
    '',
    `Column fields: ${[...COLUMN_FIELDS].join(', ')}`,
    '',
    'Use "-" as the input path to read CSV from stdin.',
    'The output is advisory: every row is a candidate duplicate for coordinator review, never an automatic merge.',
  ].join('\n');
}

function parseNumberOption(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be a finite number`);
  return parsed;
}

function readOptionValue(args: string[], index: number, name: string): [string, number] {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return [value, index + 1];
}

function parseColumnMapping(value: string, columns: CsvPersonColumnMapping): void {
  const separator = value.indexOf('=');
  if (separator < 1 || separator === value.length - 1) {
    throw new Error('--column must be shaped like displayName="Full Name"');
  }
  const field = value.slice(0, separator) as CsvPersonColumnField;
  const header = value.slice(separator + 1);
  if (!COLUMN_FIELDS.has(field)) throw new Error(`unknown column field "${field}"`);
  columns[field] = header;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    inputPath: null,
    outputPath: null,
    groupsOutputPath: null,
    rejectsPath: null,
    columns: {},
    sourceRefColumns: [],
    ignoreStatus: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--output') {
      const [value, nextIndex] = readOptionValue(args, index, '--output');
      options.outputPath = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--groups-output') {
      const [value, nextIndex] = readOptionValue(args, index, '--groups-output');
      options.groupsOutputPath = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--rejects') {
      const [value, nextIndex] = readOptionValue(args, index, '--rejects');
      options.rejectsPath = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--event-id') {
      const [value, nextIndex] = readOptionValue(args, index, '--event-id');
      options.eventId = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--source') {
      const [value, nextIndex] = readOptionValue(args, index, '--source');
      options.source = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--base-url') {
      const [value, nextIndex] = readOptionValue(args, index, '--base-url');
      options.fallbackExternalUrlBase = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--identifier-country-code') {
      const [value, nextIndex] = readOptionValue(args, index, '--identifier-country-code');
      options.identifierCountryCode = value;
      index = nextIndex;
      continue;
    }
    if (arg === '--ignore-status') {
      options.ignoreStatus = true;
      continue;
    }
    if (arg === '--max-bucket-size') {
      const [value, nextIndex] = readOptionValue(args, index, '--max-bucket-size');
      options.maxBucketSize = parseNumberOption(value, '--max-bucket-size');
      index = nextIndex;
      continue;
    }
    if (arg === '--min-score') {
      const [value, nextIndex] = readOptionValue(args, index, '--min-score');
      options.minScore = parseNumberOption(value, '--min-score');
      index = nextIndex;
      continue;
    }
    if (arg === '--column') {
      const [value, nextIndex] = readOptionValue(args, index, '--column');
      parseColumnMapping(value, options.columns);
      index = nextIndex;
      continue;
    }
    if (arg === '--source-ref-column') {
      const [value, nextIndex] = readOptionValue(args, index, '--source-ref-column');
      options.sourceRefColumns.push(value);
      index = nextIndex;
      continue;
    }
    if (arg.startsWith('--column=')) {
      parseColumnMapping(arg.slice('--column='.length), options.columns);
      continue;
    }
    if (arg.startsWith('--source-ref-column=')) {
      options.sourceRefColumns.push(arg.slice('--source-ref-column='.length));
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`);
    if (options.inputPath) throw new Error(`unexpected extra input path ${arg}`);
    options.inputPath = arg;
  }

  return options;
}

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsvLine(writer: CsvWritable, values: readonly unknown[]): void {
  writer.write(`${values.map(csvCell).join(',')}\n`);
}

function candidateValues(candidate: CsvDuplicateCandidate): unknown[] {
  const row = toCsvDuplicateReviewRow(candidate);
  return [
    row.candidateType,
    row.leftRow,
    row.rightRow,
    row.leftId,
    row.rightId,
    row.leftSource,
    row.rightSource,
    row.leftExternalId,
    row.rightExternalId,
    row.leftName,
    row.rightName,
    row.score,
    row.confidence,
    row.method,
    row.related ? 'yes' : 'no',
    row.reason,
    row.recommendedAction,
  ];
}

async function closeStream(stream: CsvWritable, shouldClose: boolean): Promise<void> {
  if (!shouldClose || !('end' in stream) || typeof stream.end !== 'function') return;
  await new Promise<void>((resolve, reject) => {
    stream.end((error?: Error | null) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function run(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.inputPath) throw new Error('input CSV path is required');

  const output = options.outputPath ? createWriteStream(options.outputPath) : process.stdout;
  const rejects = options.rejectsPath ? createWriteStream(options.rejectsPath) : null;
  const index = new CsvPersonDedupeIndex({
    maxBucketSize: options.maxBucketSize,
    minScore: options.minScore,
  });
  let rowsRead = 0;
  let validRows = 0;
  let rejectedRows = 0;
  let candidatePairs = 0;
  const records: CsvPersonRecordRef[] = [];
  const rawCandidates: CsvDuplicateCandidate[] = [];

  writeCsvLine(output, CANDIDATE_HEADERS);
  if (rejects) writeCsvLine(rejects, ['row', 'error']);

  const input = options.inputPath === '-' ? process.stdin : createReadStream(options.inputPath);
  const parser = input.pipe(parse({
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
  }));

  for await (const row of parser as AsyncIterable<Record<string, unknown>>) {
    rowsRead += 1;
    const rowNumber = rowsRead + 1;
    const parsed = csvRowToPersonRecord(row, rowNumber, {
      eventId: options.eventId,
      source: options.source,
      fallbackExternalUrlBase: options.fallbackExternalUrlBase,
      identifierCountryCode: options.identifierCountryCode,
      ignoreStatus: options.ignoreStatus,
      columns: options.columns,
      sourceRefColumns: options.sourceRefColumns,
    });

    if (!parsed.ok) {
      rejectedRows += 1;
      if (rejects) writeCsvLine(rejects, [parsed.rowNumber, parsed.errors.join('; ')]);
      continue;
    }

    validRows += 1;
    records.push(parsed);
    const candidates = index.add(parsed);
    for (const candidate of candidates) {
      rawCandidates.push(candidate);
      candidatePairs += 1;
      writeCsvLine(output, candidateValues(candidate));
    }
  }

  const groups = groupCsvPersonCandidates(records, rawCandidates);
  if (options.groupsOutputPath) {
    writeFileSync(options.groupsOutputPath, `${JSON.stringify({
      summary: {
        rowsRead,
        validRecords: validRows,
        rejectedRows,
        candidatePairs,
        candidateGroups: groups.length,
        skippedBuckets: index.skippedBuckets(),
      },
      groups,
    }, null, 2)}\n`, 'utf8');
  }

  await closeStream(output, !!options.outputPath);
  await closeStream(rejects ?? process.stderr, !!rejects);

  const skippedBuckets = index.skippedBuckets();
  const summary = [
    'CSV dedupe complete',
    `Rows read: ${rowsRead}`,
    `Valid records: ${validRows}`,
    `Rejected rows: ${rejectedRows}`,
    `Candidate pairs: ${candidatePairs}`,
    `Candidate groups: ${groups.length}`,
    `Skipped oversized blocks: ${skippedBuckets.length}`,
    `Output: ${options.outputPath ?? 'stdout'}`,
  ];
  if (options.groupsOutputPath) summary.push(`Groups: ${options.groupsOutputPath}`);
  if (options.rejectsPath) summary.push(`Rejects: ${options.rejectsPath}`);
  if (skippedBuckets[0]) {
    summary.push(`Largest skipped block: ${skippedBuckets[0].size} rows (${skippedBuckets[0].key})`);
  }
  process.stderr.write(`${summary.join('\n')}\n`);
}

run().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exitCode = 1;
});
