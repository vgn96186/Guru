import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { VaultStackParamList } from '../navigation/types';
import { theme } from '../constants/theme';

export default function VaultScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<VaultStackParamList, 'VaultHome'>>();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.container}>
        <Text style={styles.kicker}>VAULT</Text>
        <Text style={styles.title}>Notes Vault</Text>
        <Text style={styles.body}>
          Lecture notes, transcripts, and saved artifacts will surface here.
        </Text>
        <TouchableOpacity
          style={styles.cta}
          onPress={() => navigation.navigate('NotesHub')}
          accessibilityRole="button"
          accessibilityLabel="Open Notes Hub"
        >
          <Text style={styles.ctaText}>Open Notes Hub</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  kicker: {
    color: theme.colors.primaryLight,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    marginBottom: theme.spacing.sm,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: theme.colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    marginTop: theme.spacing.md,
    textAlign: 'center',
    maxWidth: 320,
  },
  cta: {
    marginTop: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
  },
  ctaText: {
    color: theme.colors.textInverse,
    fontSize: 16,
    fontWeight: '800',
  },
});
