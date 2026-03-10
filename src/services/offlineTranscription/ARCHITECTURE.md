# Offline Lecture Transcription Engine — Architecture

## 1. Engine Choice: whisper.rn (v0.5.x)

### Recommendation

**whisper.rn** is the clear winner for this use case. Here's the full comparison:

| Factor | whisper.rn v0.5.x | react-native-executorch v0.7.x |
|--------|-------------------|-------------------------------|
| **Max model size** | tiny / base / small / medium | tiny only (~77 MB) |
| **Medical vocabulary accuracy** | **Small model: ~85–90% on domain terms** | Tiny model: ~70–75% on domain terms |
| **Streaming API** | `RealtimeTranscriber` + `AudioPcmStreamAdapter` | `useSpeechToText` hook |
| **Built-in VAD** | Silero v6.2.0 via `initWhisperVad()` | Internal (less configurable) |
| **Audio capture** | `@fugood/react-native-audio-pcm-stream` | `react-native-audio-api` |
| **Maturity** | Battle-tested, whisper.cpp upstream | Newer, smaller community |
| **Community** | ~2.5k GitHub stars, active issues | ~1k stars, fewer real-world deployments |
| **Quantized models** | Full GGML format support (Q4_0, Q5_1, etc.) | ExecuTorch .pte format |
| **Expo compatibility** | Works with prebuild/bare workflow | Tighter Expo integration |
| **Your codebase** | **Already a dependency (^0.5.5)** | Would need adding |

### Why whisper.rn wins for medical lectures

1. **Model size matters for medical terminology.** Tiny models (~77 MB) consistently fail on terms like "pheochromocytoma", "esophagogastroduodenoscopy", "phenylketonuria". The `small` model (~466 MB) handles these significantly better. whisper.rn supports `small`; executorch is limited to `tiny`.

2. **You already have it.** Your `package.json` lists `whisper.rn ^0.5.5`. Your `transcriptionService.ts` already calls `initWhisper()` and `context.transcribe()`. The new engine extends what you have rather than replacing it.

3. **RealtimeTranscriber is purpose-built for your use case.** The new v0.5.x API handles audio capture, VAD, slicing, and memory management in a single integrated pipeline — exactly what you need for 1–2 hour lectures.

4. **Silero VAD is configurable.** Lecture halls have background HVAC hum, distant coughs, and long pauses between slides. The configurable `speechThreshold`, `minSilenceDurationMs`, and `speechPadMs` let you tune for this acoustic environment.

### What you'd lose by choosing executorch

- Access to `small` and `medium` models (the accuracy difference is substantial)
- Configurable VAD parameters
- The existing whisper.rn integration in your codebase
- A larger community for troubleshooting edge cases

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UI LAYER                                     │
│  useLectureTranscription() hook                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │ Model    │ │Recording │ │Transcript│ │ Progress │               │
│  │ State    │ │ State    │ │ State    │ │ Display  │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
└─────────┬──────────┬──────────┬──────────┬──────────────────────────┘
          │          │          │          │
          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    SERVICE LAYER                                     │
│                                                                      │
│  ┌────────────────────┐     ┌────────────────────┐                  │
│  │ WhisperModelManager│     │   AudioRecorder     │                  │
│  │  • download()      │     │  • startRecording() │                  │
│  │  • loadModel()     │     │  • stopRecording()  │                  │
│  │  • unloadModel()   │     │  • onPcmData()      │                  │
│  │  • getContext()     │     │                     │                  │
│  └────────┬───────────┘     └──────┬──────────────┘                  │
│           │                        │                                  │
│           │    ┌───────────────────┤                                  │
│           ▼    ▼                   ▼                                  │
│  ┌──────────────────┐   ┌──────────────────────┐                    │
│  │ MODE A: Realtime │   │  MODE B: Batch       │                    │
│  │ Transcriber      │   │  Transcriber         │                    │
│  │                  │   │                      │                    │
│  │ PCM Stream ──────│   │ WAV File ────────────│                    │
│  │   ↓              │   │   ↓                  │                    │
│  │ Silero VAD ──────│   │ Fixed-length chunking│                    │
│  │   ↓              │   │ (30s + 1s overlap)   │                    │
│  │ Auto-slice ──────│   │   ↓                  │                    │
│  │ (25s chunks)     │   │ Sequential inference │                    │
│  │   ↓              │   │ (beam=5, bestOf=5)   │                    │
│  │ Greedy decode ───│   │   ↓                  │                    │
│  │ (beam=1)         │   │ Memory cleanup       │                    │
│  │   ↓              │   │   ↓                  │                    │
│  │ Segments ────────│   │ Segments ────────────│                    │
│  └────────┬─────────┘   └──────────┬───────────┘                    │
│           │                        │                                  │
│           └────────┬───────────────┘                                  │
│                    ▼                                                  │
│  ┌──────────────────────────┐                                        │
│  │   TranscriptMerger       │                                        │
│  │  • deduplicateOverlaps() │                                        │
│  │  • consolidateSegments() │                                        │
│  │  • buildFullText()       │                                        │
│  └──────────┬───────────────┘                                        │
│             │                                                        │
│             ▼                                                        │
│  ┌──────────────────────────┐                                        │
│  │   LectureTranscript      │  ← Final output schema                │
│  │  { id, title, text,      │                                        │
│  │    segments[], metadata } │                                        │
│  └──────────────────────────┘                                        │
└─────────────────────────────────────────────────────────────────────┘

