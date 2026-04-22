# Guru Alert Redesign Design

## Goal

Replace most native `Alert.alert(...)` usage with a themed, reusable feedback system that feels calm and premium while matching Guru's existing dark glass UI direction.

## Current State

- The app currently uses `Alert.alert(...)` in 238 places across 43 source files.
- Native alerts ignore Guru theme tokens and break the visual continuity of the app.
- Recent UI work is already moving toward glass-themed surfaces and premium dark cards, so alerts should align with that direction.

## Design Direction

### Chosen Visual Style

`Mission Control Premium`

- Dark layered surfaces with a subtle glass feel
- Restrained violet accenting derived from existing brand colors
- Quiet, premium presentation rather than loud motivational styling
- Strong typography hierarchy with soft secondary copy
- Rounded corners, generous spacing, subtle elevation, and short lift/fade animations

### Tone

- Default tone is calm, premium, and controlled
- Status differences should be communicated through small semantic cues, not aggressive color blocks
- More intense language or stronger danger styling is reserved for flows like punishment, lockdown, or destructive actions

## Interaction Model

### 1. Toast

Use for lightweight, non-blocking feedback.

Examples:

- Copied
- Saved
- Synced
- Backup created
- Note added

Behavior:

- Auto-dismisses
- Supports icon and variant tint
- Does not interrupt the user

### 2. Dialog

Use for blocking confirmations, destructive actions, and important errors.

Examples:

- Delete transcript?
- Leave session?
- Clear AI cache?
- Restore backup?

Behavior:

- Centered modal
- Title, body, optional badge/icon
- Primary and secondary actions
- Optional destructive action
- Only one dialog visible at a time
- Outside tap and Android back dismissal only for low-risk dialogs
- Destructive dialogs must stay explicit and require an action button
- Dialog actions use a consistent shape:
  - `id`
  - `label`
  - `variant`
  - `onPress`
  - `isDestructive?`
  - `isLoading?`
- `showDialog(...)` should resolve with an explicit result such as `actionId | 'dismissed'`
- Action order must stay stable for accessibility and muscle memory
- Screen readers should announce the title first when the dialog opens

### 3. Sheet

Use for richer choices that need more explanation or multiple actions.

Examples:

- Transcript processing options
- Backup/import choices
- Lecture-related branching actions

Behavior:

- Bottom sheet layout
- Supports grouped actions and richer explanatory content

## Architecture

Add one global feedback layer near the app root:

- `DialogHost`
- `ToastHost`
- optional `SheetHost` later

Host placement must be explicit:

- Mount the hosts above the app's `NavigationContainer` or through a root-level portal guaranteed to sit above native-stack modal presentations
- Do not mount the dialog layer inside individual screens or tab stacks
- Bootstrap and service-layer calls must be able to fall back safely before the hosts mount

Expose a simple app-facing API:

- `showToast({ title, message, variant })`
- `showDialog({ title, message, variant, actions })`
- `showError(error, fallbackMessage?)`

This keeps screens and services from directly depending on native `Alert.alert(...)` for normal in-app feedback.

Compatibility requirements:

- Keep the current imperative `showToast(message, type?, onPress?, duration?)` API working during migration
- Add the object-based API as an overload or wrapper, not as a phase-1 breaking change
- Do not require a repo-wide signature rewrite to start migrating alerts

## Styling Rules

The feedback system should extend the existing theme from [`src/constants/theme.ts`](../../../src/constants/theme.ts), not create a second design system.

Use these principles:

- Reuse current dark surface and semantic color tokens
- Add only a few alert-specific semantic variants:
  - `default`
  - `success`
  - `warning`
  - `error`
  - `focus`
  - `destructive`
- Primary action uses the branded filled style
- Secondary action uses a muted ghost/outline style
- Destructive action uses tinted danger styling, never the default primary style

## Migration Strategy

### Phase 1

Build shared primitives:

- `GuruToast`
- `GuruDialog`
- provider/host wiring

### Phase 2

Migrate highest-value cases first:

- obvious success/info alerts to toast
- destructive confirmations to dialog
- high-traffic files such as Settings, Session, Lecture, and Syllabus flows

### Phase 3

Add sheet support where dialogs are too cramped.

### Native Alert Exceptions

Keep native `Alert.alert(...)` only where custom UI is risky or not worth forcing:

- OS-adjacent permission prompts
- early bootstrap failure states
- rare edge cases where no safe mounted host exists

Fallback behavior:

- If `ToastHost` is not mounted, low-risk toasts may degrade to a logged warning as they do today
- If `DialogHost` is not mounted and a blocking confirmation or error is required, fall back to native `Alert.alert(...)`
- Service or bootstrap code may use this fallback until the host layer is confirmed mounted

## Testing

- Add logic tests for queueing, dismissal, and action invocation
- Verify that destructive actions remain explicit and safe
- Keep migration incremental instead of replacing all 238 call sites at once

## Success Criteria

- Most in-app alerts visually match Guru's premium dark glass direction
- Lightweight messages become toasts instead of blocking popups
- Confirmations and destructive actions become themed dialogs
- Native alerts remain only for system-critical edge cases
- The migration is incremental and does not require navigation rewrites
