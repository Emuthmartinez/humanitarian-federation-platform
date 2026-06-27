import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { CsvCandidatePersonGroup } from './csv-dedupe.js';
import type { MatchConfidence } from './matching.js';
import {
  CoordinationEntitySchema,
  CrisisEventSchema,
  EntityChannelSchema,
  EntityNeedSchema,
  PartnerScopes,
  PersonStatuses,
  SourcePartnerSchema,
  type CoordinationEntity,
  type CrisisEvent,
  type FederatedPersonRecord,
  type PersonStatus,
  type SourcePartner,
} from './schemas.js';
import {
  redactCoordinationEntity,
  redactPersonRecord,
} from './redaction.js';
import { displayStatus, hasStatusConflict } from './status.js';

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) => z.string().trim().min(1).max(max).nullish();
const httpUrl = (max: number) => z.url().max(max).refine((value) => /^https?:\/\//i.test(value), {
  message: 'must use http or https',
});
const isoTime = z.string().trim().min(1).max(80).refine((value) => Number.isFinite(Date.parse(value)), {
  message: 'must be a valid timestamp',
});
const locale = z.string().trim().min(2).max(35).regex(/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/, {
  message: 'must be a BCP-47 style locale such as es or es-VE',
});

export const PUBLIC_FEDERATION_SNAPSHOT_SCHEMA_VERSION = 'public-federation-snapshot/v1' as const;
export const PublicFederationSnapshotHashAlgorithm = 'sha256' as const;
const DEFAULT_BADGE_LABEL = 'Federated humanitarian data partner';
export const PublicPersonGroupKinds = ['single_record', 'candidate_duplicate', 'coordinator_confirmed'] as const;
export const PublicPersonGroupRecommendedActions = ['display', 'coordinator_review'] as const;
export const PublicSnapshotMirrorRoles = ['primary', 'mirror', 'archive'] as const;
export const PublicSnapshotTombstoneKinds = ['person', 'person_group', 'entity'] as const;
export const PublicSnapshotTombstoneReasons = [
  'source_withdrawn',
  'privacy_risk',
  'safety_risk',
  'incorrect_record',
  'duplicate_removed',
  'other',
] as const;

export const PublicSnapshotContentHashSchema = z.string().trim().regex(
  /^sha256:[0-9a-f]{64}$/,
  'content hash must be sha256:<64 lowercase hex chars>',
);

export const PublicSnapshotSourceSchema = z.object({
  id: str(120),
  name: str(200),
  source: str(120),
  publicUrl: httpUrl(500).nullish(),
  verifiedDomains: z.array(str(253)).max(50).default([]),
  scopes: z.array(z.enum(PartnerScopes)).max(20).default([]),
  badgeLabel: str(120).default(DEFAULT_BADGE_LABEL),
  badgeVerifiedAt: isoTime.nullish(),
  lastSeenAt: isoTime.nullish(),
}).strict();

export const PublicPersonSnapshotRecordSchema = z.object({
  id: str(160),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  externalUrl: httpUrl(500),
  displayName: str(200),
  age: z.number().int().min(0).max(130).nullish(),
  admin1: optStr(120),
  admin2: optStr(160),
  status: z.enum(PersonStatuses),
  lastSeenAt: isoTime.nullish(),
  sourceUpdatedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
  hasStrongIdentifier: z.boolean(),
  isMultiPerson: z.boolean(),
}).strict();

export const PublicCoordinationEntitySnapshotRecordSchema = z.object({
  id: str(160),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  sourceUrl: httpUrl(500),
  kind: str(80),
  name: str(200),
  description: optStr(900),
  admin1: optStr(120),
  admin2: optStr(160),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  channels: z.array(EntityChannelSchema).max(20).default([]),
  needs: z.array(EntityNeedSchema).max(50).default([]),
  sourceUpdatedAt: isoTime.nullish(),
  lastVerifiedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
}).strict().refine((value) => (value.lat == null && value.lng == null) || (value.lat != null && value.lng != null), {
  message: 'lat and lng must be provided together',
});

export const PublicPersonGroupWarningSchema = z.object({
  id: str(80),
  severity: z.enum(['info', 'warning', 'danger']).default('warning'),
  message: str(300),
}).strict();

