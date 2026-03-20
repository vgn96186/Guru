import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../constants/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  titleStyle?: StyleProp<TextStyle>;
  subtitleStyle?: StyleProp<TextStyle>;
  titleNumberOfLines?: number;
}

export default function ScreenHeader({
  title,
  subtitle,
  children,
  containerStyle,
  titleStyle,
  subtitleStyle,
  titleNumberOfLines,
}: ScreenHeaderProps) {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();

  return (
    <View style={[styles.wrap, containerStyle]}>
      <View style={styles.row}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
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
          <Text style={[styles.title, titleStyle]} numberOfLines={titleNumberOfLines}>
            {title}
          </Text>
          {subtitle ? <Text style={[styles.subtitle, subtitleStyle]}>{subtitle}</Text> : null}
          {children}
        </View>
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
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
});
