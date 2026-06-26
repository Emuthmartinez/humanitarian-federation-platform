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
