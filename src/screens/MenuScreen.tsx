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
    route: 'Stats',
    title: 'Stats',
    subtitle: 'Progress, streaks, and weekly momentum.',
    icon: 'bar-chart-outline',
    tint: '#FF9800',
  },
  {
    route: 'Flashcards',
    title: 'Flashcards',
    subtitle: 'Stub route for your future recall and spaced repetition flow.',
    icon: 'albums-outline',
    tint: '#81C784',
  },
  {
    route: 'MindMap',
    title: 'Mind Map',
    subtitle: 'Stub route for your future visual concept graph.',
    icon: 'git-network-outline',
    tint: '#4FC3F7',
  },
  {
    route: 'ImageVault',
    title: 'Image Vault',
    subtitle: 'All AI-generated diagrams, charts, and visual aids.',
    icon: 'images-outline',
    tint: '#FFD166',
  },
  {
    route: 'NotesVault',
    title: 'Notes Vault',
    subtitle: 'Clean AI study notes — processed and ready to review.',
    icon: 'library-outline',
    tint: '#7ED6A7',
  },
  {
    route: 'TranscriptVault',
    title: 'Transcript Vault',
    subtitle: 'Backed-up transcript files from Documents/Guru.',
    icon: 'document-text-outline',
    tint: '#64B5F6',
  },
  {
    route: 'RecordingVault',
    title: 'Recording Vault',
    subtitle: 'Browse lecture audio files and re-process them.',
    icon: 'mic-outline',
    tint: '#FF7043',
  },
  {
    route: 'QuestionBank',
    title: 'Question Bank',
    subtitle: 'All your MCQs — practice, review, and master.',
    icon: 'help-circle-outline',
    tint: '#E040FB',
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
    <SafeAreaView style={styles.safe} testID="menu-screen">
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ResponsiveContainer style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.kicker}>MENU</Text>
            <Text style={styles.title}>Everything important in one place.</Text>
            <Text style={styles.subtitle}>
              Use this hub for planning, stats, notes, and deeper configuration. Fast actions live
              in the center Action Hub.
            </Text>
          </View>

          <View style={styles.destinations}>
            <Pressable
              style={({ pressed }) => [styles.planBanner, pressed && styles.cardPressed]}
              onPress={() => navigation.navigate('StudyPlan' as never)}
              accessibilityRole="button"
              accessibilityLabel="Open Plan"
            >
              <View style={styles.planBannerIconWrap}>
                <Ionicons name="calendar" size={24} color="#6C63FF" />
              </View>
              <View style={styles.planBannerText}>
                <Text style={styles.planBannerTitle}>Study Plan</Text>
                <Text style={styles.planBannerSubtitle}>
                  Daily agenda, buckets, and next best moves
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </Pressable>

            <View style={styles.grid}>
              {PRIMARY_DESTINATIONS.map((item) => (
                <Pressable
                  key={item.route}
                  style={({ pressed }) => [styles.listItem, pressed && styles.cardPressed]}
                  android_ripple={{ color: `${item.tint}22` }}
                  onPress={() => navigation.navigate(item.route as never)}
                  accessibilityRole="button"
                  accessibilityLabel={item.title}
                >
                  <View
                    style={[
                      styles.listIconWrap,
                      { backgroundColor: `${item.tint}18`, borderColor: `${item.tint}55` },
                    ]}
                  >
                    <Ionicons name={item.icon} size={22} color={item.tint} />
                  </View>
                  <View style={styles.listTextContent}>
                    <Text style={styles.listTitle}>{item.title}</Text>
                    <Text style={styles.listSubtitle}>{item.subtitle}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </Pressable>
              ))}
            </View>
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
  destinations: {
    gap: theme.spacing.md,
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
  planBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  planBannerIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(108, 99, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planBannerText: { flex: 1 },
  planBannerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  planBannerSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  grid: {
    gap: theme.spacing.md,
  },
  cardPressed: {
    opacity: theme.alpha.pressed,
    transform: [{ scale: 0.99 }],
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  listIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  listTextContent: {
    flex: 1,
  },
  listTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  listSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
});
