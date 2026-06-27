import assert from 'node:assert/strict';
import {
  ChildProtectionCaseRecordSchema,
  ChildRelationshipClaimSchema,
  CoordinationEntitySchema,
  FederatedPersonRecordSchema,
  PublicDataIntakeSubmissionRecordSchema,
  SourcePartnerSchema,
  assessPartnerBadge,
  assessPartnerScopes,
  buildCsvEmbeddingInputs,
  buildPublicFederationSnapshot,
  csvRowToPersonRecord,
  createVertexMultimodalEmbeddingProvider,
  dedupeCsvPersonCsvText,
  embedCsvRecords,
  findCsvPersonDuplicateCandidates,
  findEmbeddingDuplicateCandidates,
  buildGroupedPersonViewModel,
  handleCsvDedupeEndpointRequest,
  handleGroupedPersonViewEndpointRequest,
  handlePublicDataIntakeEndpointRequest,
  hashPublicSnapshotContent,
  isSensitiveEmbeddingColumn,
  normalizeDomain,
  PublicFederationSnapshotSchema,
  rankPersonCandidates,
  redactChildProtectionCase,
  redactPublicDataIntakeSubmissionReceipt,
  redactChildRelationshipClaimReceipt,
  redactCoordinationEntity,
  redactPersonRecord,
  scorePersonMatch,
  summarizePersonStatus,
} from '../dist/index.js';

let pass = 0;
let fail = 0;
const tests = [];
const t = (name, fn) => {
  tests.push({ name, fn });
};

const runTests = async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      pass += 1;
    } catch (error) {
      fail += 1;
      console.error(`FAIL ${name}\n  ${error.message}`);
    }
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

t('csv dedupe maps spreadsheet rows into advisory candidates', () => {
  const parsed = [
    csvRowToPersonRecord({
      external_id: 'a-1',
      full_name: 'Ana Julia Araujo',
      age: '31',
      city: 'Catia la Mar',
      national_id: 'V-12.345.678',
    }, 2, {
      eventId: 'venezuela-earthquakes-2026',
      source: 'volunteer-sheet',
      identifierCountryCode: 'VE',
    }),
    csvRowToPersonRecord({
      external_id: 'b-1',
      full_name: 'Ana Araujo',
      age: '32',
      city: 'Catia la Mar',
      national_id: 'V12345678',
    }, 3, {
      eventId: 'venezuela-earthquakes-2026',
      source: 'volunteer-sheet',
      identifierCountryCode: 'VE',
    }),
  ];

  assert.equal(parsed.every((row) => row.ok), true);
  const candidates = findCsvPersonDuplicateCandidates(parsed.filter((row) => row.ok));
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].leftRow, 2);
  assert.equal(candidates[0].rightRow, 3);
  assert.equal(candidates[0].result.confidence, 'confirmed');
  assert.equal(candidates[0].result.reason, 'same strong identifier');
});

t('csv dedupe rejects invalid rows instead of silently defaulting', () => {
  const parsed = csvRowToPersonRecord({
    external_id: 'bad-1',
    full_name: 'Invalid Age',
    age: 'unknown',
  }, 2);

  assert.equal(parsed.ok, false);
  assert.equal(parsed.errors.some((error) => error.includes('age "unknown" must be an integer')), true);
});

t('csv dedupe API handles Spanish split-name hospital sheets', () => {
  const result = dedupeCsvPersonCsvText([
    'Nombre,Apellido,CI,Edad,Hospital,Status',
    'Ana,Araujo,V-12.345.678,31,Hospital Central,Confirmado',
    'Ana Julia,Araujo,V12345678,31,Hospital Central,Por confirmar',
  ].join('\n'), {
    eventId: 'venezuela-earthquakes-2026',
    source: 'hospital-sheet',
    identifierCountryCode: 'VE',
    ignoreStatus: true,
    columns: {
      admin2: 'Hospital',
    },
  });

  assert.deepEqual(result.summary, {
    rowsRead: 2,
    validRecords: 2,
    rejectedRows: 0,
    candidatePairs: 1,
    candidateGroups: 1,
    skippedBuckets: [],
  });
  assert.equal(result.candidates[0].candidateType, 'candidate_duplicate');
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0].memberCount, 2);
  assert.equal(result.groups[0].sourceRefs.length, 2);
  assert.equal(result.candidates[0].recommendedAction, 'coordinator_review');
  assert.equal(result.candidates[0].confidence, 'confirmed');
  assert.equal(result.candidates[0].leftName, 'Ana Araujo');
  assert.equal(result.candidates[0].rightName, 'Ana Julia Araujo');
});

