import type { PersonStatus } from './schemas.js';
import type { PublicPersonRecord } from './redaction.js';

export type StatusAction =
  | 'keep_search_open'
  | 'review_resolution'
  | 'mark_resolved'
  | 'review_conflict';

export interface StatusSummary {
  status: PersonStatus;
  hasConflict: boolean;
  size: number;
  openCount: number;
  resolvedCount: number;
  suggestedAction: StatusAction;
  lastUpdatedAt: string | null;
  sourceUpdatedAt: string | null;
  sources: string[];
}

const OPEN = new Set<PersonStatus>(['missing', 'unknown']);
const RESOLVED = new Set<PersonStatus>(['found_safe', 'found_injured', 'deceased']);
const URGENCY: Record<PersonStatus, number> = {
  missing: 5,
  unknown: 4,
  found_injured: 3,
  deceased: 2,
  found_safe: 1,
};

function newest(values: Array<string | null | undefined>): string | null {
  return values.filter((value): value is string => !!value).sort((a, b) => b.localeCompare(a))[0] ?? null;
}

export function displayStatus(statuses: PersonStatus[]): PersonStatus {
  if (statuses.length === 0) return 'unknown';
  return [...statuses].sort((a, b) => URGENCY[b] - URGENCY[a])[0] ?? 'unknown';
}

export function hasStatusConflict(statuses: PersonStatus[]): boolean {
  const seenOpen = statuses.some((status) => OPEN.has(status));
  const seenResolved = statuses.some((status) => RESOLVED.has(status));
  return seenOpen && seenResolved;
}

export function summarizePersonStatus(records: PublicPersonRecord[], ownId?: string | null): StatusSummary {
  const statuses = records.map((record) => record.status);
  const status = displayStatus(statuses);
  const hasConflict = hasStatusConflict(statuses);
  const openCount = statuses.filter((item) => OPEN.has(item)).length;
  const resolvedCount = statuses.filter((item) => RESOLVED.has(item)).length;
  const own = ownId ? records.find((record) => record.id === ownId) : null;
  const ownOpen = !own || OPEN.has(own.status);

  let suggestedAction: StatusAction;
  if (hasConflict && ownOpen && resolvedCount > 0) suggestedAction = 'review_resolution';
  else if (hasConflict) suggestedAction = 'review_conflict';
  else if (RESOLVED.has(status)) suggestedAction = 'mark_resolved';
  else suggestedAction = 'keep_search_open';

  return {
    status,
    hasConflict,
    size: records.length,
    openCount,
    resolvedCount,
    suggestedAction,
    lastUpdatedAt: newest(records.map((record) => record.updatedAt)),
    sourceUpdatedAt: newest(records.map((record) => record.sourceUpdatedAt)),
    sources: [...new Set(records.map((record) => record.source))].sort(),
  };
}
