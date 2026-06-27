# Data Model

## Core Objects

- **Crisis event:** an earthquake, flood, wildfire, conflict, epidemic, or other
  response context.
- **Source partner:** a site or organization that provides records.
- **Federated person record:** a source claim about a missing/found/deceased
  person, with link-back and source update clock.
- **Restricted child protection case:** a non-public source claim about a
  missing, unaccompanied, separated, or family-tracing child case.
- **Restricted relationship claim:** a non-public claim from an adult,
  caregiver, or authority searching for or asserting a relationship to a child.
- **Coordination entity:** a hospital, shelter, donation center, supply hub,
  organization, public channel, or similar crisis resource.
- **Public projection:** whitelisted view that drops private fields.
- **Candidate duplicate:** a deterministic or embedding-assisted match result
  requiring review.
- **Candidate person group:** an advisory cluster of candidate duplicate rows
  with source references preserved for coordinator review.
- **Public federation snapshot:** a redacted, hashable dataset containing
  public persons, advisory person groups, entities, source metadata, mirrors,
  and tombstones for frontend and failover reads.
- **Partner badge:** a domain-bound trust signal with scopes and freshness.

## Identity Model

The platform does not claim one record equals one person until review confirms
it. Records can be:

- singletons
- candidate duplicates
- candidate person groups for review
- coordinator-merged clusters
- split back out after a bad merge
- status-conflicted across sources

## Status Model

Person statuses:

- `missing`
- `found_safe`
- `found_injured`
- `deceased`
- `unknown`

When a cluster includes both open and resolved statuses, consumers should show a
conflict and prompt review instead of blindly closing every source record.

## Child Protection Model

Child tracing uses a restricted case-management lane, not the normal public
missing-person projection. Child records and relationship claims preserve source
provenance, but public consumers receive only safe intake signals or private
receipt status. They must not receive child names, photos, precise locations,
care arrangements, claimant details, document ids, or possible-match results.

See [Child Protection Tracing](CHILD_PROTECTION_TRACING.md) for the full model.

## Freshness

Every source write should include `sourceUpdatedAt` when possible. Instances
should prefer newer source timestamps for idempotent updates and should expose
change feeds so partner sites can poll for conflicts and resolutions.

Public snapshots add an instance-level `sequence`, `generatedAt`, optional
`previousSnapshotHash`, and deterministic `contentHash`. Mirrors should keep
immutable copies by hash and expose only the newest verified sequence as their
latest pointer.

## Public Tombstones

When a previously public record must leave the current feed, publish a
tombstone instead of silently relying on consumers to notice absence. Tombstones
name the public record id, kind, source, source-local external id when safe,
removal reason, and removal timestamp. They do not expose private raw payloads
or identifiers.

## Embedding-Assisted Review

CSV uploads can be converted into source-aware embedding inputs for bulk review.
Embedding similarity is an advisory signal, not a coordinator-confirmed merge.
Instances should store any vectors, provider metadata, and thresholds as review
artifacts separate from canonical records so bad candidates can be ignored or
split without rewriting source claims.

Embedding inputs must be built from public-safe columns only. Private contacts,
national IDs, raw photo hashes, notes, precise coordinates, relationship-claim
details, and other sensitive fields stay out of provider calls.
