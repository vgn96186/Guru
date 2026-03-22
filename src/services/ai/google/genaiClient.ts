import { GoogleGenAI } from '@google/genai';

const clientByKey = new Map<string, GoogleGenAI>();

/** Cached Gemini API (AI Studio) client — one instance per key string. */
export function getGoogleGenAI(apiKey: string): GoogleGenAI {
  const k = apiKey.trim();
  if (!k) {
    throw new Error('Gemini API key required');
  }
  let c = clientByKey.get(k);
  if (!c) {
    c = new GoogleGenAI({ apiKey: k, vertexai: false });
    clientByKey.set(k, c);
  }
  return c;
}
