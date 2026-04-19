/**
 * Guru AI SDK v2 — public API.
 *
 * Adopts the shape of Vercel AI SDK (streamText / generateText / generateObject /
 * useChat / tool) while keeping Guru's multi-provider fallback as the moat.
 *
 * Migration status: FRAMEWORK ONLY. See v2/README.md for continuation plan.
 */

// Core spec
export type {
  LanguageModelV2,
  LanguageModelV2CallOptions,
  LanguageModelV2GenerateResult,
  LanguageModelV2StreamResult,
  LanguageModelV2StreamPart,
  LanguageModelV2Usage,
  ModelMessage,
  TextPart,
  ImagePart,
  ToolCallPart,
  ToolResultPart,
  TextStreamPart,
  FinishReason,
  ToolDescription,
} from './spec';

// Tools
export { tool, zodToJsonSchema } from './tool';
export type { ToolDefinition, ToolSet, ToolExecuteContext } from './tool';

// High-level APIs
export { streamText, stepCountIs, hasToolCall } from './streamText';
export type { StreamTextOptions, StreamTextResult, StopCondition, StepResult } from './streamText';

export { generateText } from './generateText';
export type { GenerateTextOptions, GenerateTextResult } from './generateText';

export { generateObject } from './generateObject';
export type { GenerateObjectOptions, GenerateObjectResult } from './generateObject';

export { streamObject } from './streamObject';
export type { StreamObjectOptions, StreamObjectResult } from './streamObject';

export { withMiddleware } from './middleware';
export type { Middleware } from './middleware';

// Providers
export { createOpenAICompatibleModel } from './providers/openaiCompatible';
export type { OpenAICompatibleConfig } from './providers/openaiCompatible';
export {
  createGroqModel,
  createOpenRouterModel,
  createDeepSeekModel,
  createCloudflareModel,
  createGitHubModelsModel,
  createG4FModel,
} from './providers/presets';
export { createGeminiModel } from './providers/gemini';
export type { GeminiConfig } from './providers/gemini';
export { createLocalLlmModel } from './providers/localLlm';
export type { LocalLlmConfig } from './providers/localLlm';
export { createChatGptModel } from './providers/chatgpt';
export type { ChatGptConfig } from './providers/chatgpt';
export { createResponsesApiModel } from './providers/responsesApi';
export type { ResponsesApiConfig } from './providers/responsesApi';
export { createGitHubCopilotModel } from './providers/githubCopilot';
export type { GitHubCopilotConfig } from './providers/githubCopilot';
export { createGitLabDuoModel } from './providers/gitlabDuo';
export type { GitLabDuoConfig } from './providers/gitlabDuo';
export { createPoeModel } from './providers/poe';
export type { PoeConfig } from './providers/poe';
export { createQwenModel } from './providers/qwen';
export type { QwenConfig } from './providers/qwen';
export { createFallbackModel } from './providers/fallback';
export type { FallbackModelOptions } from './providers/fallback';
export { createGuruFallbackModel } from './providers/guruFallback';
export type { GuruFallbackOptions } from './providers/guruFallback';

// Guru-specific tool definitions
export {
  searchMedicalTool,
  lookupTopicTool,
  getQuizQuestionsTool,
  fetchExamDatesTool,
  guruMedicalTools,
} from './tools/medicalTools';

export {
  planSessionTool,
  dailyAgendaTool,
  analyzeLectureTool,
  createQuizTool,
  fetchContentTool,
  guruPlanningTools,
  guruLectureTools,
  guruContentTools,
  guruCoreTools,
  generateKeypointsTool,
  generateMustKnowTool,
  generateStoryTool,
  generateMnemonicTool,
  generateTeachBackTool,
  generateErrorHuntTool,
  generateDetectiveTool,
  generateSocraticTool,
} from './tools';

// React
export { useChat } from './useChat';
export type { UseChatOptions, UseChatReturn, UIMessage, ChatStatus } from './useChat';

export { useObject } from './hooks/useObject';
export type { UseObjectOptions, UseObjectResult, SubmitObjectOptions } from './hooks/useObject';

export { useCompletion } from './hooks/useCompletion';
export type { UseCompletionOptions, UseCompletionReturn, CompletionStatus } from './hooks/useCompletion';

// Compatibility layer — drop-in replacements for legacy generate/chat APIs
export {
  generateTextV2,
  generateTextStreamV2,
  generateJSONV2,
  chatWithGuruV2,
  chatWithGuruStreamV2,
} from './compat';

// Vercel AI SDK compatibility
export {
  fromVercelMessage,
  toVercelMessage,
  fromVercelTool,
  toVercelTool,
  createModel,
  streamText as vercelStreamText,
  experimental_ObjectStream,
  type CoreMessage,
  type CoreTool,
  type LanguageModel,
} from './vercelCompat';
