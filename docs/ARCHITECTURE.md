# Architecture

Humanitarian Federation Platform separates reusable federation logic from any
single crisis website.

## Layers

```text
Instance site
  - local language, forms, maps, moderation, deploy/runtime
  - example: Respuesta VE

Platform contracts
  - event/source/person/entity/badge schemas
  - redaction, matching, status, trust helpers
  - adapter guidance

Future hosted platform
  - source-aware ledger API
  - coordinator merge desk
  - sync workers
  - partner badge registry
```

The current repo ships the platform contracts layer. It does not yet ship a
hosted ledger service.

## Canonical Flow

1. A partner site gathers a record and keeps its own local source id.
2. The instance validates the record with strict schemas.
3. The instance stores the raw/private record behind its own security boundary.
4. Public readers receive only a whitelisted projection.
5. Matching helpers produce candidate duplicates and conflict summaries.
6. Trusted coordinators confirm merges, splits, resolutions, and partner badges.

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
