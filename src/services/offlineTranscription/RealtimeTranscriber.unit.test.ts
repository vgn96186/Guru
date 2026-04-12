import { RealtimeTranscriptionController } from './realtimeTranscriber';
import { getWhisperModelManager } from './whisperModelManager';
import * as whisper from 'whisper.rn';

jest.mock('./whisperModelManager', () => ({
  getWhisperModelManager: jest.fn(() => ({
    getContext: jest.fn(() => ({})),
    getVadModelPath: jest.fn(() => Promise.resolve('/mock/vad.bin')),
  })),
}));

describe('RealtimeTranscriptionController', () => {
  let controller: any;
  let modelManager: any;
  let RealtimeTranscriptionController: any;
  let whisper: any;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('./whisperModelManager', () => ({
      getWhisperModelManager: jest.fn(() => ({
        getContext: jest.fn(() => ({})),
        getVadModelPath: jest.fn(() => Promise.resolve('/mock/vad.bin')),
      })),
    }));

    jest.doMock('whisper.rn', () => ({
      AudioPcmStreamAdapter: jest.fn(),
      RealtimeTranscriber: jest
        .fn()
        .mockImplementation(function (this: { start: jest.Mock; stop: jest.Mock }) {
          this.start = jest.fn();
          this.stop = jest.fn();
        }),
    }));

    RealtimeTranscriptionController =
      require('./realtimeTranscriber').RealtimeTranscriptionController;
    modelManager = require('./whisperModelManager').getWhisperModelManager();
    whisper = require('whisper.rn');
    controller = new RealtimeTranscriptionController(modelManager);
  });

  it('can start transcription', async () => {
    const callback = jest.fn();
    await controller.start(callback);

    expect(whisper.AudioPcmStreamAdapter).toHaveBeenCalled();
    expect(whisper.RealtimeTranscriber).toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
  });

  it('can stop transcription', async () => {
    const callback = jest.fn();
    await controller.start(callback);
    const segments = await controller.stop();

    expect(Array.isArray(segments)).toBe(true);
  });
});
