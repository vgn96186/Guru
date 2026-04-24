import { AppState } from 'react-native';
import { validateRecordingFile } from '../../../modules/app-launcher';
import {
  notifyRecordingHealthIssue,
  notifyTranscriptionEvidenceOk,
  notifyTranscriptionEvidenceNoSpeech,
} from '../notificationService';
import { transcribeRawWithGroq, transcribeRawWithHuggingFace } from '../transcription/engines';
import { startRecordingHealthCheck, stopRecordingHealthCheck } from './health';

jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  },
}));

jest.mock('../../../modules/app-launcher', () => ({
  validateRecordingFile: jest.fn(),
}));

jest.mock('../notificationService', () => ({
  notifyRecordingHealthIssue: jest.fn(),
  notifyTranscriptionEvidenceOk: jest.fn(),
  notifyTranscriptionEvidenceNoSpeech: jest.fn(),
  notifyTranscriptionEvidenceError: jest.fn(),
}));

jest.mock('../transcription/engines', () => ({
  transcribeRawWithGroq: jest.fn(),
  transcribeRawWithHuggingFace: jest.fn(),
  transcribeRawWithLocalWhisper: jest.fn(),
}));

describe('lecture health service', () => {
  let setIntervalSpy: jest.SpyInstance;
  let clearIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    setIntervalSpy = jest.spyOn(global, 'setInterval');
    clearIntervalSpy = jest.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    stopRecordingHealthCheck();
    jest.useRealTimers();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('starts and stops the health check timer', () => {
    startRecordingHealthCheck('path/to/record', 'TestApp');
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);

    stopRecordingHealthCheck();
    expect(clearIntervalSpy).toHaveBeenCalled();
  });

  it('notifies when recording is stalled', async () => {
    (validateRecordingFile as jest.Mock).mockResolvedValue({ exists: true, size: 100 });

    startRecordingHealthCheck('path/to/record', 'TestApp');

    // First check: size 100
    await jest.advanceTimersByTimeAsync(60_000);
    expect(notifyRecordingHealthIssue).not.toHaveBeenCalled();

    // Second check: size 100 (stalled count = 1)
    await jest.advanceTimersByTimeAsync(60_000);
    expect(notifyRecordingHealthIssue).not.toHaveBeenCalled();

    // Third check: size 100 (stalled count = 2)
    await jest.advanceTimersByTimeAsync(60_000);
    expect(notifyRecordingHealthIssue).not.toHaveBeenCalled();

    // Fourth check: size 100 (stalled count = 3) -> NOTIFY
    await jest.advanceTimersByTimeAsync(60_000);
    expect(notifyRecordingHealthIssue).toHaveBeenCalledWith('TestApp');
  });

  it('resets stalled count when file size increases', async () => {
    (validateRecordingFile as jest.Mock)
      .mockResolvedValueOnce({ exists: true, size: 100 })
      .mockResolvedValueOnce({ exists: true, size: 100 })
      .mockResolvedValueOnce({ exists: true, size: 200 });

    startRecordingHealthCheck('path/to/record', 'TestApp');

    await jest.advanceTimersByTimeAsync(60_000); // size 100
    await jest.advanceTimersByTimeAsync(60_000); // size 100 (stalled count = 1)
    await jest.advanceTimersByTimeAsync(60_000); // size 200 (stalled count reset)

    expect(notifyRecordingHealthIssue).not.toHaveBeenCalled();
  });

  it('runs transcription evidence check with Groq', async () => {
    (transcribeRawWithGroq as jest.Mock).mockResolvedValue('Some transcript');

    startRecordingHealthCheck('path/to/record', 'TestApp', { groqKey: 'test-key' });

    await jest.advanceTimersByTimeAsync(90_000);

    expect(transcribeRawWithGroq).toHaveBeenCalledWith('path/to/record', 'test-key');
    expect(notifyTranscriptionEvidenceOk).toHaveBeenCalledWith('TestApp');
  });

  it('falls back to Hugging Face if Groq transcript is empty', async () => {
    (transcribeRawWithGroq as jest.Mock).mockResolvedValue('');
    (transcribeRawWithHuggingFace as jest.Mock).mockResolvedValue('HF transcript');

    startRecordingHealthCheck('path/to/record', 'TestApp', {
      groqKey: 'test-key',
      huggingFaceToken: 'hf-token',
    });

    await jest.advanceTimersByTimeAsync(90_000);

    expect(transcribeRawWithGroq).toHaveBeenCalled();
    expect(transcribeRawWithHuggingFace).toHaveBeenCalled();
    expect(notifyTranscriptionEvidenceOk).toHaveBeenCalledWith('TestApp');
  });

  it('notifies no speech if all engines return empty', async () => {
    (transcribeRawWithGroq as jest.Mock).mockResolvedValue('');

    startRecordingHealthCheck('path/to/record', 'TestApp', { groqKey: 'test-key' });

    await jest.advanceTimersByTimeAsync(90_000);

    expect(notifyTranscriptionEvidenceNoSpeech).toHaveBeenCalledWith('TestApp');
  });

  it('stops health check when app goes to background', () => {
    const removeSpy = jest.fn();
    (AppState.addEventListener as jest.Mock).mockReturnValue({ remove: removeSpy });

    startRecordingHealthCheck('path/to/record', 'TestApp');

    const handler = (AppState.addEventListener as jest.Mock).mock.calls[0][1];
    handler('background');

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
  });
});
