import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity, useWindowDimensions } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';

import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import { Props, ContextUpdater } from '../types';
import type { KeyPointsContent } from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import { useCardScrollContentStyle } from '../hooks/useCardScrollPadding';
import { compactLines } from '../utils/compactLines';

// ── Key Points ────────────────────────────────────────────────────

export function KeyPointsCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onContextChange,
}: { content: KeyPointsContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const [revealIndex, setRevealIndex] = useState(0);
  const [showRating, setShowRating] = useState(false);

  const isFullyRevealed = revealIndex >= content.points.length;

  useEffect(() => {
    const revealedPoints = content.points.slice(0, revealIndex + 1);
    onContextChange?.(
      compactLines([
        `Card type: Key points`,
        `Currently visible points: ${revealedPoints.join(' | ')}`,
        isFullyRevealed ? `Memory hook visible: ${content.memoryHook}` : '',
      ]),
    );
  }, [content, revealIndex, isFullyRevealed, onContextChange]);

  const POINT_COLORS = [
    n.colors.accent,
    n.colors.error,
    n.colors.warning,
    n.colors.success,
    n.colors.error,
    n.colors.accent,
  ];

  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView
      key={`${viewportWidth}x${viewportHeight}`}
      style={s.scroll}
      contentContainerStyle={scrollContentStyle}
    >
      <LinearText style={s.cardType}>KEY POINTS</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} variant="title">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <LinearText style={s.kpProgress}>
        {Math.min(revealIndex + 1, content.points.length)} / {content.points.length}
      </LinearText>
      <TopicImage topicName={content.topicName} />
      <View style={s.pointsContainer}>
        {content.points.slice(0, revealIndex + 1).map((pt, i) => {
          const color = POINT_COLORS[i % POINT_COLORS.length];
          return (
            <View key={i} style={[s.kpCard, { borderLeftColor: color }]}>
              <View style={[s.kpNumber, { backgroundColor: color + '22' }]}>
                <LinearText style={[s.kpNumberText, { color }]}>{i + 1}</LinearText>
              </View>
              <View style={s.kpContent}>
                <StudyMarkdown content={emphasizeHighYieldMarkdown(pt)} compact />
              </View>
            </View>
          );
        })}
      </View>
      {isFullyRevealed && (
        <View style={s.hookBox}>
          <LinearText style={s.hookLabel}>Memory Hook</LinearText>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(content.memoryHook)} compact />
        </View>
      )}
      {!isFullyRevealed ? (
        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => setRevealIndex((i) => i + 1)}
          activeOpacity={0.8}
        >
          <LinearText style={s.doneBtnText}>
            Next ({revealIndex + 1}/{content.points.length})
          </LinearText>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Got it</LinearText>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip content type"
      >
        <LinearText style={s.skipText}>Skip content type</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
