import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';


import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';

// ── Deep Explanation with Reveal ─────────────────────────────────

/** Parses ||answer|| reveal blocks from deep explanation text and renders them as tap-to-reveal. */
export function DeepExplanationBlock({ explanation }: { explanation: string }) {
  // Split on the "Quick check:" line to separate main body from check question
  const quickCheckMatch = explanation.match(/^([\s\S]*?)(Quick check:[\s\S]*)$/im);
  const mainBody = quickCheckMatch ? quickCheckMatch[1].trim() : explanation.trim();
  const checkLine = quickCheckMatch ? quickCheckMatch[2].trim() : null;

  // Parse ||answer|| from the check line
  const revealMatch = checkLine?.match(/^(Quick check:.*?)\|\|(.+?)\|\|(.*)$/is);
  const checkQuestion = revealMatch ? revealMatch[1].trim() : checkLine;
  const revealAnswer = revealMatch ? revealMatch[2].trim() : null;
  const checkRemainder = revealMatch ? revealMatch[3].trim() : null;

  const [answerRevealed, setAnswerRevealed] = useState(false);

  return (
    <View
      style={[s.explBox, s.explBoxDeep, { borderLeftWidth: 3, borderLeftColor: n.colors.accent }]}
    >
      <View style={s.inlineLabelRow}>
        <Ionicons name="school-outline" size={14} color={n.colors.accent} />
        <LinearText style={s.explSectionTitle}>Deeper Explanation</LinearText>
      </View>
      <StudyMarkdown content={emphasizeHighYieldMarkdown(mainBody)} />

      {checkQuestion && (
        <View
          style={{
            marginTop: 14,
            backgroundColor: n.colors.surface,
            borderRadius: 12,
            padding: 14,
            borderWidth: 1,
            borderColor: n.colors.borderHighlight,
          }}
        >
          <View style={[s.inlineLabelRow, { marginBottom: 8 }]}>
            <Ionicons name="help-circle-outline" size={14} color={n.colors.warning} />
            <LinearText style={[s.explSectionTitle, { color: n.colors.warning }]}>
              Check Your Understanding
            </LinearText>
          </View>
          <LinearText style={{ color: n.colors.textPrimary, fontSize: 14, lineHeight: 20 }}>
            {checkQuestion.replace(/^Quick check:\s*/i, '')}
          </LinearText>
          {checkRemainder ? (
            <LinearText style={{ color: n.colors.textSecondary, fontSize: 13, marginTop: 4 }}>
              {checkRemainder}
            </LinearText>
          ) : null}
          {revealAnswer && !answerRevealed && (
            <TouchableOpacity
              style={{
                marginTop: 10,
                backgroundColor: `${n.colors.warning}22`,
                borderRadius: 10,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderWidth: 1,
                borderColor: `${n.colors.warning}55`,
                alignItems: 'center',
              }}
              onPress={() => setAnswerRevealed(true)}
              activeOpacity={0.8}
            >
              <LinearText style={{ color: n.colors.warning, fontWeight: '700', fontSize: 13 }}>
                Reveal Answer
              </LinearText>
            </TouchableOpacity>
          )}
          {revealAnswer && answerRevealed && (
            <View
              style={{
                marginTop: 10,
                backgroundColor: `${n.colors.success}11`,
                borderRadius: 10,
                padding: 12,
                borderWidth: 1,
                borderColor: `${n.colors.success}33`,
              }}
            >
              <StudyMarkdown content={emphasizeHighYieldMarkdown(revealAnswer)} compact />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
