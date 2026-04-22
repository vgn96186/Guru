"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQL_AI_CACHE = exports.DB_PATH = exports.DB_DIR = exports.DB_NAME = void 0;
exports.getDb = getDb;
exports.getAiCacheDb = getAiCacheDb;
exports.resetAiCacheDbSingleton = resetAiCacheDbSingleton;
exports.walCheckpoint = walCheckpoint;
exports.closeDbGracefully = closeDbGracefully;
exports.resetDbSingleton = resetDbSingleton;
exports.setDbForTests = setDbForTests;
exports.runInTransaction = runInTransaction;
exports.initDatabase = initDatabase;
exports.syncVaultSeedTopics = syncVaultSeedTopics;
exports.seedSubjects = seedSubjects;
exports.seedTopics = seedTopics;
exports.todayStr = todayStr;
exports.dateStr = dateStr;
exports.nowTs = nowTs;
var SQLite = require("expo-sqlite");
var FileSystem = require("expo-file-system/legacy");
var schema_1 = require("./schema");
var migrations_1 = require("./migrations");
var syllabus_1 = require("../constants/syllabus");
var vaultTopics_1 = require("../constants/vaultTopics");
var time_1 = require("../constants/time");
var appConfig_1 = require("../config/appConfig");
exports.DB_NAME = 'neet_study.db';
exports.DB_DIR = "".concat(FileSystem.documentDirectory, "SQLite");
exports.DB_PATH = "".concat(exports.DB_DIR, "/").concat(exports.DB_NAME);
var _db = null;
/** Typed access to the global DB slot and init queue (survives hot reloads in dev). */
var _globalDb = global;
if (!_globalDb.__GURU_DB_INIT_QUEUE__) {
    _globalDb.__GURU_DB_INIT_QUEUE__ = Promise.resolve();
}
function getDb() {
    var db = _db || _globalDb.__GURU_DB__;
    if (!db)
        throw new Error('DB not initialized — call initDatabase() first');
    return db;
}
/** Table name for AI cache (lives in main DB to avoid ATTACH issues on Android). */
exports.SQL_AI_CACHE = 'ai_cache';
function getAiCacheDb() {
    return getDb();
}
function resetAiCacheDbSingleton() {
    // No-op: AI cache now lives in the main DB. Kept for backward compatibility.
}
/**
 * Flush WAL journal into the main DB file. Call before copying the .db file
 * to ensure all committed writes are in the main file, not stranded in -wal.
 *
 * Retries on SQLITE_BUSY / "database is locked" — startup can overlap this
 * with notification refresh, AI prefetch, and other readers/writers.
 */
function walCheckpoint() {
    return __awaiter(this, void 0, void 0, function () {
        var db, maxAttempts, baseDelayMs, _loop_1, attempt, state_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = getDb();
                    maxAttempts = 6;
                    baseDelayMs = 350;
                    _loop_1 = function (attempt) {
                        var e_1, msg, retryable;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 4]);
                                    return [4 /*yield*/, db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)')];
                                case 1:
                                    _b.sent();
                                    return [2 /*return*/, { value: void 0 }];
                                case 2:
                                    e_1 = _b.sent();
                                    msg = (e_1 instanceof Error ? e_1.message : String(e_1)).toLowerCase();
                                    retryable = msg.includes('locked') || msg.includes('busy');
                                    if (!retryable || attempt === maxAttempts)
                                        throw e_1;
                                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, baseDelayMs * attempt); })];
                                case 3:
                                    _b.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= maxAttempts)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Gracefully close the DB. Prefers async close (lets pending statements finalize)
 * over sync close (which throws if statements are in-flight).
 */
function closeDbGracefully() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = getDb();
                    if (!(typeof db.closeAsync === 'function')) return [3 /*break*/, 2];
                    return [4 /*yield*/, db.closeAsync()];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    db.closeSync();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
/** Clear the DB singleton (used before re-importing a backup). */
function resetDbSingleton() {
    _db = null;
    _globalDb.__GURU_DB__ = undefined;
    _globalDb.__GURU_DB_INIT_QUEUE__ = Promise.resolve();
}
/**
 * Inject a database instance for Node-based integration tests (see `src/db/testing/`).
 * Only available when `NODE_ENV === 'test'`.
 */
function setDbForTests(db) {
    if (process.env.NODE_ENV !== 'test') {
        throw new Error('setDbForTests is only available in test runs');
    }
    _db = db;
    _globalDb.__GURU_DB__ = db !== null && db !== void 0 ? db : undefined;
}
/**
 * Run multiple DB operations in a single transaction. On success commits; on throw rolls back.
 * Use for any multi-statement write that must be atomic.
 */
