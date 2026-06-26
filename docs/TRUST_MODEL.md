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

## Freshness

The default helper treats badge verification older than 30 days as stale. A
crisis instance may choose a shorter window for fast-moving response data.
