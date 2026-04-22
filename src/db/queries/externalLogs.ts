export type TranscriptionStatus =
  | 'pending'
  | 'recording'
  | 'transcribing'
  | 'completed'
  | 'failed'
  | 'no_audio'
  | 'dismissed';
export type PipelineStageName = 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
export type NoteEnhancementStatus = 'pending' | 'completed' | 'failed';
export type PipelineProviderName =
  | 'groq'
  | 'cloudflare'
  | 'huggingface'
  | 'deepgram'
  | 'local'
  | 'unknown';

export interface PipelineStageTelemetry {
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface SessionPipelineEvent {
  at: number;
  stage: PipelineStageName | 'system';
  message: string;
  detail?: string;
  percent?: number;
  provider?: PipelineProviderName;
}

export interface SessionPipelineTelemetry {
  engine?: 'local_whisper' | 'groq' | 'unknown';
  audioSizeBytes?: number;
  estimatedMinutes?: number;
  validationAttempts?: number;
  usedChunking?: boolean;
  chunkCount?: number;
  transcriptChars?: number;
  topicsDetected?: number;
  keyConceptsDetected?: number;
  errorStage?: 'validation' | 'transcribing' | 'analyzing' | 'saving' | 'enhancing';
  totalForegroundMs?: number;
  enhancementSucceeded?: boolean;
  currentStage?: PipelineStageName;
  currentMessage?: string;
  currentDetail?: string;
  currentPercent?: number;
  currentProvider?: PipelineProviderName;
  lastUpdatedAt?: number;
  providerAttempts?: Partial<Record<PipelineProviderName, number>>;
  events?: SessionPipelineEvent[];
  stages?: Partial<Record<PipelineStageName, PipelineStageTelemetry>>;
}

export interface ExternalAppLog {
  id?: number;
  appName: string;
  launchedAt: number;
  returnedAt?: number | null;
  durationMinutes?: number | null;
  notes?: string;
  recordingPath?: string | null;
  transcriptionStatus?: TranscriptionStatus;
  transcriptionError?: string | null;
  lectureNoteId?: number | null;
  noteEnhancementStatus?: NoteEnhancementStatus | null;
  pipelineTelemetry?: SessionPipelineTelemetry | null;
}

import { externalLogsRepositoryDrizzle } from '../repositories/externalLogsRepository.drizzle';

export async function startExternalAppSession(
  appName: string,
  recordingPath?: string,
): Promise<number> {
  return externalLogsRepositoryDrizzle.startExternalAppSession(appName, recordingPath);
}

export async function finishExternalAppSession(
  logId: number,
  durationMinutes: number,
  notes?: string,
): Promise<void> {
  return externalLogsRepositoryDrizzle.finishExternalAppSession(logId, durationMinutes, notes);
}

export async function updateSessionTranscriptionStatus(
  logId: number,
  status: TranscriptionStatus,
  error?: string,
  lectureNoteId?: number,
): Promise<void> {
  return externalLogsRepositoryDrizzle.updateSessionTranscriptionStatus(
    logId,
    status,
    error,
    lectureNoteId,
  );
}

export async function updateSessionNoteEnhancementStatus(
  logId: number,
  status: NoteEnhancementStatus,
): Promise<void> {
  return externalLogsRepositoryDrizzle.updateSessionNoteEnhancementStatus(logId, status);
}

export async function updateSessionRecordingPath(
  logId: number,
  recordingPath: string,
): Promise<void> {
  return externalLogsRepositoryDrizzle.updateSessionRecordingPath(logId, recordingPath);
}

export async function updateSessionPipelineTelemetry(
  logId: number,
  patch: Partial<SessionPipelineTelemetry>,
): Promise<void> {
  return externalLogsRepositoryDrizzle.updateSessionPipelineTelemetry(logId, patch);
}

export async function appendSessionPipelineEvent(
  logId: number,
  event: SessionPipelineEvent,
  patch?: Partial<SessionPipelineTelemetry>,
): Promise<void> {
  return externalLogsRepositoryDrizzle.appendSessionPipelineEvent(logId, event, patch);
}

export async function getIncompleteExternalSession(): Promise<ExternalAppLog | null> {
  return externalLogsRepositoryDrizzle.getIncompleteExternalSession();
}

export async function getTodaysExternalStudyMinutes(): Promise<number> {
  return externalLogsRepositoryDrizzle.getTodaysExternalStudyMinutes();
}

/**
 * Get sessions where audio was recorded but transcription failed or never ran.
 * Used for retry-on-launch recovery.
 */
export async function getFailedOrPendingTranscriptions(): Promise<ExternalAppLog[]> {
  return externalLogsRepositoryDrizzle.getFailedOrPendingTranscriptions();
}

export async function getSessionsNeedingNoteEnhancement(): Promise<ExternalAppLog[]> {
  return externalLogsRepositoryDrizzle.getSessionsNeedingNoteEnhancement();
}

export async function getTotalExternalStudyMinutes(): Promise<number> {
  return externalLogsRepositoryDrizzle.getTotalExternalStudyMinutes();
}
