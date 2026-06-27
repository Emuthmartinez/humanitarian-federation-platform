import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const fixture = JSON.parse(read('test/fixtures/api-parity/respuesta-ve-v1-contract.json'));

const docs = new Map([
  ['README.md', read('README.md')],
  ['docs/API_CONTRACT.md', read('docs/API_CONTRACT.md')],
  ['docs/API_CONTRACT_INVENTORY.md', read('docs/API_CONTRACT_INVENTORY.md')],
  ['docs/PLATFORM_BOUNDARY.md', read('docs/PLATFORM_BOUNDARY.md')],
  ['docs/HOSTED_BACKEND_ROADMAP.md', read('docs/HOSTED_BACKEND_ROADMAP.md')],
]);

function endpointId(endpoint) {
  return `${endpoint.method} ${endpoint.path}#${endpoint.variant}`;
}

const endpointFamilies = fixture.endpointFamilies ?? [];
const endpoints = endpointFamilies.flatMap((family) =>
  (family.endpoints ?? []).map((endpoint) => ({ ...endpoint, familyId: family.id, owner: family.owner })),
);

function findEndpoint(id) {
  const endpoint = endpoints.find((candidate) => endpointId(candidate) === id);
  assert.ok(endpoint, `missing endpoint fixture for ${id}`);
  return endpoint;
}

function collectObjectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectObjectKeys(nested, keys);
    }
  }
  return keys;
}

function includesDoc(path, needle) {
  const text = docs.get(path);
  assert.ok(text, `${path} was not loaded`);
  assert.ok(text.includes(needle), `${path} should include "${needle}"`);
}

assert.equal(fixture.schemaVersion, 'hogar-api-parity-fixture/v1');
assert.equal(fixture.referenceMode, 'read_only_public_reference');
assert.equal(fixture.referenceHost, 'https://respuestave.org/api/v1');
assert.equal(fixture.referenceVersion, '1.3.0');
assert.ok(Array.isArray(fixture.sources), 'fixture should record public reference sources');

for (const source of fixture.sources) {
  assert.equal(source.method, 'GET', `${source.url} should be captured with a public GET only`);
  assert.match(source.url, /^https:\/\/respuestave\.org\/api\/v1(?:\/openapi|\/public-intake)?$/);
}

const requiredEndpointIds = [
  'GET /#discovery',
  'GET /openapi#openapi',
  'POST /score#score',
  'POST /match#match',
  'POST /persons#ingest',
  'GET /persons#search',
  'GET /persons/status#status',
  'GET /persons/changes#changes',
  'POST /entities#ingest',
  'GET /entities#search',
  'GET /entities/changes#changes',
  'GET /public-intake#help',
  'POST /public-intake#submit',
  'GET /public-intake#receipt',
  'GET /badge#domain-lookup',
  'GET /public-snapshot.json#snapshot',
];

for (const id of requiredEndpointIds) findEndpoint(id);

const publicEndpoints = endpoints.filter((endpoint) => endpoint.auth === 'public');
assert.ok(publicEndpoints.length > 0, 'fixture should include public endpoints');
for (const endpoint of publicEndpoints) {
  assert.equal(endpoint.scope, null, `${endpointId(endpoint)} should not require a partner scope`);
}

const partnerEndpoints = endpoints.filter((endpoint) => endpoint.auth === 'partner_key');
assert.ok(partnerEndpoints.length > 0, 'fixture should include authenticated partner endpoints');
for (const endpoint of partnerEndpoints) {
  assert.ok(
    fixture.authScopes.includes(endpoint.scope),
    `${endpointId(endpoint)} should use a documented auth scope`,
  );
}

