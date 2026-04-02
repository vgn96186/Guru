import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { linearTheme as n } from '../theme/linearTheme';
import AppText from './AppText';
import LinearSurface from './primitives/LinearSurface';

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
          <TouchableOpacity
            onPress={onBackPress}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            testID={backButtonTestID}
          >
            <Ionicons name="chevron-back" size={20} color={n.colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.copy}>
          <AppText style={[styles.title, titleStyle]} numberOfLines={titleNumberOfLines} variant="sectionTitle">
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
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  backSpacer: {
    width: 54,
  },
  copy: {
    flex: 1,
    minWidth: 0,
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
