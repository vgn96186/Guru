# TODO

## Loading Orb & Boot Transition

- [x] Redesign LoadingOrb with layered glass visual (ambient glow, thin ripple rings, dual SVG gradients, specular highlight)
- [x] Fix LoadingOrb centering on SessionScreen contentArea
- [x] Implement boot-to-start-button orb morph transition (spec: `docs/superpowers/specs/2026-04-01-boot-transition-design.md`)
  - Phase 1: Jittery orb during app boot (fast breathing, shake animation)
  - Phase 2: Calming during home data load (jitter fades, breathing slows)
  - Phase 3: Settle — orb shrinks and morphs into StartButton position with text crossfade
  - Portal overlay in App.tsx above navigation
  - Zustand coordination: bootPhase, startButtonLayout, startButtonLabel

## Session Progression / FSRS

- [ ] Define `mastered` from FSRS history, not a single Study Session rating
  - Study Session now caps normal promotion at `reviewed`
  - Decide the promotion rule for `mastered` using FSRS signals such as `fsrs_reps`, `fsrs_stability`, due-history consistency, and repeat high-confidence reviews
  - Audit every place that reads `status = 'mastered'` to ensure it still matches the intended spaced-repetition semantics
- [ ] Add a behavioral cooldown for `DO THIS NOW` deep dives
  - A just-completed `deep_dive` topic should not immediately reappear in `DO THIS NOW`
  - Allow an exception only when the topic is still severely weak by an explicit rule
  - Apply this in the weakest-topic recommendation path, not by hiding the topic globally from review/planning
  - Recheck Home refresh behavior after progress updates so the recommendation updates immediately

## Inline Alert Migration

Goal: Replace non-critical `Alert.alert(...)` usage with inline toasts/banners, while keeping critical confirmations as modals.

### Scope Summary

- Total `Alert.alert` call sites in `src/`: 145 (as of 2026-04-15)
- Critical (keep modal): ~16
- Very important (mostly keep modal): up to ~45
- Non-critical target for inline conversion: ~97

### Keep As Modal (Do Not Convert)

- Destructive confirmations:
  - Delete/clear/reset/restore actions
  - Flows with "This cannot be undone"
- Safety/lock enforcement exits:
  - Lockdown/punishment escape confirmations
- Session/transcription cancellation with potential data loss

### Convert To Inline First (Phase 1)

Convert passive/non-blocking alerts first:

- `Copied`, `Done`, `Success`, and FYI info
- Recoverable non-blocking errors
- "No items" informational notices

Primary files (highest impact):

- [ ] `src/screens/SettingsScreen.tsx` (28)
- [ ] `src/screens/RecordingVaultScreen.tsx` (9)
- [ ] `src/screens/LectureModeScreen.tsx` (8) - only non-blocking ones
- [ ] `src/screens/TranscriptHistoryScreen.tsx` (8) - only non-blocking ones
- [ ] `src/screens/SyllabusScreen.tsx` (7) - only non-blocking ones
- [ ] `src/services/backupService.ts` (7) - keep destructive/import validation modals
- [ ] `src/navigation/TabNavigator.tsx` (6)
- [ ] `src/screens/GuruChatScreen.tsx` (6)
- [ ] `src/services/appLauncher.ts` (6)

### Convert With UX Decision (Phase 2)

These may currently block a flow; decide case-by-case:

- [ ] Validation alerts (`No key`, `No token`, `Subject required`)
  - Option A: inline error + disabled CTA
  - Option B: inline banner near the field
- [ ] Permission/setup prompts
  - Keep modal if immediate OS-level action is required
- [ ] Retryable operation failures
  - Inline error + optional action (`Retry`)

### Reusable Notification Layer

- [x] Confirm `ToastContainer` is mounted near app root
- [ ] Standardize helper wrappers:
  - `notifyInfo(msg)`
  - `notifySuccess(msg)`
  - `notifyWarning(msg)`
  - `notifyError(msg, onPress?)`
- [ ] Replace direct calls with helpers for consistency

### Migration Rules

- [ ] Keep `Alert.alert` for critical/destructive confirmations
- [ ] Use inline toast for passive feedback
- [ ] Prefer inline banner for form validation
- [ ] Avoid duplicate notifications (one event -> one message)
- [ ] Keep accessibility labels/hints for inline components

### QA Checklist

- [ ] No data-loss confirmations were accidentally converted
- [ ] All destructive actions still require explicit confirmation
- [ ] Toasts do not overlap essential controls
- [ ] Error notifications are visible and understandable
- [ ] Android back-flow and modal behavior remain correct
- [ ] No regressions in recording/transcription flows
- [ ] No regressions in backup restore/export flows

### Optional Nice-to-Haves

- [ ] Add a lint rule or codemod guard for non-critical `Alert.alert` usage
- [ ] Add docs guidance: when to use modal vs inline notification
- [ ] Add lightweight telemetry for notification frequency by type
