import * as FileSystem from 'expo-file-system/legacy';
import { convertToWav } from '../../../modules/app-launcher';
import { BatchTranscriber } from '../offlineTranscription/batchTranscriber';
import { DEFAULT_HF_TRANSCRIPTION_MODEL } from '../../config/appConfig';
import { toFileUri } from '../fileUri';
import { getWhisperModelManager } from '../offlineTranscription/whisperModelManager';

const WHISPER_MEDICAL_PROMPT =
  'Medical lecture: NEET-PG, INICET preparation. ' +
  'Common terms: hemostasis, renin-angiotensin system, glomerular filtration rate, ' +
  'brachial plexus, pneumonia, cirrhosis, pharmacokinetics, pharmacodynamics, ' +
  'myocardial infarction, atherosclerosis, nephrotic syndrome, ' +
  'ECG, ABG, CSF, MRI, CT scan, CBC, LFT, RFT, ABG. ' +
  'Hindi-English mix (Hinglish). Toh, matlab, yahan pe, dekhiye, samajh lo.';

// Known Whisper hallucination patterns on silent/short audio
const HALLUCINATION_PATTERNS = [
  /^(thank you\.?\s*){2,}$/i,
  /^(thanks for watching\.?\s*){1,}$/i,
  /^(please subscribe\.?\s*){1,}$/i,
  /^(♪\s*)+$/,
  /^\[music\]$/i,
  /^\[silence\]$/i,
  /^\(silence\)$/i,
  /^\[blank audio\]$/i,
  /^(okay\.?\s*){3,}$/i,
  /^(um\.?\s*){3,}$/i,
  /^(uh\.?\s*){3,}$/i,
  /^(you\.?\s*){4,}$/i,
  // Repeated phrase hallucinations (e.g. "The muscles. The muscles. The muscles.")
  /^(.{5,40})\s*[.,]?\s*(\1\s*[.,]?\s*){2,}$/i,
];

const HUGGINGFACE_MAX_SAFE_UPLOAD_BYTES = 20 * 1024 * 1024;
const LOCAL_WHISPER_BATCH_THRESHOLD_BYTES = 24 * 1024 * 1024;

// Keep local Whisper transcriptions serialized.
// whisper.rn contexts are native resources and should not be shared concurrently.
let _whisperTranscriptionMutex: Promise<void> = Promise.resolve();
function acquireWhisperTranscriptionMutex(): Promise<() => void> {
  let release!: () => void;
  const prev = _whisperTranscriptionMutex;
  _whisperTranscriptionMutex = new Promise<void>((resolve) => {
    release = resolve;
  });
  return prev.then(() => release);
}

function isLikelyHallucination(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  // Very short single-sentence transcripts from what should be a long recording
  // are usually hallucinations — handled at call site with file size check.
  return HALLUCINATION_PATTERNS.some((p) => p.test(trimmed));
}

function sanitizeTranscript(rawTranscript: string): string {
  const NOISE_PATTERNS = /^\s*(\(background noise\)|\[music\]|\*silence\*|\[inaudible\])\s*$/i;

  const cleaned = rawTranscript
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !NOISE_PATTERNS.test(l))
    .join('\n')
    .trim();

  if (!cleaned && rawTranscript.trim().length > 0) {
    return rawTranscript.trim();
  }
  return cleaned;
}

function getAudioMimeType(audioFilePath: string): string {
  const normalizedPath = audioFilePath.toLowerCase();
  if (normalizedPath.endsWith('.wav')) return 'audio/wav';
  if (normalizedPath.endsWith('.mp3')) return 'audio/mpeg';
  if (normalizedPath.endsWith('.aac')) return 'audio/aac';
  if (normalizedPath.endsWith('.m4a') || normalizedPath.endsWith('.mp4')) return 'audio/mp4';
  return 'application/octet-stream';
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Cloud fallback: Groq Whisper transcription */
export async function transcribeRawWithGroq(
  audioFilePath: string,
  groqKey: string,
): Promise<string> {
  if (!groqKey?.trim()) {
    throw new Error('Groq API key missing. Add one in Settings or enable Local Whisper.');
  }
  const fileUri = toFileUri(audioFilePath);

  const formData = new FormData();
  formData.append('file', {
    uri: fileUri,
    name: 'lecture.m4a',
    type: 'audio/mp4',
  } as any);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('temperature', '0');
  formData.append('prompt', WHISPER_MEDICAL_PROMPT);

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Groq transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const transcript = sanitizeTranscript(String(data?.text ?? '').trim());
  // Reject single short sentences that are classic Whisper hallucinations on silence
  if (isLikelyHallucination(transcript)) return '';
  return transcript;
}

/** Cloud fallback: Hugging Face Automatic Speech Recognition */
export async function transcribeRawWithHuggingFace(
  audioFilePath: string,
  huggingFaceToken: string,
  modelId = DEFAULT_HF_TRANSCRIPTION_MODEL,
): Promise<string> {
  if (!huggingFaceToken?.trim()) {
    throw new Error('Hugging Face token missing. Add one in Settings or choose another provider.');
  }

  const fileUri = toFileUri(audioFilePath);
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo?.exists || fileInfo.size === 0) {
    throw new Error(`Audio file is missing or empty: ${audioFilePath}`);
  }
  if (fileInfo.size > HUGGINGFACE_MAX_SAFE_UPLOAD_BYTES) {
    throw new Error(
      `Hugging Face transcription is limited to ${formatMegabytes(HUGGINGFACE_MAX_SAFE_UPLOAD_BYTES)} files in Guru to avoid memory crashes. Use Groq or Local Whisper for larger recordings.`,
    );
  }

  const response = await fetch(fileUri);
  if (!response.ok) {
    throw new Error(`Failed to read local audio file for Hugging Face: ${response.status}`);
  }

  const audioBlob = await response.blob();
  const res = await fetch(
    `https://router.huggingface.co/hf-inference/models/${encodeURIComponent(modelId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${huggingFaceToken}`,
        'Content-Type': getAudioMimeType(audioFilePath),
      },
      body: audioBlob,
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Hugging Face transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawText =
    typeof data?.text === 'string'
      ? data.text
      : typeof data?.generated_text === 'string'
        ? data.generated_text
        : Array.isArray(data) && typeof data[0]?.text === 'string'
          ? data[0].text
          : '';
  const transcript = sanitizeTranscript(rawText.trim());
  if (isLikelyHallucination(transcript)) return '';
  return transcript;
}

