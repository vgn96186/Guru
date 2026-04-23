import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { styles } from './LectureReturnSheet.styles';

interface Props {
  topics: string[];
  onToggleTopic: (topic: string) => void;
}

export function LectureReturnTopicRow({ topics, onToggleTopic }: Props) {
  if (topics.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>TOPICS DETECTED</Text>
      <View style={styles.topicRow}>
        {topics.map((t, i) => (
          <TouchableOpacity
            key={`${t}-${i}`}
            style={styles.topicPillEditable}
            onPress={() => onToggleTopic(t)}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={`Remove topic: ${t}`}
          >
            <Text style={styles.topicPillText}>{t}</Text>
            <Text style={styles.topicRemoveIcon}>×</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.topicHint}>Tap a topic to remove it</Text>
    </View>
  );
}