t('csv dedupe ignores weak document placeholders as strong identifiers', () => {
  const result = dedupeCsvPersonCsvText([
    'Nombre,Apellido,CI,Edad,Hospital,Status',
    'Ana,Araujo,NO PORTA DOCUMENTO,31,Hospital Central,Confirmado',
    'Pedro,Gomez,NO PORTA DOCUMENTO,31,Hospital Central,Confirmado',
  ].join('\n'), {
    eventId: 'venezuela-earthquakes-2026',
    source: 'hospital-sheet',
    ignoreStatus: true,
    columns: {
      admin2: 'Hospital',
    },
  });

  assert.equal(result.summary.validRecords, 2);
  assert.equal(result.summary.candidatePairs, 0);
  assert.equal(result.summary.candidateGroups, 0);
});

t('csv dedupe groups one candidate person while preserving source refs', () => {
  const result = dedupeCsvPersonCsvText([
    'source,external_id,full_name,age,city,national_id,Fuentes',
    'hospital-a,a-1,Ana Araujo,31,Caracas,V-12.345.678,radio desk',
    'hospital-b,b-9,Ana Julia Araujo,31,Caracas,V12345678,field team',
  ].join('\n'), {
    eventId: 'venezuela-earthquakes-2026',
    identifierCountryCode: 'VE',
    sourceRefColumns: ['Fuentes'],
  });

  assert.equal(result.summary.candidatePairs, 1);
  assert.equal(result.summary.candidateGroups, 1);
  assert.deepEqual(result.groups[0].sources, ['hospital-a', 'hospital-b']);
  assert.deepEqual(result.groups[0].sourceRefs, [
    { source: 'hospital-a', externalId: 'a-1', rowNumber: 2, sourceDetails: { Fuentes: 'radio desk' } },
    { source: 'hospital-b', externalId: 'b-9', rowNumber: 3, sourceDetails: { Fuentes: 'field team' } },
  ]);
  assert.equal(result.groups[0].recommendedAction, 'coordinator_review');
});

t('csv dedupe endpoint returns deterministic review candidates', async () => {
  const response = await handleCsvDedupeEndpointRequest({
    csvText: [
      'Nombre,Apellido,CI,Edad,Hospital,Status,Fuentes',
      'Ana,Araujo,V-12.345.678,31,Hospital Central,Confirmado,radio desk',
      'Ana Julia,Araujo,V12345678,31,Hospital Central,Por confirmar,field team',
    ].join('\n'),
    eventId: 'venezuela-hospitalized-review',
    source: 'personas-hospitalizadas-csv',
    identifierCountryCode: 'VE',
    ignoreStatus: true,
    columns: {
      admin2: 'Hospital',
    },
    sourceRefColumns: ['Fuentes'],
  });

  assert.equal(response.rowsRead, 2);
  assert.equal(response.validRows, 2);
  assert.equal(response.rejectedRows.length, 0);
  assert.equal(response.deterministic.candidatePairs, 1);
  assert.equal(response.deterministic.candidateGroups, 1);
  assert.equal(response.deterministic.groups[0].memberCount, 2);
  assert.deepEqual(response.deterministic.groups[0].sourceRefs[0].sourceDetails, { Fuentes: 'radio desk' });
  assert.equal(response.deterministic.candidates[0].method, 'identifier');
  assert.equal(response.deterministic.candidates[0].recommendedAction, 'coordinator_review');
  assert.equal(response.deterministic.candidates[0].left.displayName, 'Ana Araujo');
  assert.equal(response.deterministic.candidates[0].left.status, 'unknown');
});

