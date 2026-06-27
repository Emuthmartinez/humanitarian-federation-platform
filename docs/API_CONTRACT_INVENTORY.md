# API Contract Inventory

This inventory tracks the v1 API surfaces that partner integrations rely on
while Hogar grows from reusable contracts into a hosted backend.

Current production compatibility reference:

```text
https://respuestave.org/api/v1
```

Respuesta VE stays the read-only reference host for this inventory. Hogar should
not move production API ownership or ask partners to change hosts until a
Hogar-hosted backend passes parity tests, staging proof, security review, and an
explicit cutover plan.

The fixture-backed parity harness lives at
`test/fixtures/api-parity/respuesta-ve-v1-contract.json` and is checked by
`pnpm run test:api-contracts`.

## Reference Sources

The current fixture was captured from public, unauthenticated GET surfaces only:

| Source | Purpose |
|---|---|
| `GET https://respuestave.org/api/v1` | Public discovery JSON, version, endpoint map, scopes, auth hints, and PII policy. |
| `GET https://respuestave.org/api/v1/openapi` | Public OpenAPI 3.1 route and schema contract. |
| `GET https://respuestave.org/api/v1/public-intake` | Public help payload for the restricted intake queue. |

Authenticated partner routes are represented by shape contracts from the public
OpenAPI document. The harness must not call authenticated production endpoints,
mint partner keys, or write to Respuesta VE.

## Endpoint Families

| Family | Current v1 surface | Access | Parity expectation |
|---|---|---|---|
| Discovery | `GET /`, `GET /openapi` | Public | Version, route map, scopes, auth hints, OpenAPI metadata, and privacy policy remain discoverable. |
| Person scoring | `POST /score` | Partner key with `score` scope | Pure scoring against caller-supplied records; no production DB read/write. |
| Person matching | `POST /match` | Partner key with `match` scope | Live-index match returns redacted public records with source link-backs and no identity-document or photo-hash values. |
| Person federation | `POST /persons` | Partner key with `ingest` scope | Link-back required, source attribution follows the partner key, low-quality records can be held for review, and duplicate edges remain advisory. |
| Person search | `GET /persons` | Partner key with `search` scope | Accepted public-safe records can be searched by name/state filters without private fields. |
| Person status | `GET /persons/status?externalId=` | Partner key with `search` scope | Returns canonical status signals for the caller's own external record and conflict review hints. |
| Person changes | `GET /persons/changes?since=` | Partner key with `search` scope | Returns public-safe changed records with a durable `nextSince` cursor. |
| Entity federation | `POST /entities` | Partner key with `ingest` scope | Verified hospitals, shelters, supply hubs, organizations, official channels, needs, and cross-border resources can be promoted with source link-backs. |
| Entity search | `GET /entities` | Partner key with `search` scope | Returns verified public entity metadata, public channels, active needs, audience scope, and country grouping when reviewed. |
| Entity changes | `GET /entities/changes?since=` | Partner key with `search` scope | Returns verified entity changes with a durable `nextSince` cursor. |
| Public intake help | `GET /public-intake` | Public | Explains the restricted queue contract, accepted content types, limits, cleanup hints, downstream feeds, and privacy boundary. |
| Public intake submit | `POST /public-intake` | Partner key with `ingest` scope | Accepts JSON, text, CSV, URLs, and small typed file envelopes for restricted operator review; returns only a safe receipt. |
| Public intake receipt | `GET /public-intake?id=` | Partner key with `ingest` scope | Returns receipt-safe processing status and never echoes raw payloads or restricted hints. |
| Badge lookup | `GET /badge?domain=` | Public | Returns verified federation participation metadata by domain. Badges are not government approval or structural-safety endorsement. |
| Public snapshot | `GET /public-snapshot.json` | Public | Hogar-owned contract for future hosted backend and mirrors; not part of the current Respuesta VE v1 route inventory. |

## Response Shape Gates

Parity checks are shape checks, not database checks. A Hogar-hosted backend must
match the current public contract where partners depend on it while preserving
the stronger reusable Hogar invariants.

### Required Public Keys

- Discovery responses expose `name`, `version`, `openapi`, `endpoints`, `auth`,
  `scopes`, and `pii_policy`.
- OpenAPI responses expose `openapi`, `info`, `servers`, `components`, and
  `paths`.
- Search and changes feeds expose `results`; changes feeds also expose
  `nextSince`.
- Public intake help exposes `ok`, `endpoint`, `statusEndpoint`, `access`,
  `authentication`, `maxBytes`, `accepts`, `status`, `cleanupContract`,
  `downstreamFetch`, `privacy`, and `example`.
- Public intake receipts expose receipt metadata only: `ok`, `id`, `eventId`,
  `source`, `status`, timestamps, `payloadFormat`, `submissionKind`,
  `payloadSizeChars`, `urlCount`, `warnings`, `recommendedAction`,
  `pollAfterSeconds`, `statusUrl`, `message`, and `disclosure`.

### Restricted Fields

These fields may exist in a restricted review queue or private source tables,
but they must not appear in public responses, receipt polling, fixture examples,
public snapshots, or badge responses:

- raw payloads, submitted rows, private notes, private contacts, and reporter
  identifiers
- content fingerprints, canonical candidates, internal URLs to review, and raw
  image data
- national ID values, raw photo hashes, exact private coordinates, and
  coordinator-only addresses
- child case IDs, whereabouts, caregiver claims, proof artifacts, case notes,
  and review notes
- service-role keys, partner API key values, worker secrets, database URLs, or
  signing private keys

## Parity Gates

The fixture harness enforces these gates before any hosted backend can claim
compatibility:

- `read-only-reference-host`: Respuesta VE is observed through public GETs only.
- `public-intake-receipt-redaction`: receipts are queue status, not raw data
  echoes.
- `source-provenance`: promoted records keep source and link-back provenance.
- `cursor-freshness`: changes feeds use durable cursors and timestamp-aware
  updates.
- `candidate-duplicate-advisory`: matching output is a review candidate, not an
  automatic merge, resolution, deletion, or identity collapse.
- `badge-scope-not-endorsement`: badges mean verified federation participation
  and scopes only.
- `child-protection-fail-closed`: child-protection data stays restricted unless
  a separate safe projection is explicitly modeled.
- `no-live-private-fixtures`: fixtures contain public metadata and synthetic
  shapes only.

## Fixture Refresh Rules

Use this workflow when the reference host changes:

1. Fetch only public reference surfaces:

   ```bash
   curl -fsSL https://respuestave.org/api/v1
   curl -fsSL https://respuestave.org/api/v1/openapi
   curl -fsSL https://respuestave.org/api/v1/public-intake
   ```

2. Update `test/fixtures/api-parity/respuesta-ve-v1-contract.json` by hand from
   the public route metadata and schema shapes.
3. Do not paste live people, public-intake payloads, contacts, national IDs,
   raw photo hashes, exact private coordinates, secrets, or child-protection
   records into fixtures.
4. Run `pnpm run test:api-contracts`, `pnpm run test:docs`, `pnpm test`,
   `pnpm typecheck`, and `git diff --check`.
5. If parity breaks, keep `https://respuestave.org/api/v1` as the stable
   production host and update the hosted backend roadmap before any cutover.
