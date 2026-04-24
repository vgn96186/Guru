// Re-export Vercel AI SDK core functions
export { streamText, generateText, generateObject, streamObject, tool } from 'ai';

// Re-export types — use LanguageModelV2 as the canonical LanguageModel for provider code
export type { LanguageModelV2 as LanguageModel } from '@ai-sdk/provider';

// Legacy type alias for CoreMessage (removed in v6)
export type { Message as CoreMessage } from './types';

// Config
export {
  getApiKeys,
  OPENROUTER_FREE_MODELS,
  GROQ_MODELS,
  GEMINI_MODELS,
  GEMINI_STRUCTURED_JSON_MODELS,
  CLOUDFLARE_MODELS,
} from './config';

export { fetchAllLiveGuruChatModelIds } from './liveModelCatalog';
export type { LiveGuruChatModelIds } from './liveModelCatalog';

// Types
export type {
  Message,
  GuruEventType,
  GuruPresenceMessage,
  AgendaResponse,
  DailyAgenda,
  MedicalGroundingSource,
} from './types';

// JsonRepair — robust JSON extraction and repair
export { parseStructuredJson } from './jsonRepair';

// LlmRouter — local vs cloud fallbacks, mutexes
export { releaseLlamaContext } from './llmRouting';

// MedicalGrounding — Wikipedia, PubMed, EuropePMC
export {
  searchLatestMedicalSources,
  buildMedicalSearchQuery,
  renderSourcesForPrompt,
} from './medicalSearch';

// ContentGeneration — quizzes, mnemonics, keypoints, etc.
export { fetchContent, prefetchTopicContent, generateEscalatingQuiz } from './content';

// Planning
export {
  planSessionWithAI,
  generateAccountabilityMessages,
  generateGuruPresenceMessages,
  generateDailyAgendaWithRouting,
  replanDayWithRouting,
} from './planning';

// Chat
export {
  chatWithGuru,
  chatWithGuruGrounded,
  chatWithGuruGroundedStreaming,
  askGuru,
  explainMostTestedRationale,
  explainTopicDeeper,
  explainQuizConcept,
  fetchChatRelevantImage,
  type GuruChatMemoryContext,
} from './chat';

// Notifications
export { generateWakeUpMessage, generateBreakEndMessages } from './notifications';

// Catalyze
export { catalyzeTranscript } from './catalyze';

// Image generation
export { generateImage, isImageGenerationAvailable } from './imageGeneration';

// New standardized hooks
export { useObject, type UseObjectOptions, type UseObjectResult } from './v2/hooks/useObject';

export {
  useChat,
  type UseChatOptions,
  type UseChatReturn,
  type UIMessage,
  type ChatStatus,
} from './v2';

// Standardized tools
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
} from './v2';
