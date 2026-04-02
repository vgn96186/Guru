import React from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../../theme/linearTheme';
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
        <Ionicons name={icon} size={18} color={accent} />
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
    minWidth: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: n.radius.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    letterSpacing: 0.2,
    flex: 1,
  },
});
