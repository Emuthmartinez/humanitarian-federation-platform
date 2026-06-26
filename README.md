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
  duplicate scoring, deterministic CSV review-candidate generation, CSV
  embedding review helpers, status summaries, and badge trust checks.
- Supports restricted child tracing for missing, unaccompanied, or separated
  children without exposing public child whereabouts.
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
  buildCsvEmbeddingInputs,
  createVertexMultimodalEmbeddingProvider,
  dedupeCsvPersonCsvText,
  embedCsvRecords,
  FederatedPersonRecordSchema,
  findEmbeddingDuplicateCandidates,
  redactPersonRecord,
  scorePersonMatch,
  summarizePersonStatus,
} from '@humanitarian-federation/core';
```

CSV uploads can be embedded for bulk duplicate review with a server-side
provider. For GCP, `createVertexMultimodalEmbeddingProvider` calls Vertex AI
`multimodalembedding@001` with public-safe row text only; matches remain
candidate duplicates for coordinator review.

For a fast local spreadsheet pass, generate deterministic candidate duplicate
pairs without sending data to a model provider:

```bash
pnpm --filter @humanitarian-federation/core build
pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
  --event-id local-event \
  --source partner-sheet \
  --output review-candidates.csv \
  --rejects rejected-rows.csv
```

Hosted APIs can call `dedupeCsvPersonCsvText` with the same options to return a
JSON review queue matching the CLI output.

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
- [Child Protection Tracing](docs/CHILD_PROTECTION_TRACING.md)
- [Privacy Model](docs/PRIVACY_MODEL.md)
- [CSV Dedupe](docs/CSV_DEDUPE.md)
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
