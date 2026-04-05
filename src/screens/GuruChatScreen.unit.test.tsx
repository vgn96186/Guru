import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import GuruChatScreen from './GuruChatScreen';

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {
    setString: jest.fn(),
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    getParent: jest.fn(() => ({ navigate: jest.fn() })),
    canGoBack: () => true,
  }),
  useRoute: () => ({
    params: {},
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode }) => {
    const ReactNative = require('react-native');
    return <ReactNative.View {...props}>{children}</ReactNative.View>;
  },
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../components/ImageLightbox', () => ({
  ImageLightbox: () => null,
}));

jest.mock('../components/primitives/LinearSurface', () => {
  const ReactNative = require('react-native');
  return ({ children, ...props }: { children?: React.ReactNode }) => (
    <ReactNative.View {...props}>{children}</ReactNative.View>
  );
});

jest.mock('../hooks/useResponsive', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../components/BannerIconButton', () => {
  const ReactNative = require('react-native');
  return ({ children, ...props }: { children?: React.ReactNode }) => (
    <ReactNative.Pressable {...props}>{children}</ReactNative.Pressable>
  );
});

jest.mock('../components/ScreenHeader', () => {
  const ReactNative = require('react-native');
  return ({
    title,
    subtitle,
    rightElement,
  }: {
    title: string;
    subtitle?: string;
    rightElement?: React.ReactNode;
  }) => (
    <ReactNative.View>
      <ReactNative.Text>{title}</ReactNative.Text>
      {subtitle ? <ReactNative.Text>{subtitle}</ReactNative.Text> : null}
      {rightElement}
    </ReactNative.View>
  );
});

jest.mock('../motion/ScreenMotion', () => {
  const ReactNative = require('react-native');
  return ({
    children,
    isEntryComplete,
  }: {
    children?: React.ReactNode;
    isEntryComplete?: () => void;
  }) => {
    React.useEffect(() => {
      isEntryComplete?.();
    }, [isEntryComplete]);
    return <ReactNative.View>{children}</ReactNative.View>;
  };
});

jest.mock('./GuruChatRevealSection', () => {
  const ReactNative = require('react-native');
  return {
    RevealSection: ({
      children,
      delayMs,
      style,
    }: {
      children?: React.ReactNode;
      delayMs?: number;
      style?: unknown;
    }) => (
      <ReactNative.View testID={`reveal-${delayMs ?? 0}`} style={style}>
        {children}
      </ReactNative.View>
    ),
  };
});

jest.mock('./guruChatLoadingState', () => ({
  shouldShowGuruChatSkeleton: () => false,
}));

jest.mock('../motion/useReducedMotion', () => ({
  useReducedMotion: () => true,
}));

jest.mock('../services/aiService', () => ({
  chatWithGuruGroundedStreaming: jest.fn(),
  getApiKeys: () => ({
    geminiKey: '',
    cfAccountId: '',
    cfApiToken: '',
    falKey: '',
    orKey: '',
  }),
}));

jest.mock('../store/useAppStore', () => ({
  useAppStore: (selector: (state: { profile: null }) => unknown) => selector({ profile: null }),
}));

jest.mock('../db/queries/aiCache', () => ({
  createGuruChatThread: jest.fn(async () => ({
    id: 2,
    topicName: 'General Medicine',
    title: 'New chat',
  })),
  deleteGuruChatThread: jest.fn(async () => {}),
  getChatHistory: jest.fn(async () => []),
  getGuruChatThreadById: jest.fn(async () => null),
  getLatestGuruChatThread: jest.fn(async () => null),
  getOrCreateLatestGuruChatThread: jest.fn(async () => ({
    id: 1,
    topicName: 'General Medicine',
    title: 'General Medicine',
    lastMessageAt: Date.now(),
    lastMessagePreview: '',
  })),
  listGuruChatThreads: jest.fn(async () => []),
  renameGuruChatThread: jest.fn(async () => {}),
  saveChatMessage: jest.fn(async () => {}),
}));

jest.mock('../db/queries/guruChatMemory', () => ({
  getSessionMemoryRow: jest.fn(async () => null),
}));

jest.mock('../db/database', () => ({
  getDb: () => ({
    getAllAsync: jest.fn(async () => []),
  }),
}));

jest.mock('../db/queries/topics', () => ({
  markTopicDiscussedInChat: jest.fn(async () => {}),
}));

jest.mock('../services/deviceMemory', () => ({
  getLocalLlmRamWarning: () => null,
  isLocalLlmAllowedOnThisDevice: () => true,
}));

jest.mock('../services/ai/guruChatModelPreference', () => ({
  coerceGuruChatDefaultModel: () => 'auto',
  guruChatPickerNameForCfModel: (value: string) => value,
  guruChatPickerNameForGeminiModel: (value: string) => value,
  guruChatPickerNameForGithubModel: (value: string) => value,
  guruChatPickerNameForGroqModel: (value: string) => value,
  guruChatPickerNameForOpenRouterSlug: (value: string) => value,
}));

jest.mock('../hooks/useLiveGuruChatModels', () => ({
  useLiveGuruChatModels: () => ({
    availableModels: [{ id: 'auto', name: 'Auto', group: 'Local' }],
  }),
}));

jest.mock('../db/queries/generatedStudyImages', () => ({
  listGeneratedStudyImagesForTopic: jest.fn(async () => []),
}));

jest.mock('../services/studyImageService', () => ({
  buildChatImageContextKey: () => 'job-key',
  generateStudyImage: jest.fn(async () => null),
}));

jest.mock('../services/guruChatSessionSummary', () => ({
  maybeSummarizeGuruSession: jest.fn(async () => null),
}));

jest.mock('../services/guruChatStudyContext', () => ({
  buildBoundedGuruChatStudyContext: jest.fn(async () => null),
}));

jest.mock('../hooks/useAiRuntimeStatus', () => ({
  useAiRuntimeStatus: () => ({
    active: [],
    activeCount: 0,
    lastModelUsed: null,
    lastBackend: null,
    lastError: null,
  }),
}));

const originalConsoleError = console.error;

describe('GuruChatScreen', () => {
  beforeEach(() => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'ios',
    });
    console.error = jest.fn((...args: unknown[]) => {
      const firstArg = args[0];
      if (
        typeof firstArg === 'string' &&
        (firstArg.includes('react-test-renderer is deprecated') ||
          firstArg.includes('not wrapped in act'))
      ) {
        return;
      }
      originalConsoleError(...args);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    console.error = originalConsoleError;
  });

  it('keeps the chat body reveal section flexed so the composer stays bottom-anchored', async () => {
    const { getByTestId } = render(<GuruChatScreen />);

    await waitFor(() => {
      expect(getByTestId('reveal-80')).toHaveStyle({ flex: 1 });
    });
  });
});
