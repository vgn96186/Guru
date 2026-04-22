'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.resetDbSingleton = void 0;
exports.getDrizzleDb = getDrizzleDb;
exports.resetDrizzleDb = resetDrizzleDb;
var expo_sqlite_1 = require('drizzle-orm/expo-sqlite');
var database_1 = require('./database');
Object.defineProperty(exports, 'resetDbSingleton', {
  enumerable: true,
  get: function () {
    return database_1.resetDbSingleton;
  },
});
var schema = require('./drizzleSchema');
var _drizzleDb = null;
/**
 * Returns the singleton Drizzle ORM instance backed by the same expo-sqlite
 * connection as the legacy raw-SQL layer. Must only be called after
 * initDatabase() has completed (throws otherwise via getDb()).
 *
 * Drizzle's expo-sqlite driver uses the synchronous SQLite API — queries
 * execute on the JS thread but are fast for local SQLite reads/writes.
 */
function getDrizzleDb() {
  if (!_drizzleDb) {
    _drizzleDb = (0, expo_sqlite_1.drizzle)((0, database_1.getDb)(), { schema: schema });
  }
  return _drizzleDb;
}
/**
 * Clear the Drizzle singleton. Call alongside resetDbSingleton() before
 * re-importing a backup so the new connection is used.
 */
function resetDrizzleDb() {
  _drizzleDb = null;
}
