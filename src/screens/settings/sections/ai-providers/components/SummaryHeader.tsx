import React from 'react';
import { View } from 'react-native';
import LinearText from '../../../../../components/primitives/LinearText';
import LinearSurface from '../../../../../components/primitives/LinearSurface';
import { PROVIDER_DISPLAY_NAMES } from '../../../../../types';
import type { ProviderId } from '../../../../../types';
import { sanitizeProviderOrder } from '../../../../../utils/providerOrder';
import type { AiProvidersProps } from '../types';
import { isChatGptEnabled } from '../../../utils';

export function useSummaryMetrics(props: AiProvidersProps) {
  const { chatgpt, githubCopilot, gitlabDuo, poe, qwen, apiKeys, localAi, routing } = props;
  const hasValue = (value: string | null | undefined) => Boolean(value?.trim());

  const readyProviderCount = [
    isChatGptEnabled(chatgpt.accounts),
    githubCopilot.connected,
    gitlabDuo.connected,
    poe.connected,
    qwen.connected,
    hasValue(apiKeys.groq.value),
    hasValue(apiKeys.githubModelsPat.value),
    hasValue(apiKeys.openrouter.value),
    hasValue(apiKeys.kilo.value),
    hasValue(apiKeys.deepseek.value),
    hasValue(apiKeys.agentRouter.value),
    hasValue(apiKeys.gemini.value),
    hasValue(apiKeys.deepgram.value),
    hasValue(apiKeys.fal.value),
    hasValue(apiKeys.braveSearch.value),
    hasValue(apiKeys.cloudflare.accountId) && hasValue(apiKeys.cloudflare.apiToken),
    localAi.enabled && (localAi.llmReady || localAi.whisperReady || localAi.useNano),
  ].filter(Boolean).length;

  const oauthConnectionCount = [
    chatgpt.accounts.primary.connected,
    chatgpt.accounts.secondary.connected,
    githubCopilot.connected,
    gitlabDuo.connected,
    poe.connected,
    qwen.connected,
  ].filter(Boolean).length;

  const providerPriority = sanitizeProviderOrder(routing.providerOrder)[0];
  const topProviderLabel = (PROVIDER_DISPLAY_NAMES as any)[providerPriority] ?? 'Auto';

  const localAiSummary = localAi.enabled
    ? localAi.llmReady || localAi.whisperReady || localAi.useNano
      ? 'Ready'
      : 'Needs models'
    : 'Cloud first';

  return {
    readyProviderCount,
    oauthConnectionCount,
    topProviderLabel,
    localAiSummary,
  };
}

interface Props {
  metrics: ReturnType<typeof useSummaryMetrics>;
  styles: any;
}

export default function SummaryHeader({ metrics, styles }: Props) {
  const { readyProviderCount, oauthConnectionCount, topProviderLabel, localAiSummary } = metrics;

  return (
    <>
      <LinearText
        style={[styles.categoryLabel, { marginTop: 0 }]}
        variant="sectionTitle"
        tone="muted"
      >
        AI & PROVIDERS
      </LinearText>
      <LinearSurface compact style={styles.summaryCardCompact}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCopy}>
            <LinearText variant="meta" tone="accent" style={styles.summaryEyebrow}>
              COMMAND CENTER
            </LinearText>
          </View>
          <View style={styles.summaryPill}>
            <LinearText variant="chip" tone="accent">
              {readyProviderCount} ready
            </LinearText>
          </View>
        </View>
        <View style={styles.summaryMetricsRow}>
          <View style={styles.summaryMetricCard}>
            <LinearText variant="title" tone="accent" style={styles.summaryMetricValue}>
              {topProviderLabel}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              Top routing priority
            </LinearText>
          </View>
          <View style={styles.summaryMetricCard}>
            <LinearText variant="title" tone="success" style={styles.summaryMetricValue}>
              {oauthConnectionCount}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              OAuth connections
            </LinearText>
          </View>
          <View style={styles.summaryMetricCard}>
            <LinearText variant="title" tone="warning" style={styles.summaryMetricValue}>
              {localAiSummary}
            </LinearText>
            <LinearText variant="caption" tone="secondary" style={styles.summaryMetricLabel}>
              Local AI mode
            </LinearText>
          </View>
        </View>
      </LinearSurface>
    </>
  );
}
