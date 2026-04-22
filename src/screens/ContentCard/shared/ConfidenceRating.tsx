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

export function ConfidenceRating({ onRate }: { onRate: (n: number) => void }) {
  return (
    <View style={s.ratingContainer}>
      <LinearText style={s.ratingTitle}>How well did you get this?</LinearText>
      <View style={s.ratingRow}>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.error }]}
          onPress={() => onRate(0)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.error, fontSize: 15 }]}>
            Not yet
          </LinearText>
          <LinearText style={s.ratingLabel}>😕</LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.warning }]}
          onPress={() => onRate(1)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.warning, fontSize: 15 }]}>
            Will forget
          </LinearText>
          <LinearText style={s.ratingLabel}>🤔</LinearText>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ratingBtn, { flex: 1, borderColor: n.colors.success }]}
          onPress={() => onRate(3)}
          activeOpacity={0.8}
        >
          <LinearText style={[s.ratingNum, { color: n.colors.success, fontSize: 15 }]}>
            Got it!
          </LinearText>
          <LinearText style={s.ratingLabel}>🔥</LinearText>
        </TouchableOpacity>
      </View>
    </View>
  );
}
