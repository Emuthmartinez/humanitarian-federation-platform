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
  'child:case:write',
  'child:case:read_restricted',
  'child:claim:write',
  'child:claim:review',
  'child:reunification:write',
] as const;

export const ChildProtectionCaseStatuses = [
  'unaccompanied',
  'separated',
  'family_searching',
  'interim_care',
  'reunification_review',
  'reunified',
  'transferred_to_authority',
  'closed',
] as const;

export const ChildRelationshipClaimStatuses = [
  'received',
  'needs_review',
  'verified',
  'rejected',
  'referred_to_authority',
] as const;

export const ChildRiskFlags = [
  'trafficking_risk',
  'trafficking_suspected',
  'unverified_caregiver_claim',
  'medical_urgent',
  'disability_support_need',
  'identity_documents_missing',
  'care_arrangement_unverified',
  'cross_border',
  'sibling_group',
  'infant_or_toddler',
] as const;

export const ChildCareArrangementKinds = [
  'registered_shelter',
  'hospital',
  'child_protection_authority',
  'verified_family_member',
  'verified_foster_or_kinship_care',
  'unknown',
] as const;

export const ChildFamilyTracingConsentBases = [
  'child_assent_and_caregiver_consent',
  'caregiver_consent',
  'child_protection_authority',
  'vital_interests',
  'not_yet_recorded',
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

export const ChildCareArrangementSchema = z.object({
  kind: z.enum(ChildCareArrangementKinds).default('unknown'),
  organizationPrivate: optStr(240),
  contactPrivate: optStr(500),
  admin1Private: optStr(120),
  admin2Private: optStr(160),
  verifiedAt: isoTime.nullish(),
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

export const ChildProtectionCaseRecordSchema = z.object({
  id: str(160),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  intakeUrl: httpUrl(500),
  status: z.enum(ChildProtectionCaseStatuses).default('unaccompanied'),
  childNamePrivate: optStr(200),
  aliasPrivate: optStr(200),
  age: z.number().int().min(0).max(17).nullish(),
  lastKnownAdmin1Private: optStr(120),
  lastKnownAdmin2Private: optStr(160),
  lastKnownPlacePrivate: optStr(300),
  separationContextPrivate: optStr(1000),
  familyDetailsPrivate: optStr(1000),
  currentCare: ChildCareArrangementSchema.nullish(),
  familyTracingConsentBasis: z.enum(ChildFamilyTracingConsentBases).default('not_yet_recorded'),
  riskFlags: z.array(z.enum(ChildRiskFlags)).max(20).default([]),
  strongIdentifiers: z.array(StrongIdentifierSchema).max(8).default([]),
  photoHash: z.string().trim().regex(/^[0-9a-fA-F]{16}$/, 'photoHash must be 16 hex chars').nullish(),
  caseworkerPrivate: optStr(300),
  contactPrivate: optStr(500),
  notesPrivate: optStr(1500),
  sourceUpdatedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
  isPublicListingAllowed: z.literal(false).default(false),
}).strict();

export const ChildRelationshipClaimSchema = z.object({
  id: str(160),
  eventId: str(120),
  source: str(120),
  externalId: str(200),
  intakeUrl: httpUrl(500),
  status: z.enum(ChildRelationshipClaimStatuses).default('received'),
  childNamePrivate: optStr(200),
  childAgePrivate: z.number().int().min(0).max(17).nullish(),
  claimantNamePrivate: str(200),
  claimedRelationshipPrivate: str(160),
  claimantContactPrivate: str(500),
  claimantProofPrivate: optStr(1000),
  riskFlags: z.array(z.enum(ChildRiskFlags)).max(20).default(['unverified_caregiver_claim']),
  submittedAt: isoTime,
  sourceUpdatedAt: isoTime.nullish(),
  updatedAt: isoTime.nullish(),
  notesPrivate: optStr(1500),
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
  audienceScope: optStr(80),
  countryCode: z.string().trim().length(2).transform((value) => value.toUpperCase()).nullish(),
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
export type ChildCareArrangement = z.infer<typeof ChildCareArrangementSchema>;
export type ChildProtectionCaseRecord = z.infer<typeof ChildProtectionCaseRecordSchema>;
export type ChildRelationshipClaim = z.infer<typeof ChildRelationshipClaimSchema>;
export type FederatedPersonRecord = z.infer<typeof FederatedPersonRecordSchema>;
export type CoordinationEntity = z.infer<typeof CoordinationEntitySchema>;
export type EntityChannel = z.infer<typeof EntityChannelSchema>;
export type EntityNeed = z.infer<typeof EntityNeedSchema>;
export type PersonStatus = (typeof PersonStatuses)[number];
export type PartnerScope = (typeof PartnerScopes)[number];
export type ChildProtectionCaseStatus = (typeof ChildProtectionCaseStatuses)[number];
export type ChildRelationshipClaimStatus = (typeof ChildRelationshipClaimStatuses)[number];
export type ChildRiskFlag = (typeof ChildRiskFlags)[number];