t('csv dedupe endpoint returns embedding candidates through injected provider', async () => {
  const response = await handleCsvDedupeEndpointRequest({
    csvText: [
      'Nombre,Apellido,CI,Edad,Hospital,Fuentes,Notas',
      'Ana,Araujo,V-12.345.678,31,Hospital Central,private-source,private note',
      'Ana Julia,Araujo,,31,Hospital Central,private-source,private note',
      'Pedro,Gomez,,42,Hospital Norte,private-source,private note',
    ].join('\n'),
    eventId: 'venezuela-hospitalized-review',
    source: 'personas-hospitalizadas-csv',
    ignoreStatus: true,
    columns: {
      admin2: 'Hospital',
    },
    deterministic: {
      enabled: false,
    },
    embedding: {
      enabled: true,
      includeColumns: ['Nombre', 'Apellido', 'Edad', 'Hospital'],
      reviewThreshold: 0.72,
      possibleThreshold: 0.78,
      likelyThreshold: 0.95,
    },
  }, {
    embeddingProvider: {
      embed: async (inputs) => inputs.map((input) => ({
        id: input.id,
        vector: input.text.includes('Pedro') ? [0, 1] : [1, 0.03],
        provider: 'fixture',
        model: 'fixture-embedding',
        dimension: 2,
      })),
    },
  });

  assert.equal(response.embedding.enabled, true);
  assert.equal(response.embedding.embeddedRows, 3);
  assert.deepEqual(response.embedding.excludedColumns, ['CI', 'Fuentes', 'Notas']);
  assert.equal(response.embedding.candidatePairs, 1);
  assert.equal(response.embedding.candidates[0].candidateType, 'embedding');
  assert.equal(response.embedding.candidates[0].confidence, 'likely');
  assert.equal(response.embedding.candidates[0].left.displayName, 'Ana Araujo');
  assert.equal(JSON.stringify(response).includes('private note'), false);
  assert.equal(JSON.stringify(response).includes('V-12.345.678'), false);
});

const groupedSummaryCsvFixture = [
  'group_id,group_sort_bucket,group_kind,group_confidence,has_ci,ci_normalized,ci_count,ci_conflict,report_rows,total_num_reportes,statuses,status_conflict,hospitals,fuentes_count,member_row_numbers,representative_name,representative_hospital,needs_moderation,moderation_decision,moderation_notes',
  'g1,0,cedula,confirmed_by_ci,yes,V12345678,1,no,3,5,Desaparecido | Encontrado,no,Hospital Central,3,"2|3|4",Ana Araujo,Hospital Central,no,,',
  'g2,1,candidate_match,likely,no,,0,no,2,2,Confirmado,yes,Hospital Norte,2,"5|6",Pedro Gomez,Hospital Norte,yes,accept,operator-only note',
].join('\n');

const groupedReportsCsvFixture = [
  'group_id,group_sort_bucket,group_kind,group_confidence,group_has_ci,group_ci_normalized,group_ci_count,group_ci_conflict,group_report_rows,group_total_num_reportes,group_statuses,group_status_conflict,group_hospitals,group_fuentes_count,group_member_row_numbers,group_representative_name,group_representative_hospital,needs_moderation,moderation_decision,moderation_notes,row_number,source_id,external_id,Nombre,Apellido,CI,CI_normalized,Edad,Sexo,Hospital,NumReportes,Status,Fuentes,Notas',
  'g1,0,cedula,confirmed_by_ci,yes,V12345678,1,no,3,5,Desaparecido | Encontrado,no,Hospital Central,3,"2|3|4",Ana Araujo,Hospital Central,no,,,2,source-a,a-1,Ana,Araujo,V-12.345.678,V12345678,31,F,Hospital Central,2,Desaparecido,"source text https://example.org/a-1",private note',
  'g1,0,cedula,confirmed_by_ci,yes,V12345678,1,no,3,5,Desaparecido | Encontrado,no,Hospital Central,3,"2|3|4",Ana Araujo,Hospital Central,no,,,3,source-a,a-2,Ana Julia,Araujo,V-12.345.678,V12345678,31,F,Hospital Central,3,Encontrado,"source text https://example.org/a-2",private note',
  'g2,1,candidate_match,likely,no,,0,no,2,2,Confirmado,yes,Hospital Norte,2,"5|6",Pedro Gomez,Hospital Norte,yes,accept,operator-only note,5,source-b,b-1,Pedro,Gomez,,,42,,Hospital Norte,1,Confirmado,"raw fuente https://example.org/b-1",private note',
].join('\n');

