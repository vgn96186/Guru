import React from 'react';
import { FlashList, type FlashListProps, type FlashListRef } from '@shopify/flash-list';

export type AppFlashListProps<T> = FlashListProps<T>;

function AppFlashListInner<T>(
  { drawDistance = 300, ...props }: AppFlashListProps<T>,
  ref: React.Ref<FlashListRef<T>>,
) {
  return (
    <FlashList
      ref={ref}
      {...props}
      drawDistance={drawDistance}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
    />
  );
}

export const AppFlashList = React.forwardRef(AppFlashListInner) as <T>(
  props: AppFlashListProps<T> & { ref?: React.Ref<FlashListRef<T>> },
) => React.ReactElement;

export type AppFlashListRef<T> = FlashListRef<T>;
