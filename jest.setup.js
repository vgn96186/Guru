/* global jest, require, module, __DEV__, console, global, beforeEach */

const nodeCrypto = require('crypto');
// Always use Node's Web Crypto so `subtle.importKey` / `deriveKey` work (some tests replace `subtle` — see localModelBootstrap.unit.test).
Object.defineProperty(globalThis, 'crypto', {
  value: nodeCrypto.webcrypto,
  configurable: true,
});

/** Mutable total RAM for `deviceMemory` tests (`expo-device` mock below). */
global.__EXPO_DEVICE_TOTAL_MEMORY__ = null;

jest.mock('expo-device', () => ({
  get totalMemory() {
    return global.__EXPO_DEVICE_TOTAL_MEMORY__;
  },
}));

/** Expo: avoid loading native Constants / Expo.fx when tests import expo-haptics (e.g. via Toast). */
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    appOwnership: 'standalone',
    executionEnvironment: 'standalone',
    expoVersion: '54.0.0',
    installationId: 'jest-installation-id',
    nativeAppVersion: '1.0.0',
    nativeBuildVersion: '1',
    sessionId: 'jest-session',
    expoConfig: { name: 'Guru', slug: 'guru', version: '1.0.0' },
    manifest: {},
  },
}));

jest.mock('expo-haptics', () => ({
  __esModule: true,
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
    Rigid: 'rigid',
    Soft: 'soft',
  },
  NotificationFeedbackType: { Success: 'success' },
}));

jest.mock('expo-linear-gradient', () => {
  const React = require('react');
  const LinearGradient = ({ children, ...props }) =>
    React.createElement('LinearGradient', props, children);
  return {
    __esModule: true,
    LinearGradient,
    default: LinearGradient,
  };
});

jest.mock('react-native-reanimated', () => {
  try {
    const mock = require('react-native-reanimated/mock');
    const existingEasing = mock.Easing ?? {};
    return {
      ...mock,
      Easing: {
        ...existingEasing,
        linear: existingEasing.linear ?? ((x) => x),
        inOut: existingEasing.inOut ?? ((fn) => fn),
        bezier: existingEasing.bezier ?? (() => (x) => x),
      },
      useAnimatedStyle: mock.useAnimatedStyle ?? (() => ({})),
    };
  } catch {
    const React = require('react');
    const { View } = require('react-native');
    return {
      __esModule: true,
      default: {
        View,
        createAnimatedComponent: (C) => C,
      },
      useSharedValue: (init) => ({ value: init }),
      useAnimatedStyle: () => ({}),
      useAnimatedProps: () => ({}),
      withTiming: (to) => to,
      Easing: {
        linear: (x) => x,
        inOut: (fn) => fn,
        bezier: () => (x) => x,
      },
      interpolateColor: () => '#000000',
    };
  }
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const el = (tag) => (props) => React.createElement(tag, props, props.children);
  return {
    __esModule: true,
    default: el('Svg'),
    Svg: el('Svg'),
    Circle: el('Circle'),
    G: el('G'),
    Defs: el('Defs'),
    LinearGradient: el('LinearGradient'),
    Rect: el('Rect'),
    Stop: el('Stop'),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  const View = ({ children, ...props }) => React.createElement('View', props, children);
  const Text = ({ children, ...props }) => React.createElement('Text', props, children);
  const ScrollView = ({ children, ...props }) => React.createElement('ScrollView', props, children);
  const TouchableOpacity = ({ children, ...props }) =>
    React.createElement('TouchableOpacity', props, children);
  const Pressable = ({ children, ...props }) => React.createElement('Pressable', props, children);
  const TextInput = (props) => React.createElement('TextInput', props);
  const ActivityIndicator = (props) => React.createElement('ActivityIndicator', props);
  const Switch = (props) => React.createElement('Switch', props);
  const Image = (props) => React.createElement('Image', props);
  const Modal = ({ children, visible, ...props }) =>
    visible ? React.createElement('Modal', props, children) : null;
  const KeyboardAvoidingView = ({ children, ...props }) =>
    React.createElement('KeyboardAvoidingView', props, children);
  const StatusBar = (props) => React.createElement('StatusBar', props);

  return {
    Platform: {
      OS: 'android',
      select: (objs) => objs.android || objs.default,
    },
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    Pressable,
    TextInput,
    ActivityIndicator,
    Switch,
    Image,
    Modal,
    KeyboardAvoidingView,
    StatusBar,
    Alert: {
      alert: jest.fn(),
    },
    AppState: {
      currentState: 'active',
      addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Linking: {
      openURL: jest.fn(),
      canOpenURL: jest.fn(() => Promise.resolve(true)),
      getInitialURL: jest.fn(() => Promise.resolve(null)),
    },
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => (Array.isArray(style) ? Object.assign({}, ...style) : style || {}),
    },
    Dimensions: {
      get: () => ({ width: 375, height: 812 }),
    },
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    Easing: {
      linear: (t) => t,
      /** @param { (t: number) => number } fn */
      out: (fn) => fn,
      cubic: (t) => t * t * t,
    },
    Animated: (() => {
      const makeAnim = () => ({
        start: (cb) => cb && cb({ finished: true }),
        stop: () => {},
        reset: () => {},
      });
      return {
        Value: class {
          constructor() {
            this.setValue = jest.fn();
            this.interpolate = jest.fn(() => ({}));
            this.addListener = jest.fn();
            this.removeListener = jest.fn();
            this.removeAllListeners = jest.fn();
            this.stopAnimation = jest.fn();
            this.resetAnimation = jest.fn();
            this.setOffset = jest.fn();
            this.flattenOffset = jest.fn();
            this.extractOffset = jest.fn();
          }
        },
        timing: jest.fn(() => makeAnim()),
        spring: jest.fn(() => makeAnim()),
        parallel: jest.fn(() => makeAnim()),
        sequence: jest.fn(() => makeAnim()),
        loop: jest.fn(() => makeAnim()),
        delay: jest.fn(() => makeAnim()),
        add: jest.fn(),
        subtract: jest.fn(),
        divide: jest.fn(),
        multiply: jest.fn(),
        modulo: jest.fn(),
        diffClamp: jest.fn(),
        event: jest.fn(),
        createAnimatedComponent: jest.fn((Component) => Component),
        View: ({ children, ...props }) => React.createElement('View', props, children),
        Text: ({ children, ...props }) => React.createElement('Text', props, children),
        ScrollView: ({ children, ...props }) => React.createElement('ScrollView', props, children),
        Image: (props) => React.createElement('Image', props),
      };
    })(),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 34, left: 0 };
  return {
    SafeAreaProvider: ({ children }) => children,
    SafeAreaView: ({ children, ...props }) => React.createElement('View', props, children),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});

jest.mock('expo-modules-core', () => ({
  Platform: {
    OS: 'android',
    select: (objs) => objs.android || objs.default,
  },
  requireNativeModule: jest.fn(() => ({})),
  requireOptionalNativeModule: jest.fn(() => ({})),
  EventEmitter: class EventEmitter {
    addListener() {
      return { remove: jest.fn() };
    }
    removeAllListeners() {}
  },
}));

// Mocking expo-sqlite as it requires native module support
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => {
    return {
      execAsync: jest.fn(async () => []),
      runAsync: jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 })),
      getFirstAsync: jest.fn(async () => null),
      getAllAsync: jest.fn(async () => []),
      isInTransactionAsync: jest.fn(async () => false),
      closeSync: jest.fn(),
    };
  }),
}));

