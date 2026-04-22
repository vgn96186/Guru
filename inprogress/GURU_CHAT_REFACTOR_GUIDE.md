# GuruChat Refactoring - Incremental Adoption Guide

## Overview

The 3,194-line `GuruChatScreen.tsx` has been refactored into **12 focused modules** following the **Vercel AI SDK pattern** with tool calling support.

## New Architecture

```
GuruChatScreen.tsx (was 3,194 lines)
    ↓
Hooks (Business Logic)
├── useGuruChatSession.ts       # Thread CRUD, session memory
├── useGuruChat.ts              # Vercel AI SDK + tools
├── useGuruChatModels.ts        # Model picker state
└── useGuruChatImageGeneration.ts # Image generation state

Components (UI)
├── GuruChatMessageList.tsx     # Message list + empty state
├── GuruChatMessageItem.tsx     # Individual message bubble
├── GuruChatInput.tsx           # Composer + quick replies
├── GuruChatModelSelector.tsx   # Model picker sheet
├── GuruChatHistoryDrawer.tsx   # History sidebar
├── GuruChatRenameSheet.tsx     # Rename modal
├── GuruChatStarters.tsx        # Starter chips
└── FormattedGuruMessage.tsx    # Message text formatting

Tools (AI SDK Integration)
└── chatTools.ts                # search_medical, search_reference_images, generate_image
```

## Tool Calling Architecture

### Connected Tools

| Tool                      | Purpose                              | Output Mapped To            |
| ------------------------- | ------------------------------------ | --------------------------- |
| `search_medical`          | Search Wikipedia, Europe PMC, PubMed | `UIMessage.sources`         |
| `search_reference_images` | Find anatomy diagrams, charts        | `UIMessage.referenceImages` |
| `generate_image`          | Generate custom study images         | `UIMessage.images`          |

### Tool Flow

```
User Message → useChat (Vercel AI SDK) → LLM decides to call tool
                                               ↓
Tool executes (chatTools.ts) → Results added to message
                                               ↓
UI displays sources/images in GuruChatMessageItem
```

## Phase 1 Summary (Completed)

**Status**: ✅ Hooks integrated alongside legacy state

### Changes Made

1. **Added imports** in `GuruChatScreen.tsx`:

   ```typescript
   import { useGuruChatSession } from '../hooks/useGuruChatSession';
   import { useGuruChatModels } from '../hooks/useGuruChatModels';
   ```

2. **Instantiated hooks** after `flatListRef`:

   ```typescript
   const guruSession = useGuruChatSession({ topicName, syllabusTopicId, requestedThreadId });
   const guruModels = useGuruChatModels({ profile });
   ```

3. **Added sync effects** to bridge old and new state:

   - `guruSession.currentThread` → `setCurrentThread`
   - `guruSession.threads` → `setThreads`
   - `guruSession.sessionSummary` → `setSessionSummary`
   - `guruSession.isHydratingThread/History` → legacy state
   - `guruModels.chosenModel` → `setChosenModel`

4. **Added compatibility aliases** in `useGuruChatSession`:
   - `isHydratingThread: isHydrating`
   - `isHydratingHistory: isHydrating`

### What This Enables

- New hooks are now **live** and executing alongside legacy code
- Both states stay synchronized via useEffect bridges
- Future phases can gradually replace legacy state references
- Zero breaking changes - original screen still works

---

## Phase 2 Summary (Completed)

**Status**: ✅ Components integrated, inline JSX replaced

### Changes Made

1. **Added component imports** in `GuruChatScreen.tsx`:

   ```typescript
   import { GuruChatHistoryDrawer } from '../components/chat/GuruChatHistoryDrawer';
   import { GuruChatRenameSheet } from '../components/chat/GuruChatRenameSheet';
   import { GuruChatModelSelector } from '../components/chat/GuruChatModelSelector';
   import { GuruChatStarters } from '../components/chat/GuruChatStarters';
   ```

