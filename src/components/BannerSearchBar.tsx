import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';

interface BannerSearchBarProps extends Omit<TextInputProps, 'style'> {
  value?: string;
  onChangeText?: (text: string) => void;
  containerStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

export default function BannerSearchBar({
  value = '',
  onChangeText,
  containerStyle,
  onPress,
  placeholderTextColor = n.colors.textMuted,
  placeholder: _placeholder,
  autoCapitalize = 'none',
  autoCorrect = false,
  onFocus,
  onBlur,
  ...props
}: BannerSearchBarProps) {
  const inputRef = useRef<TextInput>(null);
  const { width: windowWidth } = useWindowDimensions();
  // Compute max expanded width allowing room for back button and padding:
  const expandedWidth = Math.min(windowWidth - 84, 400);

  const [isExpanded, setIsExpanded] = useState(value.length > 0);
  const [isFocused, setIsFocused] = useState(false);
  const isOpen = isExpanded || isFocused || value.length > 0;

  const widthAnim = useSharedValue(isOpen ? expandedWidth : 36);

  useEffect(() => {
    widthAnim.value = withTiming(isOpen ? expandedWidth : 36, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [isOpen, widthAnim, expandedWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: widthAnim.value,
  }));

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (!value.trim()) {
        setIsFocused(false);
        setIsExpanded(false);
      }
    });
    return () => sub.remove();
  }, [value]);

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setIsFocused(false);
    if (!value.trim()) {
      setIsExpanded(false);
    }
    onBlur?.(event);
  };

  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setIsFocused(true);
    onFocus?.(event);
  };

  const handleIconPress = () => {
    if (onPress) {
      onPress();
      return;
    }
    setIsExpanded(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  return (
    <Animated.View style={[styles.wrap, animatedStyle, containerStyle]}>
      <View style={styles.container}>
        <TouchableOpacity
          onPress={handleIconPress}
          activeOpacity={0.8}
          style={styles.searchIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Search"
        >
          <Ionicons name="search" size={16} color={n.colors.textMuted} />
        </TouchableOpacity>
        {isOpen ? (
          <>
            <TextInput
              {...props}
              ref={inputRef}
              value={value}
              onChangeText={onChangeText}
              style={styles.input}
              placeholder=""
              placeholderTextColor={placeholderTextColor}
              autoCapitalize={autoCapitalize}
              autoCorrect={autoCorrect}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
            {value ? (
              <TouchableOpacity
                onPress={() => onChangeText?.('')}
                activeOpacity={0.8}
                style={styles.clearBtn}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <Ionicons name="close-circle" size={16} color={n.colors.textMuted} />
              </TouchableOpacity>
            ) : null}
          </>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-end',
  },
  container: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    paddingHorizontal: 4,
    backgroundColor: '#0A0B10',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: n.colors.border,
  },
  searchIconBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    color: n.colors.textPrimary,
    fontSize: 14,
    padding: 0,
    margin: 0,
    marginLeft: 4,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  clearBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
