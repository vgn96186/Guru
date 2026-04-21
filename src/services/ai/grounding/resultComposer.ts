import type { MedicalGroundingSource } from '../types';
import { dedupeGroundingSources, clipText } from '../medicalSearch';
import { logGroundingEvent, previewText } from '../runtimeDebug';
import type { ToolResultPart } from 'ai';
import type { GroundingArtifacts, GroundingDecision, GroundingTrace } from './types';

type NoteContextItem = {
  title: string;
  snippet: string;
  source: string;
  createdAt?: number;
};

type ToolResultWithErrorFlag = ToolResultPart & { isError?: boolean };
type ContextSourceLabel = MedicalGroundingSource['source'] | 'LocalNotes' | 'Lecture Transcript';

function normalizeSources(items: unknown): MedicalGroundingSource[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item): item is MedicalGroundingSource => {
      return (
        !!item &&
        typeof item === 'object' &&
        typeof (item as MedicalGroundingSource).title === 'string' &&
        typeof (item as MedicalGroundingSource).url === 'string' &&
        typeof (item as MedicalGroundingSource).snippet === 'string' &&
        typeof (item as MedicalGroundingSource).source === 'string'
      );
    })
    .map((item) => ({
      ...item,
      title: clipText(item.title, 220),
      snippet: clipText(item.snippet, 420),
    }));
}

function convertContextItemsToSources(
  items: NoteContextItem[],
  sourceLabel: ContextSourceLabel,
): MedicalGroundingSource[] {
  return items.map((item, index) => ({
    id: `${sourceLabel.toLowerCase().replace(/\s+/g, '-')}-${index}-${item.title}`,
    title: clipText(item.title, 220),
    url: `local://${encodeURIComponent(item.title)}`,
    snippet: clipText(item.snippet, 420),
    source: sourceLabel as MedicalGroundingSource['source'],
    author: item.source,
  }));
}

function pickBudgeted<T>(items: T[], maxItems: number): T[] {
  return items.slice(0, Math.max(0, maxItems));
}

export function composeGroundingArtifacts(options: {
  decision: GroundingDecision;
  toolResults: ToolResultPart[];
  trace: GroundingTrace;
}): GroundingArtifacts {
  const toolsUsed = Array.from(
    new Set(
      options.toolResults
        .filter((result) => (result as ToolResultWithErrorFlag).isError !== true)
        .map((result) => result.toolName)
        .filter(Boolean),
    ),
  );

  const localNotes: NoteContextItem[] = [];
  const transcriptNotes: NoteContextItem[] = [];
  const webSources: MedicalGroundingSource[] = [];
  const imageSources: MedicalGroundingSource[] = [];

  for (const result of options.toolResults) {
    if (
      (result as ToolResultWithErrorFlag).isError === true ||
      !result.output ||
      typeof result.output !== 'object'
    )
      continue;
    const output = result.output as Record<string, unknown>;

    if (result.toolName === 'search_medical') {
      webSources.push(...normalizeSources(output.results));
    }

    if (result.toolName === 'fact_check') {
      webSources.push(...normalizeSources(output.sources));
    }

    if (result.toolName === 'fetch_notes_context' && Array.isArray(output.notes)) {
      localNotes.push(
        ...output.notes
          .filter(
            (item): item is NoteContextItem =>
              !!item &&
              typeof item === 'object' &&
              typeof (item as NoteContextItem).title === 'string' &&
              typeof (item as NoteContextItem).snippet === 'string' &&
              typeof (item as NoteContextItem).source === 'string',
          )
          .map((item) => ({
            title: item.title,
            snippet: item.snippet,
            source: item.source,
            createdAt: item.createdAt,
          })),
      );
    }

    if (result.toolName === 'fetch_transcript_context' && Array.isArray(output.transcripts)) {
      transcriptNotes.push(
        ...output.transcripts
          .filter(
            (item): item is NoteContextItem =>
              !!item &&
              typeof item === 'object' &&
              typeof (item as NoteContextItem).title === 'string' &&
              typeof (item as NoteContextItem).snippet === 'string' &&
              typeof (item as NoteContextItem).source === 'string',
          )
          .map((item) => ({
            title: item.title,
            snippet: item.snippet,
            source: item.source,
            createdAt: item.createdAt,
          })),
      );
    }

    if (result.toolName === 'search_reference_images') {
      imageSources.push(...normalizeSources(output.results));
    }
  }

  const localSources = [
    ...convertContextItemsToSources(localNotes, 'LocalNotes'),
    ...convertContextItemsToSources(transcriptNotes, 'Lecture Transcript'),
  ];
  const budget = options.decision.retrievalBudget;
  const sources = dedupeGroundingSources([
    ...pickBudgeted(localSources, budget.localContextBlocks),
    ...pickBudgeted(webSources, budget.webEvidenceBlocks),
  ]);
  const referenceImages = dedupeGroundingSources(
    pickBudgeted(imageSources, budget.imageSets > 0 ? 3 : 0),
  );

  const trace: GroundingTrace = {
    ...options.trace,
    toolsUsed,
    sourceCount: sources.length,
    imageCount: referenceImages.length,
    evidenceMix: {
      localContextBlocks: Math.min(localSources.length, budget.localContextBlocks),
      webEvidenceBlocks: Math.min(webSources.length, budget.webEvidenceBlocks),
      imageSets: referenceImages.length > 0 ? 1 : 0,
    },
  };

  logGroundingEvent('evidence_ranked', {
    toolsUsed,
    sourceCount: sources.length,
    imageCount: referenceImages.length,
    sourceTitles: sources.slice(0, 3).map((source) => previewText(source.title, 80)),
  });

  logGroundingEvent('budget_trimmed', {
    localBudget: budget.localContextBlocks,
    webBudget: budget.webEvidenceBlocks,
    imageBudget: budget.imageSets,
    keptLocal: trace.evidenceMix.localContextBlocks,
    keptWeb: trace.evidenceMix.webEvidenceBlocks,
    keptImages: trace.evidenceMix.imageSets,
  });

  return {
    toolsUsed,
    sources,
    referenceImages,
    trace,
  };
}
