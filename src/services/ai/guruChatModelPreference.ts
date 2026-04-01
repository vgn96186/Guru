/**
 * Guru Chat default model id persisted in Settings (`user_profile.guru_chat_default_model`).
 * Ids match `GuruChatScreen` model picker: `auto`, `local`, `groq/...`, `chatgpt/...`,
 * `github/{publisher}/{model}`, `github_copilot/...`, `gitlab_duo/...`, `poe/...`,
 * OpenRouter slug, `gemini/...`, `cf/...`, `deepseek/...`, `ar/...`, `kilo/...`.
 */

export function coerceGuruChatDefaultModel(
  saved: string | undefined | null,
  availableModelIds: string[],
): string {
  const allow = new Set(availableModelIds);
  const s = (saved ?? '').trim();
  if (!s || s === 'auto') return 'auto';
  if (allow.has(s)) return s;
  return 'auto';
}

/** Short label for a chip in Settings (not for chat header). */
export function formatGuruChatModelChipLabel(modelId: string): string {
  if (modelId === 'auto') return 'Auto';
  if (modelId === 'local') return 'On-device';
  if (modelId.startsWith('groq/')) {
    const m = modelId.slice(5);
    return m.length > 22 ? `${m.slice(0, 20)}…` : m;
  }
  if (modelId.startsWith('gemini/')) {
    const m = modelId.slice(7);
    return m.length > 22 ? `${m.slice(0, 20)}…` : m;
  }
  if (modelId.startsWith('cf/')) {
    const tail = modelId.split('/').pop() ?? modelId;
    return tail.length > 24 ? `${tail.slice(0, 22)}…` : tail;
  }
  if (modelId.startsWith('github/')) {
    const rest = modelId.slice('github/'.length);
    return rest.length > 26 ? `${rest.slice(0, 24)}…` : rest;
  }
  if (modelId.startsWith('github_copilot/')) {
    const m = modelId.slice('github_copilot/'.length);
    return m.length > 22 ? `${m.slice(0, 20)}…` : m;
  }
  if (modelId.startsWith('gitlab_duo/')) {
    const m = modelId.slice('gitlab_duo/'.length);
    return m.length > 22 ? `${m.slice(0, 20)}…` : m;
  }
  if (modelId.startsWith('poe/')) {
    const m = modelId.slice('poe/'.length);
    return m.length > 22 ? `${m.slice(0, 20)}…` : m;
  }
  if (modelId.includes('/')) {
    const parts = modelId.split('/');
    const rest = parts[1] ?? modelId;
    const base = rest.split(':')[0] ?? rest;
    return base.length > 22 ? `${base.slice(0, 20)}…` : base;
  }
  return modelId.length > 24 ? `${modelId.slice(0, 22)}…` : modelId;
}

/** Display title for Guru Chat model picker (matches previous inline logic). */
export function guruChatPickerNameForGroqModel(model: string): string {
  return model.includes('/')
    ? model.split('/').pop()!.replace(/-/g, ' ').toUpperCase()
    : model.split('-').slice(0, 2).join(' ').toUpperCase();
}

export function guruChatPickerNameForOpenRouterSlug(slug: string): string {
  return slug.split('/')[1]?.split(':')[0]?.toUpperCase() ?? slug.toUpperCase();
}

export function guruChatPickerNameForGeminiModel(model: string): string {
  return model.toUpperCase();
}

export function guruChatPickerNameForCfModel(model: string): string {
  return model.split('/').pop()!.toUpperCase();
}

/** `publisher/model` id after `github/` prefix (GitHub Models inference API). */
export function guruChatPickerNameForGithubModel(modelId: string): string {
  const m = modelId.includes('/') ? modelId : modelId;
  return m.replace(/\//g, ' · ').toUpperCase();
}
