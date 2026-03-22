import * as FileSystem from 'expo-file-system/legacy';
import { CLOUDFLARE_IMAGE_MODELS, GEMINI_IMAGE_MODELS, OPENROUTER_IMAGE_MODELS } from './config';
import { profileRepository } from '../../db/repositories';
import { getApiKeys } from './config';
import { normalizeImageGenerationModel } from '../../config/appConfig';
import { geminiInteractionImageSdk } from './google/geminiImage';

export interface GeneratedImage {
  /** Local file URI to the saved image */
  uri: string;
  /** Model that generated the image */
  modelUsed: string;
  /** Prompt used */
  prompt: string;
  /** Provider that generated the image */
  provider: 'cloudflare' | 'google' | 'openrouter';
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
  provider: 'cloudflare' | 'google' | 'openrouter';
}

interface GeminiImageOutput {
  type: string;
  data?: string;
  mime_type?: string;
}

type ImagePreference =
  | { kind: 'auto' }
  | { kind: 'gemini_only'; models: readonly string[] }
  | { kind: 'cf_only'; models: readonly string[] }
  | { kind: 'openrouter_only'; models: readonly string[] };

function resolveImagePreference(profile: { imageGenerationModel?: string | null }): ImagePreference {
  const p = normalizeImageGenerationModel(profile.imageGenerationModel ?? undefined);
  if (p === 'auto') return { kind: 'auto' };
  if ((GEMINI_IMAGE_MODELS as readonly string[]).includes(p)) {
    return { kind: 'gemini_only', models: [p] };
  }
  if ((CLOUDFLARE_IMAGE_MODELS as readonly string[]).includes(p)) {
    return { kind: 'cf_only', models: [p] };
  }
  if ((OPENROUTER_IMAGE_MODELS as readonly string[]).includes(p)) {
    return { kind: 'openrouter_only', models: [p] };
  }
  return { kind: 'auto' };
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

async function saveImageFromUrl(url: string, mimeType: string): Promise<string> {
  const extension = mimeType.includes('jpeg') ? 'jpg' : 'png';
  const filename = `guru_img_${Date.now()}.${extension}`;
  const dir = `${FileSystem.documentDirectory}generated_images/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  const localUri = `${dir}${filename}`;
  const downloaded = await FileSystem.downloadAsync(url, localUri);
  return downloaded.uri;
}

async function callOpenRouterImage(
  prompt: string,
  orKey: string,
  models?: readonly string[],
): Promise<GeneratedImage> {
  const modelList =
    models && models.length > 0
      ? OPENROUTER_IMAGE_MODELS.filter((m) => models.includes(m))
      : [...OPENROUTER_IMAGE_MODELS];
  if (modelList.length === 0) {
    throw new Error('No matching OpenRouter image models for preference');
  }

  const errors: string[] = [];
  for (const model of modelList) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${orKey}`,
        'HTTP-Referer': 'neet-study-app',
        'X-Title': 'Guru Study App',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.status.toString());
      errors.push(`${model}: ${err}`);
      continue;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      errors.push(`${model}: no image data`);
      continue;
    }

    // OpenRouter image models return a markdown image or just a URL.
    // Try to extract a URL (http/https).
    const urlMatch = content.match(/https?:\/\/[^\s"'()]+/);
    if (!urlMatch) {
      errors.push(`${model}: could not parse image URL from response`);
      continue;
    }
    const url = urlMatch[0];

    const uri = await saveImageFromUrl(url, 'image/png'); // Defaulting to png, exact mime might differ

    return {
      uri,
      mimeType: 'image/png',
      modelUsed: model,
      provider: 'openrouter',
      prompt,
    };
  }

  throw new Error(`OpenRouter image generation failed: ${errors.join(' | ')}`);
}

