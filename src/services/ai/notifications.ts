import { z } from 'zod';
import { generateJSONWithRouting, generateTextWithRouting } from './generate';

const FALLBACK_BREAK_MESSAGES = [
  '🚨 BREAK IS OVER. Return to the tablet now.',
  'Are you ignoring me? Close Instagram immediately.',
  'Every second you waste is a lower INICET score.',
  'I told you this would happen. Go back to studying.',
  'Your 5 minutes are up. Stop scrolling.',
  'Get up. Walk to the tablet. Press play.',
  'This is pathetic. Drop the phone.',
  'I will not stop buzzing. Resume the lecture.',
  'Resume the lecture on the tablet to silence me.',
];

export async function generateWakeUpMessage(): Promise<{ title: string; body: string }> {
  const systemPrompt = `You are Guru, an elite medical tutor. A student is waking up for another day of NEET-PG/INI-CET prep.
Generate a short, sharp, and motivating wake-up call. Reference "Doctor" and the morning ahead.
Return JSON: { "title": "...", "body": "..." }`;
  try {
    const { parsed } = await generateJSONWithRouting(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Wake up call.' },
      ],
      z.object({ title: z.string(), body: z.string() }),
      'low',
    );
    return parsed;
  } catch {
    return {
      title: 'Good Morning, Doctor. 🌅',
      body: 'Time to rise and build some momentum. Tap here to wake up.',
    };
  }
}

export async function generateBreakEndMessages(): Promise<string[]> {
  const systemPrompt = `You are Guru, an aggressive medical tutor. A student is on a 5-minute break and likely scrolling Instagram/reels instead of returning to study.
Generate exactly 8 increasingly aggressive, sharp, and sarcastic one-line reminders to get them back to their tablet. 
Mention INI-CET/NEET-PG pressure. Be blunt. No JSON, just one message per line.`;
  const userPrompt = `The break is over. They are still on their phone. Give me 8 lines.`;
  try {
    const { text } = await generateTextWithRouting(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { preferCloud: true },
    );
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 5 && !l.startsWith('[') && !l.startsWith('{'));
    if (lines.length >= 5) return lines.slice(0, 9);
    return FALLBACK_BREAK_MESSAGES;
  } catch {
    return FALLBACK_BREAK_MESSAGES;
  }
}
