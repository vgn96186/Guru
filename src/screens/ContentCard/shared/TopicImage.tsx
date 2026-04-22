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

export interface TopicImageProps {
  topicName: string;
}
export const TopicImage = React.memo(function TopicImage({ topicName }: TopicImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    fetchWikipediaImage(topicName).then((url) => {
      if (!active) return;
      setFailed(false);
      setImageUrl(url);
    });
    return () => {
      active = false;
    };
  }, [topicName]);

  if (!imageUrl) return null;
  if (failed) return null;

  return (
    <Image
      source={{ uri: imageUrl }}
      style={s.topicImage}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
});
