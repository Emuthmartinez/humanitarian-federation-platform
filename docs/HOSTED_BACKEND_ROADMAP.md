# Hosted Backend Roadmap

Hogar's hosted backend work should make the platform deployable without breaking
the current production compatibility host at `https://respuestave.org/api/v1`.

The goal is not a repo fold-in. The goal is a reusable backend path that can
eventually run Hogar-compatible APIs while Respuesta VE stays stable until parity
is proven.

## Current State

- Hogar owns reusable contracts, deterministic helpers, trust semantics,
  redaction rules, public snapshot rules, and operator guidance.
- Respuesta VE currently serves the first production Hogar-compatible API at
  `https://respuestave.org/api/v1`.
- Partner integrations should continue using the stable Respuesta VE API host.
- Reusable hosted-backend implementation work belongs in Hogar, but production
  cutover requires a separate migration plan.

## Phase 1: Contract Inventory

Inventory the current v1 API surfaces that partners rely on:

- public intake submission and receipt polling
- person write, match, status, search, and changes feeds
- entity write, search, and changes feeds
- public resource view grouping
- public federation snapshot generation
- badge verification
- CSV dedupe and review-candidate flows
- restricted child-protection receipt and read-scope rules when exposed by an
  instance

Deliverables:

- documented endpoint ownership and response-shape expectations
- fixture list for parity tests
- explicit privacy and authorization gates per endpoint family

Current artifacts:

- [API Contract Inventory](API_CONTRACT_INVENTORY.md)
- `test/fixtures/api-parity/respuesta-ve-v1-contract.json`
- `pnpm run test:api-contracts`

## Phase 2: Hosted API Skeleton

Create a Hogar-owned hosted API package or app, such as `packages/hogar-api` or
`apps/api`, only after the contract inventory is complete.

The first runnable version should favor read-only and stateless surfaces before
stateful write paths:

- discovery and OpenAPI metadata
- public snapshot serving
- redacted resource view generation
- fixture-backed parity tests

Do not move production traffic during this phase.

## Phase 3: Storage And Security Adapters

Define adapter interfaces for the parts that are instance-specific today:

- storage and source-aware ledger persistence
- rate limiting and abuse review
- partner key validation and scope checks
- audit logs for coordinator actions
- tombstone persistence
- restricted review queues
- child-protection case authorization

Security gates:

- no service-role or privileged secret in public request paths
- no raw public-intake payload returned in receipts
- no public child whereabouts, caregiver claims, proof artifacts, or case notes
- no public precise coordinates or private contacts
- no automatic merge, resolution, or deletion from matching output

## Phase 4: Parity Test Harness

Build parity tests against the current Respuesta VE compatibility reference.

The first harness is fixture-backed and offline by default. It validates the
inventory captured in
`test/fixtures/api-parity/respuesta-ve-v1-contract.json`; future hosted API
packages should add live staging comparisons against the same contract before
any production traffic moves.

The harness should verify:

- response shape compatibility for partner-used endpoints
- redaction behavior for people, entities, child-protection signals, and
  public-intake receipts
- tombstone application in public snapshots
- stable source provenance and cursor behavior
- badge scope and freshness decisions
- advisory candidate duplicate behavior
- invalid input and permission-denied responses where safe to exercise

Parity tests should compare public-safe shapes, not private database internals.

## Phase 5: Staging Shadow

Deploy a Hogar-hosted staging API before any production cutover.

The staging deployment should:

- use non-production secrets and isolated test data
- replay fixture requests from the parity harness
- publish a test public snapshot with verifiable `contentHash`
- run monitoring for 502/503 behavior, bad payloads, and receipt lifecycle
  failures
- prove rollback leaves the Respuesta VE API host untouched

## Phase 6: Production Cutover Criteria

Production API ownership can move only after all criteria are met:

- parity tests pass for every partner-used v1 endpoint family
- security review confirms redaction and authorization invariants
- partner key and badge-scope migration is documented
- tombstone, sequence, cursor, and public snapshot behavior are verified
- child-protection restrictions fail closed
- rollback plan is tested
- partner notice is ready and does not require immediate client rewrites

If any criterion fails, `respuestave.org/api/v1` remains the production host.

## Phase 7: Instance Thinning

After cutover, Respuesta VE can become thinner:

- Venezuela-specific config, copy, UX, and operations
- instance-specific public pages and moderation workflows
- deployment profile for the Venezuela event
- compatibility aliases or proxy routes during the migration window

Reusable backend code, contract tests, and safety guidance should live in Hogar.

## Not Planned In This Roadmap

- A surprise endpoint migration for current partners.
- A single global truth ledger that erases source provenance.
- Automatic identity merging or irreversible deletion from dedupe output.
- Public child tracing listings.
- Government-only control of federation participation.
- Moving secrets, production data, or RLS policies without a dedicated migration
  plan.
