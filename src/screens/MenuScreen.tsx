import React from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MenuStackParamList } from '../navigation/types';
import { ResponsiveContainer } from '../hooks/useResponsive';
import { theme } from '../constants/theme';

type Nav = NativeStackNavigationProp<MenuStackParamList, 'MenuHome'>;

const PRIMARY_DESTINATIONS: Array<{
  route: keyof Omit<MenuStackParamList, 'MenuHome'>;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}> = [
  {
    route: 'StudyPlan',
    title: 'Study Plan',
    subtitle: 'Buckets, agenda, and your next best moves.',
    icon: 'calendar-outline',
    tint: '#6C63FF',
  },
  {
    route: 'Stats',
    title: 'Stats',
    subtitle: 'Progress, streaks, and weekly momentum.',
    icon: 'bar-chart-outline',
    tint: '#FF9800',
  },
  {
    route: 'NotesHub',
    title: 'Notes Vault',
    subtitle: 'Lecture transcripts, topic notes, and search.',
    icon: 'library-outline',
    tint: '#7ED6A7',
  },
  {
    route: 'Settings',
    title: 'Preferences',
    subtitle: 'Notifications, backups, sync, and study settings.',
    icon: 'settings-outline',
    tint: '#8EC5FF',
  },
];

export default function MenuScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>MENU</Text>
            <Text style={styles.title}>Everything important in one place.</Text>
            <Text style={styles.subtitle}>
              Use this hub for planning, stats, notes, and deeper configuration. Fast actions live in the center Action Hub.
            </Text>
          </View>

          <View style={styles.grid}>
            {PRIMARY_DESTINATIONS.map((item) => (
              <Pressable
                key={item.route}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                android_ripple={{ color: `${item.tint}22` }}
                onPress={() => navigation.navigate(item.route as never)}
                accessibilityRole="button"
                accessibilityLabel={item.title}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${item.tint}18`, borderColor: `${item.tint}55` }]}>
                  <Ionicons name={item.icon} size={22} color={item.tint} />
                </View>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardSubtitle}>{item.subtitle}</Text>
                <View style={styles.cardFooter}>
                  <Text style={styles.cardLink}>Open</Text>
                  <Ionicons name="arrow-forward" size={16} color={theme.colors.textMuted} />
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </ResponsiveContainer>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xxxl,
    gap: theme.spacing.xl,
  },
  hero: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    lineHeight: 34,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 22,
    marginTop: theme.spacing.md,
  },
  grid: {
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  cardPressed: {
    opacity: theme.alpha.pressed,
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: theme.spacing.md,
  },
  cardTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  cardLink: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
});
