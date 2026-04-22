import type { AIContent, ContentType } from '../../types';

export interface Props {
  content: AIContent;
  topicId?: number;
  contentType?: ContentType;
  onDone: (confidence: number) => void;
  onSkip: () => void;
  onQuizAnswered?: (correct: boolean) => void;
  onQuizComplete?: (correct: number, total: number) => void;
}

export type ContextUpdater = (context: string | undefined) => void;
