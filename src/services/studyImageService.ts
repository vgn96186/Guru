import { generateImage } from './ai/imageGeneration';
import { generatedStudyImagesRepositoryDrizzle as repo } from '../db/repositories';
import type {
  GeneratedStudyImageContextType,
  GeneratedStudyImageRecord,
  GeneratedStudyImageStyle,
} from '../db/queries/generatedStudyImages';

export interface BuildStudyImagePromptInput {
  topicName: string;
  sourceText: string;
  style: GeneratedStudyImageStyle;
}

export interface GenerateStudyImageInput extends BuildStudyImagePromptInput {
  contextType: GeneratedStudyImageContextType;
  contextKey: string;
  topicId?: number | null;
  lectureNoteId?: number | null;
}

function compactText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Strips chat/markdown noise and shortens Guru reply text so image models condition on
 * factual content instead of Socratic questions or formatting.
 */
export function extractVisualBriefForImage(sourceText: string, maxLen = 520): string {
  let t = sourceText
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '');

  const blocks = t
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  t = blocks.slice(0, 8).join(' ');
  t = t.replace(/\s+/g, ' ').trim();

  if (t.length > maxLen) {
    t = `${t
      .slice(0, maxLen - 1)
      .replace(/\s+\S*$/, '')
      .trim()}…`;
  }
  return t;
}

export function buildStudyImagePrompt(input: BuildStudyImagePromptInput): string {
  const topic = compactText(input.topicName);
  const brief = extractVisualBriefForImage(input.sourceText);

  const safety =
    'Educational schematic for exam revision only — not for clinical diagnosis or treatment. ' +
    'If the brief is vague, draw a simple labeled generic diagram of the topic instead of inventing details. ' +
    'Ensure all text labels are spelled correctly in English and clearly legible. Do NOT generate gibberish or fake words.';

  if (input.style === 'chart') {
    return [
      `NEET-PG / INICET study diagram (chart style) for topic: ${topic}.`,
      safety,
      'Style: white or very light background, black/dark line art, simple boxes and arrows, minimal text labels (short phrases only).',
      'Show one pathway, mechanism, or relationship map — not a collage, not a poster, not photorealistic.',
      'Do not include: faces, patients, hospital photos, gore, humor, fantasy, surreal art, logos, watermarks, decorative borders.',
      'High resolution, sharp text, clean typography.',
      `Content to depict (from tutor material): ${brief}`,
    ].join(' ');
  }

  return [
    `NEET-PG / INICET medical education illustration for topic: ${topic}.`,
    safety,
    'Style: clean textbook / lecture-slide diagram — flat, schematic, one main concept. Grayscale or soft color; avoid artistic rendering.',
    'Prefer simple cross-section, pathway, or organ schematic with sparse labels. No photorealistic skin, no stock-photo look.',
    'Do not include: faces, gore, unrelated symbols, invented drug packaging, brand logos, watermarks, meme style.',
    'High resolution, sharp text, clean typography.',
    `Content to depict (from tutor material): ${brief}`,
  ].join(' ');
}

export async function generateStudyImage(
  input: GenerateStudyImageInput,
): Promise<GeneratedStudyImageRecord> {
  const prompt = buildStudyImagePrompt(input);
  const generated = await generateImage(prompt, {
    steps: input.style === 'chart' ? 28 : 24,
  });

  return repo.saveGeneratedStudyImage({
    contextType: input.contextType,
    contextKey: input.contextKey,
    topicId: input.topicId ?? null,
    topicName: input.topicName,
    lectureNoteId: input.lectureNoteId ?? null,
    style: input.style,
    prompt,
    provider: generated.provider,
    modelUsed: generated.modelUsed,
    mimeType: generated.mimeType,
    localUri: generated.uri,
  });
}

export function buildChatImageContextKey(topicName: string, timestamp: number): string {
  return `${topicName}:${timestamp}`;
}
