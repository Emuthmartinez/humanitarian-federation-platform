# Data Model

## Core Objects

- **Crisis event:** an earthquake, flood, wildfire, conflict, epidemic, or other
  response context.
- **Source partner:** a site or organization that provides records.
- **Federated person record:** a source claim about a missing/found/deceased
  person, with link-back and source update clock.
- **Coordination entity:** a hospital, shelter, donation center, supply hub,
  organization, public channel, or similar crisis resource.
- **Public projection:** whitelisted view that drops private fields.
- **Candidate duplicate:** a deterministic match result requiring review.
- **Partner badge:** a domain-bound trust signal with scopes and freshness.

## Identity Model

The platform does not claim one record equals one person until review confirms
it. Records can be:

- singletons
- candidate duplicates
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

## Freshness

Every source write should include `sourceUpdatedAt` when possible. Instances
should prefer newer source timestamps for idempotent updates and should expose
change feeds so partner sites can poll for conflicts and resolutions.