export const PublicPersonGroupSourceRefSchema = z.object({
  recordId: str(160),
  source: str(120),
  externalId: str(200),
  externalUrl: httpUrl(500),
}).strict();

export const PublicPersonGroupSchema = z.object({
  id: str(180),
  eventId: str(120),
  kind: z.enum(PublicPersonGroupKinds),
  confidence: z.enum(['confirmed', 'likely', 'possible', 'review', 'none']),
  title: str(200),
  subtitle: optStr(240),
  status: z.enum(PersonStatuses),
  statusConflict: z.boolean().default(false),
  hasStrongIdentifier: z.boolean().default(false),
  memberRecordIds: z.array(str(160)).min(1).max(500),
  sources: z.array(str(120)).min(1).max(100),
  sourceRefs: z.array(PublicPersonGroupSourceRefSchema).min(1).max(500),
  recommendedAction: z.enum(PublicPersonGroupRecommendedActions),
  warnings: z.array(PublicPersonGroupWarningSchema).max(20).default([]),
  sourceUpdatedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
}).strict();

export const PublicSnapshotTombstoneSchema = z.object({
  eventId: str(120),
  recordKind: z.enum(PublicSnapshotTombstoneKinds),
  recordId: str(180),
  source: str(120),
  externalId: str(200).nullish(),
  reason: z.enum(PublicSnapshotTombstoneReasons),
  removedAt: isoTime,
  replacementRecordId: str(180).nullish(),
  publicNote: optStr(300),
}).strict();

export const PublicSnapshotMirrorSchema = z.object({
  url: httpUrl(1_000),
  role: z.enum(PublicSnapshotMirrorRoles).default('mirror'),
  contentHash: PublicSnapshotContentHashSchema.nullish(),
  lastVerifiedAt: isoTime.nullish(),
}).strict();

export const PublicSnapshotSignatureSchema = z.object({
  algorithm: z.enum(['ed25519']),
  keyId: str(160),
  signature: z.string().trim().min(64).max(512),
}).strict();

export const PublicFederationSnapshotSchema = z.object({
  schemaVersion: z.literal(PUBLIC_FEDERATION_SNAPSHOT_SCHEMA_VERSION),
  event: CrisisEventSchema,
  publisher: PublicSnapshotSourceSchema,
  defaultLocale: locale.default('en'),
  locales: z.array(locale).min(1).max(20).default(['en']),
  generatedAt: isoTime,
  sequence: z.number().int().nonnegative(),
  previousSnapshotHash: PublicSnapshotContentHashSchema.nullish(),
  canonicalUrl: httpUrl(1_000).nullish(),
  mirrors: z.array(PublicSnapshotMirrorSchema).max(50).default([]),
  sources: z.array(PublicSnapshotSourceSchema).max(250).default([]),
  records: z.object({
    persons: z.array(PublicPersonSnapshotRecordSchema).max(500_000).default([]),
    personGroups: z.array(PublicPersonGroupSchema).max(500_000).default([]),
    entities: z.array(PublicCoordinationEntitySnapshotRecordSchema).max(250_000).default([]),
    tombstones: z.array(PublicSnapshotTombstoneSchema).max(250_000).default([]),
  }).strict(),
  recordCounts: z.object({
    persons: z.number().int().nonnegative(),
    personGroups: z.number().int().nonnegative(),
    entities: z.number().int().nonnegative(),
    tombstones: z.number().int().nonnegative(),
    sources: z.number().int().nonnegative(),
  }).strict(),
  warnings: z.array(str(300)).max(50).default([]),
  contentHash: PublicSnapshotContentHashSchema,
  signature: PublicSnapshotSignatureSchema.nullish(),
}).strict();

