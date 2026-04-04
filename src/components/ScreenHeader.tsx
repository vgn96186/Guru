import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { usePersistentScreenBanner } from './PersistentScreenBanner';
import ScreenBannerFrame from './ScreenBannerFrame';
import { linearTheme as n } from '../theme/linearTheme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  searchElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleNumberOfLines?: number;
  onBackPress?: () => void;
  backButtonTestID?: string;
  showBack?: boolean;
}

export default function ScreenHeader({
  title,
  subtitle,
  children,
  searchElement,
  rightElement,
  containerStyle,
  titleStyle,
  subtitleStyle,
  titleNumberOfLines,
  onBackPress,
  backButtonTestID,
  showBack,
}: ScreenHeaderProps) {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();
  const shouldShowBack = showBack ?? (canGoBack || !!onBackPress);
  const bannerContext = usePersistentScreenBanner();
  const setBanner = bannerContext?.setBanner;
  const clearBanner = bannerContext?.clearBanner;
  const reservedHeight = bannerContext?.reservedHeight ?? 0;
  const ownerIdRef = React.useRef(`screen-header-${Math.random().toString(36).slice(2, 9)}`);
  const handleBackPress = React.useCallback(() => {
    if (onBackPress) {
      onBackPress();
      return;
    }
    navigation.goBack();
  }, [navigation, onBackPress]);

  useFocusEffect(
    React.useCallback(() => {
      if (!setBanner || !clearBanner) return;
      setBanner(ownerIdRef.current, {
        title,
        subtitle,
        children,
        searchElement,
        rightElement,
        titleStyle,
        subtitleStyle,
        titleNumberOfLines,
        onBackPress: handleBackPress,
        showBack: shouldShowBack,
        backButtonTestID,
      });

      return () => {
        clearBanner(ownerIdRef.current);
      };
    }, [
      backButtonTestID,
      clearBanner,
      children,
      handleBackPress,
      searchElement,
      rightElement,
      setBanner,
      shouldShowBack,
      subtitle,
      subtitleStyle,
      title,
      titleNumberOfLines,
      titleStyle,
    ]),
  );

  if (bannerContext) {
    return <View style={[styles.spacer, containerStyle, { minHeight: reservedHeight }]} />;
  }

  return (
    <View style={[styles.wrap, containerStyle]}>
      <ScreenBannerFrame
        title={title}
        subtitle={subtitle}
        children={children}
        searchElement={searchElement}
        rightElement={rightElement}
        titleStyle={titleStyle}
        subtitleStyle={subtitleStyle}
        titleNumberOfLines={titleNumberOfLines}
        onBackPress={handleBackPress}
        showBack={shouldShowBack}
        backButtonTestID={backButtonTestID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: n.spacing.md,
  },
  spacer: {
    marginBottom: n.spacing.md,
  },
});
