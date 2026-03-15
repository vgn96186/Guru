import { getDefaultSubjectLoadMultiplier, SUBJECT_WORKLOAD_OVERRIDES } from './studyPlanner';

jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn().mockReturnValue({}),
  requireOptionalNativeModule: jest.fn().mockReturnValue({}),
  EventEmitter: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('expo-device', () => ({
  DeviceType: { UNKNOWN: 0, PHONE: 1, TABLET: 2, DESKTOP: 3, TV: 4 },
}));

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn().mockReturnValue({}),
}));

jest.mock('../components/Toast', () => ({
  showToast: jest.fn(),
}));

jest.mock('react-native', () => ({
  Animated: {
    View: 'Animated.View',
    timing: jest.fn(() => ({ start: jest.fn() })),
    Value: jest.fn(() => ({ interpolate: jest.fn() })),
  },
  StyleSheet: { create: jest.fn((o) => o) },
  Text: 'Text',
  View: 'View',
}));

describe('studyPlanner', () => {
  describe('getDefaultSubjectLoadMultiplier', () => {
    it('returns the defined multiplier for an existing subject code', () => {
      // MED is defined in SUBJECT_WORKLOAD_OVERRIDES as 1.35
      expect(SUBJECT_WORKLOAD_OVERRIDES['MED']).toBe(1.35);
      expect(getDefaultSubjectLoadMultiplier('MED')).toBe(1.35);

      // SURG is defined as 1.3
      expect(SUBJECT_WORKLOAD_OVERRIDES['SURG']).toBe(1.3);
      expect(getDefaultSubjectLoadMultiplier('SURG')).toBe(1.3);
    });

    it('returns 1 as default for an unknown or missing subject code', () => {
      expect(getDefaultSubjectLoadMultiplier('UNKNOWN_SUBJECT')).toBe(1);
      expect(getDefaultSubjectLoadMultiplier('')).toBe(1);
    });
  });
});
