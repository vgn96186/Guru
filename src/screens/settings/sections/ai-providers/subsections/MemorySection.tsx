import React from 'react';
import { linearTheme } from '../../../../../theme/linearTheme';
import LinearTextInput from '../../../../../components/primitives/LinearTextInput';

interface Props {
  guruMemory: { notes: string; setNotes: (s: string) => void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function MemorySection({ guruMemory, SectionToggle, styles: _styles }: Props) {
  const { notes, setNotes } = guruMemory;

  return (
    <SectionToggle id="ai_memory" title="Guru Memory" icon="bulb" tint="#EC4899">
      <LinearTextInput
        containerStyle={{ minHeight: 96, alignItems: 'flex-start', paddingVertical: 8 }}
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
