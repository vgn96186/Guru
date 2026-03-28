import type { UserProfile } from '../../types';

export type TranscriptionProvider = NonNullable<UserProfile['transcriptionProvider']>;
export type RunnableTranscriptionProvider = Exclude<TranscriptionProvider, 'auto'>;

interface ProviderAvailability {
  groq: boolean;
  huggingface: boolean;
  cloudflare: boolean;
  deepgram: boolean;
  local: boolean;
}

interface RunTranscriptionProvidersOptions<T> {
  preferredProvider: TranscriptionProvider;
  availability: ProviderAvailability;
  runners: Partial<Record<RunnableTranscriptionProvider, () => Promise<T>>>;
  isUsableResult?: (result: T) => boolean;
  fallbackOnError?: boolean;
  onProviderStart?: (provider: RunnableTranscriptionProvider) => void;
  onProviderError?: (provider: RunnableTranscriptionProvider, error: unknown) => void;
  onProviderResult?: (provider: RunnableTranscriptionProvider, result: T, usable: boolean) => void;
}

export function buildTranscriptionProviderOrder(
  preferredProvider: TranscriptionProvider,
  availability: ProviderAvailability,
): RunnableTranscriptionProvider[] {
  const orderedProviders: RunnableTranscriptionProvider[] =
    preferredProvider === 'groq'
      ? ['groq', 'cloudflare', 'huggingface', 'deepgram', 'local']
      : preferredProvider === 'cloudflare'
        ? ['cloudflare', 'groq', 'huggingface', 'deepgram', 'local']
        : preferredProvider === 'huggingface'
          ? ['huggingface', 'groq', 'cloudflare', 'deepgram', 'local']
          : preferredProvider === 'deepgram'
            ? ['deepgram', 'groq', 'cloudflare', 'huggingface', 'local']
            : preferredProvider === 'local'
              ? ['local', 'groq', 'cloudflare', 'huggingface', 'deepgram']
              : ['groq', 'cloudflare', 'huggingface', 'deepgram', 'local'];

  return orderedProviders.filter((provider, index) => {
    if (!availability[provider]) return false;
    return orderedProviders.indexOf(provider) === index;
  });
}

export async function runTranscriptionProviders<T>({
  preferredProvider,
  availability,
  runners,
  isUsableResult = (result) => Boolean(result),
  fallbackOnError = true,
  onProviderStart,
  onProviderError,
  onProviderResult,
}: RunTranscriptionProvidersOptions<T>): Promise<{
  result: T | null;
  provider: RunnableTranscriptionProvider | null;
  lastError: unknown;
}> {
  const providerOrder = buildTranscriptionProviderOrder(preferredProvider, availability);
  let lastError: unknown = null;

  for (const provider of providerOrder) {
    const runner = runners[provider];
    if (!runner) continue;

    try {
      onProviderStart?.(provider);
      const result = await runner();
      const usable = isUsableResult(result);
      onProviderResult?.(provider, result, usable);
      if (usable) {
        return { result, provider, lastError };
      }
    } catch (error) {
      lastError = error;
      onProviderError?.(provider, error);
      if (!fallbackOnError) {
        throw error;
      }
    }
  }

  return { result: null, provider: null, lastError };
}
