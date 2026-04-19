import { profileRepository } from '../../../db/repositories/profileRepository';
import type { Message } from '../types';
import { logGroundingEvent, previewText } from '../runtimeDebug';
import { streamText } from 'ai';
import type { 
  LanguageModelMessage as ModelMessage, 
} from '@ai-sdk/provider';
import type { ToolResultPart } from 'ai';
import { analyzeTurn } from './analyzeTurn';
import { buildGroundingContextSections, buildGroundingPromptMessages } from './contextBuilder';
import { buildGroundingModel } from './modePolicy';
import { composeGroundingArtifacts } from './resultComposer';
import { buildGroundingTools } from './toolRegistry';
import type {
  GroundingArtifacts,
  GroundingExecutionState,
  GroundingRequest,
  GroundingResult,
  PreparedGroundedTurn,
} from './types';

function toModelMessages(messages: Message[]): ModelMessage[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : message.role,
    content: message.content,
  })) as ModelMessage[];
}

function identity(text: string): string {
  return text;
}

export async function prepareGroundedTurn(request: GroundingRequest): Promise<PreparedGroundedTurn> {
  const profile = request.profile ?? (await profileRepository.getProfile());
  const localModelAvailable = Boolean(profile.useLocalModel && profile.localModelPath?.trim());
  const decision = analyzeTurn({
    question: request.question,
    topicName: request.topicName,
    allowImages: request.allowImages,
    forceMode: request.forceMode,
    chosenModel: request.chosenModel,
    localModelAvailable,
  });
  const sections = buildGroundingContextSections(request, decision);
  const { systemPrompt, promptMessages, searchQuery } = buildGroundingPromptMessages(
    request,
    decision,
    sections,
  );
  const tools =
    decision.mode === 'grounded_agent'
      ? buildGroundingTools({ allowImages: decision.visualIntent && request.allowImages !== false })
      : undefined;
  const trace = {
    caller: request.caller,
    questionPreview: previewText(request.question, 120),
    modeChosen: decision.mode,
    reason: decision.reason,
    toolsOffered: tools ? Object.keys(tools) : [],
    toolsUsed: [],
    sourceCount: 0,
    imageCount: 0,
    evidenceMix: {
      localContextBlocks: 0,
      webEvidenceBlocks: 0,
      imageSets: 0,
    },
    modelUsed: '',
    searchQuery,
  };

  logGroundingEvent('decision', {
    caller: request.caller,
    question: previewText(request.question, 120),
    decision,
  });
  logGroundingEvent('mode_selected', {
    caller: request.caller,
    mode: decision.mode,
    reason: decision.reason,
    toolsOffered: trace.toolsOffered,
  });

  return {
    request,
    profile,
    question: request.question.replace(/\s+/g, ' ').trim(),
    searchQuery,
    decision,
    systemPrompt,
    promptMessages,
    toolMessages: toModelMessages(promptMessages),
    tools,
    toolContext: {
      caller: request.caller,
      topicName: request.topicName,
      question: request.question,
      searchQuery,
    },
    trace: { ...trace },
  };
}

