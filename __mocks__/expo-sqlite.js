/* global module, jest, console */
module.exports = {
  openDatabaseAsync: jest.fn(async () => {
    console.log('[DEBUG] MOCK openDatabaseAsync called');
    return {
      execAsync: jest.fn(async () => []),
      runAsync: jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 })),
      getFirstAsync: jest.fn(async () => null),
      getAllAsync: jest.fn(async () => []),
      isInTransactionAsync: jest.fn(async () => false),
      closeSync: jest.fn(),
    };
  }),
};
