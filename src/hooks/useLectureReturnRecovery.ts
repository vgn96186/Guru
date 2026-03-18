import { useCallback, useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { stopRecording, hideOverlay, validateRecordingFile } from '../../modules/app-launcher';
import {
  getIncompleteExternalSession,
  finishExternalAppSession,
  updateSessionPipelineTelemetry,
} from '../db/queries/externalLogs';
import {
  retryFailedTranscriptions,
  retryPendingNoteEnhancements,
  stopRecordingHealthCheck,
} from '../services/lectureSessionMonitor';
import { showToast } from '../components/Toast';
import { validateRecordingWithBackoff } from '../services/recordingValidation';

export interface LectureReturnSheetData {
  appName: string;
  durationMinutes: number;
  recordingPath: string | null;
  logId: number;
}

interface UseLectureReturnRecoveryParams {
  onRecovered: (payload: LectureReturnSheetData) => void;
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
  const appStateRef = useRef(AppState.currentState);
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

        const durationMinutes = Math.max(1, Math.round((Date.now() - session.launchedAt) / 60000));
        const logId = session.id!;
        handledReturnLogRef.current = logId;

        if (!showPrompt && !session.recordingPath) {
          await finishExternalAppSession(
            logId,
            durationMinutes,
            'Recovered silently on cold app launch',
          );
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

        let recordingPath = session.recordingPath ?? null;

        try {
          const stoppedPath = await Promise.race<string | null>([
            stopRecording(),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
          ]);
          if (stoppedPath) recordingPath = stoppedPath;
        } catch (err) {
          console.warn('[Home] stopRecording failed:', err);
        }

        if (!recordingPath && session.recordingPath) {
          recordingPath = session.recordingPath;
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

        await finishExternalAppSession(logId, durationMinutes);
        onRecovered({
          appName: session.appName,
          durationMinutes,
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

  useEffect(() => {
    checkForReturnedSession(false);
    recoverPendingTranscriptions(true);
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        checkForReturnedSession(true);
        recoverPendingTranscriptions();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [checkForReturnedSession, recoverPendingTranscriptions]);

  return { recoverPendingTranscriptions, checkForReturnedSession };
}