async function executeGroundedPass(
  prepared: PreparedGroundedTurn,
  messages: Message[],
  state: GroundingExecutionState,
): Promise<void> {
  const sanitizeAccumulatedReply = prepared.request.sanitizeAccumulatedReply ?? identity;
  const model = buildGroundingModel({
    profile: prepared.profile,
    decision: prepared.decision,
    onProviderSuccess: (provider, modelId) => {
      state.modelUsed = `${provider}/${modelId}`;
    },
    onProviderError: (provider, modelId, error) => {
      logGroundingEvent('fallback_hop', {
        caller: prepared.request.caller,
        provider,
        modelId,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const runPass = async (toolsEnabled: boolean) => {
    const result = streamText({
      model,
      messages: toModelMessages(messages),
      tools: toolsEnabled ? prepared.tools : undefined,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') {
        state.aggregatedText += part.text;
        const sanitized = sanitizeAccumulatedReply(state.aggregatedText);
        if (sanitized.length > state.emittedText.length) {
          const cleanDelta = sanitized.slice(state.emittedText.length);
          state.emittedText = sanitized;
          prepared.request.onReplyDelta?.(cleanDelta);
        }
      } else if (part.type === 'tool-call') {
        state.toolCalls.push({ toolName: part.toolName, input: part.input });
        logGroundingEvent('tool_called', {
          caller: prepared.request.caller,
          toolName: part.toolName,
          inputPreview: previewText(JSON.stringify(part.input ?? {}), 180),
        });
      } else if (part.type === 'tool-result') {
        state.toolResults.push(part as ToolResultPart);
        logGroundingEvent('tool_result_summary', {
          caller: prepared.request.caller,
          toolName: part.toolName,
          isError: false, // Vercel's tool-result part doesn't have isError directly in the same way
          outputPreview: previewText(JSON.stringify(part.output ?? {}), 220),
        });
      }
    }
  };

  try {
    await runPass(Boolean(prepared.tools));
  } catch (error) {
    if (prepared.decision.mode === 'grounded_agent' && prepared.tools) {
      logGroundingEvent('tool_result_summary', {
        caller: prepared.request.caller,
        toolName: 'agent_retry_without_tools',
        isError: true,
        outputPreview: error instanceof Error ? error.message : String(error),
      });
      await runPass(false);
      return;
    }
    throw error;
  }
}

function maybeEmitRemainingFinalText(prepared: PreparedGroundedTurn, state: GroundingExecutionState, finalText: string) {
  if (!prepared.request.onReplyDelta) return;
  if (finalText.length <= state.emittedText.length) return;
  const remaining = finalText.slice(state.emittedText.length);
  if (!remaining) return;
  prepared.request.onReplyDelta(remaining);
  state.emittedText = finalText;
}

function canContinue(prepared: PreparedGroundedTurn): boolean {
  return Boolean(
    prepared.request.shouldRequestContinuation &&
      prepared.request.buildContinuationMessages &&
      prepared.request.hasUsefulContinuation &&
      prepared.request.appendContinuation,
  );
}

async function finalizeExecution(
  prepared: PreparedGroundedTurn,
  state: GroundingExecutionState,
): Promise<GroundingResult> {
  const finalizeReply = prepared.request.finalizeReply ?? identity;
  let finalText = finalizeReply(state.aggregatedText);
  maybeEmitRemainingFinalText(prepared, state, finalText);

  if (canContinue(prepared)) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      if (!prepared.request.shouldRequestContinuation?.(finalText)) break;
      const continuationMessages = prepared.request.buildContinuationMessages!(
        prepared.promptMessages,
        finalText,
      );
      const continuationState: GroundingExecutionState = {
        aggregatedText: '',
        emittedText: '',
        modelUsed: state.modelUsed,
        toolResults: [],
        toolCalls: [],
      };
      await executeGroundedPass(prepared, continuationMessages, continuationState);
      const continuationText = finalizeReply(continuationState.aggregatedText);
      if (!prepared.request.hasUsefulContinuation?.(finalText, continuationText)) break;
      finalText = prepared.request.appendContinuation!(finalText, continuationText);
      state.aggregatedText = finalText;
      state.toolResults.push(...continuationState.toolResults);
      state.toolCalls.push(...continuationState.toolCalls);
      maybeEmitRemainingFinalText(prepared, state, finalText);
    }
  }

  const artifacts: GroundingArtifacts = composeGroundingArtifacts({
    decision: prepared.decision,
    toolResults: state.toolResults,
    trace: {
      ...prepared.trace,
      modelUsed: state.modelUsed,
    },
  });

  logGroundingEvent('response_finalized', {
    caller: prepared.request.caller,
    mode: prepared.decision.mode,
    modelUsed: state.modelUsed,
    toolsUsed: artifacts.toolsUsed,
    sourceCount: artifacts.sources.length,
    imageCount: artifacts.referenceImages.length,
    replyPreview: previewText(finalText, 220),
  });

  return {
    text: finalText,
    modelUsed: state.modelUsed,
    modeUsed: prepared.decision.mode,
    toolsUsed: artifacts.toolsUsed,
    sources: artifacts.sources,
    referenceImages: artifacts.referenceImages,
    trace: artifacts.trace,
    searchQuery: prepared.searchQuery,
  };
}

export async function streamGroundedTurn(request: GroundingRequest): Promise<GroundingResult> {
  const prepared = await prepareGroundedTurn(request);
  const state: GroundingExecutionState = {
    aggregatedText: '',
    emittedText: '',
    modelUsed: '',
    toolResults: [],
    toolCalls: [],
  };
  await executeGroundedPass(prepared, prepared.promptMessages, state);
  return finalizeExecution(prepared, state);
}

export async function runGroundedTurn(request: GroundingRequest): Promise<GroundingResult> {
  return streamGroundedTurn(request);
}

export { buildGroundingTools } from './toolRegistry';
