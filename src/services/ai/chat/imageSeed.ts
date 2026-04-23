import { clipText } from '../medicalSearch';

export function isLowInformationImagePrompt(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return true;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (normalized.length <= 3) return true;
  // Filter out short conversational/meta requests
  if (
    tokens.length <= 3 &&
    tokens.some((token) =>
      [
        'explain',
        'what',
        'why',
        'how',
        'tell',
        'me',
        'more',
        'yes',
        'no',
        'true',
        'false',
        'ok',
        'okay',
        'thanks',
        'thank',
        'hi',
        'hello',
        'help',
      ].includes(token),
    )
  ) {
    return true;
  }
  // Filter out directional-only
  if (
    tokens.length <= 2 &&
    tokens.every((token) =>
      [
        'left',
        'right',
        'upper',
        'lower',
        'medial',
        'lateral',
        'anterior',
        'posterior',
        'proximal',
        'distal',
        'superior',
        'inferior',
      ].includes(token),
    )
  ) {
    return true;
  }
  return false;
}

export function buildImageSearchSeed(
  question: string,
  topicName: string | undefined,
  history: Array<{ role: 'user' | 'guru'; text: string }>,
): { topic: string; context?: string } | null {
  const trimmedQuestion = question.trim();
  const recentUserPrompt = [...history]
    .reverse()
    .find(
      (entry) =>
        entry.role === 'user' &&
        !isLowInformationImagePrompt(entry.text) &&
        entry.text.trim().length >= 8,
    )
    ?.text.trim();
  const recentGuruReply = [...history]
    .reverse()
    .find((entry) => entry.role === 'guru' && entry.text.trim().length >= 16)
    ?.text.trim();

  if (!isLowInformationImagePrompt(trimmedQuestion)) {
    return {
      topic: (topicName?.trim() || trimmedQuestion).slice(0, 120),
      context: [
        topicName?.trim() ? `Topic: ${topicName.trim()}` : null,
        recentUserPrompt ? `Earlier student question: ${clipText(recentUserPrompt, 220)}` : null,
        recentGuruReply ? `Tutor context: ${clipText(recentGuruReply, 260)}` : null,
        `Latest student message: ${clipText(trimmedQuestion, 160)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (recentUserPrompt) {
    return {
      topic: (topicName?.trim() || recentUserPrompt).slice(0, 120),
      context: [
        topicName?.trim() ? `Topic: ${topicName.trim()}` : null,
        `Earlier student question: ${clipText(recentUserPrompt, 220)}`,
        recentGuruReply ? `Tutor context: ${clipText(recentGuruReply, 260)}` : null,
        `Latest student message: ${clipText(trimmedQuestion, 160)}`,
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  if (topicName?.trim()) {
    return {
      topic: topicName.trim().slice(0, 120),
      context: recentGuruReply
        ? `Topic: ${topicName.trim()}\nTutor context: ${clipText(
            recentGuruReply,
            260,
          )}\nLatest student message: ${clipText(trimmedQuestion, 160)}`
        : `Topic: ${topicName.trim()}\nLatest student message: ${clipText(trimmedQuestion, 160)}`,
    };
  }

  // Fallback: use the question itself if it's substantive AND medical-looking
  if (trimmedQuestion.length >= 12 && /[a-z]{4}/i.test(trimmedQuestion)) {
    return {
      topic: trimmedQuestion.slice(0, 120),
    };
  }

  // Short/generic queries without topic context → skip image search entirely.
  return null;
}

export function isRenderableReferenceImageUrl(url: string | undefined): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return !/\.(pdf|svg|djvu?|tiff?)(?:[?#]|$)/i.test(trimmed);
}
