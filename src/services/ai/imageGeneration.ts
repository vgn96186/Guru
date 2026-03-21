import * as FileSystem from 'expo-file-system/legacy';
import { CLOUDFLARE_IMAGE_MODELS, GEMINI_IMAGE_MODELS } from './config';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';

export interface GeneratedImage {
  /** Local file URI to the saved image */
  uri: string;
  /** Model that generated the image */
  modelUsed: string;
  /** Prompt used */
  prompt: string;
  /** Provider that generated the image */
  provider: 'cloudflare' | 'google';
  /** MIME type of the generated image */
  mimeType: string;
}

interface GenerateImageOptions {
  steps?: number;
}

interface EncodedImageResponse {
  base64Image: string;
  mimeType: string;
  modelUsed: string;
  provider: 'cloudflare' | 'google';
}

interface GeminiImageOutput {
  type: string;
  data?: string;
  mime_type?: string;
}

async function saveBase64Image(base64Image: string, mimeType: string): Promise<string> {
  const extension = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const filename = `guru_img_${Date.now()}.${extension}`;
  const dir = `${FileSystem.documentDirectory}generated_images/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const localUri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(localUri, base64Image, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return localUri;
}

async function callCloudflareImage(
  prompt: string,
  cfAccountId: string,
  cfApiToken: string,
  options?: GenerateImageOptions,
): Promise<EncodedImageResponse> {
  const errors: string[] = [];
  for (const model of CLOUDFLARE_IMAGE_MODELS) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfApiToken}`,
        },
        body: JSON.stringify({
          prompt,
          steps: options?.steps ?? 4,
        }),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      errors.push(`${model}: ${err}`);
      continue;
    }

    const data = await res.json();
    const base64Image = data?.result?.image ?? data?.image ?? data?.result?.images?.[0];
    if (!base64Image) {
      errors.push(`${model}: no image data`);
      continue;
    }

    return {
      base64Image,
      mimeType: data?.result?.mime_type ?? data?.mime_type ?? 'image/png',
      modelUsed: model,
      provider: 'cloudflare',
    };
  }

  throw new Error(`Cloudflare image generation failed: ${errors.join(' | ')}`);
}

async function callGeminiImage(prompt: string, geminiKey: string): Promise<EncodedImageResponse> {
  const errors: string[] = [];
  for (const model of GEMINI_IMAGE_MODELS) {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        generation_config: {
          image_config: {
            aspect_ratio: '1:1',
            image_size: '1k',
          },
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      errors.push(`${model}: ${err}`);
      continue;
    }

    const data = await res.json();
    const imageOutput = (data?.outputs as GeminiImageOutput[] | undefined)?.find(
      (output) => output.type === 'image',
    );
    if (!imageOutput?.data) {
      errors.push(`${model}: no image output`);
      continue;
    }

    return {
      base64Image: imageOutput.data,
      mimeType: imageOutput.mime_type ?? 'image/png',
      modelUsed: model,
      provider: 'google',
    };
  }

  throw new Error(`Google image generation failed: ${errors.join(' | ')}`);
}

/**
 * Generate an image using Cloudflare Workers AI (Flux-1-Schnell).
 * Returns a local file URI to the saved PNG.
 *
 * Free tier: ~2000 images/day at 512x512 (4.8 neurons/image).
 */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions,
): Promise<GeneratedImage> {
  const profile = await profileRepository.getProfile();
  const { cfAccountId, cfApiToken, geminiKey } = getApiKeys(profile);
  const errors: string[] = [];

  if (!cfAccountId || !cfApiToken) {
    errors.push('cloudflare credentials missing');
  } else {
    try {
      const generated = await callCloudflareImage(prompt, cfAccountId, cfApiToken, options);
      const uri = await saveBase64Image(generated.base64Image, generated.mimeType);
      return {
        uri,
        modelUsed: generated.modelUsed,
        prompt,
        provider: generated.provider,
        mimeType: generated.mimeType,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!geminiKey) {
    errors.push('google credentials missing');
  } else {
    try {
      const generated = await callGeminiImage(prompt, geminiKey);
      const uri = await saveBase64Image(generated.base64Image, generated.mimeType);
      return {
        uri,
        modelUsed: generated.modelUsed,
        prompt,
        provider: generated.provider,
        mimeType: generated.mimeType,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`No image generation backend available. ${errors.join(' | ')}`);
}

/**
 * Check if image generation is available (Cloudflare credentials configured).
 */
export function isImageGenerationAvailable(profile: {
  geminiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
}): boolean {
  const { cfAccountId, cfApiToken, geminiKey } = getApiKeys(profile);
  return (!!cfAccountId && !!cfApiToken) || !!geminiKey;
}
