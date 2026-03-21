import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { theme } from '../../constants/theme';

type OverlayKey = 'btr' | 'dbmci' | 'marrow' | 'connections';

interface OverlayState {
  btr: boolean;
  dbmci: boolean;
  marrow: boolean;
  connections: boolean;
}

export interface SourceOverlayToggleProps {
  value: OverlayState;
  onToggle: (key: OverlayKey) => void;
}

const OVERLAYS: Array<{ key: OverlayKey; label: string; hint: string }> = [
  { key: 'btr', label: 'BTR', hint: 'High-yield pass' },
  { key: 'dbmci', label: 'DBMCI', hint: 'Depth layer' },
  { key: 'marrow', label: 'Marrow', hint: 'Questions and PYQs' },
  { key: 'connections', label: 'Connections', hint: 'Cross-topic links' },
];

export default function SourceOverlayToggle({ value, onToggle }: SourceOverlayToggleProps) {
  const activeCount = OVERLAYS.filter((overlay) => value[overlay.key]).length;

  return (
    <View style={styles.card}>
      <View style={styles.accentRail} />
      <Text style={styles.eyebrow}>Overlays</Text>
      <Text style={styles.title}>Source layers</Text>
      <Text style={styles.body}>
        Keep the atlas calm by revealing only the layers you need. {activeCount} active right now.
      </Text>
      <View style={styles.grid}>
        {OVERLAYS.map((overlay) => {
          const active = value[overlay.key];
          return (
            <Pressable
              key={overlay.key}
              style={[styles.toggle, active && styles.toggleActive]}
              onPress={() => onToggle(overlay.key)}
              accessibilityRole="switch"
              accessibilityState={{ checked: active }}
              accessibilityLabel={overlay.label}
            >
              <View style={[styles.dot, active && styles.dotActive]} />
              <View style={styles.copy}>
                <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>{overlay.label}</Text>
                <Text style={styles.hint}>{overlay.hint}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 240,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10, 14, 24, 0.82)',
    padding: theme.spacing.lg,
    overflow: 'hidden',
  },
  accentRail: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(127, 90, 240, 0.52)',
  },
  eyebrow: {
    color: '#97A9FF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: theme.spacing.sm,
  },
  body: {
    color: '#9BA7BF',
    fontSize: 13,
    lineHeight: 19,
    marginTop: theme.spacing.sm,
  },
  grid: {
    marginTop: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
  },
  toggleActive: {
    borderColor: 'rgba(72, 184, 255, 0.26)',
    backgroundColor: 'rgba(72, 184, 255, 0.08)',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  dotActive: {
    borderColor: 'rgba(72, 184, 255, 0.95)',
    backgroundColor: '#48B8FF',
    shadowColor: '#48B8FF',
    shadowOpacity: 0.45,
    shadowRadius: 6,
  },
  copy: {
    flex: 1,
  },
  toggleLabel: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  toggleLabelActive: {
    color: '#EAF5FF',
  },
  hint: {
    color: '#8EA2C1',
    fontSize: 11,
    marginTop: 3,
  },
});
