import React, { memo } from 'react';
import { Pressable, StyleProp, View, type ImageStyle } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
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
  if (!isSupportedChatImageUri(safeUri)) return null;

  if (!isRemoteImageUri(safeUri)) {
    const image = (
      <ExpoImage
        source={{ uri: safeUri }}
        style={style}
        contentFit="contain"
        accessibilityLabel={accessibilityLabel}
        cachePolicy="memory-disk"
        transition={120}
      />
    );

    if (onPress || onLongPress) {
      return (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={250}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
        >
          {image}
        </Pressable>
      );
    }

    return <View>{image}</View>;
  }

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

function isRemoteImageUri(uri: string) {
  return /^https?:\/\//i.test(uri);
}

export function isSupportedChatImageUri(uri: string) {
  const safeUri = typeof uri === 'string' ? uri.trim() : '';
  if (!safeUri) return false;

  return isRemoteImageUri(safeUri) || /^(file|content):\/\//i.test(safeUri) || safeUri.startsWith('/');
}
