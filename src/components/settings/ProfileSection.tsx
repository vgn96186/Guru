import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { linearTheme as n } from '../../theme/linearTheme';
import LinearButton from '../primitives/LinearButton';
import LinearText from '../primitives/LinearText';

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
        <LinearText variant="bodySmall" tone="error" style={styles.syncWarning}>
          Tablet Sync is currently unavailable on this device (MQTT module missing).
        </LinearText>
      )}
      <LinearButton
        label="Link Another Device (Sync)"
        variant="outline"
        textTone={isSyncAvailable ? 'accent' : 'secondary'}
        style={[styles.linkBtn, !isSyncAvailable && styles.disabledBtn]}
        onPress={onLinkDevice}
        disabled={!isSyncAvailable}
        accessibilityLabel="Link another device for sync"
        textStyle={[styles.linkBtnText, !isSyncAvailable && styles.disabledText]}
      />

      <LinearText variant="label" style={styles.label}>
        Your Name
      </LinearText>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={onNameChange}
        placeholder="Dr. ..."
        placeholderTextColor={n.colors.textMuted}
      />
    </View>
  );
}

export default React.memo(ProfileSection);

const styles = StyleSheet.create({
  container: { gap: 12 },
  syncWarning: { color: n.colors.error, fontSize: 12, marginBottom: 8 },
  linkBtn: { marginBottom: 8 },
  disabledBtn: { opacity: 0.5 },
  linkBtnText: { fontSize: 14 },
  disabledText: { color: n.colors.textSecondary },
  label: { color: n.colors.textPrimary, fontSize: 13, fontWeight: '700' },
  input: {
    backgroundColor: n.colors.surface,
    color: n.colors.textPrimary,
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: n.colors.border,
    fontSize: 14,
  },
});
