# Adapters

The platform uses a native schema so it can encode privacy, source provenance,
trust scopes, and reversible dedupe. External formats remain useful as adapters.

## PFIF / Person Finder

Use PFIF-style imports for missing-person source records when a partner already
publishes that format. Preserve link-back and source-local ids. Do not treat a
PFIF import as an automatic merge.

## CAP

Common Alerting Protocol is useful for alerts. Treat CAP messages as an alert
adapter feeding crisis events, official channels, or public warning surfaces,
not as the universal schema for people/entities/needs.

## HXL

HXL is useful historical prior art for humanitarian data tagging, but supported
HDX HXL services were retired in 2026. Treat HXL as legacy import/export
interop, not the required platform core.

## CSV / Sheets

Small volunteer groups often use spreadsheets. Instance adapters should:

- require link-back or source contact metadata
- validate every row
- quarantine weak identity rows
- map columns into the native schema
- avoid importing private notes into public projections

For quick local duplicate review, use the deterministic CSV candidate generator
documented in [CSV Dedupe](CSV_DEDUPE.md). Treat its output as a restricted
coordinator review queue, not as automatic merge instructions.

Hosted adapters can call `dedupeCsvPersonCsvText` to return the same restricted
JSON review queue from an authenticated API. For messy text-heavy second-pass
review, adapters can use `buildCsvEmbeddingInputs` to parse a CSV into
source-aware, public-safe row text, `embedCsvRecords` to attach vectors, and
`findEmbeddingDuplicateCandidates` to rank review candidates.

The default CSV embedding filter excludes column names that look like private
contacts, national IDs, notes, photo hashes, addresses, precise coordinates,
claimant details, proofs, or other restricted data. If an operator explicitly
tries to include a sensitive column, the helper fails closed instead of sending
that value to an embedding provider.

GCP-backed instances can use `createVertexMultimodalEmbeddingProvider` with
Vertex AI `multimodalembedding@001`. Keep credentials server-side and pass the
provider a short-lived access token or token callback; never put service account
keys or partner API credentials in uploaded CSVs or public clients. The helper
defaults to one instance per Vertex request and strict review thresholds because
similar rows in the same crisis spreadsheet can have a high baseline vector
similarity.

## Public Snapshot Output

Adapters should treat incoming formats as ingestion concerns only. After review,
publish the cleaned public result through `buildPublicFederationSnapshot` so
frontends and mirrors read one stable shape regardless of whether the source was
CSV, Discord text, a partner API, a public website, or a hand-curated operator
entry. Snapshot records are redacted projections plus advisory groups, not raw
adapter payloads.
