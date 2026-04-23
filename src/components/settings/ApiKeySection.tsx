import React from 'react';
import SettingsSection from './SettingsSection';
import TextField from './TextField';

interface ApiKeySectionProps {
  groqKey: string;
  onGroqKeyChange: (text: string) => void;
  openRouterKey: string;
  onOpenRouterKeyChange: (text: string) => void;
}

function ApiKeySection({
  groqKey,
  onGroqKeyChange,
  openRouterKey,
  onOpenRouterKeyChange,
}: ApiKeySectionProps) {
  return (
    <SettingsSection title="AI API KEYS">
      <TextField
        label="Groq API Key (Fastest)"
        value={groqKey}
        onChangeText={onGroqKeyChange}
        placeholder="gsk_..."
        secureTextEntry
        hint="Used for high-speed transcription and note generation."
      />
      <TextField
        label="OpenRouter API Key (Fallback)"
        value={openRouterKey}
        onChangeText={onOpenRouterKeyChange}
        placeholder="sk-or-v1-..."
        secureTextEntry
        hint="Fallback for complex reasoning when Groq is unavailable."
        containerStyle={styles.lastField}
      />
    </SettingsSection>
  );
}

export default React.memo(ApiKeySection);

const styles = {
  lastField: { marginBottom: 0 },
};