const groupedViewOptionsFixture = {
  sourceLabelById: {
    'source-a': 'Desaparecidos Terremoto',
    'source-b': 'Hospital sheet',
  },
};

t('grouped person view model matches card UI without leaking private fields', () => {
  const view = buildGroupedPersonViewModel(
    groupedSummaryCsvFixture,
    groupedReportsCsvFixture,
    groupedViewOptionsFixture,
  );

  assert.equal(view.stats.groupsTotal, 2);
  assert.equal(view.stats.sourceRows, 3);
  assert.equal(view.stats.reportsGathered, 7);
  assert.equal(view.stats.groupsWithIdentifier, 1);
  assert.equal(view.sections[0].id, 'identified_with_identifier');
  assert.deepEqual(view.sections[0].groupIds, ['g1']);
  assert.equal(view.groups[0].badges.some((badge) => badge.label === 'Cédula reportada'), true);
  assert.equal(view.groups[0].badges.some((badge) => badge.label === 'Mismo registro · 3 reportes'), true);
  assert.equal(view.groups[0].status.label, 'Desaparecido(a)');
  assert.equal(view.groups[0].reports[0].source.label, 'Desaparecidos Terremoto');
  assert.deepEqual(view.groups[0].reports[0].source.urls, ['https://example.org/a-1']);
  assert.equal(view.groups[1].warnings.some((warning) => warning.id === 'status_conflict'), true);
  const json = JSON.stringify(view);
  for (const leak of ['V-12.345.678', 'V12345678', 'private note', 'source text ', 'raw fuente ', 'operator-only note', 'accept']) {
    assert.equal(json.includes(leak), false, `leaked ${leak}`);
  }
});

t('grouped person view endpoint returns a public-safe card payload', () => {
  const response = handleGroupedPersonViewEndpointRequest({
    groupSummaryCsvText: groupedSummaryCsvFixture,
    groupedReportsCsvText: groupedReportsCsvFixture,
    view: {
      ...groupedViewOptionsFixture,
      localizedStatusValues: ['Confirmado'],
    },
  });

  assert.equal(response.view.stats.groupsTotal, 2);
  assert.equal(response.view.stats.localizedReports, 1);
  assert.deepEqual(response.view.sections.map((section) => section.id), [
    'identified_with_identifier',
    'needs_review',
    'single_records',
  ]);
  const json = JSON.stringify(response.view);
  for (const leak of ['CI_normalized', 'moderation_notes', 'operator-only note', 'raw fuente ']) {
    assert.equal(json.includes(leak), false, `leaked ${leak}`);
  }
});

t('public intake accepts arbitrary unauthenticated JSON and returns a safe receipt', () => {
  const response = handlePublicDataIntakeEndpointRequest({
    source: 'discord:respuesta-ve',
    submittedBy: '@volunteer',
    contact: '+58 private phone',
    note: 'Please scrape the linked sheet and process these rows.',
    kind: 'mixed',
    data: {
      sheet: 'https://example.org/public-hospital-sheet',
      rows: [
        {
          name: 'Ana Julia Araujo',
          hospital: 'Hospital Central',
          phone: '+58 private phone',
        },
      ],
    },
  }, {
    defaultEventId: 'venezuela-earthquakes-2026',
    now: '2026-06-26T15:00:00Z',
  });

  assert.equal(response.submission.eventId, 'venezuela-earthquakes-2026');
  assert.equal(response.submission.source, 'discord:respuesta-ve');
  assert.equal(response.submission.reviewStatus, 'received_for_review');
  assert.equal(response.submission.submissionKind, 'mixed');
  assert.equal(response.submission.payloadFormat, 'json');
  assert.deepEqual(response.submission.urlsToReview, ['https://example.org/public-hospital-sheet']);
  assert.equal(response.receipt.authentication, 'none_required');
  assert.equal(response.receipt.urlCount, 1);
  assert.equal(response.receipt.message.includes('will not be published or merged automatically'), true);
  assert.equal(JSON.stringify(response.receipt).includes('+58 private phone'), false);
  assert.equal(JSON.stringify(response.receipt).includes('Ana Julia Araujo'), false);
  assert.equal(JSON.stringify(response.submission).includes('+58 private phone'), true);
});

