# Autonomous UI/UX Code Audit Report

## Phase 1: UI Reconnaissance

- **Frontend Framework**: React Native (Expo SDK 54)
- **Styling Ecosystem**: React Native `StyleSheet.create`. No centralized theme, design tokens, or global stylesheet found.
- **Routing**: `@react-navigation/native` (Stack & Tabs).
- **State Management**: `zustand` (`src/store/useAppStore.ts`) & `expo-sqlite` for persistence.

## Phase 2-4: Targeted UI/UX Analysis & Validation Findings

---

### Issue 1: Missing Accessibility Roles and Labels

**Category**: Accessibility (a11y)
**Location**: `src/screens/HomeScreen.tsx` (e.g., lines 193-206) and ~95% of other screens containing `TouchableOpacity`.
**UX Impact**: Screen readers (VoiceOver/TalkBack) cannot announce interactive elements like buttons properly. Users relying on assistive technologies will hear raw text or "unlabeled button", making the app nearly unusable.
**Remediation**:
Add `accessibilityRole="button"` and meaningful `accessibilityLabel` props to all custom `TouchableOpacity` and `Pressable` components.

```diff
<<<<<<< SEARCH
          <TouchableOpacity
            style={styles.notesHubCard}
            onPress={() => navigation.navigate('NotesHub')}
            activeOpacity={0.85}
            testID="notes-hub-btn"
          >
=======
          <TouchableOpacity
            style={styles.notesHubCard}
            onPress={() => navigation.navigate('NotesHub')}
            activeOpacity={0.85}
            testID="notes-hub-btn"
            accessibilityRole="button"
            accessibilityLabel="Open Knowledge Vault, My Notes"
          >
>>>>>>> REPLACE
```

---

### Issue 2: Hardcoded "Magic Number" Colors and Typography

**Category**: Consistency
**Location**: `src/screens/SettingsScreen.tsx` (lines ~540-620), `src/screens/HomeScreen.tsx`, and all other styling files.
**UX Impact**: The app uses hardcoded hex values (e.g., `#0F0F14`, `#6C63FF`, `#1A1A24`). This makes it impossible to globally change the color scheme, support light/dark mode reliably, or ensure contrast ratios remain accessible. It also creates a brittle UI where one screen might use `#0F0F14` while another uses `#0A0A0A`.
**Remediation**:
Since no centralized theme object exists, a `theme.ts` should be created and imported into all files.

```diff
<<<<<<< SEARCH
  safe: { flex: 1, backgroundColor: '#0F0F14' },
  content: { padding: 16, paddingBottom: 60 },
  title: { color: '#fff', fontSize: 26, fontWeight: '900', marginBottom: 8, marginTop: 8 },
=======
  // Example of using a theme object (assuming `import { theme } from '../theme'`)
  safe: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  title: { color: theme.colors.textPrimary, fontSize: theme.typography.h1.size, fontWeight: theme.typography.h1.weight, marginBottom: theme.spacing.sm, marginTop: theme.spacing.sm },
>>>>>>> REPLACE
```

---

### Issue 3: Hardcoded Pixel Layouts Neglecting Viewport Responsiveness

**Category**: Responsiveness
**Location**: `src/screens/StatsScreen.tsx` (lines 351-380) and throughout.
**UX Impact**: Components have fixed padding and font sizes (e.g., `fontSize: 14`, `padding: 24`). While `useResponsive.ts` provides scaling functions (`s()`, `f()`, `sz()`), they are rarely used within the actual `StyleSheet.create` calls. This causes UI components to look incredibly small on tablets or overflow on smaller phones.
**Remediation**:
Wrap fixed values with the responsive scaling utility hooks provided in `useResponsive.ts` or leverage responsive flex layouts.

```diff
<<<<<<< SEARCH
  projectionVal: { color: '#6C63FF', fontSize: 36, fontWeight: '900' },
=======
  // Using a hypothetical dynamic style approach with the existing `useResponsive` hook:
  // (Requires refactoring StyleSheet to dynamic styles or passing the scale factor)
  // projectionVal: { color: '#6C63FF', fontSize: f(36), fontWeight: '900' },
>>>>>>> REPLACE
```

---

### Issue 4: Poor Perceived Performance on Heavy Computations

**Category**: Perceived UX
**Location**: `src/screens/StatsScreen.tsx` (lines 37-114).
**UX Impact**: `loadStats()` loops through the entire SQLite database synchronously. While `LoadingOrb` is rendered initially, the UI thread blocks heavily during SQLite iteration. On older devices, the screen will freeze momentarily before the stats finally render.
**Remediation**:
Offload heavy synchronous data crunching to asynchronous chunks (`setTimeout`, `InteractionManager`, or Web Workers/Reanimated Worklets if available) or shift the SQL aggregations strictly into the database query itself to avoid JS-side array looping.

```diff
<<<<<<< SEARCH
    const breakdown = subjects.map(sub => {
      const subTopics = allTopics.filter(t => t.subjectId === sub.id);
=======
    // Defer heavy processing to allow UI to breathe
    await new Promise(resolve => setTimeout(resolve, 0));
    const breakdown = subjects.map(sub => {
      const subTopics = allTopics.filter(t => t.subjectId === sub.id);
>>>>>>> REPLACE
```
