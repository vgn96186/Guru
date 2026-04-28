# Remix Icons Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Ionicons (`@expo/vector-icons`) with `react-native-remix-icon`, preserving “line vs fill when stateful” behavior and improving AI provider icon fidelity.

**Architecture:** Introduce a Remix-backed `Icon` primitive that accepts existing Ionicons-style `name` strings and resolves them through a compatibility map to Remix icon names (line/fill). Migrate high-impact components first, then remove remaining Ionicons imports.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, `react-native-remix-icon`, `react-native-svg`

---

### Task 1: Add Dependency

**Files:**

- Modify: [package.json](file:///Users/vishnugnair/Guru-3/package.json)

- [ ] **Step 1: Install `react-native-remix-icon`**

Run:

```bash
npm install react-native-remix-icon
```

Expected: dependency added to `package.json` and installed into `node_modules`.

- [ ] **Step 2: Verify `react-native-svg` is present**

Run:

```bash
npm ls react-native-svg
```

Expected: prints an installed `react-native-svg@...` (already present in this repo’s dependencies).

---

### Task 2: Add Remix Compatibility Resolver

**Files:**

- Create: [src/components/primitives/remixIconCompat.ts](file:///Users/vishnugnair/Guru-3/src/components/primitives/remixIconCompat.ts)

- [ ] **Step 1: Create compatibility resolver**

Create `src/components/primitives/remixIconCompat.ts`:

```ts
import type { IconStyle } from '../../theme/iconography';

type CompatEntry = { line: string; fill: string };

const COMPAT: Record<string, CompatEntry> = {
  home: { line: 'home-line', fill: 'home-fill' },
  grid: { line: 'grid-line', fill: 'grid-fill' },
  menu: { line: 'menu-line', fill: 'menu-fill' },

  chatbubbles: { line: 'chat-3-line', fill: 'chat-3-fill' },

  close: { line: 'close-line', fill: 'close-line' },
  search: { line: 'search-line', fill: 'search-line' },

  'checkmark-circle': { line: 'checkbox-circle-line', fill: 'checkbox-circle-fill' },
  'close-circle': { line: 'close-circle-line', fill: 'close-circle-fill' },
  'information-circle': { line: 'information-line', fill: 'information-line' },
  warning: { line: 'error-warning-line', fill: 'error-warning-fill' },
  'alert-circle': { line: 'alert-line', fill: 'alert-fill' },
  key: { line: 'key-2-line', fill: 'key-2-fill' },

  flash: { line: 'flashlight-line', fill: 'flashlight-fill' },
  diamond: { line: 'vip-diamond-line', fill: 'vip-diamond-fill' },
  telescope: { line: 'telescope-line', fill: 'telescope-fill' },
  compass: { line: 'compass-3-line', fill: 'compass-3-fill' },
  cube: { line: 'box-3-line', fill: 'box-3-fill' },
  shuffle: { line: 'shuffle-line', fill: 'shuffle-line' },
  mic: { line: 'mic-line', fill: 'mic-fill' },
  image: { line: 'image-line', fill: 'image-fill' },

  'phone-portrait': { line: 'smartphone-line', fill: 'smartphone-fill' },
  globe: { line: 'global-line', fill: 'global-fill' },
  cloud: { line: 'cloud-line', fill: 'cloud-fill' },
  server: { line: 'server-line', fill: 'server-fill' },
  star: { line: 'sparkling-line', fill: 'sparkling-fill' },

  'logo-github': { line: 'github-line', fill: 'github-fill' },
  'git-compare': { line: 'git-merge-line', fill: 'git-merge-fill' },
  'git-branch': { line: 'git-branch-line', fill: 'git-branch-fill' },
  'swap-horizontal': { line: 'swap-2-line', fill: 'swap-2-fill' },
  'git-network': { line: 'share-line', fill: 'share-line' },
  'logo-electron': { line: 'cpu-line', fill: 'cpu-fill' },
};

function normalizeIoniconsName(name: string) {
  let n = name.trim();
  if (n.endsWith('-outline')) n = n.replace(/-outline$/, '');
  if (n.endsWith('-sharp')) n = n.replace(/-sharp$/, '');
  return n;
}

export function resolveRemixIconName(input: string, style: IconStyle): string {
  const normalized = normalizeIoniconsName(input);
  const entry = COMPAT[normalized];
  if (!entry) return style === 'filled' ? 'question-mark-fill' : 'question-mark-line';
  return style === 'filled' ? entry.fill : entry.line;
}
```

- [ ] **Step 2: Validate that the referenced Remix icon names exist**

Run (after installing the dependency):

```bash
ls node_modules/react-native-remix-icon/icons | head -n 20
```

Expected: icons exist as `.svg` files. For any missing icon names, update `COMPAT` entries to valid Remix names.

---

### Task 3: Replace the Shared `Icon` Primitive

**Files:**

- Modify: [Icon.tsx](file:///Users/vishnugnair/Guru-3/src/components/primitives/Icon.tsx)

- [ ] **Step 1: Update primitive to render Remix icons**

Replace `src/components/primitives/Icon.tsx` with:

```tsx
import React from 'react';
import RemixIcon from 'react-native-remix-icon';
import { linearTheme } from '../../theme/linearTheme';
import {
  iconSize,
  DEFAULT_ICON_SIZE,
  DEFAULT_ICON_STYLE,
  type IconSize,
  type IconStyle,
} from '../../theme/iconography';
import { resolveRemixIconName } from './remixIconCompat';

interface IconProps {
  name: string;
  size?: IconSize;
  style?: IconStyle;
  color?: string;
  accessibilityLabel?: string;
}

export default function Icon({
  name,
  size = DEFAULT_ICON_SIZE,
  style = DEFAULT_ICON_STYLE,
  color = linearTheme.colors.textPrimary,
  accessibilityLabel,
}: IconProps) {
  const resolved = resolveRemixIconName(name, style);
  return (
    <RemixIcon
      name={resolved}
      size={iconSize[size]}
      color={color}
      accessibilityLabel={accessibilityLabel}
      fallback={null}
    />
  );
}
```

- [ ] **Step 2: Typecheck to ensure the Ionicons glyphMap typing is gone**

Run:

```bash
npm run typecheck
```

Expected: `Icon` no longer depends on `Ionicons.glyphMap` types.

---

### Task 4: Replace High-Impact Direct `Ionicons` Usages (Provider UI + Chat)

**Files:**

- Modify: [ApiKeyRow.tsx](file:///Users/vishnugnair/Guru-3/src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx)
- Modify: [GuruChatModelSelector.tsx](file:///Users/vishnugnair/Guru-3/src/components/chat/GuruChatModelSelector.tsx)

- [ ] **Step 1: ApiKeyRow — replace Ionicons import and render the shared Icon**

In `ApiKeyRow.tsx`:

- Replace:
  - `import { Ionicons } from '@expo/vector-icons';`
- With:
  - `import Icon from '../../../../../components/primitives/Icon';`

Replace `<Ionicons ... />` usages with:

```tsx
<Icon name={iconName} size="sm" style="filled" color={...} />
```

and for the validate button icons:

```tsx
<Icon
  name={
    validationStatus === 'valid'
      ? 'checkmark-circle'
      : validationStatus === 'invalid'
        ? 'close-circle'
        : 'flash'
  }
  size="lg"
  style="filled"
  color={...}
/>
```

and for the validation error row:

```tsx
<Icon name="alert-circle" size="sm" style="filled" color={linearTheme.colors.error} />
```

- [ ] **Step 2: GuruChatModelSelector — replace Ionicons with shared Icon**

In `GuruChatModelSelector.tsx`:

- Replace:
  - `import { Ionicons } from '@expo/vector-icons';`
- With:
  - `import Icon from '../primitives/Icon';`

Replace the specific icon render sites:

```tsx
<Icon name="checkmark-circle" size="md" style="filled" color={n.colors.accent} />
<Icon name="close" size="sm" style="filled" color={n.colors.textMuted} />
<Icon name="information-circle-outline" size="sm" style="outlined" color={n.colors.textMuted} />
<Icon name="warning-outline" size="sm" style="outlined" color={n.colors.warning} />
```

Update the `leftIcon` / `rightIcon` usage in the search input:

```tsx
leftIcon={<Icon name="search" size="sm" style="filled" color={n.colors.textMuted} />}
```

and:

```tsx
<Icon name="close-circle" size="sm" style="filled" color={n.colors.textMuted} />
```

- [ ] **Step 3: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: tests pass.

---

### Task 5: Remove Remaining `Ionicons` Imports Iteratively

**Files:**

- Modify: multiple under `src/`

- [ ] **Step 1: Find remaining Ionicons imports**

Run:

```bash
rg "from '@expo/vector-icons'" src
```

Expected: list of files still importing Ionicons.

- [ ] **Step 2: For each file, replace Ionicons usage**

Rules:

- Prefer switching call sites to `src/components/primitives/Icon.tsx` when possible.
- For cases that require nonstandard sizing, pass `size="sm" | "md" | "lg"` and `color=...`.
- If a call site passes a raw pixel size (e.g. `size={15}`), replace with closest `Icon` size token.

- [ ] **Step 3: Re-run lint + logic coverage gate**

Run:

```bash
npm run verify:ci
```

Expected: green.

---

### Task 6: Remove `@expo/vector-icons`

**Files:**

- Modify: [package.json](file:///Users/vishnugnair/Guru-3/package.json)
- Modify: any Jest mocks that reference `@expo/vector-icons`

- [ ] **Step 1: Ensure there are no remaining imports**

Run:

```bash
rg "@expo/vector-icons" src
```

Expected: no matches.

- [ ] **Step 2: Remove dependency**

Run:

```bash
npm uninstall @expo/vector-icons
```

- [ ] **Step 3: Fix tests/mocks if any still reference the module**

Search:

```bash
rg "@expo/vector-icons" .
```

Update mocks to either:

- remove them if unused, or
- replace with a minimal stub component.

- [ ] **Step 4: Final verification**

Run:

```bash
npm run verify:ci
```

Expected: green.
