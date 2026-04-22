with open('src/screens/settings/components/SettingsToggleRow.tsx', 'r') as f:
    content = f.read()

new_content = """import React from 'react';
import { View, Text, Switch, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

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
  inactiveTrackColor = '#292A2D',
  thumbColor = '#E8E8E8',
  disabled = false,
  style,
}: SettingsToggleRowProps) {
  return (
    <View className="flex-row items-center justify-between py-3 border-b border-[#292A2D] last:border-0" style={style}>
      <View className="flex-1 pr-4">
        <View className="flex-row items-center gap-2">
          {labelIcon}
          <Text className="text-[13px] font-medium text-[#E8E8E8]">{label}</Text>
        </View>
        {hint ? (
          <Text className="text-[12px] text-[#8A8F98] mt-1">{hint}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ true: activeTrackColor, false: inactiveTrackColor }}
        thumbColor={thumbColor}
        style={{ transform: [{ scale: 0.9 }] }}
      />
    </View>
  );
}
"""

with open('src/screens/settings/components/SettingsToggleRow.tsx', 'w') as f:
    f.write(new_content)
print("Updated SettingsToggleRow")
