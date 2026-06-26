# AGENTS.md

Guidance for AI coding agents and humans working in this repo.

## Project Overview

Humanitarian Federation Platform is a public, reusable foundation for crisis
data federation. It provides contracts and deterministic helpers that let
independent public surfaces read/write humanitarian records while preserving
source provenance, privacy boundaries, duplicate-review workflows, freshness
signals, and verified partner badges.

The first instance is Respuesta VE for the June 2026 Venezuela earthquakes, but
this repo must stay disaster-agnostic.

## Non-Negotiables

- Never expose precise private coordinates, contact details, national IDs,
  raw photo hashes, private notes, credentials, or partner API keys.
- Duplicate matching is advisory. Do not add code or docs that imply automatic
  identity merge, automatic resolution, or irreversible deletion.
- Keep source provenance on every federated record.
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

## Coding Conventions

- Keep helpers pure and deterministic unless a file explicitly documents an
  integration boundary.
- Whitelist public response shapes. Do not copy full input objects and delete
  private fields afterward.
- Validate external input with strict schemas.
- Use source-aware and event-aware identifiers; never assume a source-local id
  is globally unique by itself.
- Tests should cover privacy redaction, stale/conflict status handling,
  duplicate false positives, and badge trust decisions.

## Documentation Conventions

- Say "candidate duplicate" or "review candidate" unless a coordinator-confirmed
  merge exists.
- Say "verified partner" or "federated partner" for badges. Do not say
  "official", "certified safe", or "government approved".
- Treat HXL as a legacy adapter/export concern, not the core platform schema.
- Keep Respuesta VE references inside examples or first-instance context.

## Security

See [SECURITY.md](SECURITY.md). Public issues must not contain sensitive crisis
data. If an implementation would weaken redaction, trust, or source provenance,
stop and redesign before merging.

## Git

Use conventional commits. Keep changes focused. Run `pnpm test` before pushing.
