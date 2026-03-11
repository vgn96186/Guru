import {
  DEFAULT_RECORDING_VALIDATION_POLICY,
  validateRecordingWithBackoff,
} from './recordingValidation';

describe('recordingValidation', () => {
  it('succeeds when file becomes valid after retries', async () => {
    let calls = 0;
    const validate = jest.fn(async () => {
      calls += 1;
      if (calls < 3) return { exists: true, size: 256 };
      return { exists: true, size: 4096 };
    });

    const result = await validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, baseDelayMs: 1 },
    );

    expect(result.validated).toBe(true);
    expect(result.attemptsUsed).toBe(3);
    expect(result.lastInfo?.size).toBe(4096);
  });

  it('returns false when file never reaches min size', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 128 }));
    const result = await validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 3, baseDelayMs: 1 },
    );

    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(3);
  });
});
