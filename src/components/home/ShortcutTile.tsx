import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';
import AppText from '../AppText';

interface ShortcutTileProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export default React.memo(function ShortcutTile({
  title,
  icon,
  accent,
  onPress,
  accessibilityLabel,
  testID,
}: ShortcutTileProps) {
  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.75}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${accent}18` }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <AppText
        style={styles.title}
        numberOfLines={2}
        ellipsizeMode="tail"
        variant="caption"
        tone="secondary"
      >
        {title}
      </AppText>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '22%',
    minHeight: 104,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
    letterSpacing: 0.2,
    width: '100%',
  },
});
