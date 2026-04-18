import type { z } from 'zod';
import type { ProviderId } from '../../types';
import type { Message } from './types';
import type { ToolSet } from './v2/tool';
import { generateJSONV2, generateTextStreamV2, generateTextV2 } from './v2/compat';

type RoutingArgs = {
  chosenModel?: string;
  providerOrderOverride?: ProviderId[];
  tools?: ToolSet;
};

function normalizeRoutingArgs(args: unknown[]): RoutingArgs {
  const parsed: RoutingArgs = {};

  for (const arg of args) {
    if (!arg) continue;

    if (Array.isArray(arg)) {
      parsed.providerOrderOverride = arg.filter(
        (value): value is ProviderId => typeof value === 'string' && value.length > 0,
      );
      continue;
    }

    if (typeof arg === 'string') {
      if (arg === 'low' || arg === 'medium' || arg === 'high') {
        continue;
      }

      if (arg.includes('/')) {
        parsed.chosenModel = arg;
        continue;
      }

      parsed.providerOrderOverride = [arg as ProviderId];
      continue;
    }

    if (typeof arg === 'object') {
      parsed.tools = arg as ToolSet;
    }
  }

  return parsed;
}

export async function generateTextWithRouting(
  messages: Message[],
  ...legacyArgs: unknown[]
): Promise<{ text: string; modelUsed: string }> {
  return generateTextV2(messages, normalizeRoutingArgs(legacyArgs));
}

export async function generateTextWithRoutingStream(
  messages: Message[],
  onDelta: (delta: string) => void,
  ...legacyArgs: unknown[]
): Promise<{ text: string; modelUsed: string }> {
  return generateTextStreamV2(messages, onDelta, normalizeRoutingArgs(legacyArgs));
}

export async function generateJSONWithRouting<T>(
  messages: Message[],
  schema: z.ZodType<T>,
  ...legacyArgs: unknown[]
): Promise<{ parsed: T; object: T; modelUsed: string }> {
  const { object, modelUsed } = await generateJSONV2(
    messages,
    schema,
    normalizeRoutingArgs(legacyArgs),
  );

  return { parsed: object, object, modelUsed };
}
