import React from 'react';
import { View } from 'react-native';
import SettingsModelDropdown from '../../../components/SettingsModelDropdown';

interface Props {
  transcriptionProvider: string;
  setTranscriptionProvider: (v: string) => void;
}

export default function TranscriptionSection({
  transcriptionProvider,
  setTranscriptionProvider,
}: Props) {
  const options = [
    { id: 'auto', label: 'Auto (Fallback Routing)', group: 'General' },
    { id: 'groq', label: 'Groq', group: 'Providers' },
    { id: 'huggingface', label: 'Hugging Face', group: 'Providers' },
    { id: 'cloudflare', label: 'Cloudflare', group: 'Providers' },
    { id: 'deepgram', label: 'Deepgram', group: 'Providers' },
    { id: 'local', label: 'Local (Whisper)', group: 'On-Device' },
  ];

  return (
    <View style={{ marginBottom: 12 }}>
      <SettingsModelDropdown
        label="Audio Transcription"
        value={transcriptionProvider}
        onSelect={setTranscriptionProvider}
        options={options}
      />
    </View>
  );
}