t('public intake receipts can expose processing status without raw payload data', () => {
  const response = handlePublicDataIntakeEndpointRequest({
    source: 'rescue-map-upload',
    kind: 'entity',
    data: {
      fileName: 'hospitales.csv',
      rows: [{ name: 'Hospital Central', contact: '+58 private phone' }],
    },
  }, {
    defaultEventId: 'venezuela-earthquakes-2026',
    now: '2026-06-26T15:00:00Z',
  });

  const promoted = PublicDataIntakeSubmissionRecordSchema.parse({
    ...response.submission,
    updatedAt: '2026-06-26T15:05:00Z',
    reviewStatus: 'promoted',
    recommendedAction: 'canonical_record_created',
    processedRecordKind: 'entity',
    processedRecordId: 'entity:hospital-central',
    processedRecordUrl: 'https://respuestave.org/api/v1/entities/entity:hospital-central',
    processedAt: '2026-06-26T15:05:00Z',
    publicReviewNote: 'Processed as a hospital/entity record.',
  });
  const receipt = redactPublicDataIntakeSubmissionReceipt(promoted);
  const json = JSON.stringify(receipt);

  assert.equal(receipt.status, 'promoted');
  assert.equal(receipt.pollAfterSeconds, null);
  assert.equal(receipt.processedRecord.kind, 'entity');
  assert.equal(receipt.processedRecord.id, 'entity:hospital-central');
  assert.equal(json.includes('Hospital Central'), false);
  assert.equal(json.includes('+58 private phone'), false);
});