2. **Replaced History Drawer** (~40 lines → 1 component):

   ```tsx
   <GuruChatHistoryDrawer
     visible={showHistoryDrawer}
     threads={threads}
     currentThreadId={currentThread?.id ?? null}
     onClose={...}
     onNewChat={createAndSwitchToNewThread}
     onOpenThread={...}
     onRenameThread={...}
     onDeleteThread={...}
   />
   ```

3. **Replaced Rename Sheet** (~50 lines → 1 component):

   ```tsx
   <GuruChatRenameSheet
     visible={renameThreadId !== null}
     currentTitle={renameDraft}
     onTitleChange={setRenameDraft}
     onClose={...}
     onSave={...}
   />
   ```

4. **Replaced Model Selector** (~60 lines → 1 component):

   ```tsx
   <GuruChatModelSelector
     visible={showModelPicker}
     availableModels={guruModels.availableModels}
     visibleModelGroups={guruModels.visibleModelGroups}
     chosenModel={chosenModel}
     onSelectModel={...}
     pickerTab={pickerTab}
     onSetPickerTab={setPickerTab}
     onClose={...}
     localLlmWarning={localLlmWarning}
     hasMessages={messages.length > 0}
   />
   ```

5. **Replaced Empty State Starters** (~40 lines → 1 component):
   ```tsx
   <GuruChatStarters
     starters={starters}
     sessionSummary={sessionSummary}
     isGeneralChat={isGeneralChat}
     topicName={topicName}
     onSelectStarter={(text) => handleSend(text)}
     isLoading={loading}
   />
   ```

### What's Left for Phase 3

- `GuruChatMessageList` - requires migrating from `chatWithGuruGroundedStreaming` to `useGuruChat` first
- `GuruChatInput` - depends on new streaming hook interface
- These will be done together with the streaming migration to avoid interface mismatch

---

## Phase 3 Summary (Completed)

**Status**: ✅ Vercel AI SDK integrated with feature flag

### Changes Made

1. **Added `useGuruChat` hook** in `GuruChatScreen.tsx`:

   ```typescript
   // Feature flag: Enable new streaming + tool calling
   const [enableVercelAI, setEnableVercelAI] = useState(false);

   const guruChat = useGuruChat({
     model: modelForVercel, // null until enabled
     threadId: currentThreadId,
     topicName,
     initialMessages: messages,
     context: { sessionSummary, profileNotes, ... },
     onError: (err) => {
       console.error('GuruChat error:', err);
       setEnableVercelAI(false); // Fallback to legacy
     },
   });
   ```

2. **Created tool definitions** in `src/services/ai/chatTools.ts`:

   - `search_medical` - Wikipedia, Europe PMC, PubMed search
   - `search_reference_images` - Medical diagrams, charts
   - `generate_image` - Custom study image generation

3. **Hook handles null model** - when `enableVercelAI` is false, hook returns idle state

### How to Enable (Testing)

To test the new Vercel AI SDK integration:

```typescript
// In GuruChatScreen.tsx, change:
const [enableVercelAI, setEnableVercelAI] = useState(false);
// to:
const [enableVercelAI, setEnableVercelAI] = useState(true);
```

Then implement model provider to create `LanguageModelV2` instances from chosen model IDs.

### Tool Calling Flow (When Enabled)

```
User sends message
       ↓
useChat streams to LLM
       ↓
LLM decides to call tool (search_medical, etc.)
       ↓
Tool executes via chatTools.ts
       ↓
Results added to message.sources/.images
       ↓
UI displays via GuruChatMessageItem
```

---

## Incremental Adoption Steps

### Phase 1: Adopt Hooks (Minimal Risk) ✅ COMPLETE

Replace existing hook logic with new hooks while keeping UI:

```typescript
// In GuruChatScreen.tsx
import { useGuruChatSession } from '../hooks/useGuruChatSession';
import { useGuruChatModels } from '../hooks/useGuruChatModels';

// Replace lines 617-641 (state management)
const session = useGuruChatSession({
  topicName,
  syllabusTopicId,
  requestedThreadId,
});

// Replace lines 751-964 (model picker logic)
const models = useGuruChatModels({ profile });
```

