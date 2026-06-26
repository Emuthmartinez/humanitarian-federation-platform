import assert from 'node:assert/strict';
import {
  ChildProtectionCaseRecordSchema,
  ChildRelationshipClaimSchema,
  CoordinationEntitySchema,
  FederatedPersonRecordSchema,
  SourcePartnerSchema,
  assessPartnerBadge,
  assessPartnerScopes,
  normalizeDomain,
  rankPersonCandidates,
  redactChildProtectionCase,
  redactChildRelationshipClaimReceipt,
  redactCoordinationEntity,
  redactPersonRecord,
  scorePersonMatch,
  summarizePersonStatus,
} from '../dist/index.js';

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass += 1;
  } catch (error) {
    fail += 1;
    console.error(`FAIL ${name}\n  ${error.message}`);
  }
};

const person = (extra = {}) => FederatedPersonRecordSchema.parse({
  id: 'p1',
  eventId: 'venezuela-earthquakes-2026',
  source: 'site-a',
  externalId: 'a-1',
  externalUrl: 'https://site-a.example/person/a-1',
  displayName: 'Ana Julia Araujo',
  age: 31,
  admin1: 'La Guaira',
  admin2: 'Catia la Mar',
  status: 'missing',
  sourceUpdatedAt: '2026-06-26T12:00:00Z',
  updatedAt: '2026-06-26T12:05:00Z',
  strongIdentifiers: [{ type: 'national_id', countryCode: 'VE', value: 'V-12.345.678' }],
  photoHash: '2160c2c66c6ce9db',
  contactPrivate: 'private phone',
  notesPrivate: 'private note',
  ...extra,
});

const childCase = (extra = {}) => ChildProtectionCaseRecordSchema.parse({
  id: 'child-case-1',
  eventId: 'venezuela-earthquakes-2026',
  source: 'child-helpdesk',
  externalId: 'case-1',
  intakeUrl: 'https://child-helpdesk.example/intake',
  status: 'unaccompanied',
  childNamePrivate: 'Lucia Perez',
  aliasPrivate: 'Luci',
  age: 9,
  lastKnownAdmin1Private: 'La Guaira',
  lastKnownAdmin2Private: 'Catia la Mar',
  lastKnownPlacePrivate: 'Shelter room 3',
  separationContextPrivate: 'Separated during evacuation',
  familyDetailsPrivate: 'Mother reported missing',
  currentCare: {
    kind: 'registered_shelter',
    organizationPrivate: 'Safe Shelter A',
    contactPrivate: '+58 private',
    admin1Private: 'La Guaira',
    admin2Private: 'Catia la Mar',
  },
  familyTracingConsentBasis: 'child_protection_authority',
  riskFlags: ['trafficking_risk', 'unverified_caregiver_claim'],
  strongIdentifiers: [{ type: 'source_record_id', value: 'internal-123' }],
  photoHash: '2160c2c66c6ce9db',
  caseworkerPrivate: 'Caseworker A',
  contactPrivate: 'private child protection hotline',
  notesPrivate: 'Sensitive case notes',
  sourceUpdatedAt: '2026-06-26T12:00:00Z',
  updatedAt: '2026-06-26T12:05:00Z',
  ...extra,
});

const childClaim = (extra = {}) => ChildRelationshipClaimSchema.parse({
  id: 'claim-1',
  eventId: 'venezuela-earthquakes-2026',
  source: 'child-helpdesk',
  externalId: 'claim-1',
  intakeUrl: 'https://child-helpdesk.example/intake',
  status: 'received',
  childNamePrivate: 'Lucia Perez',
  childAgePrivate: 9,
  claimantNamePrivate: 'Maria Perez',
  claimedRelationshipPrivate: 'mother',
  claimantContactPrivate: '+58 private',
  claimantProofPrivate: 'ID and family details',
  submittedAt: '2026-06-26T13:00:00Z',
  updatedAt: '2026-06-26T13:05:00Z',
  notesPrivate: 'Verify through authority',
  ...extra,
});

