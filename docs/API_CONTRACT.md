# API Contract

The package defines contracts that a hosted instance can expose over HTTP. The
current public proof is Respuesta VE's `/api/v1/*` routes; this document names
the generic shape.

## Public Data Intake

Hosted instances can expose a public intake queue for volunteers, Discord users,
partner forwards, and quick scrape targets:

```text
POST /api/v1/public-intake
Content-Type: application/json

GET /api/v1/public-intake?id=<receipt-id>
```

This endpoint accepts any JSON body, including arrays, arbitrary objects,
wrapped submissions, pasted text, CSV text, URL lists, or small typed file
envelopes containing text extracts or image data URLs. Implementations can use
`handlePublicDataIntakeEndpointRequest` from
`@humanitarian-federation/core` to normalize the body into a restricted review
record and a safe receipt. The helper does not fetch or scrape URLs
synchronously; it records http(s) links as `urlsToReview` so operators or a
separate worker can process them with SSRF protections.

Recommended wrapped shape:

```json
{
  "source": "discord:respuesta-ve",
  "sourceRecordId": "discord:respuesta-ve:message-123",
  "contentFingerprint": "sha256:...",
  "submittedBy": "@discord-user",
  "contact": "private reply contact if needed",
  "kind": "mixed",
  "audienceScope": "in_venezuela",
  "processingHints": {
    "dedupeMode": "candidate_review_not_auto_merge",
    "promotionPath": "/api/v1/persons",
    "cleanupPipeline": [
      "extract_rows",
      "normalize_person",
      "match_person",
      "operator_promote_safe_records"
    ]
  },
  "canonicalCandidates": [
    {
      "kind": "person",
      "externalId": "discord:respuesta-ve:message-123:row-1",
      "externalUrl": "https://source.example/message/123",
      "record": {
        "displayName": "Ana Araujo",
        "age": 31,
        "admin1": "La Guaira",
        "status": "missing"
      }
    }
  ],
  "note": "Please scrape this sheet and process the rows.",
  "data": {
    "sheet": "https://example.org/public-hospital-sheet",
    "anything": "Any shape is accepted here"
  },
  "files": {
    "declaredPurpose": "entity",
    "items": [
      {
        "name": "hospitales.csv",
        "type": "text/csv",
        "text": "name,state\nHospital Central,Lara"
      },
      {
        "name": "persona.jpg",
        "type": "image/jpeg",
        "dataUrl": "data:image/jpeg;base64,..."
      }
    ]
  }
}
```

Raw JSON is also valid:

```json
[
  {
    "name": "Ana Araujo",
    "hospital": "Hospital Central",
    "source": "volunteer spreadsheet"
  }
]
```

CSV or pasted text can be wrapped when a client cannot send raw text:

```json
{
  "source": "discord:respuesta-ve",
  "csvText": "Nombre,Hospital\nAna Araujo,Hospital Central"
}
```

Safe receipt:

```json
{
  "id": "public-intake:00abc123",
  "eventId": "venezuela-earthquakes-2026",
  "source": "discord:respuesta-ve",
  "status": "received_for_review",
  "submittedAt": "2026-06-26T15:00:00.000Z",
  "payloadFormat": "json",
  "submissionKind": "mixed",
  "payloadSizeChars": 220,
  "urlCount": 1,
  "warnings": [],
  "recommendedAction": "operator_triage",
  "processedAt": null,
  "processedRecord": null,
  "publicReviewNote": null,
  "pollAfterSeconds": 30,
  "statusUrl": "https://respuestave.org/api/v1/public-intake?id=public-intake:00abc123",
  "message": "Submission received for restricted operator review. Poll the receipt status until processing is complete; it will not be published or merged automatically.",
  "disclosure": "restricted_unverified_public_submission"
}
```

Receipt polling is for submitters and public forwarding sites. It answers the
question "what happened to my upload?" without returning raw submitted rows,
private contacts, names, notes, exact coordinates, photo hashes, or document
identifiers. Valid receipt lifecycle values are `received_for_review`,
`triaged`, `promoted`, `ignored`, and `spam`. When a reviewed submission becomes
a canonical public record, the receipt can expose only a safe pointer:

```json
{
  "status": "promoted",
  "processedAt": "2026-06-26T15:05:00.000Z",
  "processedRecord": {
    "kind": "entity",
    "id": "entity:hospital-central",
    "url": "https://respuestave.org/api/v1/entities/entity:hospital-central"
  },
  "pollAfterSeconds": null
}
```

