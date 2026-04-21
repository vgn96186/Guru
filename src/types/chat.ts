import type { MedicalGroundingSource } from '../services/ai';
import { GeneratedStudyImageRecord } from '../db/queries/generatedStudyImages';

export type ChatRole = 'user' | 'guru';

export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  sources?: MedicalGroundingSource[];
  referenceImages?: MedicalGroundingSource[];
  images?: GeneratedStudyImageRecord[];
  modelUsed?: string;
  searchQuery?: string;
  timestamp: number;
};

export type ChatMessageItem = {
  id: string;
  type: 'message';
  message: ChatMessage;
};

export type ChatTypingItem = {
  id: string;
  type: 'typing';
};

export type ChatItem = ChatMessageItem | ChatTypingItem;

export type ModelOption = {
  id: string;
  name: string;
  group:
    | 'Local'
    | 'ChatGPT Codex'
    | 'Groq'
    | 'OpenRouter'
    | 'Gemini'
    | 'Cloudflare'
    | 'GitHub Models'
    | 'GitHub Copilot'
    | 'GitLab Duo'
    | 'Poe'
    | 'Kilo'
    | 'AgentRouter'
    | 'Qwen (Free)';
};
