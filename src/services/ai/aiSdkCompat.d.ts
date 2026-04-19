/**
 * Compatibility shim for @ai-sdk/provider v5 -> v6 migration.
 *
 * The old code uses legacy names (LanguageModelV2GenerateResult, LanguageModel,
 * LanguageModelStreamPart, etc.) that are no longer exported. We alias them
 * here so the existing provider code typechecks while the runtime migration
 * proceeds separately.
 */
import type {
  LanguageModelV2 as _LMV2,
  LanguageModelV2CallOptions as _LMV2Opts,
  LanguageModelV2StreamPart as _LMV2Stream,
  LanguageModelV2Message as _LMV2Msg,
  LanguageModelV2ToolCallPart as _LMV2ToolCall,
  LanguageModelV2FinishReason as _LMV2Finish,
  LanguageModelV2Usage as _LMV2Usage,
  LanguageModelV3GenerateResult as _LMV3Gen,
  LanguageModelV3StreamResult as _LMV3Stream,
} from '@ai-sdk/provider';

declare module '@ai-sdk/provider' {
  // V2 Result types were removed in v6 — use loose typing to bridge
  export type LanguageModelV2GenerateResult = any;
  export type LanguageModelV2StreamResult = any;

  // Legacy unversioned names used across provider implementations
  export type LanguageModel = _LMV2;
  export type LanguageModelCallOptions = _LMV2Opts;
  export type LanguageModelGenerateResult = any;
  export type LanguageModelStreamPart = _LMV2Stream;
  export type LanguageModelStreamResult = any;
  export type LanguageModelMessage = _LMV2Msg;
  export type LanguageModelToolCallPart = _LMV2ToolCall;
  export type LanguageModelFinishReason = _LMV2Finish;
  export type LanguageModelUsage = _LMV2Usage;
}
