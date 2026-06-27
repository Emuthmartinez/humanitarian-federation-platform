# Roadmap

## Shipped In This Repo

- Public governance and contribution docs.
- Generic platform architecture and instance guide.
- Platform boundary and hosted-backend roadmap.
- `@humanitarian-federation/core` package with schemas, redaction, matching,
  status summaries, and badge trust checks.
- Restricted child protection tracing contracts, public-safe redaction, and
  scoped badge access checks.
- Respuesta VE first-instance notes and current production compatibility host
  guidance for `https://respuestave.org/api/v1`.

## Next

- Publish package to npm after first external consumer validates import shape.
- Add source adapter examples for PFIF, CAP alerts, and CSV/Sheets.
- Add JSON Schema/OpenAPI exports generated from the TypeScript contracts.
- Start the staged hosted backend extraction in
  [Hosted Backend Roadmap](HOSTED_BACKEND_ROADMAP.md), beginning with contract
  inventory and parity fixtures against the Respuesta VE compatibility host.
- Add a hosted source-aware ledger service after parity and security gates are
  defined.
- Add coordinator merge/split/review UI.
- Add restricted child case review UI and audit-log guidance.
- Add partner key issuance and badge registry service.
- Add sync workers and webhook/changefeed examples.

## Not Planned

- Government-only control of the federation.
- Automatic identity merges without review.
- Public exposure of private location or contact data.
