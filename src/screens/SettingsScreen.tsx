import React from 'react';
import { View, StatusBar } from 'react-native';
import { linearTheme as n } from '../theme/linearTheme';
import { SettingsScreenShell } from './settings/components/SettingsScreenShell';
import SettingsCategoryContent from './settings/components/SettingsCategoryContent';
import { settingsStyles as styles } from './settings/settingsStyles';
import {
  SettingsSectionAccordion,
  SettingsSubSectionAccordion,
  type SettingsSectionToggleProps,
  type SettingsSubSectionToggleProps,
} from './settings/components/SettingsSectionAccordion';
import { useSettingsController } from './settings/hooks/useSettingsController';

export default function SettingsScreen() {
  const controller = useSettingsController();

  function SectionToggle({ id, ...rest }: SettingsSectionToggleProps) {
    return (
      <SettingsSectionAccordion
        {...rest}
        expanded={controller.expandedSections.has(id)}
        onToggle={() => controller.toggleExpandedSection(id)}
      />
    );
  }

  function SubSectionToggle({ id, ...rest }: SettingsSubSectionToggleProps) {
    return (
      <SettingsSubSectionAccordion
        {...rest}
        expanded={controller.expandedSections.has(id)}
        onToggle={() => controller.toggleExpandedSection(id)}
      />
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor={n.colors.background} />
      <SettingsScreenShell
        activeCategory={controller.activeCategory}
        activeCategoryLabel={controller.activeCategoryMeta.label}
        isTabletLayout={controller.isTabletLayout}
        isSaving={controller.saving}
        profileName={controller.profile?.displayName}
        totalXp={controller.profile?.totalXp}
        summaryCards={controller.settingsSummaryCards}
        categoryBadges={controller.categoryBadges}
        onBackPress={() => controller.navigation.navigate('MenuHome')}
        onSelectCategory={controller.setActiveCategory}
      >
        <View style={styles.categoryContent}>
          <SettingsCategoryContent
            {...controller}
            styles={styles}
            SectionToggle={SectionToggle}
            SubSectionToggle={SubSectionToggle}
          />
        </View>
      </SettingsScreenShell>
    </>
  );
}
