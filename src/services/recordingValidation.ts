export interface RecordingFileInfo {
  exists: boolean;
  size: number;
}

export interface RecordingValidationPolicy {
  attempts: number;
  baseDelayMs: number;
  backoffFactor: number;
  minValidBytes: number;
}

export interface RecordingValidationResult {
  validated: boolean;
  attemptsUsed: number;
  lastInfo: RecordingFileInfo | null;
}

export const DEFAULT_RECORDING_VALIDATION_POLICY: RecordingValidationPolicy = {
  attempts: 8,
  baseDelayMs: 300,
  backoffFactor: 1.5,
  minValidBytes: 1024,
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function validateRecordingWithBackoff(
  path: string,
  validateFile: (path: string) => Promise<RecordingFileInfo>,
  policy: RecordingValidationPolicy = DEFAULT_RECORDING_VALIDATION_POLICY,
): Promise<RecordingValidationResult> {
  let lastInfo: RecordingFileInfo | null = null;

  for (let attempt = 0; attempt < policy.attempts; attempt += 1) {
    try {
      const info = await validateFile(path);
      lastInfo = info;
      if (info.exists && info.size > policy.minValidBytes) {
        return {
          validated: true,
          attemptsUsed: attempt + 1,
          lastInfo: info,
        };
      }
    } catch {
      // Validation errors are retried because filesystem flush can race.
    }

    if (attempt < policy.attempts - 1) {
      const delayMs = Math.round(policy.baseDelayMs * Math.pow(policy.backoffFactor, attempt));
      await sleep(delayMs);
    }
  }

  return {
    validated: false,
    attemptsUsed: policy.attempts,
    lastInfo,
  };
}
