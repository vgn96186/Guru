import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';

import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { Props, ContextUpdater } from '../types';
import type { MnemonicContent } from '../../../types';
import { TopicImage } from '../shared/TopicImage';
import { ConfidenceRating } from '../shared/ConfidenceRating';
import { useCardScrollContentStyle } from '../hooks/useCardScrollPadding';
import { compactLines } from '../utils/compactLines';

// ── Key Points ────────────────────────────────────────────────────
// ── Must Know & Most Tested ──────────────────────────────────────
// ── Concept Chip (inline tap-to-explain) ─────────────────────────
// ── Deep Explanation with Reveal ─────────────────────────────────
// ── Quiz ──────────────────────────────────────────────────────────
// ── Story ─────────────────────────────────────────────────────────
// ── Mnemonic ──────────────────────────────────────────────────────

export function MnemonicCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onContextChange,
}: { content: MnemonicContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [revealStep, setRevealStep] = useState(0);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    onContextChange?.(
      compactLines(
        [
          'Card type: Mnemonic',
          `Mnemonic visible: ${content.mnemonic}`,
          revealStep >= 1
            ? `Expansion visible: ${content.expansion.join(' | ')}`
            : 'Expansion is hidden.',
          revealStep >= 2 ? `Tip visible: ${content.tip}` : 'Tip is hidden.',
        ],
        4,
      ),
    );
  }, [content, onContextChange, revealStep]);

  const scrollContentStyle = useCardScrollContentStyle(0);

  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>🧠 MNEMONIC</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />
      <View style={s.mnemonicBox}>
        <LinearText style={s.mnemonicMain}>{content.mnemonic}</LinearText>
      </View>
      <View style={s.expansionList}>
        {revealStep >= 1 &&
          content.expansion.map((line, i) => (
            <View key={i} style={{ paddingLeft: 8 }}>
              <StudyMarkdown content={emphasizeHighYieldMarkdown(line)} compact />
            </View>
          ))}
      </View>
      {revealStep >= 2 && (
        <View style={s.hookBox}>
          <LinearText style={s.hookLabel}>💡 Tip</LinearText>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(content.tip)} compact />
        </View>
      )}
      {revealStep < 2 ? (
        <TouchableOpacity
          style={s.doneBtn}
          onPress={() => setRevealStep((i) => i + 1)}
          activeOpacity={0.8}
        >
          <LinearText style={s.doneBtnText}>
            {revealStep === 0 ? 'Decode it →' : 'Show tip →'}
          </LinearText>
        </TouchableOpacity>
      ) : !showRating ? (
        <TouchableOpacity style={s.doneBtn} onPress={() => setShowRating(true)} activeOpacity={0.8}>
          <LinearText style={s.doneBtnText}>Got it →</LinearText>
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
        <LinearText style={s.skipText}>Skip mnemonic</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
