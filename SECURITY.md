# Security Policy

## Reporting A Vulnerability

Do not open public issues for vulnerabilities or sensitive crisis data. Use
GitHub private vulnerability reporting if enabled. If it is not available, email
`api@respuestave.org` with `[SECURITY]` in the subject and a short impact
summary.

## Sensitive Data

Treat these as sensitive:

- Precise coordinates for people, shelters, medical sites, aid centers, and
  responder operations when they are not explicitly public.
- Private contact details.
- National IDs, passport numbers, and other identity documents.
- Raw photo hashes and raw images for missing-person records.
- Management tokens, API keys, worker secrets, and database credentials.
- Private notes from coordinators, responders, or source partners.

## Security Expectations

- Public projections must be whitelisted and redacted.
- Source write APIs must be scoped and rate-limited by the consuming instance.
- Badge verification must be domain-bound and time-bound.
- Dedupe and resolution actions must be auditable and reversible.
- LLM annotation output must never be the silent canonical writer.

## Response Priorities

Highest priority goes to issues that can expose vulnerable people, publish
private locations, bypass redaction, mutate canonical records without
authorization, or falsely mark a missing person as resolved.