export type PublicSnapshotSource = z.infer<typeof PublicSnapshotSourceSchema>;
export type PublicPersonSnapshotRecord = z.infer<typeof PublicPersonSnapshotRecordSchema>;
export type PublicCoordinationEntitySnapshotRecord = z.infer<typeof PublicCoordinationEntitySnapshotRecordSchema>;
export type PublicPersonGroup = z.infer<typeof PublicPersonGroupSchema>;
export type PublicSnapshotTombstone = z.infer<typeof PublicSnapshotTombstoneSchema>;
export type PublicSnapshotMirror = z.infer<typeof PublicSnapshotMirrorSchema>;
export type PublicSnapshotSignature = z.infer<typeof PublicSnapshotSignatureSchema>;
export type PublicFederationSnapshot = z.infer<typeof PublicFederationSnapshotSchema>;

export interface BuildPublicFederationSnapshotOptions {
  event: CrisisEvent;
  publisher: SourcePartner;
  sources?: SourcePartner[];
  persons?: FederatedPersonRecord[];
  entities?: CoordinationEntity[];
  personGroups?: PublicPersonGroup[];
  csvCandidatePersonGroups?: CsvCandidatePersonGroup[];
  tombstones?: PublicSnapshotTombstone[];
  generatedAt?: Date | string;
  defaultLocale?: string;
  locales?: string[];
  sequence?: number;
  previousSnapshotHash?: string;
  canonicalUrl?: string;
  mirrors?: PublicSnapshotMirror[];
  warnings?: string[];
  signature?: PublicSnapshotSignature;
  includeSingletonPersonGroups?: boolean;
}

function normalizeTimestamp(value: Date | string | undefined): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  return new Date().toISOString();
}

function isSpanishLocale(value: string): boolean {
  return value.toLowerCase().startsWith('es');
}

function localizedDefaultBadgeLabel(defaultLocale: string): string {
  return isSpanishLocale(defaultLocale) ? 'Socio de datos humanitarios federados' : DEFAULT_BADGE_LABEL;
}

function sourceFromPartner(partner: SourcePartner, defaultLocale: string): PublicSnapshotSource {
  const parsed = SourcePartnerSchema.parse(partner);
  return PublicSnapshotSourceSchema.parse({
    id: parsed.id,
    name: parsed.name,
    source: parsed.source,
    publicUrl: parsed.publicUrl,
    verifiedDomains: parsed.verifiedDomains,
    scopes: parsed.scopes,
    badgeLabel: parsed.badgeLabel === DEFAULT_BADGE_LABEL
      ? localizedDefaultBadgeLabel(defaultLocale)
      : parsed.badgeLabel,
    badgeVerifiedAt: parsed.badgeVerifiedAt,
    lastSeenAt: parsed.lastSeenAt,
  });
}

function fallbackSource(source: string): PublicSnapshotSource {
  return PublicSnapshotSourceSchema.parse({
    id: source,
    name: source,
    source,
    verifiedDomains: [],
    scopes: [],
  });
}

function newestTimestamp(values: Array<string | null | undefined>): string | undefined {
  return values.filter((value): value is string => !!value).sort((a, b) => b.localeCompare(a))[0];
}

function compareById<T extends { id: string }>(a: T, b: T): number {
  return a.id.localeCompare(b.id);
}

function sourceRefFromPerson(record: PublicPersonSnapshotRecord): z.infer<typeof PublicPersonGroupSourceRefSchema> {
  return {
    recordId: record.id,
    source: record.source,
    externalId: record.externalId,
    externalUrl: record.externalUrl,
  };
}

function publicEntitySnapshotRecordFromEntity(entity: CoordinationEntity): PublicCoordinationEntitySnapshotRecord {
  const redacted = redactCoordinationEntity(CoordinationEntitySchema.parse(entity));
  return PublicCoordinationEntitySnapshotRecordSchema.parse({
    id: redacted.id,
    eventId: redacted.eventId,
    source: redacted.source,
    externalId: redacted.externalId,
    sourceUrl: redacted.sourceUrl,
    kind: redacted.kind,
    name: redacted.name,
    description: redacted.description,
    admin1: redacted.admin1,
    admin2: redacted.admin2,
    lat: redacted.lat,
    lng: redacted.lng,
    channels: redacted.channels,
    needs: redacted.needs,
    sourceUpdatedAt: redacted.sourceUpdatedAt,
    lastVerifiedAt: redacted.lastVerifiedAt,
    updatedAt: redacted.updatedAt,
  });
}

