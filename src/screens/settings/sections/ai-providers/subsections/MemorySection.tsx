import React from 'react';
import { Text } from 'react-native';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';

interface Props {
  guruMemory: { notes: string; setNotes: (s: string) => void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function MemorySection({ guruMemory, SectionToggle, styles }: Props) {
  const { notes, setNotes } = guruMemory;

  return (
    <SectionToggle id="ai_memory" title="Guru Memory" icon="brain" tint="#EC4899">
      <Text style={styles.hint}>
        Persistent notes Guru uses in every chat. Session memory is built automatically.
      </Text>
      <LinearTextInput
        style={[styles.input, styles.guruMemoryInput]}
        placeholder="e.g. INICET May 2026 · weak in renal · prefers concise answers"
        placeholderTextColor={linearTheme.colors.textMuted}
        value={notes}
        onChangeText={setNotes}
        multiline
        textAlignVertical="top"
        autoCapitalize="sentences"
        autoCorrect={true}
      />
    </SectionToggle>
  );
}
