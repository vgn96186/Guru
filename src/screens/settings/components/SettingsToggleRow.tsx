import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  Animated,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

interface SettingsToggleRowProps {
  label: string;
  hint?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  labelIcon?: React.ReactNode;
  activeTrackColor?: string;
  inactiveTrackColor?: string;
  thumbColor?: string;
  hintTone?: string;
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
  activeTrackColor = '#5E6AD2',
  inactiveTrackColor = 'rgba(255, 255, 255, 0.08)',
  thumbColor = '#E8E8E8',
  disabled = false,
  style,
}: SettingsToggleRowProps) {
  const animatedValue = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: value ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [value, animatedValue]);

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [inactiveTrackColor, activeTrackColor],
  });

  const translateX = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 18],
  });

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        },
        style,
      ]}
    >
      <View style={{ flex: 1, paddingRight: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {labelIcon}
          <Text style={{ fontSize: 13, fontWeight: '500', color: '#E8E8E8' }}>{label}</Text>
        </View>
        {hint ? <Text style={{ fontSize: 12, color: '#8A8F98', marginTop: 4 }}>{hint}</Text> : null}
      </View>
      <Pressable
        onPress={() => !disabled && onValueChange(!value)}
        style={{
          width: 36,
          height: 20,
          borderRadius: 10,
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            borderRadius: 10,
            backgroundColor,
          }}
        />
        <Animated.View
          style={{
            width: 16,
            height: 16,
            borderRadius: 8,
            backgroundColor: thumbColor,
            transform: [{ translateX }],
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.2,
            shadowRadius: 1,
            elevation: 1,
          }}
        />
      </Pressable>
    </View>
  );
}
