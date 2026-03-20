import {
  DEFAULT_RECORDING_VALIDATION_POLICY,
  validateRecordingWithBackoff,
} from './recordingValidation';

describe('recordingValidation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('succeeds on first attempt if file is already valid', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 2048 }));
    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY },
    );

    const result = await resultPromise;
    expect(result.validated).toBe(true);
    expect(result.attemptsUsed).toBe(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('succeeds when file becomes valid after retries', async () => {
    let calls = 0;
    const validate = jest.fn(async () => {
      calls += 1;
      if (calls < 3) return { exists: true, size: 256 };
      return { exists: true, size: 4096 };
    });

    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, baseDelayMs: 100 },
    );

    // Initial call happens immediately
    await Promise.resolve(); 
    await Promise.resolve(); 
    expect(validate).toHaveBeenCalledTimes(1);
    
    // First delay (100ms base * 1.5^0 = 100)
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();
    expect(validate).toHaveBeenCalledTimes(2);

    // Second delay (100ms base * 1.5^1 = 150)
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();
    expect(validate).toHaveBeenCalledTimes(3);

    const result = await resultPromise;
    expect(result.validated).toBe(true);
    expect(result.attemptsUsed).toBe(3);
    expect(result.lastInfo?.size).toBe(4096);
  });

  it('retries when validateFile throws', async () => {
    let calls = 0;
    const validate = jest.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('FS error');
      return { exists: true, size: 2048 };
    });

    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, baseDelayMs: 100 },
    );

    await Promise.resolve();
    await Promise.resolve();
    
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();

    const result = await resultPromise;
    expect(result.validated).toBe(true);
    expect(result.attemptsUsed).toBe(2);
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('handles null info from validateFile as invalid', async () => {
    const validate = jest.fn(async () => (null as any));
    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 2, baseDelayMs: 100 },
    );

    await Promise.resolve();
    await Promise.resolve();
    
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();

    const result = await resultPromise;
    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(2);
    expect(result.lastInfo).toBeNull();
  });

  it('reports lastInfo from the last attempt even on failure', async () => {
    let calls = 0;
    const validate = jest.fn(async () => {
      calls += 1;
      return { exists: true, size: 100 * calls }; // Never reaches 1024
    });

    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 3, baseDelayMs: 100 },
    );

    // Attempt 1
    await Promise.resolve();
    await Promise.resolve();

    // Attempt 2
    jest.advanceTimersByTime(100);
    await Promise.resolve();
    await Promise.resolve();

    // Attempt 3
    jest.advanceTimersByTime(150);
    await Promise.resolve();
    await Promise.resolve();

    const result = await resultPromise;
    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(3);
    expect(result.lastInfo?.size).toBe(300);
  });

  it('returns false when file never reaches min size', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 128 }));
    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 3, baseDelayMs: 100 },
    );

    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(1000); 
    }

    const result = await resultPromise;
    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(3);
  });

  it('handles policy.attempts = 0', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 2048 }));
    const result = await validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 0 },
    );

    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(0);
    expect(validate).not.toHaveBeenCalled();
  });

  it('only tries once if policy.attempts = 1', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 10 }));
    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 1 },
    );

    const result = await resultPromise;
    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(1);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('validates if minValidBytes is 0', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 1 }));
    const result = await validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, minValidBytes: 0 },
    );

    expect(result.validated).toBe(true);
    expect(result.attemptsUsed).toBe(1);
  });

  it('eventually fails if validateFile always throws', async () => {
    const validate = jest.fn(async () => { throw new Error('Deadly error'); });
    const resultPromise = validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 3, baseDelayMs: 100 },
    );

    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
    }

    const result = await resultPromise;
    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(3);
    expect(result.lastInfo).toBeNull();
  });

  it('fails if size is exactly equal to minValidBytes', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 1024 }));
    const result = await validateRecordingWithBackoff(
      '/tmp/audio.m4a',
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, minValidBytes: 1024, attempts: 1 },
    );

    expect(result.validated).toBe(false);
    expect(result.attemptsUsed).toBe(1);
  });

  it('passes the correct path to the validation function', async () => {
    const validate = jest.fn(async () => ({ exists: true, size: 2048 }));
    const testPath = '/custom/path/to/recording.m4a';
    await validateRecordingWithBackoff(
      testPath,
      validate,
      { ...DEFAULT_RECORDING_VALIDATION_POLICY, attempts: 1 },
    );

    expect(validate).toHaveBeenCalledWith(testPath);
  });
});
