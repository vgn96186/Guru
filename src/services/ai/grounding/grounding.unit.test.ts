jest.mock('../../../db/repositories/profileRepository', () => ({
  profileRepository: {
    getProfile: jest.fn(),
  },
}));

jest.mock('../providers/guruFallback', () => ({
  createGuruFallbackModel: jest.fn(() => ({ provider: 'fallback', modelId: 'test-model' })),
}));

jest.mock('ai', () => ({
  streamText: jest.fn(),
}));

import { profileRepository } from '../../../db/repositories/profileRepository';
import { streamText } from 'ai';
import { analyzeTurn } from './analyzeTurn';
import { composeGroundingArtifacts } from './resultComposer';
import { streamGroundedTurn } from './index';
import type { ToolResultPart } from 'ai';

const mockGetProfile = jest.mocked(profileRepository.getProfile);
const mockStreamText = jest.mocked(streamText);

function makeFullStream(parts: any[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const part of parts) {
        yield part;
      }
    },
  };
}

describe('analyzeTurn', () => {
  it('chooses local_tutor for plain tutoring turns when local is available', () => {
    const decision = analyzeTurn({
      question: 'Explain neuroanatomy step by step',
      localModelAvailable: true,
    });

    expect(decision.mode).toBe('local_tutor');
    expect(decision.intent).toBe('teach');
  });

  it('chooses grounded_agent for guideline-sensitive turns', () => {
    const decision = analyzeTurn({
      question: 'What are the latest hypertension treatment guidelines?',
      localModelAvailable: true,
    });

    expect(decision.mode).toBe('grounded_agent');
    expect(decision.sourceSensitivity).toBe(true);
  });
});

describe('composeGroundingArtifacts', () => {
  it('keeps a balanced merge within the configured evidence budgets', () => {
    const toolResults: ToolResultPart[] = [
      {
        type: 'tool-result',
        toolCallId: '1',
        toolName: 'fetch_notes_context',
        output: {
          notes: [
            { title: 'Renal physiology', snippet: 'Loop of Henle note', source: 'Topic notes' },
            { title: 'Acid base', snippet: 'AGMA note', source: 'Topic notes' },
            { title: 'Extra', snippet: 'Should be trimmed', source: 'Topic notes' },
          ],
        },
      } as any,
      {
        type: 'tool-result',
        toolCallId: '2',
        toolName: 'search_medical',
        output: {
          results: [
            {
              id: 'src-1',
              title: 'Hypertension guideline',
              url: 'https://example.com/g1',
              snippet: 'Guideline summary',
              source: 'PubMed',
            },
            {
              id: 'src-2',
              title: 'Second guideline',
              url: 'https://example.com/g2',
              snippet: 'Second summary',
              source: 'EuropePMC',
            },
            {
              id: 'src-3',
              title: 'Third guideline',
              url: 'https://example.com/g3',
              snippet: 'Third summary',
              source: 'Wikipedia',
            },
          ],
        },
      } as any,
      {
        type: 'tool-result',
        toolCallId: '3',
        toolName: 'search_reference_images',
        output: {
          results: [
            {
              id: 'img-1',
              title: 'Fundus photo',
              url: 'https://example.com/image',
              imageUrl: 'https://example.com/image',
              snippet: 'Fundus image',
              source: 'Open i (NIH)',
            },
          ],
        },
      } as any,
    ];

    const artifacts = composeGroundingArtifacts({
      decision: {
        mode: 'grounded_agent',
        intent: 'guideline',
        sourceSensitivity: true,
        visualIntent: true,
        confidencePolicy: 'low',
        reason: 'source_sensitive_turn',
        retrievalBudget: {
          localContextBlocks: 2,
          webEvidenceBlocks: 2,
          imageSets: 1,
          perSnippetChars: 320,
          promptCharBudget: 24000,
        },
      },
      toolResults,
      trace: {
        caller: 'test',
        questionPreview: 'test question',
        modeChosen: 'grounded_agent',
        reason: 'source_sensitive_turn',
        toolsOffered: [],
        toolsUsed: [],
        sourceCount: 0,
        imageCount: 0,
        evidenceMix: { localContextBlocks: 0, webEvidenceBlocks: 0, imageSets: 0 },
        modelUsed: 'test-model',
        searchQuery: 'test query',
      },
    });

    expect(artifacts.sources).toHaveLength(4);
    expect(artifacts.referenceImages).toHaveLength(1);
    expect(artifacts.toolsUsed).toEqual(
      expect.arrayContaining(['fetch_notes_context', 'search_medical', 'search_reference_images']),
    );
  });
});

describe('streamGroundedTurn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('keeps plain tutoring on the local path without tools', async () => {
    mockGetProfile.mockResolvedValue({
      providerOrder: [],
      disabledProviders: [],
      useLocalModel: true,
      localModelPath: '/models/gemma-4-e4b.litertlm',
    } as any);
    mockStreamText.mockReturnValue({
      fullStream: makeFullStream([
        { type: 'text-delta', text: 'Local tutor answer' },
        { type: 'finish', finishReason: 'stop', usage: {} },
      ]) as any,
      textStream: makeFullStream([]) as any,
      text: Promise.resolve('Local tutor answer'),
      toolCalls: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({}),
      responseMessages: Promise.resolve([]),
    } as any);

    const result = await streamGroundedTurn({
      caller: 'test-local',
      question: 'Explain neuroanatomy step by step',
      history: [],
    });

    expect(result.modeUsed).toBe('local_tutor');
    expect(result.toolsUsed).toEqual([]);
    expect(result.text).toBe('Local tutor answer');
    expect(mockStreamText.mock.calls[0]?.[0]?.tools).toBeUndefined();
  });

  it('uses grounding tools for source-sensitive turns', async () => {
    mockGetProfile.mockResolvedValue({
      providerOrder: ['groq'],
      disabledProviders: [],
      useLocalModel: true,
      localModelPath: '/models/gemma-4-e4b.litertlm',
    } as any);
    mockStreamText.mockReturnValue({
      fullStream: makeFullStream([
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'search_medical',
          input: { query: 'hypertension guideline' },
        },
        {
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'search_medical',
          output: {
            results: [
              {
                id: 'src-1',
                title: 'Hypertension guideline',
                url: 'https://example.com/g1',
                snippet: 'Guideline summary',
                source: 'PubMed',
              },
            ],
          },
        },
        { type: 'text-delta', text: 'Guideline-focused answer' },
        { type: 'finish', finishReason: 'stop', usage: {} },
      ]) as any,
      textStream: makeFullStream([]) as any,
      text: Promise.resolve('Guideline-focused answer'),
      toolCalls: Promise.resolve([]),
      toolResults: Promise.resolve([]),
      finishReason: Promise.resolve('stop'),
      usage: Promise.resolve({}),
      responseMessages: Promise.resolve([]),
    } as any);

    const result = await streamGroundedTurn({
      caller: 'test-grounded',
      question: 'What are the latest hypertension treatment guidelines?',
      history: [],
      allowImages: true,
    });

    expect(result.modeUsed).toBe('grounded_agent');
    expect(result.toolsUsed).toEqual(['search_medical']);
    expect(result.sources).toHaveLength(1);
    expect(mockStreamText.mock.calls[0]?.[0]?.tools).toBeDefined();
  });
});
