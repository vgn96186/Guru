/**
 * Smoke test: barrel file re-exports resolve (improves coverage on export graph).
 */
import {
  TranscriptionError,
  DEFAULT_BATCH_CONFIG,
  WhisperModelManager,
  BatchTranscriber,
  TranscriptMerger,
  MODEL_REGISTRY,
} from './index';

describe('offlineTranscription index barrel', () => {
  it('exports transcription primitives', () => {
    expect(TranscriptionError).toBeDefined();
    expect(DEFAULT_BATCH_CONFIG).toBeDefined();
    expect(WhisperModelManager).toBeDefined();
    expect(BatchTranscriber).toBeDefined();
    expect(TranscriptMerger).toBeDefined();
    expect(MODEL_REGISTRY).toBeDefined();
  });
});
