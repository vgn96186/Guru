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

function sanitizeTranscript(rawTranscript: string): string {
  // Only filter out common Whisper hallucination noise or non-speech tags
  // but keep the line if it's the only thing there and doesn't look like a hallucination.
  const NOISE_PATTERNS = /^\s*(\(background noise\)|\[music\]|\*silence\*|\[inaudible\])\s*$/i;

  const cleaned = rawTranscript
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !NOISE_PATTERNS.test(l))
    .join('\n')
    .trim();

  // If we cleaned everything away but the original wasn't empty,
  // maybe it was just short speech. Let's be less aggressive.
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
  return sanitizeTranscript(String(data?.text ?? '').trim());
}

/** Engine 2: Local Whisper.rn */
export async function transcribeRawWithLocalWhisper(
  audioFilePath: string,
  localWhisperPath: string,
): Promise<string> {
  const fileUri = audioFilePath.startsWith('file://') ? audioFilePath : `file://${audioFilePath}`;

  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  if (!fileInfo.exists || fileInfo.size === 0) return '';

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
