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

## Write Coordination Entity

Entities cover hospitals, shelters, aid centers, organizations, supply hubs,
official channels, and other public crisis resources. Public coordinates should
be fuzzed or omitted when exposing exact location would create risk.

## Badge Lookup

Badge lookup verifies a domain against a partner record and returns:

- `verified`, `stale`, or `unverified`
- verified scopes
- badge label
- verification timestamp
- reasons

Badges do not imply official endorsement.
