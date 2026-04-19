# Syllabus seed data

Authoritative source: `assets/syllabus/topics/<shortCode>.json` (one per subject) + `src/constants/syllabus/subjects.ts`.

Legacy (removed): `src/constants/syllabus.ts` — a 76,714-line monolith. Do not revive.

## Editing topics

Edit the JSON file for the target subject, e.g. `assets/syllabus/topics/anat.json`. Each row is a tuple:

```
[subject_id, name, inicet_priority (1-10), estimated_minutes, parent_name?]
```

`parent_name`, when present, must exist as a `name` in the **same subject**. This is enforced by `src/constants/syllabus.unit.test.ts`.

After editing, regenerate the snapshot fingerprint so CI accepts the intentional change:

```bash
npm run syllabus:snapshot
git add src/constants/syllabus.snapshot.json
```

## Splitting / regenerating JSON from an in-memory array

`split-topics.ts` is kept as a round-trip tool. Given a `TOPICS_SEED` array in-scope, it groups by `subject_id` (preserving original emission order) and writes per-subject JSON + `assets/syllabus/manifest.json`. Runs a reconstruction-hash check and aborts on mismatch.

```bash
npm run syllabus:split
```

It currently reads from `src/constants/syllabus/index.ts`, so re-running it after a topics edit is a no-op round-trip (useful to reformat or rebuild the manifest).

## Invariants

- Hash of `JSON.stringify(TOPICS_SEED)` matches `src/constants/syllabus.snapshot.json`.
- 19 subjects, unique ids + shortCodes.
- No orphan topics (`subject_id` must exist in `SUBJECTS_SEED`).
- No dangling parent links within a subject.
- Tuple shape strictly `[number, string, number, number, string?]`, length 4 or 5.

CI: `npm run verify:ci` runs the characterization test and will fail on any drift.
