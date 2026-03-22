import { GEMINI_MODELS } from '../../../config/appConfig';
import { getGoogleGenAI } from './genaiClient';

/**
 * Lists Gemini models that support chat-style generation via @google/genai.
 * Returns empty array if listing fails or yields nothing usable (caller falls back to REST).
 */
export async function fetchGeminiChatModelIdsViaSdk(apiKey: string): Promise<string[]> {
  const ai = getGoogleGenAI(apiKey);
  const pager = await ai.models.list({ config: { pageSize: 100 } });
  const ids: string[] = [];
  for await (const m of pager) {
    const name = m.name ?? '';
    const id = name.startsWith('models/') ? name.slice('models/'.length) : name;
    if (!id || /embedding|embed/i.test(id)) continue;
    const actions = m.supportedActions;
    if (actions && actions.length > 0 && !actions.includes('generateContent')) continue;
    ids.push(id);
  }
  return ids;
}

/** Merge SDK ids with curated defaults (same idea as REST path). */
export function mergeGeminiListWithDefaults(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...raw, ...GEMINI_MODELS]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
