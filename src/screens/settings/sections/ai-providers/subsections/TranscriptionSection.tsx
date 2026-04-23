import React from 'react';
import { Text } from 'react-native';
import TranscriptionSettingsPanel from '../../../../../components/TranscriptionSettingsPanel';

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  SectionToggle: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic/trusted type
  styles: any;
}

export default function TranscriptionSection({ SectionToggle, styles }: Props) {
  return (
    <SectionToggle id="ai_transcription" title="Audio Transcription" icon="mic" tint="#10B981">
      <Text style={styles.hint}>
        Configure transcription providers and keys used by Recording Vault and external lecture
        processing.
      </Text>
      <TranscriptionSettingsPanel embedded />
    </SectionToggle>
  );
}
