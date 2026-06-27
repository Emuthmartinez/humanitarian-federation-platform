# Hogar API Contract Inventory And Parity Fixture Harness Plan

Date: 2026-06-27
Status: implemented and verified
Branch: `codex/hogar-api-parity-harness`

## Goal

Add a Hogar-owned API contract inventory and fixture-backed parity harness so
future hosted backend work can compare against the current Respuesta VE
production compatibility host without changing that host or relying on partner
secrets.

## Evidence Read

- `https://respuestave.org/api/v1` returned public discovery for
  `Respuesta VE -- Humanitarian Federation API` version `1.3.0`.
- `https://respuestave.org/api/v1/openapi` returned the public OpenAPI 3.1
  contract for the same host.
- `https://respuestave.org/api/v1/public-intake` returned the public help
  payload for intake limits and safe receipt semantics.
- Local Hogar docs already identify `respuestave.org/api/v1` as the current
  production compatibility reference and require parity proof before cutover.
- The local Respuesta VE checkout was inspected read-only only to confirm route
  names and developer-facing endpoint tables; no files there will be edited.

## Requirements

1. Inventory the current v1 API endpoint families that partner integrations
   depend on, including auth scope, response shape, cursor/freshness behavior,
   and privacy gates.
2. Store a public-safe fixture that captures the reference host metadata,
   endpoint families, auth modes, sample response-shape contracts, and parity
   gates without copying private crisis data or secret material.
3. Add a deterministic Node test harness that validates the inventory fixture,
   checks required endpoint coverage, and enforces no private fields or secret
   tokens appear in fixture or docs.
4. Keep Respuesta VE read-only as the reference host. The harness must run
   offline from static fixtures by default and must not require partner API keys.
5. Wire the harness into the root test flow so contract drift is visible before
   hosted backend code lands.
6. Link the inventory and harness from the API contract, platform boundary,
   hosted backend roadmap, and README.

## Non-Goals

- Do not implement a Hogar-hosted API package in this change.
- Do not migrate partners away from `https://respuestave.org/api/v1`.
- Do not call authenticated production endpoints, mint API keys, or write to
  Respuesta VE.
- Do not store live people, contacts, precise coordinates, national IDs, photo
  hashes, raw public-intake payloads, or child-protection details in fixtures.
- Do not model candidate duplicate output as automatic merge/resolution/delete.

## Design

Create a small contract inventory layer made of three pieces:

1. `docs/API_CONTRACT_INVENTORY.md`
   - Human-readable endpoint inventory grouped by discovery, public intake,
     person federation, entity federation, badge verification, and future
     Hogar-owned snapshot/resource surfaces.
   - Names read/write scope and whether the current reference host requires a
     partner key.
   - Records parity gates for redaction, source provenance, freshness cursors,
     advisory matching, badge semantics, and child-protection restrictions.

2. `test/fixtures/api-parity/respuesta-ve-v1-contract.json`
   - Static public-safe fixture captured from the public discovery/OpenAPI/help
     endpoints.
   - Contains endpoint families, expected methods, auth scopes, required query
     parameters, response shape keys, and safety invariants.
   - Contains only synthetic shape examples and public host metadata.

3. `test/api-contract-parity.test.mjs`
   - Loads the JSON fixture and docs.
   - Verifies all partner-used endpoint families are represented.
   - Verifies authenticated routes are labeled with the expected scope and
     public routes do not require secrets.
   - Verifies public-intake receipt shapes do not include raw payload, private
     contact, private notes, content fingerprints, candidate records, national
     IDs, or photo hashes.
   - Verifies the docs link the fixture and keep Respuesta VE as the stable
     read-only reference host.

## Files To Change

- Add `docs/API_CONTRACT_INVENTORY.md`.
- Add `test/fixtures/api-parity/respuesta-ve-v1-contract.json`.
- Add `test/api-contract-parity.test.mjs`.
- Update `package.json` with a `test:api-contracts` script and include it in
  `pnpm test`.
- Update `README.md`, `docs/API_CONTRACT.md`,
  `docs/PLATFORM_BOUNDARY.md`, and `docs/HOSTED_BACKEND_ROADMAP.md` to point
  at the inventory/harness.
- Update this plan when implementation and verification finish.

## Verification

- `pnpm run test:api-contracts` - passed
- `pnpm run test:docs` - passed
- `pnpm test` - passed
- `pnpm typecheck` - passed
- `git diff --check` - passed

Browser/UI testing is expected to be not applicable for this docs/test harness
unless a local doc viewer is added in the same change.

## Review Checklist

- Respuesta VE checkout remains untouched.
- No fixture includes live crisis records, credentials, private contacts,
  national IDs, raw photo hashes, exact private coordinates, or child data.
- Inventory describes candidate duplicates as advisory review candidates.
- Inventory says badges mean verified federation participation and scopes, not
  government or structural-safety endorsement.
- Partner guidance keeps `respuestave.org/api/v1` stable until parity,
  staging, and cutover proof exist.

## Implementation Notes

- Added `docs/API_CONTRACT_INVENTORY.md`.
- Added `test/fixtures/api-parity/respuesta-ve-v1-contract.json`.
- Added `test/api-contract-parity.test.mjs`.
- Wired `pnpm run test:api-contracts` into the root `pnpm test` flow.
- Linked the inventory from the README, API contract, platform boundary, hosted
  backend roadmap, and docs regression test.
- Kept Respuesta VE read-only: only public GETs were used for reference
  evidence and no files under the Respuesta VE checkout were changed.
