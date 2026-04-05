import { z } from 'zod';
import {
  logJsonParseFailure,
  logJsonParseSuccess,
  logJsonParseSummary,
  previewText,
} from './runtimeDebug';

// Timeout for JSON repair operations (ms)
const JSON_REPAIR_TIMEOUT = 5000;

// Limit input size to prevent DoS
const MAX_INPUT_SIZE = 100_000; // 100KB

function stripJsonCodeFences(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();
}

function extractBalancedJson(raw: string): string {
  const objectStart = raw.indexOf('{');
  const arrayStart = raw.indexOf('[');
  const start =
    objectStart === -1
      ? arrayStart
      : arrayStart === -1
        ? objectStart
        : Math.min(objectStart, arrayStart);

  if (start === -1) return raw.trim();

  const stack: string[] = [];
  let inString = false;
  let quoteChar = '';
  let escaped = false;

  for (let i = start; i < raw.length; i += 1) {
    const char = raw[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === quoteChar) {
        inString = false;
        quoteChar = '';
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === '{') stack.push('}');
    else if (char === '[') stack.push(']');
    else if ((char === '}' || char === ']') && stack.length > 0) {
      const expected = stack.pop();
      if (char !== expected) return raw.slice(start).trim();
      if (stack.length === 0) {
        return raw.slice(start, i + 1).trim();
      }
    }
  }

  return raw.slice(start).trim();
}

