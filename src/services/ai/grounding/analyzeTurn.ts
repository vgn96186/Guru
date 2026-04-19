import { previewText } from '../runtimeDebug';
import type { GroundingBudget, GroundingConfidencePolicy, GroundingDecision, GroundingIntent } from './types';

const SOURCE_SENSITIVE_RE =
  /\b(guideline|guidelines|protocol|protocols|latest|recent|update|updated|management|treatment|treat|dose|dosing|diagnosis|diagnostic|contraindication|contraindications|adverse|side effect|differential|compare|versus|vs\b|evidence|citation|citations|source|sources|study|trial|recommend|recommended|verify|fact check|is this true)\b/i;
const VISUAL_RE =
  /\b(image|images|diagram|diagrams|figure|figures|picture|pictures|photo|photos|visual|show me|show|see|fundus|x-ray|xray|ct|mri|histology|microscopy|gross specimen)\b/i;
const QUIZ_RE = /\b(quiz me|test me|mcq|question me|practice question|viva)\b/i;
const TEACH_RE = /\b(explain|teach|step by step|from the basics|basics|high yield|walk me through)\b/i;
const FACT_CHECK_RE = /\b(is this true|fact check|verify|correct or not|is it correct)\b/i;

function detectIntent(question: string): GroundingIntent {
  if (VISUAL_RE.test(question)) return 'visual';
  if (FACT_CHECK_RE.test(question)) return 'fact_check';
  if (QUIZ_RE.test(question)) return 'quiz';
  if (/\b(compare|difference|differentiate|vs\b|versus)\b/i.test(question)) return 'compare';
  if (SOURCE_SENSITIVE_RE.test(question)) return 'guideline';
  if (TEACH_RE.test(question)) return 'teach';
  return 'clarify';
}

function detectConfidencePolicy(question: string, intent: GroundingIntent): GroundingConfidencePolicy {
  const trimmed = question.trim();
  if (!trimmed) return 'low';
  if (intent === 'guideline' || intent === 'fact_check' || intent === 'visual') return 'low';
  if (trimmed.split(/\s+/).length <= 3) return 'low';
  if (/^(what|why|how|which|where)\b/i.test(trimmed) && trimmed.length < 32) return 'medium';
  return 'high';
}

function buildBudget(mode: GroundingDecision['mode']): GroundingBudget {
  return mode === 'local_tutor'
    ? {
        localContextBlocks: 2,
        webEvidenceBlocks: 0,
        imageSets: 0,
        perSnippetChars: 240,
        promptCharBudget: 12000,
      }
    : {
        localContextBlocks: 2,
        webEvidenceBlocks: 2,
        imageSets: 1,
        perSnippetChars: 320,
        promptCharBudget: 24000,
      };
}

export function analyzeTurn(options: {
  question: string;
  topicName?: string;
  allowImages?: boolean;
  forceMode?: GroundingDecision['mode'];
  chosenModel?: string;
  localModelAvailable: boolean;
}): GroundingDecision {
  const question = options.question.replace(/\s+/g, ' ').trim();
  const intent = detectIntent(question);
  const visualIntent = Boolean(options.allowImages) && VISUAL_RE.test(question);
  const sourceSensitivity = SOURCE_SENSITIVE_RE.test(question) || intent === 'fact_check';
  const confidencePolicy = detectConfidencePolicy(question, intent);

  const explicitLocal = options.chosenModel === 'local';
  const explicitCloud = Boolean(options.chosenModel && !['auto', 'local'].includes(options.chosenModel));

  const shouldUseGroundedAgent =
    options.forceMode === 'grounded_agent' ||
    explicitCloud ||
    sourceSensitivity ||
    visualIntent ||
    confidencePolicy === 'low' ||
    !options.localModelAvailable;

  const mode: GroundingDecision['mode'] =
    options.forceMode ??
    (explicitLocal && options.localModelAvailable
      ? 'local_tutor'
      : shouldUseGroundedAgent
        ? 'grounded_agent'
        : 'local_tutor');

  const reason = explicitLocal
    ? 'chosen_model_local'
    : explicitCloud
      ? 'chosen_model_cloud'
      : sourceSensitivity
        ? 'source_sensitive_turn'
        : visualIntent
          ? 'explicit_visual_intent'
          : confidencePolicy === 'low'
            ? 'low_confidence_turn'
            : options.localModelAvailable
              ? 'plain_tutoring_turn'
              : 'local_model_unavailable';

  const decision: GroundingDecision = {
    mode,
    intent,
    sourceSensitivity,
    visualIntent,
    confidencePolicy,
    retrievalBudget: buildBudget(mode),
    reason,
  };

  if (__DEV__) {
    console.info('[GROUNDING_ANALYZE]', {
      question: previewText(question, 120),
      topicName: options.topicName ?? '',
      decision,
    });
  }

  return decision;
}
