# Guru AI SDK v2 — Framework

Vercel AI SDK-shaped API layer for Guru. Core abstractions + real provider
adapters + tests. Ready to start wiring into Guru's existing screens.

## What's built

| File | Purpose | Status |
|---|---|---|
| `spec.ts` | `LanguageModelV2` interface, stream parts, messages | ✅ |
| `tool.ts` | `tool()` helper + Zod→JSON-Schema converter | ✅ (minimal zod coverage) |
| `streamText.ts` | Unified streaming + agentic tool-calling loop + reasoning-delta | ✅ + tests |
| `generateText.ts` | Non-streaming wrapper | ✅ |
| `generateObject.ts` | Zod-validated structured output (reuses `jsonRepair`) | ✅ |
| `streamObject.ts` | Partial-object streaming (lenient JSON parse per chunk) | ✅ |
| `middleware.ts` | `withMiddleware()` for telemetry/logging around any model | ✅ |
| `providers/openaiCompatible.ts` | OpenAI-wire adapter (SSE, tool calls, reasoning) | ✅ |
| `providers/presets.ts` | Groq, OpenRouter, DeepSeek, Cloudflare, GitHub Models | ✅ |
| `providers/gemini.ts` | Native Gemini REST adapter (multimodal + tools + JSON schema) | ✅ |
| `providers/localLlm.ts` | Wraps `attemptLocalLLM()` (Gemma 4) as `LanguageModelV2` | ✅ |
| `providers/fallback.ts` | Multi-provider fallback as a `LanguageModelV2` | ✅ + tests |
| `providers/guruFallback.ts` | `createGuruFallbackModel(profile)` — profile-driven chain | ✅ |
| `tools/medicalTools.ts` | `search_medical`, `lookup_topic`, `get_quiz_questions` | ✅ |
| `useChat.ts` | React hook (sendMessage / regenerate / stop / streaming state) | ✅ |
| `index.ts` | Public barrel | ✅ |

**Tests:** 9/9 passing (streamText agentic loop + fallback semantics).

## Example usage

```ts
import { z } from 'zod';
import {
  streamText,
  generateObject,
  streamObject,
  tool,
  createGuruFallbackModel,
  guruMedicalTools,
  stepCountIs,
} from '../services/ai/v2';

// One line — reads profile.providerOrder / keys, builds the full fallback chain.
const model = createGuruFallbackModel({
  profile,
  onProviderError: (p, m, e) => providerHealth.recordFailure(p, m, e),
  onProviderSuccess: (p, m) => providerHealth.recordSuccess(p, m),
});

// Tool calling — ready-made medical tools from Guru's services
const result = streamText({
  model,
  messages: [{ role: 'user', content: 'Explain MI pathogenesis.' }],
  tools: guruMedicalTools, // search_medical, lookup_topic, get_quiz_questions
  stopWhen: stepCountIs(5),
});

for await (const delta of result.textStream) process.stdout.write(delta);

// Structured output
const { object } = await generateObject({
  model,
  messages: [{ role: 'user', content: 'Generate 3 NEET-PG MCQs on diabetes.' }],
  schema: z.object({
    questions: z.array(z.object({
      stem: z.string(),
      options: z.array(z.string()).length(4),
      correctIndex: z.number(),
    })),
  }),
});
```

## Continuation work (for Qwen / Cursor / future-you)

### P0 — Port remaining providers (web/OAuth-session)

`createGuruFallbackModel()` already covers: Groq, OpenRouter, DeepSeek,
Cloudflare, GitHub Models, Gemini (×2), Kilo, AgentRouter, and the local
Gemma model. The five **web-session** providers are stubs:

1. **`providers/chatgptWeb.ts`** — see existing `src/services/ai/chatgpt/` for OAuth + session logic; wrap in a `LanguageModelV2`.
2. **`providers/copilotWeb.ts`** — see `src/services/ai/github/`.
3. **`providers/gitlabDuo.ts`** — see `src/services/ai/gitlab/`.
4. **`providers/poe.ts`** — see `src/services/ai/poe/`.
5. **`providers/qwen.ts`** — see `src/services/ai/qwen/`.

