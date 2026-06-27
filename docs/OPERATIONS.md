# Operations

This repo currently ships a library and docs, so operational burden is limited.
Instances that deploy APIs or sync workers should add their own runbooks.

## Suggested Instance Checks

- Validate every partner write with strict schemas.
- Rate-limit write APIs by partner key and IP where appropriate.
- Keep public reads on redacted views or projection helpers.
- Monitor rejected validation payloads.
- Monitor stale source update clocks.
- Monitor public snapshot generation, mirror fetch success, hash verification,
  and sequence freshness.
- Alert coordinators on status conflicts where one source marks a person found
  while another source still lists them missing.
- Rotate partner keys and badge verification timestamps.
- For child tracing, alert on repeated relationship claims, broad searches
  across many children, stale child scopes, and any attempt to expose restricted
  child fields publicly.

## Incident Response

If private data is exposed:

1. Remove or disable the public surface.
2. Preserve audit logs.
3. Rotate affected credentials.
4. Notify affected partners through private channels.
5. Patch the redaction or authorization boundary before re-enabling.

For child protection data exposure, also suspend child case reads for affected
partners until a coordinator reviews access logs and rotates relevant partner
keys.

## Release Checks

Run:

```bash
pnpm build
pnpm test
```

For package releases, verify generated `dist` output and update docs for any
contract changes.
