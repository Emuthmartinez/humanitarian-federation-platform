# Respuesta VE Instance

Respuesta VE is the first public instance proving this platform.

- Public site: [respuestave.org](https://respuestave.org)
- Public repo: [github.com/Emuthmartinez/respuesta-ve](https://github.com/Emuthmartinez/respuesta-ve)
- API base: `https://respuestave.org/api/v1`

## What It Implements

- Public damage map and anonymous reports.
- Verified responder workflows.
- Federated missing-person search and status sync.
- Crisis entities: hospitals, shelters, organizations, donation centers, supply
  hubs, and current needs.
- Verified partner badges.
- Public data intake for volunteer submissions and scrape targets.
- Public normalized snapshot for partner frontends and mirrors.

For a Spanish partner-facing integration note, see
[Handoff para Terremoto Venezuela](TERREMOTO_VENEZUELA_HANDOFF.md).

## Discord Intake Snippet

Tell volunteers they can send any JSON shape to the public intake endpoint:

```bash
curl -X POST https://respuestave.org/api/v1/public-intake \
  -H 'content-type: application/json' \
  --data '{
    "source": "discord:respuesta-ve",
    "sourceRecordId": "discord:respuesta-ve:message-123",
    "contentFingerprint": "sha256:...",
    "submittedBy": "@your-discord-handle",
    "contact": "where coordinators can reply privately",
    "kind": "mixed",
    "processingHints": {
      "dedupeMode": "candidate_review_not_auto_merge",
      "promotionPath": "/api/v1/persons",
      "cleanupPipeline": ["extract_rows", "normalize_person", "match_person"]
    },
    "canonicalCandidates": [
      {
        "kind": "person",
        "externalId": "discord:respuesta-ve:message-123:row-1",
        "externalUrl": "https://example.org/source-row",
        "record": {
          "displayName": "Ana Araujo",
          "admin1": "La Guaira",
          "status": "missing"
        }
      }
    ],
    "note": "Scrape/process this for Respuesta VE",
    "data": {
      "url": "https://example.org/sheet-or-post",
      "anything": "paste rows, lists, screenshots links, hospital needs, people, shelters, etc."
    },
    "files": [
      {
        "name": "hospitales.csv",
        "type": "text/csv",
        "text": "name,state\nHospital Central,Lara"
      }
    ]
  }'
```

Use canonical write-contract field names inside `canonicalCandidates.record`,
such as `displayName` and `admin1`, even when the source data arrives with
Spanish labels.

The endpoint returns a receipt only; the data goes into restricted operator
review and is not published, merged, or treated as verified until it is
processed. Poll the receipt until it is promoted, ignored, or marked spam:

```bash
curl -s "https://respuestave.org/api/v1/public-intake?id=<receipt-id>"
```

Once an operator promotes the submission into normalized public records,
partners fetch the canonical truth through the normal cursor feeds:

```bash
curl -s "https://respuestave.org/api/v1/persons/changes?since=2026-06-27T00:00:00Z" \
  -H "authorization: Bearer <partner-api-key>"

curl -s "https://respuestave.org/api/v1/entities/changes?since=2026-06-27T00:00:00Z" \
  -H "authorization: Bearer <partner-api-key>"
```

## Outside-Venezuela Resources

Centros de acopio in the USA, donation links, public WhatsApp lines, and
diaspora resource posts should be sent as `kind: "entity"` leads with
`audienceScope: "outside_venezuela"`. Use `donation_center` or `supply_hub` for
physical drop-off points, `organization` or `official_channel` for resource
pages, `supply_dropoff` for drop-off instructions, and `donation_url` for money
links. Keep source URLs on every candidate so operators can verify before
publishing.

```json
{
  "source": "discord:respuesta-ve",
  "sourceRecordId": "discord:respuesta-ve:usa-acopio-doral",
  "kind": "entity",
  "audienceScope": "outside_venezuela",
  "canonicalCandidates": [
    {
      "kind": "entity",
      "externalId": "discord:respuesta-ve:usa-acopio-doral",
      "sourceUrl": "https://example.org/source-post",
      "entity": {
        "kind": "donation_center",
        "name": "Centro de acopio Doral",
        "estado": "Estados Unidos",
        "municipio": "Doral, FL",
        "channels": [
          {
            "type": "supply_dropoff",
            "displayText": "Recibe insumos medicos, agua, comida e higiene"
          }
        ],
        "needs": [
          { "category": "medical_supplies", "title": "Primeros auxilios" },
          { "category": "food", "title": "Alimentos no perecederos" }
        ]
      }
    }
  ],
  "data": {
    "countryCode": "US",
    "originalPost": "Texto, filas o enlaces originales para revision"
  }
}
```

After operators promote reviewed resources, partner frontends can render a
card-ready public projection with `handleResourceViewEndpointRequest`:

```text
POST /api/v1/resources/view
```

Use it for `/apoyo-global`, `/coordinacion`, and failover mirrors that need the
same public-safe grouping across outside support, in-country hospitals, needs,
donation links, acopio centers, organizations, and safe hospital-patient
signals. The view groups resources into `outside_venezuela`, `in_venezuela`,
`needs`, `health_and_patients`, and `support_channels`, fuzzes coordinates, and
does not expose private addresses, private contacts, raw notes, photo data, or
restricted intake fingerprints.

## Public Snapshot And Mirrors

For public frontend handoff and provider failover, publish the redacted
normalized snapshot:

```bash
curl -s "https://terremotovenezuela.org/api/v1/public-snapshot.json"
```

The snapshot should include public person records, advisory person groups that
match the `/personas` card model, public coordination entities, source labels,
mirror URLs, public tombstones, and a deterministic `contentHash`. Mirrors cache
the latest verified sequence and can serve the same artifact if the primary
provider goes down. Clients must keep `candidate_duplicate` groups as review
candidates; they are not confirmed merges.

## Boundary

Respuesta VE owns the Venezuela-specific deploy, UX, Supabase schema, and
operational details. This platform repo owns reusable contracts and helpers.
