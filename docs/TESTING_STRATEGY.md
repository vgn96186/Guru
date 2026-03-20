# Testing strategy (Option 1 — comprehensive, maintainable)

This repo uses **two complementary layers**. Neither replaces the other.

## 1. Jest — logic & data layer (allowlist + thresholds)

**What counts for CI coverage gates:** only paths in `jest.unit.logic.config.js` (`collectCoverageFrom`).

| Included | Rationale |
|----------|-----------|
| `src/services/**` | Business logic, AI routing, sync, transcription |
| `src/db/**` | Persistence, queries, migrations touch via tests |
| `src/hooks/**` | Stateful behavior |
| `src/store/**` | Zustand stores |
| `src/schemas/**`, `src/config/**`, `src/constants/**` | Contracts & configuration |
| `src/navigation/**` | Linking / navigators (not individual screens) |
| `modules/**` | Expo module JS surface |

**Excluded from the gate (by design):** `src/screens/**`, most of `src/components/**` — they are poor value for line-coverage in Node and are covered by Detox instead.

### Commands

| Command | Purpose |
|---------|---------|
| `npm run test:unit` | Run all unit tests (no coverage) |
| `npm run test:unit:coverage` | Full `src/**` coverage report (informational; HTML in `coverage/`) |
| `npm run test:unit:coverage:logic` | **CI gate**: coverage + thresholds on **allowlist only** |

### Raising quality

Increase `coverageThreshold` in `jest.unit.logic.config.js` as tests improve. Do not chase 100% on the full tree in Jest.

---

## 2. Detox — device / integration (critical flows)

**What “covers” UI and native:** E2E tests under `e2e/*.test.ts`, configured in `.detoxrc.js`.

### Commands

| Command | Purpose |
|---------|---------|
| `npm run detox:build:android:emu:debug` | Build app + test APK (tablet profile) |
| `npm run detox:test:android:emu:debug` | Full Detox suite |
| `npm run detox:test:critical` | **Smaller** subset for smoke / PR checks (see `package.json`) |

Prerequisites: Android SDK, emulator (e.g. `Medium_Tablet`), and a successful build.

---

## 3. Recommended CI split

1. **Every PR:** `npm run verify:ci` — lint, unit tests, and **logic-layer coverage gate** (`jest.unit.logic.config.js`).
2. **When `tsc` is clean:** also run `npm run typecheck` (or `npm run verify:strict` for typecheck + the same test/coverage gate).
3. **Nightly or main branch:** `npm run detox:test:critical` or full Detox on emulator.

---

## Related docs

- `docs/UNIT_TESTING.md` — Jest conventions and mocks
- `e2e/` — Detox specs
- `.detoxrc.js` — device / build configuration
