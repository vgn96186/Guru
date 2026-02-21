import { useCallback, useState } from 'react';
import { useSharedValue, runOnJS } from 'react-native-reanimated';
import { useFrameProcessor } from 'react-native-vision-camera';
import { scanFaces } from 'vision-camera-face-detector';

export type FocusState = 'focused' | 'absent' | 'drowsy' | 'distracted';

interface FaceTrackingOptions {
  onAbsent?: () => void;
  onDrowsy?: () => void;
  onDistracted?: () => void;
  onFocused?: () => void;
  absentMs?: number;
  drowsyMs?: number;
  distractedMs?: number;
}

export function useFaceTracking({
  onAbsent,
  onDrowsy,
  onDistracted,
  onFocused,
  absentMs = 10000,
  drowsyMs = 5000,
  distractedMs = 15000,
}: FaceTrackingOptions = {}) {
  const [focusState, setFocusState] = useState<FocusState>('focused');

  // Shared values — accessible from the worklet thread
  const absentSince = useSharedValue(0);
  const drowsySince = useSharedValue(0);
  const distractedSince = useSharedValue(0);
  const lastAlertAt = useSharedValue(0);
  const currentState = useSharedValue<string>('focused');

  const notifyAbsent = useCallback(() => {
    setFocusState('absent');
    onAbsent?.();
  }, [onAbsent]);

  const notifyDrowsy = useCallback(() => {
    setFocusState('drowsy');
    onDrowsy?.();
  }, [onDrowsy]);

  const notifyDistracted = useCallback(() => {
    setFocusState('distracted');
    onDistracted?.();
  }, [onDistracted]);

  const notifyFocused = useCallback(() => {
    setFocusState('focused');
    onFocused?.();
  }, [onFocused]);

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    const now = Date.now();
    const alertCooldown = 30000; // 30s between repeated alerts
    const canAlert = now - lastAlertAt.value > alertCooldown;

    const faces = scanFaces(frame);

    if (faces.length === 0) {
      if (absentSince.value === 0) absentSince.value = now;
      drowsySince.value = 0;
      distractedSince.value = 0;

      if (now - absentSince.value > absentMs) {
        if (currentState.value !== 'absent') {
          currentState.value = 'absent';
          lastAlertAt.value = now;
          runOnJS(notifyAbsent)();
        } else if (canAlert) {
          lastAlertAt.value = now;
          runOnJS(notifyAbsent)();
        }
      }
      return;
    }

    absentSince.value = 0;
    const face = faces[0];

    // Drowsiness: both eyes mostly closed
    const leftEye = face.leftEyeOpenProbability ?? 1;
    const rightEye = face.rightEyeOpenProbability ?? 1;
    const avgEyeOpen = (leftEye + rightEye) / 2;

    if (avgEyeOpen < 0.3) {
      if (drowsySince.value === 0) drowsySince.value = now;
      distractedSince.value = 0;

      if (now - drowsySince.value > drowsyMs) {
        if (currentState.value !== 'drowsy') {
          currentState.value = 'drowsy';
          lastAlertAt.value = now;
          runOnJS(notifyDrowsy)();
        } else if (canAlert) {
          lastAlertAt.value = now;
          runOnJS(notifyDrowsy)();
        }
      }
      return;
    }
    drowsySince.value = 0;

    // Distraction: head turned significantly (yaw or pitch > 35°)
    const yaw = Math.abs(face.yawAngle ?? 0);
    const pitch = Math.abs(face.pitchAngle ?? 0);

    if (yaw > 35 || pitch > 35) {
      if (distractedSince.value === 0) distractedSince.value = now;

      if (now - distractedSince.value > distractedMs) {
        if (currentState.value !== 'distracted') {
          currentState.value = 'distracted';
          lastAlertAt.value = now;
          runOnJS(notifyDistracted)();
        } else if (canAlert) {
          lastAlertAt.value = now;
          runOnJS(notifyDistracted)();
        }
      }
      return;
    }
    distractedSince.value = 0;

    // Focused
    if (currentState.value !== 'focused') {
      currentState.value = 'focused';
      runOnJS(notifyFocused)();
    }
  }, [absentMs, drowsyMs, distractedMs,
      notifyAbsent, notifyDrowsy, notifyDistracted, notifyFocused]);

  return { focusState, frameProcessor };
}
