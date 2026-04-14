import React, { memo } from 'react';
import { StyleProp, type ImageStyle } from 'react-native';
import { ResilientImage } from '../ResilientImage';

interface ChatImagePreviewProps {
  uri: string;
  style: StyleProp<ImageStyle>;
  onPress: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
}

const ChatImagePreviewComponent = ({
  uri,
  style,
  onPress,
  onLongPress,
  accessibilityLabel,
}: ChatImagePreviewProps) => {
  const safeUri = typeof uri === 'string' ? uri.trim() : '';
  if (!safeUri || !/^https?:\/\//i.test(safeUri)) return null;

  return (
    <ResilientImage
      uri={safeUri}
      style={style}
      resizeMode="contain"
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityLabel={accessibilityLabel}
      showRetry
    />
  );
};

export const ChatImagePreview = memo(ChatImagePreviewComponent);