The stored submission is restricted operator data. It may contain private
contacts or raw fields supplied by the sender, but the receipt must not echo
names, contacts, notes, document identifiers, exact coordinates, raw payload
rows, or child protection details. Public intake must still use rate limits,
size limits, logging, abuse review, and a non-public queue. Intake data is not a
federated record until an operator validates, maps, redacts, deduplicates, and
publishes it through the normal write paths.

If a caller can provide cleanup hints, store them only in the restricted queue:

- `sourceRecordId`: stable source reference for advisory grouping and review;
  do not rely on it for retry idempotency unless the hosted instance documents
  that behavior separately.
- `contentFingerprint`: restricted hash for repeated upload grouping. Do not
  publish or expose it in receipts.
- `processingHints`: suggested extraction, normalization, dedupe, and promotion
  path.
- `canonicalCandidates`: caller-supplied person/entity/need candidates already
  mapped toward the instance schema. Candidate records should use canonical
  write-contract field names, such as `displayName` and `admin1`, instead of
  localized source labels.

Outside-country donation and resource leads should also travel as entity
candidates. Map diaspora collection centers as `kind: "donation_center"` or
`kind: "supply_hub"`, donation links as `channels.type: "donation_url"`,
drop-off instructions as `channels.type: "supply_dropoff"`, and needed items
as `needs` with categories such as `medical_supplies`, `food`, `water`,
`shelter`, or `funds`. Include `audienceScope: "outside_venezuela"` in the
restricted intake wrapper. Canonical coordination entities in the reusable
platform schema also support `audienceScope` and ISO-3166 alpha-2 `countryCode`.
If a hosted instance has not wired those fields through its local API/database
yet, preserve the country in the restricted payload or native donation-center
table and use the public entity geography fields for country/region (`admin1`
or the instance-local `estado`) and city/state (`admin2` or `municipio`) during
review.

These fields help operators and workers choose deterministic cleanup steps, but
they remain advisory. Promote people through the authenticated person write path,
coordination entities and needs through the entity write path, and keep medical
patient details, raw photos, private contacts, and child-protection claims
restricted unless a coordinator creates a safe public projection.

Processed canonical data is fetched separately. Partners with read scopes should
poll the normal change feeds with a durable `since` cursor, for example
`GET /api/v1/persons/changes?since=<last-seen-updatedAt>` and
`GET /api/v1/entities/changes?since=<last-seen-updatedAt>`. Public intake
receipts are not the canonical feed; they are a sender-facing queue status.

## Public Federation Snapshot

Hosted instances can expose a redacted normalized dataset for public frontends
and decentralized mirrors:

```text
GET /api/v1/public-snapshot.json
```

Implementations can use `buildPublicFederationSnapshot` from
`@humanitarian-federation/core` after records have been validated, reviewed,
redacted, and promoted. The response contains one stable shape for public person
records, advisory person groups, coordination entities, public tombstones,
source partner labels, mirror URLs, and a deterministic `contentHash`.
Instances should set `defaultLocale` to the language already used by their
public surface, for example `es-VE` for Terremoto Venezuela. Machine fields
remain stable enums; human-facing labels, warning messages, source names, and
public tombstone notes should be localized.

The snapshot is designed for failover. Mirrors fetch the canonical URL, verify
`contentHash` with `hashPublicSnapshotContent(snapshot)`, optionally verify a
detached Ed25519 `signature`, and serve the newest trusted `sequence` if the
primary provider is unavailable. Clients should reject hash mismatches and
prefer the highest verified sequence rather than whichever mirror responds
first.

Person groups in the snapshot remain advisory unless their `kind` is
`coordinator_confirmed`. A `candidate_duplicate` group must stay tied to
`recommendedAction: "coordinator_review"` and must not trigger automatic merge,
resolution, deletion, or identity collapse in client applications.

See [Public Federation Snapshot](PUBLIC_SNAPSHOT.md) for the full shape and
mirror rules.

## Write Person Record

```json
{
  "record": {
    "eventId": "venezuela-earthquakes-2026",
    "source": "site-a",
    "externalId": "person-123",
    "externalUrl": "https://site-a.example/person/123",
    "displayName": "Ana Julia Araujo",
    "age": 31,
    "admin1": "La Guaira",
    "admin2": "Catia la Mar",
    "status": "missing",
    "sourceUpdatedAt": "2026-06-26T12:00:00Z"
  }
}
```

