import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import {
  stopRecording,
  hideOverlay,
  consumeLectureReturnRequest,
  isOverlayActive,
  isRecordingActive,
  validateRecordingFile,
  copyFileToPublicBackup,
} from '../../modules/app-launcher';
import {
  getIncompleteExternalSession,
  finishExternalAppSession,
  updateSessionPipelineTelemetry,
} from '../db/queries/externalLogs';
import {
  retryFailedTranscriptions,
  retryPendingNoteEnhancements,
  stopRecordingHealthCheck,
} from '../services/lecture/lectureSessionMonitor';
import { showToast } from '../components/Toast';
import { stripFileUri } from '../services/fileUri';
import { validateRecordingWithBackoff } from '../services/recordingValidation';
import { useAppStateTransition } from './useAppStateTransition';

export interface LectureReturnSheetData {
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  logId: number;
}

interface UseLectureReturnRecoveryParams {
  onRecovered: (payload: LectureReturnSheetData) => void;
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

export function useLectureReturnRecovery({ onRecovered }: UseLectureReturnRecoveryParams) {
  const handledReturnLogRef = useRef<number | null>(null);
  const lastRecoveryAttemptRef = useRef(0);

  const recoverPendingTranscriptions = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRecoveryAttemptRef.current < 60_000) {
      return;
    }
    lastRecoveryAttemptRef.current = now;
    try {
      const [recoveredTranscriptions, recoveredEnhancements] = await Promise.all([
        retryFailedTranscriptions(),
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
      try {
        const session = await getIncompleteExternalSession();
        if (!session || handledReturnLogRef.current === session.id) return;

        const [returnRequested, recordingActive, overlayActive] = await Promise.all([
          consumeLectureReturnRequest().catch(() => false),
          isRecordingActive().catch(() => false),
          isOverlayActive().catch(() => false),
        ]);

        if (!returnRequested && (recordingActive || overlayActive)) {
          return;
        }

        const durationMinutes = Math.max(1, Math.round((Date.now() - session.launchedAt) / 60000));
        const logId = session.id!;
        handledReturnLogRef.current = logId;

        let recordingPath = session.recordingPath ?? null;

        // Always attempt to stop the native recorder.
        // This ensures the native service isn't left running and gives us a chance
        // to recover the path if it was missing from the DB due to a race.
        try {
          const stoppedPath = await Promise.race<string | null>([
            stopRecording(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
          ]);
          if (stoppedPath) {
            recordingPath = stoppedPath;
            if (recordingPath.includes('/data/')) {
              const fileName = recordingPath.split('/').pop() || `backup_rec_${Date.now()}.m4a`;
              copyFileToPublicBackup(stripFileUri(recordingPath), fileName).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('[Home] stopRecording failed:', err);
        }

        // If after stopping we still have no path, finish silently.
        if (!recordingPath) {
          await finishExternalAppSession(
            logId,
            durationMinutes,
            showPrompt ? 'Finished without recording' : 'Recovered silently on cold app launch',
          );
          await stopHealthAndHideOverlay();
          return;
        }

        if (!showPrompt) {
          await finishExternalAppSession(
            logId,
            durationMinutes,
            'Stale session cleaned on cold launch',
          );
          return;
        }

        if (recordingPath) {
          const validation = await validateRecordingWithBackoff(
            recordingPath,
            validateRecordingFile,
          );
          await updateSessionPipelineTelemetry(logId, {
            validationAttempts: validation.attemptsUsed,
          });
          if (!validation.validated) {
            try {
              const finalInfo = await validateRecordingFile(recordingPath);
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
          if (audioDuration !== null) finalDurationMinutes = audioDuration;
        }

        await finishExternalAppSession(logId, finalDurationMinutes);
        onRecovered({
          appName: session.appName,
          durationMinutes: finalDurationMinutes,
          recordingPath,
          logId,
        });
      } catch (err) {
        console.error('[Home] Error in checkForReturnedSession:', err);
        showToast("Couldn't process your lecture recording. Try opening the app again.", 'error');
      }
    },
    [onRecovered],
  );

  useAppStateTransition({
    onForeground: () => {
      checkForReturnedSession(true);
      recoverPendingTranscriptions();
    },
  });

  useEffect(() => {
    checkForReturnedSession(false);
    recoverPendingTranscriptions(true);
  }, [checkForReturnedSession, recoverPendingTranscriptions]);

  return { recoverPendingTranscriptions, checkForReturnedSession };
}
