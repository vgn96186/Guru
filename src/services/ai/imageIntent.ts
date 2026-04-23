import { type ChatMessage } from '../../types/chat';
import { getApiKeys } from '../ai';

export type GeneratedStudyImageStyle = 'chart' | 'illustration';

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

  if (directVisualNouns.test(normalized) && visualActionVerbs.test(normalized)) {
    return true;
  }

  if (seePhrases.test(normalized)) {
    return true;
  }

  if (anatomyStylePhrases.test(normalized)) {
    return true;
  }

  return /\bwhat does (it|this|that|[a-z][a-z\s-]{2,60}) look like\b/i.test(normalized);
}

export function inferRequestedImageStyle(text: string): GeneratedStudyImageStyle {
  return /(chart|flowchart|pathway|algorithm|mechanism|map|table|compare|comparison)/i.test(text)
    ? 'chart'
    : 'illustration';
}

export function canAutoGenerateStudyImage(
  profile?: {
    geminiKey?: string;
    cloudflareAccountId?: string;
    cloudflareApiToken?: string;
    openrouterKey?: string;
    falApiKey?: string;
    groqApiKey?: string;
    huggingFaceToken?: string;
    braveSearchApiKey?: string;
    deepseekKey?: string;
    githubModelsPat?: string;
    kiloApiKey?: string;
    agentRouterKey?: string;
    deepgramApiKey?: string;
    chatgptConnected?: boolean;
  } | null,
): boolean {
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
