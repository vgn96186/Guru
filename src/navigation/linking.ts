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
              BossBattle: 'boss-battle',
              Inertia: 'inertia',
              ManualLog: 'manual-log',
              DailyChallenge: 'daily-challenge',
              FlaggedReview: 'flagged-review',
            },
          },
          SyllabusTab: {
            screens: {
              Syllabus: 'syllabus',
              TopicDetail: 'topic-detail',
            },
          },
          ActionHubTab: 'action',
          ChatTab: {
            screens: {
              GuruChat: 'guru-chat',
            },
          },
          MenuTab: {
            screens: {
              MenuHome: 'menu',
              StudyPlan: 'menu/study-plan',
              Stats: 'menu/stats',
              Settings: 'menu/settings',
              NotesHub: 'menu/notes',
              NotesSearch: 'menu/notes-search',
              TranscriptHistory: 'menu/lecture-history',
            },
          },
        },
      },
    },
  },
};

export default linking;
