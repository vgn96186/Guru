export const ACTION_HUB_TOOL_IDS = [
  'StudyPlan',
  'QuestionBank',
  'Flashcards',
  'NotesVault',
  'TranscriptVault',
  'RecordingVault',
  'Stats',
  'ImageVault',
  'NotesSearch',
  'DeviceLink',
  'Settings',
] as const;

export type ActionHubToolId = (typeof ACTION_HUB_TOOL_IDS)[number];

export const DEFAULT_ACTION_HUB_TOOLS: ActionHubToolId[] = [
  'StudyPlan',
  'QuestionBank',
  'Flashcards',
  'NotesVault',
  'TranscriptVault',
  'RecordingVault',
];

export const ACTION_HUB_TOOL_META: Record<
  ActionHubToolId,
  { label: string; icon: string; tab: 'MenuTab'; screen: string }
> = {
  StudyPlan: { label: 'Study Plan', icon: 'calendar-outline', tab: 'MenuTab', screen: 'StudyPlan' },
  QuestionBank: {
    label: 'Question Bank',
    icon: 'help-circle-outline',
    tab: 'MenuTab',
    screen: 'QuestionBank',
  },
  Flashcards: {
    label: 'Flashcards',
    icon: 'albums-outline',
    tab: 'MenuTab',
    screen: 'Flashcards',
  },
  NotesVault: {
    label: 'Notes Vault',
    icon: 'library-outline',
    tab: 'MenuTab',
    screen: 'NotesVault',
  },
  TranscriptVault: {
    label: 'Transcripts',
    icon: 'document-text-outline',
    tab: 'MenuTab',
    screen: 'TranscriptVault',
  },
  RecordingVault: {
    label: 'Recordings',
    icon: 'mic-outline',
    tab: 'MenuTab',
    screen: 'RecordingVault',
  },
  Stats: { label: 'Stats', icon: 'bar-chart-outline', tab: 'MenuTab', screen: 'Stats' },
  ImageVault: { label: 'Images', icon: 'images-outline', tab: 'MenuTab', screen: 'ImageVault' },
  NotesSearch: {
    label: 'Search Notes',
    icon: 'search-outline',
    tab: 'MenuTab',
    screen: 'NotesSearch',
  },
  DeviceLink: { label: 'Device Link', icon: 'link-outline', tab: 'MenuTab', screen: 'DeviceLink' },
  Settings: { label: 'Settings', icon: 'settings-outline', tab: 'MenuTab', screen: 'Settings' },
};
