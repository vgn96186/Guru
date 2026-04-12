import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useFocusEffect, useNavigation, type NavigationProp } from '@react-navigation/native';
import { usePersistentScreenBanner } from './PersistentScreenBanner';
import ScreenBannerFrame from './ScreenBannerFrame';
import { linearTheme as n } from '../theme/linearTheme';
import SettingsIconButton from './primitives/SettingsIconButton';
import type { TabParamList } from '../navigation/types';

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
  /** When true, renders a settings gear button on the right side. Composes alongside rightElement if both are provided. */
  showSettings?: boolean;
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
  showSettings,
}: ScreenHeaderProps) {
  const navigation = useNavigation();
  const tabsNavigation = navigation.getParent<NavigationProp<TabParamList>>();
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

  const settingsButton = showSettings ? (
    <SettingsIconButton
      onPress={() => tabsNavigation?.navigate('MenuTab', { screen: 'Settings' })}
    />
  ) : null;

  const resolvedRightElement = rightElement ? (
    <View style={styles.rightClusterInline}>
      {rightElement}
      {settingsButton && <View style={styles.settingsSpacer}>{settingsButton}</View>}
    </View>
  ) : (
    settingsButton
  );

  // Keep the full banner config in a ref so we can read the latest values
  // inside useFocusEffect without depending on unstable ReactNode references
  // (JSX elements are new objects every render and would cause an infinite loop).
  const bannerConfigRef = React.useRef<Parameters<NonNullable<typeof setBanner>>[1] | null>(null);
  bannerConfigRef.current = {
    title,
    subtitle,
    children,
    searchElement,
    rightElement: resolvedRightElement,
    titleStyle,
    subtitleStyle,
    titleNumberOfLines,
    onBackPress: handleBackPress,
    showBack: shouldShowBack,
    backButtonTestID,
  };

  useFocusEffect(
    React.useCallback(() => {
      if (!setBanner || !clearBanner) return;
      setBanner(ownerIdRef.current, bannerConfigRef.current!);

      return () => {
        clearBanner(ownerIdRef.current);
      };
      // Only depend on stable primitives + context callbacks.
      // ReactNode deps (rightElement, children, etc.) are read from bannerConfigRef.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
      clearBanner,
      setBanner,
      shouldShowBack,
      title,
      subtitle,
      titleNumberOfLines,
      backButtonTestID,
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
        rightElement={resolvedRightElement}
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
  rightClusterInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: n.spacing.sm,
  },
  settingsSpacer: {
    marginLeft: 4,
  },
});
