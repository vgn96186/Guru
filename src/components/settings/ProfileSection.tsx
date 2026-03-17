import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';

interface ProfileSectionProps {
  name: string;
  onNameChange: (text: string) => void;
  isSyncAvailable: boolean;
  onLinkDevice: () => void;
}

function ProfileSection({
  name,
  onNameChange,
  isSyncAvailable,
  onLinkDevice,
}: ProfileSectionProps) {
  return (
    <View style={styles.container}>
      {!isSyncAvailable && (
        <Text style={styles.syncWarning}>
          Tablet Sync is currently unavailable on this device (MQTT module missing).
        </Text>
      )}
      <TouchableOpacity
        style={[styles.linkBtn, !isSyncAvailable && styles.disabledBtn]}
        onPress={onLinkDevice}
        disabled={!isSyncAvailable}
        accessibilityRole="button"
        accessibilityLabel="Link another device for sync"
      >
        <Text style={[styles.linkBtnText, !isSyncAvailable && styles.disabledText]}>
          📱 Link Another Device (Sync)
        </Text>
      </TouchableOpacity>

      <Text style={styles.label}>Your Name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onNameChange}
        placeholder="Dr. ..."
        placeholderTextColor={theme.colors.textMuted}
      />
    </View>
  );
}

export default React.memo(ProfileSection);

const styles = StyleSheet.create({
  container: { gap: 12 },
  syncWarning: { color: theme.colors.error, fontSize: 12, marginBottom: 8 },
  linkBtn: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
  },
  disabledBtn: { opacity: 0.5 },
  linkBtnText: { color: theme.colors.primary, fontWeight: '700', fontSize: 14 },
  disabledText: { color: theme.colors.textSecondary },
  label: { color: theme.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: theme.colors.surface,
    color: theme.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    fontSize: 14,
  },
});