For each: reuse the existing session/token-refresh code, only implement the
`doStream`/`doGenerate` transport. Then add the case to `guruFallback.ts`.

### P0.5 — More tools

`tools/medicalTools.ts` has 3 tools. Consider adding:
- `fact_check` — wraps `medicalFactCheck.ts`
- `generate_image` — wraps `imageGeneration.ts`
- `save_to_notes` — write to `notes` table
- `mark_topic_reviewed` — updates `topic_progress` (needsApproval: true so the UI can confirm)

### P1 — Migrate callers

4. **Migrate `chat.ts`** — replace `chatWithGuruGroundedStreaming()` internals
   with `streamText({ model, tools: medicalTools })`. Keep the public function
   signature stable so screens don't change.

5. **Migrate `generate.ts`** — replace `generateJSONWithRouting` call sites
   with `generateObject()`; `generateTextWithRouting` → `generateText()`.

6. **Migrate `ChatTab` screen** — adopt `useChat()` hook; delete the manual
   state-management glue.

### P2 — Polish

7. **Expand `zodToJsonSchema`** in `tool.ts` to cover unions, records, refinements.
   Or: add `zod-to-json-schema` as a dep and delegate.

8. ~~Reasoning-delta support~~ — ✅ done (OpenAI-compatible adapter routes
   `delta.reasoning` / `delta.reasoning_content` to `reasoning-delta` parts).
   Gemini thinking still TODO.

9. ~~`streamObject`~~ — ✅ done. See `streamObject.ts`.

10. ~~Telemetry middleware~~ — ✅ done. See `middleware.ts` (`withMiddleware`).
    Wire `onFinish` to `runtimeActivity.ts` when migrating callers.

### P3 — Retirement

11. Once all callers are migrated, delete:
    - Per-provider `stream*Chat` functions in `llmRouting.ts`
    - `generateJSONWithRouting`, `generateTextWithRouting`, `generateTextWithRoutingStream`
    - Pseudo-stream fallback (`emitPseudoStreamFallback`) — the v2 stack handles this uniformly

    Keep: provider selection logic, provider health bookkeeping, local-LLM gate, `jsonRepair`.

## Known gaps in this scaffold

- `streamText` does NOT yet surface `reasoning-delta` (reasoning models work
  but their reasoning stream is lost). Easy fix in `dispatchProviderPart`.
- `needsApproval` tools emit the call but there's no `resumeToolCall()` API yet.
  Sketch: expose an `addToolResult(toolCallId, output)` method on `StreamTextResult`.
- `zodToJsonSchema` is minimal — unions/records fall through to `{}`.
- `useChat` converts UIMessages → ModelMessages by dropping tool-call history.
  For multi-turn tool use, track `responseMessages` on the last assistant turn.
- No abort propagation tests. `abortSignal` is threaded through but verify
  each provider's fetch respects it under RN's polyfill.

## React Native notes

- Requires `ReadableStream.getReader()` — RN 0.74+ supports this natively.
  On older RN, install `react-native-polyfill-globals` or equivalent.
- `fetch` must support streaming responses. Expo SDK 54's fetch does.
- `AbortController` is standard in RN.

## Design decisions (why these shapes)

- **`specificationVersion: 'v2'`** — matches Vercel's tag so if we ever want
  to import their provider packages (e.g. `@ai-sdk/anthropic`), our models
  are recognized. Today we don't; we built our own.
- **Kept `jsonRepair` in `generateObject`** — Guru's resilience advantage.
  Vercel's SDK fails hard on malformed JSON; we repair first.
- **`createFallbackModel` implements `LanguageModelV2`** — so the REST of the
  SDK has no idea fallback is happening. Clean separation.
- **Hand-rolled `zodToJsonSchema`** — avoided adding `zod-to-json-schema`
  (45KB) for the 90% case. Swap later if needed.
