import { AppState } from 'react-native';
import { validateRecordingFile } from '../../../modules/app-launcher';
import { notifyRecordingHealthIssue } from '../notificationService';

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
let lastKnownFileSize = 0;
let stalledCount = 0;

const HEALTH_CHECK_INTERVAL = 60_000;
const STALLED_THRESHOLD = 3;

export function startRecordingHealthCheck(recordingPath: string, appName: string): void {
  stopRecordingHealthCheck();
  lastKnownFileSize = 0;
  stalledCount = 0;

  const appStateListener = AppState.addEventListener('change', (state) => {
    if (state === 'background' || state === 'inactive') {
      stopRecordingHealthCheck();
      appStateListener.remove();
    }
  });

  healthCheckTimer = setInterval(async () => {
    try {
      const info = await validateRecordingFile(recordingPath);
      if (!info.exists || info.size <= lastKnownFileSize) {
        stalledCount++;
      } else {
        stalledCount = 0;
        lastKnownFileSize = info.size;
      }

      if (stalledCount >= STALLED_THRESHOLD) {
        await notifyRecordingHealthIssue(appName);
        stalledCount = 0;
      }
    } catch (e) {
      console.warn('[Health] Health check error:', e);
    }
  }, HEALTH_CHECK_INTERVAL);
}

export function stopRecordingHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}
