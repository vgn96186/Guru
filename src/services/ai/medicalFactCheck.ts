import type { AIContent, ContentType } from '../../types';
import { InteractionManager } from 'react-native';
import { extractMedicalEntities, extractClaims } from './medicalEntities';
import { getLectureHistory } from '../../db/queries/aiCache';
import { searchLatestMedicalSources } from './medicalSearch';
import { setContentFlagged, isContentFlagged } from '../../db/queries/aiCache';
// NOTE: logFactCheckResult is a stub until Task 3 (contentFlags.ts) is implemented.
// Fact-checking runs but results are not persisted yet.
import { logFactCheckResult } from '../../db/queries/contentFlags';

const SIMILARITY_THRESHOLD = 0.3;

export interface TrustedSource {
  source: string;
  text: string;
}

export interface Contradiction {
  claim: string;
  trustedSource: string;
  trustedText: string;
  similarity: number;
}

/**
 * Extract all text content from an AIContent object as a single string.
 */
function extractContentText(content: AIContent): string {
  const parts: string[] = [];

  if ('points' in content && Array.isArray(content.points)) {
    parts.push(...content.points);
  }
  if ('memoryHook' in content && content.memoryHook) {
    parts.push(content.memoryHook);
  }
  if ('mustKnow' in content && Array.isArray(content.mustKnow)) {
    parts.push(...content.mustKnow);
  }
  if ('examTip' in content && content.examTip) {
    parts.push(content.examTip);
  }
  if ('questions' in content && Array.isArray(content.questions)) {
    for (const q of content.questions) {
      if ('question' in q) parts.push(q.question);
      if ('explanation' in q) parts.push(q.explanation);
      if ('options' in q && Array.isArray(q.options)) parts.push(...q.options);
    }
  }
  if ('story' in content && content.story) {
    parts.push(content.story);
  }
  if ('keyConceptHighlights' in content && Array.isArray(content.keyConceptHighlights)) {
    parts.push(...content.keyConceptHighlights);
  }
  if ('mnemonic' in content && content.mnemonic) {
    parts.push(content.mnemonic);
  }
  if ('expansion' in content && Array.isArray(content.expansion)) {
    parts.push(...content.expansion);
  }
  if ('prompt' in content && content.prompt) {
    parts.push(content.prompt);
  }
  if ('keyPointsToMention' in content && Array.isArray(content.keyPointsToMention)) {
    parts.push(...content.keyPointsToMention);
  }
  if ('guruReaction' in content && content.guruReaction) {
    parts.push(content.guruReaction);
  }
  if ('paragraph' in content && content.paragraph) {
    parts.push(content.paragraph);
  }
  if ('errors' in content && Array.isArray(content.errors)) {
    for (const e of content.errors) {
      if (e.wrong) parts.push(e.wrong);
      if (e.correct) parts.push(e.correct);
      if (e.explanation) parts.push(e.explanation);
    }
  }
  if ('clues' in content && Array.isArray(content.clues)) {
    parts.push(...content.clues);
  }
  if ('answer' in content && content.answer) {
    parts.push(content.answer);
  }
  if ('explanation' in content && content.explanation) {
    parts.push(content.explanation);
  }
  if ('cards' in content && Array.isArray(content.cards)) {
    for (const c of content.cards) {
      if (c.front) parts.push(c.front);
      if (c.back) parts.push(c.back);
    }
  }

  return parts.join('\n');
}

/**
 * Calculate Jaccard similarity between two texts (word overlap / union).
 */
