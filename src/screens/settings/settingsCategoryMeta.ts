import {
  SETTINGS_CATEGORIES,
  type SettingsCategory,
} from '../../components/settings/SettingsSidebar';

export const SETTINGS_CATEGORY_DESCRIPTIONS: Record<SettingsCategory, string> = {
  dashboard: 'Identity, targets, and the settings control-room overview.',
  appearance: 'UI settings, themes, and display options.',
  profile: 'Profile setup and preferences.',
  ai: 'Provider keys, routing order, local inference, and Guru chat defaults.',
  interventions: 'Strict mode, focus guardrails, and break-enforcement controls.',
  integrations: 'Permissions, external app hooks, diagnostics, and Samsung reliability.',
  planning: 'Exam anchors, alerts, pacing, and notification timing.',
  sync: 'Body doubling and cross-device presence settings.',
  storage: 'Backups, vault maintenance, restore flows, and data housekeeping.',
  advanced: 'Advanced diagnostics and app maintenance.',
};

export function getSettingsCategoryMeta(activeCategory: SettingsCategory) {
  return (
    SETTINGS_CATEGORIES.find((category) => category.id === activeCategory) ?? SETTINGS_CATEGORIES[0]
  );
}
