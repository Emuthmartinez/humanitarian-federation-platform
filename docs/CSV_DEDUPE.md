# CSV Dedupe

Use the CSV dedupe command when a partner has a spreadsheet of people and needs
a fast local review list. The command streams the CSV, validates rows into the
native person schema, builds deterministic candidate blocks, and writes
candidate duplicate pairs for coordinator review.

It never merges records. The output is an internal review queue, not a public
response and not a source of automatic identity resolution.

## Quick Run

```bash
pnpm install
pnpm --filter @humanitarian-federation/core build
pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
  --event-id venezuela-earthquakes-2026 \
  --source volunteer-sheet \
  --identifier-country-code VE \
  --output review-candidates.csv \
  --groups-output candidate-person-groups.json \
  --rejects rejected-rows.csv
```

Use `-` instead of a file path to read CSV from stdin.

The candidate CSV includes row numbers, source-aware ids, names, score,
confidence, method, reason, and `recommended_action=coordinator_review`.
It does not include raw national IDs, passport numbers, contact details, notes,
photo hashes, or private locations.

The group JSON clusters connected candidate rows into `candidate_person_group`
objects. Each group preserves `sourceRefs` so reviewers can see which source
rows contributed to the candidate person without treating the group as a
confirmed merge.
Use `--source-ref-column` for restricted provenance columns, such as `Fuentes`,
that should stay attached to group members but should not become the canonical
federation `source`.

## Expected Columns

The command recognizes common headers automatically:

- `name`, `full_name`, `display_name`
- `age`
- `state`, `province`, `region`, `admin1`
- `city`, `municipality`, `district`, `admin2`
- `external_id`, `record_id`, `source_id`
- `source_url`, `url`, `link`
- `national_id`, `cedula`, `dni`, `passport`
- `photo_hash`
- `status`

When a sheet uses different headers, map them explicitly:

```bash
pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
  --event-id local-event \
  --source partner-a \
  --column displayName="Nombre completo" \
  --column externalId="ID de registro" \
  --column admin2="Municipio" \
  --column nationalId="Cedula" \
  --output review-candidates.csv
```

Hospital-style Spanish sheets with split names can be handled directly:

```bash
pnpm --filter @humanitarian-federation/core dedupe:csv -- personas.csv \
  --event-id local-event \
  --source hospital-sheet \
  --identifier-country-code VE \
  --ignore-status \
  --column admin2="Hospital" \
  --source-ref-column Fuentes \
  --output review-candidates.csv \
  --groups-output candidate-person-groups.json \
  --rejects rejected-rows.csv
```

`--ignore-status` is for source workflow columns such as `Confirmado` or
`Por confirmar`. Do not use it when the CSV column already contains platform
person statuses such as `missing`, `found_injured`, or `deceased`.

## Large Files

The command avoids all-pairs comparison. It compares rows only when they share
a deterministic block key, such as a normalized strong identifier, photo hash,
exact normalized full name, or name plus age/locality bucket.

Use `--max-bucket-size` to keep very common blocks from producing huge review
queues. Oversized blocks are skipped and reported in the command summary.

```bash
pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
  --event-id local-event \
  --source partner-a \
  --max-bucket-size 500 \
  --output review-candidates.csv
```

## Review Rules

- Treat every output row as a candidate duplicate or review candidate.
- Keep the review CSV restricted to coordinators because names may be present.
- Do not publish rejected-row files if source headers or errors reveal private
  intake structure.
- Confirm merges only in an instance workflow that preserves source provenance
  and can split records again after a bad merge.
- Use embeddings only as a second-pass triage aid for messy text-heavy rows;
  deterministic candidate matching remains the safe default for write paths.

## API Use

Hosted instances can call `dedupeCsvPersonCsvText(csvText, options)` from
`@humanitarian-federation/core` to return the same JSON review queue used by the
CLI, including `groups` for candidate people and `sourceRefs` for row/source
traceability. Keep the endpoint authenticated, size-limited, and restricted to
coordinators or verified partners.
