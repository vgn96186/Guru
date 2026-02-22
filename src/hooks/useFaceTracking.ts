import { useState } from 'react';

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

// Stubbed out — vision-camera-face-detector is incompatible with current react-native-vision-camera.
// Face tracking can be re-enabled when a compatible plugin is available.
export function useFaceTracking(_options: FaceTrackingOptions = {}) {
  const [focusState] = useState<FocusState>('focused');
  return { focusState, frameProcessor: undefined };
}
