import React, { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useAppStore } from '../store/useAppStore';

export default function FocusAudioPlayer() {
    const isAudioEnabled = useAppStore(s => s.profile?.focusAudioEnabled);
    const toggleAudio = useAppStore(s => s.toggleFocusAudio);
    const [sound, setSound] = useState<Audio.Sound | null>(null);

    useEffect(() => {
        async function initAudio() {
            // Configure audio session to duck other audio if needed, but keep playing.
            await Audio.setAudioModeAsync({
                playsInSilentModeIOS: true,
                staysActiveInBackground: false, // We stop it when they leave the app
                shouldDuckAndroid: true,
            });

            // For this MVP, we will try to load a remote dummy file if a local asset doesn't exist.
            // In a real build, this would `require('../../assets/brown_noise.mp3')`
            // Since we don't have the asset locally, we'll gracefully handle it or just use an empty object for UI.
            try {
                const { sound: newSound } = await Audio.Sound.createAsync(
                    { uri: 'https://actions.google.com/sounds/v1/weather/rain_on_roof.ogg' },
                    { shouldPlay: false, isLooping: true, volume: 0.5 }
                );
                setSound(newSound);
            } catch (e) {
                console.log("Audio file failed to load", e);
            }
        }

        initAudio();

        return () => {
            if (sound) {
                sound.unloadAsync();
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
