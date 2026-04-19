import type { MedicalGroundingSource, Message } from '../types';
import type { GuruChatMemoryContext } from '../chat';
import type { LanguageModelMessage as ModelMessage } from '@ai-sdk/provider';
import type { ToolResultPart, ToolSet } from 'ai';
import type { UserProfile } from '../../../types';

export type GroundingMode = 'local_tutor' | 'grounded_agent';
export type GroundingIntent =
  | 'teach'
  | 'clarify'
  | 'compare'
  | 'guideline'
  | 'fact_check'
  | 'visual'
  | 'quiz';
export type GroundingConfidencePolicy = 'high' | 'medium' | 'low';

export interface GroundingBudget {
  localContextBlocks: number;
  webEvidenceBlocks: number;
  imageSets: number;
  perSnippetChars: number;
  promptCharBudget: number;
}

export interface GroundingDecision {
  mode: GroundingMode;
  intent: GroundingIntent;
  sourceSensitivity: boolean;
  visualIntent: boolean;
  confidencePolicy: GroundingConfidencePolicy;
  retrievalBudget: GroundingBudget;
  reason: string;
}

export interface GroundingTrace {
  caller: string;
  questionPreview: string;
  modeChosen: GroundingMode;
  reason: string;
  toolsOffered: string[];
  toolsUsed: string[];
  sourceCount: number;
  imageCount: number;
  evidenceMix: {
    localContextBlocks: number;
    webEvidenceBlocks: number;
    imageSets: number;
  };
  modelUsed: string;
  searchQuery: string;
}

export interface GroundingRequest {
  caller: string;
  question: string;
  topicName?: string;
  subjectName?: string;
  subjectId?: number;
  syllabusTopicId?: number;
  messages?: Message[];
  history?: Array<{ role: 'user' | 'guru'; text: string }>;
  memoryContext?: GuruChatMemoryContext;
  profileContext?: string;
  studyContext?: string;
  chosenModel?: string;
  allowImages?: boolean;
  forceMode?: GroundingMode;
  profile?: UserProfile;
  onReplyDelta?: (delta: string) => void;
  sanitizeAccumulatedReply?: (text: string) => string;
  finalizeReply?: (text: string) => string;
  shouldRequestContinuation?: (text: string) => boolean;
  buildContinuationMessages?: (base: Message[], partialReply: string) => Message[];
  hasUsefulContinuation?: (base: string, continuation: string) => boolean;
  appendContinuation?: (base: string, continuation: string) => string;
}

export interface GroundingContextSection {
  kind: 'profile' | 'session' | 'tutor_state' | 'study' | 'local_notes' | 'transcript';
  title: string;
  content: string;
}

export interface PreparedGroundedTurn {
  request: GroundingRequest;
  profile: UserProfile;
  question: string;
  searchQuery: string;
  decision: GroundingDecision;
  systemPrompt: string;
  promptMessages: Message[];
  toolMessages: ModelMessage[];
  tools?: ToolSet;
  toolContext?: Record<string, unknown>;
  trace: GroundingTrace;
}

export interface GroundingResult {
  text: string;
  modelUsed: string;
  modeUsed: GroundingMode;
  toolsUsed: string[];
  sources: MedicalGroundingSource[];
  referenceImages: MedicalGroundingSource[];
  trace: GroundingTrace;
  searchQuery: string;
}

export interface GroundingArtifacts {
  toolsUsed: string[];
  sources: MedicalGroundingSource[];
  referenceImages: MedicalGroundingSource[];
  trace: GroundingTrace;
}

export interface GroundingExecutionState {
  aggregatedText: string;
  emittedText: string;
  modelUsed: string;
  toolResults: ToolResultPart[];
  toolCalls: Array<{ toolName: string; input: unknown }>;
}
