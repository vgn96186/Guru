# FSRS Fix Plan — Wire Real Scheduling into ReviewScreen

## Problem

`ReviewScreen.tsx` uses hardcoded intervals (`Again=1d, Hard=3d, Good=7d, Easy=14d`) and manually sets `status` based on confidence. It **bypasses** the FSRS algorithm entirely, even though:

- `fsrsService.ts` has a working FSRS engine (`ts-fsrs`)
- `updateTopicProgressInTx()` in `topics.ts` **already accepts and writes** FSRS fields
- `getTopicsDueForReview()` queries by `fsrs_due <= today`
- The DB schema has all FSRS columns

So the FSRS pipeline is built end-to-end **except** the ReviewScreen — the primary user-facing review flow — which doesn't use it.

## What Changes (3 files, ~40 lines total)

### 1. `src/screens/ReviewScreen.tsx` — Remove hardcoded intervals, use FSRS

**Current (broken):**

```ts
const RATINGS = [
  { label: 'Again', days: 1, confidence: 1, color: ... },
  { label: 'Hard',  days: 3, confidence: 2, color: ... },
  { label: 'Good',  days: 7, confidence: 3, color: ... },
  { label: 'Easy',  days: 14, confidence: 4, color: ... },
];

// In handleRate():
await updateTopicProgress(
  currentTopic.id,
  newConf >= 4 ? 'mastered' : newConf >= 2 ? 'reviewed' : 'seen',
  newConf,
  xp,
);
```

**Fix:** Replace `RATINGS` with labels that derive their `days` display from the actual FSRS card:

```ts
const RATINGS = [
  { label: 'Again', confidence: 1, color: n.colors.error },
  { label: 'Hard', confidence: 2, color: n.colors.warning },
  { label: 'Good', confidence: 3, color: n.colors.success },
  { label: 'Easy', confidence: 4, color: n.colors.accent },
];
```

Remove the `days` field. Instead, when the card flips, compute the **FSRS-scheduled days** for each rating and show them on the buttons:

```ts
// After fetching the topic, build a preview of next-review intervals
const [fsrsIntervals, setFsrsIntervals] = useState<Record<string, number>>({});

// In the useEffect that loads currentTopic:
const card = buildFsrsCard(currentTopic); // reads fsrs_* fields from progress
const logs = f.repeat(card, new Date());
setFsrsIntervals({
  Again: logs[Rating.Again].card.scheduled_days,
  Hard: logs[Rating.Hard].card.scheduled_days,
  Good: logs[Rating.Good].card.scheduled_days,
  Easy: logs[Rating.Easy].card.scheduled_days,
});
```

The rating buttons then display: `Again (1d)`, `Good (5d)`, etc. — **real FSRS values**.

In `handleRate()`, remove the manual `status` computation. Instead, derive status from the FSRS card's `state`:

```ts
async function handleRate(rating: (typeof RATINGS)[0]) {
  const card = buildFsrsCard(currentTopic);
  const log = reviewCardFromConfidence(card, rating.confidence);
  const fsrsCard = log.card;

  // Map FSRS state to app status
  const status =
    fsrsCard.state === State.Learning
      ? 'seen'
      : fsrsCard.stability >= 21
      ? 'mastered' // 3+ weeks stability
      : 'reviewed';

  await updateTopicProgress(currentTopic.id, status, rating.confidence, xp);
  // ... rest unchanged
}
```

### 2. `src/db/queries/topics.ts` — Ensure `updateTopicProgressInTx` is called correctly

**No changes needed.** The function already:

1. Reads existing FSRS fields from DB
2. Constructs a `Card` object
3. Calls `reviewCardFromConfidence()` to get the FSRS-scheduled card
4. Writes all FSRS fields (`fsrs_due`, `fsrs_stability`, etc.)
5. Sets `next_review_date` from the FSRS `due` date

The only issue is that `ReviewScreen` passes a manually computed `status` and `confidence` that don't reflect FSRS. Once ReviewScreen sends the right `confidence` (1-4), the DB layer already does the right thing.

### 3. `src/services/fsrsService.ts` — Export the `f` instance (or add a helper)

Add a small helper to preview intervals without mutating state:

```ts
export function previewIntervals(card: Card, now: Date = new Date()) {
  const logs = f.repeat(card, now);
  return {
    Again: logs[Rating.Again].card.scheduled_days,
    Hard: logs[Rating.Hard].card.scheduled_days,
    Good: logs[Rating.Good].card.scheduled_days,
    Easy: logs[Rating.Easy].card.scheduled_days,
  };
}
```

This lets the ReviewScreen show "Good → in 5 days" **before** the user rates, which is important UX.

## What Does NOT Change

- **DB schema** — no new columns, no migrations
- **`getTopicsDueForReview()`** — already queries `fsrs_due <= today` correctly
- **`fsrsService.ts` core** — `getInitialCard()`, `reviewCard()`, `reviewCardFromConfidence()` stay as-is
- **`fsrsHelpers.ts`** — `mapConfidenceToRating()` and `selectReviewLogByConfidence()` stay as-is
- **No new dependencies** — `ts-fsrs` is already installed
- **No new files** — 3 existing files, targeted edits
- **Lecture pipeline** — unaffected, already uses FSRS correctly via `markTopicAsStudied()`
- **Daily agenda / planning** — unaffected

## Migration Risk: None

This is a **purely additive** fix. Existing topics that were reviewed with hardcoded intervals will simply start using FSRS from their current state. The FSRS engine handles cards with zero history gracefully (it starts with default stability/difficulty). No data loss, no migration needed.

## Testing

1. Open ReviewScreen with a due topic → verify rating buttons show FSRS-computed intervals
2. Rate "Good" → verify `fsrs_due` is updated to the FSRS-scheduled date
3. Rate "Again" → verify card goes back to learning state (short interval)
4. Pull up the same topic tomorrow → verify it appears due again only if `fsrs_due <= today`
5. Verify `topic_progress.status` reflects FSRS state correctly (not stuck on 'seen')

## Files Changed

| File                           | Lines Changed | What                                                                      |
| ------------------------------ | ------------- | ------------------------------------------------------------------------- |
| `src/screens/ReviewScreen.tsx` | ~25           | Remove hardcoded days, add FSRS interval preview, derive status from FSRS |
| `src/services/fsrsService.ts`  | ~10           | Add `previewIntervals()` helper                                           |
| `src/db/queries/topics.ts`     | 0             | No changes needed                                                         |

**Total: ~35 lines across 2 files.**