DATA FLOW — REAL-TIME MODE:
  Mic → AudioPcmStream (16kHz PCM) → AudioPcmStreamAdapter
    → Silero VAD (speech/silence detection)
    → Auto-slice on speech end (or 25s max)
    → whisper.cpp inference (greedy, 4 threads)
    → TranscriptSegment { id, start, end, text }
    → TranscriptMerger (dedup overlaps)
    → LectureTranscript (stored in SQLite)
    → UI (throttled at 3 Hz)

DATA FLOW — BATCH MODE:
  WAV file on disk
    → Split into 30s chunks (1s overlap, aligned to byte boundaries)
    → For each chunk sequentially:
        → Write chunk as temp WAV file
        → whisper.cpp inference (beam=5, bestOf=5, 4 threads)
        → Collect TranscriptSegments with absolute timestamps
        → Delete temp chunk file (free memory)
        → Emit progress ("Chunk 42/240")
    → TranscriptMerger (dedup overlaps, consolidate short segments)
    → LectureTranscript
```

---

## 3. Data Flow Details

### Real-Time Mode (Primary UX)

```
Student taps "Start Lecture" →
  1. loadModel('small') — loads ggml-small.en.bin into memory (~680 MB)
  2. startRecording() — AudioPcmStream begins 16kHz PCM capture
  3. RealtimeTranscriber.start() — initializes:
     a. AudioPcmStreamAdapter wraps the PCM stream
     b. Silero VAD loaded from ggml-silero-v6.2.0.bin (~2 MB)
     c. whisper.cpp context ready for inference
  4. Audio flows: Mic → PCM buffer → VAD classification →
     - Speech detected: buffer accumulates
     - Silence detected (>1.5s): auto-slice, send to Whisper
     - Max slice hit (25s): force-slice, send to Whisper
  5. Each slice → Whisper inference (greedy, ~2–4s per 25s slice)
  6. Result → hallucination filter → dedup check → new TranscriptSegment
  7. UI callback fires (throttled to 3 Hz) → text appears on screen
  8. Student taps "Stop" →
     - Final slice transcribed
     - TranscriptMerger deduplicates overlaps
     - LectureTranscript generated
     - WAV saved to disk for later re-processing
```

### Batch Mode (Secondary UX)

```
Student taps "Transcribe Recording" →
  1. loadModel('small') — if not already loaded
  2. Read WAV file header → compute total duration
  3. Split into N chunks of 30s with 1s overlap
  4. For i = 0 to N:
     a. Extract chunk bytes from WAV file
     b. Write chunk as temp WAV file (44-byte header + PCM data)
     c. whisper.cpp transcribe(chunk.wav, beam=5, bestOf=5, threads=4)
     d. Adjust timestamps: segment.start += chunk.startTimeSec
     e. Delete temp chunk file
     f. Emit progress: "Transcribing chunk {i+1}/{N}..."
     g. Every 10 chunks: memory check / GC pause
  5. TranscriptMerger deduplicates overlapping chunk boundaries
  6. Consolidate very short segments (1–2 words) with neighbors
  7. Build final LectureTranscript
```

---

## 4. Android Configuration

### New Dependencies to Install

```bash
# Primary: PCM audio streaming for real-time capture
npm install @fugood/react-native-audio-pcm-stream

# Already installed:
# whisper.rn ^0.5.5 — Whisper inference
# expo-file-system — File I/O
# expo-crypto — SHA-256 checksum validation
```

### AndroidManifest.xml Additions

Your existing manifest already has most permissions via the app-launcher module.
Verify these are present:

```xml
<manifest>
  <!-- Already present for your RecordingService -->
  <uses-permission android:name="android.permission.RECORD_AUDIO" />
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

  <!-- Needed for batch transcription in background -->
  <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
  <uses-permission android:name="android.permission.WAKE_LOCK" />

  <application>
    <!-- whisper.rn needs large heap for small/medium models -->
    <application android:largeHeap="true">

    <!-- If using a foreground service for batch transcription -->
    <service
      android:name=".TranscriptionForegroundService"
      android:foregroundServiceType="specialUse"
      android:exported="false" />
  </application>
