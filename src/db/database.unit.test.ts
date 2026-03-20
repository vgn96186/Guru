describe('database.ts', () => {
  let database: any;
  let SQLite: any;
  let FileSystem: any;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('expo-sqlite', () => ({
      openDatabaseAsync: jest.fn(async () => ({
        execAsync: jest.fn(async () => []),
        runAsync: jest.fn(async () => ({ lastInsertRowId: 1, changes: 1 })),
        getFirstAsync: jest.fn(async () => null),
        getAllAsync: jest.fn(async () => []),
        isInTransactionAsync: jest.fn(async () => false),
        closeSync: jest.fn(),
      })),
    }));

    jest.doMock('expo-file-system/legacy', () => ({
      documentDirectory: 'file:///mock-docs/',
      getInfoAsync: jest.fn(async () => ({ exists: true })),
      makeDirectoryAsync: jest.fn(async () => {}),
      copyAsync: jest.fn(async () => {}),
    }));

    jest.doMock('../services/ai/embeddingService', () => ({
      generateEmbedding: jest.fn(),
      embeddingToBlob: jest.fn(),
    }));

    database = require('./database');
    SQLite = require('expo-sqlite');
    FileSystem = require('expo-file-system/legacy');
    database.resetDbSingleton();
  });

  describe('getDb', () => {
    it('throws if db is not initialized', () => {
      expect(() => database.getDb()).toThrow('DB not initialized');
    });
  });

  describe('initDatabase', () => {
    it('initializes the database successfully without force seed', async () => {
      await database.initDatabase();

      expect(SQLite.openDatabaseAsync).toHaveBeenCalledWith('neet_study.db');
      expect(database.getDb()).toBeDefined();
    });
  });

  describe('runInTransaction', () => {
    it('runs the function inside a transaction', async () => {
      await database.initDatabase();
      const mockDb = database.getDb();

      const fn = jest.fn().mockResolvedValue('success');
      const result = await database.runInTransaction(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledWith(mockDb);
      expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockDb.execAsync).toHaveBeenCalledWith('COMMIT TRANSACTION');
    });

    it('rolls back if the function throws', async () => {
      await database.initDatabase();
      const mockDb = database.getDb();

      const fn = jest.fn().mockRejectedValue(new Error('Test Error'));

      await expect(database.runInTransaction(fn)).rejects.toThrow('Test Error');

      expect(mockDb.execAsync).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(mockDb.execAsync).toHaveBeenCalledWith('ROLLBACK TRANSACTION');
    });
  });
});