function repairCommonJsonIssues(raw: string): string {
  let s = raw
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes -> regular
    .replace(/[\u2018\u2019]/g, "'") // Smart single quotes -> regular
    .replace(/^json\s*/i, ''); // Strip leading "json" prefix

  // Phase 1: Protect existing double-quoted strings with placeholders
  const strings: string[] = [];
  s = s.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
    strings.push(match);
    return `\x00S${strings.length - 1}\x00`;
  });

  // Phase 2: Structural repairs (no double-quoted strings present, safe to regex)

  // Strip // line comments (non-greedy to avoid ReDoS)
  s = s.replace(/\/\/[^\n]*/g, '');

  // Fix single-quoted keys: { 'key': value }
  s = s.replace(
    /([{,]\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(\s*:)/g,
    (_m: string, pre: string, key: string, suf: string) =>
      `${pre}"${key.replace(/"/g, '\\"')}"${suf}`,
  );

  // Fix single-quoted values: : 'value'
  s = s.replace(
    /(:\s*)'([^'\\]*(?:\\.[^'\\]*)*)'(?=\s*[,}\]\x00])/g,
    (_m: string, pre: string, val: string) => `${pre}"${val.replace(/"/g, '\\"')}"`,
  );

  // Fix unquoted keys (now safe - real strings are placeholders so won't be corrupted)
  s = s.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)(\s*:)/g, '$1"$2"$3');

  // Insert missing commas between properties:
  //   placeholder or } or ] or digit at end, then newline, then placeholder or "key"
  s = s.replace(/(\x00)(\s*\n\s*)(\x00|")/g, '$1,$2$3');
  s = s.replace(/([\]}\d])(\s*\n\s*)(\x00|")/g, '$1,$2$3');
  s = s.replace(/(true|false|null)(\s*\n\s*)(\x00|")/g, '$1,$2$3');

  // Fix trailing commas
  s = s.replace(/,\s*([}\]])/g, '$1');

  // Phase 3: Restore original strings
  s = s.replace(/\x00S(\d+)\x00/g, (_: string, idx: string) => strings[parseInt(idx, 10)]);

  return s.trim();
}

function repairTruncatedJson(raw: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  if (stack.length === 0) return raw;

  // If we were inside an unclosed string, close it first
  let suffix = inString ? '"' : '';
  // Close all open braces/brackets in reverse order
  while (stack.length > 0) suffix += stack.pop();
  return raw + suffix;
}

export function normalizeRootForSchema<T>(value: unknown, schema: z.ZodType<T>): unknown {
  if (!value) return value;

  // Pattern 0: Single-element array wrapping ([{ ... }])
  if (Array.isArray(value) && value.length === 1) {
    return normalizeRootForSchema(value[0], schema);
  }

  if (typeof value !== 'object' || Array.isArray(value)) return value;

  const v = value as Record<string, any>;
  const entries = Object.entries(v);

  // Pattern 1: Single-key wrapping ({ "keypoints": { ... } } or { "subdural_hematoma": { ... } })
  if (entries.length === 1) {
    const [key, wrappedValue] = entries[0];

    // If it's an object with a 'type' property inside, unwrap
    if (wrappedValue && typeof wrappedValue === 'object' && !Array.isArray(wrappedValue)) {
      if ('type' in (wrappedValue as any)) return wrappedValue;

      // Heuristic: if the inner object has keys that we'd expect in medical responses, unwrap.
      // This handles cases where the key is the topic name (e.g. { "subdural_hematoma": { "centerLabel": ... } })
      const innerKeys = Object.keys(wrappedValue);
      const isLikelyMindMap = innerKeys.some((k) =>
        ['centerLabel', 'center_label', 'nodes'].includes(k),
      );
      const isLikelyQuiz = innerKeys.some((k) => ['questions', 'quiz'].includes(k.toLowerCase()));
      const isLikelyContent = innerKeys.some((k) =>
        ['paragraph', 'keypoints', 'mnemonics'].includes(k.toLowerCase()),
      );

      if (isLikelyMindMap || isLikelyQuiz || isLikelyContent) {
        return wrappedValue;
      }
    }

    // Un-wrap common generic keys
    const genericKeys = [
      'data',
      'result',
      'payload',
      'card',
      'content',
      'items',
      'mind_map',
      'mindmap',
      'map',
      'brain_map',
      'response',
    ];
    if (genericKeys.includes(key.toLowerCase())) {
      return wrappedValue;
    }
  }

  // Pattern 2: Normalizing common snake_case/kebab-case property names from flaky LLMs
  // This is a "best effort" pass to help Zod validation succeed on key-value pairs.
  const normalized: Record<string, any> = {};
  for (const [k, val] of Object.entries(v)) {
    // Map snake_case or kebab-case to camelCase for the expected schema fields
    const camelKey = k.replace(/[_-][a-z]/g, (match) => match[1].toUpperCase());
    normalized[camelKey] = val;

    // Also keep the original key just in case it was already correct or needed
    if (camelKey !== k) {
      normalized[k] = val;
    }

    // Special case for "type": make lowercase to match Zod z.literal()
    if (k.toLowerCase() === 'type' && typeof val === 'string') {
      normalized['type'] = val.toLowerCase();
    }
  }

  return normalized;
}

/**
 * Parse structured JSON with timeout protection.
 * Wraps the parsing logic in a timeout to prevent ReDoS hangs.
 */
async function parseStructuredJsonWithTimeout<T>(
  raw: string,
  schema: z.ZodType<T>,
  timeoutMs: number = JSON_REPAIR_TIMEOUT,
): Promise<T> {
  return Promise.race([
    (async () => {
      // Size limit check
      if (raw.length > MAX_INPUT_SIZE) {
        throw new Error(
          `Input too large for JSON repair: ${raw.length} bytes (max ${MAX_INPUT_SIZE})`,
        );
      }

      const cleaned = stripJsonCodeFences(raw);
      const extracted = extractBalancedJson(cleaned);

      const candidates = Array.from(
        new Set(
          [
            cleaned,
            extracted,
            repairCommonJsonIssues(cleaned),
            repairCommonJsonIssues(extracted),
            // Also try repairing truncated JSON (local model can hit token limit)
            repairCommonJsonIssues(repairTruncatedJson(cleaned)),
            repairCommonJsonIssues(repairTruncatedJson(extracted)),
          ].filter(Boolean),
        ),
      );

      logJsonParseSummary({
        rawLength: raw.length,
        candidateCount: candidates.length,
        preview: previewText(raw, 180),
      });

      let lastError: Error | null = null;
      for (const [candidateIndex, candidate] of candidates.entries()) {
        try {
          const json = JSON.parse(candidate);
          const normalized = normalizeRootForSchema(json, schema);
          if (__DEV__ && candidateIndex === 0) {
            console.info(
              '[AI_PARSE] candidate 0 normalized keys:',
              Object.keys(normalized as object),
            );
          }
          const parsed = schema.parse(normalized);
          logJsonParseSuccess({ candidateIndex, candidateLength: candidate.length });
          return parsed;
        } catch (err) {
          if (err instanceof z.ZodError && (err as any).rawText === undefined) {
            (err as any).rawText = raw; // Attach for the generator's trace.fail
          }
          lastError = err as Error;
        }
      }

      logJsonParseFailure({
        candidateCount: candidates.length,
        candidateLengths: candidates.map((c) => c.length),
        error: lastError?.message,
      });

      throw lastError || new Error('Failed to parse structured JSON response');
    })(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('JSON parsing timeout')), timeoutMs),
    ),
  ]) as Promise<T>;
}

export async function parseStructuredJson<T>(raw: string, schema: z.ZodType<T>): Promise<T> {
  try {
    return await parseStructuredJsonWithTimeout(raw, schema);
  } catch (err) {
    if (err instanceof Error && err.message === 'JSON parsing timeout') {
      throw new Error('JSON repair took too long - possible ReDoS attack or malformed input');
    }
    throw err;
  }
}
