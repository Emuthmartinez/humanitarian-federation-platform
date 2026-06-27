# Public Federation Snapshot

Public instances can publish a normalized, redacted dataset that partner sites
and mirrors can pull without depending on one live provider. The core helper is
`buildPublicFederationSnapshot` from `@humanitarian-federation/core`.

## What It Solves

The snapshot gives a frontend one stable public JSON shape for:

- person records
- advisory person groups for card/list UIs
- coordination entities such as hospitals, shelters, supply hubs, channels, and
  needs
- public tombstones for records removed from the current feed
- source partner labels, badge metadata, and mirror URLs

This is not a global identity ledger and not an automatic merge system. Every
person record remains a source claim. Candidate groups remain advisory until a
coordinator confirms a merge.

## Flow

1. A partner, volunteer, Discord user, scraper, or provider sends any shape to a
   restricted intake route such as `POST /api/v1/public-intake`.
2. Operators or sync workers validate, map, redact, and dedupe the useful rows
   into typed records.
3. The instance publishes a public snapshot at a stable URL such as
   `/api/v1/public-snapshot.json`.
4. Mirrors fetch the snapshot, verify `contentHash`, optionally verify a
   detached `signature`, and store the artifact by hash plus a latest pointer.
5. Frontends read the newest trusted snapshot by `sequence`. If the primary
   provider is down, they fall back to a verified mirror serving the same hash.

## Snapshot Shape

```json
{
  "schemaVersion": "public-federation-snapshot/v1",
  "event": {
    "id": "venezuela-earthquakes-2026",
    "slug": "venezuela-earthquakes-2026",
    "name": "Venezuela Earthquakes 2026",
    "kind": "earthquake",
    "countryCodes": ["VE"],
    "startedAt": "2026-06-24T00:00:00Z",
    "publicUrl": "https://terremotovenezuela.org"
  },
  "publisher": {
    "id": "respuesta-ve",
    "name": "Respuesta VE",
    "source": "respuesta-ve",
    "publicUrl": "https://terremotovenezuela.org",
    "verifiedDomains": ["terremotovenezuela.org"],
    "scopes": ["person:read", "entity:read", "badge:read"],
    "badgeLabel": "Socio de datos humanitarios federados",
    "badgeVerifiedAt": "2026-06-26T00:00:00Z"
  },
  "defaultLocale": "es-VE",
  "locales": ["es-VE"],
  "generatedAt": "2026-06-26T18:00:00Z",
  "sequence": 7,
  "previousSnapshotHash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "canonicalUrl": "https://terremotovenezuela.org/api/v1/public-snapshot.json",
  "mirrors": [
    {
      "url": "https://mirror.example/venezuela-earthquakes-2026/public-snapshot.json",
      "role": "mirror"
    }
  ],
  "sources": [],
  "records": {
    "persons": [],
    "personGroups": [],
    "entities": [],
    "tombstones": []
  },
  "recordCounts": {
    "persons": 0,
    "personGroups": 0,
    "entities": 0,
    "tombstones": 0,
    "sources": 1
  },
  "warnings": [],
  "contentHash": "sha256:<computed hash>"
}
```

Optional `signature` uses a detached Ed25519 signature over the unsigned,
canonicalized snapshot content. The core package computes the content hash but
does not manage keys.

## Frontend Contract

Frontend consumers should render from `records.personGroups` for grouped person
cards and use `records.persons` for search/detail views. A group contains:

- `kind`: `single_record`, `candidate_duplicate`, or `coordinator_confirmed`
- `confidence`: match confidence
- `status` and `statusConflict`
- `memberRecordIds`
- `sourceRefs` with source-local ids and link-backs
- `recommendedAction`, which is `coordinator_review` for candidate groups
- public warnings such as `status_conflict`

Clients must not treat `candidate_duplicate` as a confirmed merge. Show it as a
review candidate or grouped card, preserve source links, and avoid destructive
identity actions.

Machine fields such as `status`, `kind`, `confidence`, and
`recommendedAction` stay stable across languages. Human-facing labels, badge
labels, warning messages, source names, event names, and public tombstone notes
should use the snapshot `defaultLocale`. For Venezuela-facing surfaces, use
`defaultLocale: "es-VE"` so the UI can stay in Spanish while keeping the data
contract deterministic.

Entities are already redacted public projections. Coordinates are fuzzed by
`redactCoordinationEntity`, and private addresses are omitted.

## Mirrors And Failover

Recommended mirror behavior:

- Poll the canonical URL on a short interval during an active response.
- Reject any artifact whose `contentHash` does not equal
  `hashPublicSnapshotContent(snapshot)`.
- Reject snapshots with an unexpected `publisher.source`, unknown signing key,
  or lower `sequence` than the local latest pointer.
- Store immutable copies by `contentHash`.
- Serve a stable latest URL that points to the newest verified artifact.

Frontend behavior:

- Try `canonicalUrl` first.
- Fall back to `mirrors[]` when the provider is unavailable.
- Prefer the highest verified `sequence`, not whichever mirror responds first.
- Apply `records.tombstones` from the newest trusted snapshot so withdrawn or
  unsafe records do not remain visible.

## Privacy Boundary

Snapshots are public. They must never contain precise private coordinates,
contact details, national ID values, raw photo hashes, private notes,
credentials, partner API keys, or child protection case details. Use the raw
intake queue and restricted review tools for private processing; publish only
whitelisted projections.

## Partner Safety Guarantees

What a partner can rely on:

- arbitrary incoming shapes are accepted only into restricted review
- public output is strict, normalized, and redacted before publication
- duplicate groups are labeled as review candidates unless coordinators confirm
  them
- source ids, source-local ids, and link-backs are preserved
- `contentHash` and `sequence` let mirrors and clients verify the dataset they
  serve
- public tombstones remove withdrawn or unsafe records from current views
