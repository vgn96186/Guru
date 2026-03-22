import { getGoogleGenAI } from './genaiClient';

type ImageExtract = { base64Image: string; mimeType: string };

function extractImageFromOutputs(outputs: unknown[] | undefined): ImageExtract | null {
  if (!outputs?.length) return null;
  for (const o of outputs) {
    if (!o || typeof o !== 'object') continue;
    const rec = o as Record<string, unknown>;
    if (rec.type === 'image' && typeof rec.data === 'string' && rec.data.length > 0) {
      const mime = typeof rec.mime_type === 'string' ? rec.mime_type : 'image/png';
      return { base64Image: rec.data, mimeType: mime };
    }
  }
  return null;
}

/**
 * Gemini native image via Interactions API through @google/genai (primary path).
 * Returns null if the interaction fails or returns no image (caller uses REST).
 */
export async function geminiInteractionImageSdk(
  prompt: string,
  geminiKey: string,
  model: string,
): Promise<ImageExtract | null> {
  try {
    const ai = getGoogleGenAI(geminiKey);
    const interaction = await ai.interactions.create({
      api_version: 'v1beta',
      model,
      input: prompt,
      generation_config: {
        image_config: {
          aspect_ratio: '1:1',
          image_size: '1K',
        },
      },
    });
    if (interaction.status === 'failed' || interaction.status === 'cancelled') {
      return null;
    }
    return extractImageFromOutputs(interaction.outputs as unknown[] | undefined);
  } catch {
    return null;
  }
}
