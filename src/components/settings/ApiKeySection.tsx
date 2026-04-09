import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearText from '../primitives/LinearText';

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
      <LinearText variant="sectionTitle" tone="muted" style={styles.sectionTitle}>
        AI API KEYS
      </LinearText>

      <View style={styles.inputGroup}>
        <LinearText variant="label" style={styles.label}>
          Groq API Key (Fastest)
        </LinearText>
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
        <LinearText variant="bodySmall" tone="muted" style={styles.hint}>
          Used for high-speed transcription and note generation.
        </LinearText>
      </View>

      <View style={styles.inputGroup}>
        <LinearText variant="label" style={styles.label}>
          OpenRouter API Key (Fallback)
        </LinearText>
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
        <LinearText variant="bodySmall" tone="muted" style={styles.hint}>
          Fallback for complex reasoning when Groq is unavailable.
        </LinearText>
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