t('public intake accepts raw text and keeps receipts redacted', () => {
  const response = handlePublicDataIntakeEndpointRequest(
    'Nombre,Hospital\nAna Araujo,Hospital Central\nhttps://example.org/source',
    {
      defaultEventId: 'venezuela-earthquakes-2026',
      defaultSource: 'discord-dropbox',
      receivedVia: 'discord',
      now: new Date('2026-06-26T16:00:00Z'),
    },
  );

  assert.equal(response.submission.source, 'discord-dropbox');
  assert.equal(response.submission.receivedVia, 'discord');
  assert.equal(response.submission.payloadFormat, 'csv');
  assert.deepEqual(response.submission.urlsToReview, ['https://example.org/source']);
  assert.deepEqual(redactPublicDataIntakeSubmissionReceipt(response.submission), response.receipt);
  assert.equal(JSON.stringify(response.receipt).includes('Ana Araujo'), false);
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

t('public federation snapshot normalizes redacted records for mirrors', () => {
  const event = {
    id: 'venezuela-earthquakes-2026',
    slug: 'venezuela-earthquakes-2026',
    name: 'Venezuela Earthquakes 2026',
    kind: 'earthquake',
    countryCodes: ['ve'],
    startedAt: '2026-06-24T00:00:00Z',
    publicUrl: 'https://terremotovenezuela.org',
  };
  const publisher = SourcePartnerSchema.parse({
    id: 'respuesta-ve',
    name: 'Respuesta VE',
    source: 'respuesta-ve',
    publicUrl: 'https://terremotovenezuela.org',
    verifiedDomains: ['terremotovenezuela.org'],
    scopes: ['person:read', 'entity:read', 'badge:read'],
    badgeVerifiedAt: '2026-06-26T00:00:00Z',
  });
  const entity = CoordinationEntitySchema.parse({
    id: 'entity:hospital-central',
    eventId: 'venezuela-earthquakes-2026',
    source: 'hospital-directory',
    externalId: 'hospital-central',
    sourceUrl: 'https://terremotovenezuela.app/resources/hospital-central',
    kind: 'hospital',
    name: 'Hospital Central',
    lat: 10.06741,
    lng: -69.34742,
    addressPrivate: 'private street address',
    channels: [{ type: 'website', url: 'https://hospital.example', isPrimary: true }],
    needs: [{ category: 'medical_supplies', title: 'Gauze', urgency: 'high' }],
    updatedAt: '2026-06-26T14:00:00Z',
  });
  const dedupeRun = dedupeCsvPersonCsvText([
    'external_id,full_name,age,city,national_id,status',
    'row-a,Ana Julia Araujo,31,Catia la Mar,V-12.345.678,missing',
    'row-b,Ana Araujo,31,Catia la Mar,V12345678,found_safe',
  ].join('\n'), {
    eventId: 'venezuela-earthquakes-2026',
    source: 'hospital-sheet',
    identifierCountryCode: 'VE',
  });
  const snapshot = buildPublicFederationSnapshot({
    event,
    publisher,
    persons: [person()],
    entities: [entity],
    csvCandidatePersonGroups: dedupeRun.groups,
    generatedAt: '2026-06-26T18:00:00Z',
    defaultLocale: 'es-VE',
    locales: ['es-VE'],
    sequence: 7,
    previousSnapshotHash: `sha256:${'0'.repeat(64)}`,
    canonicalUrl: 'https://terremotovenezuela.org/api/v1/public-snapshot.json',
    mirrors: [{ url: 'https://mirror.example/venezuela-earthquakes-2026/public-snapshot.json', role: 'mirror' }],
    tombstones: [{
      eventId: 'venezuela-earthquakes-2026',
      recordKind: 'person',
      recordId: 'person:withdrawn',
      source: 'hospital-sheet',
      externalId: 'old-row',
      reason: 'privacy_risk',
      removedAt: '2026-06-26T17:30:00Z',
      publicNote: 'Withdrawn from the current public feed.',
    }],
  });

  PublicFederationSnapshotSchema.parse(snapshot);
  assert.equal(snapshot.schemaVersion, 'public-federation-snapshot/v1');
  assert.equal(snapshot.defaultLocale, 'es-VE');
  assert.deepEqual(snapshot.locales, ['es-VE']);
  assert.equal(snapshot.publisher.badgeLabel, 'Socio de datos humanitarios federados');
  assert.equal(snapshot.recordCounts.persons, 1);
  assert.equal(snapshot.recordCounts.entities, 1);
  assert.equal(snapshot.recordCounts.tombstones, 1);
  assert.equal(snapshot.contentHash, hashPublicSnapshotContent(snapshot));
  assert.match(snapshot.contentHash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(snapshot.records.entities[0].lat, 10.067);
  assert.equal(snapshot.records.entities[0].lng, -69.347);
  const candidateGroup = snapshot.records.personGroups.find((group) => group.kind === 'candidate_duplicate');
  assert.equal(candidateGroup?.recommendedAction, 'coordinator_review');
  assert.equal(candidateGroup?.statusConflict, true);
  assert.equal(candidateGroup?.warnings.some((warning) => warning.id === 'candidate_review_required'), true);
  assert.equal(candidateGroup?.warnings.some((warning) => warning.message.includes('posible duplicado')), true);

  const rebuilt = buildPublicFederationSnapshot({
    event,
    publisher,
    persons: [person()],
    entities: [entity],
    csvCandidatePersonGroups: dedupeRun.groups,
    generatedAt: '2026-06-26T18:00:00Z',
    defaultLocale: 'es-VE',
    locales: ['es-VE'],
    sequence: 7,
    previousSnapshotHash: `sha256:${'0'.repeat(64)}`,
    canonicalUrl: 'https://terremotovenezuela.org/api/v1/public-snapshot.json',
    mirrors: [{ url: 'https://mirror.example/venezuela-earthquakes-2026/public-snapshot.json', role: 'mirror' }],
    tombstones: snapshot.records.tombstones,
  });
  assert.equal(rebuilt.contentHash, snapshot.contentHash);

  const json = JSON.stringify(snapshot);
  for (const leak of ['private phone', 'private note', '2160c2c66c6ce9db', 'V-12.345.678', 'V12345678', 'private street address']) {
    assert.equal(json.includes(leak), false, `leaked ${leak}`);
  }
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

t('csv embedding inputs exclude sensitive columns before provider calls', () => {
  const result = buildCsvEmbeddingInputs(
    [
      'external_id,display_name,admin1,phone,national_id,notesPrivate,lat',
      'r1,Ana Julia Araujo,La Guaira,+58 555,V-12.345.678,private note,10.123',
    ].join('\n'),
    {
      eventId: 'venezuela-earthquakes-2026',
      source: 'site-a',
      externalIdColumn: 'external_id',
    },
  );

  assert.equal(result.rows.length, 1);
  assert.equal(result.rejectedRows.length, 0);
  assert.equal(result.rows[0].text.includes('display_name: Ana Julia Araujo'), true);
  assert.equal(result.rows[0].text.includes('admin1: La Guaira'), true);
  for (const leak of ['+58 555', 'V-12.345.678', 'private note', '10.123']) {
    assert.equal(result.rows[0].text.includes(leak), false, `leaked ${leak}`);
  }
  assert.equal(isSensitiveEmbeddingColumn('phone'), true);
  assert.equal(isSensitiveEmbeddingColumn('national_id'), true);
});

t('csv embedding input rejects explicit sensitive include columns', () => {
  assert.throws(() => buildCsvEmbeddingInputs(
    [
      'external_id,display_name,phone',
      'r1,Ana Julia Araujo,+58 555',
    ].join('\n'),
    {
      eventId: 'venezuela-earthquakes-2026',
      source: 'site-a',
      externalIdColumn: 'external_id',
      includeColumns: ['display_name', 'phone'],
    },
  ), /cannot include sensitive columns/);
});

t('embedding candidates stay advisory and event scoped', async () => {
  const result = buildCsvEmbeddingInputs(
    [
      'external_id,display_name,admin1',
      'r1,Ana Julia Araujo,La Guaira',
      'r2,Ana Araujo,La Guaira',
      'r3,Pedro Gomez,Caracas',
    ].join('\n'),
    {
      eventId: 'venezuela-earthquakes-2026',
      source: 'site-a',
      externalIdColumn: 'external_id',
    },
  );

  const vectors = new Map([
    ['r1', [1, 0]],
    ['r2', [0.99, 0.1]],
    ['r3', [0, 1]],
  ]);
  const records = await embedCsvRecords(result.rows, {
    embed: async (inputs) => inputs.map((input) => ({
      id: input.id,
      vector: vectors.get(input.id.split(':').at(-1)) ?? [0, 1],
      provider: 'fixture',
      model: 'fixture-embedding',
      dimension: 2,
    })),
  });

  const candidates = findEmbeddingDuplicateCandidates(records, {
    reviewThreshold: 0.72,
    possibleThreshold: 0.78,
    likelyThreshold: 0.95,
  });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].method, 'embedding');
  assert.equal(candidates[0].confidence, 'likely');
  assert.equal(candidates[0].id.endsWith(':r1'), true);
  assert.equal(candidates[0].candidateId.endsWith(':r2'), true);
  assert.equal(candidates[0].reason.includes('coordinator review'), true);
});

t('vertex multimodal embedding provider calls GCP predict endpoint', async () => {
  let capturedUrl = '';
  let capturedBody = null;
  let capturedAuthorization = '';
  const vector = Array.from({ length: 128 }, (_, index) => index / 1000);
  const provider = createVertexMultimodalEmbeddingProvider({
    projectId: 'gcp-project-1',
    location: 'us-central1',
    accessToken: 'test-token',
    dimension: 128,
    fetch: async (url, init) => {
      capturedUrl = url;
      capturedBody = JSON.parse(init.body);
      capturedAuthorization = init.headers.Authorization;
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({
          predictions: [{ textEmbedding: vector }],
        }),
      };
    },
  });

  const [result] = await provider.embed([{ id: 'row-1', text: 'display_name: Ana Julia Araujo' }]);

  assert.equal(
    capturedUrl,
    'https://us-central1-aiplatform.googleapis.com/v1/projects/gcp-project-1/locations/us-central1/publishers/google/models/multimodalembedding%40001:predict',
  );
  assert.equal(capturedAuthorization, 'Bearer test-token');
  assert.deepEqual(capturedBody.instances, [{ text: 'display_name: Ana Julia Araujo' }]);
  assert.deepEqual(capturedBody.parameters, { dimension: 128 });
  assert.equal(result.id, 'row-1');
  assert.equal(result.provider, 'google-vertex-ai');
  assert.equal(result.model, 'multimodalembedding@001');
  assert.equal(result.dimension, 128);
  assert.deepEqual(result.vector, vector);
});

await runTests();
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
