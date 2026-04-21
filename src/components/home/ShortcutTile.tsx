import React, { type ComponentProps } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../../theme/linearTheme';
import { density } from '../../theme/density';
import { HIT_SIZE } from '../../theme/a11y';
import LinearText from '../primitives/LinearText';
import Icon from '../primitives/Icon';

interface ShortcutTileProps {
  title: string;
  icon: ComponentProps<typeof Icon>['name'];
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
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
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
        <Icon name={icon} size="md" color={accent} />
      </View>
      <LinearText
        style={styles.title}
        numberOfLines={2}
        ellipsizeMode="tail"
        variant="caption"
        tone="secondary"
      >
        {title}
      </LinearText>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minWidth: '45%',
    minHeight: HIT_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    gap: density.compact.gap,
    paddingVertical: density.compact.paddingVertical,
    paddingHorizontal: density.compact.paddingHorizontal,
    borderRadius: n.radius.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    letterSpacing: 0.2,
    flex: 1,
  },
});
