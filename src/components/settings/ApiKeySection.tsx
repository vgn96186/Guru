import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';

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
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>AI API KEYS</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Groq API Key (Fastest)</Text>
        <TextInput
          style={styles.input}
          value={groqKey}
          onChangeText={onGroqKeyChange}
          placeholder="gsk_..."
          placeholderTextColor={n.colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Used for high-speed transcription and note generation.</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>OpenRouter API Key (Fallback)</Text>
        <TextInput
          style={styles.input}
          value={openRouterKey}
          onChangeText={onOpenRouterKeyChange}
          placeholder="sk-or-v1-..."
          placeholderTextColor={n.colors.textMuted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.hint}>Fallback for complex reasoning when Groq is unavailable.</Text>
      </View>
    </View>
  );
}

export default React.memo(ApiKeySection);

const styles = StyleSheet.create({
  section: {
    backgroundColor: n.colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: n.colors.border,
    marginBottom: 20,
  },
  sectionTitle: {
    color: n.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 16 },
  label: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    backgroundColor: n.colors.surface,
    color: n.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    fontSize: 14,
  },
  hint: { color: n.colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 16 },
});
