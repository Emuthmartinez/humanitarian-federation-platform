# Instance Guide

An instance is a deployed crisis-response surface that uses the platform
contracts and helpers.

## Responsibilities

Each instance owns:

- local UX and language
- authentication and responder/coordinator roles
- database and RLS/security model
- moderation workflows
- source partner onboarding
- public API deployment
- operational monitoring

The platform repo owns shared contracts, docs, and deterministic helpers.

## Minimum Public Metadata

Publish an instance manifest with only public information:

```json
{
  "platform": "humanitarian-federation-platform",
  "instance": "respuesta-ve",
  "eventId": "venezuela-earthquakes-2026",
  "publicUrl": "https://respuestave.org",
  "apiBaseUrl": "https://respuestave.org/api/v1",
  "domains": ["respuestave.org"]
}
```

Do not include credentials, coordinator account details, private database ids,
or incident-response contact details in the public manifest.

## First Instance

Respuesta VE is the first instance. It proves the model for the June 2026
Venezuela earthquakes while this repo keeps the reusable pieces generic.
