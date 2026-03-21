import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['guru-study://'],
  config: {
    screens: {
      CheckIn: 'check-in',
      BrainDumpReview: 'brain-dump-review',
      PomodoroQuiz: 'pomodoro',
      GuruChatModal: {
        screens: {
          GuruChat: 'guru-chat',
        },
      },
      SettingsModal: {
        screens: {
          Settings: 'settings',
          DeviceLink: 'settings/device-link',
        },
      },
      Tabs: {
        screens: {
          HomeTab: {
            screens: {
              Home: 'home',
              Session: 'session',
              LectureMode: 'lecture-mode',
              MockTest: 'mock-test',
              Review: 'review',
              BossBattle: 'boss-battle',
              Inertia: 'inertia',
              ManualLog: 'manual-log',
              StudyPlan: 'study-plan',
              DailyChallenge: 'daily-challenge',
              FlaggedReview: 'flagged-review',
              GlobalTopicSearch: 'global-topic-search',
            },
          },
          TreeTab: {
            screens: {
              KnowledgeTree: 'tree',
              Syllabus: 'tree/syllabus',
              TopicDetail: 'tree/topic-detail',
            },
          },
          VaultTab: {
            screens: {
              VaultHome: 'vault',
              MenuHome: 'vault/menu',
              NotesHub: 'vault/notes',
              NotesSearch: 'vault/notes-search',
              ManualNoteCreation: 'vault/manual-note',
              TranscriptHistory: 'vault/lecture-history',
              StudyPlan: 'vault/study-plan',
              Settings: 'vault/settings',
              DeviceLink: 'vault/device-link',
            },
          },
          StatsTab: 'stats',
        },
      },
    },
  },
};

export default linking;
