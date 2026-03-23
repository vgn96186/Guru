const mockGetInfoAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockTranscribeRawWithGroq = jest.fn();
const mockConvertToWav = jest.fn();
const mockSplitWavIntoChunks = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: '/mock-docs/',
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  EncodingType: { UTF8: 'utf8' },
}));

jest.mock('../transcription/engines', () => ({
  transcribeRawWithGroq: (...args: unknown[]) => mockTranscribeRawWithGroq(...args),
}));

jest.mock('../../../modules/app-launcher', () => ({
  convertToWav: (...args: unknown[]) => mockConvertToWav(...args),
  splitWavIntoChunks: (...args: unknown[]) => mockSplitWavIntoChunks(...args),
}));

jest.mock('../fileUri', () => ({
  toFileUri: (p: string) => p,
}));

jest.mock('../../components/Toast', () => ({
  showToast: jest.fn(),
}));

import {
  cleanupStaleCheckpointDirs,
  getRecordingInfo,
  transcribeWithGroqChunking,
} from './transcription';

describe('cleanupStaleCheckpointDirs', () => {
  it('should delete stale checkpoint directories', async () => {
    mockReadDirectoryAsync.mockResolvedValue([
      'transcripts_checkpoint_123',
      'transcripts_checkpoint_456',
      'other_dir',
    ]);

    await cleanupStaleCheckpointDirs();

    expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      '/mock-docs/transcripts_checkpoint_123',
      expect.objectContaining({ idempotent: true }),
    );
    expect(mockDeleteAsync).toHaveBeenCalledWith(
      '/mock-docs/transcripts_checkpoint_456',
      expect.objectContaining({ idempotent: true }),
    );
  });

  it('should not throw if readDirectory fails', async () => {
    mockReadDirectoryAsync.mockRejectedValue(new Error('permission denied'));

    await expect(cleanupStaleCheckpointDirs()).resolves.toBeUndefined();
  });

  it('should continue if individual delete fails', async () => {
    mockReadDirectoryAsync.mockResolvedValue([
      'transcripts_checkpoint_bad',
      'transcripts_checkpoint_good',
    ]);
    mockDeleteAsync
      .mockRejectedValueOnce(new Error('locked'))
      .mockResolvedValueOnce(undefined);

    await expect(cleanupStaleCheckpointDirs()).resolves.toBeUndefined();
    expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
  });
});

describe('getRecordingInfo', () => {
  it('should return file info for existing file', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 5000 });

    const info = await getRecordingInfo('/test/recording.m4a');

    expect(info.exists).toBe(true);
    expect(info.sizeBytes).toBe(5000);
    expect(info.needsChunking).toBe(false);
  });

  it('should flag needsChunking for files over 24MB', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 25 * 1024 * 1024 });

    const info = await getRecordingInfo('/test/large.m4a');

    expect(info.needsChunking).toBe(true);
  });

  it('should return not-exists for missing files', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });

    const info = await getRecordingInfo('/missing.m4a');

    expect(info.exists).toBe(false);
    expect(info.sizeBytes).toBe(0);
    expect(info.needsChunking).toBe(false);
  });

  it('should handle errors gracefully', async () => {
    mockGetInfoAsync.mockRejectedValue(new Error('fs error'));

    const info = await getRecordingInfo('/error.m4a');

    expect(info.exists).toBe(false);
  });
});

describe('transcribeWithGroqChunking', () => {
  it('should transcribe directly when file is small (no chunking needed)', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 1024 });
    mockTranscribeRawWithGroq.mockResolvedValue('small file transcript');

    const result = await transcribeWithGroqChunking('/test/small.m4a', 'groq-key');

    expect(result.transcript).toBe('small file transcript');
    expect(result.usedChunking).toBe(false);
    expect(mockConvertToWav).not.toHaveBeenCalled();
  });

  it('should chunk and transcribe large files', async () => {
    // Large file triggers chunking
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: 30 * 1024 * 1024 }) // initial size check
      .mockResolvedValueOnce({ exists: false }) // checkpoint dir doesn't exist
      .mockResolvedValueOnce({ exists: false }) // chunk 0 checkpoint doesn't exist
      .mockResolvedValueOnce({ exists: false }); // chunk 1 checkpoint doesn't exist

    mockConvertToWav.mockResolvedValue('/tmp/converted.wav');
    mockSplitWavIntoChunks.mockResolvedValue([
      { path: '/tmp/chunk0.wav' },
      { path: '/tmp/chunk1.wav' },
    ]);
    mockTranscribeRawWithGroq
      .mockResolvedValueOnce('chunk 0 text')
      .mockResolvedValueOnce('chunk 1 text');
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockResolvedValue(undefined);

    const result = await transcribeWithGroqChunking('/test/large.m4a', 'groq-key', 42);

    expect(result.usedChunking).toBe(true);
    expect(result.transcript).toContain('chunk 0 text');
    expect(result.transcript).toContain('chunk 1 text');
    expect(mockConvertToWav).toHaveBeenCalledWith('/test/large.m4a');
    expect(mockTranscribeRawWithGroq).toHaveBeenCalledTimes(2);
  });

  it('should resume from checkpoint when available', async () => {
    mockGetInfoAsync
      .mockResolvedValueOnce({ exists: true, size: 30 * 1024 * 1024 }) // size check
      .mockResolvedValueOnce({ exists: true }) // checkpoint dir exists
      .mockResolvedValueOnce({ exists: true }) // chunk 0 checkpoint exists
      .mockResolvedValueOnce({ exists: false }); // chunk 1 no checkpoint

    mockConvertToWav.mockResolvedValue('/tmp/converted.wav');
    mockSplitWavIntoChunks.mockResolvedValue([
      { path: '/tmp/chunk0.wav' },
      { path: '/tmp/chunk1.wav' },
    ]);
    mockReadAsStringAsync.mockResolvedValue('resumed chunk 0 text');
    mockTranscribeRawWithGroq.mockResolvedValue('chunk 1 text');
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockDeleteAsync.mockResolvedValue(undefined);

    const result = await transcribeWithGroqChunking('/test/large.m4a', 'groq-key', 99);

    expect(result.usedChunking).toBe(true);
    expect(result.transcript).toContain('resumed chunk 0 text');
    expect(result.transcript).toContain('chunk 1 text');
    // Groq should only be called once (chunk 1), chunk 0 was resumed
    expect(mockTranscribeRawWithGroq).toHaveBeenCalledTimes(1);
  });

  it('should throw when WAV conversion fails', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, size: 30 * 1024 * 1024 });
    mockConvertToWav.mockResolvedValue(null);
    mockMakeDirectoryAsync.mockResolvedValue(undefined);

    await expect(
      transcribeWithGroqChunking('/test/large.m4a', 'groq-key'),
    ).rejects.toThrow('WAV conversion failed');
  });
});
