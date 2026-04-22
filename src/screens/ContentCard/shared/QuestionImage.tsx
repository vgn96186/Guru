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

/** Per-question medical image with tap-to-enlarge lightbox. */
export const QuestionImage = React.memo(function QuestionImage({
  url,
  onFailed,
}: {
  url: string;
  onFailed?: () => void;
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const { width: screenW, height: screenH } = useWindowDimensions();

  function handleError() {
    setFailed(true);
    onFailed?.();
  }

  if (failed) {
    return (
      <View
        style={{
          backgroundColor: `${n.colors.border}55`,
          borderRadius: 10,
          paddingVertical: 12,
          paddingHorizontal: 16,
          marginBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: n.colors.border,
        }}
      >
        <Ionicons name="image-outline" size={16} color={n.colors.textMuted} />
        <LinearText style={{ color: n.colors.textMuted, fontSize: 12, fontStyle: 'italic' }}>
          Image could not be loaded
        </LinearText>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setLightboxOpen(true)}>
        <Image
          source={{ uri: url }}
          style={s.questionImage}
          resizeMode="contain"
          onError={handleError}
        />
        <LinearText style={s.tapToEnlarge}>Tap to enlarge</LinearText>
      </TouchableOpacity>
      <Modal
        visible={lightboxOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLightboxOpen(false)}
      >
        <Pressable style={s.lightboxBackdrop} onPress={() => setLightboxOpen(false)}>
          <Image
            source={{ uri: url }}
            style={{ width: screenW * 0.95, height: screenH * 0.7 }}
            resizeMode="contain"
          />
        </Pressable>
      </Modal>
    </>
  );
});
