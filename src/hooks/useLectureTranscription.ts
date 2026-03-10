/**
 * useLectureTranscription — React Hook
 *
 * Clean API for the UI layer to interact with the offline transcription engine.
 * Manages the full lifecycle: model loading → recording → transcription → output.
 *
 * Usage:
 *   const {
 *     modelState, recordingState, transcriptionState, progress, transcript, error,
 *     downloadModel, loadModel, startRealtimeSession, stopRealtimeSession,
 *     transcribeFile, cancelBatchTranscription, reset,
 *   } = useLectureTranscription();
 *
 * IMPORTANT: The WhisperContext is stored in a useRef (not useState) to prevent
 * the known Android issue where context is lost on re-renders.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ModelState,
  RecordingState,
  TranscriptionState,
  TranscriptionProgress,
  LectureTranscript,
  TranscriptSegment,
  TranscriptionError,
  WhisperModelSize,
  UseLectureTranscriptionReturn,
  DEFAULT_REALTIME_CONFIG,
  DEFAULT_BATCH_CONFIG,
  RealtimeTranscriptionConfig,
  BatchTranscriptionConfig,
} from '../services/offlineTranscription/types';
import {
  WhisperModelManager,
  getWhisperModelManager,
  MODEL_REGISTRY,
} from '../services/offlineTranscription/whisperModelManager';
import {
  AudioRecorder,
  getAudioRecorder,
} from '../services/offlineTranscription/audioRecorder';
import { RealtimeTranscriptionController } from '../services/offlineTranscription/realtimeTranscriber';
import { BatchTranscriber } from '../services/offlineTranscription/batchTranscriber';
import { TranscriptMerger } from '../services/offlineTranscription/transcriptMerger';

// ─── Default Progress ────────────────────────────────────────────────────────

const INITIAL_PROGRESS: TranscriptionProgress = {
  state: 'idle',
  percentage: 0,
  partialTranscript: '',
  segments: [],
  elapsedSeconds: 0,
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useLectureTranscription(
  realtimeConfig?: Partial<RealtimeTranscriptionConfig>,
  batchConfig?: Partial<BatchTranscriptionConfig>,
): UseLectureTranscriptionReturn {
  // ── State ────────────────────────────────────────────────────────────────
  const [modelState, setModelState] = useState<ModelState>({
    isDownloaded: false,
    isLoaded: false,
    isDownloading: false,
  });
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [transcriptionState, setTranscriptionState] =
    useState<TranscriptionState>('idle');
  const [progress, setProgress] =
    useState<TranscriptionProgress>(INITIAL_PROGRESS);
  const [transcript, setTranscript] = useState<LectureTranscript | null>(null);
  const [error, setError] = useState<TranscriptionError | null>(null);

  // ── Refs (CRITICAL: use refs for native contexts, not state) ─────────────
  const modelManagerRef = useRef<WhisperModelManager>(getWhisperModelManager());
  const recorderRef = useRef<AudioRecorder>(getAudioRecorder());
  const realtimeRef = useRef<RealtimeTranscriptionController | null>(null);
  const batchRef = useRef<BatchTranscriber | null>(null);
  const mergerRef = useRef<TranscriptMerger>(new TranscriptMerger());

  // Session metadata
  const sessionStartRef = useRef<number>(0);
  const sessionTitleRef = useRef<string>('');
  const wavPathRef = useRef<string>('');

  // ── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      realtimeRef.current?.destroy();
      recorderRef.current?.destroy();
      // Don't destroy model manager — it's a singleton shared across screens
    };
  }, []);

  // ── Throttled progress updater (max 3 updates/sec for UI performance) ────
  const lastProgressUpdateRef = useRef<number>(0);
  const throttledSetProgress = useCallback(
    (newProgress: TranscriptionProgress) => {
      const now = Date.now();
      if (now - lastProgressUpdateRef.current < 333) return; // 3 Hz max
      lastProgressUpdateRef.current = now;
      setProgress(newProgress);
    },
    [],
  );

  // ── Refresh model state from the manager ─────────────────────────────────
  const refreshModelState = useCallback(async () => {
    const state = await modelManagerRef.current.getState();
    setModelState(state);
  }, []);

  // Initialize model state on mount
  useEffect(() => {
    refreshModelState();
  }, [refreshModelState]);

  // ── Model Management ─────────────────────────────────────────────────────

  const downloadModel = useCallback(
    async (size: WhisperModelSize) => {
      setError(null);
      try {
        setModelState((prev) => ({ ...prev, isDownloading: true }));
        await modelManagerRef.current.downloadModel(size, (downloadProgress) => {
          setModelState((prev) => ({
            ...prev,
            isDownloading: true,
            downloadProgress,
          }));
        });
        await refreshModelState();
      } catch (err) {
        const txError =
          err instanceof TranscriptionError
            ? err
            : new TranscriptionError(
                'DOWNLOAD_FAILED',
                String(err),
                'Model download failed.',
              );
        setError(txError);
        setModelState((prev) => ({
          ...prev,
          isDownloading: false,
          error: txError.userMessage,
        }));
      }
    },
    [refreshModelState],
  );

  const cancelDownload = useCallback(() => {
    modelManagerRef.current.cancelDownload();
    setModelState((prev) => ({
      ...prev,
      isDownloading: false,
      downloadProgress: undefined,
    }));
  }, []);

  const deleteModel = useCallback(
    async (size: WhisperModelSize) => {
      await modelManagerRef.current.deleteModel(size);
      await refreshModelState();
    },
    [refreshModelState],
  );

  const loadModel = useCallback(
    async (size?: WhisperModelSize) => {
      setError(null);
      setTranscriptionState('loading_model');
      try {
        await modelManagerRef.current.loadModel(size);
        await refreshModelState();
        setTranscriptionState('idle');
      } catch (err) {
        const txError =
          err instanceof TranscriptionError
            ? err
            : new TranscriptionError(
                'MODEL_LOAD_FAILED',
                String(err),
                'Failed to load the speech recognition model.',
              );
        setError(txError);
        setTranscriptionState('error');
      }
    },
    [refreshModelState],
  );

  const unloadModel = useCallback(async () => {
    await modelManagerRef.current.unloadModel();
    await refreshModelState();
  }, [refreshModelState]);

  // ── Real-Time Mode ───────────────────────────────────────────────────────

  const startRealtimeSession = useCallback(
    async (title?: string) => {
      setError(null);
      setTranscript(null);
      setProgress(INITIAL_PROGRESS);

      sessionTitleRef.current = title ?? `Lecture ${new Date().toLocaleDateString()}`;
      sessionStartRef.current = Date.now();

      try {
        // Ensure model is loaded
        if (!modelManagerRef.current.getActiveModelSize()) {
          setTranscriptionState('loading_model');
          await modelManagerRef.current.loadModel();
          await refreshModelState();
        }

        // Start recording
        setTranscriptionState('initializing');
        const wavPath = await recorderRef.current.startRecording();
        wavPathRef.current = wavPath;
        setRecordingState('recording');

        // Start real-time transcription
        const controller = new RealtimeTranscriptionController(
          modelManagerRef.current,
          realtimeConfig,
        );
        realtimeRef.current = controller;

        await controller.start((realtimeProgress) => {
          throttledSetProgress(realtimeProgress);
        });

        setTranscriptionState('transcribing');
      } catch (err) {
        const txError =
          err instanceof TranscriptionError
            ? err
            : new TranscriptionError(
                'UNKNOWN',
                String(err),
                'Failed to start recording.',
              );
        setError(txError);
        setTranscriptionState('error');
        setRecordingState('error');
      }
    },
    [realtimeConfig, throttledSetProgress, refreshModelState],
  );

  const stopRealtimeSession = useCallback(async (): Promise<LectureTranscript> => {
    setTranscriptionState('merging');

    try {
      // Stop transcription
      const segments = realtimeRef.current
        ? await realtimeRef.current.stop()
        : [];
      const vadSkipped = realtimeRef.current?.getVadSkippedSeconds() ?? 0;

      // Stop recording
      await recorderRef.current.stopRecording();
      setRecordingState('idle');

      // Merge into final transcript
      const durationSeconds = (Date.now() - sessionStartRef.current) / 1000;
      const processingTimeSeconds = durationSeconds; // Real-time: processing ≈ duration
      const modelSize = modelManagerRef.current.getActiveModelSize() ?? 'small';

      const result = mergerRef.current.merge(
        segments,
        sessionTitleRef.current,
        new Date(sessionStartRef.current).toISOString(),
        durationSeconds,
        `ggml-${modelSize}.en`,
        {
          processingTimeSeconds,
          vadSkippedSeconds: vadSkipped,
          realtimeFactor: processingTimeSeconds / Math.max(durationSeconds, 1),
        },
      );

      setTranscript(result);
      setTranscriptionState('completed');
      setProgress((prev) => ({
        ...prev,
        state: 'completed',
        percentage: 100,
        partialTranscript: result.text,
        segments: result.segments,
      }));

      // Cleanup
      realtimeRef.current = null;

      return result;
    } catch (err) {
      const txError =
        err instanceof TranscriptionError
          ? err
          : new TranscriptionError(
              'UNKNOWN',
              String(err),
              'Failed to stop and merge transcription.',
            );
      setError(txError);
      setTranscriptionState('error');
      throw txError;
    }
  }, []);

  // ── Batch Mode ───────────────────────────────────────────────────────────

  const transcribeFile = useCallback(
    async (
      audioFilePath: string,
      title?: string,
    ): Promise<LectureTranscript> => {
      setError(null);
      setTranscript(null);
      setProgress(INITIAL_PROGRESS);

      sessionTitleRef.current = title ?? `Lecture ${new Date().toLocaleDateString()}`;
      sessionStartRef.current = Date.now();

      try {
        // Ensure model is loaded
        if (!modelManagerRef.current.getActiveModelSize()) {
          setTranscriptionState('loading_model');
          await modelManagerRef.current.loadModel();
          await refreshModelState();
        }

        // Create batch transcriber
        const batch = new BatchTranscriber(
          modelManagerRef.current,
          batchConfig,
        );
        batchRef.current = batch;

        setTranscriptionState('transcribing');

        const {
          segments,
          vadSkippedSeconds,
          processingTimeSeconds,
        } = await batch.transcribe(audioFilePath, (batchProgress) => {
          throttledSetProgress(batchProgress);
          setTranscriptionState(
            batchProgress.state === 'completed' ? 'merging' : 'transcribing',
          );
        });

        // Merge
        setTranscriptionState('merging');

        // Estimate audio duration from segments
        const lastSegment = segments[segments.length - 1];
        const durationSeconds = lastSegment?.end ?? 0;
        const modelSize = modelManagerRef.current.getActiveModelSize() ?? 'small';

        const result = mergerRef.current.merge(
          segments,
          sessionTitleRef.current,
          new Date(sessionStartRef.current).toISOString(),
          durationSeconds,
          `ggml-${modelSize}.en`,
          {
            processingTimeSeconds,
            vadSkippedSeconds,
            realtimeFactor:
              processingTimeSeconds / Math.max(durationSeconds, 1),
            chunksProcessed: segments.length,
          },
        );

        setTranscript(result);
        setTranscriptionState('completed');
        setProgress((prev) => ({
          ...prev,
          state: 'completed',
          percentage: 100,
          partialTranscript: result.text,
          segments: result.segments,
        }));

        batchRef.current = null;
        return result;
      } catch (err) {
        const txError =
          err instanceof TranscriptionError
            ? err
            : new TranscriptionError(
                'UNKNOWN',
                String(err),
                'Batch transcription failed.',
              );
        setError(txError);
        setTranscriptionState('error');
        throw txError;
      }
    },
    [batchConfig, throttledSetProgress, refreshModelState],
  );

  const cancelBatchTranscription = useCallback(() => {
    batchRef.current?.cancel();
    setTranscriptionState('idle');
  }, []);

  // ── Shared Controls ──────────────────────────────────────────────────────

  const pauseTranscription = useCallback(() => {
    realtimeRef.current?.pause();
    batchRef.current?.pause();
    setTranscriptionState('paused');
  }, []);

  const resumeTranscription = useCallback(() => {
    realtimeRef.current?.resume();
    batchRef.current?.resume();
    setTranscriptionState('transcribing');
  }, []);

  const reset = useCallback(() => {
    realtimeRef.current?.destroy();
    realtimeRef.current = null;
    batchRef.current = null;

    setRecordingState('idle');
    setTranscriptionState('idle');
    setProgress(INITIAL_PROGRESS);
    setTranscript(null);
    setError(null);
  }, []);

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    // State
    modelState,
    recordingState,
    transcriptionState,
    progress,
    transcript,
    error,

    // Model Management
    downloadModel,
    cancelDownload,
    deleteModel,
    loadModel,
    unloadModel,

    // Real-time Mode
    startRealtimeSession,
    stopRealtimeSession,

    // Batch Mode
    transcribeFile,
    cancelBatchTranscription,

    // Shared
    pauseTranscription,
    resumeTranscription,
    reset,
  };
}
