import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isIgnoringBatteryOptimizations, isSamsungDevice } from '../../../../modules/app-launcher';
import ScreenHeader from '../../../components/ScreenHeader';
import LinearSurface from '../../../components/primitives/LinearSurface';
import LinearText from '../../../components/primitives/LinearText';
import { SettingsSidebar, SETTINGS_CATEGORIES } from '../../../components/settings/SettingsSidebar';
import { linearTheme as n } from '../../../theme/linearTheme';
import { settingsStyles as styles } from '../settingsStyles';
import type { SettingsCategory, CategoryBadgeInfo } from '../../../types';

type SummaryCard = {
  label: string;
  value: React.ReactNode;
  tone?: React.ComponentProps<typeof LinearText>['tone'];
};

type SettingsScreenShellProps = {
  activeCategory: SettingsCategory;
  activeCategoryLabel: string;
  isTabletLayout: boolean;
  isSaving: boolean;
  profileName?: string;
  totalXp?: number;
  summaryCards: SummaryCard[];
  categoryBadges?: Record<SettingsCategory, CategoryBadgeInfo | null>;
  onBackPress: () => void;
  onSelectCategory: (category: SettingsCategory) => void;
  children: React.ReactNode;
};

type SamsungNavigation = {
  navigate: (screen: 'SamsungBatterySheet') => void;
};

export function SamsungBackgroundRow() {
  const [isSamsung, setIsSamsung] = useState(false);
  const [isIgnoring, setIsIgnoring] = useState(false);
  const navigation = useNavigation<SamsungNavigation>();
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      isSamsungDevice().then(setIsSamsung);
      isIgnoringBatteryOptimizations().then(setIsIgnoring);
    }
  }, [isFocused]);

  if (!isSamsung) return null;

  return (
    <LinearSurface compact style={{ marginBottom: n.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <LinearText variant="meta" tone="accent" style={{ letterSpacing: 1.1 }}>
            SAMSUNG DEVICE
          </LinearText>
          <LinearText variant="label" style={{ marginTop: 4 }}>
            Background reliability
          </LinearText>
          <LinearText
            variant="caption"
            tone={isIgnoring ? 'success' : 'warning'}
            style={{ marginTop: 2 }}
          >
            {isIgnoring ? 'Whitelisted (Never sleeping)' : 'May be killed in background'}
          </LinearText>
        </View>
        <TouchableOpacity
          style={{
            backgroundColor: n.colors.card,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: n.colors.borderHighlight,
          }}
          onPress={() => navigation.navigate('SamsungBatterySheet')}
        >
          <LinearText variant="chip" tone="accent">
            Configure
          </LinearText>
        </TouchableOpacity>
      </View>
    </LinearSurface>
  );
}

export function SettingsScreenShell({
  activeCategory,
  activeCategoryLabel,
  isTabletLayout,
  isSaving,
  profileName,
  totalXp,
  summaryCards,
  categoryBadges,
  onBackPress,
  onSelectCategory,
  children,
}: SettingsScreenShellProps) {
  return (
    // eslint-disable-next-line guru/prefer-screen-shell -- settings uses custom layout with KeyboardAvoidingView
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.settingsShell}>
          {isTabletLayout ? (
            <SettingsSidebar
              activeCategory={activeCategory}
              onSelectCategory={onSelectCategory}
              isCollapsed={false}
              profileName={profileName}
              totalXp={totalXp}
              categoryBadges={categoryBadges}
            />
          ) : null}
          <View style={styles.settingsMain}>
            <ScrollView
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
              overScrollMode="never"
            >
              <View style={styles.contentInner}>
                <ScreenHeader
                  title="Settings"
                  onBackPress={onBackPress}
                  rightElement={
                    isSaving ? <ActivityIndicator size="small" color={n.colors.textMuted} /> : null
                  }
                />

                {!isTabletLayout ? (
                  <SettingsMobileCategoryNav
                    activeCategory={activeCategory}
                    onSelectCategory={onSelectCategory}
                    categoryBadges={categoryBadges}
                  />
                ) : null}

                {activeCategory !== 'dashboard' ? (
                  <SettingsCategorySummary
                    label={activeCategoryLabel}
                    activeCategory={activeCategory}
                    summaryCards={summaryCards}
                  />
                ) : null}

                {children}

                <LinearText style={styles.footer}>Guru AI - v1.0.0</LinearText>
              </View>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BADGE_TONE_COLORS: Record<string, string> = {
  success: '#3FB950',
  warning: '#D97706',
  error: '#F14C4C',
  accent: '#5E6AD2',
  muted: '#939396',
};

function SettingsMobileCategoryNav({
  activeCategory,
  onSelectCategory,
  categoryBadges,
}: {
  activeCategory: SettingsCategory;
  onSelectCategory: (category: SettingsCategory) => void;
  categoryBadges?: Record<SettingsCategory, CategoryBadgeInfo | null>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.mobileCategoryNav}
      style={styles.mobileCategoryScroller}
    >
      {SETTINGS_CATEGORIES.map((category) => {
        const active = activeCategory === category.id;
        const badge = categoryBadges?.[category.id];
        return (
          <TouchableOpacity
            key={category.id}
            style={[styles.mobileCategoryButton, active && styles.mobileCategoryButtonActive]}
            onPress={() => onSelectCategory(category.id)}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <LinearText variant="chip" tone={active ? 'accent' : 'secondary'}>
                {category.label}
              </LinearText>
              {badge ? (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: BADGE_TONE_COLORS[badge.tone] || '#939396',
                  }}
                />
              ) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

function SettingsCategorySummary({
  label,
  summaryCards,
}: {
  label: string;
  activeCategory: SettingsCategory;
  summaryCards: SummaryCard[];
}) {
  return (
    <View style={{ marginBottom: 24 }}>
      <View style={{ paddingHorizontal: 4, marginBottom: 12 }}>
        <LinearText variant="title" style={{ fontWeight: '800' }}>
          {label}
        </LinearText>
      </View>
      {summaryCards.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 4 }}
        >
          {summaryCards.map((card) => (
            <View
              key={card.label}
              style={{
                backgroundColor: n.colors.surface,
                borderWidth: 1,
                borderColor: n.colors.border,
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
                minWidth: 120,
              }}
            >
              <LinearText
                variant="caption"
                tone="secondary"
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                {card.label}
              </LinearText>
              <LinearText
                variant="title"
                tone={card.tone}
                style={{ fontSize: 20, fontWeight: '800' }}
              >
                {card.value}
              </LinearText>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
