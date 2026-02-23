import type { LinkingOptions } from '@react-navigation/native';
import type { RootStackParamList } from './types';

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['guru-study://'],
  config: {
    screens: {
      CheckIn: 'check-in',
      BrainDumpReview: 'brain-dump-review',
      Tabs: {
        screens: {
          HomeTab: {
            screens: {
              Home: 'home',
              Session: 'session',
              LectureMode: 'lecture-mode',
              MockTest: 'mock-test',
              Review: 'review',
              NotesSearch: 'notes-search',
              BossBattle: 'boss-battle',
              Inertia: 'inertia',
              ManualLog: 'manual-log',
              StudyPlan: 'study-plan',
              DailyChallenge: 'daily-challenge',
              FlaggedReview: 'flagged-review',
            },
          },
          PlanTab: 'study-plan',
          SyllabusTab: {
            screens: {
              Syllabus: 'syllabus',
              TopicDetail: 'topic-detail',
            },
          },
          StatsTab: 'stats',
          SettingsTab: 'settings',
        },
      },
    },
  },
};

export default linking;
