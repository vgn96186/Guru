import { useCallback, useEffect, useRef } from 'react';
// TODO: Migrate from expo-av to expo-audio/expo-video when available
// expo-av is deprecated and will be removed in SDK 54
import { Audio } from 'expo-av';
import {
  stopRecording,
  hideOverlay,
  consumeLectureReturnRequest,
  consumePomodoroBreakRequest,
  isOverlayActive,
  isRecordingActive,
  getRecordingElapsedSeconds,
  validateRecordingFile,
  copyFileToPublicBackup,
  readLectureInsights,
} from '../../modules/app-launcher';
import {
  getIncompleteExternalSession,
  finishExternalAppSession,
  updateSessionPipelineTelemetry,
} from '../db/queries/externalLogs';
import {
  retryPendingNoteEnhancements,
  stopRecordingHealthCheck,
} from '../services/lecture/lectureSessionMonitor';
import { showToast } from '../components/Toast';
import { stripFileUri } from '../services/fileUri';
import { validateRecordingWithBackoff } from '../services/recordingValidation';
import { useAppStateTransition } from './useAppStateTransition';
import type { PomodoroBreakPayload, PomodoroBreakQuestion } from '../navigation/types';

export interface LectureReturnSheetData {
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  logId: number;
}

interface UseLectureReturnRecoveryParams {
  onRecovered: (payload: LectureReturnSheetData) => void;
  onPomodoroBreak?: (payload?: PomodoroBreakPayload) => void;
}

interface PrecomputedLectureInsights {
  subject?: string;
  topics?: string[];
  summary?: string;
  keyConcepts?: string[];
  quiz?: {
    questions?: PomodoroBreakQuestion[];
  };
}

/** Read actual audio duration from file headers using expo-av. Fast — does not decode audio. */
async function getAudioDurationMinutes(path: string): Promise<number | null> {
  let sound: Audio.Sound | null = null;
  try {
    const { sound: s, status } = await Audio.Sound.createAsync(
      { uri: path },
      { shouldPlay: false },
    );
    sound = s;
    if (status.isLoaded && status.durationMillis && status.durationMillis > 0) {
      return Math.max(1, Math.round(status.durationMillis / 60000));
    }
    return null;
  } catch {
    return null;
  } finally {
    sound?.unloadAsync().catch(() => {});
  }
}

/** Stop health monitoring and hide overlay atomically to avoid ordering bugs. */
async function stopHealthAndHideOverlay(): Promise<void> {
  stopRecordingHealthCheck();
  try {
    await hideOverlay();
  } catch (err) {
    console.warn('[Home] hideOverlay failed:', err);
  }
}

function parseLectureInsights(raw: string | null): PrecomputedLectureInsights | null {
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as PrecomputedLectureInsights;
  } catch (error) {
    console.warn('[LectureReturnRecovery] Failed to parse lecture insights sidecar:', error);
    return null;
  }
}

function normalizeQuestions(raw: PomodoroBreakQuestion[] | undefined): PomodoroBreakQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (q) =>
      !!q &&
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      typeof q.correctIndex === 'number' &&
      typeof q.explanation === 'string',
  );
}

