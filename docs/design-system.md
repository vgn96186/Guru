# Guru Design System — the one-page recipe

This is the whole system. If a pattern isn't here, ask before inventing.

## Tokens

| Token family | Source | Notes |
|---|---|---|
| Colors | `src/theme/linearTheme.ts` · `colors` | 6 semantic roles (`brand`, `capture`, `success`, `warning`, `danger`, `neutral`) — see `.roles` |
| Elevation | `src/theme/elevation.ts` | `e0` page · `e1` cards (default) · `e2` sheets/menus |
| Spacing | `linearTheme.spacing` | `xs 4 · sm 8 · md 16 · lg 24 · xl 32` |
| Density | `src/theme/density.ts` | `compact · comfortable (default) · spacious` |
| Type | `linearTheme.typography` via `<LinearText variant>` | 7 variants; **never** hand-roll fontSize/weight |
| Motion | `src/motion/presets.ts` | `motion.enter · motion.press · motion.pulseWarn` only |
| Icons | `src/components/primitives/Icon.tsx` | outlined default, filled=selected; sizes 14 / 18 / 22 |

## The three buttons

```tsx
<LinearButton variant="primary"   label="Start session" />      // brand CTA · one per screen
<LinearButton variant="secondary" label="Review later" />       // most buttons
<LinearButton variant="ghost"     label="Skip" />               // tertiary, inline
<LinearButton variant="primary"   tone="danger" label="Delete" /> // destructive
```

## The three surfaces

```tsx
<LinearSurface level="e1" />              // default card
<LinearSurface level="e1" interactive />  // card you can tap
<LinearSurface level="e2" />              // sheet, menu, modal
```

## Screen checklist

1. Page background is `elevation.e0.bg`. No gradients.
2. Header = `<LinearText variant="title">` + optional `variant="sectionTitle"` subtitle.
3. Cards use `<LinearSurface level="e1">` with `density.comfortable` padding.
4. **One** primary CTA per screen. Use `brand` role.
5. Empty states: `density.spacious`, one-line CTA, optionally `<Texture />` if FEATURE_TEXTURE.
6. Animate with a preset from `motion.*`, or not at all.
7. Every touchable meets `HIT_SIZE` (44pt). Use `hitSlop` to extend without bloating visuals.
8. Text contrast ≥ 4.5:1. Dev builds assert via `assertContrast()`.
9. `allowFontScaling` stays on. Don't hardcode `fontSize` outside `LinearText` variants.
10. No new tokens — extend `linearTheme` or density presets instead.

## What this replaces

Before → After

- Two themes in `constants/theme.ts` and `theme/linearTheme.ts` → one `linearTheme`, legacy re-exports
- 6 button variants → 3 + tone
- `LinearSurface` 4-layer glass → flat `elevation.e{0,1,2}`
- 11 type variants weighted 700–900 → 7 variants with real size contrast
- `TRANSCRIPT_BLUE` + ad-hoc accents → named roles
- Inline `Animated.timing` → `motion.*` presets

## Lint rules (enforce in CI)

```bash
# No legacy theme imports
grep -rn "from '.*constants/theme'" src/

# No deprecated button variants (all migrated — zero expected)
grep -rn "variant=\"glass\|variant=\"glassTinted\|variant=\"outline\|variant=\"danger\"" src/

# TRANSCRIPT_BLUE should trend toward roles.capture
grep -rn "TRANSCRIPT_BLUE" src/

# Inline Animated.timing should use motion.* presets
grep -rn "Animated\.timing" src/
```

## When to break the rules

Rarely, and in writing. Open an issue with `[design-system]` and link the
screen. If it lands, it goes in this doc.
