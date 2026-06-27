# Hogar

Hogar is an open-source platform for crisis data federation: reusable contracts,
deterministic helpers, and operating guidance for sites that need to federate
crisis data across many public surfaces without creating duplicate people, stale
records, or unsafe public disclosures.

One open home, many doors — each public surface keeps its own brand and audience
while reading and writing the same source-aware records. The reusable core ships
as the npm package `@humanitarian-federation/core`; "Hogar" is the project brand,
and the package name stays neutral so the core can power any disaster response.

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
- Builds hashable public federation snapshots so frontends and mirrors can pull
  a normalized dataset even if the primary provider is unavailable.
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
  buildPublicFederationSnapshot,
  createVertexMultimodalEmbeddingProvider,
  dedupeCsvPersonCsvText,
  embedCsvRecords,
  FederatedPersonRecordSchema,
  findEmbeddingDuplicateCandidates,
  hashPublicSnapshotContent,
  handleCsvDedupeEndpointRequest,
  handlePublicDataIntakeEndpointRequest,
  redactPersonRecord,
  scorePersonMatch,
  summarizePersonStatus,
} from '@humanitarian-federation/core';
```

For a public intake route, call `handlePublicDataIntakeEndpointRequest`
from a hosted `POST /api/v1/public-intake` endpoint. It accepts arbitrary JSON,
CSV text, pasted text, URLs, or small typed file envelopes, stores the raw
submission for restricted operator review, and returns a redacted receipt
instead of publishing unverified data. Submitters poll
`GET /api/v1/public-intake?id=<receipt-id>` for queue status; verified partners
poll canonical change feeds such as `/api/v1/persons/changes?since=...` and
`/api/v1/entities/changes?since=...` after operators promote records.
When callers can provide `sourceRecordId`, `contentFingerprint`,
`processingHints`, and `canonicalCandidates`, preserve those inside the
restricted review queue so operators/workers can dedupe and clean records before
promoting them through canonical person or entity write paths. Do not expose
those hints in receipts or public snapshots.
Outside-country acopio, donation, and diaspora resource leads use the same
entity path: send `audienceScope: "outside_venezuela"`, map physical drop-offs
to `donation_center` or `supply_hub`, set `countryCode` when the source country
is known, and preserve source details in the restricted payload until the hosted
instance promotes a safe public projection.

For provider failover and frontend handoff, publish a redacted normalized
snapshot with `buildPublicFederationSnapshot` at a stable URL such as
`/api/v1/public-snapshot.json`. The snapshot includes public person records,
advisory person groups, entities, source metadata, tombstones, mirrors, and a
deterministic `contentHash` that mirrors can verify before serving a last-good
copy. Set `defaultLocale` to the public site's language, such as `es-VE`, so
human-facing labels and warnings match the frontend while machine enums stay
stable.

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
  --groups-output candidate-person-groups.json \
  --rejects rejected-rows.csv
```

Hosted APIs can call `handleCsvDedupeEndpointRequest` for a restricted
`POST /api/v1/dedupe/csv` flow, returning deterministic and optional
embedding-assisted review candidates without exposing raw IDs, notes, contacts,
or provider credentials.

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
- [Public Snapshot](docs/PUBLIC_SNAPSHOT.md)
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
