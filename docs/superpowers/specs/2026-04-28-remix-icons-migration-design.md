# Remix Icons Migration (Ionicons → react-native-remix-icon)

## Goal

Replace Ionicons (`@expo/vector-icons`) usage across the app with `react-native-remix-icon` while keeping the UI behavior consistent and improving icon coverage for AI provider branding.

## Non-Goals

- Redesigning UI layouts.
- Changing navigation structure.
- Refactoring unrelated UI primitives.
- Introducing new icon sets beyond Remix Icons.

## Constraints

- Expo / React Native app (Android-first).
- Existing codebase contains many Ionicons name strings spread across UI and mapping tables.
- Icon usage currently assumes “outlined by default” behavior, with `style="filled"` for selected-state.

## UX Rules (Approved)

- Stateful icons: inactive uses line icon, active/selected uses fill icon (tab bar, checkmarks, selected rows).
- Non-stateful icons: prefer fill icons everywhere else.

## Strategy (Compatibility Map)

### Why

The codebase currently has Ionicons names in many locations (including provider meta tables). A compatibility layer allows safe incremental migration without needing to rename every icon string immediately.

### What

1. Install `react-native-remix-icon`.
2. Replace the shared icon primitive to render Remix icons.
3. Add an Ionicons-name → Remix-icon resolver for the set of Ionicons names actually used.
4. Incrementally remove direct `Ionicons` imports by switching components to use the shared icon primitive (or a small wrapper for inline use).
5. Update provider icon tables to Remix equivalents (brand-correct where possible).
6. Remove `@expo/vector-icons` after all imports are removed and tests updated.

## Implementation Components

### 1) New Icon Primitive Behavior

- Update [Icon.tsx](file:///Users/vishnugnair/Guru-3/src/components/primitives/Icon.tsx) to render Remix icons.
- Preserve `size`, `color`, and `accessibilityLabel` contract.
- Keep `style` prop semantics:
  - `style="filled"` → choose Remix `*-fill`
  - default → choose Remix `*-line` only for stateful contexts (call sites that pass `filled` when selected).

### 2) Ionicons Compatibility Resolver

- Input: Ionicons-style name strings (examples: `home-outline`, `settings-sharp`, `logo-github`).
- Output: Remix icon name + variant decision (`line` vs `fill`) and fallback behavior.
- Should cover:
  - Tabs: `home`, `grid`, `chatbubbles`, `menu`
  - Common UI: `close`, `search`, `information-circle`, `warning`, `checkmark-circle`, `close-circle`, `alert-circle`, `key`, `settings`, `chevron-back`
  - Provider icons currently used in:
    - [ApiKeyRow.tsx](file:///Users/vishnugnair/Guru-3/src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx)
    - [GuruChatModelSelector.tsx](file:///Users/vishnugnair/Guru-3/src/components/chat/GuruChatModelSelector.tsx)

### 3) Provider Icon Tables

Update existing provider icon name tables to use a stable semantic key set and resolve to Remix icons:

- [ApiKeyRow.tsx PROVIDER_ICONS](file:///Users/vishnugnair/Guru-3/src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx#L22-L34)
- [GuruChatModelSelector.tsx PROVIDER_META](file:///Users/vishnugnair/Guru-3/src/components/chat/GuruChatModelSelector.tsx#L22-L40)

Guideline:

- Prefer official brand icons if Remix provides them.
- Otherwise use consistent meaning icons (router/network, spark/ai, server/cloud, etc.) to avoid mismatched branding.

### 4) High-Leverage Migration Targets

Replace Ionicons imports in these first so the majority of the app follows automatically:

- [Icon.tsx](file:///Users/vishnugnair/Guru-3/src/components/primitives/Icon.tsx)
- [EmptyState.tsx](file:///Users/vishnugnair/Guru-3/src/components/primitives/EmptyState.tsx)
- [BackIconButton.tsx](file:///Users/vishnugnair/Guru-3/src/components/primitives/BackIconButton.tsx)
- [SettingsIconButton.tsx](file:///Users/vishnugnair/Guru-3/src/components/primitives/SettingsIconButton.tsx)
- [CustomTabBar.tsx](file:///Users/vishnugnair/Guru-3/src/navigation/CustomTabBar.tsx)

### 5) Test Updates

- Update any tests that mock `@expo/vector-icons` if the dependency is removed.
- Ensure unit tests pass (`npm run test:unit`) and lint remains clean (`npm run lint`).

## Rollout Plan

- Phase 1: Install dependency + update Icon primitive + compatibility resolver.
- Phase 2: Replace highest-impact components and provider icon tables.
- Phase 3: Remove remaining Ionicons imports and delete `@expo/vector-icons` dependency.
- Phase 4: Final verification (lint + unit tests + logic coverage gate).

## Success Criteria

- App compiles and runs with Remix icons.
- Tab bar and other stateful UI retain clear active/inactive affordances.
- AI provider icons look correct and distinct.
- No remaining `Ionicons` imports under `src/`.
- `@expo/vector-icons` can be removed without tests failing.
