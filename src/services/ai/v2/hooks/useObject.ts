/**
 * useObject — React hook for structured generation (parallel to useChat).
 *
 * Standardized flow: messages -> generateObject -> typed object.
 * Keeps existing AI feature behavior intact while providing a reusable hook
 * surface similar to Vercel AI SDK style.
 */

import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';
import { generateObject } from '../generateObject';
import type { LanguageModelV2, ModelMessage } from '../spec';

type UseObjectStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseObjectOptions<T> {
  model: LanguageModelV2;
  schema: z.ZodType<T>;
  system?: string;
  initialMessages?: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  onSuccess?: (value: T) => void;
  onError?: (error: unknown) => void;
}

export interface SubmitObjectOptions {
  messages?: ModelMessage[];
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface UseObjectResult<T> {
  object: T | null;
  error: unknown;
  status: UseObjectStatus;
  isLoading: boolean;
  messages: ModelMessage[];
  setMessages: (messages: ModelMessage[]) => void;
  submitObject: (options?: SubmitObjectOptions) => Promise<T | null>;
  reset: () => void;
  abort: () => void;
}

export function useObject<T>(options: UseObjectOptions<T>): UseObjectResult<T> {
  const [object, setObject] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<UseObjectStatus>('idle');
  const [messages, setMessages] = useState<ModelMessage[]>(options.initialMessages ?? []);
  const abortControllerRef = useRef<AbortController | null>(null);

  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abort();
    setObject(null);
    setError(null);
    setStatus('idle');
  }, [abort]);

  const submitObject = useCallback(
    async (submitOptions?: SubmitObjectOptions): Promise<T | null> => {
      abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('loading');
      setError(null);

      const nextMessages = submitOptions?.messages ?? messages;
      const nextSystem = submitOptions?.system ?? options.system;
      const nextTemperature = submitOptions?.temperature ?? options.temperature;
      const nextMaxOutputTokens = submitOptions?.maxOutputTokens ?? options.maxOutputTokens;

      try {
        const result = await generateObject<T>({
          model: options.model,
          schema: options.schema,
          messages: nextMessages,
          system: nextSystem,
          temperature: nextTemperature,
          maxOutputTokens: nextMaxOutputTokens,
          abortSignal: controller.signal,
        });

        setObject(result.object);
        setStatus('success');
        options.onSuccess?.(result.object);
        return result.object;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setStatus('idle');
          return null;
        }
        setError(err);
        setStatus('error');
        options.onError?.(err);
        return null;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [
      abort,
      messages,
      options.maxOutputTokens,
      options.model,
      options.onError,
      options.onSuccess,
      options.schema,
      options.system,
      options.temperature,
    ],
  );

  return {
    object,
    error,
    status,
    isLoading: status === 'loading',
    messages,
    setMessages,
    submitObject,
    reset,
    abort,
  };
}
