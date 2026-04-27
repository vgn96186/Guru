import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { linearTheme as n } from '../theme/linearTheme';
import { density } from '../theme/density';
import LinearText from './primitives/LinearText';
import LinearSurface from './primitives/LinearSurface';
import BackIconButton from './primitives/BackIconButton';

interface ScreenBannerFrameProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  searchElement?: React.ReactNode;
  rightElement?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleNumberOfLines?: number;
  onBackPress?: () => void;
  showBack?: boolean;
  backButtonTestID?: string;
}

export default function ScreenBannerFrame({
  title,
  subtitle,
  children,
  searchElement,
  rightElement,
  titleStyle,
  subtitleStyle,
  titleNumberOfLines,
  onBackPress,
  showBack = true,
  backButtonTestID,
}: ScreenBannerFrameProps) {
  return (
    <LinearSurface padded={false} style={styles.surface}>
      <View style={styles.row}>
        {showBack ? (
          <BackIconButton onPress={onBackPress} testID={backButtonTestID} />
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.copy}>
          <LinearText
            style={[styles.title, titleStyle]}
            numberOfLines={titleNumberOfLines}
            variant="title"
          >
            {title}
          </LinearText>
          {subtitle ? (
            <LinearText
              style={[styles.subtitle, subtitleStyle]}
              variant="sectionTitle"
              tone="secondary"
            >
              {subtitle}
            </LinearText>
          ) : null}
          {children}
        </View>
        {searchElement || rightElement ? (
          <View style={styles.rightCluster}>
            {searchElement ? <View style={styles.searchSlot}>{searchElement}</View> : null}
            {rightElement ? <View style={styles.rightSlot}>{rightElement}</View> : null}
          </View>
        ) : null}
      </View>
    </LinearSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderColor: n.colors.borderHighlight,
    backgroundColor: n.colors.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: density.comfortable.paddingHorizontal,
    paddingVertical: density.comfortable.paddingVertical,
    minHeight: 68, // Ensures consistent height even if rightElement is missing
  },
  backSpacer: {
    width: 48,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
  },
  title: {
    letterSpacing: 0.3,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 4,
  },
  rightCluster: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  searchSlot: {
    marginRight: 8,
    alignItems: 'flex-end',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 999,
  },
  rightSlot: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
});
