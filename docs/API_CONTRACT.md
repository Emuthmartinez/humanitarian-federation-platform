# API Contract

The package defines contracts that a hosted instance can expose over HTTP. The
current public proof is Respuesta VE's `/api/v1/*` routes; this document names
the generic shape.

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
only the filtered row text.

## Write Coordination Entity

Entities cover hospitals, shelters, aid centers, organizations, supply hubs,
official channels, and other public crisis resources. Public coordinates should
be fuzzed or omitted when exposing exact location would create risk.

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