async function callCloudflareImage(
  prompt: string,
  cfAccountId: string,
  cfApiToken: string,
  options?: GenerateImageOptions,
  models?: readonly string[],
): Promise<EncodedImageResponse> {
  const modelList =
    models && models.length > 0
      ? CLOUDFLARE_IMAGE_MODELS.filter((m) => models.includes(m))
      : [...CLOUDFLARE_IMAGE_MODELS];
  if (modelList.length === 0) {
    throw new Error('No matching Cloudflare image models for preference');
  }

  const errors: string[] = [];
  for (const model of modelList) {
    let res: Response;
    
    // Some Cloudflare models require multipart/form-data instead of JSON
    const requiresMultipart = model.includes('flux-2');
    
    if (requiresMultipart) {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (options?.steps) {
        formData.append('steps', options.steps.toString());
      }
      
      res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${model}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${cfApiToken}`,
          },
          body: formData,
        },
      );
    } else {
      res = await fetch(
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
    }

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

async function callGeminiImage(
  prompt: string,
  geminiKey: string,
  models?: readonly string[],
): Promise<EncodedImageResponse> {
  const modelList =
    models && models.length > 0
      ? GEMINI_IMAGE_MODELS.filter((m) => models.includes(m))
      : [...GEMINI_IMAGE_MODELS];
  if (modelList.length === 0) {
    throw new Error('No matching Gemini image models for preference');
  }

  const errors: string[] = [];
  for (const model of modelList) {
    const sdk = await geminiInteractionImageSdk(prompt, geminiKey, model);
    if (sdk) {
      return {
        base64Image: sdk.base64Image,
        mimeType: sdk.mimeType,
        modelUsed: model,
        provider: 'google',
      };
    }

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
 * Generate an image using the user's Settings preference (`imageGenerationModel`):
 * **auto** — Gemini first, then Cloudflare; **specific model** — that backend only.
 */
export async function generateImage(
  prompt: string,
  options?: GenerateImageOptions,
): Promise<GeneratedImage> {
  const profile = await profileRepository.getProfile();
  const { cfAccountId, cfApiToken, geminiKey } = getApiKeys(profile);
  const preference = resolveImagePreference(profile);
  const errors: string[] = [];

  const tryGemini = async (models?: readonly string[]) => {
    if (!geminiKey) {
      errors.push('google credentials missing');
      return null;
    }
    try {
      const generated = await callGeminiImage(prompt, geminiKey, models);
      const uri = await saveBase64Image(generated.base64Image, generated.mimeType);
      return { ...generated, uri };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const tryCf = async (models?: readonly string[]) => {
    if (!cfAccountId || !cfApiToken) {
      errors.push('cloudflare credentials missing');
      return null;
    }
    try {
      const generated = await callCloudflareImage(prompt, cfAccountId, cfApiToken, options, models);
      const uri = await saveBase64Image(generated.base64Image, generated.mimeType);
      return { ...generated, uri };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  const tryOpenRouter = async (models?: readonly string[]) => {
    const { orKey } = getApiKeys(profile);
    if (!orKey) {
      errors.push('openrouter credentials missing');
      return null;
    }
    try {
      return await callOpenRouterImage(prompt, orKey, models);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      return null;
    }
  };

  if (preference.kind === 'auto') {
    const g = await tryGemini();
    if (g) {
      return {
        uri: g.uri,
        modelUsed: g.modelUsed,
        prompt,
        provider: g.provider,
        mimeType: g.mimeType,
      };
    }
    const c = await tryCf();
    if (c) {
      return {
        uri: c.uri,
        modelUsed: c.modelUsed,
        prompt,
        provider: c.provider,
        mimeType: c.mimeType,
      };
    }
    const o = await tryOpenRouter();
    if (o) {
      return o;
    }
    throw new Error(`No image generation backend available. ${errors.join(' | ')}`);
  }

  if (preference.kind === 'gemini_only') {
    const g = await tryGemini(preference.models);
    if (g) {
      return {
        uri: g.uri,
        modelUsed: g.modelUsed,
        prompt,
        provider: g.provider,
        mimeType: g.mimeType,
      };
    }
    throw new Error(`No image generation backend available. ${errors.join(' | ')}`);
  }

  if (preference.kind === 'cf_only') {
    const c = await tryCf(preference.models);
    if (c) {
      return {
        uri: c.uri,
        modelUsed: c.modelUsed,
        prompt,
        provider: c.provider,
        mimeType: c.mimeType,
      };
    }
    throw new Error(`No image generation backend available. ${errors.join(' | ')}`);
  }

  const o = await tryOpenRouter(preference.models);
  if (o) {
    return o;
  }
  throw new Error(`No image generation backend available. ${errors.join(' | ')}`);
}

/**
 * True when either Google (Gemini), Cloudflare, or OpenRouter image generation can run.
 */
export function isImageGenerationAvailable(profile: {
  geminiKey?: string;
  cloudflareAccountId?: string;
  cloudflareApiToken?: string;
  openrouterKey?: string;
}): boolean {
  const { cfAccountId, cfApiToken, geminiKey, orKey } = getApiKeys(profile);
  return (!!cfAccountId && !!cfApiToken) || !!geminiKey || !!orKey;
}
