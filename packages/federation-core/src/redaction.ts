import type {
  ChildProtectionCaseRecord,
  ChildProtectionCaseStatus,
  ChildRelationshipClaim,
  ChildRelationshipClaimStatus,
  CoordinationEntity,
  EntityChannel,
  EntityNeed,
  FederatedPersonRecord,
  PersonStatus,
} from './schemas.js';

export interface PublicPersonRecord {
  id: string;
  eventId: string;
  source: string;
  externalId: string;
  externalUrl: string;
  displayName: string;
  age: number | null | undefined;
  admin1: string | null | undefined;
  admin2: string | null | undefined;
  status: PersonStatus;
  lastSeenAt: string | null | undefined;
  sourceUpdatedAt: string | null | undefined;
  updatedAt: string | null | undefined;
  hasStrongIdentifier: boolean;
  isMultiPerson: boolean;
}

export interface PublicCoordinationEntity {
  id: string;
  eventId: string;
  source: string;
  externalId: string;
  sourceUrl: string;
  kind: string;
  name: string;
  description: string | null | undefined;
  audienceScope: string | null | undefined;
  countryCode: string | null | undefined;
  admin1: string | null | undefined;
  admin2: string | null | undefined;
  lat: number | null | undefined;
  lng: number | null | undefined;
  channels: EntityChannel[];
  needs: EntityNeed[];
  sourceUpdatedAt: string | null | undefined;
  lastVerifiedAt: string | null | undefined;
  updatedAt: string | null | undefined;
}

export type PublicChildProtectionCaseState = 'active' | 'closed';

export interface PublicChildProtectionSignal {
  eventId: string;
  source: string;
  intakeUrl: string;
  state: PublicChildProtectionCaseState;
  sourceUpdatedAt: string | null | undefined;
  updatedAt: string | null | undefined;
  disclosure: 'restricted_child_protection_case';
}

export interface PublicChildRelationshipClaimReceipt {
  id: string;
  eventId: string;
  source: string;
  status: ChildRelationshipClaimStatus;
  submittedAt: string;
  updatedAt: string | null | undefined;
  disclosure: 'restricted_relationship_claim';
}

export function fuzzCoordinate(value: number | null | undefined, decimals = 3): number | null {
  if (value == null) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function redactPersonRecord(record: FederatedPersonRecord): PublicPersonRecord {
  return {
    id: record.id,
    eventId: record.eventId,
    source: record.source,
    externalId: record.externalId,
    externalUrl: record.externalUrl,
    displayName: record.displayName,
    age: record.age,
    admin1: record.admin1,
    admin2: record.admin2,
    status: record.status,
    lastSeenAt: record.lastSeenAt,
    sourceUpdatedAt: record.sourceUpdatedAt,
    updatedAt: record.updatedAt,
    hasStrongIdentifier: record.strongIdentifiers.length > 0,
    isMultiPerson: record.isMultiPerson,
  };
}

export function publicChildProtectionCaseState(status: ChildProtectionCaseStatus): PublicChildProtectionCaseState {
  return status === 'reunified' || status === 'transferred_to_authority' || status === 'closed' ? 'closed' : 'active';
}

export function redactChildProtectionCase(record: ChildProtectionCaseRecord): PublicChildProtectionSignal {
  return {
    eventId: record.eventId,
    source: record.source,
    intakeUrl: record.intakeUrl,
    state: publicChildProtectionCaseState(record.status),
    sourceUpdatedAt: record.sourceUpdatedAt,
    updatedAt: record.updatedAt,
    disclosure: 'restricted_child_protection_case',
  };
}

export function redactChildRelationshipClaimReceipt(claim: ChildRelationshipClaim): PublicChildRelationshipClaimReceipt {
  return {
    id: claim.id,
    eventId: claim.eventId,
    source: claim.source,
    status: claim.status,
    submittedAt: claim.submittedAt,
    updatedAt: claim.updatedAt,
    disclosure: 'restricted_relationship_claim',
  };
}

export function redactCoordinationEntity(entity: CoordinationEntity): PublicCoordinationEntity {
  return {
    id: entity.id,
    eventId: entity.eventId,
    source: entity.source,
    externalId: entity.externalId,
    sourceUrl: entity.sourceUrl,
    kind: entity.kind,
    name: entity.name,
    description: entity.description,
    audienceScope: entity.audienceScope,
    countryCode: entity.countryCode,
    admin1: entity.admin1,
    admin2: entity.admin2,
    lat: fuzzCoordinate(entity.lat),
    lng: fuzzCoordinate(entity.lng),
    channels: entity.channels,
    needs: entity.needs,
    sourceUpdatedAt: entity.sourceUpdatedAt,
    lastVerifiedAt: entity.lastVerifiedAt,
    updatedAt: entity.updatedAt,
  };
}
