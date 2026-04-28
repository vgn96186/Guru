# TTS Engines (System + Edge + Piper) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tap-to-speak TTS across GuruChat and Study Sessions with a global engine selector (System via expo-speech, Edge TTS unofficial, optional Piper local offline).

**Architecture:** Introduce `ttsService` as a single router API used by UI. Engines are swappable modules. On any failure, router falls back to System TTS and never blocks UI.

**Tech Stack:** Expo SDK 54, TypeScript, `expo-speech`, `expo-audio`, `expo-file-system`, `expo-crypto`, Drizzle ORM + SQLite migrations.

---

## File Map (Create / Modify)

**Create**

- `src/services/tts/ttsService.ts`
- `src/services/tts/textForTts.ts`
- `src/services/tts/engines/systemTtsEngine.ts`
- `src/services/tts/engines/edgeTtsEngine.ts`
- `src/services/tts/engines/piperTtsEngine.ts`
- `src/screens/settings/sections/ai-providers/subsections/TtsSection.tsx`
- `src/services/tts/__tests__/textForTts.unit.test.ts`
- `src/services/tts/__tests__/ttsService.unit.test.ts`
- `src/db/drizzle-migrations/0005_tts_settings.sql`

**Modify**

- `src/types/index.ts` (UserProfile fields)
- `src/db/drizzleSchema.ts` (user_profile columns)
- `src/db/database.ts` (`ensureCriticalColumns` list)
- `src/db/utils/drizzleProfileMapper.ts` (default profile + mapping)
- `src/screens/settings/sections/ai-providers/index.tsx` (render new TTS section)
- `src/screens/settings/hooks/useSettingsController.ts` (hydrate + autosave settings fields)
- GuruChat message UI file(s) (add speak button per assistant message)
- Session card UI file(s) (add speak button per content card)

---

### Task 1: Persist TTS Settings (DB + Types)

**Files:**

