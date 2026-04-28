# Action Hub Custom Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Action Hub feel denser + less grey by switching to a compact external-app launcher grid and adding a customizable 6-item Tools grid (configured in Settings).

**Architecture:** Persist a `actionHubTools` array on `user_profile` (JSON in TEXT, consistent with provider order fields). Action Hub renders an “effective” list (saved order filtered to allowlist + defaults). Settings provides pick-6 + reorder + reset.

**Tech Stack:** React Native (Expo), TypeScript, expo-sqlite + Drizzle migrations, existing Settings UI components (ProviderOrderEditor, SettingsSectionAccordion).

---

### Task 1: Add Action Hub tool registry + defaults

**Files:**

- Create: [actionHubTools.ts](file:///Users/vishnugnair/Guru-3/src/constants/actionHubTools.ts)

- [ ] **Step 1: Create tool ids, defaults, and metadata**

```ts
export const ACTION_HUB_TOOL_IDS = [
  'StudyPlan',
  'QuestionBank',
  'Flashcards',
  'NotesVault',
  'TranscriptVault',
  'RecordingVault',
  'Stats',
  'ImageVault',
  'NotesSearch',
  'DeviceLink',
  'Settings',
] as const;

export type ActionHubToolId = (typeof ACTION_HUB_TOOL_IDS)[number];

export const DEFAULT_ACTION_HUB_TOOLS: ActionHubToolId[] = [
  'StudyPlan',
  'QuestionBank',
  'Flashcards',
  'NotesVault',
  'TranscriptVault',
  'RecordingVault',
];

export const ACTION_HUB_TOOL_META: Record<
  ActionHubToolId,
  { label: string; icon: string; tab: 'MenuTab'; screen: string }
> = {
  StudyPlan: { label: 'Study Plan', icon: 'calendar-outline', tab: 'MenuTab', screen: 'StudyPlan' },
  QuestionBank: {
    label: 'Question Bank',
    icon: 'help-circle-outline',
    tab: 'MenuTab',
    screen: 'QuestionBank',
  },
  Flashcards: { label: 'Flashcards', icon: 'albums-outline', tab: 'MenuTab', screen: 'Flashcards' },
  NotesVault: {
    label: 'Notes Vault',
    icon: 'library-outline',
    tab: 'MenuTab',
    screen: 'NotesVault',
  },
  TranscriptVault: {
    label: 'Transcript Vault',
    icon: 'document-text-outline',
    tab: 'MenuTab',
    screen: 'TranscriptVault',
  },
  RecordingVault: {
    label: 'Recordings',
    icon: 'mic-outline',
    tab: 'MenuTab',
    screen: 'RecordingVault',
  },
  Stats: { label: 'Stats', icon: 'bar-chart-outline', tab: 'MenuTab', screen: 'Stats' },
  ImageVault: {
    label: 'Image Vault',
    icon: 'images-outline',
    tab: 'MenuTab',
    screen: 'ImageVault',
  },
  NotesSearch: {
    label: 'Notes Search',
    icon: 'search-outline',
    tab: 'MenuTab',
    screen: 'NotesSearch',
  },
  DeviceLink: { label: 'Device Link', icon: 'link-outline', tab: 'MenuTab', screen: 'DeviceLink' },
  Settings: { label: 'Settings', icon: 'settings-outline', tab: 'MenuTab', screen: 'Settings' },
};
```

---

### Task 2: Persist actionHubTools on user_profile (DB + mapping + default)

**Files:**

- Modify: [drizzleSchema.ts](file:///Users/vishnugnair/Guru-3/src/db/drizzleSchema.ts)
- Create: [0004_action_hub_tools.sql](file:///Users/vishnugnair/Guru-3/src/db/drizzle-migrations/0004_action_hub_tools.sql)
- Modify: [migrations.js](file:///Users/vishnugnair/Guru-3/src/db/drizzle-migrations/migrations.js)
- Modify: [\_journal.json](file:///Users/vishnugnair/Guru-3/src/db/drizzle-migrations/meta/_journal.json)
- Modify: [database.ts](file:///Users/vishnugnair/Guru-3/src/db/database.ts)
- Modify: [drizzleProfileMapper.ts](file:///Users/vishnugnair/Guru-3/src/db/utils/drizzleProfileMapper.ts)
- Modify: [index.ts](file:///Users/vishnugnair/Guru-3/src/types/index.ts)

- [ ] **Step 1: Add column to Drizzle schema**

```ts
  actionHubTools: text('action_hub_tools').notNull().default('[]'),
```

- [ ] **Step 2: Add migration**

```sql
ALTER TABLE `user_profile` ADD COLUMN `action_hub_tools` text DEFAULT '[]' NOT NULL;
```

- [ ] **Step 3: Wire migration into Expo Drizzle migrator**

```js
import m0004 from './0004_action_hub_tools.sql';
...
  migrations: {
    ...
    m0004,
  },
```

Update `_journal.json` by appending an entry:

```json
{
  "idx": 4,
  "version": "6",
  "when": 1777600000000,
  "tag": "0004_action_hub_tools",
  "breakpoints": true
}
```

- [ ] **Step 4: Add defensive column recovery for backups**

In `ensureCriticalColumns()` `user_profile` list, add:

```ts
['action_hub_tools', "TEXT NOT NULL DEFAULT '[]'"],
```

- [ ] **Step 5: Add type to UserProfile**

In `src/types/index.ts`:

```ts
import type { ActionHubToolId } from '../constants/actionHubTools';

export interface UserProfile {
  ...
  actionHubTools?: ActionHubToolId[];
}
```

- [ ] **Step 6: Parse + stringify in profile mapper**

In `mapUserProfileRow()`:

```ts
actionHubTools: (() => {
  try {
    return JSON.parse(row.actionHubTools ?? '[]') as string[];
  } catch {
    return [];
  }
})(),
```

In `mapToDrizzleUpdate()` JSON section:

```ts
if ('actionHubTools' in updates) {
  drizzleUpdate.actionHubTools = JSON.stringify(updates.actionHubTools ?? []);
}
```

---

### Task 3: Add sanitize + “effective tools” resolver

**Files:**

- Create: [actionHubTools.ts](file:///Users/vishnugnair/Guru-3/src/utils/actionHubTools.ts)
- Test: [actionHubTools.unit.test.ts](file:///Users/vishnugnair/Guru-3/src/utils/actionHubTools.unit.test.ts)

- [ ] **Step 1: Implement allowlist filtering + default fill**

```ts
import {
  ACTION_HUB_TOOL_IDS,
  DEFAULT_ACTION_HUB_TOOLS,
  type ActionHubToolId,
} from '../constants/actionHubTools';

export function sanitizeActionHubTools(value: unknown): ActionHubToolId[] {
  const allowed = new Set<ActionHubToolId>(ACTION_HUB_TOOL_IDS);
  const input = Array.isArray(value) ? (value as unknown[]) : [];
  const cleaned: ActionHubToolId[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;
    if (!allowed.has(v as ActionHubToolId)) continue;
    if (cleaned.includes(v as ActionHubToolId)) continue;
    cleaned.push(v as ActionHubToolId);
  }
  const filled = [...cleaned];
  for (const d of DEFAULT_ACTION_HUB_TOOLS) {
    if (filled.length >= 6) break;
    if (!filled.includes(d)) filled.push(d);
  }
  return filled.slice(0, 6);
}
```

- [ ] **Step 2: Unit test sanitize behavior**

```ts
import { sanitizeActionHubTools } from './actionHubTools';

describe('sanitizeActionHubTools', () => {
  it('filters unknown + de-dupes + pads to 6', () => {
    expect(sanitizeActionHubTools(['StudyPlan', 'StudyPlan', 'nope', 'Flashcards'])).toHaveLength(
      6,
    );
  });

  it('caps to 6', () => {
    expect(
      sanitizeActionHubTools([
        'StudyPlan',
        'QuestionBank',
        'Flashcards',
        'NotesVault',
        'TranscriptVault',
        'RecordingVault',
        'Stats',
      ]),
    ).toEqual([
      'StudyPlan',
      'QuestionBank',
      'Flashcards',
      'NotesVault',
      'TranscriptVault',
      'RecordingVault',
    ]);
  });
});
```

---

### Task 4: Settings UI — pick 6 + reorder + reset

**Files:**

- Create: [ActionHubToolsPicker.tsx](file:///Users/vishnugnair/Guru-3/src/screens/settings/components/ActionHubToolsPicker.tsx)
- Modify: [useSettingsController.ts](file:///Users/vishnugnair/Guru-3/src/screens/settings/hooks/useSettingsController.ts)
- Modify: [AppearanceSection.tsx](file:///Users/vishnugnair/Guru-3/src/screens/settings/sections/AppearanceSection.tsx)

- [ ] **Step 1: Add controller state**

Add state:

```ts
const [actionHubTools, setActionHubTools] = useState<string[]>([]);
```

Hydrate from profile:

```ts
setActionHubTools(profile.actionHubTools ?? []);
```

Include in auto-save payload:

```ts
actionHubTools,
```

Return from controller object so `SettingsCategoryContent` receives it.

- [ ] **Step 2: Build picker component**

`ActionHubToolsPicker` responsibilities:

- Show current 6 (labels)
- “Choose tools” opens modal list of all tools
- Enforce max 6 selections
- “Reset” sets `DEFAULT_ACTION_HUB_TOOLS`
- Use `ProviderOrderEditor` to reorder the selected 6

- [ ] **Step 3: Add Appearance section UI**

In `AppearanceSection`, add a new `SectionToggle`:

- Title: “Action Hub”
- Shows `ActionHubToolsPicker`

---

### Task 5: Action Hub UI changes (TabNavigator)

**Files:**

- Modify: [TabNavigator.tsx](file:///Users/vishnugnair/Guru-3/src/navigation/TabNavigator.tsx)

- [ ] **Step 1: Compute effective tools list**

Use `sanitizeActionHubTools(profile?.actionHubTools)` and map to `ACTION_HUB_TOOL_META`.

- [ ] **Step 2: Replace “manual actions” list with Tools (6) grid**

Render as a compact 3×2 grid (icon + label), to avoid empty space.

- [ ] **Step 3: Keep external apps compact (no tiles)**

Keep the existing icon-circle grid, but move it above the Tools section.

- [ ] **Step 4: Make sheet less grey / more black**

Adjust these style tokens in `styles`:

- `sheet.backgroundColor` closer to `rgba(0,0,0,0.94)`
- `sheetFrostLayer.backgroundColor` closer to `rgba(255,255,255,0.01)` (or remove if it still reads grey)
- Consider slightly stronger border for contrast on pure black (`n.colors.borderHighlight`)

---

### Task 6: Verification

**Files:**

- Test: existing Jest suite

- [ ] **Step 1: Run unit tests**

Run:

```bash
npm test
```

- [ ] **Step 2: Run CI verification gate**

Run:

```bash
npm run verify:ci
```

- [ ] **Step 3: Manual check on Android**
- Open Action Hub and confirm:
  - External app icons remain fast to hit
  - Tools grid shows 6 items and navigates correctly
  - Settings → Appearance → Action Hub updates the grid order immediately after auto-save
