import React from 'react';
import {
  StyleSheet,
  Switch,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import LinearText from '../../../components/primitives/LinearText';
import type { LinearTextTone } from '../../../components/primitives/LinearText';
import { linearTheme } from '../../../theme/linearTheme';

interface SettingsToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  labelIcon?: React.ReactNode;
  activeTrackColor?: string;
  inactiveTrackColor?: string;
  thumbColor?: string;
  hintTone?: LinearTextTone;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  hintStyle?: StyleProp<TextStyle>;
}

export default function SettingsToggleRow({
  label,
  hint,
  value,
  onValueChange,
  labelIcon,
  activeTrackColor = linearTheme.colors.accent,
  inactiveTrackColor = linearTheme.colors.border,
  thumbColor = linearTheme.colors.textPrimary,
  hintTone = 'muted',
  disabled = false,
  style,
  contentStyle,
  labelStyle,
  hintStyle,
}: SettingsToggleRowProps) {
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.copy, contentStyle]}>
        <View style={styles.labelRow}>
          {labelIcon}
          <LinearText variant="label" style={[styles.label, labelStyle]}>
            {label}
          </LinearText>
        </View>
        {hint ? (
          <LinearText variant="body" tone={hintTone} style={[styles.hint, hintStyle]}>
            {hint}
          </LinearText>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: activeTrackColor, false: inactiveTrackColor }}
        thumbColor={thumbColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  copy: {
    flex: 1,
    paddingRight: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: {
    color: linearTheme.colors.textPrimary,
    fontWeight: '600',
    fontSize: 15,
    marginBottom: 0,
  },
  hint: {
    color: linearTheme.colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
});