t('person schema is strict and rejects unknown fields', () => {
  assert.equal(FederatedPersonRecordSchema.safeParse({ ...person(), surprise: true }).success, false);
});

t('person schema rejects non-http link-backs', () => {
  assert.equal(FederatedPersonRecordSchema.safeParse({ ...person(), externalUrl: 'ftp://site.test/1' }).success, false);
});

t('redaction never leaks private person fields', () => {
  const redacted = redactPersonRecord(person());
  const json = JSON.stringify(redacted);
  for (const leak of ['private phone', 'private note', '2160c2c66c6ce9db', 'V-12.345.678']) {
    assert.equal(json.includes(leak), false, `leaked ${leak}`);
  }
  assert.equal(redacted.hasStrongIdentifier, true);
});

t('child protection cases cannot opt into public listing', () => {
  assert.equal(ChildProtectionCaseRecordSchema.safeParse({
    ...childCase(),
    isPublicListingAllowed: true,
  }).success, false);
});

t('child protection case schema keeps children under 18', () => {
  assert.equal(ChildProtectionCaseRecordSchema.safeParse({
    ...childCase(),
    age: 18,
  }).success, false);
});

t('child protection redaction exposes only a safe intake signal', () => {
  const redacted = redactChildProtectionCase(childCase());
  const json = JSON.stringify(redacted);
  for (const leak of [
    'child-case-1',
    'case-1',
    'Lucia Perez',
    'Luci',
    'Catia la Mar',
    'Shelter room 3',
    'Safe Shelter A',
    '+58 private',
    'internal-123',
    '2160c2c66c6ce9db',
    'Sensitive case notes',
  ]) {
    assert.equal(json.includes(leak), false, `leaked ${leak}`);
  }
  assert.equal(redacted.source, 'child-helpdesk');
  assert.equal(redacted.state, 'active');
  assert.equal(redacted.disclosure, 'restricted_child_protection_case');
});

t('child protection redaction maps terminal cases to closed', () => {
  const redacted = redactChildProtectionCase(childCase({ status: 'reunified' }));
  assert.equal(redacted.state, 'closed');
});

t('relationship claim receipts do not leak claimant or child details', () => {
  const receipt = redactChildRelationshipClaimReceipt(childClaim());
  const json = JSON.stringify(receipt);
  for (const leak of ['Lucia Perez', 'Maria Perez', '+58 private', 'ID and family details', 'mother']) {
    assert.equal(json.includes(leak), false, `leaked ${leak}`);
  }
  assert.equal(receipt.id, 'claim-1');
  assert.equal(receipt.status, 'received');
});

t('matching confirms same strong id with compatible names', () => {
  const result = scorePersonMatch(person(), person({
    id: 'p2',
    source: 'site-b',
    externalId: 'b-1',
    externalUrl: 'https://site-b.example/person/b-1',
    displayName: 'Ana Araujo',
  }));
  assert.equal(result.related, true);
  assert.equal(result.confidence, 'confirmed');
});

t('matching refuses conflicting strong ids', () => {
  const result = scorePersonMatch(person(), person({
    id: 'p2',
    strongIdentifiers: [{ type: 'national_id', countryCode: 'VE', value: 'V99999999' }],
  }));
  assert.equal(result.related, false);
  assert.equal(result.method, 'identifier_conflict');
});

t('ranking keeps review candidates without merging them', () => {
  const ranked = rankPersonCandidates(person(), [
    person({ id: 'p2', displayName: 'Pedro Gomez', strongIdentifiers: [{ type: 'national_id', countryCode: 'VE', value: 'V12345678' }] }),
    person({ id: 'p3', displayName: 'Ana Julia Araujo', strongIdentifiers: [] }),
  ]);
  assert.equal(ranked[0].id, 'p3');
});

t('status summary tells an open local site to review another source resolution', () => {
  const own = redactPersonRecord(person({ id: 'own', status: 'missing', updatedAt: '2026-06-26T12:00:00Z' }));
  const other = redactPersonRecord(person({
    id: 'other',
    source: 'site-b',
    externalId: 'b-1',
    status: 'found_safe',
    updatedAt: '2026-06-26T12:10:00Z',
  }));
  const summary = summarizePersonStatus([own, other], 'own');
  assert.equal(summary.hasConflict, true);
  assert.equal(summary.suggestedAction, 'review_resolution');
});

