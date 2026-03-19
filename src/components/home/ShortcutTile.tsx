import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { theme } from '../../constants/theme';

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
      activeOpacity={0.8}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={[styles.iconWrap, { backgroundColor: `${accent}1F`, borderColor: `${accent}44` }]}
      >
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
        {title}
      </Text>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '30%',
    minHeight: 44,
    backgroundColor: theme.colors.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 16,
  },
});
