# Settings Screen Redesign Plan

## 1. Goal

Refactor and redesign the internals of the Settings screens to eliminate "random wide tiles" (`BentoCard`) and enforce a strict, standardized layout using the app's established collapsible `SettingsSectionAccordion` (`SectionToggle`) component for all settings categories. Consolidate and clean up messy subsections, dummy buttons, and misplaced settings.

## 2. Layout Standardization Rule

- **No more `BentoCard`**: The `BentoCard` component will be completely removed from all settings sections to eliminate the "random wide tiles" look.
- **Universal Wrapper**: Every logical grouping of settings will be wrapped in a `SectionToggle` (which renders as a `GlassSurface` accordion).
- **Consistent Icons & Tints**: Every `SectionToggle` will have a relevant `Ionicons` icon and a distinct, theme-appropriate tint color.

## 3. Refactoring by Category

### Profile (`GeneralOverviewSection.tsx`)

- Replace the two `BentoCard`s.
- Unwrap the nested `ProfileSection` accordion.
- Create two top-level toggles:
  - `SectionToggle` (id="profile_identity", title="Identity", icon="person", tint="#8EC5FF")
  - `SectionToggle` (id="profile_appearance", title="Appearance", icon="color-palette", tint="#EAB308")

### Planning (`PlanningAlertsSection.tsx`)

- Replace the four `BentoCard`s with top-level toggles:
  - `SectionToggle` (id="plan_exams", title="Target Exams", icon="calendar", tint="#F6AD55")
  - `SectionToggle` (id="plan_timeline", title="Study Plan Timeline", icon="time", tint="#A78BFA")
  - `SectionToggle` (id="plan_goals", title="Session Timings & Goals", icon="hourglass", tint="#10B981")
  - `SectionToggle` (id="plan_reminders", title="Reminders & Wake Up", icon="notifications", tint="#F472B6")
  - `SectionToggle` (id="plan_novelty", title="Novelty Configuration", icon="refresh", tint="#38BDF8")

### Interventions (`InterventionsSection.tsx`)

- Replace the four `BentoCard`s with top-level toggles:
  - `SectionToggle` (id="interv_flow", title="Interventions & Study Flow", icon="shield", tint="#F87171")
  - `SectionToggle` (id="interv_breaks", title="Session Rules & Breaks", icon="cafe", tint="#60A5FA")
  - `SectionToggle` (id="interv_pomodoro", title="Pomodoro (Lecture Overlay)", icon="timer", tint="#FB923C")
  - `SectionToggle` (id="interv_subjects", title="Focus Subjects", icon="book", tint="#34D399")
  - `SectionToggle` (id="interv_content", title="Content Type Preferences", icon="layers", tint="#A78BFA")

### Integrations (`AppIntegrationsSection.tsx`)

- Replace `BentoCard`s with:
  - `SectionToggle` (id="integ_links", title="Integrations & Links", icon="link", tint="#10B981")
  - `SectionToggle` (id="integ_permissions", title="Permissions & Diagnostics", icon="key", tint="#FBBF24")
- **Action:** Move the "Open System Settings" and "Open Dev Console" buttons OUT of here and into the Advanced category.

### AI Configurations (`AiProvidersSection.tsx` & sub-components)

- **Current state:** One massive `SectionToggle` wrapping 12 `SubSectionToggle`s.
- **Action:** Remove the top-level wrapper. Promote the important subsections to be top-level `SectionToggle`s:
  - `SectionToggle` (id="ai_chat_model", title="Chat Model", icon="chatbubbles", tint="#6C63FF")
  - `SectionToggle` (id="ai_memory", title="Guru Memory", icon="brain", tint="#EC4899")
  - `SectionToggle` (id="ai_keys", title="API Keys", icon="key", tint="#F59E0B")
  - `SectionToggle` (id="ai_routing", title="Cloud Routing Priority", icon="git-network", tint="#3B82F6")
  - `SectionToggle` (id="ai_image", title="Image Generation", icon="image", tint="#8B5CF6")
  - `SectionToggle` (id="ai_transcription", title="Audio Transcription", icon="mic", tint="#10B981")
  - `SectionToggle` (id="ai_local", title="Local Inference", icon="hardware-chip", tint="#6366F1")
- **Action:** Consolidate the 5 separate OAuth sections (ChatGPT, Copilot, GitLab, Poe, Qwen) into a single `SectionToggle` (id="ai_oauth", title="Connected AI Accounts", icon="link", tint="#14B8A6") to reduce clutter.

### Storage (`StorageSections.tsx`)

- **Current state:** Uses `SectionToggle` but has fake "subsections" built with dividers and raw text.
- **Action:** Split into clean top-level toggles:
  - `SectionToggle` (id="storage_data", title="Data Management", icon="trash-outline", tint="#F44336")
  - `SectionToggle` (id="storage_backup", title="Unified Backup", icon="archive-outline", tint="#4CAF50")
  - `SectionToggle` (id="storage_gdrive", title="Google Drive Sync", icon="logo-google", tint="#4285F4")
  - `SectionToggle` (id="storage_maintenance", title="Library Maintenance", icon="construct", tint="#8080A0")

### Advanced Category (`SettingsScreen.tsx`)

- **Current state:** Renders a dummy "Developer Options" block.
- **Action:** Create a functional `SectionToggle` (id="adv_developer", title="Developer Options", icon="code-slash", tint="#ef4444").
- Move the `Open System Settings` and `Open Dev Console` buttons into this section.

### Dashboard (`DashboardOverview.tsx`)

- Instead of using `BentoCard` (which is being retired), use the native `LinearSurface` primitive for the dashboard cards to maintain the grid look but conform to the app's primitive theme layer.

## 4. Implementation Steps

1. Edit `GeneralOverviewSection.tsx`, `PlanningAlertsSection.tsx`, `InterventionsSection.tsx`, `AppIntegrationsSection.tsx` to replace `BentoCard` with `SectionToggle`.
2. Edit `SettingsScreen.tsx` to pass `SectionToggle` to `DashboardOverview` (if needed) or update `DashboardOverview.tsx` to use `LinearSurface`.
3. Fix the "Advanced" view in `SettingsScreen.tsx` to use `SectionToggle` and include the dev buttons.
4. Refactor `AiProvidersSection.tsx` to map its subsections to `SectionToggle` and group the OAuth buttons.
5. Refactor `StorageSections.tsx` to extract "Google Drive" and "Auto-Backup Frequency" into dedicated toggles or proper components.
6. Verify all imports and remove unused `BentoCard` references.
