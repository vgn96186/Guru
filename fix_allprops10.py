with open('src/screens/settings/components/SettingsField.tsx', 'r') as f:
    content = f.read()

# Make SettingsField look like Linear
import re
new_content = """import React, { type ComponentProps } from 'react';
import { View, Text, TextInput, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { linearTheme as n } from '../../../theme/linearTheme';

interface SettingsFieldProps extends Omit<
  ComponentProps<typeof TextInput>,
  'style' | 'containerStyle'
> {
  label: string;
  hint?: string;
  error?: string;
  hintTone?: string;
  hintStyle?: StyleProp<TextStyle>;
  inputStyle?: StyleProp<TextStyle>;
  inputContainerStyle?: StyleProp<ViewStyle>;
}

export default function SettingsField({
  label,
  hint,
  error,
  hintTone = 'muted',
  hintStyle,
  inputStyle,
  inputContainerStyle,
  ...inputProps
}: SettingsFieldProps) {
  const helperText = error ?? hint;

  return (
    <View className="mb-4">
      <Text className="text-[13px] font-medium text-[#E8E8E8] mb-2">{label}</Text>
      <TextInput
        className="w-full h-[44px] bg-[#111214] rounded-lg border border-[#292A2D] px-3 text-[#E8E8E8] text-[15px]"
        placeholderTextColor="#5E626B"
        {...inputProps}
      />
      {helperText ? (
        <Text className={`text-[12px] mt-2 ${error ? 'text-red-400' : 'text-[#8A8F98]'}`}>
          {helperText}
        </Text>
      ) : null}
    </View>
  );
}
"""

with open('src/screens/settings/components/SettingsField.tsx', 'w') as f:
    f.write(new_content)
print("Updated SettingsField")
