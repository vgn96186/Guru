import { generateImage } from './ai/imageGeneration';
import {
  saveGeneratedStudyImage,
  type GeneratedStudyImageContextType,
  type GeneratedStudyImageRecord,
  type GeneratedStudyImageStyle,
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
  return text.replace(/\s+/g, ' ').trim().slice(0, 1200);
}

export function buildStudyImagePrompt(input: BuildStudyImagePromptInput): string {
  const topic = compactText(input.topicName);
  const source = compactText(input.sourceText);

  if (input.style === 'chart') {
    return [
      `Create a clean NEET-PG study chart for ${topic}.`,
      'Use a white background, exam-focused labeling, simple arrows, and minimal clutter.',
      'Prefer a concise medical flowchart or concept map with high-yield relationships.',
      'Avoid decorative text blocks, watermarks, logos, and irrelevant anatomy.',
      `Source material: ${source}`,
    ].join(' ');
  }

  return [
    `Create a clear medical illustration for NEET-PG revision on ${topic}.`,
    'Use educational textbook style, accurate anatomy/pathophysiology, and one focal concept.',
    'Keep labels sparse and high-yield. Avoid brand marks, watermarks, and unnecessary background detail.',
    `Source material: ${source}`,
  ].join(' ');
}

export async function generateStudyImage(
  input: GenerateStudyImageInput,
): Promise<GeneratedStudyImageRecord> {
  const prompt = buildStudyImagePrompt(input);
  const generated = await generateImage(prompt, {
    steps: input.style === 'chart' ? 6 : 4,
  });

  return saveGeneratedStudyImage({
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