Private fields such as contacts, notes, precise locations, IDs, and photo
hashes may exist behind the instance boundary, but public responses must expose
only redacted projections.

## Match Person Record

Inputs are compared against the instance's federated index. Responses return
candidate duplicates, not automatic merges.

```json
{
  "matches": [
    {
      "id": "platform-record-id",
      "score": 0.91,
      "method": "name_age_locality",
      "confidence": "likely",
      "reason": "name, age, and locality are compatible"
    }
  ]
}
```

## Batch CSV Dedupe Endpoint

Hosted instances can expose a restricted coordinator or verified-partner
endpoint for CSV review:

```text
POST /api/v1/dedupe/csv
Content-Type: application/json
Authorization: required
```

Implementations can use `handleCsvDedupeEndpointRequest` from
`@humanitarian-federation/core`. The request includes CSV text, event/source
metadata, optional column mappings, deterministic dedupe options, and optional
embedding options. The response returns rejected rows, deterministic review
candidates, and embedding-assisted review candidates when a server-side
`EmbeddingProvider` is supplied.

Example request for a Spanish hospital-style sheet:

```json
{
  "csvText": "Nombre,Apellido,CI,Edad,Hospital,Status\nAna,Araujo,V-12.345.678,31,Hospital Central,Confirmado",
  "eventId": "venezuela-hospitalized-review",
  "source": "personas-hospitalizadas-csv",
  "identifierCountryCode": "VE",
  "ignoreStatus": true,
  "columns": {
    "admin2": "Hospital"
  },
  "embedding": {
    "enabled": true,
    "includeColumns": ["Nombre", "Apellido", "Edad", "Sexo", "Hospital"]
  }
}
```

The endpoint is restricted review infrastructure. It may include public-safe
names and source row numbers for coordinators, but it must not echo raw national
IDs, passport numbers, contacts, private notes, raw photo hashes, precise
coordinates, child protection details, provider tokens, or raw source payloads.
Every output row remains advisory and must lead to `coordinator_review`, not an
automatic merge.

## Grouped Person View Endpoint

Hosted instances can expose a public-safe projection endpoint for already
reviewed or review-ready grouped CSV exports:

```text
POST /api/v1/person-groups/view
Content-Type: application/json
Authorization: deployment-specific
```

Implementations can use `handleGroupedPersonViewEndpointRequest` from
`@humanitarian-federation/core`. The request includes the group summary CSV, the
grouped report rows CSV, and optional view settings such as source label maps or
localized status values.

```json
{
  "groupSummaryCsvText": "group_id,group_kind,has_ci,report_rows,statuses,...",
  "groupedReportsCsvText": "group_id,row_number,source_id,Nombre,Apellido,Status,Fuentes,...",
  "view": {
    "sourceLabelById": {
      "desaparecidos-terremoto": "Desaparecidos Terremoto"
    },
    "localizedStatusValues": ["Encontrado", "Encontrada", "Localizado"]
  }
}
```

The response is a card-oriented `view` payload with aggregate stats, ordered
sections, public badges, status pills, conflict warnings, per-report source
labels, and extracted http(s) source URLs. It deliberately omits raw identifier
columns, normalized ID columns, private notes, raw source text, and moderation
notes. Conflict warnings remain advisory; clients must not present grouped rows
as confirmed merges unless a coordinator has reviewed them.

## Resource View Endpoint

Hosted instances can expose a public-safe resource projection for hospitals,
needs, shelters, acopio centers, donation links, organizations, public support
channels, map-report need clusters, and safe hospital-patient signals:

```text
POST /api/v1/resources/view
Content-Type: application/json
Authorization: deployment-specific
```

Implementations can use `handleResourceViewEndpointRequest` from
`@humanitarian-federation/core`. The endpoint accepts reviewed
`CoordinationEntity` records plus already-public-safe resource records. It is
not a raw-intake publisher; private contacts, private addresses, raw notes,
content fingerprints, photo data, exact medical details, and raw payload rows
must stay in the restricted review queue.

