export type GeneratedStudyImageContextType = 'chat' | 'topic_note' | 'lecture_note';
export type GeneratedStudyImageStyle = 'illustration' | 'chart';

export interface GeneratedStudyImageRecord {
  id: number;
  contextType: GeneratedStudyImageContextType;
  contextKey: string;
  topicId: number | null;
  topicName: string;
  lectureNoteId: number | null;
  style: GeneratedStudyImageStyle;
  prompt: string;
  provider: string;
  modelUsed: string;
  mimeType: string;
  localUri: string;
  remoteUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export interface SaveGeneratedStudyImageInput {
  contextType: GeneratedStudyImageContextType;
  contextKey: string;
  topicId?: number | null;
  topicName: string;
  lectureNoteId?: number | null;
  style: GeneratedStudyImageStyle;
  prompt: string;
  provider: string;
  modelUsed: string;
  mimeType: string;
  localUri: string;
  remoteUrl?: string | null;
  width?: number | null;
  height?: number | null;
}
