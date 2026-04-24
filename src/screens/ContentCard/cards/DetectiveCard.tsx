import React, { useState, useEffect } from 'react';
import { View, ScrollView, TouchableOpacity } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';

import { ContentFlagButton } from '../../../components/ContentFlagButton';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';
import { Props, ContextUpdater } from '../types';
import type { DetectiveContent } from '../../../types';
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
// ── Teach Back ────────────────────────────────────────────────────
// ── Error Hunt ────────────────────────────────────────────────────
// ── Detective ─────────────────────────────────────────────────────

export function DetectiveCard({
  content,
  topicId,
  contentType,
  onDone,
  onSkip,
  onContextChange,
}: { content: DetectiveContent; onContextChange?: ContextUpdater } & Omit<Props, 'content'>) {
  const [revealedClues, setRevealedClues] = useState(1);
  const [solved, setSolved] = useState(false);

  useEffect(() => {
    onContextChange?.(
      compactLines(
        [
          'Card type: Detective',
          `Diagnosis (Student shouldn't know yet unless solved): ${content.answer}`,
          `Explanation: ${content.explanation}`,
          `All Clues: ${content.clues.join(' | ')}`,
          `Visible Clues count: ${revealedClues}`,
          solved ? 'Student has solved/seen result.' : 'Student is still investigating.',
        ],
        7,
      ),
    );
  }, [content, onContextChange, revealedClues, solved]);
  const scrollContentStyle = useCardScrollContentStyle(0);
  return (
    <ScrollView style={s.scroll} contentContainerStyle={scrollContentStyle}>
      <LinearText style={s.cardType}>🕵️ CLINICAL DETECTIVE</LinearText>
      <View style={s.cardHeader}>
        <LinearText style={s.cardTitle} numberOfLines={3} ellipsizeMode="tail">
          {content.topicName}
        </LinearText>
        {topicId && contentType && (
          <ContentFlagButton topicId={topicId} contentType={contentType} />
        )}
      </View>
      <TopicImage topicName={content.topicName} />
      {content.clues.slice(0, revealedClues).map((clue, i) => (
        <View key={i} style={[s.clueBox, i === revealedClues - 1 && s.clueBoxNew]}>
          <LinearText style={s.clueNum}>Clue {i + 1}</LinearText>
          <LinearText style={s.clueText}>{clue}</LinearText>
        </View>
      ))}
      {!solved ? (
        <View style={s.detectiveActions}>
          {revealedClues < content.clues.length && (
            <TouchableOpacity
              style={[s.doneBtn, s.hintBtn]}
              onPress={() => setRevealedClues((c) => c + 1)}
              activeOpacity={0.8}
            >
              <LinearText style={s.doneBtnText}>Reveal next clue</LinearText>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={() => setSolved(true)} activeOpacity={0.8}>
            <LinearText style={s.doneBtnText}>I know the answer →</LinearText>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.iDontKnowBtn}
            onPress={() => {
              setRevealedClues(content.clues.length);
              setSolved(true);
            }}
            activeOpacity={0.8}
          >
            <LinearText style={s.iDontKnowText}>I don't know</LinearText>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.explBox}>
            <LinearText style={s.explLabel}>Diagnosis:</LinearText>
            <LinearText
              style={[s.explText, { color: n.colors.success, fontSize: 18, fontWeight: '700' }]}
            >
              {content.answer}
            </LinearText>
            <View style={{ marginTop: 4 }}>
              <StudyMarkdown content={emphasizeHighYieldMarkdown(content.explanation)} />
            </View>
          </View>
          <ConfidenceRating onRate={onDone} />
        </>
      )}
      <TouchableOpacity
        onPress={onSkip}
        style={s.skipBtn}
        accessibilityRole="button"
        accessibilityLabel="Skip"
      >
        <LinearText style={s.skipText}>Skip case</LinearText>
      </TouchableOpacity>
    </ScrollView>
  );
}
