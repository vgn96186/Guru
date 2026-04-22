/**
 * notifications — public API preserved; implementation delegates to the v2
 * `guruNotificationTools` so there is ONE LLM path per capability.
 *
 * Fallback arrays stay here because they're pure business constants that
 * must work whether or not the LLM path works.
 */

import { wakeUpMessageTool, breakEndMessagesTool } from './v2/tools/notificationTools';
import { invokeTool } from './v2/toolRunner';

const FALLBACK_WAKE_UP = {
  title: 'Good Morning, Doctor. 🌅',
  body: 'Time to rise and build some momentum. Tap here to wake up.',
};

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
  return invokeTool(wakeUpMessageTool, {
    input: {},
    tag: 'wakeUpMessage',
    fallback: () => FALLBACK_WAKE_UP,
  });
}

export async function generateBreakEndMessages(): Promise<string[]> {
  const result = await invokeTool(breakEndMessagesTool, {
    input: {},
    tag: 'breakEndMessages',
    fallback: () => ({ messages: FALLBACK_BREAK_MESSAGES }),
  });
  return result.messages.length >= 5 ? result.messages : FALLBACK_BREAK_MESSAGES;
}
