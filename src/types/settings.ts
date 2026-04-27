export type SettingsCategory =
  | 'dashboard'
  | 'appearance'
  | 'profile'
  | 'planning'
  | 'interventions'
  | 'ai'
  | 'integrations'
  | 'sync'
  | 'storage'
  | 'advanced';

export type CategoryBadgeInfo = {
  label: string;
  tone: 'success' | 'warning' | 'error' | 'accent' | 'muted';
};
