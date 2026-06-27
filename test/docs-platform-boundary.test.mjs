import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const docs = new Map([
  ['README.md', read('README.md')],
  ['docs/PLATFORM_BOUNDARY.md', read('docs/PLATFORM_BOUNDARY.md')],
  ['docs/HOSTED_BACKEND_ROADMAP.md', read('docs/HOSTED_BACKEND_ROADMAP.md')],
  ['docs/ARCHITECTURE.md', read('docs/ARCHITECTURE.md')],
  ['docs/API_CONTRACT.md', read('docs/API_CONTRACT.md')],
  ['docs/API_CONTRACT_INVENTORY.md', read('docs/API_CONTRACT_INVENTORY.md')],
  ['docs/INSTANCE_GUIDE.md', read('docs/INSTANCE_GUIDE.md')],
  ['docs/ROADMAP.md', read('docs/ROADMAP.md')],
  ['examples/respuesta-ve/README.md', read('examples/respuesta-ve/README.md')],
]);

function includes(path, needle) {
  const text = docs.get(path);
  assert.ok(text, `${path} was not loaded`);
  assert.ok(text.includes(needle), `${path} should include "${needle}"`);
}

function excludes(path, needle) {
  const text = docs.get(path);
  assert.ok(text, `${path} was not loaded`);
  assert.equal(text.includes(needle), false, `${path} should not include "${needle}"`);
}

includes('README.md', 'docs/PLATFORM_BOUNDARY.md');
includes('README.md', 'docs/HOSTED_BACKEND_ROADMAP.md');
includes('README.md', 'docs/API_CONTRACT_INVENTORY.md');
excludes('README.md', 'This repo is not yet a hosted multi-tenant backend');

for (const path of [
  'README.md',
  'docs/PLATFORM_BOUNDARY.md',
  'docs/HOSTED_BACKEND_ROADMAP.md',
  'docs/ARCHITECTURE.md',
  'docs/API_CONTRACT.md',
  'docs/API_CONTRACT_INVENTORY.md',
  'docs/INSTANCE_GUIDE.md',
  'docs/ROADMAP.md',
  'examples/respuesta-ve/README.md',
]) {
  includes(path, 'respuestave.org/api/v1');
}

includes('docs/PLATFORM_BOUNDARY.md', 'current production compatibility host');
includes('docs/PLATFORM_BOUNDARY.md', 'Partner integrations should keep using');
includes('docs/PLATFORM_BOUNDARY.md', 'No production API ownership should move');
includes('docs/PLATFORM_BOUNDARY.md', 'Child-protection cases never become public missing-child listings');

includes('docs/HOSTED_BACKEND_ROADMAP.md', 'Build parity tests');
includes('docs/HOSTED_BACKEND_ROADMAP.md', 'staging deployment');
includes('docs/HOSTED_BACKEND_ROADMAP.md', 'redaction');
includes('docs/HOSTED_BACKEND_ROADMAP.md', 'child-protection restrictions fail closed');
includes('docs/HOSTED_BACKEND_ROADMAP.md', 'A surprise endpoint migration for current partners');

includes('docs/API_CONTRACT_INVENTORY.md', 'Respuesta VE stays the read-only reference host');
includes('docs/API_CONTRACT_INVENTORY.md', 'test/fixtures/api-parity/respuesta-ve-v1-contract.json');
includes('docs/API_CONTRACT_INVENTORY.md', 'candidate-duplicate-advisory');

for (const [path, text] of docs) {
  assert.equal(
    /partners?\s+should\s+(?:now\s+)?(?:migrate|switch)\s+(?:away|from|to)/i.test(text),
    false,
    `${path} should not instruct partners to migrate or switch API hosts now`,
  );
  assert.equal(
    /(automatic\s+(?:identity\s+)?merge\s+(?:records|people|persons)|auto-merge\s+records|auto merge records)/i.test(text),
    false,
    `${path} should not imply automatic merging`,
  );
  assert.equal(
    /government\s+approved/i.test(text),
    false,
    `${path} should not imply government approval`,
  );
}

console.log('Docs platform boundary checks passed');
