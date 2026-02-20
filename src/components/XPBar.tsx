import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import type { LevelInfo } from '../types';

interface Props {
  levelInfo: LevelInfo;
  totalXp: number;
}

export default function XPBar({ levelInfo, totalXp }: Props) {
  const animWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animWidth, {
      toValue: levelInfo.progress,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [levelInfo.progress]);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.levelName}>{levelInfo.name}</Text>
        <Text style={styles.xp}>{totalXp} XP</Text>
      </View>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.fill,
            { width: animWidth.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </View>
      <Text style={styles.next}>
        Lv {levelInfo.level} → {levelInfo.level + 1}: {levelInfo.xpForNext - totalXp} XP to go
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  levelName: { color: '#6C63FF', fontWeight: '700', fontSize: 13 },
  xp: { color: '#9E9E9E', fontSize: 12 },
  track: { height: 6, backgroundColor: '#2A2A38', borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#6C63FF', borderRadius: 3 },
  next: { color: '#555', fontSize: 10, marginTop: 2, textAlign: 'right' },
});
