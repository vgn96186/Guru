import type { Content, Part } from '@google/genai';
import type { Message } from '../types';

function messageToParts(m: Message): Part[] {
  const parts: Part[] = [];
  if (m.content.trim()) {
    parts.push({ text: m.content });
  }
  for (const p of m.parts ?? []) {
    if (p.type === 'text') {
      parts.push({ text: p.text });
    } else if (p.type === 'inline_image') {
      parts.push({
        inlineData: { mimeType: p.mimeType, data: p.base64Data },
      });
    }
  }
  if (parts.length === 0) {
    parts.push({ text: '' });
  }
  return parts;
}

/**
 * Maps OpenAI-style chat messages to Gemini `contents` + optional `systemInstruction`.
 * When `Message.parts` is set (e.g. inline image), Gemini receives multimodal `parts`; other
 * providers still use `content` only via their adapters.
 */
export function messagesToGeminiContents(messages: Message[]): {
  systemInstruction?: string;
  contents: Content[] | string;
} {
  const systemChunks: string[] = [];
  const turns: Message[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      systemChunks.push(m.content);
    } else {
      turns.push(m);
    }
  }

  const systemInstruction = systemChunks.length > 0 ? systemChunks.join('\n\n') : undefined;

  if (turns.length === 0) {
    return {
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: ' ' }] }],
    };
  }

  const contents: Content[] = turns.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: messageToParts(m),
  }));

  return { systemInstruction, contents };
}
