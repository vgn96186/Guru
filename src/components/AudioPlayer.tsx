import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View, Pressable } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Ionicons } from '@expo/vector-icons';
import LinearText from './primitives/LinearText';
import LinearSurface from './primitives/LinearSurface';
import { linearTheme as n } from '../theme/linearTheme';

export default function AudioPlayer({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri, { updateInterval: 250, downloadFirst: true });
  const status = useAudioPlayerStatus(player);
  const [barWidth, setBarWidth] = useState(0);

  const handlePlayPause = async () => {
    if (status.playing) {
      player.pause();
      return;
    }

    if (status.duration > 0 && status.currentTime >= status.duration) {
      await player.seekTo(0);
    }

    player.play();
  };

  const seekTo = async (targetMs: number) => {
    const durationMs = Math.max(0, status.duration * 1000);
    const clamped = Math.max(0, Math.min(durationMs, targetMs));
    await player.seekTo(clamped / 1000);
  };

  const jumpBy = async (deltaMs: number) => {
    const positionMs = Math.max(0, status.currentTime * 1000);
    await seekTo(positionMs + deltaMs);
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
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={24}
          color={n.colors.textInverse}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void jumpBy(-10000)} style={audioStyles.jumpBtn}>
        <LinearText style={audioStyles.jumpBtnText}>-10s</LinearText>
      </TouchableOpacity>
      <View style={audioStyles.progressWrap}>
        <Pressable
          style={audioStyles.progressBar}
          onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
          onPress={(event) => {
            const durationMs = Math.max(0, status.duration * 1000);
            if (!durationMs || barWidth <= 0) return;
            const next = (event.nativeEvent.locationX / barWidth) * durationMs;
            void seekTo(next);
          }}
        >
          <View
            style={[
              audioStyles.progressFill,
              {
                width: `${(() => {
                  const durationMs = Math.max(0, status.duration * 1000);
                  const positionMs = Math.max(0, status.currentTime * 1000);
                  return durationMs > 0 ? (positionMs / durationMs) * 100 : 0;
                })()}%`,
              },
            ]}
          />
        </Pressable>
        <View style={audioStyles.timeRow}>
          <LinearText style={audioStyles.timeText}>
            {formatTime(Math.max(0, status.currentTime * 1000))}
          </LinearText>
          <LinearText style={audioStyles.timeText}>
            {formatTime(Math.max(0, status.duration * 1000))}
          </LinearText>
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
