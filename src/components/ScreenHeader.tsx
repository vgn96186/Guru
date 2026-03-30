import React from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../constants/theme';
import AppText from './AppText';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  rightElement?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleNumberOfLines?: number;
  onBackPress?: () => void;
}

export default function ScreenHeader({
  title,
  subtitle,
  children,
  rightElement,
  containerStyle,
  titleStyle,
  subtitleStyle,
  titleNumberOfLines,
  onBackPress,
}: ScreenHeaderProps) {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();

  return (
    <View style={[styles.wrap, containerStyle]}>
      <View style={styles.row}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => {
              if (onBackPress) {
                onBackPress();
                return;
              }
              navigation.goBack();
            }}
            style={styles.backBtn}
            hitSlop={theme.hitSlop}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.copy}>
          <AppText
            style={[styles.title, titleStyle]}
            numberOfLines={titleNumberOfLines}
            variant="display"
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
        {rightElement}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
    backgroundColor: theme.colors.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  backSpacer: {
    width: 48,
  },
  copy: {
    flex: 1,
  },
  title: {
    letterSpacing: 0.3,
  },
  subtitle: {
    marginTop: 4,
  },
});
