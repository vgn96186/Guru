import React, { useState } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';


import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import { Props } from '../types';
import type {
  MustKnowContent,
} from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import { ExplainablePoint } from '../shared/ExplainablePoint';
import {
  useCardScrollContentStyle,
} from '../hooks/useCardScrollPadding';



// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────

export function MustKnowCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
}: { content: MustKnowContent } & Omit<Props, 'content'>) {
  const [showRating, setShowRating] = useState(false);
  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>MUST KNOW</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />

      <LinearText style={s.mkSectionLabel}>
        <Ionicons name="alert-circle" size={13} color={n.colors.error} />
        {'  '}CANNOT FORGET
      </LinearText>
      <View style={s.mkList}>
        {content.mustKnow.map((item, i) => (
          <View key={i} style={[s.mkItem, { borderLeftColor: n.colors.error }]}>
            <StudyMarkdown content={emphasizeHighYieldMarkdown(item)} compact />
          </View>
        ))}
      </View>

      <LinearText style={s.mkSectionLabel}>
        <Ionicons name="flame" size={13} color={n.colors.warning} />
        {'  '}MOST TESTED
      </LinearText>
      <View style={s.mkList}>
        {content.mostTested.map((item, i) => (
          <ExplainablePoint
            key={i}
            item={item}
            topicName={content.topicName}
            color={n.colors.warning}
          />
        ))}
      </View>

      <View style={s.mkTipBox}>
        <LinearText style={s.mkTipLabel}>EXAM TIP</LinearText>
        <LinearText style={s.mkTipText}>{content.examTip}</LinearText>
      </View>

      {!showRating ? (
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
