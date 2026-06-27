# Platform Boundary

Hogar is the reusable crisis data federation platform. Respuesta VE is the first
production deployment and current production compatibility host for
Hogar-compatible API contracts.

Current production API:

```text
https://respuestave.org/api/v1
```

Partner integrations should keep using that stable API host until Hogar has a
separate hosted backend that proves parity and an explicit cutover is announced.

## Repository Responsibilities

| Responsibility | Hogar platform repo | Respuesta VE repo |
|---|---|---|
| Platform identity and reusable contracts | Owns | Uses |
| Core schemas, redaction, matching, trust, snapshots | Owns | Adopts |
| Hosted backend roadmap and parity criteria | Owns | Provides the current reference |
| Venezuela-specific copy, UX, domains, and operations | References as first instance | Owns |
| Current production API host | Defines compatibility contract | Serves `respuestave.org/api/v1` |
| Supabase project, RLS, moderation data, worker secrets | Documents future extraction gates | Owns until a migration plan exists |

## Current Compatibility Promise

Respuesta VE currently serves the first production Hogar-compatible API. That
does not make the Respuesta VE frontend the platform identity, and it does not
mean Hogar should absorb the instance repo in one move.

For now:

- `respuestave.org/api/v1` remains the stable production compatibility host.
- Partner apps should not change API hosts because of this repo-boundary work.
- Public intake receipts remain queue status, not canonical records.
- Processed canonical records still come from cursor feeds such as
  `/api/v1/persons/changes` and `/api/v1/entities/changes`.
- Candidate duplicates remain review candidates until a coordinator confirms a
  merge or split.

## What Hogar Owns Now

Hogar owns the reusable rules and contracts that make a crisis federation safe:

- source-aware person, entity, need, partner, badge, and snapshot contracts
- deterministic redaction, matching, status, trust, CSV, and view helpers
- public snapshot and mirror rules
- restricted child-protection case contracts and trust scopes
- partner integration guidance and API compatibility expectations
- the staged roadmap for extracting a reusable hosted backend

## What Stays In Respuesta VE For Now

These stay in the Respuesta VE deployment until a dedicated migration plan and
parity proof exist:

- production domains and routing
- Supabase database, migrations, RLS, RPCs, and moderation queues
- partner API key issuance and current secret storage
- Venezuela-specific public copy, UX, and operational workflows
- live responder, coordinator, and public-submission data
- worker deployment config and runtime secrets

## Cutover Principles

No production API ownership should move from Respuesta VE to a Hogar-hosted API
until all of these are true:

1. Hogar has a hosted API package or app that implements the v1 contract.
2. Parity tests compare Hogar responses with the current Respuesta VE reference
   for public-safe response shapes.
3. Privacy checks prove no precise coordinates, contacts, national IDs, raw
   photo hashes, private notes, child-protection details, or secrets leak.
4. Public intake still stores raw submissions only in restricted review queues
   and returns safe receipts.
5. Tombstones, source provenance, badge scopes, freshness signals, and advisory
   duplicate groups preserve their current semantics.
6. A staging or shadow deployment runs before any production traffic moves.
7. Rollback keeps `respuestave.org/api/v1` available if the Hogar-hosted API is
   not ready.

## Partner Guidance

Partner surfaces should describe their integration as Hogar-compatible and use
the current production API host:

```text
POST https://respuestave.org/api/v1/public-intake
GET  https://respuestave.org/api/v1/persons/changes?since=<cursor>
GET  https://respuestave.org/api/v1/entities/changes?since=<cursor>
```

When a future Hogar-hosted API is ready, it should be introduced as a compatible
backend behind the same public contract, not as a surprise endpoint migration.

## Non-Negotiable Invariants

- Public response shapes are whitelisted.
- Private coordinates, contacts, IDs, raw photos, private notes, and secrets are
  never public.
- Duplicate matching is advisory and reversible.
- Source provenance stays attached to every federated record.
- Badges mean verified federation participation and scopes, not endorsement.
- Child-protection cases never become public missing-child listings.