function singletonGroupFromPerson(record: PublicPersonSnapshotRecord): PublicPersonGroup {
  return PublicPersonGroupSchema.parse({
    id: `person-group:${record.id}`,
    eventId: record.eventId,
    kind: 'single_record',
    confidence: 'none',
    title: record.displayName,
    subtitle: record.admin2 ?? record.admin1,
    status: record.status,
    statusConflict: false,
    hasStrongIdentifier: record.hasStrongIdentifier,
    memberRecordIds: [record.id],
    sources: [record.source],
    sourceRefs: [sourceRefFromPerson(record)],
    recommendedAction: 'display',
    warnings: [],
    sourceUpdatedAt: record.sourceUpdatedAt,
    updatedAt: record.updatedAt,
  });
}

function publicRecordFromCandidateMember(
  eventId: string,
  member: CsvCandidatePersonGroup['members'][number],
): PublicPersonSnapshotRecord {
  return PublicPersonSnapshotRecordSchema.parse({
    id: member.id,
    eventId,
    source: member.source,
    externalId: member.externalId,
    externalUrl: member.externalUrl,
    displayName: member.displayName,
    age: member.age,
    admin1: member.admin1,
    admin2: member.admin2,
    status: member.status,
    hasStrongIdentifier: false,
    isMultiPerson: false,
  });
}

function candidateGroupTitle(group: CsvCandidatePersonGroup): string {
  return group.representative.displayName || group.members[0]?.displayName || group.groupId;
}

function candidateGroupWarnings(
  statuses: readonly PersonStatus[],
  confidence: MatchConfidence,
  defaultLocale: string,
): z.infer<typeof PublicPersonGroupWarningSchema>[] {
  const reviewRequired = isSpanishLocale(defaultLocale)
    ? 'El posible duplicado requiere revision de coordinacion antes de tratarse como una union confirmada.'
    : 'Candidate duplicate group requires coordinator review before it is treated as a confirmed merge.';
  const statusConflict = isSpanishLocale(defaultLocale)
    ? 'Los registros del grupo mezclan estados abiertos y resueltos; revisa antes de cambiar el estado de cualquier fuente.'
    : 'Member records have open and resolved statuses; review before changing any source status.';
  const warnings: z.infer<typeof PublicPersonGroupWarningSchema>[] = [{
    id: 'candidate_review_required',
    severity: confidence === 'confirmed' ? 'info' : 'warning',
    message: reviewRequired,
  }];
  if (hasStatusConflict([...statuses])) {
    warnings.push({
      id: 'status_conflict',
      severity: 'warning',
      message: statusConflict,
    });
  }
  return warnings;
}

export function publicPersonGroupFromCsvCandidateGroup(
  eventId: string,
  group: CsvCandidatePersonGroup,
  defaultLocale = 'en',
): PublicPersonGroup {
  const members = group.members.map((member) => publicRecordFromCandidateMember(eventId, member));
  const statuses = members.map((member) => member.status);
  return PublicPersonGroupSchema.parse({
    id: group.groupId,
    eventId,
    kind: 'candidate_duplicate',
    confidence: group.confidence,
    title: candidateGroupTitle(group),
    subtitle: group.representative.admin2 ?? group.representative.admin1,
    status: displayStatus(statuses),
    statusConflict: hasStatusConflict(statuses),
    hasStrongIdentifier: group.methods.includes('identifier') || group.confidence === 'confirmed',
    memberRecordIds: members.map((member) => member.id),
    sources: [...new Set(members.map((member) => member.source))].sort((a, b) => a.localeCompare(b)),
    sourceRefs: members.map(sourceRefFromPerson),
    recommendedAction: 'coordinator_review',
    warnings: candidateGroupWarnings(statuses, group.confidence, defaultLocale),
    sourceUpdatedAt: newestTimestamp(members.map((member) => member.sourceUpdatedAt)),
    updatedAt: newestTimestamp(members.map((member) => member.updatedAt)),
  });
}

function canonicalize(value: unknown): unknown {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort((a, b) => a.localeCompare(b))) {
    const child = (value as Record<string, unknown>)[key];
    if (child !== undefined) sorted[key] = canonicalize(child);
  }
  return sorted;
}