t('coordination entity schema validates public channels and private address', () => {
  const entity = CoordinationEntitySchema.parse({
    id: 'e1',
    eventId: 'venezuela-earthquakes-2026',
    source: 'site-a',
    externalId: 'hospital-1',
    sourceUrl: 'https://site-a.example/hospitals/1',
    kind: 'hospital',
    name: 'Hospital Central',
    lat: 10.06741,
    lng: -69.34742,
    addressPrivate: 'private street address',
    channels: [{ type: 'website', url: 'https://hospital.example', isPrimary: true }],
    needs: [{ category: 'medical_supplies', title: 'Gauze', urgency: 'high' }],
  });
  const redacted = redactCoordinationEntity(entity);
  assert.equal(JSON.stringify(redacted).includes('private street address'), false);
  assert.equal(redacted.lat, 10.067);
  assert.equal(redacted.lng, -69.347);
});

t('coordination entity rejects lat without lng', () => {
  assert.equal(CoordinationEntitySchema.safeParse({
    id: 'e1',
    eventId: 'x',
    source: 'site-a',
    externalId: '1',
    sourceUrl: 'https://site-a.example/1',
    kind: 'hospital',
    name: 'Hospital Central',
    lat: 10,
  }).success, false);
});

t('badge trust requires verified domain and fresh timestamp', () => {
  const partner = SourcePartnerSchema.parse({
    id: 'site-a',
    name: 'Site A',
    source: 'site-a',
    publicUrl: 'https://site-a.example',
    verifiedDomains: ['site-a.example'],
    scopes: ['person:read', 'person:write'],
    badgeVerifiedAt: '2026-06-20T00:00:00Z',
  });
  const badge = assessPartnerBadge(partner, 'https://www.site-a.example/page', {
    now: new Date('2026-06-26T00:00:00Z'),
  });
  assert.equal(badge.state, 'verified');
  assert.equal(normalizeDomain('https://www.site-a.example/page'), 'site-a.example');
});

t('badge trust marks stale domains stale', () => {
  const partner = SourcePartnerSchema.parse({
    id: 'site-a',
    name: 'Site A',
    source: 'site-a',
    verifiedDomains: ['site-a.example'],
    scopes: ['person:read'],
    badgeVerifiedAt: '2026-01-01T00:00:00Z',
  });
  assert.equal(assessPartnerBadge(partner, 'site-a.example', {
    now: new Date('2026-06-26T00:00:00Z'),
  }).state, 'stale');
});

t('restricted child scopes require a verified badge and explicit child grants', () => {
  const partner = SourcePartnerSchema.parse({
    id: 'child-helpdesk',
    name: 'Child Helpdesk',
    source: 'child-helpdesk',
    verifiedDomains: ['child-helpdesk.example'],
    scopes: ['badge:read', 'child:case:read_restricted', 'child:claim:review'],
    badgeVerifiedAt: '2026-06-26T00:00:00Z',
  });
  const decision = assessPartnerScopes(
    partner,
    'https://child-helpdesk.example/cases',
    ['child:case:read_restricted', 'child:claim:review'],
    { now: new Date('2026-06-26T12:00:00Z') },
  );
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.missingScopes, []);
});

t('restricted child scopes fail closed when scope is missing', () => {
  const partner = SourcePartnerSchema.parse({
    id: 'site-a',
    name: 'Site A',
    source: 'site-a',
    verifiedDomains: ['site-a.example'],
    scopes: ['person:read', 'person:write'],
    badgeVerifiedAt: '2026-06-26T00:00:00Z',
  });
  const decision = assessPartnerScopes(
    partner,
    'site-a.example',
    ['child:case:read_restricted'],
    { now: new Date('2026-06-26T12:00:00Z') },
  );
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.missingScopes, ['child:case:read_restricted']);
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
