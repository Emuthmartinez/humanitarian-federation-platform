# Trust Model

Trust is explicit, scoped, and reversible.

## Partner Verification

A verified partner has:

- a source id
- a public name
- verified domains
- allowed scopes
- a badge label
- a verification timestamp

Verification should be granted by trusted instance coordinators. It can expire
or be suspended.

## Scopes

Current scopes:

- `person:read`
- `person:write`
- `entity:read`
- `entity:write`
- `status:write`
- `badge:read`
- `child:case:write`
- `child:case:read_restricted`
- `child:claim:write`
- `child:claim:review`
- `child:reunification:write`

Instances may implement narrower local scopes, but public docs should never
tell a partner to use a privilege they do not need.

## Badge Meaning

A badge means:

- the domain is recognized for the partner
- the partner participates in federation
- the listed scopes were granted
- verification is fresh enough to show publicly

A badge does not mean:

- government endorsement
- structural safety certification
- source data is always correct
- the site may publish private data

## Child Protection Scopes

Child protection scopes are restricted operational grants. A partner with
ordinary `person:*` scopes must not receive child case reads unless it also has
`child:case:read_restricted` and a fresh verified badge for the requesting
domain. Relationship-claim review requires `child:claim:review`.

Use `assessPartnerScopes` to fail closed when a verified badge is stale,
unverified, or missing one of the required child scopes.

## Freshness

The default helper treats badge verification older than 30 days as stale. A
crisis instance may choose a shorter window for fast-moving response data.
