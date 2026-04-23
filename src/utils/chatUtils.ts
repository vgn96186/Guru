import { getApiKeys } from '../services/ai/config';
import { GeneratedStudyImageStyle } from '../db/queries/generatedStudyImages';
import { ChatMessage } from '../types/chat';

export function getStartersForTopic(topicName: string) {
  return [
    { icon: 'help-circle-outline', text: `Quiz me on ${topicName}` },
    { icon: 'bulb-outline', text: `Explain ${topicName} step by step` },
    { icon: 'alert-circle-outline', text: `${topicName} from the basics` },
    { icon: 'medkit-outline', text: `High-yield points for exam` },
  ];
}

export const FALLBACK_STARTERS = [
  { icon: 'help-circle-outline', text: 'Quiz me on a high-yield topic' },
  { icon: 'bulb-outline', text: 'Walk me through a clinical case' },
  { icon: 'alert-circle-outline', text: 'Quiz me on pharmacology' },
  { icon: 'medkit-outline', text: 'Common exam topic' },
];

export const QUICK_REPLY_OPTIONS = [
  { key: 'explain', label: 'Explain', prompt: 'Explain' },
  { key: 'dont-know', label: "Don't know", prompt: "Don't know" },
  { key: 'change-topic', label: 'Change topic', prompt: 'Change topic' },
  { key: 'quiz-me', label: 'Quiz me', prompt: 'Quiz me' },
  { key: 'continue', label: 'Continue', prompt: 'Continue' },
] as const;

export function isExplicitImageRequest(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  const directVisualNouns =
    /(image|diagram|figure|illustration|chart|flowchart|picture|visual|graphic|sketch|schema|schematic)/i;
  const visualActionVerbs =
    /(show|give|create|generate|make|draw|need|want|send|visuali[sz]e|depict|map|outline)/i;
  const seePhrases =
    /\b(can i see|let me see|show me|help me see|visuali[sz]e this|visuali[sz]e it|draw this|draw it)\b/i;
  const anatomyStylePhrases =
    /\b(show|draw|depict|visuali[sz]e|map|outline)\s+(me\s+)?(the\s+)?([a-z][a-z\s-]{2,80})\b/i;

  return (
    (directVisualNouns.test(normalized) && visualActionVerbs.test(normalized)) ||
    seePhrases.test(normalized) ||
    anatomyStylePhrases.test(normalized) ||
    /\bwhat does (it|this|that|[a-z][a-z\s-]{2,60}) look like\b/i.test(normalized)
  );
}

export function inferRequestedImageStyle(text: string): GeneratedStudyImageStyle {
  return /(chart|flowchart|pathway|algorithm|mechanism|map|table|compare|comparison)/i.test(text)
    ? 'chart'
    : 'illustration';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
export function canAutoGenerateStudyImage(profile: any): boolean {
  const { geminiKey, cfAccountId, cfApiToken, falKey, orKey } = getApiKeys(profile ?? undefined);
  return Boolean(geminiKey || (cfAccountId && cfApiToken) || falKey || orKey);
}

export function getLastUserPrompt(messages: ChatMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return message.text;
  }
  return null;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function getShortModelLabel(modelName?: string | null): string | null {
  return modelName?.split('/').pop() ?? null;
}