/** Cloud fallback: Cloudflare Workers AI Whisper transcription */
export async function transcribeRawWithCloudflare(
  audioFilePath: string,
  accountId: string,
  apiToken: string,
): Promise<string> {
  if (!accountId?.trim() || !apiToken?.trim()) {
    throw new Error('Cloudflare account ID or API token missing. Add them in Settings.');
  }

  const fileUri = toFileUri(audioFilePath);
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo?.exists || fileInfo.size === 0) {
    throw new Error(`Audio file is missing or empty: ${audioFilePath}`);
  }

  // Read audio as base64 for Cloudflare's JSON endpoint
  const audioBase64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/openai/whisper-large-v3-turbo`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        audio: audioBase64,
        language: 'en',
        vad_filter: true,
        condition_on_previous_text: false,
      }),
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Cloudflare transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawText = String(data?.result?.text ?? '').trim();
  const transcript = sanitizeTranscript(rawText);
  if (isLikelyHallucination(transcript)) return '';
  return transcript;
}

/** Cloud fallback: Deepgram Nova-2 Medical transcription */
export async function transcribeRawWithDeepgram(
  audioFilePath: string,
  deepgramKey: string,
): Promise<string> {
  if (!deepgramKey?.trim()) {
    throw new Error('Deepgram API key missing. Add one in Settings.');
  }

  const fileUri = toFileUri(audioFilePath);
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo?.exists || fileInfo.size === 0) {
    throw new Error(`Audio file is missing or empty: ${audioFilePath}`);
  }

  const response = await fetch(fileUri);
  if (!response.ok) {
    throw new Error(`Failed to read local audio file for Deepgram: ${response.status}`);
  }

  const audioBlob = await response.blob();
  const mimeType = getAudioMimeType(audioFilePath);
  const res = await fetch(
    'https://api.deepgram.com/v1/listen?model=nova-2-medical&language=en&smart_format=true&punctuate=true&diarize=false',
    {
      method: 'POST',
      headers: {
        Authorization: `Token ${deepgramKey}`,
        'Content-Type': mimeType,
      },
      body: audioBlob,
    },
  );

  if (!res.ok) {
    const err = await res.text().catch(() => res.status.toString());
    throw new Error(`Deepgram transcription error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const rawText = String(
    data?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '',
  ).trim();
  const transcript = sanitizeTranscript(rawText);
  if (isLikelyHallucination(transcript)) return '';
  return transcript;
}

/** Engine 2: Local Whisper.rn */
export async function transcribeRawWithLocalWhisper(
  audioFilePath: string,
  localWhisperPath: string,
): Promise<string> {
  const fileUri = toFileUri(audioFilePath);

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo?.exists || fileInfo.size === 0) return '';

  let whisperInputUri = fileUri;
  if (audioFilePath.endsWith('.m4a') || audioFilePath.endsWith('.mp4')) {
    const wavPath = await convertToWav(audioFilePath);
    if (wavPath) {
      whisperInputUri = toFileUri(wavPath);
    }
  }

  const whisperModelManager = getWhisperModelManager();
  const whisperInputInfo = await FileSystem.getInfoAsync(whisperInputUri);
  if (!whisperInputInfo?.exists || whisperInputInfo.size === 0) return '';

  const release = await acquireWhisperTranscriptionMutex();
  try {
    await whisperModelManager.loadModelFromFilePath(localWhisperPath);

    if (whisperInputInfo.size > LOCAL_WHISPER_BATCH_THRESHOLD_BYTES) {
      const batch = new BatchTranscriber(whisperModelManager, {
        chunkDurationSec: 30,
        overlapSec: 1,
        beamSize: 1,
        bestOf: 1,
        nThreads: 4,
      });
      const { segments } = await batch.transcribe(whisperInputUri);
      const transcript = sanitizeTranscript(
        segments
          .map((segment) => segment.text.trim())
          .filter(Boolean)
          .join(' ')
          .trim(),
      );
      return isLikelyHallucination(transcript) ? '' : transcript;
    }

    const whisperContext = whisperModelManager.getContext();
    const { promise } = whisperContext.transcribe(whisperInputUri, {
      language: 'en',
      maxThreads: 4,
      maxContext: 0,
      maxLen: 0,
      tokenTimestamps: false,
      beamSize: 1,
      bestOf: 1,
      temperature: 0,
      prompt: WHISPER_MEDICAL_PROMPT,
    });

    const { result } = await promise;
    const transcript = sanitizeTranscript(result?.trim() ?? '');
    return isLikelyHallucination(transcript) ? '' : transcript;
  } finally {
    release();
    if (whisperInputUri !== fileUri) {
      try {
        await FileSystem.deleteAsync(whisperInputUri, { idempotent: true });
      } catch {
        /* best effort */
      }
    }
  }
}
