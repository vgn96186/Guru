# Alert Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a premium themed feedback layer for Guru by upgrading the existing toast system, adding a global dialog host, and migrating an initial slice of native alerts to the new APIs without breaking current behavior.

**Architecture:** Reuse the existing imperative toast pattern in `src/components/Toast.tsx` so existing callers keep working while adding a richer object-based API and premium styling. Introduce a new root-mounted dialog host/service above `NavigationContainer` for themed confirmations and blocking messages, expose a shared `showError(error, fallbackMessage?)` helper, and migrate a focused set of alert-heavy flows that benefit immediately from toast/dialog replacement.

**Tech Stack:** React Native 0.81, Expo 54, TypeScript, Jest (`--runInBand`), central feedback styling derived from `src/constants/theme.ts` with existing `linearTheme` usage only kept where needed for compatibility

---

### Task 1: Premium Toast Upgrade

**Files:**

- Modify: `src/components/Toast.tsx`
- Modify: `App.tsx`
- Create: `src/components/feedbackTestUtils.ts`
- Test: `src/components/Toast.unit.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('keeps legacy showToast(message, type, onPress, duration) calls working', () => {
  showToast('Saved', 'success');
  expect(listener).toReceivePayload({ message: 'Saved', type: 'success' });
});

it('accepts object-style toast calls for richer variants', () => {
  showToast({ title: 'Saved', message: 'Backup created', variant: 'success' });
  expect(listener).toReceivePayload({ title: 'Saved', message: 'Backup created' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --runInBand src/components/Toast.unit.test.tsx`
Expected: FAIL because object-style toast payloads are not supported yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function showToast(
  payloadOrMessage: string | ToastOptions,
  type: ToastType = 'info',
  onPress?: () => void,
  duration = 3500,
): void {
  const payload =
    typeof payloadOrMessage === 'string'
      ? { message: payloadOrMessage, type, onPress, duration }
      : normalizeToastOptions(payloadOrMessage);
  emitToast(payload);
}
```

- [ ] **Step 4: Upgrade visuals without breaking fallback behavior**

Implement:

- premium dark/glass toast container styling
- optional title + message layout
- variant badge/icon support
- style from `src/constants/theme.ts` so alert surfaces share one design source
- keep current console fallback if no host is mounted
- add singleton reset helpers for tests
- mount host outside `NavigationContainer` in `App.tsx`

- [ ] **Step 5: Run tests to verify it passes**

Run: `npm run test:unit -- --runInBand src/components/Toast.unit.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add App.tsx src/components/Toast.tsx src/components/Toast.unit.test.tsx src/components/feedbackTestUtils.ts
git commit -m "feat: upgrade themed toast system"
```

### Task 2: Global Dialog Host And API

**Files:**

- Create: `src/components/DialogHost.tsx`
- Create: `src/components/dialogService.ts`
- Create: `src/components/feedbackFallbacks.ts`
- Modify: `App.tsx`
- Test: `src/components/DialogHost.unit.test.tsx`
- Test: `src/components/dialogService.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

```tsx
it('shows one dialog at a time and resolves the pressed action id', async () => {
  const result = showDialog({
    title: 'Clear cache?',
    message: 'This regenerates cards later.',
    actions: [{ id: 'clear', label: 'Clear', variant: 'destructive' }],
  });
  press('Clear');
  await expect(result).resolves.toBe('clear');
});

it('falls back when no host is mounted', async () => {
  const result = await showDialog({ title: 'Leave?', actions: [] });
  expect(nativeAlertFallback).toHaveBeenCalled();
  expect(result).toBe('dismissed');
});

it('showError routes to dialog when mounted and native alert otherwise', async () => {
  await showError(new Error('Boom'), 'Fallback');
  expect(feedbackPath).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- --runInBand src/components/DialogHost.unit.test.tsx`
Expected: FAIL because dialog host/service does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export type DialogAction = {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary' | 'destructive';
  onPress?: () => void | Promise<void>;
  isDestructive?: boolean;
  isLoading?: boolean;
};

