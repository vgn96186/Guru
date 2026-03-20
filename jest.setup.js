/* eslint-env jest */
/* global jest, require, module, __DEV__ */

jest.mock('react-native', () => {
  const React = require('react');
  const View = ({ children, ...props }) => React.createElement('View', props, children);
  const Text = ({ children, ...props }) => React.createElement('Text', props, children);
  const ScrollView = ({ children, ...props }) => React.createElement('ScrollView', props, children);
  const TouchableOpacity = ({ children, ...props }) => React.createElement('TouchableOpacity', props, children);
  const TextInput = (props) => React.createElement('TextInput', props);
  const ActivityIndicator = (props) => React.createElement('ActivityIndicator', props);
  const Switch = (props) => React.createElement('Switch', props);
  const Image = (props) => React.createElement('Image', props);
  const Modal = ({ children, visible, ...props }) => (visible ? React.createElement('Modal', props, children) : null);
  const KeyboardAvoidingView = ({ children, ...props }) => React.createElement('KeyboardAvoidingView', props, children);
  
  return {
    Platform: {
      OS: 'android',
      select: (objs) => objs.android || objs.default,
    },
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Switch,
    Image,
    Modal,
    KeyboardAvoidingView,
    StyleSheet: {
      create: (styles) => styles,
      flatten: (style) => (Array.isArray(style) ? Object.assign({}, ...style) : style || {}),
    },
    Dimensions: {
      get: () => ({ width: 375, height: 812 }),
    },
    Animated: {
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
      timing: jest.fn(() => ({
        start: jest.fn((cb) => cb && cb({ finished: true })),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
      spring: jest.fn(() => ({
        start: jest.fn((cb) => cb && cb({ finished: true })),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
      parallel: jest.fn(() => ({
        start: jest.fn((cb) => cb && cb({ finished: true })),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
      sequence: jest.fn(() => ({
        start: jest.fn((cb) => cb && cb({ finished: true })),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
      loop: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
      delay: jest.fn(() => ({
        start: jest.fn((cb) => cb && cb({ finished: true })),
        stop: jest.fn(),
        reset: jest.fn(),
      })),
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
    },
  };
});

jest.mock('expo-modules-core', () => ({
  Platform: {
    OS: 'android',
    select: (objs) => objs.android || objs.default,
  },
}));

// Mocking expo-sqlite as it requires native module support
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 })),
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
  })),
}));

// Mocking expo-file-system as it requires native module support
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/host.exp.exponent/files/ExperienceData/%40anonymous%2FGuru/',
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
