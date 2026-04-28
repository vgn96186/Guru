# Header Icon Buttons (Back/Settings) — LinearIconButton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the header Back and Settings buttons to use the shared `LinearIconButton` primitive for consistent touch feedback.

**Architecture:** Keep `BackIconButton` and `SettingsIconButton` as stable wrappers (call sites unchanged) but implement them internally with `LinearIconButton` using a 48×48 round hit target.

**Tech Stack:** React Native (Expo), TypeScript, NativeWind className, `@testing-library/react-native` (Jest).

---

## File Structure

- Modify: `/Users/vishnugnair/Guru-3/src/components/primitives/BackIconButton.tsx`
- Modify: `/Users/vishnugnair/Guru-3/src/components/primitives/SettingsIconButton.tsx`
- Create: `/Users/vishnugnair/Guru-3/src/components/primitives/BackIconButton.unit.test.tsx`
- Create: `/Users/vishnugnair/Guru-3/src/components/primitives/SettingsIconButton.unit.test.tsx`

### Task 1: Update BackIconButton Wrapper

**Files:**

- Modify: `/Users/vishnugnair/Guru-3/src/components/primitives/BackIconButton.tsx`

- [ ] **Step 1: Replace Pressable implementation with LinearIconButton**

```tsx
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import LinearIconButton from './LinearIconButton';
import { linearTheme as n } from '../../theme/linearTheme';
import type { PressableProps } from 'react-native';

interface BackIconButtonProps extends Omit<PressableProps, 'style' | 'className' | 'children'> {
  onPress?: () => void;
  iconSize?: number;
  iconColor?: string;
  testID?: string;
}

export default function BackIconButton({
  onPress,
  iconSize = 22,
  iconColor = n.colors.textPrimary,
  testID = 'back-button',
  ...rest
}: BackIconButtonProps) {
  return (
    <LinearIconButton
      {...rest}
      onPress={onPress}
      variant="secondary"
      shape="round"
      className="w-12 h-12"
      accessibilityLabel="Go back"
      testID={testID}
    >
      <Ionicons name="chevron-back" size={iconSize} color={iconColor} />
    </LinearIconButton>
  );
}
```

- [ ] **Step 2: Ensure no prop conflicts**

Confirm `BackIconButtonProps` omits `style`, `className`, and `children` so wrapper-defined sizing stays consistent.

### Task 2: Update SettingsIconButton Wrapper

**Files:**

- Modify: `/Users/vishnugnair/Guru-3/src/components/primitives/SettingsIconButton.tsx`

- [ ] **Step 1: Replace Pressable implementation with LinearIconButton**

```tsx
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import LinearIconButton from './LinearIconButton';
import { linearTheme as n } from '../../theme/linearTheme';
import type { PressableProps } from 'react-native';

interface SettingsIconButtonProps extends Omit<PressableProps, 'style' | 'className' | 'children'> {
  onPress: () => void;
  iconSize?: number;
  iconColor?: string;
  testID?: string;
}

export default function SettingsIconButton({
  onPress,
  iconSize = 22,
  iconColor = n.colors.textSecondary,
  testID = 'settings-button',
  ...rest
}: SettingsIconButtonProps) {
  return (
    <LinearIconButton
      {...rest}
      onPress={onPress}
      variant="secondary"
      shape="round"
      className="w-12 h-12"
      accessibilityLabel="Open settings"
      testID={testID}
    >
      <Ionicons name="settings-sharp" size={iconSize} color={iconColor} />
    </LinearIconButton>
  );
}
```

- [ ] **Step 2: Ensure required onPress remains required**

Keep `onPress` required to match existing usage patterns.

### Task 3: Add Unit Tests (Smoke)

**Files:**

- Create: `/Users/vishnugnair/Guru-3/src/components/primitives/BackIconButton.unit.test.tsx`
- Create: `/Users/vishnugnair/Guru-3/src/components/primitives/SettingsIconButton.unit.test.tsx`

- [ ] **Step 1: BackIconButton renders and includes testID**

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import BackIconButton from './BackIconButton';

describe('BackIconButton', () => {
  it('renders with default testID', () => {
    const { getByTestId } = render(<BackIconButton onPress={() => {}} />);
    expect(getByTestId('back-button')).toBeTruthy();
  });
});
```

- [ ] **Step 2: SettingsIconButton renders and includes testID**

```tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import SettingsIconButton from './SettingsIconButton';

describe('SettingsIconButton', () => {
  it('renders with default testID', () => {
    const { getByTestId } = render(<SettingsIconButton onPress={() => {}} />);
    expect(getByTestId('settings-button')).toBeTruthy();
  });
});
```

### Task 4: Verify

**Files:**

- N/A

- [ ] **Step 1: Run CI-style verification**

Run:

```bash
npm run verify:ci
```

Expected: command exits 0.
