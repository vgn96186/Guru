import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './LectureReturnSheet.styles';
import { linearTheme as n } from '../../theme/linearTheme';
import { CONFIDENCE_LABELS, CONFIDENCE_LABELS_WITH_EMOJI } from '../../constants/gamification';

interface Props {
  userConfidence: 1 | 2 | 3 | null;
  estimatedConfidence: 1 | 2 | 3;
  setUserConfidence: (level: 1 | 2 | 3) => void;
}

export function LectureReturnConfidenceSelector({ userConfidence, estimatedConfidence, setUserConfidence }: Props) {
  return (
    <View style={styles.confidenceSection}>
      <Text style={styles.sectionLabel}>YOUR CONFIDENCE LEVEL</Text>
      <View style={styles.confidenceSelector}>
        {([1, 2, 3] as const).map((level) => {
          const isSelected = (userConfidence ?? estimatedConfidence) === level;
          const colors = {
            1: n.colors.error,
            2: n.colors.warning,
            3: n.colors.success,
          };
          return (
            <TouchableOpacity
              key={level}
              style={[
                styles.confidenceOption,
                isSelected && {
                  backgroundColor: colors[level] + '33',
                  borderColor: colors[level],
                },
              ]}
              onPress={() => setUserConfidence(level)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.confidenceOptionText,
                  isSelected && { color: colors[level] },
                ]}
              >
                {CONFIDENCE_LABELS_WITH_EMOJI[level]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {userConfidence && userConfidence !== estimatedConfidence && (
        <Text style={styles.confidenceOverrideNote}>
          AI detected "{CONFIDENCE_LABELS[estimatedConfidence as 1 | 2 | 3]}"
          — you're overriding to your selection
        </Text>
      )}
    </View>
  );
}
