import React, { useEffect, useMemo } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useProfileQuery, useProfileActions } from '../hooks/queries/useProfile';
import { linearTheme as n } from '../theme/linearTheme';

const FOCUS_AUDIO_URL = 'https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3';

export default function FocusAudioPlayer() {
  const { data: profile } = useProfileQuery();
  const { toggleFocusAudio } = useProfileActions();
  const isAudioEnabled = profile?.focusAudioEnabled;

  const player = useMemo(() => {
    return createAudioPlayer(FOCUS_AUDIO_URL, { updateInterval: 1000, downloadFirst: true });
  }, []);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});

    player.loop = true;
    player.volume = 0.5;

    return () => {
      try {
        player.remove();
      } catch {}
    };
  }, [player]);

  useEffect(() => {
    if (!isAudioEnabled) {
      try {
        player.pause();
      } catch {}
      return;
    }
    try {
      player.play();
    } catch {}
  }, [isAudioEnabled, player]);

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
