import React from 'react';
import { View, StyleSheet } from 'react-native';
import LinearButton from '../primitives/LinearButton';
import LinearText from '../primitives/LinearText';
import TextField from './TextField';

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
        variant="secondary"
        textTone={isSyncAvailable ? 'accent' : 'secondary'}
        style={[styles.linkBtn, !isSyncAvailable && styles.disabledBtn]}
        onPress={onLinkDevice}
        disabled={!isSyncAvailable}
        accessibilityLabel="Link another device for sync"
        textStyle={[styles.linkBtnText, !isSyncAvailable && styles.disabledText]}
      />

      <TextField
        label="Your Name"
        value={name}
        onChangeText={onNameChange}
        placeholder="Dr. ..."
        autoCapitalize="words"
        autoCorrect={false}
        containerStyle={styles.nameField}
      />
    </View>
  );
}

export default React.memo(ProfileSection);

// eslint-disable-next-line guru/prefer-settings-primitives -- component-level styles
const styles = StyleSheet.create({
  container: { gap: 12 },
  syncWarning: { color: '#F14C4C', fontSize: 12, marginBottom: 8 },
  linkBtn: { marginBottom: 8 },
  disabledBtn: { opacity: 0.5 },
  linkBtnText: { fontSize: 14 },
  disabledText: { color: '#A0A0A5' },
  nameField: { marginBottom: 0 },
});