export function stableStringifyPublicSnapshot(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function hashPublicSnapshotContent(
  snapshot: Omit<PublicFederationSnapshot, 'contentHash' | 'signature'> | PublicFederationSnapshot,
): string {
  const unsigned = { ...(snapshot as Record<string, unknown>) };
  delete unsigned.contentHash;
  delete unsigned.signature;
  return `${PublicFederationSnapshotHashAlgorithm}:${createHash('sha256')
    .update(stableStringifyPublicSnapshot(unsigned))
    .digest('hex')}`;
}

export function buildPublicFederationSnapshot(
  options: BuildPublicFederationSnapshotOptions,
): PublicFederationSnapshot {
  const event = CrisisEventSchema.parse(options.event);
  const defaultLocale = locale.parse(options.defaultLocale ?? 'en');
  const locales = [...new Set([defaultLocale, ...(options.locales ?? [])].map((value) => locale.parse(value)))];
  const publisher = sourceFromPartner(options.publisher, defaultLocale);
  const persons = (options.persons ?? [])
    .map((record) => redactPersonRecord(record))
    .map((record) => PublicPersonSnapshotRecordSchema.parse(record))
    .sort(compareById);
  const entities = (options.entities ?? [])
    .map((entity) => publicEntitySnapshotRecordFromEntity(entity))
    .sort(compareById);
  const csvGroups = (options.csvCandidatePersonGroups ?? [])
    .map((group) => publicPersonGroupFromCsvCandidateGroup(event.id, group, defaultLocale));
  const providedGroups = (options.personGroups ?? []).map((group) => PublicPersonGroupSchema.parse(group));
  const groupsById = new Map<string, PublicPersonGroup>();

  for (const group of [...providedGroups, ...csvGroups]) groupsById.set(group.id, group);

  if (options.includeSingletonPersonGroups ?? true) {
    const groupedRecordIds = new Set([...groupsById.values()].flatMap((group) => group.memberRecordIds));
    for (const person of persons) {
      if (!groupedRecordIds.has(person.id)) {
        const group = singletonGroupFromPerson(person);
        groupsById.set(group.id, group);
      }
    }
  }

  const personGroups = [...groupsById.values()].sort(compareById);
  const tombstones = (options.tombstones ?? [])
    .map((tombstone) => PublicSnapshotTombstoneSchema.parse(tombstone))
    .sort((a, b) => a.recordId.localeCompare(b.recordId));
  const sourcesBySource = new Map<string, PublicSnapshotSource>();

  for (const source of [options.publisher, ...(options.sources ?? [])].map((partner) => sourceFromPartner(partner, defaultLocale))) {
    sourcesBySource.set(source.source, source);
  }
  for (const source of [
    ...persons.map((record) => record.source),
    ...entities.map((record) => record.source),
    ...personGroups.flatMap((group) => group.sources),
    ...tombstones.map((tombstone) => tombstone.source),
  ]) {
    if (!sourcesBySource.has(source)) sourcesBySource.set(source, fallbackSource(source));
  }

  const sources = [...sourcesBySource.values()].sort((a, b) => a.source.localeCompare(b.source));
  const unsignedSnapshot = {
    schemaVersion: PUBLIC_FEDERATION_SNAPSHOT_SCHEMA_VERSION,
    event,
    publisher,
    defaultLocale,
    locales,
    generatedAt: normalizeTimestamp(options.generatedAt),
    sequence: options.sequence ?? 0,
    previousSnapshotHash: options.previousSnapshotHash,
    canonicalUrl: options.canonicalUrl,
    mirrors: options.mirrors ?? [],
    sources,
    records: {
      persons,
      personGroups,
      entities,
      tombstones,
    },
    recordCounts: {
      persons: persons.length,
      personGroups: personGroups.length,
      entities: entities.length,
      tombstones: tombstones.length,
      sources: sources.length,
    },
    warnings: options.warnings ?? [],
  };
  const contentHash = hashPublicSnapshotContent(unsignedSnapshot);
  return PublicFederationSnapshotSchema.parse({
    ...unsignedSnapshot,
    contentHash,
    signature: options.signature,
  });
}
