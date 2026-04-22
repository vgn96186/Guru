import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { motion } from '../../../motion/presets';
import LinearText from '../../../components/primitives/LinearText';
import LinearSurface from '../../../components/primitives/LinearSurface';
import StudyMarkdown from '../../../components/StudyMarkdown';
import { emphasizeHighYieldMarkdown } from '../../../utils/highlightMarkdown';
import { fetchWikipediaImage } from '../../../services/imageService';
import {
  explainMostTestedRationale,
  explainTopicDeeper,
  explainQuizConcept,
} from '../../../services/ai';
import { s, FLASHCARD_RATINGS } from '../styles';
import { linearTheme as n } from '../../../theme/linearTheme';

export function ConceptChip({ concept, topicName }: { concept: string; topicName: string }) {
  const [expanded, setExpanded] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleExpand() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (explanation) return;
    setLoading(true);
    try {
      const result = await explainQuizConcept(concept, topicName);
      setExplanation(result);
    } catch {
      setExplanation('Could not load explanation.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        onPress={handleExpand}
        activeOpacity={0.8}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: expanded ? `${n.colors.accent}22` : n.colors.surface,
          borderRadius: 20,
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderWidth: 1,
          borderColor: expanded ? `${n.colors.accent}66` : n.colors.border,
          alignSelf: 'flex-start',
        }}
      >
        <Ionicons name="information-circle-outline" size={13} color={n.colors.accent} />
        <LinearText style={{ color: n.colors.textPrimary, fontSize: 12, fontWeight: '600' }}>
          {concept.length > 35 ? `${concept.slice(0, 33)}…` : concept}
        </LinearText>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={12}
          color={n.colors.textSecondary}
        />
      </TouchableOpacity>
      {expanded && (
        <View
          style={{
            backgroundColor: n.colors.surface,
            borderRadius: 10,
            padding: 12,
            marginTop: 4,
            borderWidth: 1,
            borderColor: `${n.colors.accent}33`,
          }}
        >
          {loading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ActivityIndicator size="small" color={n.colors.accent} />
              <LinearText style={{ color: n.colors.textSecondary, fontSize: 12 }}>
                Explaining...
              </LinearText>
            </View>
          ) : explanation ? (
            <StudyMarkdown content={emphasizeHighYieldMarkdown(explanation)} compact />
          ) : null}
        </View>
      )}
    </View>
  );
}