- Modify: [index.ts](file:///Users/vishnugnair/Guru-3/src/types/index.ts)
- Modify: [drizzleSchema.ts](file:///Users/vishnugnair/Guru-3/src/db/drizzleSchema.ts)
- Create: `src/db/drizzle-migrations/0005_tts_settings.sql`
- Modify: [database.ts](file:///Users/vishnugnair/Guru-3/src/db/database.ts)
- Modify: [drizzleProfileMapper.ts](file:///Users/vishnugnair/Guru-3/src/db/utils/drizzleProfileMapper.ts)
- Test: `src/db/testing/drizzleSchemaParity.unit.test.ts` (existing)

- [ ] **Step 1: Add `UserProfile` fields**

Add to `UserProfile`:

```ts
ttsEngine?: 'system' | 'edge' | 'piper';
ttsRate?: number;
ttsPitch?: number;
ttsSystemVoiceId?: string | null;
ttsEdgeVoiceName?: string | null;
ttsPiperVoiceId?: string | null;
```

- [ ] **Step 2: Add columns to Drizzle `userProfile` table**

Add to `userProfile` in `drizzleSchema.ts`:

```ts
ttsEngine: text('tts_engine').notNull().default('system'),
ttsRate: real('tts_rate').notNull().default(1),
ttsPitch: real('tts_pitch').notNull().default(1),
ttsSystemVoiceId: text('tts_system_voice_id'),
ttsEdgeVoiceName: text('tts_edge_voice_name'),
ttsPiperVoiceId: text('tts_piper_voice_id'),
```

- [ ] **Step 3: Add migration**

Create `src/db/drizzle-migrations/0005_tts_settings.sql`:

```sql
ALTER TABLE `user_profile` ADD COLUMN `tts_engine` text NOT NULL DEFAULT 'system';
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `tts_rate` real NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `tts_pitch` real NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `tts_system_voice_id` text;
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `tts_edge_voice_name` text;
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN `tts_piper_voice_id` text;
```

- [ ] **Step 4: Add defensive columns for backups**

In `ensureCriticalColumns()` add:

```ts
['tts_engine', "TEXT NOT NULL DEFAULT 'system'"],
['tts_rate', 'REAL NOT NULL DEFAULT 1'],
['tts_pitch', 'REAL NOT NULL DEFAULT 1'],
['tts_system_voice_id', 'TEXT'],
['tts_edge_voice_name', 'TEXT'],
['tts_piper_voice_id', 'TEXT'],
```

- [ ] **Step 5: Map fields in `drizzleProfileMapper`**

1. Add defaults in `createDefaultUserProfile()`:

```ts
ttsEngine: 'system',
ttsRate: 1,
ttsPitch: 1,
ttsSystemVoiceId: null,
ttsEdgeVoiceName: null,
ttsPiperVoiceId: null,
```

2. Map DB row → profile:

```ts
ttsEngine: (row.ttsEngine as any) ?? 'system',
ttsRate: row.ttsRate ?? 1,
ttsPitch: row.ttsPitch ?? 1,
ttsSystemVoiceId: row.ttsSystemVoiceId ?? null,
ttsEdgeVoiceName: row.ttsEdgeVoiceName ?? null,
ttsPiperVoiceId: row.ttsPiperVoiceId ?? null,
```

3. Add to `directMappings` and `numericFields` in `mapToDrizzleUpdate`.

- [ ] **Step 6: Run tests to ensure schema parity**

Run:

```bash
npm test -- src/db/testing/drizzleSchemaParity.unit.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit (optional)**

```bash
git add src/types/index.ts src/db/drizzleSchema.ts src/db/drizzle-migrations/0005_tts_settings.sql src/db/database.ts src/db/utils/drizzleProfileMapper.ts
git commit -m "feat: persist TTS settings in user profile"
```

---

### Task 2: Settings UI (Global TTS Section)

**Files:**

- Create: `src/screens/settings/sections/ai-providers/subsections/TtsSection.tsx`
- Modify: `src/screens/settings/sections/ai-providers/index.tsx`
- Modify: `src/screens/settings/hooks/useSettingsController.ts`

- [ ] **Step 1: Add controller state and hydration**

In `useSettingsController.ts`:

- Add state:
  - `ttsEngine`, `ttsRate`, `ttsPitch`, `ttsSystemVoiceId`, `ttsEdgeVoiceName`
- In the profile hydration effect (where other fields are set), load these from `profile`.

- [ ] **Step 2: Add autosave fields**

In `doAutoSave()`, include:

```ts
ttsEngine,
ttsRate: Number(ttsRate),
ttsPitch: Number(ttsPitch),
ttsSystemVoiceId,
ttsEdgeVoiceName,
ttsPiperVoiceId,
```

- [ ] **Step 3: Create `TtsSection` UI**

Use existing settings primitives (`SettingsModelDropdown`, toggle rows, etc.) to render:

- Engine dropdown: `system`, `edge`, `piper`
- Rate slider: 0.7 → 1.2 (reasonable bounds)
- Pitch slider: 0.7 → 1.3
- Voice selectors:
  - System: show a simplified list (name + language) from `expo-speech` voices
  - Edge: curated list of voice names (static array)
  - Piper: placeholder “Manage models” until engine is implemented
- “Test voice” button: calls `ttsService.speak(sampleText)`

- [ ] **Step 4: Wire section into AI Providers page**

In `ai-providers/index.tsx`, add `TtsSection` inside an appropriate `SectionToggle` (likely “Default Models” section).

- [ ] **Step 5: Commit (optional)**

```bash
git add src/screens/settings/hooks/useSettingsController.ts src/screens/settings/sections/ai-providers/index.tsx src/screens/settings/sections/ai-providers/subsections/TtsSection.tsx
git commit -m "feat: add TTS engine settings UI"
```

---

### Task 3: `ttsService` + System Engine (expo-speech)

**Files:**

- Create: `src/services/tts/ttsService.ts`
- Create: `src/services/tts/engines/systemTtsEngine.ts`
- Create: `src/services/tts/textForTts.ts`
- Test: `src/services/tts/__tests__/textForTts.unit.test.ts`
- Test: `src/services/tts/__tests__/ttsService.unit.test.ts`

- [ ] **Step 1: Implement `textForTts` normalization**

Add:

- `stripMarkdownForTts(text: string): string`
- `chunkForTts(text: string, maxLen: number): string[]`

Unit test examples:

```ts
expect(stripMarkdownForTts('**Shock**\n- A\n- B')).toContain('Shock');
expect(chunkForTts('One. Two. Three.', 10).length).toBeGreaterThan(1);
```

- [ ] **Step 2: Implement system engine**

`systemTtsEngine.speak()` uses `expo-speech` and forwards:

- rate/pitch/voice from profile
- `Speech.stop()` on `stop()`

- [ ] **Step 3: Implement `ttsService` router**

- Load profile on-demand via `profileRepository.getProfile()`
- Route by `profile.ttsEngine`:
  - `system` → system engine
  - `edge` → edge engine (stub for now)
  - `piper` → piper engine (stub for now)
- On error:
  - show toast
  - fall back to system

- [ ] **Step 4: Unit test router fallback**

Mock engines so that edge throws and ensure system is called.

- [ ] **Step 5: Commit (optional)**

```bash
git add src/services/tts
git commit -m "feat: add ttsService router and system TTS engine"
```

---

### Task 4: GuruChat Tap-to-Speak

**Files:**

- Modify: [GuruChatMessageItem.tsx](file:///Users/vishnugnair/Guru-3/src/components/chat/GuruChatMessageItem.tsx)
- Modify: [GuruChatMessageItem.unit.test.tsx](file:///Users/vishnugnair/Guru-3/src/components/chat/GuruChatMessageItem.unit.test.tsx) (update snapshots/assertions if needed)
- Modify: the message item component used for chat bubbles (likely under `src/components/chat/`)
- [ ] **Step 1: Add speak button for assistant messages**

In `GuruChatMessageItem.tsx`, render a small speaker `LinearIconButton` (or existing icon affordance) only when `message.role === 'guru'`.

- [ ] **Step 2: Wire to `ttsService`**
- [ ] **Step 3: Wire to `ttsService`**

On press:

```ts
await ttsService.stop();
await ttsService.speak(message.text, { context: 'chat' });
```

- [ ] **Step 3: Manual verify**
- [ ] **Step 4: Manual verify**

- Speak a message while streaming another message
- Speak twice quickly (ensure it stops previous speech cleanly)
- [ ] **Step 4: Commit (optional)**

```bash
git add src/components/chat
git commit -m "feat: add tap-to-speak for GuruChat messages"
```

---

### Task 5: Study Sessions Tap-to-Speak

**Files:**

- Modify: [ContentCard/index.tsx](file:///Users/vishnugnair/Guru-3/src/screens/ContentCard/index.tsx)
- Modify: session content card UI (likely under `src/screens/SessionScreen.tsx` or session components)
- [ ] **Step 1: Build “best TTS string”**
- [ ] **Step 2: Build “best TTS string”**

For each `ContentType`, decide what to speak:

- keypoints: title + bullet list
- quiz: read question + options only (skip the correct answer unless requested)
- [ ] **Step 2: Add speak button**

- [ ] **Step 3: Add speak button**

Same behavior:

````ts
await ttsService.stop();
await ttsService.speak(cardText, { context: 'session' });
- [ ] **Step 3: Commit (optional)**

```bash
git add src/screens src/components
git commit -m "feat: add tap-to-speak for session cards"
````

---

### Task 6: Edge TTS Engine (Unofficial)

**Files:**

- Create: `src/services/tts/engines/edgeTtsEngine.ts`
- Modify: `src/services/tts/ttsService.ts`
- [ ] **Step 1: Implement endpoints + headers (documented constants)**

Implement the same public endpoints used by popular “edge-tts” clients:

- Voice list:
  - `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`
- Synthesis websocket:
  - `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4`

Reference: Go edge-tts implementation constants (shows the above endpoints and token) https://pkg.go.dev/github.com/bytectlgo/edge-tts/pkg/edge_tts

- [ ] **Step 2: Implement audio cache key**
- [ ] **Step 1: Implement audio cache key**

Use `expo-crypto` hash of `(voiceName + rate/pitch + textChunk)` to generate stable filenames.

- [ ] **Step 3: Implement voice list fetch (optional for UI)**

If you want to populate a real voice list, fetch the voice list URL, parse JSON, and cache it in-memory for the current session. (UI can still use a curated list initially.)

- [ ] **Step 4: Implement websocket synthesis + file write**
- [ ] **Step 2: Implement fetch + temp-file write**
      Use websocket streaming:

1. Open a `WebSocket` to the WSS endpoint.
2. Send:
   - A speech config message (JSON, text frame)
   - An SSML “speak” message (text frame) containing `<voice name="...">` and `<prosody rate="..." pitch="...">`
3. Receive:
   - Text frames for control
   - Binary frames containing audio bytes; append to a `.mp3` file in `FileSystem.cacheDirectory + 'tts/'`.
4. Close when the server signals completion (final turn / end-of-stream marker).

- [ ] **Step 5: Implement playback via `expo-audio`**
- cache directory: `FileSystem.cacheDirectory + 'tts/'`
- store mp3 files for chunks

- [ ] **Step 3: Implement playback via `expo-audio`**
- [ ] **Step 6: Fallback behavior**
      Use `createAudioPlayer(localUri, { downloadFirst: false })` and `player.play()`.
      Ensure `player.remove()` after completion to avoid leaks.

- [ ] **Step 4: Fallback behavior**

- [ ] **Step 7: Manual verification**

- throw a typed error from edge engine
- router catches and falls back to system engine

- [ ] **Step 8: Commit (optional)**

```bash
git add src/services/tts/engines/edgeTtsEngine.ts src/services/tts/ttsService.ts
git commit -m "feat: add Edge TTS engine with caching and fallback"
```

---

### Task 7: Piper Engine Stub (Phase 1)

**Files:**

- Create: `src/services/tts/engines/piperTtsEngine.ts`
- Modify: `src/services/tts/ttsService.ts`

- [ ] **Step 1: Implement `isAvailable()`**

Returns true only if Piper assets/config exist (placeholder rule initially: always false).

- [ ] **Step 2: Implement `speak()`**

If unavailable, throw a typed error so router falls back to system.

- [ ] **Step 3: Commit (optional)**

```bash
git add src/services/tts/engines/piperTtsEngine.ts src/services/tts/ttsService.ts
git commit -m "feat: add Piper TTS engine adapter stub"
```

---

### Task 8: End-to-End Verification

**Files:**

- None
- Modify as needed

```bash
npm run verify:ci
```

Expected: PASS

- [ ] **Step 2: Manual smoke checklist**

- Settings: changing engine persists after restart
- Chat: speak button works
- Session: speak button works
- Edge engine: fails gracefully when offline
- System engine: works even when Edge selected but fails

---

## Execution Notes

- The plan includes “Commit (optional)” steps. Only commit if explicitly desired.
- Edge TTS is unofficial; expect occasional breakage. The router + fallback should make this safe in daily use.
