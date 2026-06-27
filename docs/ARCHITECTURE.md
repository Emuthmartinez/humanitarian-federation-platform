# Architecture

Hogar separates reusable federation logic from any single crisis website.

## Layers

```text
Instance site
  - local language, forms, maps, moderation, deploy/runtime
  - example: Respuesta VE

Current production compatibility host
  - Respuesta VE serves https://respuestave.org/api/v1 today
  - partner integrations keep using this stable v1 host for now

Platform contracts
  - event/source/person/entity/badge schemas
  - restricted child tracing contracts and trust scopes
  - redaction, matching, status, trust helpers
  - public snapshot and mirror contract
  - adapter guidance

Future hosted platform
  - source-aware ledger API
  - coordinator merge desk
  - sync workers
  - partner badge registry
```

The current repo ships the platform contracts layer and owns the hosted-backend
roadmap. It does not yet ship a standalone reusable hosted API. Respuesta VE is
the first production compatibility host for Hogar API contracts and remains the
stable live API until a Hogar-hosted backend proves parity.

## Canonical Flow

1. A partner site gathers a record and keeps its own local source id.
2. The instance validates the record with strict schemas.
3. The instance stores the raw/private record behind its own security boundary.
4. Public readers receive only a whitelisted projection.
5. Matching helpers produce candidate duplicates and conflict summaries.
6. Trusted coordinators confirm merges, splits, resolutions, and partner badges.
7. Instances can publish a hashable public snapshot for frontends and mirrors.

Today, partner sites that need the first production host use
`https://respuestave.org/api/v1`. A future Hogar-hosted API must match the
public-safe v1 contract before any production cutover.

Child protection tracing follows the same source-aware pattern, but public
surfaces receive only intake signals or receipt status. Restricted child case
reads require explicit child scopes, fresh badge verification, and instance
authorization.

## Why Source-Aware

Humanitarian data is often partial, duplicated, late, and contradictory. The
platform therefore models records as source claims, not as instant global truth.
Each record keeps:

- event id
- source id
- source-local external id
- public link-back
- source update timestamp
- platform update timestamp
- review/merge status owned by the instance

## Privacy Boundary

Public projection is a whitelist. The platform never relies on "delete the
private fields later" redaction. Private fields stay in instance storage and
are omitted from public helpers by construction.

## Availability Boundary

Public snapshots are an availability layer, not a replacement for source-aware
records. A mirror can keep the last verified `public-snapshot.json` available if
the primary instance goes down, but clients still verify the publisher, sequence,
content hash, and optional signature before trusting the artifact. Tombstones in
the newest verified snapshot remove unsafe or withdrawn records from current
public views.
