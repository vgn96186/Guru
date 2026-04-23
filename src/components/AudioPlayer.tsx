import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import LinearText from './primitives/LinearText';
import LinearSurface from './primitives/LinearSurface';
import { linearTheme as n } from '../theme/linearTheme';

export default function AudioPlayer({ uri }: { uri: string }) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [barWidth, setBarWidth] = useState(0);

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const handlePlayPause = async () => {
    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
    } else {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded) {
            setPosition(status.positionMillis);
            setDuration(status.durationMillis || 0);
            setIsPlaying(status.isPlaying);
          }
        },
      );
      setSound(newSound);
      setIsPlaying(true);
    }
  };

  const seekTo = async (targetMs: number) => {
    if (!sound) return;
    const clamped = Math.max(0, Math.min(duration, targetMs));
    await sound.setPositionAsync(clamped);
    setPosition(clamped);
  };

  const jumpBy = async (deltaMs: number) => {
    await seekTo(position + deltaMs);
  };

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <LinearSurface padded={false} style={audioStyles.container}>
      <TouchableOpacity onPress={handlePlayPause} style={audioStyles.playBtn}>
        <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={n.colors.textInverse} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void jumpBy(-10000)} style={audioStyles.jumpBtn}>
        <LinearText style={audioStyles.jumpBtnText}>-10s</LinearText>
      </TouchableOpacity>
      <View style={audioStyles.progressWrap}>
        <Pressable
          style={audioStyles.progressBar}
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            if (!duration || barWidth <= 0) return;
            const next = (event.nativeEvent.locationX / barWidth) * duration;
            void seekTo(next);
          }}
        >
          <View
            style={[
              audioStyles.progressFill,
              { width: `${duration > 0 ? (position / duration) * 100 : 0}%` },
            ]}
          />
        </Pressable>
        <View style={audioStyles.timeRow}>
          <LinearText style={audioStyles.timeText}>{formatTime(position)}</LinearText>
          <LinearText style={audioStyles.timeText}>{formatTime(duration)}</LinearText>
        </View>
      </View>
      <TouchableOpacity onPress={() => void jumpBy(10000)} style={audioStyles.jumpBtn}>
        <LinearText style={audioStyles.jumpBtnText}>+10s</LinearText>
      </TouchableOpacity>
    </LinearSurface>
  );
}

const audioStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: n.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  jumpBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: n.colors.surface,
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  jumpBtnText: { color: n.colors.textPrimary, fontSize: 11, fontWeight: '700' },
  progressWrap: { flex: 1, gap: 4 },
  progressBar: {
    height: 4,
    backgroundColor: n.colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: n.colors.accent },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { color: n.colors.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular' },
});