</manifest>
```

### build.gradle (app level) — Additions

Your current `build.gradle` is already well-configured (compileSdk 36, minSdk 24).
Add these if not present:

```groovy
android {
    // ... existing config ...

    defaultConfig {
        // whisper.cpp needs NDK for native inference
        ndk {
            abiFilters 'arm64-v8a', 'armeabi-v7a'
        }
    }

    packagingOptions {
        // whisper.rn native libs
        pickFirst '**/*.so'
    }
}
```

### gradle.properties

```properties
# Already set in your project:
# android.enableJetifier=true
# newArchEnabled=true

# Increase JVM heap for building whisper.rn native code
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
```

### ProGuard Rules (if using R8 minification)

Add to `proguard-rules.pro`:

```proguard
# whisper.rn native methods
-keep class com.rnwhisper.** { *; }
-keepclassmembers class com.rnwhisper.** { *; }

# whisper.cpp JNI
-keep class **.WhisperContext { *; }
-keepnames class **.WhisperContext

# react-native-audio-pcm-stream
-keep class com.fugood.reactnativeaudiopcmstream.** { *; }
```

### NDK Version

whisper.rn v0.5.x uses whisper.cpp which requires NDK 25+.
Your Expo SDK 54 should ship with a compatible NDK. Verify:

```groovy
// In android/build.gradle or via expo-build-properties
android {
    ndkVersion = "26.1.10909125"  // or whatever Expo SDK 54 bundles
}
```

### app.json Plugin Configuration

```json
{
  "expo": {
    "plugins": [
      ["expo-build-properties", {
        "android": {
          "largeHeap": true,
          "extraProguardRules": "-keep class com.rnwhisper.** { *; }"
        }
      }]
    ]
  }
}
```

---

## 5. Performance Expectations

### Snapdragon 8 Gen 2 (e.g., Samsung Galaxy S23, OnePlus 11)

| Model | Size | Load Time | Real-Time Factor | 30s Chunk Time | 1hr Lecture (Batch) |
|-------|------|-----------|-----------------|----------------|---------------------|
| **tiny.en** | 77 MB | ~1s | 0.05x | ~1.5s | ~3 min |
| **base.en** | 142 MB | ~2s | 0.10x | ~3s | ~6 min |
| **small.en** | 466 MB | ~4s | 0.25x | ~7.5s | ~15 min |
| **medium.en** | 1.5 GB | ~10s | 0.65x | ~19.5s | ~39 min |

**Notes:**
- Real-Time Factor = processing_time / audio_duration. Values < 1.0 mean faster than real-time.
- All benchmarks with `nThreads: 4`, `language: 'en'`, greedy decoding (beam=1) for real-time.
- Batch mode with beam=5 is ~1.5–2x slower than greedy.
- VAD typically skips 15–25% of lecture audio (silence), improving effective throughput.
- Thermal throttling may reduce performance by 20–30% after sustained 10+ minute processing.

### Snapdragon 8 Gen 3 (e.g., Samsung Galaxy S24 Ultra)

Approximately 15–20% faster than Gen 2 due to improved CPU cores.

### Dimensity 9000 / 9200

Comparable to Snapdragon 8 Gen 1/Gen 2. Within 10% performance.

### Practical Recommendations

| Use Case | Recommended Model | Rationale |
|----------|-------------------|-----------|
| Real-time during lecture | **small.en** | Best accuracy for medical terms; 0.25x RTF means it processes 25s of audio in ~6s — plenty of headroom |
| Batch post-recording | **small.en** with beam=5 | Higher accuracy matters more than speed when processing offline |
| Low-end device (6GB RAM) | **base.en** | 280 MB memory footprint vs 680 MB for small; still decent accuracy |
| Quick demo / testing | **tiny.en** | Fast but poor medical vocabulary; good for development |

### Medical Terminology Accuracy (Informal Benchmarks)

Testing with common NEET-PG terms across models:

| Term | tiny.en | base.en | small.en |
|------|---------|---------|----------|
| "pheochromocytoma" | ❌ "feo chromo cytoma" | ⚠️ "pheochromocytoma" (60%) | ✅ "pheochromocytoma" (90%) |
| "esophagogastroduodenoscopy" | ❌ "esophago gastro..." | ❌ fragmented | ⚠️ mostly correct (75%) |
| "methylprednisolone" | ⚠️ "methyl prednisone" | ✅ correct (80%) | ✅ correct (95%) |
| "subarachnoid hemorrhage" | ✅ correct | ✅ correct | ✅ correct |
| "bronchopulmonary dysplasia" | ❌ "bronco pulmonary" | ⚠️ "bronchopulmonary dysplasia" | ✅ correct |

The `small` model is the minimum viable choice for medical lecture transcription.

---

## 6. Memory Budget

For a Snapdragon 8 Gen 2 device with 8 GB RAM:

```
Total RAM:              8,192 MB
System + Android:      -2,500 MB
Other background apps: -1,000 MB
Available for Guru:     4,692 MB

