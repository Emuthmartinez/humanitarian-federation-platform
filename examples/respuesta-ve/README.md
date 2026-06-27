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
- No-key public data intake for volunteer submissions and scrape targets.

## Discord Intake Snippet

Tell volunteers they can send any JSON shape to the no-key intake endpoint:

```bash
curl -X POST https://respuestave.org/api/v1/public-intake \
  -H 'content-type: application/json' \
  --data '{
    "source": "discord:respuesta-ve",
    "submittedBy": "@your-discord-handle",
    "contact": "where coordinators can reply privately",
    "kind": "mixed",
    "note": "Scrape/process this for Respuesta VE",
    "data": {
      "url": "https://example.org/sheet-or-post",
      "anything": "paste rows, lists, screenshots links, hospital needs, people, shelters, etc."
    }
  }'
```

The endpoint does not require an API key. It returns a receipt only; the data
goes into restricted operator review and is not published, merged, or treated as
verified until it is processed.

## Boundary

Respuesta VE owns the Venezuela-specific deploy, UX, Supabase schema, and
operational details. This platform repo owns reusable contracts and helpers.