### Phase 2: Adopt Components (Medium Risk)

Replace inline JSX with new components:

```typescript
// Replace lines 1431-1556 (message rendering)
<GuruChatMessageItem
  message={message}
  isLatestGuruMessage={isLatest}
  isLoading={loading}
  onToggleSources={toggleSources}
  onCopyMessage={copyMessage}
  onRegenerate={handleRegenerate}
  onGenerateImage={generateImage}
/>

// Replace lines 2160-2214 (input composer)
<GuruChatInput
  input={input}
  onChangeText={setInput}
  onSend={handleSend}
  onModelPress={openModelPicker}
  currentModelLabel={models.currentModelLabel}
  isLoading={loading}
/>
```

### Phase 3: Enable Vercel AI SDK (Higher Risk)

Replace `chatWithGuruGroundedStreaming` with `useGuruChat`:

```typescript
import { useGuruChat } from '../hooks/useGuruChat';

// This enables tool calling automatically
const chat = useGuruChat({
  model: selectedModel,
  threadId: session.currentThread?.id ?? null,
  topicName,
  initialMessages: session.messages,
  context: {
    sessionSummary: session.sessionSummary,
    studyContext: buildBoundedGuruChatStudyContext(topicName),
    groundingTitle,
    groundingContext,
  },
});
```

### Phase 4: Cleanup (Final)

- Remove dead code from original screen
- Delete migrated inline styles
- Update tests

## Verification Commands

```bash
# Type check new modules
npx tsc --noEmit --skipLibCheck \
  src/hooks/useGuruChat.ts \
  src/hooks/useGuruChatSession.ts \
  src/hooks/useGuruChatModels.ts \
  src/services/ai/chatTools.ts

# Type check new components
npx tsc --noEmit --skipLibCheck \
  src/components/chat/GuruChatMessageItem.tsx \
  src/components/chat/GuruChatInput.tsx \
  src/components/chat/GuruChatMessageList.tsx
```

## Migration Checklist

- [x] **Phase 1: Hooks integrated** ✅ COMPLETE
  - [x] New hooks imported (`useGuruChatSession`, `useGuruChatModels`)
  - [x] Hooks instantiated in `GuruChatScreen.tsx`
  - [x] Sync effects added (old state ← new hooks)
  - [x] Migration mapping documented in code
- [x] **Phase 2: Components integrated** ✅ COMPLETE
  - [x] Component imports added
  - [x] `GuruChatHistoryDrawer` replaces inline history drawer
  - [x] `GuruChatRenameSheet` replaces inline rename sheet
  - [x] `GuruChatModelSelector` replaces inline model picker
  - [x] `GuruChatStarters` replaces inline empty state
  - [ ] `GuruChatMessageList` + `GuruChatInput` (requires streaming migration)
- [x] **Phase 3: Streaming + Tool calling** ✅ INTEGRATED
  - [x] `useGuruChat` hook integrated with feature flag
  - [x] Tool definitions in `chatTools.ts`
  - [x] Parallel implementation ready for testing
  - [ ] Enable feature flag after model provider setup
- [ ] Phase 4: All existing tests pass
- [ ] Phase 5: Dead code removed
- [ ] Phase 6: New component tests added

## Rollback Strategy

Each phase is isolated - if issues arise:

1. Keep original `GuruChatScreen.tsx` as `GuruChatScreen.legacy.tsx`
2. Revert imports to legacy version
3. Fix issues in new modules
4. Re-attempt migration

## Key Decisions

1. **Tools Created Internally**: `createGuruChatTools(topicName)` binds topic context
2. **Persistence via `onFinish`**: Non-blocking save to database
3. **UI/State Separation**: Hooks hold state, components are pure renderers
4. **Incremental Adoption**: Original screen remains functional during migration