export function showDialog(options: DialogOptions): Promise<string | 'dismissed'> {
  if (!listener) {
    return fallbackToNativeAlert(options);
  }
  return listener(options);
}

export function showError(error: unknown, fallbackMessage?: string) {
  const message = getErrorMessage(error, fallbackMessage);
  return showDialog({
    title: 'Something went wrong',
    message,
    actions: [{ id: 'ok', label: 'OK', variant: 'primary' }],
  });
}
```

- [ ] **Step 4: Build the host**

Implement:

- single visible dialog at a time
- stable action order
- Android back/outside tap rules for low-risk dialogs only
- premium themed styling using existing tokens
- loading state support for async dialog actions
- singleton reset helpers for tests
- root mounting outside navigation so dialogs overlay native-stack modals

- [ ] **Step 5: Run tests to verify it passes**

Run: `npm run test:unit -- --runInBand src/components/DialogHost.unit.test.tsx`
Expected: PASS

- [ ] **Step 6: Run fallback-path tests**

Run: `npm run test:unit -- --runInBand src/components/dialogService.unit.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add App.tsx src/components/DialogHost.tsx src/components/dialogService.ts src/components/feedbackFallbacks.ts src/components/DialogHost.unit.test.tsx src/components/dialogService.unit.test.ts src/components/feedbackTestUtils.ts
git commit -m "feat: add global themed dialog host"
```

### Task 3: Initial Alert Migration Slice

**Files:**

- Modify: `src/screens/settings/sections/StorageSections.tsx`
- Modify: `src/screens/SessionScreen.tsx`
- Create: `src/screens/settings/sections/StorageSections.unit.test.tsx`
- Test: `src/screens/SessionScreen.unit.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
it('uses themed dialog for clear cache confirmation and toast for success', async () => {
  press('Clear AI Content Cache');
  expect(showDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Clear AI Cache?' }));
  await confirmDialog('Clear');
  expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
});

it('uses themed dialog for mark-for-review confirmation', async () => {
  triggerMarkForReview();
  expect(showDialog).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify it fails**

Run: `npm run test:unit -- --runInBand src/screens/settings/sections/StorageSections.unit.test.tsx src/screens/SessionScreen.unit.test.tsx`
Expected: FAIL because screens still call `Alert.alert(...)`.

- [ ] **Step 3: Write minimal implementation**

Replace a focused set of alerts:

- `StorageSections.tsx`
  - clear AI cache confirmation → dialog
  - reset progress confirmation → dialog
  - cleanup/export/import success and failure messages → toast where non-blocking
- `SessionScreen.tsx`
  - mark-for-review confirmation → dialog
  - mark-for-review success → toast

- [ ] **Step 4: Run tests to verify it passes**

Run: `npm run test:unit -- --runInBand src/screens/settings/sections/StorageSections.unit.test.tsx src/screens/SessionScreen.unit.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/screens/settings/sections/StorageSections.tsx src/screens/SessionScreen.tsx src/screens/settings/sections/StorageSections.unit.test.tsx src/screens/SessionScreen.unit.test.tsx
git commit -m "feat: migrate first alerts to themed feedback"
```

### Task 4: Verification

**Files:**

- Verify only

- [ ] **Step 1: Run focused Jest suites**

Run: `npm run test:unit -- --runInBand src/components/Toast.unit.test.tsx src/components/DialogHost.unit.test.tsx src/screens/settings/sections/StorageSections.unit.test.tsx src/screens/SessionScreen.unit.test.tsx`
Expected: PASS

- [ ] **Step 2: Run lint on touched files**

Run: `npx eslint App.tsx src/components/Toast.tsx src/components/DialogHost.tsx src/components/dialogService.ts src/screens/settings/sections/StorageSections.tsx src/screens/SessionScreen.tsx`
Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS or document any unrelated pre-existing failures.

- [ ] **Step 4: Summarize migration coverage**

Document:

- which alerts now use toast/dialog
- which ones remain on native `Alert.alert(...)`
- why the remaining native alerts were not migrated yet
