import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useLectureTranscription } from './useLectureTranscription';
import { getWhisperModelManager } from '../services/offlineTranscription/whisperModelManager';
import { getAudioRecorder } from '../services/offlineTranscription/audioRecorder';
import { RealtimeTranscriptionController } from '../services/offlineTranscription/realtimeTranscriber';
import { BatchTranscriber } from '../services/offlineTranscription/batchTranscriber';
import { TranscriptMerger } from '../services/offlineTranscription/transcriptMerger';
import { TranscriptionError } from '../services/offlineTranscription/types';

// Mock dependencies
jest.mock('../services/offlineTranscription/whisperModelManager', () => ({
  getWhisperModelManager: jest.fn(),
  MODEL_REGISTRY: {},
}));

jest.mock('../services/offlineTranscription/audioRecorder', () => ({
  getAudioRecorder: jest.fn(),
}));

jest.mock('../services/offlineTranscription/realtimeTranscriber', () => ({
  RealtimeTranscriptionController: jest.fn(),
}));

jest.mock('../services/offlineTranscription/batchTranscriber', () => ({
  BatchTranscriber: jest.fn(),
}));

jest.mock('../services/offlineTranscription/transcriptMerger', () => ({
  TranscriptMerger: jest.fn(),
}));

describe('useLectureTranscription', () => {
  let mockModelManager: any;
  let mockAudioRecorder: any;
  let mockRealtimeController: any;
  let mockBatchTranscriber: any;
  let mockTranscriptMerger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockModelManager = {
      getState: jest.fn().mockResolvedValue({
        isDownloaded: false,
        isLoaded: false,
        isDownloading: false,
      }),
      downloadModel: jest.fn(),
      cancelDownload: jest.fn(),
      deleteModel: jest.fn(),
      loadModel: jest.fn(),
      unloadModel: jest.fn(),
      getActiveModelSize: jest.fn().mockReturnValue(null),
    };
    (getWhisperModelManager as jest.Mock).mockReturnValue(mockModelManager);

    mockAudioRecorder = {
      startRecording: jest.fn().mockResolvedValue('file:///test.wav'),
      stopRecording: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn(),
    };
    (getAudioRecorder as jest.Mock).mockReturnValue(mockAudioRecorder);

    mockRealtimeController = {
      start: jest.fn(),
      stop: jest.fn().mockResolvedValue([]),
      pause: jest.fn(),
      resume: jest.fn(),
      destroy: jest.fn(),
      getVadSkippedSeconds: jest.fn().mockReturnValue(0),
    };
    (RealtimeTranscriptionController as jest.Mock).mockReturnValue(mockRealtimeController);

    mockBatchTranscriber = {
      transcribe: jest.fn().mockResolvedValue({
        segments: [],
        vadSkippedSeconds: 0,
        processingTimeSeconds: 0,
      }),
      cancel: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
    };
    (BatchTranscriber as jest.Mock).mockReturnValue(mockBatchTranscriber);

    mockTranscriptMerger = {
      merge: jest.fn().mockReturnValue({
        id: 'test-id',
        title: 'Test Lecture',
        recordedAt: new Date().toISOString(),
        durationSeconds: 10,
        modelUsed: 'ggml-small.en',
        text: 'Test transcript',
        segments: [],
        metadata: {
          deviceModel: 'Test Device',
          processingTimeSeconds: 1,
          audioFormat: 'wav',
          vadSkippedSeconds: 0,
        },
      }),
    };
    (TranscriptMerger as jest.Mock).mockImplementation(() => mockTranscriptMerger);
  });

  it('should initialize with default state', async () => {
    const { result } = renderHook(() => useLectureTranscription());

    expect(result.current.modelState).toEqual({
      isDownloaded: false,
      isLoaded: false,
      isDownloading: false,
    });
    expect(result.current.recordingState).toBe('idle');
    expect(result.current.transcriptionState).toBe('idle');
    expect(result.current.progress.state).toBe('idle');
    expect(result.current.transcript).toBeNull();
    expect(result.current.error).toBeNull();

    // Wait for useEffect to refresh model state
    await waitFor(() => {
      expect(mockModelManager.getState).toHaveBeenCalled();
    });
  });

  describe('Model Management', () => {
    it('should download model successfully', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.downloadModel.mockImplementation(async (size: string, onProgress: any) => {
        onProgress({ percentage: 50 });
        return 'path/to/model';
      });

      mockModelManager.getState.mockResolvedValue({
        isDownloaded: true,
        isLoaded: false,
        isDownloading: false,
      });

      await act(async () => {
        await result.current.downloadModel('tiny');
      });

      expect(mockModelManager.downloadModel).toHaveBeenCalledWith('tiny', expect.any(Function));
      expect(result.current.modelState.isDownloaded).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should handle download error', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      const error = new Error('Download failed');
      mockModelManager.downloadModel.mockRejectedValue(error);

      await act(async () => {
        await result.current.downloadModel('tiny');
      });

      expect(result.current.error).toBeInstanceOf(TranscriptionError);
      expect(result.current.error?.code).toBe('DOWNLOAD_FAILED');
      expect(result.current.modelState.isDownloading).toBe(false);
    });

    it('should cancel download', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      
      act(() => {
        result.current.cancelDownload();
      });

      expect(mockModelManager.cancelDownload).toHaveBeenCalled();
      expect(result.current.modelState.isDownloading).toBe(false);
    });

    it('should delete model', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      await act(async () => {
        await result.current.deleteModel('tiny');
      });

      expect(mockModelManager.deleteModel).toHaveBeenCalledWith('tiny');
      expect(mockModelManager.getState).toHaveBeenCalled(); 
    });

    it('should load model successfully', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getState.mockResolvedValue({
        isDownloaded: true,
        isLoaded: true,
        isDownloading: false,
      });

      await act(async () => {
        await result.current.loadModel('tiny');
      });

      expect(mockModelManager.loadModel).toHaveBeenCalledWith('tiny');
      expect(result.current.transcriptionState).toBe('idle');
    });

    it('should handle load model error', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.loadModel.mockRejectedValue(new Error('Load failed'));

      await act(async () => {
        await result.current.loadModel('tiny');
      });

      expect(result.current.error?.code).toBe('MODEL_LOAD_FAILED');
      expect(result.current.transcriptionState).toBe('error');
    });

    it('should unload model', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      await act(async () => {
        await result.current.unloadModel();
      });

      expect(mockModelManager.unloadModel).toHaveBeenCalled();
    });
  });

  describe('Real-time Mode', () => {
    it('should start real-time session', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getActiveModelSize.mockReturnValue('tiny');

      await act(async () => {
        await result.current.startRealtimeSession('Test Lecture');
      });

      expect(mockAudioRecorder.startRecording).toHaveBeenCalled();
      expect(RealtimeTranscriptionController).toHaveBeenCalled();
      expect(mockRealtimeController.start).toHaveBeenCalled();
      expect(result.current.recordingState).toBe('recording');
      expect(result.current.transcriptionState).toBe('transcribing');
    });

    it('should load model if not loaded when starting session', async () => {
        const { result } = renderHook(() => useLectureTranscription());
        await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());
  
        mockModelManager.getActiveModelSize.mockReturnValue(null);
  
        await act(async () => {
          await result.current.startRealtimeSession('Test Lecture');
        });
  
        expect(mockModelManager.loadModel).toHaveBeenCalled();
    });

    it('should handle start session error', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockAudioRecorder.startRecording.mockRejectedValue(new Error('Mic failed'));

      await act(async () => {
        await result.current.startRealtimeSession();
      });

      expect(result.current.error?.code).toBe('UNKNOWN');
      expect(result.current.transcriptionState).toBe('error');
      expect(result.current.recordingState).toBe('error');
    });

    it('should stop real-time session and return transcript', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      // Start session first to set refs
      mockModelManager.getActiveModelSize.mockReturnValue('tiny');
      await act(async () => {
        await result.current.startRealtimeSession('Test Lecture');
      });

      const mockTranscript = { text: 'Final transcript', segments: [] };
      mockTranscriptMerger.merge.mockReturnValue(mockTranscript);

      let finalTranscript;
      await act(async () => {
        finalTranscript = await result.current.stopRealtimeSession();
      });

      expect(mockRealtimeController.stop).toHaveBeenCalled();
      expect(mockAudioRecorder.stopRecording).toHaveBeenCalled();
      expect(mockTranscriptMerger.merge).toHaveBeenCalled();
      expect(result.current.transcript).toEqual(mockTranscript);
      expect(result.current.transcriptionState).toBe('completed');
      expect(finalTranscript).toEqual(mockTranscript);
    });
  });

  describe('Batch Mode', () => {
    it('should transcribe file successfully', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getActiveModelSize.mockReturnValue('tiny');
      const mockTranscript = { text: 'Batch transcript', segments: [] };
      mockTranscriptMerger.merge.mockReturnValue(mockTranscript);

      let finalTranscript;
      await act(async () => {
        finalTranscript = await result.current.transcribeFile('file:///audio.wav', 'Batch Lecture');
      });

      expect(BatchTranscriber).toHaveBeenCalled();
      expect(mockBatchTranscriber.transcribe).toHaveBeenCalledWith('file:///audio.wav', expect.any(Function));
      expect(result.current.transcript).toEqual(mockTranscript);
      expect(result.current.transcriptionState).toBe('completed');
      expect(finalTranscript).toEqual(mockTranscript);
    });

    it('should handle batch transcription error', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getActiveModelSize.mockReturnValue('tiny');
      mockBatchTranscriber.transcribe.mockRejectedValue(new Error('Batch failed'));

      await act(async () => {
        await expect(result.current.transcribeFile('file:///audio.wav')).rejects.toThrow();
      });

      expect(result.current.error?.code).toBe('UNKNOWN');
      expect(result.current.transcriptionState).toBe('error');
    });

    it('should cancel batch transcription', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getActiveModelSize.mockReturnValue('tiny');
      
      // Use a deferred promise to keep the transcription active
      let resolveTranscribe: any;
      const transcribePromise = new Promise((resolve) => {
        resolveTranscribe = resolve;
      });
      mockBatchTranscriber.transcribe.mockReturnValue(transcribePromise);

      act(() => {
        result.current.transcribeFile('file:///audio.wav');
      });

      // Wait for the state to transition to transcribing, which means batchRef.current is set
      await waitFor(() => expect(result.current.transcriptionState).toBe('transcribing'));

      act(() => {
        result.current.cancelBatchTranscription();
      });

      expect(mockBatchTranscriber.cancel).toHaveBeenCalled();
      expect(result.current.transcriptionState).toBe('idle');

      // Cleanup the pending promise
      resolveTranscribe({
        segments: [],
        vadSkippedSeconds: 0,
        processingTimeSeconds: 0,
      });
    });
  });

  describe('Shared Controls', () => {
    it('should pause transcription', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getActiveModelSize.mockReturnValue('tiny');

      // Setup both realtime and batch to be active
      let resolveRealtime: any;
      const realtimePromise = new Promise((resolve) => {
        resolveRealtime = resolve;
      });
      mockRealtimeController.start.mockReturnValue(realtimePromise);

      act(() => {
        result.current.startRealtimeSession();
      });

      resolveRealtime();

      await waitFor(() => expect(result.current.transcriptionState).toBe('transcribing'));

      // Also setup batch
      let resolveBatch: any;
      const batchPromise = new Promise((resolve) => {
        resolveBatch = resolve;
      });
      mockBatchTranscriber.transcribe.mockReturnValue(batchPromise);

      act(() => {
        result.current.transcribeFile('file:///audio.wav');
      });
      
      await waitFor(() => expect(BatchTranscriber).toHaveBeenCalled());

      act(() => {
        result.current.pauseTranscription();
      });

      expect(mockRealtimeController.pause).toHaveBeenCalled();
      expect(mockBatchTranscriber.pause).toHaveBeenCalled();
      expect(result.current.transcriptionState).toBe('paused');

      resolveRealtime();
      resolveBatch({
        segments: [],
        vadSkippedSeconds: 0,
        processingTimeSeconds: 0,
      });
    });

    it('should resume transcription', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      mockModelManager.getActiveModelSize.mockReturnValue('tiny');

      // Start a session to set the ref
      act(() => {
        result.current.startRealtimeSession();
      });
      await waitFor(() => expect(result.current.transcriptionState).toBe('transcribing'));

      act(() => {
        result.current.resumeTranscription();
      });

      expect(mockRealtimeController.resume).toHaveBeenCalled();
      expect(result.current.transcriptionState).toBe('transcribing');
    });

    it('should reset state', async () => {
      const { result } = renderHook(() => useLectureTranscription());
      await waitFor(() => expect(mockModelManager.getState).toHaveBeenCalled());

      // Set refs
      await act(async () => {
        mockModelManager.getActiveModelSize.mockReturnValue('tiny');
        await result.current.startRealtimeSession();
      });

      act(() => {
        result.current.reset();
      });

      expect(mockRealtimeController.destroy).toHaveBeenCalled();
      expect(result.current.recordingState).toBe('idle');
      expect(result.current.transcriptionState).toBe('idle');
      expect(result.current.transcript).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() => useLectureTranscription());
    
    unmount();
    expect(mockAudioRecorder.destroy).toHaveBeenCalled();
  });
});

