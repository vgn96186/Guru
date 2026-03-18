import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { theme } from '../constants/theme';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

export default function ScreenHeader({ title, subtitle }: ScreenHeaderProps) {
  const navigation = useNavigation();
  const canGoBack = navigation.canGoBack();

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={20} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backSpacer} />
        )}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
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
    width: 36,
    height: 36,
    borderRadius: 18,
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
