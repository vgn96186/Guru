/**
 * useCompletion — React hook for non-conversational text generation.
 * 
 * Similar to Vercel AI SDK's `useCompletion` hook. Manages a single input,
 * streams the completion response, and provides controls.
 * 
 * This is useful for:
 * - Summarization
 * - Translation  
 * - Code generation
 * - Any non-chat text completion
 */

import { useCallback, useRef, useState } from 'react';
import type { LanguageModel } from '../index';
import { streamText } from '../index';

export type CompletionStatus = 'idle' | 'submitted' | 'streaming' | 'error';

export interface UseCompletionOptions {
  /** The language model to use for completions */
  model: LanguageModel;
  /** Optional system prompt */
  system?: string;
  /** Initial input value */
  initialInput?: string;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Temperature (0-1) */
  temperature?: number;
  /** Called when completion finishes successfully */
  onFinish?: (completion: string) => void;
  /** Called when an error occurs */
  onError?: (error: unknown) => void;
}

export interface UseCompletionReturn {
  /** Current input value */
  input: string;
  /** Set the input value */
  setInput: (input: string) => void;
  /** Generated completion text */
  completion: string;
  /** Whether a completion is in progress */
  isLoading: boolean;
  /** Current status */
  status: CompletionStatus;
  /** Error if one occurred */
  error: unknown;
  /** Submit the current input for completion */
  complete: (inputOverride?: string) => Promise<void>;
  /** Stop an ongoing completion */
  stop: () => void;
  /** Reset to initial state */
  reset: () => void;
}

export function useCompletion(options: UseCompletionOptions): UseCompletionReturn {
  const [input, setInput] = useState(options.initialInput ?? '');
  const [completion, setCompletion] = useState('');
  const [status, setStatus] = useState<CompletionStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setStatus('idle');
  }, []);

  const reset = useCallback(() => {
    stop();
    setInput(options.initialInput ?? '');
    setCompletion('');
    setError(null);
    setStatus('idle');
  }, [stop, options.initialInput]);

  const complete = useCallback(async (inputOverride?: string) => {
    const textToComplete = inputOverride ?? input;
    if (!textToComplete.trim()) return;

    stop(); // Stop any ongoing completion
    
    setStatus('submitted');
    setError(null);
    setCompletion('');
    
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = streamText({
        model: options.model,
        messages: [{ role: 'user', content: textToComplete }],
        system: options.system,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        abortSignal: controller.signal,
      });

      setStatus('streaming');
      
      let fullText = '';
      for await (const chunk of result.textStream) {
        if (controller.signal.aborted) break;
        
        fullText += chunk;
        setCompletion(fullText);
      }

      if (!controller.signal.aborted) {
        setStatus('idle');
        options.onFinish?.(fullText);
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        setStatus('idle');
        return;
      }
      
      setError(err);
      setStatus('error');
      options.onError?.(err);
    } finally {
      abortControllerRef.current = null;
    }
  }, [input, options, stop]);

  return {
    input,
    setInput,
    completion,
    isLoading: status === 'submitted' || status === 'streaming',
    status,
    error,
    complete,
    stop,
    reset,
  };
}