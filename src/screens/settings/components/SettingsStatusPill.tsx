import React from 'react';
import { View } from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import { linearTheme as n } from '../../../theme/linearTheme';

type StatusTone = 'success' | 'warning' | 'error' | 'muted' | 'accent';

const TONE_COLORS: Record<StatusTone, { text: string; bg: string; border: string }> = {
  success: {
    text: n.colors.success,
    bg: n.colors.successSurface,
    border: n.colors.success,
  },
  warning: {
    text: n.colors.warning,
    bg: 'rgba(245, 158, 11, 0.12)',
    border: n.colors.warning,
  },
  error: {
    text: n.colors.error,
    bg: n.colors.errorSurface,
    border: n.colors.error,
  },
  muted: {
    text: n.colors.textMuted,
    bg: n.colors.background,
    border: n.colors.border,
  },
  accent: {
    text: n.colors.accent,
    bg: n.colors.primaryTintSoft,
    border: n.colors.borderHighlight,
  },
};

export function SettingsStatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  const colors = TONE_COLORS[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 999,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}
    >
      <LinearText variant="caption" style={{ color: colors.text, fontWeight: '800' }}>
        {label}
      </LinearText>
    </View>
  );
}
