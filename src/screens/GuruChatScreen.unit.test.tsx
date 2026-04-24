import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import GuruChatScreen from './GuruChatScreen';

const mockGuruChatSendMessage = jest.fn(async () => ({
  id: 'g-1',
  role: 'guru',
  text: 'Hello',
  timestamp: Date.now(),
  sources: [],
  referenceImages: [],
  images: [],
  modelUsed: 'local',
  searchQuery: null,
}));

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
  ImageLightbox: ({ visible }: { visible: boolean }) => {
    const ReactNative = require('react-native');
    return visible ? <ReactNative.Text>lightbox-open</ReactNative.Text> : null;
  },
}));

jest.mock('../components/chat/GuruChatMessageList', () => {
  const ReactNative = require('react-native');
  return {
    GuruChatMessageList: ({ onSetLightboxUri }: { onSetLightboxUri: (uri: string) => void }) => (
      <ReactNative.Pressable onPress={() => onSetLightboxUri('https://example.com/image.png')}>
        <ReactNative.Text>open-lightbox</ReactNative.Text>
      </ReactNative.Pressable>
    ),
  };
});

jest.mock('../components/ResilientImage', () => ({
  ResilientImage: () => null,
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
  addLlmStateListener: jest.fn(() => () => {}),
}));

jest.mock('../services/ai', () => ({
  getApiKeys: () => ({
    chatgptConnected: false,
    geminiKey: '',
    cfAccountId: '',
    cfApiToken: '',
    falKey: '',
    orKey: '',
    groqKey: '',
    githubModelsPat: '',
    githubCopilotConnected: false,
    gitlabDuoConnected: false,
    kiloApiKey: '',
    agentRouterKey: '',
    poeConnected: false,
    qwenConnected: false,
  }),
}));

jest.mock('../hooks/useGuruChat', () => ({
  useGuruChat: () => ({
    messages: [],
    status: 'idle',
    error: null,
    sendMessage: mockGuruChatSendMessage,
    stop: jest.fn(),
    regenerate: jest.fn(async () => null),
    setMessages: jest.fn(),
  }),
}));

jest.mock('../hooks/queries/useProfile', () => ({
  useProfileQuery: () => ({ data: null }),
}));

jest.mock('../components/dialogService', () => ({
  showInfo: jest.fn(),
  showError: jest.fn(),
  confirm: jest.fn(async () => true),
  confirmDestructive: jest.fn(async () => true),
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
    chatgpt: [],
    groq: [],
    openrouter: [],
    gemini: [],
    cloudflare: [],
    github: [],
    githubCopilot: [],
    gitlabDuo: [],
    poe: [],
    kilo: [],
    agentrouter: [],
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
    const guruChatMemory = require('../db/queries/guruChatMemory');
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      get: () => 'ios',
    });
    global.requestAnimationFrame = ((cb: FrameRequestCallback) =>
      setTimeout(() => cb(Date.now()), 0)) as unknown as typeof requestAnimationFrame;
    global.cancelAnimationFrame = ((id: number) => clearTimeout(id)) as typeof cancelAnimationFrame;
    guruChatMemory.getSessionMemoryRow.mockResolvedValue(null);
    mockGuruChatSendMessage.mockClear();
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

  it('recovers by creating a thread on send when initial thread hydration fails', async () => {
    const aiCache = require('../db/queries/aiCache');

    aiCache.getLatestGuruChatThread.mockRejectedValueOnce(new Error('hydrate failed'));
    aiCache.getOrCreateLatestGuruChatThread.mockResolvedValueOnce({
      id: 7,
      topicName: 'General Medicine',
      title: 'General Medicine',
      lastMessageAt: Date.now(),
      lastMessagePreview: '',
    });

    const { getByPlaceholderText, getByLabelText } = render(<GuruChatScreen />);

    await waitFor(() => {
      expect(getByPlaceholderText('Ask Guru anything...')).toBeTruthy();
    });

    fireEvent.changeText(getByPlaceholderText('Ask Guru anything...'), 'Explain shock');
    fireEvent.press(getByLabelText('Send message'));

    await waitFor(() => {
      expect(mockGuruChatSendMessage).toHaveBeenCalledWith(
        'Explain shock',
        expect.objectContaining({
          groundingContext: undefined,
          groundingTitle: undefined,
          sessionSummary: undefined,
          sessionStateJson: '{}',
          profileNotes: undefined,
          studyContext: undefined,
          syllabusTopicId: undefined,
        }),
        { persistThreadId: 7 },
      );
    });

    expect(aiCache.getOrCreateLatestGuruChatThread).toHaveBeenCalled();
  });

  it('hides the sticky composer while the image lightbox is open', async () => {
    const { getByText, queryByPlaceholderText, queryByText } = render(<GuruChatScreen />);

    await waitFor(() => {
      expect(queryByPlaceholderText('Ask Guru anything...')).toBeTruthy();
    });

    fireEvent.press(getByText('open-lightbox'));

    await waitFor(() => {
      expect(queryByText('lightbox-open')).toBeTruthy();
      expect(queryByPlaceholderText('Ask Guru anything...')).toBeNull();
    });
  });
});