// Mocking expo-file-system as it requires native module support
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory:
    'file:///data/user/0/host.exp.exponent/files/ExperienceData/%40anonymous%2FGuru/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  makeDirectoryAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async () => {}),
  readAsStringAsync: jest.fn(async () => ''),
  copyAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  readDirectoryAsync: jest.fn(async () => []),
  StorageAccessFramework: {
    createFileAsync: jest.fn(async () => 'file://backup'),
    writeAsStringAsync: jest.fn(async () => {}),
  },
  EncodingType: {
    UTF8: 'utf8',
  },
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    goBack: jest.fn(),
    canGoBack: () => true,
    navigate: jest.fn(),
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialIcons: 'MaterialIcons',
  MaterialCommunityIcons: 'MaterialCommunityIcons',
  Feather: 'Feather',
}));

global.__DEV__ = true;

/** Jest `resetMocks` clears `jest.fn` implementations — restore RN Animated helpers each test. */
beforeEach(() => {
  const RN = require('react-native');
  const A = RN.Animated;
  if (!A?.timing) return;
  const makeAnim = () => ({
    start: (cb) => cb && cb({ finished: true }),
    stop: () => {},
    reset: () => {},
  });
  if (A.timing?.mockImplementation) A.timing.mockImplementation(() => makeAnim());
  if (A.spring?.mockImplementation) A.spring.mockImplementation(() => makeAnim());
  if (A.parallel?.mockImplementation) A.parallel.mockImplementation(() => makeAnim());
  if (A.sequence?.mockImplementation) A.sequence.mockImplementation(() => makeAnim());
  if (A.loop?.mockImplementation) A.loop.mockImplementation(() => makeAnim());
  if (A.delay?.mockImplementation) A.delay.mockImplementation(() => makeAnim());
});