function runInTransaction(fn) {
    return __awaiter(this, void 0, void 0, function () {
        var db, result_1, inTx, result, e_2, rollbackErr_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = getDb();
                    if (!(typeof db.withExclusiveTransactionAsync === 'function')) return [3 /*break*/, 2];
                    return [4 /*yield*/, db.withExclusiveTransactionAsync(function () { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, fn(db)];
                                    case 1:
                                        result_1 = _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, result_1];
                case 2: return [4 /*yield*/, db.isInTransactionAsync()];
                case 3:
                    inTx = _a.sent();
                    if (inTx) {
                        return [2 /*return*/, fn(db)];
                    }
                    return [4 /*yield*/, db.execAsync('BEGIN TRANSACTION')];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    _a.trys.push([5, 8, , 13]);
                    return [4 /*yield*/, fn(db)];
                case 6:
                    result = _a.sent();
                    return [4 /*yield*/, db.execAsync('COMMIT TRANSACTION')];
                case 7:
                    _a.sent();
                    return [2 /*return*/, result];
                case 8:
                    e_2 = _a.sent();
                    _a.label = 9;
                case 9:
                    _a.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, db.execAsync('ROLLBACK TRANSACTION')];
                case 10:
                    _a.sent();
                    return [3 /*break*/, 12];
                case 11:
                    rollbackErr_1 = _a.sent();
                    if (__DEV__)
                        console.warn('[DB] Rollback failed:', rollbackErr_1);
                    return [3 /*break*/, 12];
                case 12: throw e_2;
                case 13: return [2 /*return*/];
            }
        });
    });
}
function initDatabase() {
    return __awaiter(this, arguments, void 0, function (forceSeed) {
        var run;
        if (forceSeed === void 0) { forceSeed = false; }
        return __generator(this, function (_a) {
            run = _globalDb.__GURU_DB_INIT_QUEUE__.then(function () { return initDatabaseInternal(forceSeed); });
            // Keep queue alive even if one init fails; callers still receive original rejection via `run`.
            _globalDb.__GURU_DB_INIT_QUEUE__ = run.catch(function () { });
            return [2 /*return*/, run];
        });
    });
}
function initDatabaseInternal() {
    return __awaiter(this, arguments, void 0, function (forceSeed) {
        var dbDir, oldDbPath, newDbPath, oldInfo, newInfo, err_1, db, _i, ALL_SCHEMAS_1, sql, staleIndexes, _a, staleIndexes_1, sql, err_2, _b, DB_INDEXES_1, sql, err_3, topicCountRes, topicCount, versionRow, currentVersion, _c, MIGRATIONS_1, m, err_4, msg, _d, integrityRepairs, _e, integrityRepairs_1, sql, err_5, profile;
        var _f, _g, _h;
        if (forceSeed === void 0) { forceSeed = false; }
        return __generator(this, function (_j) {
            switch (_j.label) {
                case 0:
                    if (!(!_globalDb.__GURU_DB__ || forceSeed)) return [3 /*break*/, 12];
                    dbDir = exports.DB_DIR + '/';
                    oldDbPath = dbDir + 'study_guru.db';
                    newDbPath = exports.DB_PATH;
                    _j.label = 1;
                case 1:
                    _j.trys.push([1, 7, , 8]);
                    return [4 /*yield*/, FileSystem.getInfoAsync(oldDbPath)];
                case 2:
                    oldInfo = _j.sent();
                    return [4 /*yield*/, FileSystem.getInfoAsync(newDbPath)];
                case 3:
                    newInfo = _j.sent();
                    if (!((oldInfo === null || oldInfo === void 0 ? void 0 : oldInfo.exists) && !(newInfo === null || newInfo === void 0 ? void 0 : newInfo.exists))) return [3 /*break*/, 6];
                    if (__DEV__)
                        console.log('[DB] Migrating legacy study_guru.db to neet_study.db...');
                    return [4 /*yield*/, FileSystem.makeDirectoryAsync(dbDir, { intermediates: true })];
                case 4:
                    _j.sent();
                    return [4 /*yield*/, FileSystem.copyAsync({ from: oldDbPath, to: newDbPath })];
                case 5:
                    _j.sent();
                    _j.label = 6;
                case 6: return [3 /*break*/, 8];
                case 7:
                    err_1 = _j.sent();
                    console.warn('[DB] Migration check failed:', err_1);
                    return [3 /*break*/, 8];
                case 8: return [4 /*yield*/, SQLite.openDatabaseAsync(exports.DB_NAME)];
                case 9:
                    _db = _j.sent();
                    // Enable WAL mode for better concurrency (simultaneous reads and writes)
                    return [4 /*yield*/, _db.execAsync('PRAGMA journal_mode = WAL')];
                case 10:
                    // Enable WAL mode for better concurrency (simultaneous reads and writes)
                    _j.sent();
                    return [4 /*yield*/, _db.execAsync('PRAGMA busy_timeout = 5000')];
                case 11:
                    _j.sent();
                    _globalDb.__GURU_DB__ = _db;
                    return [3 /*break*/, 13];
                case 12:
                    _db = _globalDb.__GURU_DB__;
                    _j.label = 13;
                case 13:
                    db = _db;
                    // Enable Foreign Key constraints
                    return [4 /*yield*/, db.execAsync('PRAGMA foreign_keys = ON')];
                case 14:
                    // Enable Foreign Key constraints
                    _j.sent();
                    _i = 0, ALL_SCHEMAS_1 = schema_1.ALL_SCHEMAS;
                    _j.label = 15;
                case 15:
                    if (!(_i < ALL_SCHEMAS_1.length)) return [3 /*break*/, 18];
                    sql = ALL_SCHEMAS_1[_i];
                    return [4 /*yield*/, db.execAsync(sql)];
                case 16:
                    _j.sent();
                    _j.label = 17;
                case 17:
                    _i++;
                    return [3 /*break*/, 15];
                case 18:
                    staleIndexes = [
                        'DROP INDEX IF EXISTS idx_tp_status_review',
                        'DROP INDEX IF EXISTS idx_sessions_date',
                    ];
                    _a = 0, staleIndexes_1 = staleIndexes;
                    _j.label = 19;
                case 19:
                    if (!(_a < staleIndexes_1.length)) return [3 /*break*/, 24];
                    sql = staleIndexes_1[_a];
                    _j.label = 20;
                case 20:
                    _j.trys.push([20, 22, , 23]);
                    return [4 /*yield*/, db.execAsync(sql)];
                case 21:
                    _j.sent();
                    return [3 /*break*/, 23];
                case 22:
                    err_2 = _j.sent();
                    if (__DEV__)
                        console.warn('[DB] Failed to drop stale index:', sql, err_2);
                    return [3 /*break*/, 23];
                case 23:
                    _a++;
                    return [3 /*break*/, 19];
                case 24:
                    _b = 0, DB_INDEXES_1 = schema_1.DB_INDEXES;
                    _j.label = 25;
                case 25:
                    if (!(_b < DB_INDEXES_1.length)) return [3 /*break*/, 30];
                    sql = DB_INDEXES_1[_b];
                    _j.label = 26;
                case 26:
                    _j.trys.push([26, 28, , 29]);
                    return [4 /*yield*/, db.execAsync(sql)];
                case 27:
                    _j.sent();
                    return [3 /*break*/, 29];
                case 28:
                    err_3 = _j.sent();
                    if (__DEV__)
                        console.warn('[DB] Failed to create index:', sql, err_3);
                    return [3 /*break*/, 29];
                case 29:
                    _b++;
                    return [3 /*break*/, 25];
                case 30: return [4 /*yield*/, db.getFirstAsync('SELECT COUNT(*) as count FROM topics')];
                case 31:
                    topicCountRes = _j.sent();
                    topicCount = (_f = topicCountRes === null || topicCountRes === void 0 ? void 0 : topicCountRes.count) !== null && _f !== void 0 ? _f : 0;
                    // Ensure all subjects exist on every boot (safe due to INSERT OR IGNORE)
                    return [4 /*yield*/, seedSubjects(db)];
                case 32:
                    // Ensure all subjects exist on every boot (safe due to INSERT OR IGNORE)
                    _j.sent();
                    if (!(topicCount === 0 || forceSeed)) return [3 /*break*/, 42];
                    if (!forceSeed) return [3 /*break*/, 39];
                    return [4 /*yield*/, db.execAsync('PRAGMA foreign_keys = OFF')];
                case 33:
                    _j.sent();
                    return [4 /*yield*/, db.execAsync('DELETE FROM topic_progress')];
                case 34:
                    _j.sent();
                    return [4 /*yield*/, db.execAsync('DELETE FROM topics')];
                case 35:
                    _j.sent();
                    return [4 /*yield*/, db.execAsync('DELETE FROM subjects')];
                case 36:
                    _j.sent();
                    return [4 /*yield*/, db.execAsync('PRAGMA foreign_keys = ON')];
                case 37:
                    _j.sent();
                    return [4 /*yield*/, seedSubjects(db)];
                case 38:
                    _j.sent();
                    _j.label = 39;
                case 39: return [4 /*yield*/, seedTopics(db)];
                case 40:
                    _j.sent();
                    return [4 /*yield*/, seedUserProfile(db)];
                case 41:
                    _j.sent();
                    _j.label = 42;
                case 42: 
                // Always seed vault topics (idempotent — INSERT OR IGNORE)
                return [4 /*yield*/, seedVaultTopics(db)];
                case 43:
                    // Always seed vault topics (idempotent — INSERT OR IGNORE)
                    _j.sent();
                    return [4 /*yield*/, db.getFirstAsync('PRAGMA user_version')];
                case 44:
                    versionRow = _j.sent();
                    currentVersion = (_g = versionRow === null || versionRow === void 0 ? void 0 : versionRow.user_version) !== null && _g !== void 0 ? _g : 0;
                    if (!(topicCount === 0)) return [3 /*break*/, 46];
                    // Fresh install: schema already complete from CREATE TABLE; mark as up-to-date
                    return [4 /*yield*/, db.execAsync("PRAGMA user_version = ".concat(migrations_1.LATEST_VERSION))];
                case 45:
                    // Fresh install: schema already complete from CREATE TABLE; mark as up-to-date
                    _j.sent();
                    return [3 /*break*/, 57];
                case 46:
                    _c = 0, MIGRATIONS_1 = migrations_1.MIGRATIONS;
                    _j.label = 47;
                case 47:
                    if (!(_c < MIGRATIONS_1.length)) return [3 /*break*/, 57];
                    m = MIGRATIONS_1[_c];
                    if (!(m.version > currentVersion)) return [3 /*break*/, 56];
                    _j.label = 48;
                case 48:
                    _j.trys.push([48, 50, , 51]);
                    return [4 /*yield*/, db.execAsync(m.sql)];
                case 49:
                    _j.sent();
                    return [3 /*break*/, 51];
                case 50:
                    err_4 = _j.sent();
                    msg = (err_4 === null || err_4 === void 0 ? void 0 : err_4.message) || '';
                    if (msg.includes('duplicate column name')) {
                        if (__DEV__)
                            console.log("[DB] Migration ".concat(m.version, " column already exists, skipping."));
                    }
                    else if (m.version === 76 &&
                        m.sql.includes('RENAME TO daily_agenda') &&
                        msg.includes('already another table or index with this name')) {
                        if (__DEV__)
                            console.log("[DB] Migration ".concat(m.version, " already applied (daily_agenda exists), skipping."));
                    }
                    else {
                        if (__DEV__)
                            console.error('[DB] Migration failed:', m.version, m.sql, err_4);
                        throw err_4;
                    }
                    return [3 /*break*/, 51];
                case 51: return [4 /*yield*/, db.execAsync("PRAGMA user_version = ".concat(m.version))];
                case 52:
                    _j.sent();
                    _j.label = 53;
                case 53:
                    _j.trys.push([53, 55, , 56]);
                    return [4 /*yield*/, db.runAsync('INSERT INTO migration_history (version, applied_at, description) VALUES (?, ?, ?)', [m.version, Math.floor(nowTs() / 1000), (_h = m.description) !== null && _h !== void 0 ? _h : ''])];
                case 54:
                    _j.sent();
                    return [3 /*break*/, 56];
                case 55:
                    _d = _j.sent();
                    return [3 /*break*/, 56];
                case 56:
                    _c++;
                    return [3 /*break*/, 47];
                case 57: 
                // ── Defensive column verification ──────────────────────────────────────────
                // Handles desync caused by backup restores: the PRAGMA user_version may be
                // up-to-date while the actual schema is missing columns that the migration
                // runner would have added. We introspect all critical tables and add any
                // missing columns that the current schema expects.
                return [4 /*yield*/, ensureCriticalColumns(db)];
                case 58:
                    // ── Defensive column verification ──────────────────────────────────────────
                    // Handles desync caused by backup restores: the PRAGMA user_version may be
                    // up-to-date while the actual schema is missing columns that the migration
                    // runner would have added. We introspect all critical tables and add any
                    // missing columns that the current schema expects.
                    _j.sent();
                    integrityRepairs = [
                        "DELETE FROM topic_progress WHERE topic_id NOT IN (SELECT id FROM topics)",
                        "DELETE FROM ".concat(exports.SQL_AI_CACHE, " WHERE topic_id NOT IN (SELECT id FROM topics)"),
                        "UPDATE lecture_notes SET subject_id = NULL WHERE subject_id IS NOT NULL AND subject_id NOT IN (SELECT id FROM subjects)",
                        "UPDATE external_app_logs\n       SET lecture_note_id = NULL\n     WHERE lecture_note_id IS NOT NULL\n       AND lecture_note_id NOT IN (SELECT id FROM lecture_notes)",
                        "UPDATE generated_study_images SET topic_id = NULL WHERE topic_id IS NOT NULL AND topic_id NOT IN (SELECT id FROM topics)",
                        "DELETE FROM generated_study_images WHERE lecture_note_id IS NOT NULL AND lecture_note_id NOT IN (SELECT id FROM lecture_notes)",
                        "DELETE FROM lecture_learned_topics WHERE topic_id NOT IN (SELECT id FROM topics) OR lecture_note_id NOT IN (SELECT id FROM lecture_notes)",
                        "UPDATE topic_suggestions SET approved_topic_id = NULL WHERE approved_topic_id IS NOT NULL AND approved_topic_id NOT IN (SELECT id FROM topics)",
                        "DELETE FROM topic_suggestions WHERE subject_id NOT IN (SELECT id FROM subjects)",
                    ];
                    _e = 0, integrityRepairs_1 = integrityRepairs;
                    _j.label = 59;
                case 59:
                    if (!(_e < integrityRepairs_1.length)) return [3 /*break*/, 64];
                    sql = integrityRepairs_1[_e];
                    _j.label = 60;
                case 60:
                    _j.trys.push([60, 62, , 63]);
                    return [4 /*yield*/, db.execAsync(sql)];
                case 61:
                    _j.sent();
                    return [3 /*break*/, 63];
                case 62:
                    err_5 = _j.sent();
                    if (__DEV__)
                        console.warn('[DB] Integrity repair failed:', sql, err_5);
                    return [3 /*break*/, 63];
                case 63:
                    _e++;
                    return [3 /*break*/, 59];
                case 64: 
                // Ensure all topics (including vault seeds) have a progress row
                return [4 /*yield*/, db.execAsync('INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics')];
                case 65:
                    // Ensure all topics (including vault seeds) have a progress row
                    _j.sent();
                    return [4 /*yield*/, db.execAsync('PRAGMA foreign_keys = ON')];
                case 66:
                    _j.sent();
                    return [4 /*yield*/, db.getFirstAsync('SELECT id, groq_api_key FROM user_profile WHERE id = 1')];
                case 67:
                    profile = _j.sent();
                    if (!!profile) return [3 /*break*/, 69];
                    return [4 /*yield*/, seedUserProfile(db)];
                case 68:
                    _j.sent();
                    _j.label = 69;
                case 69: 
                // Update streak on open
                return [4 /*yield*/, updateStreakOnOpen(db)];
                case 70:
                    // Update streak on open
                    _j.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Re-run vault topic seeding without destructive wipes.
 * Safe for manual "sync" actions from the UI.
 */
function syncVaultSeedTopics() {
    return __awaiter(this, void 0, void 0, function () {
        var db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    db = getDb();
                    return [4 /*yield*/, seedTopics(db)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, seedVaultTopics(db)];
                case 2:
                    _a.sent();
                    return [4 /*yield*/, db.execAsync('INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics')];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** Exported for `src/db/seedTopics.db.test.ts`. Not part of the app API. */
function seedSubjects(db) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, SUBJECTS_SEED_1, s;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _i = 0, SUBJECTS_SEED_1 = syllabus_1.SUBJECTS_SEED;
                    _a.label = 1;
                case 1:
                    if (!(_i < SUBJECTS_SEED_1.length)) return [3 /*break*/, 4];
                    s = SUBJECTS_SEED_1[_i];
                    return [4 /*yield*/, db.runAsync("INSERT OR IGNORE INTO subjects (id, name, short_code, color_hex, inicet_weight, neet_weight, display_order)\n       VALUES (?, ?, ?, ?, ?, ?, ?)", [s.id, s.name, s.shortCode, s.colorHex, s.inicetWeight, s.neetWeight, s.displayOrder])];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * Batch size for multi-VALUES INSERTs. SQLite's default SQLITE_MAX_VARIABLE_NUMBER
 * is 999; a topic row binds 4 params, so the upper bound is 249. We use 200
 * for headroom and to keep SQL text size modest.
 */
var SEED_INSERT_CHUNK = 200;
/** Exported for `src/db/seedTopics.db.test.ts`. Not part of the app API. */
function seedTopics(_db) {
    return __awaiter(this, void 0, void 0, function () {
        var TOPICS_SEED;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('../constants/syllabus/topics'); })];
                case 1:
                    TOPICS_SEED = (_a.sent()).TOPICS_SEED;
                    return [4 /*yield*/, runInTransaction(function (db) { return __awaiter(_this, void 0, void 0, function () {
                            var i, chunk, placeholders, params, _i, chunk_1, _a, subjectId, name_1, priority, minutes, withParent, i, chunk, placeholders, params, _b, chunk_2, _c, sid, name_2, pName;
                            return __generator(this, function (_d) {
                                switch (_d.label) {
                                    case 0:
                                        i = 0;
                                        _d.label = 1;
                                    case 1:
                                        if (!(i < TOPICS_SEED.length)) return [3 /*break*/, 4];
                                        chunk = TOPICS_SEED.slice(i, i + SEED_INSERT_CHUNK);
                                        placeholders = chunk.map(function () { return '(?, ?, ?, ?)'; }).join(', ');
                                        params = [];
                                        for (_i = 0, chunk_1 = chunk; _i < chunk_1.length; _i++) {
                                            _a = chunk_1[_i], subjectId = _a[0], name_1 = _a[1], priority = _a[2], minutes = _a[3];
                                            params.push(subjectId, name_1, priority, minutes);
                                        }
                                        return [4 /*yield*/, db.runAsync("INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES ".concat(placeholders), params)];
                                    case 2:
                                        _d.sent();
                                        _d.label = 3;
                                    case 3:
                                        i += SEED_INSERT_CHUNK;
                                        return [3 /*break*/, 1];
                                    case 4: 
                                    // Bulk-insert progress rows for any topic that doesn't already have one.
                                    // Equivalent to the previous per-row `INSERT OR IGNORE` inside pass 1,
                                    // but in a single statement. (Same pattern `syncVaultSeedTopics` uses.)
                                    return [4 /*yield*/, db.execAsync("INSERT OR IGNORE INTO topic_progress (topic_id) SELECT id FROM topics")];
                                    case 5:
                                        // Bulk-insert progress rows for any topic that doesn't already have one.
                                        // Equivalent to the previous per-row `INSERT OR IGNORE` inside pass 1,
                                        // but in a single statement. (Same pattern `syncVaultSeedTopics` uses.)
                                        _d.sent();
                                        // Pass 2: Optimized parent linking (bulk repair).
                                        // A temp table maps (subject_id, name) → parent_name so the final UPDATE
                                        // can resolve every parent_topic_id in one query.
                                        return [4 /*yield*/, db.execAsync('CREATE TEMP TABLE IF NOT EXISTS tmp_parent_mapping (subject_id INTEGER, name TEXT, parent_name TEXT)')];
                                    case 6:
                                        // Pass 2: Optimized parent linking (bulk repair).
                                        // A temp table maps (subject_id, name) → parent_name so the final UPDATE
                                        // can resolve every parent_topic_id in one query.
                                        _d.sent();
                                        return [4 /*yield*/, db.execAsync('DELETE FROM tmp_parent_mapping')];
                                    case 7:
                                        _d.sent();
                                        withParent = TOPICS_SEED.filter(function (t) { return t[4] !== undefined; });
                                        i = 0;
                                        _d.label = 8;
                                    case 8:
                                        if (!(i < withParent.length)) return [3 /*break*/, 11];
                                        chunk = withParent.slice(i, i + SEED_INSERT_CHUNK);
                                        placeholders = chunk.map(function () { return '(?, ?, ?)'; }).join(', ');
                                        params = [];
                                        for (_b = 0, chunk_2 = chunk; _b < chunk_2.length; _b++) {
                                            _c = chunk_2[_b], sid = _c[0], name_2 = _c[1], pName = _c[4];
                                            params.push(sid, name_2, pName);
                                        }
                                        return [4 /*yield*/, db.runAsync("INSERT INTO tmp_parent_mapping (subject_id, name, parent_name) VALUES ".concat(placeholders), params)];
                                    case 9:
                                        _d.sent();
                                        _d.label = 10;
                                    case 10:
                                        i += SEED_INSERT_CHUNK;
                                        return [3 /*break*/, 8];
                                    case 11: 
                                    // Single-query bulk update: sets parent_topic_id for all unlinked children in one shot
                                    return [4 /*yield*/, db.execAsync("\n      UPDATE topics\n      SET parent_topic_id = (\n        SELECT p.id \n        FROM topics p\n        JOIN tmp_parent_mapping m ON p.name = m.parent_name AND p.subject_id = m.subject_id\n        WHERE m.name = topics.name AND m.subject_id = topics.subject_id\n      )\n      WHERE parent_topic_id IS NULL \n        AND EXISTS (SELECT 1 FROM tmp_parent_mapping m WHERE m.name = topics.name AND m.subject_id = topics.subject_id)\n    ")];
                                    case 12:
                                        // Single-query bulk update: sets parent_topic_id for all unlinked children in one shot
                                        _d.sent();
                                        return [4 /*yield*/, db.execAsync('DROP TABLE tmp_parent_mapping')];
                                    case 13:
                                        _d.sent();
                                        return [2 /*return*/];
                                }
                            });
                        }); })];
                case 2:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function seedVaultTopics(_db) {
    return __awaiter(this, void 0, void 0, function () {
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, runInTransaction(function (db) { return __awaiter(_this, void 0, void 0, function () {
                        var vaultTopicIds, _i, VAULT_TOPICS_SEED_1, _a, subjectId, name_3, priority, minutes, topicResult, topicId, existingTopic, placeholders;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    vaultTopicIds = [];
                                    _i = 0, VAULT_TOPICS_SEED_1 = vaultTopics_1.VAULT_TOPICS_SEED;
                                    _b.label = 1;
                                case 1:
                                    if (!(_i < VAULT_TOPICS_SEED_1.length)) return [3 /*break*/, 7];
                                    _a = VAULT_TOPICS_SEED_1[_i], subjectId = _a[0], name_3 = _a[1], priority = _a[2], minutes = _a[3];
                                    return [4 /*yield*/, db.runAsync("INSERT OR IGNORE INTO topics (subject_id, name, inicet_priority, estimated_minutes) VALUES (?, ?, ?, ?)", [subjectId, name_3, priority, minutes])];
                                case 2:
                                    topicResult = _b.sent();
                                    topicId = topicResult.lastInsertRowId;
                                    if (!(topicResult.changes === 0)) return [3 /*break*/, 4];
                                    return [4 /*yield*/, db.getFirstAsync("SELECT id FROM topics WHERE subject_id = ? AND name = ?", [subjectId, name_3])];
                                case 3:
                                    existingTopic = _b.sent();
                                    if (existingTopic) {
                                        topicId = existingTopic.id;
                                    }
                                    else {
                                        return [3 /*break*/, 6]; // Neither inserted nor found — skip to avoid pushing undefined
                                    }
                                    _b.label = 4;
                                case 4:
                                    if (!topicId) return [3 /*break*/, 6];
                                    vaultTopicIds.push(topicId);
                                    return [4 /*yield*/, db.runAsync("INSERT OR IGNORE INTO topic_progress (topic_id) VALUES (?)", [topicId])];
                                case 5:
                                    _b.sent();
                                    _b.label = 6;
                                case 6:
                                    _i++;
                                    return [3 /*break*/, 1];
                                case 7:
                                    if (!(vaultTopicIds.length > 0)) return [3 /*break*/, 10];
                                    placeholders = vaultTopicIds.map(function () { return '?'; }).join(',');
                                    return [4 /*yield*/, db.runAsync("UPDATE topic_progress SET status = 'seen' WHERE topic_id IN (".concat(placeholders, ") AND status = 'unseen'"), vaultTopicIds)];
                                case 8:
                                    _b.sent();
                                    return [4 /*yield*/, db.runAsync("UPDATE topic_progress SET confidence = 1 WHERE topic_id IN (".concat(placeholders, ") AND confidence = 0"), vaultTopicIds)];
                                case 9:
                                    _b.sent();
                                    _b.label = 10;
                                case 10: return [2 /*return*/];
                            }
                        });
                    }); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function seedUserProfile(db) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, db.runAsync("INSERT OR IGNORE INTO user_profile (id) VALUES (1)")];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * Defensive schema verification for user_profile.
 * After migrations run, we introspect the actual table and add any columns
 * that the current code expects but that are missing — e.g. after restoring
 * a backup whose PRAGMA user_version was already high enough to skip the
 * ALTER TABLE migration.
 */
function ensureCriticalColumns(db) {
    return __awaiter(this, void 0, void 0, function () {
        var tables, totalAdded, _i, _a, _b, tableName, expectedCols, tableCheck, cols, existing, _c, expectedCols_1, _d, col, def, err_6, err_7;
        var _e;
        return __generator(this, function (_f) {
            switch (_f.label) {
                case 0:
                    tables = {
                        user_profile: [
                            ['strict_mode_enabled', 'INTEGER DEFAULT 0'],
                            ['streak_shield_available', 'INTEGER DEFAULT 1'],
                            ['openrouter_key', "TEXT NOT NULL DEFAULT ''"],
                            ['body_doubling_enabled', 'INTEGER NOT NULL DEFAULT 1'],
                            ['blocked_content_types', "TEXT NOT NULL DEFAULT '[]'"],
                            ['idle_timeout_minutes', 'INTEGER NOT NULL DEFAULT 2'],
                            ['break_duration_minutes', 'INTEGER NOT NULL DEFAULT 5'],
                            ['notification_hour', 'INTEGER NOT NULL DEFAULT 7'],
                            ['focus_subject_ids', "TEXT NOT NULL DEFAULT '[]'"],
                            ['focus_audio_enabled', 'INTEGER NOT NULL DEFAULT 0'],
                            ['visual_timers_enabled', 'INTEGER NOT NULL DEFAULT 0'],
                            ['face_tracking_enabled', 'INTEGER NOT NULL DEFAULT 0'],
                            ['quiz_correct_count', 'INTEGER NOT NULL DEFAULT 0'],
                            ['last_backup_date', 'TEXT'],
                            ['guru_frequency', "TEXT NOT NULL DEFAULT 'normal'"],
                            ['use_local_model', 'INTEGER NOT NULL DEFAULT 1'],
                            ['local_model_path', 'TEXT'],
                            ['use_local_whisper', 'INTEGER NOT NULL DEFAULT 1'],
                            ['local_whisper_path', 'TEXT'],
                            ['use_nano', 'INTEGER NOT NULL DEFAULT 1'],
                            ['quick_start_streak', 'INTEGER NOT NULL DEFAULT 0'],
                            ['groq_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['study_resource_mode', "TEXT NOT NULL DEFAULT 'hybrid'"],
                            ['subject_load_overrides_json', "TEXT NOT NULL DEFAULT '{}'"],
                            ['inicet_date', "TEXT NOT NULL DEFAULT '".concat(appConfig_1.DEFAULT_INICET_DATE, "'")],
                            ['neet_date', "TEXT NOT NULL DEFAULT '".concat(appConfig_1.DEFAULT_NEET_DATE, "'")],
                            ['harassment_tone', "TEXT NOT NULL DEFAULT 'shame'"],
                            ['backup_directory_uri', 'TEXT'],
                            ['pomodoro_enabled', 'INTEGER NOT NULL DEFAULT 1'],
                            ['pomodoro_interval_minutes', 'INTEGER NOT NULL DEFAULT 20'],
                            ['huggingface_token', "TEXT NOT NULL DEFAULT ''"],
                            ['huggingface_transcription_model', "TEXT NOT NULL DEFAULT 'openai/whisper-large-v3'"],
                            ['transcription_provider', "TEXT NOT NULL DEFAULT 'auto'"],
                            ['cloudflare_account_id', "TEXT NOT NULL DEFAULT ''"],
                            ['cloudflare_api_token', "TEXT NOT NULL DEFAULT ''"],
                            ['fal_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['brave_search_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['google_custom_search_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['qwen_connected', 'INTEGER NOT NULL DEFAULT 0'],
                            ['gemini_key', "TEXT NOT NULL DEFAULT ''"],
                            ['guru_chat_default_model', "TEXT NOT NULL DEFAULT 'auto'"],
                            ['guru_memory_notes', "TEXT NOT NULL DEFAULT ''"],
                            ['image_generation_model', "TEXT NOT NULL DEFAULT 'auto'"],
                            ['exam_type', "TEXT NOT NULL DEFAULT 'INICET'"],
                            ['prefer_gemini_structured_json', 'INTEGER NOT NULL DEFAULT 1'],
                            ['github_models_pat', "TEXT NOT NULL DEFAULT ''"],
                            ['kilo_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['deepseek_key', "TEXT NOT NULL DEFAULT ''"],
                            ['agentrouter_key', "TEXT NOT NULL DEFAULT ''"],
                            ['provider_order', "TEXT NOT NULL DEFAULT '[]'"],
                            ['deepgram_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['api_validation_json', "TEXT NOT NULL DEFAULT '{}'"],
                            ['chatgpt_connected', 'INTEGER NOT NULL DEFAULT 0'],
                            [
                                'chatgpt_accounts_json',
                                "TEXT NOT NULL DEFAULT '{\"primary\":{\"enabled\":true,\"connected\":false},\"secondary\":{\"enabled\":false,\"connected\":false}}'",
                            ],
                            ['auto_backup_frequency', "TEXT NOT NULL DEFAULT 'off'"],
                            ['last_auto_backup_at', 'TEXT'],
                            ['jina_api_key', "TEXT NOT NULL DEFAULT ''"],
                            ['github_copilot_connected', 'INTEGER NOT NULL DEFAULT 0'],
                            ['github_copilot_preferred_model', "TEXT NOT NULL DEFAULT ''"],
                            ['gitlab_duo_connected', 'INTEGER NOT NULL DEFAULT 0'],
                            ['gitlab_oauth_client_id', "TEXT NOT NULL DEFAULT ''"],
                            ['gitlab_duo_preferred_model', "TEXT NOT NULL DEFAULT ''"],
                            ['poe_connected', 'INTEGER NOT NULL DEFAULT 0'],
                            ['gdrive_web_client_id', "TEXT NOT NULL DEFAULT ''"],
                            ['gdrive_connected', 'INTEGER NOT NULL DEFAULT 0'],
                            ['gdrive_email', "TEXT NOT NULL DEFAULT ''"],
                            ['gdrive_last_sync_at', 'TEXT'],
                            ['last_backup_device_id', "TEXT NOT NULL DEFAULT ''"],
                        ],
                        topics: [
                            ['parent_topic_id', 'INTEGER REFERENCES topics(id) ON DELETE SET NULL'],
                            ['embedding', 'BLOB'],
                        ],
                        topic_progress: [
                            ['next_review_date', 'TEXT'],
                            ['user_notes', "TEXT NOT NULL DEFAULT ''"],
                            ['wrong_count', 'INTEGER NOT NULL DEFAULT 0'],
                            ['is_nemesis', 'INTEGER NOT NULL DEFAULT 0'],
                            ['fsrs_due', 'TEXT'],
                            ['fsrs_stability', 'REAL DEFAULT 0'],
                            ['fsrs_difficulty', 'REAL DEFAULT 0'],
                            ['fsrs_elapsed_days', 'INTEGER DEFAULT 0'],
                            ['fsrs_scheduled_days', 'INTEGER DEFAULT 0'],
                            ['fsrs_reps', 'INTEGER DEFAULT 0'],
                            ['fsrs_lapses', 'INTEGER DEFAULT 0'],
                            ['fsrs_state', 'INTEGER DEFAULT 0'],
                            ['fsrs_last_review', 'TEXT'],
                        ],
                        lecture_notes: [
                            ['transcript', 'TEXT'],
                            ['summary', 'TEXT'],
                            ['topics_json', 'TEXT'],
                            ['app_name', 'TEXT'],
                            ['duration_minutes', 'INTEGER'],
                            ['confidence', 'INTEGER DEFAULT 2'],
                            ['embedding', 'BLOB'],
                            ['recording_path', 'TEXT'],
                            ['recording_duration_seconds', 'INTEGER'],
                            ['transcription_confidence', 'REAL'],
                            ['processing_metrics_json', 'TEXT'],
                            ['retry_count', 'INTEGER DEFAULT 0'],
                            ['last_error', 'TEXT'],
                        ],
                        external_app_logs: [
                            ['recording_path', 'TEXT'],
                            ['transcription_status', "TEXT DEFAULT 'pending'"],
                            ['transcription_error', 'TEXT'],
                            ['lecture_note_id', 'INTEGER REFERENCES lecture_notes(id) ON DELETE SET NULL'],
                            ['note_enhancement_status', "TEXT DEFAULT 'pending'"],
                            ['pipeline_metrics_json', 'TEXT'],
                        ],
                        chat_history: [
                            ['sources_json', 'TEXT'],
                            ['model_used', 'TEXT'],
                            ['thread_id', 'INTEGER'],
                        ],
                        guru_chat_session_memory: [
                            ['thread_id', 'INTEGER'],
                            ['state_json', "TEXT NOT NULL DEFAULT '{}'"],
                        ],
                    };
                    totalAdded = 0;
                    _i = 0, _a = Object.entries(tables);
                    _f.label = 1;
                case 1:
                    if (!(_i < _a.length)) return [3 /*break*/, 13];
                    _b = _a[_i], tableName = _b[0], expectedCols = _b[1];
                    _f.label = 2;
                case 2:
                    _f.trys.push([2, 11, , 12]);
                    return [4 /*yield*/, db.getFirstAsync("SELECT count(*) as count FROM sqlite_master WHERE type='table' AND name=?", [tableName])];
                case 3:
                    tableCheck = _f.sent();
                    if (!tableCheck || tableCheck.count === 0)
                        return [3 /*break*/, 12];
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName))
                        return [3 /*break*/, 12];
                    return [4 /*yield*/, db.getAllAsync("PRAGMA table_info(".concat(tableName, ")"))];
                case 4:
                    cols = _f.sent();
                    existing = new Set(cols.map(function (c) { return c.name; }));
                    _c = 0, expectedCols_1 = expectedCols;
                    _f.label = 5;
                case 5:
                    if (!(_c < expectedCols_1.length)) return [3 /*break*/, 10];
                    _d = expectedCols_1[_c], col = _d[0], def = _d[1];
                    if (!!existing.has(col)) return [3 /*break*/, 9];
                    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col))
                        return [3 /*break*/, 9];
                    _f.label = 6;
                case 6:
                    _f.trys.push([6, 8, , 9]);
                    return [4 /*yield*/, db.execAsync("ALTER TABLE ".concat(tableName, " ADD COLUMN ").concat(col, " ").concat(def))];
                case 7:
                    _f.sent();
                    totalAdded++;
                    if (__DEV__)
                        console.log("[DB] Recovered missing column: ".concat(tableName, ".").concat(col));
                    return [3 /*break*/, 9];
                case 8:
                    err_6 = _f.sent();
                    if (!((_e = err_6 === null || err_6 === void 0 ? void 0 : err_6.message) === null || _e === void 0 ? void 0 : _e.includes('duplicate column name'))) {
                        if (__DEV__)
                            console.error("[DB] Failed to add column ".concat(tableName, ".").concat(col, ":"), err_6);
                    }
                    return [3 /*break*/, 9];
                case 9:
                    _c++;
                    return [3 /*break*/, 5];
                case 10: return [3 /*break*/, 12];
                case 11:
                    err_7 = _f.sent();
                    if (__DEV__)
                        console.error("[DB] Error ensuring columns for ".concat(tableName, ":"), err_7);
                    return [3 /*break*/, 12];
                case 12:
                    _i++;
                    return [3 /*break*/, 1];
                case 13:
                    if (totalAdded > 0 && !__DEV__) {
                        console.log("[DB] Recovered ".concat(totalAdded, " missing column(s) across standard tables"));
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function updateStreakOnOpen(db) {
    return __awaiter(this, void 0, void 0, function () {
        var today, profile, last, yesterday;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    today = todayStr();
                    return [4 /*yield*/, db.getFirstAsync('SELECT last_active_date, streak_current, streak_best FROM user_profile WHERE id = 1')];
                case 1:
                    profile = _a.sent();
                    if (!profile)
                        return [2 /*return*/];
                    last = profile.last_active_date;
                    if (!(last && last !== today)) return [3 /*break*/, 3];
                    yesterday = dateStr(new Date(Date.now() - time_1.MS_PER_DAY));
                    if (!(last !== yesterday)) return [3 /*break*/, 3];
                    // Streak broken
                    return [4 /*yield*/, db.runAsync('UPDATE user_profile SET streak_current = 0 WHERE id = 1')];
                case 2:
                    // Streak broken
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
function todayStr() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day);
}
function dateStr(d) {
    var year = d.getFullYear();
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return "".concat(year, "-").concat(month, "-").concat(day);
}
function nowTs() {
    return Date.now();
}
