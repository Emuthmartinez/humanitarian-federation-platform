# Contributing

Thanks for helping build a safer federation layer for humanitarian response.
This is crisis software, so correctness and privacy matter more than cleverness.

## Before Opening An Issue

- Do not post private contact data, precise locations, national IDs, raw photos,
  credentials, tokens, API keys, or private operator details.
- If you run a crisis-response site, describe your public data shape, link-back
  policy, privacy constraints, and freshness needs.
- If you are reporting a vulnerability, use the private process in
  [SECURITY.md](SECURITY.md).

## Local Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Pull Requests

- Keep PRs focused.
- Include tests for new logic.
- Preserve advisory dedupe and reversible resolution semantics.
- Add docs when you introduce a new public contract, adapter, or trust rule.
- Do not introduce hosted-service behavior without documenting the operational
  model, security boundary, and instance migration path.

## Good First Contributions

- Adapter documentation for public crisis data formats.
- Examples for partner sites.
- Tests for false-positive duplicate cases.
- Documentation improvements around privacy, trust badges, and operations.

## Review Expectations

Reviewers should look for privacy leaks, source-provenance loss, stale-data
risks, overconfident merge language, and public badge wording that could imply
endorsement or official certification.
