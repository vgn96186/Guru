# Guru - Performance Optimization TODOs

## High Priority Bottlenecks

- [ ] **`TopicDetailScreen.tsx` Massive Re-render Bottleneck**
  - **Issue:** A 320-line `renderItem` is defined inline in the `FlatList` of topics. It relies on `noteText` (which updates on every keystroke when typing notes). This causes the entire `FlatList` to re-render all topic cards synchronously on every keystroke, causing extreme input lag.
  - **Proposed Fix:** Extract the topic list item into an internally wrapped `React.memo` independent component (`<TopicListItem />`). Move the active typing state out of the parent screen hierarchy and manage it locally inside the expanded item, or ensure `renderItem` has stable dependency props.

- [ ] **Unmanaged Lifecycle Async Promises (Memory Leaks)**
  - **Issue:** Across critical screens (`TranscriptionSettingsPanel.tsx`, `TopicDetailScreen.tsx`, `HomeScreen.tsx`), deep asynchronous calls (e.g. AI inference, API validations, layout polling) run without `AbortController` or `isMounted` ref checks. If unmounted before they resolve, they execute state updates on destroyed components, slowing down the Expo runtime.
  - **Proposed Fix:** Create a centralized `useSafeAsync` hook to wrap Promises in an unmount-catcher, or standardize the usage of `AbortController` to cleanly terminate pending network/IO queries when a screen unmounts.

- [ ] **Zustand Profile / SQLite Race Conditions during Re-hydration**
  - **Issue:** On `HomeScreen` and `SessionScreen`, the global `getDb()` queries for profile and progress trigger concurrently upon focus. During background/foreground transitions, `Zustand`'s async re-hydration loop can fight for lock priorities with `SQLite` transactions.
  - **Proposed Fix:** Synchronize local state booting strictly after `Zustand` finishes hydration (or utilize a specialized `useHydration` lock gating the root components until persistence handles are confirmed active).

## Medium Priority Improvements

- [ ] **`MindMapScreen.tsx` Unstable FlatList Callbacks**
  - **Issue:** The `<MapListView />` generates the mind map list using inline closure hooks like `onPress={() => onSelect(item.id)}`.
  - **Proposed Fix:** Refactor list items into a `React.memo` wrapped child component or use `useCallback` implementations to stabilize references, preventing list item teardown cascades when complex root gestures/state changes occur.

- [ ] **`PunishmentMode.tsx` Haptic Queue Safety**
  - **Issue:** The `harassmentTimer` queues arrays of `Vibration.vibrate()` calls inside a rapidly spinning `setInterval` based on calculated length bounds.
  - **Proposed Fix:** Replace with controlled finite async awaits, or implement debouncing logic to prevent native bridge overflows if the app stalls and rapid queues build up unmanaged.

---

_(Note: Timer/leak bugs in `DoomscrollInterceptor.tsx`, `SessionScreen.tsx`, and `LectureModeScreen.tsx` were already patched previously by extracting them from aggressive dependency arrays and scoping references properly.)_
