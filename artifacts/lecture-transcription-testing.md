# Lecture Transcription Flow — Testing Notes (2026-03-09)

## Full Flow Tested
YouTube launch → background recording → return to Guru → local Whisper transcription → LectureReturnSheet display

## What Works
- **ExternalToolsRow** — YouTube icon correctly shows "Open", tap launches YouTube via native `AppLauncherModule`
- **RecordingService** — Starts mic recording in background, produces `.m4a` files in `context.filesDir`
- **AppState return detection** — HomeScreen detects foreground return, calls `checkForReturnedSession()`, stops recording + overlay, shows LectureReturnSheet
- **Local Whisper (whisper.rn)** — Successfully loads `ggml-tiny.en.bin` (77MB), initializes on CPU, transcribes audio in ~10s
- **LectureReturnSheet** — Displays results correctly: subject chip, summary, confidence badge, action buttons

## Issues Found & Fixed

### 1. Whisper noise tokens not filtered (FIXED)
**File:** `src/services/transcriptionService.ts:223-237`
**Problem:** Whisper returns noise artifacts like `(buzzing)`, `[static]`, `[BLANK_AUDIO]` for silent/noisy audio. These are non-empty strings that passed the `if (!transcript)` check, causing the code to proceed to Llama topic extraction unnecessarily.
**Fix:** Added `NOISE_PATTERNS` regex to strip lines matching `(...)`, `[...]`, `*...*` patterns before the empty check.

### 2. Llama model fails to load on emulator (FIXED)
**File:** `src/services/aiService.ts:123`
**Problem:** `initLlama({ model: modelPath, n_context: 3072, use_mlock: true })` — `use_mlock: true` tries to lock 562MB in RAM. On emulator with 4GB total / ~2GB available, this can fail with "unable to load model".
**Fix:** Changed to `use_mlock: false` and `n_context: 2048` (sufficient for JSON extraction outputs from a 1B model).

### 3. LectureReturnSheet gate condition (FIXED in prior session)
**File:** `src/components/LectureReturnSheet.tsx:72`
**Problem:** The `useEffect` only ran transcription when `geminiKey` was present, blocking local-only users.
**Fix:** Changed gate to `(geminiKey || hasLocalWhisper)`.

### 4. localModelBootstrap refreshProfile (FIXED in prior session)
**File:** `src/services/localModelBootstrap.ts:68,84`
**Problem:** After downloading models, the Zustand store wasn't refreshed, so `profile.localWhisperPath` stayed null until app restart.
**Fix:** Added `useAppStore.getState().refreshProfile()` after each model download.

## Emulator-Specific Limitations
- **Audio I/O errors**: `pcm_readi failed with 'I/O error'` — emulator audio HAL can't capture real audio. Recording file is created but contains noise/silence only.
- **No GPU**: Whisper runs CPU-only (`no GPU found`), takes ~10s for short audio. Real device with GPU would be faster.
- **Memory**: 4GB total, ~2GB available. Llama 1B model (562MB) can fail with `use_mlock: true`. Real device with 6-8GB should handle it fine.

## Key File Paths on Device
```
/data/data/com.anonymous.gurustudy/files/
  ggml-tiny.en.bin                          — 77MB Whisper tiny.en model
  Llama-3.2-1B-Instruct-Q4_K_M.gguf        — 562MB Llama 3.2 1B Q4_K_M
  lecture_*.m4a                             — Recording files (cleaned up after transcription)
  SQLite/guru.db                            — Main database
```

## DB Profile Fields for Local AI
```sql
-- user_profile (id=1)
useLocalWhisper  = 1          -- enable local Whisper
localWhisperPath = file:///data/user/0/.../ggml-tiny.en.bin
useLocalModel    = 1          -- enable local LLM
localModelPath   = file:///data/user/0/.../Llama-3.2-1B-Instruct-Q4_K_M.gguf
```

## Flow Sequence (code path)
1. `ExternalToolsRow` → tap YouTube → `launchMedicalApp('youtube')` in `appLauncher.ts`
2. `appLauncher` → `startRecording('com.google.android.youtube')` → `launchApp(pkg)` → `showOverlay('YouTube')` → `startExternalAppSession()` (DB log)
3. User watches lecture, RecordingService captures audio
4. User returns → HomeScreen `AppState` listener → `checkForReturnedSession()`
5. `checkForReturnedSession` → `stopRecording()` (returns .m4a path) → `hideOverlay()` → shows `LectureReturnSheet`
6. `LectureReturnSheet` `useEffect` → `runTranscription()`
7. `runTranscription` → `transcribeWithLocalWhisper(recordingPath, whisperPath)`
8. Whisper loads model → transcribes → noise filter → if no speech: return "No speech detected"
9. If speech found: `generateJSONWithRouting()` → Llama extracts topics → `markTopicsFromLecture()` → UI shows results
