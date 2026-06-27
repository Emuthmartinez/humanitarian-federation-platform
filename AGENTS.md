# AGENTS.md

Guidance for AI coding agents and humans working in this repo.

## Project Overview

Humanitarian Federation Platform is a public, reusable foundation for crisis
data federation. It provides contracts and deterministic helpers that let
independent public surfaces read/write humanitarian records while preserving
source provenance, privacy boundaries, duplicate-review workflows, freshness
signals, verified partner badges, and public snapshot failover.

The first instance is Respuesta VE for the June 2026 Venezuela earthquakes, but
this repo must stay disaster-agnostic.

## Non-Negotiables

- Never expose precise private coordinates, contact details, national IDs,
  raw photo hashes, private notes, credentials, or partner API keys.
- Duplicate matching is advisory. Do not add code or docs that imply automatic
  identity merge, automatic resolution, or irreversible deletion.
- Keep source provenance on every federated record.
- Public snapshots are availability artifacts, not global truth ledgers. Clients
  and mirrors must verify `contentHash`, prefer newer trusted `sequence`
  values, and apply tombstones from the newest trusted snapshot.
- Keep machine fields stable across locales. Localize human-facing labels,
  warning messages, source names, badge labels, and public notes through
  snapshot `defaultLocale`/`locales` instead of changing enum values.
- Badges mean verified federation participation and scopes, not government or
  structural-safety endorsement.
- Prefer deterministic logic for write paths. LLMs may annotate or triage, but
  they must not silently mutate canonical records.

## Stack

- Package manager: `pnpm`
- Language: TypeScript, strict mode
- Runtime helpers: dependency-light, currently `zod` for validation
- Tests: Node `.mjs` tests that import built `dist` output

## Commands

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

## Repository Layout

```text
packages/federation-core/  Shared schemas and deterministic helpers
docs/                      Architecture and operator guidance
examples/                  Instance integration notes
```

Key docs for current federation surfaces:

- `docs/API_CONTRACT.md` for hosted API shapes.
- `docs/PUBLIC_SNAPSHOT.md` for normalized public datasets, mirrors,
  tombstones, hashes, and localized public copy.
- `examples/respuesta-ve/TERREMOTO_VENEZUELA_HANDOFF.md` for the Spanish
  Terremoto Venezuela partner handoff.

## Coding Conventions

- Keep helpers pure and deterministic unless a file explicitly documents an
  integration boundary.
- Whitelist public response shapes. Do not copy full input objects and delete
  private fields afterward.
- Validate external input with strict schemas.
- Use source-aware and event-aware identifiers; never assume a source-local id
  is globally unique by itself.
- Build public snapshot outputs from whitelisted redaction helpers. Do not
  serialize raw intake payloads, private record fields, or unrestricted source
  rows into snapshot responses.
- Keep `candidate_duplicate` and other review groups tied to coordinator review
  unless a coordinator-confirmed merge is explicitly modeled.
- Tests should cover privacy redaction, stale/conflict status handling,
  duplicate false positives, badge trust decisions, public snapshot hashing,
  tombstones, mirror metadata, and locale behavior.

## Documentation Conventions

- Say "candidate duplicate" or "review candidate" unless a coordinator-confirmed
  merge exists.
- Say "verified partner" or "federated partner" for badges. Do not say
  "official", "certified safe", or "government approved".
- Treat HXL as a legacy adapter/export concern, not the core platform schema.
- Keep Respuesta VE references inside examples or first-instance context.
- For Spanish-facing first-instance docs, preserve Spanish public copy. Use
  stable English machine enums in examples only where they are part of the API
  contract.

## Security

See [SECURITY.md](SECURITY.md). Public issues must not contain sensitive crisis
data. If an implementation would weaken redaction, trust, or source provenance,
stop and redesign before merging.

## Git

Use conventional commits. Keep changes focused. Run `pnpm test` before pushing.
