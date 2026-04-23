import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../../components/primitives/LinearText';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';
import {
  explainMostTestedRationale,
} from '../../../services/ai';
import { s } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';

// ── Must Know & Most Tested ──────────────────────────────────────

export function ExplainablePoint({
  item,
  topicName,
  color,
}: {
  item: string;
  topicName: string;
  color: string;
}) {
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExplain() {
    if (explanation) return;
    setLoading(true);
    try {
      const resp = await explainMostTestedRationale(item, topicName);
      setExplanation(resp);
    } catch {
      setExplanation('Could not load explanation. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[s.mkItem, { borderLeftColor: color }]}>
      <StudyMarkdown content={emphasizeHighYieldMarkdown(item)} compact />
      {explanation ? (
        <View style={s.explSection}>
          <LinearText style={s.explSectionTitle}>GURU'S EXPLANATION</LinearText>
          <StudyMarkdown content={emphasizeHighYieldMarkdown(explanation)} />
        </View>
      ) : loading ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 }}>
          <ActivityIndicator size="small" color={n.colors.accent} />
          <LinearText style={{ color: n.colors.textSecondary, fontSize: 13, fontStyle: 'italic' }}>
            Explaining...
          </LinearText>
        </View>
      ) : (
        <TouchableOpacity style={s.smallExplainBtn} onPress={handleExplain} activeOpacity={0.8}>
          <Ionicons name="sparkles" size={14} color={n.colors.accent} />
          <LinearText style={s.smallExplainText}>Explain this</LinearText>
        </TouchableOpacity>
      )}
    </View>
  );
}
