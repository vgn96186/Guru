import type { MedicalGroundingSource } from '../services/ai';
import { GeneratedStudyImageRecord } from '../db/queries/generatedStudyImages';

export type ChatMessage = {
  id: string;
  role: 'user' | 'guru';
  text: string;
  sources?: MedicalGroundingSource[];
  referenceImages?: MedicalGroundingSource[];
  images?: GeneratedStudyImageRecord[];
  modelUsed?: string;
  searchQuery?: string;
  timestamp: number;
};

export type ChatItem =
  | { id: string; type: 'message'; message: ChatMessage }
  | { id: string; type: 'typing' };

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
