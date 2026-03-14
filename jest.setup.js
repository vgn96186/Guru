jest.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (objs) => objs.android || objs.default,
  },
}));

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

global.__DEV__ = true;
