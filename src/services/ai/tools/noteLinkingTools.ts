// @ts-nocheck — AI SDK v6 migration stub
import { tool } from 'ai';
import { z } from 'zod';

export const tagNoteTool = tool({
  description: 'Tag a note with semantic labels',
  inputSchema: z.object({
    noteId: z.number(),
    tags: z.array(z.string()),
  }),
});
