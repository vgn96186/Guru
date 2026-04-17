# Vercel AI SDK Compatibility Guide

This document describes the compatibility between Guru's AI v2 framework and Vercel AI SDK, and provides migration guidance for developers familiar with Vercel AI SDK.

## Overview

Guru AI v2 is designed with Vercel AI SDK compatibility in mind. The core APIs (`streamText`, `generateText`, `generateObject`, `useChat`, `tool`) follow similar patterns, but with Guru-specific enhancements for medical education and multi-provider fallback.

## Feature Parity Matrix

| Feature | Vercel AI SDK | Guru AI v2 | Status |
|---------|---------------|------------|--------|
| `streamText` | ✅ | ✅ | Full support |
| `generateText` | ✅ | ✅ | Full support |
| `generateObject` | ✅ | ✅ | Full support (with Zod) |
| `streamObject` | ✅ | ✅ | Full support |
| `useChat` | ✅ | ✅ | Full support (with medical extensions) |
| `useCompletion` | ✅ | ✅ | Full support |
| `useObject` | ✅ | ✅ | Full support |
| `tool()` helper | ✅ | ✅ | Full support |
| Provider abstraction | ✅ | ✅ | Enhanced (12+ providers) |
| Multi-provider fallback | ❌ | ✅ | Guru exclusive |
| Medical tooling | ❌ | ✅ | Guru exclusive |
| Reasoning models | ❌ | ✅ | Guru exclusive |
| Local model support | Limited | ✅ | Full (Gemma 4) |

## Migration Guide

### 1. Import Changes

**Vercel AI SDK:**
```typescript
import { streamText, createOpenAI } from 'ai';
```

**Guru AI v2:**
```typescript
import { streamText, createGuruFallbackModel } from '../services/ai/v2';
// Or for Vercel compatibility:
import { streamText as vercelStreamText, createModel } from '../services/ai/v2/vercelCompat';
```

### 2. Model Creation

**Vercel AI SDK:**
```typescript
const model = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
```

**Guru AI v2 (Profile-based):**
```typescript
import { profileRepository } from '../../db/repositories/profileRepository';

const profile = await profileRepository.getProfile();
const model = createGuruFallbackModel({ profile });
```

**Guru AI v2 (Vercel-compatible):**
```typescript
const model = createModel({
  provider: 'openai',
  apiKey: 'your-key',
  // Or use profile for multi-provider:
  profile: await profileRepository.getProfile(),
});
```

### 3. Message Format Conversion

Guru uses a discriminated union message format for better type safety. Use conversion utilities when needed:

```typescript
import { fromVercelMessage, toVercelMessage } from '../services/ai/v2/vercelCompat';

// Convert Vercel messages to Guru format
const guruMessages = vercelMessages.map(fromVercelMessage);

// Convert Guru messages to Vercel format  
const vercelMessages = guruMessages.map(toVercelMessage);
```

### 4. Tool Definitions

**Vercel AI SDK:**
```typescript
const tool = {
  description: 'Search medical sources',
  parameters: z.object({ query: z.string() }),
  execute: async ({ query }) => ({ results: [] }),
};
```

**Guru AI v2:**
```typescript
import { tool } from '../services/ai/v2';

const searchTool = tool({
  name: 'search_medical',
  description: 'Search medical sources',
  inputSchema: z.object({ query: z.string() }),
  execute: async ({ query }, ctx) => ({ results: [] }),
});
```

**Conversion:**
```typescript
import { fromVercelTool, toVercelTool } from '../services/ai/v2/vercelCompat';

const guruTool = fromVercelTool('search_medical', vercelTool);
const vercelTool = toVercelTool(guruTool);
```

### 5. Streaming Text

**Vercel AI SDK:**
```typescript
const result = await streamText({
  model,
  messages: [{ role: 'user', content: 'Hello' }],
});

for await (const chunk of result.textStream) {
  console.log(chunk);
}
```

**Guru AI v2 (identical API):**
```typescript
const result = streamText({
  model,
  messages: [{ role: 'user', content: 'Hello' }],
});

for await (const chunk of result.textStream) {
  console.log(chunk);
}
```

### 6. React Hooks

**Vercel AI SDK `useChat`:**
```typescript
const { messages, append, isLoading } = useChat({
  api: '/api/chat',
});
```

**Guru AI v2 `useChat`:**
```typescript
const { messages, sendMessage, isLoading } = useChat({
  model: createGuruFallbackModel({ profile }),
});
```

**Vercel AI SDK `useCompletion`:**
```typescript
const { completion, input, handleSubmit } = useCompletion({
  api: '/api/completion',
});
```

**Guru AI v2 `useCompletion`:**
```typescript
const { completion, input, complete } = useCompletion({
  model: createGuruFallbackModel({ profile }),
});
```

## Guru-Specific Enhancements

### Multi-Provider Fallback
Guru automatically tries multiple providers in order based on your profile configuration:

```typescript
// No configuration needed - uses profile.providerOrder
const model = createGuruFallbackModel({ profile });
```

### Medical Tooling
Pre-built tools for medical education:
```typescript
import { guruMedicalTools, guruPlanningTools } from '../services/ai/v2/tools';

const result = streamText({
  model,
  messages: [{ role: 'user', content: 'Explain MI pathogenesis' }],
  tools: { ...guruMedicalTools, ...guruPlanningTools },
});
```

### Reasoning Models
Support for reasoning deltas in streams:
```typescript
for await (const part of result.fullStream) {
  if (part.type === 'reasoning-delta') {
    console.log('Reasoning:', part.text);
  }
}
```

## Limitations and Differences

1. **Message Format**: Guru uses discriminated unions (`ModelMessage`) vs Vercel's single interface
2. **Finish Reasons**: Guru includes `'content-filter'` which maps to `'other'` in Vercel format
3. **Image Handling**: Guru uses `base64Data` while Vercel uses URLs
4. **Tool Execution Context**: Guru provides `ToolExecuteContext` with `toolCallId` and `abortSignal`

## Testing Compatibility

Run the compatibility test suite:
```bash
npm test -- --testPathPattern=vercelCompat
```

## Examples

See `src/services/ai/v2/vercelCompat.unit.test.ts` for complete usage examples.

## Getting Help

- For Vercel AI SDK compatibility issues: Check the conversion utilities in `vercelCompat.ts`
- For Guru-specific features: Refer to the main `README.md`
- For medical tooling: See `tools/medicalTools.ts`