export function calculateTextSimilarity(text1: string, text2: string): number {
  const t1 = text1.trim().toLowerCase();
  const t2 = text2.trim().toLowerCase();
  if (!t1 || !t2) return 0;

  const words1 = new Set(t1.split(/\s+/));
  const words2 = new Set(t2.split(/\s+/));
  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Detect contradictions between AI claims and trusted sources.
 * Flagged when similarity is between 0.3 and 0.85 (same topic but different specifics).
 */
export function detectContradictions(
  aiClaims: Array<{ sentence: string; entities: string[] }>,
  trustedSources: TrustedSource[],
): Contradiction[] {
  const contradictions: Contradiction[] = [];

  for (const claim of aiClaims) {
    for (const source of trustedSources) {
      const similarity = calculateTextSimilarity(claim.sentence, source.text);

      if (similarity > SIMILARITY_THRESHOLD && similarity < 0.85) {
        contradictions.push({
          claim: claim.sentence,
          trustedSource: source.source,
          trustedText: source.text,
          similarity,
        });
      }
    }
  }

  return contradictions;
}

/**
 * Get trusted sources for a given topic (DBMCI/BTR transcripts + medical search).
 */
async function getTrustedSources(
  entities: ReturnType<typeof extractMedicalEntities>,
  subjectName: string,
): Promise<TrustedSource[]> {
  const sources: TrustedSource[] = [];

  // 1. DBMCI/BTR lecture transcripts
  try {
    const history = await getLectureHistory(50);
    const relevantTranscripts = history
      .filter((h) => {
        const text = `${h.note} ${h.summary ?? ''} ${h.transcript ?? ''}`.toLowerCase();
        return (
          entities.drugs.some((d) => text.includes(d)) ||
          entities.diseases.some((d) => text.includes(d))
        );
      })
      .slice(0, 3)
      .map((h) => ({
        source: h.appName ?? 'Lecture',
        text: `${h.note} ${h.summary ?? ''}`,
      }));

    sources.push(...relevantTranscripts);
  } catch {
    // Non-critical -- proceed without lecture transcripts
  }

  // 2. Wikipedia/PubMed via medical search
  if (entities.drugs.length > 0 || entities.diseases.length > 0) {
    try {
      const searchQuery = [...entities.drugs.slice(0, 3), ...entities.diseases.slice(0, 3)].join(
        ' ',
      );
      const searchResults = await searchLatestMedicalSources(`${searchQuery} ${subjectName}`, 3);
      const wikiSources = searchResults.map((s) => ({
        source: s.source,
        text: `${s.title} ${s.snippet}`,
      }));
      sources.push(...wikiSources);
    } catch {
      // Non-critical
    }
  }

  return sources;
}

/**
 * Run medical fact-check for generated content.
 * Called in background after content is cached.
 */
export async function runMedicalFactCheck(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  subjectName: string = '',
): Promise<void> {
  try {
    const contentText = extractContentText(content);
    const entities = extractMedicalEntities(contentText);
    const claims = extractClaims(contentText, entities.drugs, entities.diseases);

    if (entities.drugs.length === 0 && entities.diseases.length === 0) {
      await logFactCheckResult(topicId, contentType, 'inconclusive', []);
      return;
    }

    const trustedSources = await getTrustedSources(entities, subjectName);

    if (trustedSources.length === 0) {
      await logFactCheckResult(topicId, contentType, 'inconclusive', []);
      return;
    }

    const contradictions = detectContradictions(claims, trustedSources);

    const status = contradictions.length > 0 ? 'failed' : 'passed';
    await logFactCheckResult(topicId, contentType, status, contradictions);

    if (contradictions.length > 0) {
      const alreadyFlagged = await isContentFlagged(topicId, contentType);
      if (!alreadyFlagged) {
        await setContentFlagged(topicId, contentType, true);
      }
    }
  } catch (err) {
    if (__DEV__) {
      console.warn('[FactCheck] Error during fact-check:', err);
    }
    await logFactCheckResult(topicId, contentType, 'inconclusive', []);
  }
}

/**
 * Schedule background fact-check (non-blocking).
 */
export function scheduleBackgroundFactCheck(
  topicId: number,
  contentType: ContentType,
  content: AIContent,
  subjectName: string = '',
): void {
  InteractionManager.runAfterInteractions(async () => {
    try {
      await runMedicalFactCheck(topicId, contentType, content, subjectName);
    } catch (err) {
      if (__DEV__) {
        console.warn('[FactCheck] Background check failed:', err);
      }
    }
  });
}
