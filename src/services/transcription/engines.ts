import * as FileSystem from 'expo-file-system/legacy';
import { initWhisper } from 'whisper.rn';
import { convertToWav } from '../../../modules/app-launcher';

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

/** Cloud fallback: Groq Whisper transcription */
export async function transcribeRawWithGroq(
  audioFilePath: string,
  groqKey: string,
): Promise<string> {
  if (!groqKey?.trim()) {
    throw new Error('Groq API key missing. Add one in Settings or enable Local Whisper.');
  }
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;

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

/** Engine 2: Local Whisper.rn */
export async function transcribeRawWithLocalWhisper(
  audioFilePath: string,
  localWhisperPath: string,
): Promise<string> {
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo?.exists || fileInfo.size === 0) return '';

  let whisperInputUri = fileUri;
  if (audioFilePath.endsWith('.m4a') || audioFilePath.endsWith('.mp4')) {
    const wavPath = await convertToWav(audioFilePath);
    if (wavPath) {
      whisperInputUri = wavPath.startsWith('file://') ? wavPath : `file://${wavPath}`;
    }
  }

  const whisperContext = await initWhisper({ filePath: localWhisperPath });

  try {
    const { promise } = whisperContext.transcribe(whisperInputUri, {
      language: 'en',
      maxThreads: 4,
      maxContext: 0,
      maxLen: 64,
      tokenTimestamps: false,
      beamSize: 1,
      bestOf: 1,
      temperature: 0,
      prompt: WHISPER_MEDICAL_PROMPT,
    });

    const { result } = await promise;
    return sanitizeTranscript(result?.trim() ?? '');
  } finally {
    await whisperContext.release();
    if (whisperInputUri !== fileUri) {
      try {
        await FileSystem.deleteAsync(whisperInputUri, { idempotent: true });
      } catch {
        /* best effort */
      }
    }
  }
}
