export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type GuruEventType = 'periodic' | 'card_done' | 'quiz_correct' | 'quiz_wrong' | 'again_rated';
export interface GuruPresenceMessage { text: string; trigger: GuruEventType; }

export interface AgendaResponse {
  selectedTopicIds: number[];
  focusNote: string;
  guruMessage: string;
}

export interface MedicalGroundingSource {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  snippet: string;
  journal?: string;
  publishedAt?: string;
  source: 'EuropePMC' | 'PubMed' | 'Wikipedia';
}

export interface GroundedGuruResponse {
  reply: string;
  sources: MedicalGroundingSource[];
  modelUsed: string;
  searchQuery: string;
}
