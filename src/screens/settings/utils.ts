import { GITHUB_COPILOT_MODELS, GITLAB_DUO_MODELS } from '../../config/appConfig';
import type { ChatGptAccountSlot } from '../../types';
import type { ApiValidationState, ChatGptAccountSettings } from './types';

export function sanitizeGithubCopilotPreferredModel(value: string): string {
  const t = value.trim();
  if (!t) return '';
  return (GITHUB_COPILOT_MODELS as readonly string[]).includes(t) ? t : '';
}

export function sanitizeGitlabDuoPreferredModel(value: string): string {
  const t = value.trim();
  if (!t) return '';
  return (GITLAB_DUO_MODELS as readonly string[]).includes(t) ? t : '';
}

export function defaultChatGptAccountSettings(): ChatGptAccountSettings {
  return {
    primary: { enabled: true, connected: false },
    secondary: { enabled: false, connected: false },
  };
}

export function sanitizeChatGptAccountSettings(value: unknown): ChatGptAccountSettings {
  const fallback = defaultChatGptAccountSettings();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const root = value as Record<string, unknown>;
  const readSlot = (slot: ChatGptAccountSlot) => {
    const raw = root[slot];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback[slot];
    const record = raw as Record<string, unknown>;
    return {
      enabled: typeof record.enabled === 'boolean' ? record.enabled : fallback[slot].enabled,
      connected:
        typeof record.connected === 'boolean' ? record.connected : fallback[slot].connected,
    };
  };
  return {
    primary: readSlot('primary'),
    secondary: readSlot('secondary'),
  };
}

export function isChatGptEnabled(settings: ChatGptAccountSettings): boolean {
  return (
    (settings.primary.enabled && settings.primary.connected) ||
    (settings.secondary.enabled && settings.secondary.connected)
  );
}

export function fingerprintSecret(secret: string): string {
  // Lightweight stable fingerprint so we never persist raw secret copies.
  let hash = 5381;
  for (let i = 0; i < secret.length; i += 1) {
    hash = (hash * 33) ^ secret.charCodeAt(i);
  }
  return `fp_${(hash >>> 0).toString(16)}`;
}

export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function sanitizeApiValidationState(value: unknown): ApiValidationState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as ApiValidationState;
}

export function hasValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Unknown error';
}
