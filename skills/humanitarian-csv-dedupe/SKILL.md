# Humanitarian CSV Dedupe

Use this skill when an operator has a CSV or spreadsheet export of people and
wants duplicate review candidates from this repository.

## Rules

- Produce candidate duplicates only. Never call the output a merge, resolution,
  or confirmed identity cluster.
- Keep names, rejected rows, and source row numbers restricted to coordinators.
- Do not print raw national IDs, passport numbers, contact details, private
  notes, photo hashes, precise coordinates, or child protection details.
- Prefer the deterministic CSV command first. Use embeddings only as an
  optional second pass for messy text-heavy sheets after sensitive columns are
  excluded.

## Workflow

1. Inspect the CSV headers without dumping private rows.
2. Build the package:

   ```bash
   pnpm --filter @humanitarian-federation/core build
   ```

3. Run the deterministic candidate generator:

   ```bash
   pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
     --event-id local-event \
     --source partner-sheet \
     --output review-candidates.csv \
     --groups-output candidate-person-groups.json \
     --rejects rejected-rows.csv
   ```

4. If headers are not recognized, add explicit mappings:

   ```bash
   pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
     --event-id local-event \
     --source partner-sheet \
     --column displayName="Full Name" \
     --column externalId="Record ID" \
     --column admin2="Municipality" \
     --column nationalId="National ID" \
     --output review-candidates.csv
   ```

5. For Spanish hospital sheets with `Nombre`, `Apellido`, `CI`, `Edad`,
   `Hospital`, and workflow `Status` values such as `Confirmado`, use:

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

6. For large common-name buckets, lower the block cap:

   ```bash
   pnpm --filter @humanitarian-federation/core dedupe:csv -- people.csv \
     --event-id local-event \
     --source partner-sheet \
     --max-bucket-size 500 \
     --output review-candidates.csv
   ```

7. Use `candidate-person-groups.json` when the reviewer wants one candidate
   person with all contributing source rows preserved. The group file contains
   `sourceRefs` and `members`; it is still advisory, not a confirmed merge.
   Use `--source-ref-column` for restricted provenance columns that need to stay
   attached to group members.

8. Hosted APIs should call `dedupeCsvPersonCsvText(csvText, options)` to return
   the same JSON review queue as the CLI. Keep that endpoint authenticated,
   size-limited, and coordinator/partner restricted.

9. Hand back counts, output paths, rejected-row counts, and any oversized-block
   warning. Do not paste candidate rows into chat unless the operator explicitly
   requests a restricted sample.

## Reference

Read `docs/CSV_DEDUPE.md` for the operator-facing contract and accepted column
aliases.
