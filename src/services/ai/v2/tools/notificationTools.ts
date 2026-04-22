/**
 * Notification tools — LLM-powered wake-up and break-end messages.
 *
 * Canonical home for what used to live inline in `notifications.ts`.
 * `notifications.ts` now delegates here via `invokeTool`.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { profileRepository } from '../../../../db/repositories/profileRepository';
import { NON_STUDY_PROVIDER_ORDER } from '../../../../types';
import { createGuruFallbackModel } from '../providers/guruFallback';
import { generateObject } from '../generateObject';
import { generateText } from '../generateText';

const WakeUpSchema = z.object({
  title: z.string().describe('Short notification title'),
  body: z.string().describe('Body text; concise'),
});

export const wakeUpMessageTool = tool({
  name: 'wake_up_message',
  description: 'Generate a short, sharp wake-up notification for a NEET-PG/INICET student.',
  inputSchema: z.object({}),
  execute: async () => {
    const systemPrompt = `You are Guru, an elite medical tutor. A student is waking up for another day of NEET-PG/INI-CET prep.
Generate a short, sharp, and motivating wake-up call. Reference "Doctor" and the morning ahead.
Return JSON: { "title": "...", "body": "..." }`;
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({ profile });
    const { object } = await generateObject({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Wake up call.' },
      ],
      schema: WakeUpSchema,
    });
    return object;
  },
});

export const breakEndMessagesTool = tool({
  name: 'break_end_messages',
  description: 'Generate aggressive one-line reminders to pull the student back from their phone.',
  inputSchema: z.object({}),
  execute: async () => {
    const systemPrompt = `You are Guru, an aggressive medical tutor. A student is on a 5-minute break and likely scrolling Instagram/reels instead of returning to study.
Generate exactly 8 increasingly aggressive, sharp, and sarcastic one-line reminders to get them back to their tablet.
Mention INI-CET/NEET-PG pressure. Be blunt. No JSON, just one message per line.`;
    const userPrompt = `The break is over. They are still on their phone. Give me 8 lines.`;
    const profile = await profileRepository.getProfile();
    const model = createGuruFallbackModel({
      profile,
      forceOrder: NON_STUDY_PROVIDER_ORDER,
    });
    const { text } = await generateText({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && !l.startsWith('[') && !l.startsWith('{'));
    return { messages: lines.slice(0, 9) };
  },
});

export const guruNotificationTools = {
  wake_up_message: wakeUpMessageTool,
  break_end_messages: breakEndMessagesTool,
};
