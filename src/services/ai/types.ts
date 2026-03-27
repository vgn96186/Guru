/** One segment of a user message (multimodal path; Gemini-first). */
export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'inline_image'; mimeType: string; base64Data: string };

export interface Message {
  role: 'system' | 'user' | 'assistant';
  /** Plain text; used by all providers today. */
  content: string;
  /**
   * Optional multimodal parts for future flows (e.g. diagram + question).
   * When present, transports that support it should prefer `parts`; others ignore and use `content` only.
   */
  parts?: MessageContentPart[];
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
  source: 'EuropePMC' | 'PubMed' | 'Wikipedia' | 'Wikimedia Commons' | 'Open i (NIH)' | 'MedPix (NIH)' | 'DuckDuckGo' | 'Brave Search';
  author?: string;
  license?: string;
}

export interface GroundedGuruResponse {
  reply: string;
  sources: MedicalGroundingSource[];
  referenceImages?: MedicalGroundingSource[];
  modelUsed: string;
  searchQuery: string;
}
