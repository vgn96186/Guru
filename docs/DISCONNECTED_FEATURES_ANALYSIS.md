# Disconnected or Partially Wired Features — Analysis

Features where code exists (screens, components, services) but is not well connected: no in-app entry point, dead components, or missing navigation.

---

## 1. Root screens with no in-app entry point

These screens are registered in `RootNavigator` but **no code in the app calls `navigate(...)` to them**. They are unreachable from normal UI flow (and not exposed in `linking.ts` for deep links).

| Screen                    | Purpose                                             | Entry point                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PunishmentMode**        | Strict “punishment” / guilt mode when goals not met | **None** — no `navigate('PunishmentMode')` anywhere.                                                                                                                            |
| **BedLock**               | Bed-time lock / strict mode                         | **None** — no `navigate('BedLock')` anywhere.                                                                                                                                   |
| **DoomscrollInterceptor** | Intercept when user leaves app to doomscroll        | **None** — no `navigate('DoomscrollInterceptor')` anywhere.                                                                                                                     |
| **Lockdown**              | Focus timer (e.g. 5 min), blocks back button        | **None** — no `navigate('Lockdown', { duration })` in current code. (An archive script had added a “Force 5-Min Lockdown” button on Home; that patch is not in current source.) |
| **LocalModel**            | Local LLM/Whisper download and config               | **None** — no `navigate('LocalModel')`. Settings does not link to it; only way to use local model is via bootstrap or existing profile.                                         |

**Recommendation:** Either wire them up or document as intentional (e.g. “opened only via notification” or “future / experimental”). For example: add a “Focus timer” / Lockdown entry (e.g. from Home or Inertia), add “Local model” in Settings, and define how PunishmentMode / BedLock / DoomscrollInterceptor are supposed to be shown (e.g. from notifications or a specific trigger).

---

## 2. Brain dump “review” flow not reachable from UI

- **BrainDumpFab** (on SessionScreen): opens a modal, user parks a thought → **addBrainDump(note)**. Modal closes; no navigation elsewhere.
- **BrainDumpReviewScreen**: lists parked thoughts, Clear All, Done. Registered in root stack and in **linking** as `brain-dump-review`.

There is **no in-app navigation to BrainDumpReview**. Users can park thoughts but cannot open “Parked Thoughts” from the UI; only via deep link `guru-study://brain-dump-review`.

**Recommendation:** Add an entry to BrainDumpReview, e.g.:

- “Review parked thoughts” (or “Parked thoughts”) in the Action Hub sheet, or
- A button/link after “Park It” in the FAB modal (“Review parked thoughts”), or
- An item in Menu (e.g. “Parked thoughts”) that calls `navigation.getParent()?.navigate('BrainDumpReview')` (or equivalent from your nav structure).

---

## 3. ExternalToolsRow — unused component

- **Location:** `src/components/ExternalToolsRow.tsx`
- **Behavior:** Renders external app tiles, calls `onLogSession(appId)` on long-press. Uses `launchMedicalApp`, overlay, etc.
- **Usage:** **Never imported or rendered.** The Action Hub in `TabNavigator` uses its own inline grid of `EXTERNAL_APPS` and `launchExternalAction`; it does not use `ExternalToolsRow`.

The component was redundant; Action Hub already provides the same flow. **Removed.**

**Done:** Component removed. Action Hub in TabNavigator is the single entry for external app launch.

---

## 4. ManualNoteCreation and root navigation

- **TabNavigator** (Action Hub sheet): `navigation.navigate('ManualNoteCreation' as never)`.
- **NotesHubScreen**: now uses `navigationRef.navigate('ManualNoteCreation')` so the root stack is targeted reliably.

`ManualNoteCreation` is a **root** stack screen. In React Navigation 6, `navigate('ManualNoteCreation')` from a nested navigator (tabs → menu) typically bubbles to the root and can work. So this is **likely connected**; only thing to verify is that from both places the root stack is actually the same and the call succeeds (e.g. no typing that hides a different navigator).

**Recommendation:** Quick smoke test: open Action Hub → “Paste Transcript”, and from Notes Hub → “Manual note” (or equivalent). If both open ManualNoteCreation, no change needed; if not, use a root-level navigation ref or `getParent()` to the root stack and call `navigate('ManualNoteCreation')` there.

---

## 5. Notification-driven and initial routes

- **WakeUp:** Wired — `useAppBootstrap` notification response listener calls `navigationRef.navigate('WakeUp')` when `data?.screen === 'WakeUp'`.
- **resolveInitialRoute** (appBootstrap): returns only `'Tabs' | 'CheckIn'`. No initial route to PunishmentMode, BedLock, DoomscrollInterceptor, or Lockdown.

So **only WakeUp** is currently opened from a notification; other root screens are not driven by initial route or by the current notification handler.

**Notification permission:** The app now requests notification permission when the user completes check-in (Quick Start or time select). `CheckInScreen` calls `requestNotificationPermissions()` then `refreshAccountabilityNotifications()` so reminders can be scheduled and shown.

---

## 6. Summary table

| Item                  | Status   | Action                                                                               |
| --------------------- | -------- | ------------------------------------------------------------------------------------ |
| PunishmentMode        | Orphaned | Add trigger (e.g. notification, or “strict mode” from settings) or remove/deprecate. |
| BedLock               | Orphaned | Same.                                                                                |
| DoomscrollInterceptor | Orphaned | Same (e.g. show when doomscroll is detected and app returns to foreground).          |
| Lockdown              | Orphaned | Add entry (e.g. “Focus timer” / “5-min lockdown” from Home or Inertia).              |
| LocalModel            | Orphaned | Add “Local model” / “Download model” in Settings that navigates to LocalModel.       |
| BrainDumpReview       | Fixed    | Entry in Action Hub + "Review parked thoughts" in BrainDumpFab modal.                |
| ExternalToolsRow      | Removed  | Deleted; Action Hub is the single entry.                                             |
| ManualNoteCreation    | Fixed    | NotesHubScreen uses navigationRef; TabNavigator uses root nav.                       |

---

## 7. Files to change (if you wire them)

- **Lockdown entry:** e.g. HomeScreen or InertiaScreen — add button that calls `navigation.getParent()?.navigate('Lockdown', { duration: 300 })` (or your root nav API).
- **LocalModel entry:** e.g. SettingsScreen or a settings subsection — add row that navigates to `LocalModel` (root).
- **BrainDumpReview entry:** e.g. TabNavigator Action Hub sheet, or BrainDumpFab modal, or MenuScreen — add “Parked thoughts” that navigates to `BrainDumpReview` (root).
- **PunishmentMode / BedLock / DoomscrollInterceptor:** Define product trigger (e.g. notification payload, or “strict mode” in settings), then add `navigationRef.navigate(...)` or equivalent in that path.
- **ExternalToolsRow:** Removed; Action Hub in TabNavigator is the only entry.

---

## References

- **Root stack:** `src/navigation/RootNavigator.tsx`
- **Linking:** `src/navigation/linking.ts`
- **Initial route:** `src/services/appBootstrap.ts` (`resolveInitialRoute`)
- **Notification response:** `src/hooks/useAppBootstrap.ts` (WakeUp only)
- **Action Hub:** `src/navigation/TabNavigator.tsx` (sheet with Record Lecture, Quick Note, Upload Audio, Paste Transcript, external apps grid)
