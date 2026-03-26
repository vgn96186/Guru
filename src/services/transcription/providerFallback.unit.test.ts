import {
  buildTranscriptionProviderOrder,
  runTranscriptionProviders,
} from './providerFallback';

describe('buildTranscriptionProviderOrder', () => {
  const allAvailable = { groq: true, huggingface: true, cloudflare: true, deepgram: true, local: true };

  it('should default to groq-first order for auto provider', () => {
    const order = buildTranscriptionProviderOrder('auto', allAvailable);
    expect(order).toEqual(['groq', 'cloudflare', 'huggingface', 'deepgram', 'local']);
  });

  it('should prefer the specified provider first', () => {
    expect(buildTranscriptionProviderOrder('cloudflare', allAvailable)[0]).toBe('cloudflare');
    expect(buildTranscriptionProviderOrder('huggingface', allAvailable)[0]).toBe('huggingface');
    expect(buildTranscriptionProviderOrder('local', allAvailable)[0]).toBe('local');
    expect(buildTranscriptionProviderOrder('groq', allAvailable)[0]).toBe('groq');
  });

  it('should filter out unavailable providers', () => {
    const order = buildTranscriptionProviderOrder('auto', {
      groq: false,
      huggingface: true,
      cloudflare: false,
      deepgram: false,
      local: true,
    });
    expect(order).toEqual(['huggingface', 'local']);
    expect(order).not.toContain('groq');
    expect(order).not.toContain('cloudflare');
  });

  it('should return empty array when nothing is available', () => {
    const order = buildTranscriptionProviderOrder('auto', {
      groq: false,
      huggingface: false,
      cloudflare: false,
      deepgram: false,
      local: false,
    });
    expect(order).toEqual([]);
  });

  it('should still include fallbacks even when preferred is first', () => {
    const order = buildTranscriptionProviderOrder('local', allAvailable);
    expect(order[0]).toBe('local');
    expect(order.length).toBe(5);
    expect(order).toContain('groq');
  });
});

describe('runTranscriptionProviders', () => {
  it('should return result from first successful provider', async () => {
    const { result, provider } = await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: { groq: true, huggingface: false, cloudflare: false, deepgram: false, local: false },
      runners: {
        groq: async () => 'transcript from groq',
      },
      isUsableResult: (r) => r.trim().length > 0,
    });

    expect(result).toBe('transcript from groq');
    expect(provider).toBe('groq');
  });

  it('should fall back to next provider when first fails', async () => {
    const onError = jest.fn();
    const { result, provider } = await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: { groq: true, huggingface: true, cloudflare: false, deepgram: false, local: false },
      runners: {
        groq: async () => {
          throw new Error('Groq API down');
        },
        huggingface: async () => 'transcript from hf',
      },
      isUsableResult: (r) => r.trim().length > 0,
      fallbackOnError: true,
      onProviderError: onError,
    });

    expect(result).toBe('transcript from hf');
    expect(provider).toBe('huggingface');
    expect(onError).toHaveBeenCalledWith('groq', expect.any(Error));
  });

  it('should fall back when result is not usable (empty string)', async () => {
    const { result, provider } = await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: { groq: true, huggingface: true, cloudflare: false, deepgram: false, local: false },
      runners: {
        groq: async () => '',
        huggingface: async () => 'fallback transcript',
      },
      isUsableResult: (r) => typeof r === 'string' && r.trim().length > 0,
    });

    expect(result).toBe('fallback transcript');
    expect(provider).toBe('huggingface');
  });

  it('should return null when all providers fail', async () => {
    const { result, provider, lastError } = await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: { groq: true, huggingface: false, cloudflare: false, deepgram: false, local: false },
      runners: {
        groq: async () => {
          throw new Error('fail');
        },
      },
      fallbackOnError: true,
    });

    expect(result).toBeNull();
    expect(provider).toBeNull();
    expect(lastError).toBeInstanceOf(Error);
  });

  it('should throw immediately when fallbackOnError is false', async () => {
    await expect(
      runTranscriptionProviders<string>({
        preferredProvider: 'auto',
        availability: { groq: true, huggingface: true, cloudflare: false, deepgram: false, local: false },
        runners: {
          groq: async () => {
            throw new Error('fatal');
          },
          huggingface: async () => 'should not reach',
        },
        fallbackOnError: false,
      }),
    ).rejects.toThrow('fatal');
  });

  it('should call onProviderStart for each attempted provider', async () => {
    const onStart = jest.fn();
    await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: { groq: true, huggingface: true, cloudflare: false, deepgram: false, local: false },
      runners: {
        groq: async () => '',
        huggingface: async () => 'ok',
      },
      isUsableResult: (r) => r.trim().length > 0,
      onProviderStart: onStart,
    });

    expect(onStart).toHaveBeenCalledWith('groq');
    expect(onStart).toHaveBeenCalledWith('huggingface');
    expect(onStart).toHaveBeenCalledTimes(2);
  });

  it('should skip providers without a runner', async () => {
    const { result, provider } = await runTranscriptionProviders<string>({
      preferredProvider: 'auto',
      availability: { groq: true, huggingface: true, cloudflare: false, deepgram: false, local: false },
      runners: {
        huggingface: async () => 'hf only',
      },
      isUsableResult: (r) => r.trim().length > 0,
    });

    expect(result).toBe('hf only');
    expect(provider).toBe('huggingface');
  });
});