export function useLectureReturnRecovery({
  onRecovered,
  onPomodoroBreak,
}: UseLectureReturnRecoveryParams) {
  const handledReturnLogRef = useRef<number | null>(null);
  const sessionCheckInProgressRef = useRef(false);
  const lastRecoveryAttemptRef = useRef(0);
  const lastPomodoroBreakLogRef = useRef<number | null>(null);

  const recoverPendingTranscriptions = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRecoveryAttemptRef.current < 60_000) {
      return;
    }
    lastRecoveryAttemptRef.current = now;
    try {
      const [recoveredTranscriptions, recoveredEnhancements] = await Promise.all([
        Promise.resolve(0), // Auto-retry disabled — use Recording Vault
        retryPendingNoteEnhancements(),
      ]);
      const totalRecovered = recoveredTranscriptions + recoveredEnhancements;
      if (totalRecovered > 0) {
        const parts = [
          recoveredTranscriptions > 0
            ? `${recoveredTranscriptions} lecture${recoveredTranscriptions > 1 ? 's' : ''}`
            : null,
          recoveredEnhancements > 0
            ? `${recoveredEnhancements} note${recoveredEnhancements > 1 ? 's' : ''}`
            : null,
        ].filter(Boolean);
        showToast(
          `${parts.join(' and ')} finished processing. Check your notes.`,
          'success',
          undefined,
          4000,
        );
      }
    } catch (err) {
      console.warn('[Home] Failed to recover pending transcriptions:', err);
    }
  }, []);

  const checkForReturnedSession = useCallback(
    async (showPrompt: boolean) => {
      if (sessionCheckInProgressRef.current) return;
      sessionCheckInProgressRef.current = true;
      try {
        const session = await getIncompleteExternalSession();
        if (!session || handledReturnLogRef.current === session.id) return;

        const [returnRequested, recordingActive, overlayActive] = await Promise.all([
          consumeLectureReturnRequest().catch(() => false),
          isRecordingActive().catch(() => false),
          isOverlayActive().catch(() => false),
        ]);

        if (__DEV__) {
          console.log('[LectureReturnRecovery] Return gate evaluated', {
            logId: session.id,
            appName: session.appName,
            showPrompt,
            returnRequested,
            recordingActive,
            overlayActive,
          });
        }

        if (!returnRequested && (recordingActive || overlayActive)) {
          if (__DEV__) {
            console.log(
              '[LectureReturnRecovery] Recovery delayed because native session is still active',
              {
                logId: session.id,
                recordingActive,
                overlayActive,
              },
            );
          }
          return;
        }

        const wallClockMinutes = Math.max(1, Math.round((Date.now() - session.launchedAt) / 60000));
        const recordedElapsedSeconds = await getRecordingElapsedSeconds().catch(() => 0);
        const recordedElapsedMinutes =
          recordedElapsedSeconds > 0 ? Math.max(1, Math.round(recordedElapsedSeconds / 60)) : null;
        const durationMinutes = recordedElapsedMinutes ?? wallClockMinutes;
        const logId = session.id!;
        handledReturnLogRef.current = logId;
        if (__DEV__) {
          console.log('[LectureReturnRecovery] Session detected', {
            logId,
            appName: session.appName,
            launchedAt: session.launchedAt,
            wallClockMinutes,
            recordedElapsedSeconds,
            recordedElapsedMinutes,
            showPrompt,
            dbRecordingPath: session.recordingPath ?? null,
          });
        }

        let recordingPath = session.recordingPath ?? null;

        // Always attempt to stop the native recorder.
        // This ensures the native service isn't left running and gives us a chance
        // to recover the path if it was missing from the DB due to a race.
        try {
          const stoppedPath = await stopRecording();
          if (stoppedPath) {
            recordingPath = stoppedPath;
            if (recordingPath.includes('/data/')) {
              const fileName = recordingPath.split('/').pop() || `backup_rec_${Date.now()}.m4a`;
              copyFileToPublicBackup(stripFileUri(recordingPath), fileName).catch(() => {});
            }
            if (__DEV__) {
              console.log('[LectureReturnRecovery] Native recorder stopped', {
                logId,
                recordingPath,
              });
            }
          }
        } catch (err) {
          console.warn('[Home] stopRecording failed:', err);
        }

        // If after stopping we still have no path, finish silently.
        if (!recordingPath) {
          if (__DEV__) {
            console.log('[LectureReturnRecovery] No recording path recovered after stop', {
              logId,
              showPrompt,
            });
          }
          await finishExternalAppSession(
            logId,
            durationMinutes,
            showPrompt ? 'Finished without recording' : 'Recovered silently on cold app launch',
          );
          await stopHealthAndHideOverlay();
          return;
        }

        if (recordingPath) {
          const validation = await validateRecordingWithBackoff(
            recordingPath,
            validateRecordingFile,
          );
          if (__DEV__) {
            console.log('[LectureReturnRecovery] Recording validation finished', {
              logId,
              recordingPath,
              validated: validation.validated,
              attemptsUsed: validation.attemptsUsed,
              lastInfo: validation.lastInfo,
            });
          }
          await updateSessionPipelineTelemetry(logId, {
            validationAttempts: validation.attemptsUsed,
          });
          if (!validation.validated) {
            try {
              const finalInfo = await validateRecordingFile(recordingPath);
              if (__DEV__) {
                console.log('[LectureReturnRecovery] Final validation info', {
                  logId,
                  recordingPath,
                  finalInfo,
                });
              }
              if (!finalInfo?.exists || finalInfo.size <= 100) {
                await updateSessionPipelineTelemetry(logId, { errorStage: 'validation' });
                showToast(
                  "Recording file isn't ready yet — it may appear when you reopen the app.",
                  'warning',
                );
              }
            } catch (e) {
              console.warn('[Home] Native validation threw, keeping path anyway:', e);
            }
          }
        }

        await stopHealthAndHideOverlay();

        // Use actual audio duration if we have the file; fall back to wall-clock
        let finalDurationMinutes = durationMinutes;
        if (recordingPath) {
          const audioDuration = await getAudioDurationMinutes(recordingPath);
          if (__DEV__) {
            console.log('[LectureReturnRecovery] Audio duration check', {
              logId,
              recordingPath,
              wallClockMinutes,
              recordedElapsedMinutes,
              audioDurationMinutes: audioDuration,
            });
          }
          if (audioDuration !== null) {
            finalDurationMinutes =
              recordedElapsedMinutes !== null
                ? Math.min(recordedElapsedMinutes, audioDuration)
                : audioDuration;
          }
        }
        if (__DEV__) {
          console.log('[LectureReturnRecovery] Finalized recovered session', {
            logId,
            appName: session.appName,
            recordingPath,
            finalDurationMinutes,
            showPrompt,
          });
        }

        await finishExternalAppSession(
          logId,
          finalDurationMinutes,
          showPrompt ? undefined : 'Recovered after app restart',
        );
        onRecovered({
          appName: session.appName,
          durationMinutes: finalDurationMinutes,
          recordingPath,
          logId,
        });
      } catch (err) {
        console.error('[Home] Error in checkForReturnedSession:', err);
        showToast("Couldn't process your lecture recording. Try opening the app again.", 'error');
      } finally {
        sessionCheckInProgressRef.current = false;
      }
    },
    [onRecovered],
  );

  const checkForPomodoroBreakRequest = useCallback(async () => {
    if (!onPomodoroBreak) return;
    try {
      const [breakRequested, session] = await Promise.all([
        consumePomodoroBreakRequest().catch(() => false),
        getIncompleteExternalSession(),
      ]);
      if (!breakRequested || !session?.id || !session.recordingPath) return;
      if (lastPomodoroBreakLogRef.current === session.id) return;
      lastPomodoroBreakLogRef.current = session.id;

      const insights = parseLectureInsights(
        await readLectureInsights(session.recordingPath).catch(() => null),
      );
      const questions = normalizeQuestions(insights?.quiz?.questions);

      if (__DEV__) {
        console.log('[LectureReturnRecovery] Pomodoro break requested', {
          logId: session.id,
          appName: session.appName,
          recordingPath: session.recordingPath,
          questionCount: questions.length,
          subject: insights?.subject ?? null,
        });
      }

      if (questions.length > 0 || insights?.summary?.trim() || insights?.keyConcepts?.length) {
        onPomodoroBreak({
          source: 'external_lecture',
          appName: session.appName,
          subject: insights?.subject,
          topics: Array.isArray(insights?.topics) ? insights?.topics.slice(0, 5) : [],
          summary: insights?.summary,
          keyConcepts: Array.isArray(insights?.keyConcepts)
            ? insights?.keyConcepts.slice(0, 5)
            : [],
          questions,
        });
      } else {
        onPomodoroBreak(undefined);
      }
    } catch (err) {
      console.warn('[LectureReturnRecovery] Failed to handle pomodoro break request:', err);
    }
  }, [onPomodoroBreak]);

  useAppStateTransition({
    onForeground: () => {
      checkForPomodoroBreakRequest();
      checkForReturnedSession(true);
      recoverPendingTranscriptions();
    },
  });

  useEffect(() => {
    checkForPomodoroBreakRequest();
    checkForReturnedSession(false);
    recoverPendingTranscriptions(true);
  }, [checkForPomodoroBreakRequest, checkForReturnedSession, recoverPendingTranscriptions]);

  return { recoverPendingTranscriptions, checkForReturnedSession, checkForPomodoroBreakRequest };
}
