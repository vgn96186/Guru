export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type GuruEventType =
  | 'periodic'
  | 'card_done'
  | 'quiz_correct'
  | 'quiz_wrong'
  | 'again_rated';
export interface GuruPresenceMessage {
  text: string;
  trigger: GuruEventType;
}

export interface AgendaResponse {
  selectedTopicIds: number[];
  focusNote: string;
  guruMessage: string;
}

export interface DailyAgenda {
  blocks: Array<{
    id: string;
    title: string;
    topicIds: number[];
    durationMinutes: number;
    startTime?: string;
    type: 'study' | 'review' | 'test' | 'break';
    why: string;
  }>;
  guruNote: string;
  prioritySubjectId?: number;
}

export interface MedicalGroundingSource {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  snippet: string;
  journal?: string;
  publishedAt?: string;
  source: 'EuropePMC' | 'PubMed' | 'Wikipedia' | 'Wikimedia Commons' | 'Open i (NIH)';
  author?: string;
  license?: string;
}

export interface GroundedGuruResponse {
  reply: string;
  sources: MedicalGroundingSource[];
  modelUsed: string;
  searchQuery: string;
}
