import React, { useEffect, useRef, useState } from 'react';
import { Animated, InteractionManager, StyleSheet, View } from 'react-native';
import { motion } from '../../motion/presets';
import { BUNDLED_HF_TOKEN } from '../../config/appConfig';
import { useAiRuntimeStatus } from '../../hooks/useAiRuntimeStatus';
import { linearTheme as n } from '../../theme/linearTheme';
import type { UserProfile } from '../../types';
import { getApiKeys } from '../../services/ai/config';
import { isLocalLlmUsable } from '../../services/deviceMemory';
import LinearText from '../primitives/LinearText';

export function AiStatusIndicator({ profile }: { profile: NonNullable<UserProfile | null> }) {
  const runtime = useAiRuntimeStatus();
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const [elapsed, setElapsed] = useState(0);
  const isActive = runtime.activeCount > 0;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    const runAfterInteractions =
      typeof InteractionManager?.runAfterInteractions === 'function'
        ? InteractionManager.runAfterInteractions.bind(InteractionManager)
        : (fn: () => void) => {
            fn();
            return { cancel: () => {} };
          };
    const task = runAfterInteractions(() => {
      if (isActive) {
        loop = motion.pulseValue(pulseAnim, {
          from: 0,
          to: 1,
          duration: 800,
          loop: true,
          useNativeDriver: true,
        });
        loop.start();
      } else {
        pulseAnim.setValue(0);
      }
    });
    return () => {
      task.cancel();
      loop?.stop();
    };
  }, [isActive, pulseAnim]);

  useEffect(() => {
    if (!isActive) {
      setElapsed(0);
      return;
    }
    const start = runtime.active[0]?.startedAt ?? Date.now();
    setElapsed(Math.floor((Date.now() - start) / 1000));
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, [isActive, runtime.active]);

  const keys = getApiKeys(profile);
  const providers: { name: string; on: boolean }[] = [
    { name: 'ChatGPT', on: keys.chatgptConnected },
    { name: 'Copilot', on: keys.githubCopilotConnected },
    { name: 'GitLab', on: keys.gitlabDuoConnected },
    { name: 'Poe', on: keys.poeConnected },
    { name: 'Qwen', on: !!profile?.qwenConnected },
    { name: 'Groq', on: !!keys.groqKey },
    { name: 'Gemini', on: !!keys.geminiKey },
    { name: 'OR', on: !!keys.orKey },
    { name: 'DeepSeek', on: !!keys.deepseekKey },
    { name: 'AgentR', on: !!keys.agentRouterKey },
    { name: 'GitHub', on: !!keys.githubModelsPat },
    { name: 'Local', on: isLocalLlmUsable(profile) },
  ];
  const onlineProviders = providers.filter((p) => p.on);
  const hasAnyStt =
    !!(profile.huggingFaceToken?.trim() || BUNDLED_HF_TOKEN) ||
    !!(profile.useLocalWhisper && profile.localWhisperPath);

  const activeReq = runtime.active[0];
  const activeBanner = isActive
    ? `${activeReq?.modelUsed?.split('/').pop() ?? activeReq?.backend ?? 'AI'}${
        elapsed > 0 ? ` ${elapsed}s` : ''
      }`
    : null;

  const glowOpacity = pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });

  return (
    <View style={styles.wrap}>
      {activeBanner && (
        <View style={[styles.banner, { borderColor: n.colors.accent }]}>
          <Animated.View
            style={[styles.bannerGlow, { backgroundColor: n.colors.accent, opacity: glowOpacity }]}
          />
          <View style={[styles.bannerDot, { backgroundColor: n.colors.accent }]} />
          <LinearText variant="meta" tone="accent" style={styles.bannerText} numberOfLines={1}>
            {activeBanner}
          </LinearText>
        </View>
      )}
      <View style={styles.tagRow}>
        {onlineProviders.length > 0 ? (
          onlineProviders.map((p) => (
            <View key={p.name} style={styles.tag}>
              <View style={[styles.tagDot, { backgroundColor: n.colors.success }]} />
              <LinearText variant="meta" tone="secondary" style={styles.tagText}>
                {p.name}
              </LinearText>
            </View>
          ))
        ) : (
          <View style={styles.tag}>
            <View
              style={[
                styles.tagDot,
                { backgroundColor: hasAnyStt ? n.colors.warning : n.colors.error },
              ]}
            />
            <LinearText variant="meta" tone="error" style={styles.tagText}>
              {hasAnyStt ? 'STT only' : 'No AI'}
            </LinearText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    gap: 4,
    flexShrink: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: n.radius.sm,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  bannerGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.12,
  },
  bannerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  bannerText: {
    ...n.typography.meta,
    fontWeight: '700',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 3,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: n.radius.sm,
    backgroundColor: n.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: n.colors.border,
  },
  tagDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  tagText: {
    color: n.colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
});
