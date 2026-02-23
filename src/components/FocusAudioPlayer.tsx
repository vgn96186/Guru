import React, { useEffect, useRef, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAppStore } from '../store/useAppStore';

export default function FocusAudioPlayer() {
    const isAudioEnabled = useAppStore(s => s.profile?.focusAudioEnabled);
    const toggleAudio = useAppStore(s => s.toggleFocusAudio);
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const soundRef = useRef<Audio.Sound | null>(null);

    useEffect(() => {
        async function initAudio() {
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false,
                shouldDuckAndroid: true,
            });

            try {
                // Use bundled asset; falls back to white noise generation if missing
                const { sound: newSound } = await Audio.Sound.createAsync(
                    require('../../assets/rain.mp3'),
                    { shouldPlay: false, isLooping: true, volume: 0.5 }
                );
                soundRef.current = newSound;
                setSound(newSound);
            } catch {
                // Asset missing — silently disable audio feature
            }
        }

        initAudio();

        return () => {
            if (soundRef.current) {
                soundRef.current.unloadAsync();
            }
        };
    }, []);

    useEffect(() => {
        if (!sound) return;

        if (isAudioEnabled) {
            sound.playAsync();
        } else {
            sound.pauseAsync();
        }
    }, [isAudioEnabled, sound]);

    return (
        <TouchableOpacity onPress={toggleAudio} style={styles.button}>
            <Ionicons
                name={isAudioEnabled ? "headset" : "headset-outline"}
                size={24}
                color={isAudioEnabled ? "#6C63FF" : "#9E9E9E"}
            />
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        padding: 8,
        borderRadius: 20,
        backgroundColor: '#1A1A24',
        borderWidth: 1,
        borderColor: '#333344',
    }
});
