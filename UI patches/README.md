# Guru — UI System Patch Bundle

Twelve unified-diff patches implementing every item in the UI audit.
Targets: the `debug/` repo you shared (React Native · Expo · Guru v1.0.0).

## Apply

From your repo root:

```bash
git checkout -b design-system-migration
git am /path/to/patches/*.patch
# or, if you'd rather review first:
git apply --check patches/0001-*.patch && git apply patches/0001-*.patch
```

All patches are `-p1` style (paths start at `src/` / `docs/`). Use
`git apply -p1` if needed.

## Order matters

1–5 are mechanical foundations; land them together in one PR. 6–11 are
independent quality lifts that can ship one per PR. 12 is the final
cleanup — **do not land it until the `__DEV__` deprecation warnings from
patch 05 have gone quiet** (typically two sprints after 1–5 land).

| # | Title | Depends on | Est. |
|---|---|---|---|
| 01 | `tokens-legacy-theme-shim` | — | 1d |
| 02 | `color-accent-roles` | 01 | 0.5d |
| 03 | `elevation-retire-linear-surface` | 01 | 1d |
| 04 | `type-ramp` | 02 | 0.5d |
| 05 | `button-collapse-variants` | 01, 02 | 1d |
| 06 | `hero-card-single-fact` | 03, 04 | 0.5d |
| 07 | `icons-vocabulary` | — | 0.5d |
| 08 | `density-tiers` | 01 | 0.5d |
| 09 | `motion-presets` | — | 0.5d |
| 10 | `a11y-hit-size-contrast` | 01 | 0.5d |
| 11 | `texture-feature-flag` | 03 | 0.5d |
| 12 | `governance-cleanup` | 01–11 | 0.5d |

## After landing 01–05

Run the repo-wide greps below and migrate call sites. None of these
should be zero immediately — the shims keep old code compiling — but
each should trend toward zero.

```bash
# Legacy theme imports
grep -rn "from '.*constants/theme'" src/

# Deprecated button variants
grep -rnE "variant=\"(glass|glassTinted|outline|danger)\"" src/

# TRANSCRIPT_BLUE → roles.capture
grep -rn "TRANSCRIPT_BLUE" src/

# Inline Animated.timing (should → motion.* presets)
grep -rn "Animated\.timing" src/
```

## Patches that touch files I didn't read

Patch 11 (`Texture.tsx` + `FEATURE_TEXTURE` in `appConfig.ts`) appends to
`appConfig.ts`. If the file doesn't already exist at that path, apply
manually or create it first. The Texture component also assumes
`react-native-svg` is installed (it is, if you're using Expo SDK ≥ 49).

## One-page spec

The patch bundle produces `docs/design-system.md` (patch 12). That file
is the authoritative recipe for new screens going forward — the audit
HTML is reference material.

---

Questions / gotchas while applying: open an issue tagged
`[design-system]`, or reply here with the failing hunk and I'll re-cut.
