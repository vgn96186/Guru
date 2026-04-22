import React, { useState } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { tv } from 'tailwind-variants';

interface LinearTextInputProps extends Omit<TextInputProps, 'style' | 'className'> {
  containerClassName?: string;
  className?: string;
  /** @deprecated Use containerClassName instead */
  containerStyle?: ViewProps['style'];
  /** @deprecated Use className instead */
  style?: TextInputProps['style'];
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const containerVariants = tv({
  base: 'flex-row items-center bg-card border border-border rounded-xl min-h-[44px] px-4',
  variants: {
    focused: {
      true: 'border-accent/[0.4] bg-surfaceHover',
    },
    disabled: {
      true: 'opacity-[0.55]',
    },
  },
  defaultVariants: {
    focused: false,
    disabled: false,
  },
});

export default function LinearTextInput({
  className,
  containerClassName,
  containerStyle,
  style,
  leftIcon,
  rightIcon,
  onFocus,
  onBlur,
  editable = true,
  ...props
}: LinearTextInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const containerVariantClass = containerVariants({
    focused: isFocused,
    disabled: !editable,
    className: containerClassName,
  });

  return (
    <View
      className={containerVariantClass}
      style={containerStyle}
    >
      {leftIcon && <View className="justify-center items-center mr-2">{leftIcon}</View>}
      <TextInput
        className={`flex-1 text-textPrimary font-inter text-[15px] py-2 ${className ?? ''}`}
        style={style}
        placeholderTextColor="#7A7A80"
        editable={editable}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {rightIcon && <View className="justify-center items-center ml-2">{rightIcon}</View>}
    </View>
  );
}

