# Primitive Polish Pass — Design Spec

**Date:** 2026-04-04  
**Scope:** Core UI primitives plus shared chrome that defines the app-wide visual language  
**Goal:** Make the glassmorphic Linear theme feel consistent and premium before migrating more screens.

## Problem

The app already has a `linearTheme` and primitive layer, but the visual language is still inconsistent.

- Some primitives still read as solid dark cards instead of frosted glass.
- Some shared chrome bypasses primitives and paints custom opaque shells.
- A few reusable components still inject old-style pills, badges, and alerts into otherwise migrated screens.

This makes screen-by-screen migration slower because the foundation itself is not fully aligned.

## Non-Goals

- No full screen migrations in this pass.
- No navigation or information architecture changes.
- No API redesign unless a tiny prop addition is required to avoid duplication.
- No large behavior changes to interactions beyond visual polish and consistency.
- No new blur libraries, runtime-heavy effects, or extra visual dependencies.
- No downstream screen touchups except where a target shared component cannot preserve its current contract.

## Recommended Approach

Use a primitive-first normalization pass.

1. Polish the true primitives so glass surfaces, controls, and typography follow one system.
2. Update shared chrome to consume that system instead of custom opaque styling.
3. Keep changes API-light so existing screens benefit immediately without broad refactors.

This is the best balance between visible improvement and regression risk.

## Target Files

### Core primitives

- `src/theme/linearTheme.ts`
- `src/components/primitives/LinearSurface.tsx`
- `src/components/primitives/LinearButton.tsx`
- `src/components/primitives/LinearBadge.tsx`
- `src/components/primitives/LinearDivider.tsx`
- `src/components/primitives/LinearTextInput.tsx`
- `src/components/primitives/LinearText.tsx`

### Shared chrome / visual building blocks

- `src/components/BannerSearchBar.tsx`
- `src/components/ScreenBannerFrame.tsx`
- `src/components/ScreenHeader.tsx`
- `src/components/Toast.tsx`
- `src/components/TopicPillRow.tsx`
- `src/components/SubjectCard.tsx`
- `src/components/SubjectSelectionCard.tsx`

## Visual Rules

### Surfaces

- Surfaces should feel like layered glass, not solid matte cards.
- Depth should come from border, top-edge highlight, internal gradient, and subtle tinting.
- Avoid shadow-led depth for standard surfaces.
- Compact and default surface densities should remain distinct and consistent.

### Controls

- Buttons, badges, pills, and inputs should share border treatment and pressed-state logic.
- Accent states should tint the glass instead of replacing it with dense blocks of color.
- Danger, warning, and success states should remain readable without breaking the surface system.

### Typography

- Reuse `LinearText` variants and theme tokens consistently.
- Shared chrome should stop relying on ad hoc font sizing where a theme variant exists.

## Component-by-Component Plan

### `linearTheme`

- Normalize surface-related tokens so components stop mixing token-based colors with hardcoded dark fills.
- Tighten border/highlight/tint values so the system reads as one family.
- Keep token names stable unless a missing token is clearly necessary.
- Cap token churn: prefer adjusting existing tokens; add new tokens only for a cross-component need that appears in at least two target components.

### `LinearSurface`

- Polish the glass treatment itself:
  - softer base fill
  - cleaner frost layer
  - more deliberate top-edge highlight
  - consistent compact/default padding and radius behavior
- Preserve the current public API.

### `LinearButton`

- Reduce reliance on shadows for `glass` variants.
- Make `ghost`, `outline`, `glass`, and `glassTinted` feel like related controls instead of separate systems.
- Align pressed/disabled states with `linearTheme.alpha`.

### `LinearBadge`

- Ensure default, accent, warning, success, and error variants all read as glass-tinted badges.
- Avoid opaque pill styling.

### `LinearDivider`

- Make separators subtle and consistent inside grouped surfaces.
- Prefer token-driven transparency over ad hoc line colors.

### `LinearTextInput`

- Align input shell, border, placeholder, focus, and disabled states with the glass system.
- Preserve existing ergonomics and accessibility.

### Shared chrome

#### `BannerSearchBar`

- Replace the hardcoded opaque shell with a primitive-aligned surface treatment.
- Keep search ergonomics unchanged.
- Preserve current height, icon sizing, focus behavior, and text input hit area.

#### `ScreenBannerFrame` and `ScreenHeader`

- Remove one-off background recipes where possible.
- Make header containers and back buttons feel like the same design family as surfaces and buttons.
- Preserve safe-area behavior, header height, back-button hit target, and current icon sizing.

#### `Toast`

- Replace heavy solid alert blocks with tinted glass feedback surfaces.
- Preserve severity distinction and readability.
- Preserve toast timing, placement, touch handling, and semantic mapping of success/warning/error states.

#### `TopicPillRow`, `SubjectCard`, `SubjectSelectionCard`

- Convert remaining flat or warning-card styling into primitive-aligned pills/cards.
- Keep semantic cues such as due counts, warnings, and subject colors.

## Testing Strategy

Follow focused TDD for behavior-sensitive primitive updates.

1. Add or update targeted tests for any primitive behavior change that affects variants, states, or token usage.
2. Run Jest in single-thread mode for only the affected unit tests first.
3. If exported contracts change, run the repo’s full typecheck command: `npm run typecheck`.
4. Avoid broad suite runs until the polish pass is stable.

## Verification Commands

Use existing project conventions and force Jest single-threaded.

```bash
npm run test:unit -- --runTestsByPath <touched-test-file>
npm run typecheck
```

Prefer file-scoped runs over broad `src/components/**` Jest sweeps because this repo treats most component UI coverage as low-value compared with focused unit checks plus Detox.

## Risks

- Shared chrome may have subtle layout dependencies on current padding or border widths.
- Toast and header updates can expose contrast issues quickly because they appear across many screens.
- Small primitive API changes can cascade widely; avoid them unless clearly justified.
- Android render cost can regress if the polish adds wrappers or expensive visual effects; keep the implementation lightweight and gradient-based.

## Success Criteria

- Primitive surfaces, buttons, badges, dividers, and inputs all share a clearly consistent glass treatment.
- Shared chrome no longer stands out as old opaque UI against migrated screens.
- Existing screen layouts remain intact without requiring broad refactors.
- Targeted tests pass and no primitive contract is broken.
- No new hardcoded opaque shell colors are introduced in target files when an existing `linearTheme` token can be used.
- No public primitive API changes are introduced unless explicitly documented in the diff.
