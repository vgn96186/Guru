import React from 'react';
import { View, Text } from 'react-native';
import TranscriptionSettingsPanel from '../../../../../components/TranscriptionSettingsPanel';

interface Props {
  SubSectionToggle: any;
  styles: any;
}

export default function TranscriptionSection({ SubSectionToggle, styles }: Props) {
  return (
    <SubSectionToggle id="ai_transcription" title="TRANSCRIPTION">
      <Text style={styles.hint}>
        Configure transcription providers and keys used by Recording Vault and external lecture
        processing.
      </Text>
      <TranscriptionSettingsPanel embedded />
    </SubSectionToggle>
  );
}
