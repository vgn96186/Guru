// Config
export { getApiKeys, OPENROUTER_FREE_MODELS, GROQ_MODELS } from './config';

// Types
export type { Message, GuruEventType, GuruPresenceMessage, AgendaResponse, MedicalGroundingSource } from './types';

// JsonRepair — robust JSON extraction and repair
export { parseStructuredJson } from './jsonRepair';

// LlmRouter — local vs cloud fallbacks, mutexes
export { releaseLlamaContext } from './llmRouting';

// Core generation
export { generateJSONWithRouting, generateTextWithRouting } from './generate';

// MedicalGrounding — Wikipedia, PubMed, EuropePMC
export {
  searchLatestMedicalSources,
  buildMedicalSearchQuery,
  renderSourcesForPrompt,
} from './medicalSearch';

// ContentGeneration — quizzes, mnemonics, keypoints, etc.
export { fetchContent, prefetchTopicContent } from './content';

// Planning
export { planSessionWithAI, generateAccountabilityMessages, generateGuruPresenceMessages } from './planning';

// Chat
export { chatWithGuru, chatWithGuruGrounded, askGuru } from './chat';

// Notifications
export { generateWakeUpMessage, generateBreakEndMessages } from './notifications';

// Catalyze
export { catalyzeTranscript } from './catalyze';
