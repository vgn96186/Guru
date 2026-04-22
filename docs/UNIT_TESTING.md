# Unit tests & coverage

See **`docs/TESTING_STRATEGY.md`** for the full model (Jest logic allowlist + Detox). This file is the quick reference.

## Commands

| Command                            | Description                                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------------------------- |
| `npm run test:unit`                | Run all `*.unit.test.ts(x)` files under `src/`                                               |
| `npm run test:unit:coverage`       | Full-tree Istanbul report → `coverage/` (informational)                                      |
| `npm run test:unit:coverage:logic` | **CI gate**: coverage + thresholds on **logic allowlist** only (`jest.unit.logic.config.js`) |

## Conventions

- Test files: `**/*.unit.test.ts` or `**/*.unit.test.tsx` (see `jest.unit.config.js`).
- Shared mocks: `jest.setup.js`, `__mocks__/`, `moduleNameMapper` in `jest.unit.config.js`.

## Coverage gates

Thresholds live in **`jest.unit.logic.config.js`**, not the default Jest config. Screens are intentionally excluded from that gate; use Detox for UI/native confidence.
