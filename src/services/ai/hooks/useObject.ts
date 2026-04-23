/**
 * useObject — React hook for structured generation (parallel to useChat).
 *
 * Standardized flow: messages -> generateObject -> typed object.
 * Keeps existing AI feature behavior intact while providing a reusable hook
 * surface similar to Vercel AI SDK style.
 */

import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';
import { generateObject } from '../index';
import type { LanguageModel } from '../index';
import type { Message as CoreMessage } from '../types';

type UseObjectStatus = 'idle' | 'loading' | 'success' | 'error';

export interface UseObjectOptions<T> {
  model: LanguageModel;
  schema: z.ZodType<T>;
  system?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  initialMessages?: any[];
  temperature?: number;
  maxOutputTokens?: number;
  onSuccess?: (value: T) => void;
  onError?: (error: unknown) => void;
}

export interface SubmitObjectOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  messages?: any[];
  system?: string;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface UseObjectResult<T> {
  object: T | null;
  error: unknown;
  status: UseObjectStatus;
  isLoading: boolean;
  messages: CoreMessage[];
  setMessages: (messages: CoreMessage[]) => void;
  submitObject: (options?: SubmitObjectOptions) => Promise<T | null>;
  reset: () => void;
  abort: () => void;
}

export function useObject<T>(options: UseObjectOptions<T>): UseObjectResult<T> {
  const {
    model,
    schema,
    system,
    temperature,
    maxOutputTokens,
    onSuccess,
    onError,
    initialMessages,
  } = options;

  const [object, setObject] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<UseObjectStatus>('idle');
  const [messages, setMessages] = useState<CoreMessage[]>(initialMessages ?? []);
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
      const nextSystem = submitOptions?.system ?? system;
      const nextTemperature = submitOptions?.temperature ?? temperature;
      const nextMaxOutputTokens = submitOptions?.maxOutputTokens ?? maxOutputTokens;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
        const result: any = await (generateObject as any)({
          model,
          schema,
          messages: nextMessages,
          system: nextSystem,
          temperature: nextTemperature,
          maxOutputTokens: nextMaxOutputTokens,
          abortSignal: controller.signal,
        });

        setObject(result.object as T);
        setStatus('success');
        onSuccess?.(result.object as T);
        return result.object as T;
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') {
          setStatus('idle');
          return null;
        }
        setError(err);
        setStatus('error');
        onError?.(err);
        return null;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [abort, messages, maxOutputTokens, model, onError, onSuccess, schema, system, temperature],
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