```json
{
  "entities": [
    {
      "id": "entity:usa-doral-acopio",
      "eventId": "venezuela-earthquakes-2026",
      "source": "mapa-emergencia-rescate",
      "externalId": "usa-doral-acopio",
      "sourceUrl": "https://terremotovenezuela.app/apoyo-global",
      "kind": "donation_center",
      "name": "Centro de acopio Doral",
      "audienceScope": "outside_venezuela",
      "countryCode": "US",
      "admin1": "Estados Unidos",
      "admin2": "Doral, FL",
      "channels": [
        {
          "type": "supply_dropoff",
          "displayText": "Recibe insumos medicos, agua y comida",
          "isPrimary": true
        }
      ],
      "needs": [
        { "category": "medical_supplies", "title": "Primeros auxilios", "urgency": "high" },
        { "category": "food", "title": "Alimentos no perecederos" }
      ]
    }
  ],
  "resources": [
    {
      "id": "patient-signal:hospital-central:1",
      "eventId": "venezuela-earthquakes-2026",
      "source": "mapa-emergencia-rescate",
      "externalId": "hospital-patient-1",
      "sourceUrl": "https://terremotovenezuela.app/hospitales/hospital-central#paciente-1",
      "kind": "patient_signal",
      "title": "Paciente registrado en Hospital Central",
      "audienceScope": "in_venezuela",
      "countryCode": "VE",
      "admin1": "Lara",
      "admin2": "Barquisimeto",
      "status": "hospitalized",
      "urgency": "high",
      "categories": ["medical_supplies"],
      "relationships": [
        {
          "type": "patient_at_hospital",
          "targetId": "entity:hospital-central",
          "label": "Paciente en Hospital Central"
        }
      ]
    }
  ],
  "view": {
    "sourceLabelById": {
      "mapa-emergencia-rescate": "Mapa Emergencia VE"
    },
    "staleAfterDays": 3
  }
}
```

The response returns a `view` with aggregate stats, `outside_venezuela`,
`in_venezuela`, `needs`, `health_and_patients`, and `support_channels`
sections, card badges, warnings, public channels, needs, source labels, source
URLs, and fuzzed public coordinates. `patient_signal` records are allowed only
as public-safe signals and include a warning reminding clients not to publish
contacts, private notes, or sensitive medical details.

## Batch CSV Deterministic Dedupe

Hosted instances can expose a restricted coordinator or verified-partner endpoint
that accepts a CSV upload, maps rows into `FederatedPersonRecordSchema`, and
returns the same review queue produced by the local CLI. Implementations can use
`dedupeCsvPersonCsvText` from `@humanitarian-federation/core`.

```json
{
  "summary": {
    "rowsRead": 5808,
    "validRecords": 5808,
    "rejectedRows": 0,
    "candidatePairs": 412,
    "candidateGroups": 319,
    "skippedBuckets": []
  },
  "candidates": [
    {
      "candidateType": "candidate_duplicate",
      "leftRow": 42,
      "rightRow": 318,
      "leftId": "hospital-sheet:csv-row-42",
      "rightId": "hospital-sheet:csv-row-318",
      "leftSource": "hospital-sheet",
      "rightSource": "hospital-sheet",
      "leftExternalId": "csv-row-42",
      "rightExternalId": "csv-row-318",
      "leftName": "Private review name",
      "rightName": "Private review name variant",
      "score": 1,
      "confidence": "confirmed",
      "method": "identifier",
      "related": true,
      "reason": "same strong identifier",
      "recommendedAction": "coordinator_review"
    }
  ],
  "groups": [
    {
      "groupId": "candidate-person-group:42",
      "groupType": "candidate_person_group",
      "memberCount": 2,
      "candidatePairCount": 1,
      "sources": ["hospital-a", "hospital-b"],
      "sourceRefs": [
        { "source": "hospital-a", "externalId": "a-1", "rowNumber": 42 },
        { "source": "hospital-b", "externalId": "b-9", "rowNumber": 318 }
      ],
      "representative": {
        "displayName": "Private review name",
        "age": 31,
        "admin2": "Private review locality"
      },
      "confidence": "likely",
      "maxScore": 0.91,
      "methods": ["name_age_locality"],
      "members": [
        {
          "rowNumber": 42,
          "id": "hospital-a:a-1",
          "source": "hospital-a",
          "externalId": "a-1",
          "externalUrl": "https://local.invalid/federation-csv/a-1",
          "displayName": "Private review name",
          "age": 31,
          "admin2": "Private review locality",
          "status": "unknown"
        },
        {
          "rowNumber": 318,
          "id": "hospital-b:b-9",
          "source": "hospital-b",
          "externalId": "b-9",
          "externalUrl": "https://local.invalid/federation-csv/b-9",
          "displayName": "Private review name variant",
          "age": 31,
          "admin2": "Private review locality",
          "status": "unknown"
        }
      ],
      "recommendedAction": "coordinator_review"
    }
  ],
  "rejectedRows": []
}
```

