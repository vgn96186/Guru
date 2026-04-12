import React from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { linearTheme as n } from '../theme/linearTheme';
import AppText from './AppText';
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
          <AppText
            style={[styles.title, titleStyle]}
            numberOfLines={titleNumberOfLines}
            variant="sectionTitle"
          >
            {title}
          </AppText>
          {subtitle ? (
            <AppText style={[styles.subtitle, subtitleStyle]} variant="bodySmall" tone="secondary">
              {subtitle}
            </AppText>
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
    paddingHorizontal: 14,
    paddingVertical: 14,
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
