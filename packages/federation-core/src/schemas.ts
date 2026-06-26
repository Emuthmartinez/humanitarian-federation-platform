import { z } from 'zod';

const str = (max: number) => z.string().trim().min(1).max(max);
const optStr = (max: number) => z.string().trim().min(1).max(max).nullish();
const httpUrl = (max: number) => z.url().max(max).refine((value) => /^https?:\/\//i.test(value), {
  message: 'must use http or https',
});
const isoTime = z.string().trim().min(1).max(80).refine((value) => Number.isFinite(Date.parse(value)), {
  message: 'must be a valid timestamp',
});

export const CrisisKinds = [
  'earthquake',
  'flood',
  'wildfire',
  'hurricane',
  'conflict',
  'epidemic',
  'other',
] as const;

export const PersonStatuses = ['missing', 'found_safe', 'found_injured', 'deceased', 'unknown'] as const;

export const EntityKinds = [
  'hospital',
  'clinic',
  'field_clinic',
  'shelter',
  'donation_center',
  'supply_hub',
  'pharmacy',
  'water_point',
  'official_channel',
  'organization',
  'community_group',
  'other',
] as const;

export const NeedCategories = [
  'medical_supplies',
  'beds',
  'blood',
  'water',
  'food',
  'shelter',
  'volunteers',
  'transport',
  'fuel',
  'power',
  'communications',
  'sanitation',
  'funds',
  'other',
] as const;

export const NeedStatuses = ['open', 'in_progress', 'fulfilled', 'cancelled', 'expired'] as const;
export const Urgencies = ['critical', 'high', 'normal', 'low'] as const;
export const ChannelTypes = [
  'donation_url',
  'volunteer_form',
  'supply_dropoff',
  'website',
  'phone_public',
  'whatsapp_public',
  'email_public',
  'social',
  'other',
] as const;

export const PartnerScopes = [
  'person:read',
  'person:write',
  'entity:read',
  'entity:write',
  'status:write',
  'badge:read',
] as const;

export const CrisisEventSchema = z.object({
  id: str(120),
  slug: str(120),
  name: str(200),
  kind: z.enum(CrisisKinds),
  countryCodes: z.array(z.string().trim().length(2).transform((value) => value.toUpperCase())).min(1).max(20),
  startedAt: isoTime,
  endedAt: isoTime.nullish(),
  publicUrl: httpUrl(500).nullish(),
}).strict();

export const SourcePartnerSchema = z.object({
  id: str(120),
  name: str(200),
  source: str(120),
  publicUrl: httpUrl(500).nullish(),
  verifiedDomains: z.array(str(253)).max(50).default([]),
  scopes: z.array(z.enum(PartnerScopes)).max(20).default([]),
  badgeLabel: str(120).default('Federated humanitarian data partner'),
  badgeVerifiedAt: isoTime.nullish(),
  lastSeenAt: isoTime.nullish(),
}).strict();

export const StrongIdentifierSchema = z.object({
  type: z.enum(['national_id', 'passport', 'source_record_id', 'other']),
  value: str(160),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).nullish(),
}).strict();

export const FederatedPersonRecordSchema = z.object({
  id: str(160),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  externalUrl: httpUrl(500),
  displayName: str(200),
  age: z.number().int().min(0).max(130).nullish(),
  admin1: optStr(120),
  admin2: optStr(160),
  status: z.enum(PersonStatuses).default('unknown'),
  lastSeenAt: isoTime.nullish(),
  sourceUpdatedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
  strongIdentifiers: z.array(StrongIdentifierSchema).max(8).default([]),
  photoHash: z.string().trim().regex(/^[0-9a-fA-F]{16}$/, 'photoHash must be 16 hex chars').nullish(),
  contactPrivate: optStr(500),
  notesPrivate: optStr(1000),
  isMultiPerson: z.boolean().default(false),
}).strict();

export const EntityChannelSchema = z.object({
  type: z.enum(ChannelTypes),
  label: optStr(120),
  url: httpUrl(500).nullish(),
  displayText: optStr(200),
  instructions: optStr(500),
  isPrimary: z.boolean().default(false),
}).strict().refine((value) => !!value.url || !!value.displayText, {
  message: 'url or displayText is required',
});

export const EntityNeedSchema = z.object({
  category: z.enum(NeedCategories).default('other'),
  title: str(160),
  description: optStr(700),
  urgency: z.enum(Urgencies).default('normal'),
  status: z.enum(NeedStatuses).default('open'),
  quantity: z.number().finite().positive().nullish(),
  unit: optStr(60),
  expiresAt: isoTime.nullish(),
  sourceUpdatedAt: isoTime.nullish(),
}).strict();

export const CoordinationEntitySchema = z.object({
  id: str(160),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  sourceUrl: httpUrl(500),
  kind: z.enum(EntityKinds),
  name: str(200),
  description: optStr(900),
  admin1: optStr(120),
  admin2: optStr(160),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
  addressPrivate: optStr(300),
  channels: z.array(EntityChannelSchema).max(20).default([]),
  needs: z.array(EntityNeedSchema).max(50).default([]),
  sourceUpdatedAt: isoTime.nullish(),
  lastVerifiedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
}).strict().refine((value) => (value.lat == null && value.lng == null) || (value.lat != null && value.lng != null), {
  message: 'lat and lng must be provided together',
});

export type CrisisEvent = z.infer<typeof CrisisEventSchema>;
export type SourcePartner = z.infer<typeof SourcePartnerSchema>;
export type StrongIdentifier = z.infer<typeof StrongIdentifierSchema>;
export type FederatedPersonRecord = z.infer<typeof FederatedPersonRecordSchema>;
export type CoordinationEntity = z.infer<typeof CoordinationEntitySchema>;
export type EntityChannel = z.infer<typeof EntityChannelSchema>;
export type EntityNeed = z.infer<typeof EntityNeedSchema>;
export type PersonStatus = (typeof PersonStatuses)[number];
export type PartnerScope = (typeof PartnerScopes)[number];