This response is restricted review data. It may include names and source row
numbers, but must not include raw national IDs, passport numbers, contact
details, private notes, raw photo hashes, precise coordinates, or child
protection details. API clients must treat every row as advisory; they must not
merge, resolve, delete, or publish identity claims without coordinator review.
Groups are candidate person review clusters only. `sourceRefs` preserve source
traceability while reviewers decide whether the grouped rows really describe one
person. API callers can pass `sourceRefColumns` for restricted provenance
columns that should be copied into `sourceRefs[].sourceDetails` rather than used
as canonical federation source ids.

## Batch CSV Embedding Dedupe

Hosted instances can accept operator-uploaded CSVs, normalize public-safe row
text, embed those rows through a server-side provider, and return candidate
duplicates for review. Embedding results must not mutate canonical records or
merge identities on their own.

```json
{
  "acceptedRows": 142,
  "rejectedRows": [
    {
      "rowNumber": 17,
      "externalId": "csv-row-17",
      "reason": "no public-safe columns available for embedding"
    }
  ],
  "matches": [
    {
      "id": "venezuela-earthquakes-2026:site-a:r1",
      "candidateId": "venezuela-earthquakes-2026:site-a:r9",
      "eventId": "venezuela-earthquakes-2026",
      "score": 0.93,
      "method": "embedding",
      "confidence": "likely",
      "reason": "embedding similarity suggests a candidate duplicate for coordinator review"
    }
  ]
}
```

For GCP-backed embedding, call `createVertexMultimodalEmbeddingProvider` on the
server with a short-lived access token or token callback. The core helper uses
Vertex AI `multimodalembedding@001` through the `:predict` endpoint and sends
only the filtered row text. The multimodal endpoint is called one instance at a
time by default, and candidate thresholds default to a strict review band
(`review >= 0.975`, `possible >= 0.985`, `likely >= 0.99`) because uniform
humanitarian spreadsheets often have high baseline embedding similarity.

## Write Coordination Entity

Entities cover hospitals, shelters, aid centers, organizations, supply hubs,
official channels, and other public crisis resources. They may include
`audienceScope` such as `in_venezuela`, `outside_venezuela`, or `both`, plus
`countryCode` when a reviewed public projection needs cross-border grouping.
Public coordinates should be fuzzed or omitted when exposing exact location
would create risk.

## Write Restricted Child Protection Case

Child tracing cases are restricted case-management records, not public
missing-person listings. Hosted instances can accept private records shaped by
`ChildProtectionCaseRecordSchema`.

```json
{
  "record": {
    "eventId": "venezuela-earthquakes-2026",
    "source": "child-helpdesk",
    "externalId": "case-123",
    "intakeUrl": "https://child-helpdesk.example/intake",
    "status": "unaccompanied",
    "age": 9,
    "familyTracingConsentBasis": "child_protection_authority",
    "riskFlags": ["trafficking_risk"]
  }
}
```

Private child names, care locations, family details, caseworker contacts,
document identifiers, notes, and photo hashes must remain behind the restricted
instance boundary.

## Submit Restricted Relationship Claim

Adults or authorities searching for a child submit restricted relationship
claims. These are review inputs, not verified family relationships.

```json
{
  "claim": {
    "eventId": "venezuela-earthquakes-2026",
    "source": "child-helpdesk",
    "externalId": "claim-123",
    "intakeUrl": "https://child-helpdesk.example/intake",
    "claimantNamePrivate": "Private claimant",
    "claimedRelationshipPrivate": "mother",
    "claimantContactPrivate": "private contact",
    "submittedAt": "2026-06-26T13:00:00Z"
  }
}
```

Public or claimant-facing receipts should use redacted receipt status only.
Potential matches and child whereabouts require verified child protection
review.

## Badge Lookup

Badge lookup verifies a domain against a partner record and returns:

- `verified`, `stale`, or `unverified`
- verified scopes
- badge label
- verification timestamp
- reasons

Badges do not imply official endorsement.
