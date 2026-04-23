import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import LinearText from '../../../components/primitives/LinearText';


import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { Props } from '../types';
import type {
  ManualContent,
} from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import {
  useCardScrollContentStyle,
} from '../hooks/useCardScrollPadding';



// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────
// ── Story ─────────────────────────────────────────────────────────
// ── Mnemonic ──────────────────────────────────────────────────────
// ── Teach Back ────────────────────────────────────────────────────
// ── Error Hunt ────────────────────────────────────────────────────
// ── Detective ─────────────────────────────────────────────────────
// ── Manual Review ──────────────────────────────────────────────────

export function ManualReviewCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
}: { content: ManualContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>📴 MANUAL REVIEW (OFFLINE)</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />

      <View style={s.offlineBox}>
        <LinearText style={s.offlineEmoji}>📡❌</LinearText>
        <LinearText style={s.offlineText}>
          Guru is offline or AI is unavailable. Spend 2-5 minutes recalling everything you know
          about this topic.
        </LinearText>
      </View>

      <LinearText style={s.promptText}>
        Close your eyes and try to visualize:
        {'\n'}• Classification / Types
        {'\n'}• Clinical presentation
        {'\n'}• Gold standard diagnosis
        {'\n'}• First-line treatment
      </LinearText>

      {!showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>I've reviewed it →</LinearText>
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
        <LinearText style={s.skipText}>Skip topic</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
