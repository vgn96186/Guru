# TTS Engines (System + Edge + Piper) — Design

## Summary

Add tap-to-speak text-to-speech across GuruChat and Study Sessions with a single global “TTS Engine” setting and a routed backend that supports:

1. **System TTS** (Android/iOS) via `expo-speech`
2. **Edge TTS (Unofficial)** for high-quality neural voices when reachable (no API key)
3. **Piper (Local Offline)** as an optional premium offline engine

All call sites (Chat, Sessions) use a single `ttsService` API, with fast fallback to System TTS when Edge/Piper are unavailable or fail.

## Goals

- Tap-to-speak for:
  - GuruChat assistant messages
  - Study session content cards
- Global settings that control:
  - Engine selection: `system | edge | piper`
  - Rate + pitch
  - Voice selection per engine (where possible)
  - One-click “Test voice”
- Low perceived latency:
  - Speak first chunk quickly
  - Continue queued chunks
- Reliability:
  - Any failure auto-falls back to System TTS and never blocks UI

## Non-Goals

- Autoplay for new messages/cards (explicitly not desired)
- Perfect cross-device voice determinism across all Android OEMs
- Full “pause/resume” parity on Android when using `expo-speech` (not available on Android per Expo docs)

## References

- Expo Speech SDK: https://docs.expo.dev/versions/latest/sdk/speech/
- Piper upstream note (archive + new home pointer): https://github.com/rhasspy/piper
- Android Piper viability reference: https://github.com/nihui/ncnn-android-piper

## User Experience

### Chat

- Each assistant message shows a small speaker action.
- Tap:
  - Stops any current speech
  - Speaks the selected message text

### Study Sessions

- Each content card header (or action row) shows a speaker action.
- Tap:
  - Stops any current speech
  - Speaks the card’s “best TTS string” (derived from content + minimal formatting)

### Failure Behavior

- If selected engine fails:
  - Show a brief toast indicating fallback
  - Immediately retry with System TTS

## Architecture

### High-Level Flow

UI (tap) → `ttsService.speak(text, context)` → engine router reads profile setting → engine implementation:

- System: `expo-speech` speak queue
- Edge: fetch audio → save temp file → play via audio player
- Piper: local synth → play via audio player

### New Modules

- `src/services/tts/ttsService.ts` (public API + router)
- `src/services/tts/engines/systemTtsEngine.ts` (expo-speech wrapper)
- `src/services/tts/engines/edgeTtsEngine.ts` (unofficial Edge fetch + cache + playback)
- `src/services/tts/engines/piperTtsEngine.ts` (stub/adapter now; native later)
- `src/services/tts/textForTts.ts` (markdown stripping + chunking)

### Public API

- `speak(text: string, options?: { context?: 'chat' | 'session' | 'generic' }): Promise<void>`
- `stop(): Promise<void>`
- `isSpeaking(): Promise<boolean>`
- `getDebugState(): { engine: 'system' | 'edge' | 'piper'; lastError?: string }`

### Text Preparation

- Convert markdown-like text to a TTS-friendly string:
  - remove code fences, excessive symbols, inline links
  - collapse whitespace
- Chunking:
  - split on sentence boundaries
  - cap chunk length to avoid platform limits (use `Speech.maxSpeechInputLength` when System engine is active)
  - speak first chunk immediately, enqueue remaining chunks

## Settings & Persistence

### Profile Fields

Add to `UserProfile` and persist in `user_profile`:

- `ttsEngine?: 'system' | 'edge' | 'piper'`
- `ttsRate?: number` (default 1.0)
- `ttsPitch?: number` (default 1.0)
- `ttsSystemVoiceId?: string | null`
- `ttsEdgeVoiceName?: string | null`
- `ttsPiperVoiceId?: string | null`

### Settings UI

Add a Settings section under the existing Settings screen (recommended category: `ai`, near Local Inference):

- Engine dropdown:
  - System (Recommended)
  - Edge (Experimental)
  - Piper (Offline Premium)
- Rate slider
- Pitch slider
- Voice picker:
  - System: derived from `Speech.getAvailableVoicesAsync()`
  - Edge: a curated list of known voice names (avoid dynamic scraping)
  - Piper: list of installed local voices/models
- Test button: speaks a short sample string

## Engine Details

### 1) System Engine (expo-speech)

- Use:
  - `Speech.speak(text, { rate, pitch, voice, onStart, onDone, onStopped, onError })`
  - `Speech.stop()`
- Constraints:
  - Android does not support `pause()`/`resume()` for `expo-speech` (acceptable with tap-to-speak UX).

### 2) Edge Engine (Unofficial)

- Strategy:
  - Convert text → request remote TTS audio (mp3) using Edge read-aloud endpoints
  - Save audio to a temp file
  - Play via existing audio playback stack
- Reliability requirements:
  - short timeouts
  - fast failure → fallback to System
  - cache recent synthesis results to avoid repeated network fetches for the same text snippet
- Risk:
  - endpoints may change or rate-limit without notice; Settings must label “Experimental”.

### 3) Piper Engine (Local Offline)

- Phase 1:
  - Provide interface and “not available” behavior unless model assets exist
  - If unavailable, router falls back to System
- Phase 2:
  - Implement a native module to synthesize audio locally from Piper models
  - Provide “Manage voices/models” UX similar to local LLM/Whisper management

## Rollout Plan

- Phase A:
  - Router + System engine + Settings fields/UI + chat/session speak buttons
- Phase B:
  - Edge engine implementation + caching + robust fallback
- Phase C:
  - Piper native engine + model download/management

## Testing

- Unit tests:
  - router fallback: selected engine fails → System invoked
  - text normalization + chunking behavior
- Manual tests:
  - change engine and persist across app restart
  - speak in chat and sessions
  - Edge offline → fallback to System without UI freeze
  - long text chunking does not crash or truncate unexpectedly
