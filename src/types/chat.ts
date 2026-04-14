import { MedicalGroundingSource } from '../services/aiService';
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
