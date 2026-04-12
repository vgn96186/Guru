import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAppStore } from '../store/useAppStore';
import { linearTheme as n } from '../theme/linearTheme';

export default function FocusAudioPlayer() {
  const isAudioEnabled = useAppStore((s) => s.profile?.focusAudioEnabled);
  const toggleAudio = useAppStore((s) => s.toggleFocusAudio);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    async function initAudio() {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });

        // Use bundled asset; falls back to white noise generation if missing
        const { sound: newSound } = await Audio.Sound.createAsync(
          require('../../assets/rain.mp3'),
          { shouldPlay: false, isLooping: true, volume: 0.5 },
        );

        if (isMountedRef.current) {
          soundRef.current = newSound;
          setSound(newSound);
        } else {
          await newSound.unloadAsync();
        }
      } catch {
        // Asset missing — silently disable audio feature
      }
    }

    initAudio();

    return () => {
      isMountedRef.current = false;
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch((err) => {
          console.warn('[FocusAudioPlayer] Failed to unload sound:', err);
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!sound) return;

    if (isAudioEnabled) {
      sound.playAsync().catch((err) => {
        console.warn('[FocusAudioPlayer] Failed to play sound:', err);
      });
    } else {
      sound.pauseAsync().catch((err) => {
        console.warn('[FocusAudioPlayer] Failed to pause sound:', err);
      });
    }
  }, [isAudioEnabled, sound]);

  return (
    <TouchableOpacity onPress={toggleAudio} style={styles.button}>
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
