# Icon Meaning Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace “generic / wrong” icons with semantically correct Remix icons across the app, using the existing Ionicons-name compatibility layer (meaning-first).

**Architecture:** Keep all existing `Ionicons`/`Icon` call sites unchanged. Improve correctness by (1) upgrading the Ionicons-name → Remix-name resolver, and (2) fixing central “semantic maps” (provider meta, settings categories, external apps) that currently choose poor icon keys.

**Tech Stack:** TypeScript, Expo, `react-native-remix-icon`

---

### Task 1: Inventory Current Icon Names + Usage Hotspots

**Files:**

- Modify: none (analysis only)

- [ ] **Step 1: Extract unique icon names used in `src/`**

Run:

```bash
node - <<'NODE'
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'android' || ent.name === 'ios') continue;
      walk(p, out);
    } else if (ent.isFile()) {
      if (/\.(ts|tsx|js|jsx)$/.test(ent.name)) out.push(p);
    }
  }
  return out;
}

const files = walk(path.join(process.cwd(), 'src'));
const counts = new Map();
const re = /\bname=\"([a-z0-9-]+)\"/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(s))) {
    const name = m[1];
    counts.set(name, (counts.get(name) || 0) + 1);
  }
}
const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
console.log('unique', sorted.length);
console.log(sorted.slice(0, 120).map(([n, c]) => `${c}\t${n}`).join('\n'));
NODE
```

Expected: prints a ranked list. Use the top 30–50 names for mapping improvements first.

---

### Task 2: Expand the Compatibility Resolver (Meaning-First)

**Files:**

- Modify: [remixIconCompat.ts](file:///Users/vishnugnair/Guru-3/src/components/primitives/remixIconCompat.ts)
- Modify: [index.tsx (Ionicons shim)](file:///Users/vishnugnair/Guru-3/shims/expo-vector-icons/index.tsx)

- [ ] **Step 1: Add / adjust COMPAT entries for high-frequency names**

Update `COMPAT` to ensure good semantic mappings for:

- chevrons/arrows (`chevron-forward`, `chevron-back`, `arrow-back`, `arrow-forward`)
- destructive actions (`trash-outline`, `trash-bin-outline`)
- documents/clipboard/copy (`copy-outline`, `clipboard-outline`, `document-text-outline`, `document-attach-outline`)
- search/info/warn/alert (`search-outline`, `information-circle-outline`, `warning-outline`, `alert-circle-outline`)
- refresh/reload (`refresh`, `refresh-outline`, `reload`)
- app/navigation essentials (`settings-outline`, `link-outline`, `open-outline`)
- time/plan related (`time-outline`, `calendar-outline`)

Goal: the most common names should resolve to obviously correct Remix icons, not “closest-but-wrong”.

- [ ] **Step 2: Ensure outline names default to fill for non-stateful icons**

In the Ionicons shim, keep the rule:

- only treat outline as “line” for the tab base icons (`home/grid/chatbubbles/menu`)
- everything else uses fill even if the input ends with `-outline`

This preserves your preference: solids everywhere except stateful UI.

- [ ] **Step 3: Add a resolver unit test**

Create `src/components/primitives/remixIconCompat.unit.test.ts`:

```ts
import { resolveRemixIconName } from './remixIconCompat';

describe('resolveRemixIconName', () => {
  it('maps common Ionicons names to meaningful remix icons', () => {
    expect(resolveRemixIconName('trash-outline', 'filled')).toMatch(/delete/);
    expect(resolveRemixIconName('copy-outline', 'filled')).toMatch(/copy/);
    expect(resolveRemixIconName('alert-circle-outline', 'filled')).toMatch(/alert/);
  });
});
```

- [ ] **Step 4: Run unit tests**

Run:

```bash
npm run test:unit
```

Expected: PASS.

---

### Task 3: Fix “Bad Source” Icon Tables (Semantic Maps)

**Files:**

- Modify: [GuruChatModelSelector.tsx](file:///Users/vishnugnair/Guru-3/src/components/chat/GuruChatModelSelector.tsx)
- Modify: [ApiKeyRow.tsx](file:///Users/vishnugnair/Guru-3/src/screens/settings/sections/ai-providers/components/ApiKeyRow.tsx)
- Modify: [externalApps.ts](file:///Users/vishnugnair/Guru-3/src/constants/externalApps.ts)

- [ ] **Step 1: Replace obviously wrong provider icons with meaning-first choices**

Examples:

- ChatGPT/Codex: use `openai-*` (meaning: “OpenAI/ChatGPT”) rather than a random tech icon
- Gemini/AI Studio: use `gemini-*`
- GitHub Models/Copilot: use `github-*`
- GitLab Duo: use `gitlab-*`

Keep anything that is already semantically correct (mic/search/cloud/server/router).

- [ ] **Step 2: External apps: upgrade generic icons to medically meaningful ones**

For EXTERNAL_APPS and tab action hub icons, choose icons that match:

- anatomy/bone
- pathology/microscope
- pharma/pill
- surgery/scalpel
- youtube → youtube icon (already available)

If no perfect match exists, prefer “closest medical meaning” over generic.

- [ ] **Step 3: Run CI verification**

Run:

```bash
npm run verify:ci
```

Expected: PASS.

---

### Task 4: Visual Spot-Checks (Manual)

**Files:**

- Modify: none

- [ ] **Step 1: Check model picker + provider settings visually**

Targets:

- Chat model picker provider chips
- Settings → AI Providers (key cards)
- Home external app launcher row

Expected: no “random generic” icons where a clear meaning/brand exists.
