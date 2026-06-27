# Partner Security Review Model

This document maps common partner-review questions to the reusable platform
model. It is intentionally generic: a deployed instance, such as Respuesta VE,
owns live API keys, database retention, moderation operations, and incident
response. This repo owns the reusable contracts, redaction helpers, matching
rules, trust model, and implementation guidance.

For the first live Spanish-language instance, see:

- Instance repo: `Emuthmartinez/respuesta-ve`
- Instance technical/privacy packet:
  `respuesta-ve/docs/REVISION_TECNICA_PRIVACIDAD.md`
- Platform example handoff:
  `examples/respuesta-ve/TERREMOTO_VENEZUELA_HANDOFF.md`

## Review posture

The platform is designed so a partner can evaluate federation without first
connecting sensitive production data. Recommended review stages:

1. Review contracts, public projections, and matching criteria.
2. Run deterministic scoring locally or against fictitious records.
3. Send anonymized/fictitious payloads into a restricted intake queue.
4. Promote only reviewed, redacted records into canonical person/entity feeds.
5. Enable production sync only after scopes, retention, logging, deletion, and
   governance are approved by the deployed instance owner and the partner.

## Data flow boundaries

The reusable model separates three layers:

- **Restricted intake:** arbitrary JSON, CSV, text, URLs, or source-specific
  payloads held for operator review.
- **Canonical records:** normalized person/entity/need/channel records with
  source provenance and update clocks.
- **Public projections:** whitelisted redacted records, advisory duplicate
  groups, source metadata, and tombstones for frontends and mirrors.

Public clients should consume only the projection layer. Intake payloads and
review artifacts are not public feeds.

## Payload expectations

Person records should preserve:

- event id
- source id
- source-local external id
- source URL link-back
- display name
- optional age/coarse locality/status/source update clock
- optional match-only identifier signals behind the instance boundary

Coordination entities should preserve:

- source id and external id
- source URL link-back
- kind, name, coarse location, audience scope, country code when relevant
- public channels and active needs
- source update clock

Raw partner payloads may contain more fields, but public projections must be
explicit allowlists rather than copies of input objects.

## Matching criteria

The core model treats matching as advisory until a coordinator confirms it.
Signals can include:

- national identifier match or conflict
- photo fingerprint match or conflict
- normalized/fuzzy name, age, and locality
- source update freshness
- known split/exception records
- multi-person report detection

Candidate duplicates must not trigger automatic merge, deletion, status
resolution, or identity collapse. Confirmed coordinator actions must be
auditable and reversible.

## National IDs and photos

National IDs, raw photo hashes, raw photos, private contacts, notes, credentials,
precise locations, and child-protection details are restricted data. They can be
used for private review or match scoring when the deployed instance permits it,
but they must not be emitted in public snapshots or public partner responses.

The model supports safe public signals such as "identifier present/confirmed"
without exposing the underlying identifier.

## Retention and logs

This repo defines guidance, not a hosted retention policy. A deployed instance
must document:

- raw intake retention windows
- canonical record expiry or freshness rules
- tombstone retention for public mirrors
- audit-log retention for merge, split, correction, and deletion decisions
- operational log minimization rules
- credential rotation and revocation procedures

For review pilots, use fictitious or anonymized data and remove, ignore, or
tombstone test submissions after the test concludes.

## Corrections, deletions, and tombstones

The platform favors soft removal and explicit public tombstones over silent
disappearance. This lets downstream mirrors stop displaying withdrawn records
while preserving restricted audit evidence for coordinators.

Corrections should preserve source provenance and update clocks. Conflicting
status updates should produce review signals rather than automatically closing a
search.

## Governance

Trust is explicit and scoped:

- verified partner identity
- verified domains
- allowed scopes
- badge freshness
- revocable credentials
- coordinator review for sensitive actions
- restricted child-protection scopes separate from ordinary person scopes

A badge means participation and scope recognition. It does not mean government
endorsement, structural safety certification, or permission to publish private
data.

## Review references

- `docs/API_CONTRACT.md` - endpoint and payload model.
- `docs/PRIVACY_MODEL.md` - redaction and public projection rules.
- `docs/TRUST_MODEL.md` - partner verification, scopes, and badge semantics.
- `docs/DATA_MODEL.md` - source-aware records, candidate groups, tombstones.
- `docs/PUBLIC_SNAPSHOT.md` - mirror-safe public dataset shape.
- `docs/ADAPTERS.md` - PFIF, CSV, sheets, resource views, and embedding review.
- `docs/CHILD_PROTECTION_TRACING.md` - restricted child-safety lane.
- `packages/federation-core/src/` - schemas, redaction, matching, trust, and
  snapshot helpers.
