import type { MedicalGroundingSource } from '../types';

export function compactWhitespace(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function clipText(raw: string, maxChars: number): string {
  const text = compactWhitespace(raw);
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 30000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'GuruStudyApp/1.0 (https://guru.study; help@guru.study)',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => String(res.status));
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const name = error instanceof Error ? error.name : '';
    if (name === 'AbortError' || /aborted/i.test(message)) {
      const timeoutError = new Error(`Timeout after ${timeoutMs}ms`);
      timeoutError.name = 'TimeoutError';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function describeMedicalSearchError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') return error.message;
    return error.message;
  }
  return String(error);
}

export function renderSourcesForPrompt(sources: MedicalGroundingSource[]): string {
  return sources
    .map((src: MedicalGroundingSource, idx: number) => {
      const published = src.publishedAt
        ? `Published: ${src.publishedAt}`
        : 'Published: unknown date';
      const journal = src.journal ? `Journal: ${src.journal}` : 'Journal: not listed';
      return `[S${idx + 1}]
Title: ${src.title}
Source: ${src.source}
${published}
${journal}
URL: ${src.url}
Snippet: ${src.snippet}`;
    })
    .join('\n\n');
}
