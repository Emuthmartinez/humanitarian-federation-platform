import type { FederatedPersonRecord, StrongIdentifier } from './schemas.js';

export type MatchMethod =
  | 'identifier'
  | 'photo'
  | 'name_age_locality'
  | 'identifier_conflict'
  | 'unrelated'
  | 'review';

export type MatchConfidence = 'confirmed' | 'likely' | 'possible' | 'review' | 'none';

export interface PersonMatchResult {
  related: boolean;
  score: number;
  method: MatchMethod;
  confidence: MatchConfidence;
  reason: string;
}

const comparableId = (id: StrongIdentifier) =>
  `${id.type}:${id.countryCode ?? ''}:${normalizeIdentifierValue(id.value)}`;

export function normalizeIdentifierValue(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeName(value).split(' ').filter((token) => token.length > 1);
}

function firstToken(value: string): string | null {
  return tokens(value)[0] ?? null;
}

export function nameSimilarity(a: string, b: string): number {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += token.length >= 5 ? 1.25 : 1;
  }
  const denom = Math.max(left.size, right.size);
  return Math.min(1, shared / denom);
}

function hasSameStrongIdentifier(a: FederatedPersonRecord, b: FederatedPersonRecord): boolean {
  const ids = new Set(a.strongIdentifiers.map(comparableId));
  return b.strongIdentifiers.some((id) => ids.has(comparableId(id)));
}

function hasConflictingStrongIdentifier(a: FederatedPersonRecord, b: FederatedPersonRecord): boolean {
  for (const left of a.strongIdentifiers) {
    for (const right of b.strongIdentifiers) {
      if (left.type === right.type && (left.countryCode ?? '') === (right.countryCode ?? '')) {
        const lv = normalizeIdentifierValue(left.value);
        const rv = normalizeIdentifierValue(right.value);
        if (lv && rv && lv !== rv) return true;
      }
    }
  }
  return false;
}

function ageScore(a?: number | null, b?: number | null): number {
  if (a == null || b == null) return 0.5;
  const gap = Math.abs(a - b);
  if (gap <= 2) return 1;
  if (gap <= 8) return 0.5;
  return -0.75;
}

function localityScore(a: FederatedPersonRecord, b: FederatedPersonRecord): number {
  const admin1 = a.admin1 && b.admin1 && normalizeName(a.admin1) === normalizeName(b.admin1);
  const admin2 = a.admin2 && b.admin2 && normalizeName(a.admin2) === normalizeName(b.admin2);
  if (admin2) return 1;
  if (admin1) return 0.6;
  return 0;
}

export function scorePersonMatch(a: FederatedPersonRecord, b: FederatedPersonRecord): PersonMatchResult {
  if (a.id === b.id) {
    return { related: true, score: 1, method: 'identifier', confidence: 'confirmed', reason: 'same platform id' };
  }

  if (hasConflictingStrongIdentifier(a, b)) {
    return {
      related: false,
      score: 0,
      method: 'identifier_conflict',
      confidence: 'none',
      reason: 'strong identifiers conflict',
    };
  }

  const similarity = nameSimilarity(a.displayName, b.displayName);
  const firstNameClash = firstToken(a.displayName) !== firstToken(b.displayName);

  if (hasSameStrongIdentifier(a, b)) {
    if (similarity < 0.25 || firstNameClash) {
      return { related: false, score: 0.65, method: 'review', confidence: 'review', reason: 'identifier matches but names conflict' };
    }
    return { related: true, score: 1, method: 'identifier', confidence: 'confirmed', reason: 'same strong identifier' };
  }

  if (a.photoHash && b.photoHash && a.photoHash.toLowerCase() === b.photoHash.toLowerCase()) {
    if (similarity >= 0.45 && !firstNameClash) {
      return { related: true, score: 0.95, method: 'photo', confidence: 'confirmed', reason: 'same photo hash and compatible name' };
    }
    return { related: false, score: 0.6, method: 'review', confidence: 'review', reason: 'same photo hash but identity fields conflict' };
  }

  const combined = similarity * 0.7 + ageScore(a.age, b.age) * 0.15 + localityScore(a, b) * 0.15;
  if (combined >= 0.82 && !firstNameClash) {
    return { related: true, score: Number(combined.toFixed(3)), method: 'name_age_locality', confidence: 'likely', reason: 'name, age, and locality are compatible' };
  }
  if (combined >= 0.68 && !firstNameClash) {
    return { related: true, score: Number(combined.toFixed(3)), method: 'name_age_locality', confidence: 'possible', reason: 'weak candidate for coordinator review' };
  }
  return { related: false, score: Number(Math.max(0, combined).toFixed(3)), method: 'unrelated', confidence: 'none', reason: 'insufficient matching evidence' };
}

export function rankPersonCandidates(
  record: FederatedPersonRecord,
  candidates: FederatedPersonRecord[],
): Array<PersonMatchResult & { id: string }> {
  return candidates
    .map((candidate) => ({ id: candidate.id, ...scorePersonMatch(record, candidate) }))
    .filter((match) => match.related || match.confidence === 'review')
    .sort((a, b) => b.score - a.score);
}
