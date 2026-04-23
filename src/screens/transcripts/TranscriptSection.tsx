import React, { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import LinearText from '../../components/primitives/LinearText';
import LinearSurface from '../../components/primitives/LinearSurface';
import { linearTheme as n } from '../../theme/linearTheme';
import { loadTranscriptFromFile } from '../../services/transcriptStorage';

export default function TranscriptSection({ transcript }: { transcript: string }) {
  const [content, setContent] = React.useState<string>('Loading transcript...');
  React.useEffect(() => {
    loadTranscriptFromFile(transcript).then((res: string | null) =>
      setContent(res || 'No transcript available.'),
    );
  }, [transcript]);
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={{ marginBottom: 20 }}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
        activeOpacity={0.7}
      >
        <LinearText
          style={{
            color: n.colors.textMuted,
            fontSize: 12,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          Raw Transcript
        </LinearText>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={n.colors.textMuted}
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>
      {expanded && (
        <LinearSurface padded={false} style={styles.transcriptCard}>
          <LinearText style={styles.transcriptText}>{content}</LinearText>
        </LinearSurface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  transcriptText: {
    color: n.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    fontFamily: 'Inter_400Regular',
    padding: 12,
    borderRadius: 8,
  },
  transcriptCard: {
    borderRadius: 8,
  },
});
