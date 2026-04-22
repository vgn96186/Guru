import React, { type ComponentProps } from 'react';
import { TouchableOpacity, View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { linearTheme as n } from '../../theme/linearTheme';
import { elevation } from '../../theme/elevation';
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
      <LinearGradient
        pointerEvents="none"
        colors={[elevation.e1.gradientStart, elevation.e1.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.topEdge} />
      <View
        style={[styles.iconWrap, { backgroundColor: `${accent}22`, borderColor: `${accent}33` }]}
      >
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
    borderRadius: n.radius.md,
    borderWidth: 1,
    borderColor: elevation.e1.border,
    backgroundColor: elevation.e1.bg,
    overflow: 'hidden',
  },
  topEdge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: elevation.topEdgeInteractive,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    letterSpacing: 0.2,
    flex: 1,
  },
});