assert.equal(findEndpoint('POST /score#score').scope, 'score');
assert.equal(findEndpoint('POST /match#match').scope, 'match');
assert.equal(findEndpoint('POST /persons#ingest').scope, 'ingest');
assert.equal(findEndpoint('GET /persons/changes#changes').scope, 'search');
assert.equal(findEndpoint('POST /entities#ingest').scope, 'ingest');
assert.equal(findEndpoint('GET /entities/changes#changes').scope, 'search');
assert.equal(findEndpoint('GET /public-intake#help').auth, 'public');
assert.equal(findEndpoint('GET /public-intake#receipt').scope, 'ingest');
assert.equal(findEndpoint('GET /public-snapshot.json#snapshot').owner, 'hogar-contract');
assert.equal(
  findEndpoint('GET /public-snapshot.json#snapshot').implementationStatus,
  'planned_for_hogar_hosted_backend',
);

for (const id of ['GET /persons/changes#changes', 'GET /entities/changes#changes']) {
  const endpoint = findEndpoint(id);
  assert.ok(endpoint.requiredQuery.includes('since'), `${id} should require a since cursor`);
  assert.ok(endpoint.responseShape.requiredKeys.includes('nextSince'), `${id} should expose nextSince`);
}

const receiptSubmitShape = findEndpoint('POST /public-intake#submit').responseShape;
const receiptPollShape = findEndpoint('GET /public-intake#receipt').responseShape;
for (const shape of [receiptSubmitShape, receiptPollShape]) {
  assert.ok(shape.requiredKeys.includes('disclosure'), 'receipt shapes should expose disclosure');
  assert.ok(shape.requiredKeys.includes('status'), 'receipt shapes should expose status');
  assert.ok(shape.restrictedOnlyKeys.includes('rawPayload'), 'receipt shapes should keep raw payload restricted');
  assert.ok(shape.restrictedOnlyKeys.includes('canonicalCandidates'), 'receipt shapes should keep candidates restricted');
  assert.ok(shape.restrictedOnlyKeys.includes('contentFingerprint'), 'receipt shapes should keep fingerprints restricted');
}

const restrictedReceiptKeys = new Set([
  'rawPayload',
  'payload',
  'data',
  'contact',
  'contactPrivate',
  'notePrivate',
  'submittedByPrivate',
  'contentFingerprint',
  'canonicalCandidates',
  'urlsToReview',
  'imageData',
  'nationalId',
  'photoPhash',
  'childCaseId',
  'caregiverClaim',
  'proofArtifacts',
]);
const receiptExampleKeys = collectObjectKeys(fixture.sampleShapes.publicIntakeReceipt);
for (const key of restrictedReceiptKeys) {
  assert.equal(receiptExampleKeys.has(key), false, `receipt sample must not include restricted key ${key}`);
}

const fixtureText = JSON.stringify(fixture);
for (const pattern of [
  /rvk_[A-Za-z0-9]{6,}/,
  /service[_-]?role/i,
  /SUPABASE/i,
  /DATABASE_URL/i,
  /REPORT_IP_SALT/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]) {
  assert.equal(pattern.test(fixtureText), false, `fixture should not contain secret-like token ${pattern}`);
}

const gateIds = new Set((fixture.parityGates ?? []).map((gate) => gate.id));
for (const gateId of [
  'read-only-reference-host',
  'public-intake-receipt-redaction',
  'source-provenance',
  'cursor-freshness',
  'candidate-duplicate-advisory',
  'badge-scope-not-endorsement',
  'child-protection-fail-closed',
  'no-live-private-fixtures',
]) {
  assert.ok(gateIds.has(gateId), `missing parity gate ${gateId}`);
}

includesDoc('README.md', 'docs/API_CONTRACT_INVENTORY.md');
includesDoc('docs/API_CONTRACT.md', 'API Contract Inventory');
includesDoc('docs/PLATFORM_BOUNDARY.md', 'parity fixture harness');
includesDoc('docs/HOSTED_BACKEND_ROADMAP.md', 'test/fixtures/api-parity/respuesta-ve-v1-contract.json');
includesDoc('docs/API_CONTRACT_INVENTORY.md', 'Respuesta VE stays the read-only reference host');
includesDoc('docs/API_CONTRACT_INVENTORY.md', 'pnpm run test:api-contracts');

console.log('API contract parity fixture checks passed');
