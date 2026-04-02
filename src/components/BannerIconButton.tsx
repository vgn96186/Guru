import React from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { linearTheme as n } from '../theme/linearTheme';

interface BannerIconButtonProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export default function BannerIconButton({ children, style, ...props }: BannerIconButtonProps) {
  return (
    <Pressable
      {...props}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}
      accessibilityRole="button"
    >
      <View style={styles.content}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: n.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: n.alpha.pressed,
  },
});
