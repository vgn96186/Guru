import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useProfileQuery, useProfileActions } from '../hooks/queries/useProfile';
import { linearTheme as n } from '../theme/linearTheme';

export default function FocusAudioPlayer() {
  const { data: profile } = useProfileQuery();
  const { toggleFocusAudio } = useProfileActions();
  const isAudioEnabled = profile?.focusAudioEnabled;

  return (
    <TouchableOpacity onPress={toggleFocusAudio} style={styles.button}>
      <Ionicons
        name={isAudioEnabled ? 'headset' : 'headset-outline'}
        size={24}
        color={isAudioEnabled ? n.colors.accent : n.colors.textMuted}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.borderLight,
  },
});
