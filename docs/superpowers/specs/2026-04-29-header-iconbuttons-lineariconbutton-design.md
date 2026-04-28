# Header Icon Buttons — LinearIconButton

## Goal

Improve touch feedback consistency for the header **Back** and **Settings** buttons by switching their implementations to use the shared `LinearIconButton` primitive.

## Current State

- Header buttons are implemented as custom `Pressable` wrappers:
  - `BackIconButton` (`Ionicons chevron-back`)
  - `SettingsIconButton` (`Ionicons settings-sharp`)
- They use `android_ripple` + opacity pressed state, but the ripple is subtle and differs from the app’s standard icon button feel.

## Proposed Change

- Re-implement both `BackIconButton` and `SettingsIconButton` as thin wrappers over `LinearIconButton`.
- Preserve existing public props and call sites (notably `testID`, `accessibilityLabel`, and `PressableProps` compatibility).
- Match the existing 48×48 header hit target by overriding size via `className`:
  - `className="w-12 h-12"`
  - `shape="round"`
- Keep icons and defaults the same:
  - Back: `chevron-back`, default `iconSize=22`, default `iconColor=n.colors.textPrimary`
  - Settings: `settings-sharp`, default `iconSize=22`, default `iconColor=n.colors.textSecondary`

## Non-Goals

- No navigation changes (Settings routing remains in `ScreenHeader`).
- No haptics changes (keeps existing behavior; “visual-only” preference).
- No header layout changes (spacing and alignment remain unchanged).

## Files In Scope

- `src/components/primitives/BackIconButton.tsx`
- `src/components/primitives/SettingsIconButton.tsx`

## Acceptance Criteria

- Tapping Back/Settings shows the same pressed/ripple feedback as other `LinearIconButton` usages.
- Tap target remains at least 48×48.
- Existing screens using `ScreenHeader` show no layout regressions.
- `testID` values remain stable (`back-button`, `settings-button`).

## Verification

- Run `npm run verify:ci`.
