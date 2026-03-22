import { GEMINI_MODELS } from '../../../config/appConfig';
import { getGoogleGenAI } from './genaiClient';

export interface GeminiHealthResult {
  ok: boolean;
  status: number;
  message?: string;
}

/** Minimal connectivity check via @google/genai. */
export async function testGeminiConnectionSdk(key: string): Promise<GeminiHealthResult> {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, status: 0, message: 'empty key' };
  }
  try {
    const ai = getGoogleGenAI(trimmed);
    const response = await ai.models.generateContent({
      model: GEMINI_MODELS[0],
      contents: 'Reply with one word: ok',
      config: { maxOutputTokens: 8 },
    });
    const t = response.text?.trim();
    if (t) {
      return { ok: true, status: 200 };
    }
    return { ok: false, status: 502, message: 'empty SDK response' };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}
