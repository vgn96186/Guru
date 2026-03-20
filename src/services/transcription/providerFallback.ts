import type { UserProfile } from '../../types';

export type TranscriptionProvider = NonNullable<UserProfile['transcriptionProvider']>;
export type RunnableTranscriptionProvider = Exclude<TranscriptionProvider, 'auto'>;

interface ProviderAvailability {
  groq: boolean;
  huggingface: boolean;
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
}

export function buildTranscriptionProviderOrder(
  preferredProvider: TranscriptionProvider,
  availability: ProviderAvailability,
): RunnableTranscriptionProvider[] {
  const orderedProviders: RunnableTranscriptionProvider[] =
    preferredProvider === 'groq'
      ? ['groq', 'huggingface', 'local']
      : preferredProvider === 'huggingface'
        ? ['huggingface', 'groq', 'local']
        : preferredProvider === 'local'
          ? ['local', 'groq', 'huggingface']
          : ['groq', 'huggingface', 'local'];

  return orderedProviders.filter((provider, index) => {
    if (
      (provider === 'groq' && !availability.groq) ||
      (provider === 'huggingface' && !availability.huggingface) ||
      (provider === 'local' && !availability.local)
    ) {
      return false;
    }
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
      if (isUsableResult(result)) {
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