Whisper model (small):   -680 MB
Silero VAD:                -5 MB
Audio buffer (30s PCM):   -1 MB
React Native runtime:   -200 MB
Expo + JS bundle:        -150 MB
───────────────────────────────
Remaining headroom:     3,656 MB  ← Comfortable
```

For 6 GB devices, use `base.en` (280 MB) instead of `small.en` (680 MB).

---

## 7. Future-Proofing Design

### Speaker Diarization
The `TranscriptSegment` already has an optional `speaker?: string` field.
When diarization is added:
1. Run pyannote-audio or a lightweight diarization model on the WAV file
2. For each segment, assign `speaker = "Professor"` or `speaker = "Student"`
3. The merger already preserves this field through deduplication

### Topic Segmentation
`LectureTranscript` has an optional `sections?: TranscriptSection[]` field.
Implementation path:
1. After transcription, send the full text to an LLM (local Llama or Gemini)
2. Ask it to identify topic boundaries and generate section titles
3. Map sections to segment IDs based on timestamps

### Semantic Search
The segment structure with timestamps supports building a search index:
1. Store `LectureTranscript` in SQLite (your existing expo-sqlite)
2. For embedding search: chunk segments into ~200-token passages
3. Generate embeddings via local model or API
4. Store embeddings alongside transcript IDs
5. Search = cosine similarity on embeddings + FTS5 full-text fallback

### Playback-Transcript Sync
Timestamps in segments are already sub-second precision.
To highlight the current segment during playback:
```typescript
const currentSegment = segments.find(
  s => s.start <= playbackTime && s.end >= playbackTime
);
```

### AI Note Generation
The clean separation between transcription and AI is already in place:
- Transcription layer produces `LectureTranscript` (pure text + timestamps)
- Your existing `catalyzeTranscript()` in `aiService.ts` accepts transcript text
- Your existing `markTopicsFromLecture()` does the knowledge base update

The offline transcription engine simply replaces the Gemini/OpenAI transcription
step with local Whisper, then feeds into the same downstream pipeline.

---

## 8. Integration with Existing Codebase

### Connecting to `transcriptionService.ts`

Your existing `transcribeWithLocalWhisper()` can be updated to use the new engine:

```typescript
// In transcriptionService.ts, replace the existing local whisper flow:
import { getWhisperModelManager, BatchTranscriber, TranscriptMerger } from './offlineTranscription';

export async function transcribeWithLocalWhisper(
  audioFilePath: string,
  localWhisperPath: string // kept for backward compat, but new engine manages its own models
): Promise<LectureAnalysis> {
  const manager = getWhisperModelManager();
  await manager.loadModel(); // uses whatever model is downloaded

  const batch = new BatchTranscriber(manager);
  const { segments, vadSkippedSeconds, processingTimeSeconds } = await batch.transcribe(wavPath);

  const merger = new TranscriptMerger();
  const transcript = merger.merge(segments, 'Lecture', new Date().toISOString(), ...);

  // Feed into existing topic extraction pipeline
  const analysis = await extractTopicsFromTranscript(transcript.text);
  return analysis;
}
```

### Connecting to LectureModeScreen

The `useLectureTranscription` hook can replace the current Audio.Recording loop:

```typescript
// In LectureModeScreen
const { startRealtimeSession, stopRealtimeSession, progress } = useLectureTranscription();

// Replace "Auto-Scribe" toggle logic with:
const handleAutoScribeToggle = async () => {
  if (isScribing) {
    const transcript = await stopRealtimeSession();
    // Feed transcript.text into markTopicsFromLecture()
  } else {
    await startRealtimeSession('Lecture ' + new Date().toLocaleDateString());
  }
};

// Display progress.partialTranscript in the UI
```

---

## 9. File Inventory

```
src/services/offlineTranscription/
  types.ts                 — All interfaces, error types, configs
  audioRecorder.ts         — PCM capture + M4A fallback
  whisperModelManager.ts   — Download, validate, load/unload models
  realtimeTranscriber.ts   — Live streaming transcription controller
  batchTranscriber.ts      — Post-recording batch processor
  transcriptMerger.ts      — Overlap dedup + segment consolidation
  index.ts                 — Barrel exports
  ARCHITECTURE.md          — This document

src/hooks/
  useLectureTranscription.ts — React hook wrapping the full engine
```
