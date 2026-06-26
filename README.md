# Humanitarian Federation Platform

Reusable contracts, deterministic helpers, and operating guidance for sites
that need to federate crisis data across many public surfaces without creating
duplicate people, stale records, or unsafe public disclosures.

The first live instance is **Respuesta VE**, a Venezuela earthquake-response
site at [respuestave.org](https://respuestave.org). This repo is broader than
that instance: earthquake, flood, wildfire, conflict, epidemic, and other
humanitarian-response sites should be able to use the same federation model.

## What This Platform Does

- Defines source-aware records for people, crisis entities, needs, channels,
  partners, and verified badges.
- Provides a tested TypeScript core package with validation, redaction,
  duplicate scoring, status summaries, and badge trust checks.
- Keeps public projections safe by design: no precise coordinates, private
  contacts, national ID values, raw photo hashes, private notes, or secrets.
- Treats duplicate matching as advisory. Coordinators confirm merges and
  resolutions, and those decisions must be reversible.
- Gives partner sites a badge model so they can show federation participation
  without implying government endorsement.

## What This Platform Is Not Yet

This repo is not yet a hosted multi-tenant backend. The current deliverable is
the public platform foundation: contracts, core primitives, docs, and instance
guidance. Hosted ledger APIs, admin UI, and managed sync workers are tracked in
the roadmap.

## Quick Start

```bash
pnpm install
pnpm build
pnpm test
```

The package entry point is `@humanitarian-federation/core`:

```ts
import {
  FederatedPersonRecordSchema,
  redactPersonRecord,
  scorePersonMatch,
  summarizePersonStatus,
} from '@humanitarian-federation/core';
```

## Repository Layout

```text
packages/federation-core/  Deterministic schemas, matching, redaction, status, trust helpers
docs/                      Architecture, data model, API contract, privacy/trust guidance
examples/respuesta-ve/     First-instance integration notes
```

## Design Principles

1. Life-safety intake must remain low-friction.
2. Privacy beats convenience when vulnerable people or precise locations are at
   risk.
3. Federation records keep source provenance. The platform should not erase the
   site that gathered the report.
4. Dedupe is surfaced, not silently auto-merged.
5. Badges mean verified participation and scopes, not official endorsement.

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API Contract](docs/API_CONTRACT.md)
- [Data Model](docs/DATA_MODEL.md)
- [Trust Model](docs/TRUST_MODEL.md)
- [Privacy Model](docs/PRIVACY_MODEL.md)
- [Instance Guide](docs/INSTANCE_GUIDE.md)
- [Adapters](docs/ADAPTERS.md)
- [Operations](docs/OPERATIONS.md)
- [Roadmap](docs/ROADMAP.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Do not put private crisis data,
credentials, personal contact information, precise locations, or national IDs
in public issues or pull requests.

## License

MIT. See [LICENSE](LICENSE).
