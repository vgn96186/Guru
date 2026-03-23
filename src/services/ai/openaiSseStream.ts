/**
 * Incremental parser for OpenAI-compatible chat completion SSE streams.
 * Uses fetch + ReadableStream only (no extra dependencies).
 */

/** Extract text deltas from one SSE event block (content between blank lines). */
export function consumeSseEventBlock(block: string): { texts: string[]; sawDone: boolean } {
  const texts: string[] = [];
  let sawDone = false;
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') {
      sawDone = true;
      continue;
    }
    try {
      const json = JSON.parse(payload);
      const ch0 = json?.choices?.[0];
      const piece =
        (typeof ch0?.delta?.content === 'string' && ch0.delta.content) ||
        (typeof ch0?.message?.content === 'string' && ch0.message.content) ||
        (typeof ch0?.delta?.reasoning === 'string' && ch0.delta.reasoning) ||
        (typeof ch0?.delta?.reasoning_content === 'string' && ch0.delta.reasoning_content) ||
        '';
      if (piece.length) {
        texts.push(piece);
      }
    } catch {
      // ignore malformed JSON lines
    }
  }
  return { texts, sawDone };
}

/**
 * Reads an HTTP response body as an OpenAI-style SSE stream and accumulates assistant text.
 * Invokes onDelta for each token chunk.
 */
export async function readOpenAiCompatibleSse(
  response: Response,
  onDelta: (delta: string) => void,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming unavailable: response has no readable body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }
    if (done) {
      buffer += decoder.decode();
    }

    let boundary: number;
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const { texts, sawDone } = consumeSseEventBlock(rawEvent);
      for (const t of texts) {
        full += t;
        onDelta(t);
      }
      if (sawDone) {
        return full;
      }
    }

    if (done) {
      if (buffer.trim()) {
        const { texts } = consumeSseEventBlock(buffer);
        for (const t of texts) {
          full += t;
          onDelta(t);
        }
      }
      return full;
    }
  }
}
