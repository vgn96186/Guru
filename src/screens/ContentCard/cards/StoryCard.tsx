import React, { useState } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';

import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { Props } from '../types';
import type { StoryContent } from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import { useCardScrollContentStyle } from '../hooks/useCardScrollPadding';

// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────
// ── Story ─────────────────────────────────────────────────────────

export function StoryCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
}: { content: StoryContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>📖 CLINICAL STORY</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />
      <View style={{ marginBottom: 20 }}>
        <StudyMarkdown content={emphasizeHighYieldMarkdown(content.story)} />
      </View>
      <View style={s.highlightsBox}>
        <LinearText style={s.highlightsLabel}>Key concepts in this story:</LinearText>
        <View style={s.highlightChips}>
          {content.keyConceptHighlights.map((kw, i) => (
            <View key={i} style={s.chip}>
              <LinearText style={s.chipText}>{kw}</LinearText>
            </View>
          ))}
        </View>
      </View>
      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Read it →</LinearText>
        </TouchableOpacity>
      ) : (
        <ConfidenceRating onRate={onDone} />
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip story</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
