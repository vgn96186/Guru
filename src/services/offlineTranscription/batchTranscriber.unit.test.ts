import * as FileSystem from 'expo-file-system/legacy';
import { BatchTranscriber } from './batchTranscriber';
import type { WhisperModelManager } from './whisperModelManager';

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../modules/app-launcher', () => ({
  splitWavIntoChunks: jest.fn(),
  convertToWav: jest.fn(),
}));

const { splitWavIntoChunks } = require('../../../modules/app-launcher');

describe('BatchTranscriber', () => {
  const mockManager = {
    getContext: jest.fn(() => ({
      transcribe: jest.fn().mockResolvedValue({ result: '', segments: [] }),
    })),
  } as unknown as WhisperModelManager;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes cancel, pause, resume, and getSegments', () => {
    const bt = new BatchTranscriber(mockManager);
    expect(bt.getSegments()).toEqual([]);
    bt.pause();
    bt.resume();
    bt.cancel();
    expect(bt.getSegments()).toEqual([]);
  });

  it('throws TranscriptionError when WAV file is missing', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });
    const bt = new BatchTranscriber(mockManager);
    await expect(bt.transcribe('file:///tmp/nope.wav')).rejects.toMatchObject({
      code: 'AUDIO_FORMAT_ERROR',
    });
  });

  it('throws when chunking produces zero chunks', async () => {
    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 44_000 });
    (splitWavIntoChunks as jest.Mock).mockResolvedValue([]);
    const bt = new BatchTranscriber(mockManager);
    await expect(bt.transcribe('file:///tmp/empty.wav')).rejects.toMatchObject({
      code: 'EMPTY_TRANSCRIPTION',
    });
  });
});
