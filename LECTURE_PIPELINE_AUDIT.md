# Lecture Transcription & AI Pipeline Audit

## 1. Lecture Transcription Pipeline
### Findings:
- **Audio Chunking & Memory Exhaustion**: The `processLongRecording` function in `src/services/lectureSessionMonitor.ts` processes massive base64 strings in memory. It decodes a base64 string using `atob`, concatenates it with raw binary header bytes in a `for` loop, and re-encodes it using `btoa`. In React Native's JS thread, doing this on a 20MB chunk of audio will block the UI completely and frequently cause Out of Memory (OOM) crashes on low-end Android devices.
- **Error Recovery State Machine**: The app correctly maintains a "pending" state in the DB if Groq transcription fails due to network, and uses `retryFailedTranscriptions` to recover on next launch.

### Improvements:
- **Native Base64/File operations**: The base64 manipulation should be pushed to the native side. Alternatively, `expo-file-system` should be used to stream-write the header and append the existing file chunks without loading the entire 20MB payload into JS string memory.

## 2. Overlay Bubble Widget
### Findings:
- **Face Tracking (ML Kit) Battery Drain**: In `modules/app-launcher/android/src/main/java/expo/modules/applauncher/OverlayService.kt`, `ImageAnalysis.Builder()` runs face tracking on every frame from the camera. This is overkill for a simple "is the user paying attention" check and will destroy device battery life during a 2-hour lecture.
- **Graceful Degradation**: The overlay handles camera unbinding gracefully, but there is no user-facing toggle to disable face tracking if they are in a low-battery situation.

### Improvements:
- **Throttle Frame Analysis**: Implement a throttle in the Kotlin code so the analyzer only processes 1 frame every 2 seconds (`setTargetResolution` and drop frames).

## 3. LLM Implementation & Routing
### Findings:
- **Routing Intelligence**: `src/services/aiService.ts` correctly identifies that high-complexity JSON tasks fail on standard Llama 1B models and shifts routing dynamically between Local -> Cloud -> Local fallback depending on model quantization and availability.
- **JSON Repair Pipeline**: The `parseStructuredJson` function is extremely robust, utilizing multiple repair phases (`repairCommonJsonIssues`, `repairTruncatedJson`, `extractBalancedJson`) alongside Zod validation. This is a best-in-class pattern for mobile LLM inference.
- **Context Leaks**: The local Llama context is instantiated globally but never explicitly released when the app goes into the background, holding hundreds of megabytes of RAM hostage.

### Improvements:
- Add an `AppState` listener in `aiService.ts` that automatically calls `llamaContext.release()` when the app enters the `background` state, and re-initializes it when foregrounded.

## 4. App UI (Homescreen & Settings)
### Findings:
- **Lecture Return Handling**: `HomeScreen.tsx` utilizes an `AppState` listener to call `checkForReturnedSession` when the user navigates back from an external app. However, the file validation logic retries 3 times with a 200ms delay. If a 1-hour recording is still flushing from the native cache to storage, this 600ms window might not be enough, causing the app to discard a valid lecture.

### Improvements:
- **Async Polling**: Increase the retry mechanism in `checkForReturnedSession` to poll for up to 5 seconds before giving up on the native audio file.
