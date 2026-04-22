'use strict';
var __makeTemplateObject =
  (this && this.__makeTemplateObject) ||
  function (cooked, raw) {
    if (Object.defineProperty) {
      Object.defineProperty(cooked, 'raw', { value: raw });
    } else {
      cooked.raw = raw;
    }
    return cooked;
  };
var __assign =
  (this && this.__assign) ||
  function () {
    __assign =
      Object.assign ||
      function (t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
          s = arguments[i];
          for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p)) t[p] = s[p];
        }
        return t;
      };
    return __assign.apply(this, arguments);
  };
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator['throw'](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __generator =
  (this && this.__generator) ||
  function (thisArg, body) {
    var _ = {
        label: 0,
        sent: function () {
          if (t[0] & 1) throw t[1];
          return t[1];
        },
        trys: [],
        ops: [],
      },
      f,
      y,
      t,
      g = Object.create((typeof Iterator === 'function' ? Iterator : Object).prototype);
    return (
      (g.next = verb(0)),
      (g['throw'] = verb(1)),
      (g['return'] = verb(2)),
      typeof Symbol === 'function' &&
        (g[Symbol.iterator] = function () {
          return this;
        }),
      g
    );
    function verb(n) {
      return function (v) {
        return step([n, v]);
      };
    }
    function step(op) {
      if (f) throw new TypeError('Generator is already executing.');
      while ((g && ((g = 0), op[0] && (_ = 0)), _))
        try {
          if (
            ((f = 1),
            y &&
              (t =
                op[0] & 2
                  ? y['return']
                  : op[0]
                  ? y['throw'] || ((t = y['return']) && t.call(y), 0)
                  : y.next) &&
              !(t = t.call(y, op[1])).done)
          )
            return t;
          if (((y = 0), t)) op = [op[0] & 2, t.value];
          switch (op[0]) {
            case 0:
            case 1:
              t = op;
              break;
            case 4:
              _.label++;
              return { value: op[1], done: false };
            case 5:
              _.label++;
              y = op[1];
              op = [0];
              continue;
            case 7:
              op = _.ops.pop();
              _.trys.pop();
              continue;
            default:
              if (
                !((t = _.trys), (t = t.length > 0 && t[t.length - 1])) &&
                (op[0] === 6 || op[0] === 2)
              ) {
                _ = 0;
                continue;
              }
              if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) {
                _.label = op[1];
                break;
              }
              if (op[0] === 6 && _.label < t[1]) {
                _.label = t[1];
                t = op;
                break;
              }
              if (t && _.label < t[2]) {
                _.label = t[2];
                _.ops.push(op);
                break;
              }
              if (t[2]) _.ops.pop();
              _.trys.pop();
              continue;
          }
          op = body.call(thisArg, _);
        } catch (e) {
          op = [6, e];
          y = 0;
        } finally {
          f = t = 0;
        }
      if (op[0] & 5) throw op[1];
      return { value: op[0] ? op[1] : void 0, done: true };
    }
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.topicsRepositoryDrizzle = void 0;
var drizzle_orm_1 = require('drizzle-orm');
var drizzle_1 = require('../drizzle');
var drizzleSchema_1 = require('../drizzleSchema');
var fsrsService_1 = require('../../services/fsrsService');
var database_1 = require('../database');
// Helpers
function mapTopicRow(r) {
  var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w;
  var tid = r.id;
  var tname = r.name || 'Unnamed Topic';
  var sname = r.subjectName || 'Unknown';
  var scode = r.subjectCode || '???';
  var scolor = r.subjectColor || '#555';
  var p = r; // Flat structure
  return {
    id: tid,
    subjectId: r.subjectId,
    parentTopicId: r.parentTopicId,
    name: tname,
    subtopics: [],
    estimatedMinutes: (_a = r.estimatedMinutes) !== null && _a !== void 0 ? _a : 35,
    inicetPriority: (_b = r.inicetPriority) !== null && _b !== void 0 ? _b : 5,
    childCount: (_c = r.childCount) !== null && _c !== void 0 ? _c : 0,
    subjectName: sname,
    subjectCode: scode,
    subjectColor: scolor,
    progress: {
      topicId: tid,
      status: (_d = r.status) !== null && _d !== void 0 ? _d : 'unseen',
      confidence: (_e = r.confidence) !== null && _e !== void 0 ? _e : 0,
      lastStudiedAt: (_f = r.lastStudiedAt) !== null && _f !== void 0 ? _f : null,
      timesStudied: (_g = r.timesStudied) !== null && _g !== void 0 ? _g : 0,
      xpEarned: (_h = r.xpEarned) !== null && _h !== void 0 ? _h : 0,
      nextReviewDate: (_j = r.nextReviewDate) !== null && _j !== void 0 ? _j : null,
      userNotes: (_k = r.userNotes) !== null && _k !== void 0 ? _k : '',
      fsrsDue: (_l = r.fsrsDue) !== null && _l !== void 0 ? _l : null,
      fsrsStability: (_m = r.fsrsStability) !== null && _m !== void 0 ? _m : 0,
      fsrsDifficulty: (_o = r.fsrsDifficulty) !== null && _o !== void 0 ? _o : 0,
      fsrsElapsedDays: (_p = r.fsrsElapsedDays) !== null && _p !== void 0 ? _p : 0,
      fsrsScheduledDays: (_q = r.fsrsScheduledDays) !== null && _q !== void 0 ? _q : 0,
      fsrsReps: (_r = r.fsrsReps) !== null && _r !== void 0 ? _r : 0,
      fsrsLapses: (_s = r.fsrsLapses) !== null && _s !== void 0 ? _s : 0,
      fsrsState: (_t = r.fsrsState) !== null && _t !== void 0 ? _t : 0,
      fsrsLastReview: (_u = r.fsrsLastReview) !== null && _u !== void 0 ? _u : null,
      wrongCount: (_v = r.wrongCount) !== null && _v !== void 0 ? _v : 0,
      isNemesis: ((_w = r.isNemesis) !== null && _w !== void 0 ? _w : 0) === 1,
    },
  };
}
var buildTopicsQuery = function (whereClause, limitCount, orderClauses) {
  var db = (0, drizzle_1.getDrizzleDb)();
  var query = db
    .select({
      id: drizzleSchema_1.topics.id,
      subjectId: drizzleSchema_1.topics.subjectId,
      parentTopicId: drizzleSchema_1.topics.parentTopicId,
      name: drizzleSchema_1.topics.name,
      estimatedMinutes: drizzleSchema_1.topics.estimatedMinutes,
      inicetPriority: drizzleSchema_1.topics.inicetPriority,
      status: drizzleSchema_1.topicProgress.status,
      confidence: drizzleSchema_1.topicProgress.confidence,
      lastStudiedAt: drizzleSchema_1.topicProgress.lastStudiedAt,
      timesStudied: drizzleSchema_1.topicProgress.timesStudied,
      xpEarned: drizzleSchema_1.topicProgress.xpEarned,
      nextReviewDate: drizzleSchema_1.topicProgress.nextReviewDate,
      userNotes: drizzleSchema_1.topicProgress.userNotes,
      fsrsDue: drizzleSchema_1.topicProgress.fsrsDue,
      fsrsStability: drizzleSchema_1.topicProgress.fsrsStability,
      fsrsDifficulty: drizzleSchema_1.topicProgress.fsrsDifficulty,
      fsrsElapsedDays: drizzleSchema_1.topicProgress.fsrsElapsedDays,
      fsrsScheduledDays: drizzleSchema_1.topicProgress.fsrsScheduledDays,
      fsrsReps: drizzleSchema_1.topicProgress.fsrsReps,
      fsrsLapses: drizzleSchema_1.topicProgress.fsrsLapses,
      fsrsState: drizzleSchema_1.topicProgress.fsrsState,
      fsrsLastReview: drizzleSchema_1.topicProgress.fsrsLastReview,
      wrongCount: drizzleSchema_1.topicProgress.wrongCount,
      isNemesis: drizzleSchema_1.topicProgress.isNemesis,
      subjectName: drizzleSchema_1.subjects.name,
      subjectCode: drizzleSchema_1.subjects.shortCode,
      subjectColor: drizzleSchema_1.subjects.colorHex,
      childCount: (0, drizzle_orm_1.sql)(
        templateObject_1 ||
          (templateObject_1 = __makeTemplateObject(
            ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id)'],
            ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = topics.id)'],
          )),
      ),
    })
    .from(drizzleSchema_1.topics)
    .innerJoin(
      drizzleSchema_1.subjects,
      (0, drizzle_orm_1.eq)(drizzleSchema_1.topics.subjectId, drizzleSchema_1.subjects.id),
    )
    .leftJoin(
      drizzleSchema_1.topicProgress,
      (0, drizzle_orm_1.eq)(drizzleSchema_1.topics.id, drizzleSchema_1.topicProgress.topicId),
    );
  if (whereClause) {
    query = query.where(whereClause);
  }
  if (orderClauses && orderClauses.length > 0) {
    query = query.orderBy.apply(query, orderClauses);
  }
  if (limitCount !== undefined) {
    query = query.limit(limitCount);
  }
  return query;
};
// Repository implementation
exports.topicsRepositoryDrizzle = {
  createTopic: function (input) {
    return __awaiter(this, void 0, void 0, function () {
      var db, result;
      var _a, _b, _c;
      return __generator(this, function (_d) {
        switch (_d.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .insert(drizzleSchema_1.topics)
                .values({
                  subjectId: input.subjectId,
                  name: input.name.trim(),
                  parentTopicId: (_a = input.parentTopicId) !== null && _a !== void 0 ? _a : null,
                  inicetPriority: (_b = input.inicetPriority) !== null && _b !== void 0 ? _b : 5,
                  estimatedMinutes:
                    (_c = input.estimatedMinutes) !== null && _c !== void 0 ? _c : 20,
                })
                .returning({ id: drizzleSchema_1.topics.id }),
            ];
          case 1:
            result = _d.sent();
            if (!result || result.length === 0) return [2 /*return*/, null];
            return [2 /*return*/, exports.topicsRepositoryDrizzle.getTopicById(result[0].id)];
        }
      });
    });
  },
  searchTopicsByName: function (query_1) {
    return __awaiter(this, arguments, void 0, function (query, limitCount) {
      var trimmed, rows;
      if (limitCount === void 0) {
        limitCount = 50;
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            trimmed = query.trim();
            if (!trimmed) return [2 /*return*/, []];
            return [
              4 /*yield*/,
              buildTopicsQuery(
                (0, drizzle_orm_1.sql)(
                  templateObject_2 ||
                    (templateObject_2 = __makeTemplateObject(
                      ['', ' LIKE ', ''],
                      ['', ' LIKE ', ''],
                    )),
                  drizzleSchema_1.topics.name,
                  '%' + trimmed + '%',
                ),
                limitCount,
                [
                  (0, drizzle_orm_1.desc)(drizzleSchema_1.topics.inicetPriority),
                  (0, drizzle_orm_1.asc)(drizzleSchema_1.topics.name),
                ],
              ),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  getAllSubjects: function () {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select()
                .from(drizzleSchema_1.subjects)
                .orderBy(drizzleSchema_1.subjects.displayOrder),
            ];
          case 1:
            rows = _a.sent();
            return [
              2 /*return*/,
              rows.map(function (r) {
                return __assign(__assign({}, r), {
                  inicetWeight: r.inicetWeight,
                  neetWeight: r.neetWeight,
                  displayOrder: r.displayOrder,
                });
              }),
            ];
        }
      });
    });
  },
  getSubjectByName: function (name) {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select()
                .from(drizzleSchema_1.subjects)
                .where(
                  (0, drizzle_orm_1.sql)(
                    templateObject_3 ||
                      (templateObject_3 = __makeTemplateObject(
                        ['LOWER(', ') = LOWER(', ')'],
                        ['LOWER(', ') = LOWER(', ')'],
                      )),
                    drizzleSchema_1.subjects.name,
                    name,
                  ),
                )
                .limit(1),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.length > 0 ? rows[0] : null];
        }
      });
    });
  },
  getSubjectById: function (id) {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select()
                .from(drizzleSchema_1.subjects)
                .where((0, drizzle_orm_1.eq)(drizzleSchema_1.subjects.id, id))
                .limit(1),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.length > 0 ? rows[0] : null];
        }
      });
    });
  },
  queueTopicSuggestionInTx: function (
    _tx, // kept for signature compatibility
    subjectId,
    topicName,
    sourceSummary,
  ) {
    return __awaiter(this, void 0, void 0, function () {
      var db, trimmedName, normalizedName, existingTopic, existingSuggestion, now;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            trimmedName = topicName.trim();
            normalizedName = trimmedName.toLowerCase();
            if (!trimmedName) return [2 /*return*/];
            return [
              4 /*yield*/,
              db
                .select({ id: drizzleSchema_1.topics.id })
                .from(drizzleSchema_1.topics)
                .where(
                  (0, drizzle_orm_1.and)(
                    (0, drizzle_orm_1.eq)(drizzleSchema_1.topics.subjectId, subjectId),
                    (0, drizzle_orm_1.sql)(
                      templateObject_4 ||
                        (templateObject_4 = __makeTemplateObject(
                          ['LOWER(', ') = ', ''],
                          ['LOWER(', ') = ', ''],
                        )),
                      drizzleSchema_1.topics.name,
                      normalizedName,
                    ),
                  ),
                )
                .limit(1),
            ];
          case 1:
            existingTopic = _a.sent();
            if (existingTopic.length > 0) return [2 /*return*/];
            return [
              4 /*yield*/,
              db
                .select({
                  id: drizzleSchema_1.topicSuggestions.id,
                  mentionCount: drizzleSchema_1.topicSuggestions.mentionCount,
                })
                .from(drizzleSchema_1.topicSuggestions)
                .where(
                  (0, drizzle_orm_1.and)(
                    (0, drizzle_orm_1.eq)(drizzleSchema_1.topicSuggestions.subjectId, subjectId),
                    (0, drizzle_orm_1.eq)(
                      drizzleSchema_1.topicSuggestions.normalizedName,
                      normalizedName,
                    ),
                  ),
                )
                .limit(1),
            ];
          case 2:
            existingSuggestion = _a.sent();
            now = Date.now();
            if (!(existingSuggestion.length > 0)) return [3 /*break*/, 4];
            return [
              4 /*yield*/,
              db
                .update(drizzleSchema_1.topicSuggestions)
                .set({
                  name: trimmedName,
                  sourceSummary:
                    sourceSummary !== null && sourceSummary !== void 0
                      ? sourceSummary
                      : (0, drizzle_orm_1.sql)(
                          templateObject_5 ||
                            (templateObject_5 = __makeTemplateObject(
                              ['COALESCE(', ', source_summary)'],
                              ['COALESCE(', ', source_summary)'],
                            )),
                          sourceSummary !== null && sourceSummary !== void 0 ? sourceSummary : null,
                        ),
                  mentionCount: (0, drizzle_orm_1.sql)(
                    templateObject_6 ||
                      (templateObject_6 = __makeTemplateObject(['', ' + 1'], ['', ' + 1'])),
                    drizzleSchema_1.topicSuggestions.mentionCount,
                  ),
                  status: (0, drizzle_orm_1.sql)(
                    templateObject_7 ||
                      (templateObject_7 = __makeTemplateObject(
                        ['CASE WHEN ', " = 'rejected' THEN 'pending' ELSE ", ' END'],
                        ['CASE WHEN ', " = 'rejected' THEN 'pending' ELSE ", ' END'],
                      )),
                    drizzleSchema_1.topicSuggestions.status,
                    drizzleSchema_1.topicSuggestions.status,
                  ),
                  lastDetectedAt: now,
                })
                .where(
                  (0, drizzle_orm_1.eq)(
                    drizzleSchema_1.topicSuggestions.id,
                    existingSuggestion[0].id,
                  ),
                ),
            ];
          case 3:
            _a.sent();
            return [2 /*return*/];
          case 4:
            return [
              4 /*yield*/,
              db.insert(drizzleSchema_1.topicSuggestions).values({
                subjectId: subjectId,
                name: trimmedName,
                normalizedName: normalizedName,
                sourceSummary:
                  sourceSummary !== null && sourceSummary !== void 0 ? sourceSummary : null,
                mentionCount: 1,
                status: 'pending',
                firstDetectedAt: now,
                lastDetectedAt: now,
              }),
            ];
          case 5:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  getPendingTopicSuggestions: function () {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select({
                  ts: drizzleSchema_1.topicSuggestions,
                  subjectName: drizzleSchema_1.subjects.name,
                  subjectColor: drizzleSchema_1.subjects.colorHex,
                })
                .from(drizzleSchema_1.topicSuggestions)
                .innerJoin(
                  drizzleSchema_1.subjects,
                  (0, drizzle_orm_1.eq)(
                    drizzleSchema_1.subjects.id,
                    drizzleSchema_1.topicSuggestions.subjectId,
                  ),
                )
                .where((0, drizzle_orm_1.eq)(drizzleSchema_1.topicSuggestions.status, 'pending'))
                .orderBy((0, drizzle_orm_1.desc)(drizzleSchema_1.topicSuggestions.lastDetectedAt)),
            ];
          case 1:
            rows = _a.sent();
            return [
              2 /*return*/,
              rows.map(function (r) {
                return {
                  id: r.ts.id,
                  subjectId: r.ts.subjectId,
                  subjectName: r.subjectName,
                  subjectColor: r.subjectColor,
                  name: r.ts.name,
                  sourceSummary: r.ts.sourceSummary,
                  mentionCount: r.ts.mentionCount,
                  status: r.ts.status,
                  approvedTopicId: r.ts.approvedTopicId,
                  firstDetectedAt: r.ts.firstDetectedAt,
                  lastDetectedAt: r.ts.lastDetectedAt,
                };
              }),
            ];
        }
      });
    });
  },
  approveTopicSuggestion: function (suggestionId) {
    return __awaiter(this, void 0, void 0, function () {
      var _this = this;
      return __generator(this, function (_a) {
        return [
          2 /*return*/,
          (0, database_1.runInTransaction)(function (tx) {
            return __awaiter(_this, void 0, void 0, function () {
              var db, suggestionRows, suggestion, topicId, existingTopic, result;
              return __generator(this, function (_a) {
                switch (_a.label) {
                  case 0:
                    db = (0, drizzle_1.getDrizzleDb)();
                    return [
                      4 /*yield*/,
                      db
                        .select({
                          id: drizzleSchema_1.topicSuggestions.id,
                          subjectId: drizzleSchema_1.topicSuggestions.subjectId,
                          name: drizzleSchema_1.topicSuggestions.name,
                        })
                        .from(drizzleSchema_1.topicSuggestions)
                        .where(
                          (0, drizzle_orm_1.and)(
                            (0, drizzle_orm_1.eq)(
                              drizzleSchema_1.topicSuggestions.id,
                              suggestionId,
                            ),
                            (0, drizzle_orm_1.eq)(
                              drizzleSchema_1.topicSuggestions.status,
                              'pending',
                            ),
                          ),
                        )
                        .limit(1),
                    ];
                  case 1:
                    suggestionRows = _a.sent();
                    if (suggestionRows.length === 0) return [2 /*return*/, null];
                    suggestion = suggestionRows[0];
                    topicId = null;
                    return [
                      4 /*yield*/,
                      db
                        .select({ id: drizzleSchema_1.topics.id })
                        .from(drizzleSchema_1.topics)
                        .where(
                          (0, drizzle_orm_1.and)(
                            (0, drizzle_orm_1.eq)(
                              drizzleSchema_1.topics.subjectId,
                              suggestion.subjectId,
                            ),
                            (0, drizzle_orm_1.sql)(
                              templateObject_8 ||
                                (templateObject_8 = __makeTemplateObject(
                                  ['LOWER(', ') = LOWER(', ')'],
                                  ['LOWER(', ') = LOWER(', ')'],
                                )),
                              drizzleSchema_1.topics.name,
                              suggestion.name,
                            ),
                          ),
                        )
                        .limit(1),
                    ];
                  case 2:
                    existingTopic = _a.sent();
                    if (!(existingTopic.length > 0)) return [3 /*break*/, 3];
                    topicId = existingTopic[0].id;
                    return [3 /*break*/, 6];
                  case 3:
                    return [
                      4 /*yield*/,
                      db
                        .insert(drizzleSchema_1.topics)
                        .values({
                          subjectId: suggestion.subjectId,
                          name: suggestion.name,
                          inicetPriority: 5,
                          estimatedMinutes: 20,
                        })
                        .returning({ id: drizzleSchema_1.topics.id }),
                    ];
                  case 4:
                    result = _a.sent();
                    topicId = result[0].id;
                    return [
                      4 /*yield*/,
                      db
                        .insert(drizzleSchema_1.topicProgress)
                        .values({ topicId: topicId })
                        .onConflictDoNothing(),
                    ];
                  case 5:
                    _a.sent();
                    _a.label = 6;
                  case 6:
                    return [
                      4 /*yield*/,
                      db
                        .update(drizzleSchema_1.topicSuggestions)
                        .set({
                          status: 'approved',
                          approvedTopicId: topicId,
                          lastDetectedAt: Date.now(),
                        })
                        .where(
                          (0, drizzle_orm_1.eq)(drizzleSchema_1.topicSuggestions.id, suggestionId),
                        ),
                    ];
                  case 7:
                    _a.sent();
                    return [2 /*return*/, topicId];
                }
              });
            });
          }),
        ];
      });
    });
  },
  rejectTopicSuggestion: function (suggestionId) {
    return __awaiter(this, void 0, void 0, function () {
      var db;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .update(drizzleSchema_1.topicSuggestions)
                .set({ status: 'rejected', lastDetectedAt: Date.now() })
                .where((0, drizzle_orm_1.eq)(drizzleSchema_1.topicSuggestions.id, suggestionId)),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  getTopicsBySubject: function (subjectId) {
    return __awaiter(this, void 0, void 0, function () {
      var id, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            id = Number(subjectId);
            if (isNaN(id)) return [2 /*return*/, []];
            return [
              4 /*yield*/,
              buildTopicsQuery(
                (0, drizzle_orm_1.eq)(drizzleSchema_1.topics.subjectId, id),
                undefined,
                [
                  (0, drizzle_orm_1.sql)(
                    templateObject_9 ||
                      (templateObject_9 = __makeTemplateObject(
                        ['COALESCE(', ', ', ')'],
                        ['COALESCE(', ', ', ')'],
                      )),
                    drizzleSchema_1.topics.parentTopicId,
                    drizzleSchema_1.topics.id,
                  ),
                  (0, drizzle_orm_1.sql)(
                    templateObject_10 ||
                      (templateObject_10 = __makeTemplateObject(
                        ['CASE WHEN ', ' IS NULL THEN 0 ELSE 1 END'],
                        ['CASE WHEN ', ' IS NULL THEN 0 ELSE 1 END'],
                      )),
                    drizzleSchema_1.topics.parentTopicId,
                  ),
                  (0, drizzle_orm_1.desc)(drizzleSchema_1.topics.inicetPriority),
                  (0, drizzle_orm_1.asc)(drizzleSchema_1.topics.name),
                ],
              ),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  getAllTopicsWithProgress: function () {
    return __awaiter(this, void 0, void 0, function () {
      var rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              buildTopicsQuery(undefined, undefined, [
                (0, drizzle_orm_1.desc)(drizzleSchema_1.topics.inicetPriority),
              ]),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  getTopicById: function (id) {
    return __awaiter(this, void 0, void 0, function () {
      var rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              buildTopicsQuery((0, drizzle_orm_1.eq)(drizzleSchema_1.topics.id, id), 1),
            ];
          case 1:
            rows = _a.sent();
            if (rows.length === 0) return [2 /*return*/, null];
            return [2 /*return*/, mapTopicRow(rows[0])];
        }
      });
    });
  },
  updateTopicProgressInTx: function (
    _tx_1,
    topicId_1,
    status_1,
    confidence_1,
    xpToAdd_1,
    noteToAppend_1,
  ) {
    return __awaiter(
      this,
      arguments,
      void 0,
      function (
        _tx, // legacy param
        topicId,
        status,
        confidence,
        xpToAdd,
        noteToAppend,
        now,
      ) {
        var db, existingRows, existing, card, log, updatedCard, nextReview, newUserNotes;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
        if (now === void 0) {
          now = Date.now();
        }
        return __generator(this, function (_o) {
          switch (_o.label) {
            case 0:
              db = (0, drizzle_1.getDrizzleDb)();
              return [
                4 /*yield*/,
                db
                  .select({
                    fsrsDue: drizzleSchema_1.topicProgress.fsrsDue,
                    fsrsStability: drizzleSchema_1.topicProgress.fsrsStability,
                    fsrsDifficulty: drizzleSchema_1.topicProgress.fsrsDifficulty,
                    fsrsElapsedDays: drizzleSchema_1.topicProgress.fsrsElapsedDays,
                    fsrsScheduledDays: drizzleSchema_1.topicProgress.fsrsScheduledDays,
                    fsrsReps: drizzleSchema_1.topicProgress.fsrsReps,
                    fsrsLapses: drizzleSchema_1.topicProgress.fsrsLapses,
                    fsrsState: drizzleSchema_1.topicProgress.fsrsState,
                    fsrsLastReview: drizzleSchema_1.topicProgress.fsrsLastReview,
                    userNotes: drizzleSchema_1.topicProgress.userNotes,
                  })
                  .from(drizzleSchema_1.topicProgress)
                  .where((0, drizzle_orm_1.eq)(drizzleSchema_1.topicProgress.topicId, topicId))
                  .limit(1),
              ];
            case 1:
              existingRows = _o.sent();
              existing = existingRows.length > 0 ? existingRows[0] : null;
              if (existing && existing.fsrsLastReview && existing.fsrsDue) {
                card = {
                  due: new Date(existing.fsrsDue),
                  stability: (_a = existing.fsrsStability) !== null && _a !== void 0 ? _a : 0,
                  difficulty: (_b = existing.fsrsDifficulty) !== null && _b !== void 0 ? _b : 0,
                  elapsed_days: (_c = existing.fsrsElapsedDays) !== null && _c !== void 0 ? _c : 0,
                  scheduled_days:
                    (_d = existing.fsrsScheduledDays) !== null && _d !== void 0 ? _d : 0,
                  reps: (_e = existing.fsrsReps) !== null && _e !== void 0 ? _e : 0,
                  lapses: (_f = existing.fsrsLapses) !== null && _f !== void 0 ? _f : 0,
                  state: (_g = existing.fsrsState) !== null && _g !== void 0 ? _g : 0,
                  last_review: new Date(existing.fsrsLastReview),
                };
              } else {
                card = (0, fsrsService_1.getInitialCard)();
              }
              log = (0, fsrsService_1.reviewCardFromConfidence)(card, confidence, new Date());
              updatedCard = log.card;
              nextReview = updatedCard.due.toISOString().slice(0, 10);
              newUserNotes =
                noteToAppend && noteToAppend !== ''
                  ? (existing === null || existing === void 0 ? void 0 : existing.userNotes) &&
                    existing.userNotes !== ''
                    ? ''.concat(existing.userNotes, '\n\n---\n').concat(noteToAppend)
                    : noteToAppend
                  : (_h =
                      existing === null || existing === void 0 ? void 0 : existing.userNotes) !==
                      null && _h !== void 0
                  ? _h
                  : '';
              return [
                4 /*yield*/,
                db
                  .insert(drizzleSchema_1.topicProgress)
                  .values({
                    topicId: topicId,
                    status: status,
                    confidence: confidence,
                    lastStudiedAt: now,
                    timesStudied: 1,
                    xpEarned: xpToAdd,
                    nextReviewDate: nextReview,
                    fsrsDue: updatedCard.due.toISOString(),
                    fsrsStability: updatedCard.stability,
                    fsrsDifficulty: updatedCard.difficulty,
                    fsrsElapsedDays: updatedCard.elapsed_days,
                    fsrsScheduledDays: updatedCard.scheduled_days,
                    fsrsReps: updatedCard.reps,
                    fsrsLapses: updatedCard.lapses,
                    fsrsState: updatedCard.state,
                    fsrsLastReview:
                      (_k =
                        (_j = updatedCard.last_review) === null || _j === void 0
                          ? void 0
                          : _j.toISOString()) !== null && _k !== void 0
                        ? _k
                        : null,
                    userNotes: newUserNotes,
                  })
                  .onConflictDoUpdate({
                    target: drizzleSchema_1.topicProgress.topicId,
                    set: {
                      status: status,
                      confidence: confidence,
                      lastStudiedAt: now,
                      timesStudied: (0, drizzle_orm_1.sql)(
                        templateObject_11 ||
                          (templateObject_11 = __makeTemplateObject(['', ' + 1'], ['', ' + 1'])),
                        drizzleSchema_1.topicProgress.timesStudied,
                      ),
                      xpEarned: (0, drizzle_orm_1.sql)(
                        templateObject_12 ||
                          (templateObject_12 = __makeTemplateObject(
                            ['', ' + ', ''],
                            ['', ' + ', ''],
                          )),
                        drizzleSchema_1.topicProgress.xpEarned,
                        xpToAdd,
                      ),
                      nextReviewDate: nextReview,
                      fsrsDue: updatedCard.due.toISOString(),
                      fsrsStability: updatedCard.stability,
                      fsrsDifficulty: updatedCard.difficulty,
                      fsrsElapsedDays: updatedCard.elapsed_days,
                      fsrsScheduledDays: updatedCard.scheduled_days,
                      fsrsReps: updatedCard.reps,
                      fsrsLapses: updatedCard.lapses,
                      fsrsState: updatedCard.state,
                      fsrsLastReview:
                        (_m =
                          (_l = updatedCard.last_review) === null || _l === void 0
                            ? void 0
                            : _l.toISOString()) !== null && _m !== void 0
                          ? _m
                          : null,
                      userNotes: newUserNotes,
                    },
                  }),
              ];
            case 2:
              _o.sent();
              return [2 /*return*/];
          }
        });
      },
    );
  },
  updateTopicProgress: function (topicId, status, confidence, xpToAdd, noteToAppend) {
    return __awaiter(this, void 0, void 0, function () {
      var _this = this;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              (0, database_1.runInTransaction)(function (tx) {
                return __awaiter(_this, void 0, void 0, function () {
                  return __generator(this, function (_a) {
                    switch (_a.label) {
                      case 0:
                        return [
                          4 /*yield*/,
                          exports.topicsRepositoryDrizzle.updateTopicProgressInTx(
                            tx,
                            topicId,
                            status,
                            confidence,
                            xpToAdd,
                            noteToAppend,
                          ),
                        ];
                      case 1:
                        _a.sent();
                        return [2 /*return*/];
                    }
                  });
                });
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  updateTopicsProgressBatch: function (updates) {
    return __awaiter(this, void 0, void 0, function () {
      var now;
      var _this = this;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            if (!updates || updates.length === 0) return [2 /*return*/];
            now = Date.now();
            return [
              4 /*yield*/,
              (0, database_1.runInTransaction)(function (tx) {
                return __awaiter(_this, void 0, void 0, function () {
                  var _i, updates_1, update;
                  return __generator(this, function (_a) {
                    switch (_a.label) {
                      case 0:
                        (_i = 0), (updates_1 = updates);
                        _a.label = 1;
                      case 1:
                        if (!(_i < updates_1.length)) return [3 /*break*/, 4];
                        update = updates_1[_i];
                        return [
                          4 /*yield*/,
                          exports.topicsRepositoryDrizzle.updateTopicProgressInTx(
                            tx,
                            update.topicId,
                            update.status,
                            update.confidence,
                            update.xpToAdd,
                            update.noteToAppend,
                            now,
                          ),
                        ];
                      case 2:
                        _a.sent();
                        _a.label = 3;
                      case 3:
                        _i++;
                        return [3 /*break*/, 1];
                      case 4:
                        return [2 /*return*/];
                    }
                  });
                });
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  updateTopicNotes: function (topicId, notes) {
    return __awaiter(this, void 0, void 0, function () {
      var db;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .insert(drizzleSchema_1.topicProgress)
                .values({ topicId: topicId, userNotes: notes })
                .onConflictDoUpdate({
                  target: drizzleSchema_1.topicProgress.topicId,
                  set: { userNotes: notes },
                }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  getTopicsDueForReview: function () {
    return __awaiter(this, arguments, void 0, function (limitCount) {
      var today, rows;
      if (limitCount === void 0) {
        limitCount = 10;
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            today = (0, database_1.todayStr)();
            return [
              4 /*yield*/,
              buildTopicsQuery(
                (0, drizzle_orm_1.and)(
                  (0, drizzle_orm_1.inArray)(drizzleSchema_1.topicProgress.status, [
                    'reviewed',
                    'mastered',
                  ]),
                  (0, drizzle_orm_1.or)(
                    (0, drizzle_orm_1.isNull)(drizzleSchema_1.topicProgress.fsrsDue),
                    (0, drizzle_orm_1.sql)(
                      templateObject_13 ||
                        (templateObject_13 = __makeTemplateObject(
                          ['DATE(', ') <= DATE(', ')'],
                          ['DATE(', ') <= DATE(', ')'],
                        )),
                      drizzleSchema_1.topicProgress.fsrsDue,
                      today,
                    ),
                  ),
                  (0, drizzle_orm_1.sql)(
                    templateObject_14 ||
                      (templateObject_14 = __makeTemplateObject(
                        ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ', ') = 0'],
                        ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ', ') = 0'],
                      )),
                    drizzleSchema_1.topics.id,
                  ),
                ),
                limitCount,
                [
                  (0, drizzle_orm_1.asc)(drizzleSchema_1.topicProgress.fsrsDue),
                  (0, drizzle_orm_1.asc)(drizzleSchema_1.topicProgress.confidence),
                ],
              ),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  getSubjectStatsAggregated: function () {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select({
                  subjectId: drizzleSchema_1.topics.subjectId,
                  total: (0, drizzle_orm_1.count)(drizzleSchema_1.topics.id),
                  seen: (0, drizzle_orm_1.sql)(
                    templateObject_15 ||
                      (templateObject_15 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN ', " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                  due: (0, drizzle_orm_1.sql)(
                    templateObject_16 ||
                      (templateObject_16 = __makeTemplateObject(
                        [
                          'SUM(CASE WHEN COALESCE(',
                          ", 'unseen') != 'unseen' AND (",
                          ' IS NULL OR DATE(',
                          ") <= DATE('now')) THEN 1 ELSE 0 END)",
                        ],
                        [
                          'SUM(CASE WHEN COALESCE(',
                          ", 'unseen') != 'unseen' AND (",
                          ' IS NULL OR DATE(',
                          ") <= DATE('now')) THEN 1 ELSE 0 END)",
                        ],
                      )),
                    drizzleSchema_1.topicProgress.status,
                    drizzleSchema_1.topicProgress.fsrsDue,
                    drizzleSchema_1.topicProgress.fsrsDue,
                  ),
                  highYield: (0, drizzle_orm_1.sql)(
                    templateObject_17 ||
                      (templateObject_17 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', ' >= 8 THEN 1 ELSE 0 END)'],
                        ['SUM(CASE WHEN ', ' >= 8 THEN 1 ELSE 0 END)'],
                      )),
                    drizzleSchema_1.topics.inicetPriority,
                  ),
                  unseen: (0, drizzle_orm_1.sql)(
                    templateObject_18 ||
                      (templateObject_18 = __makeTemplateObject(
                        ['SUM(CASE WHEN COALESCE(', ", 'unseen') = 'unseen' THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN COALESCE(', ", 'unseen') = 'unseen' THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                  withNotes: (0, drizzle_orm_1.sql)(
                    templateObject_19 ||
                      (templateObject_19 = __makeTemplateObject(
                        ['SUM(CASE WHEN TRIM(COALESCE(', ", '')) <> '' THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN TRIM(COALESCE(', ", '')) <> '' THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.userNotes,
                  ),
                  weak: (0, drizzle_orm_1.sql)(
                    templateObject_20 ||
                      (templateObject_20 = __makeTemplateObject(
                        [
                          'SUM(CASE WHEN COALESCE(',
                          ', 0) > 0 AND COALESCE(',
                          ', 0) < 3 THEN 1 ELSE 0 END)',
                        ],
                        [
                          'SUM(CASE WHEN COALESCE(',
                          ', 0) > 0 AND COALESCE(',
                          ', 0) < 3 THEN 1 ELSE 0 END)',
                        ],
                      )),
                    drizzleSchema_1.topicProgress.timesStudied,
                    drizzleSchema_1.topicProgress.confidence,
                  ),
                })
                .from(drizzleSchema_1.topics)
                .leftJoin(
                  drizzleSchema_1.topicProgress,
                  (0, drizzle_orm_1.eq)(
                    drizzleSchema_1.topics.id,
                    drizzleSchema_1.topicProgress.topicId,
                  ),
                )
                .where(
                  (0, drizzle_orm_1.sql)(
                    templateObject_21 ||
                      (templateObject_21 = __makeTemplateObject(
                        ['NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)'],
                        ['NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)'],
                      )),
                  ),
                )
                .groupBy(drizzleSchema_1.topics.subjectId),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows];
        }
      });
    });
  },
  getSubjectCoverage: function () {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select({
                  subjectId: drizzleSchema_1.topics.subjectId,
                  total: (0, drizzle_orm_1.count)(drizzleSchema_1.topics.id),
                  seen: (0, drizzle_orm_1.sql)(
                    templateObject_22 ||
                      (templateObject_22 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN ', " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                  mastered: (0, drizzle_orm_1.sql)(
                    templateObject_23 ||
                      (templateObject_23 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', " = 'mastered' THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN ', " = 'mastered' THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                })
                .from(drizzleSchema_1.topics)
                .leftJoin(
                  drizzleSchema_1.topicProgress,
                  (0, drizzle_orm_1.eq)(
                    drizzleSchema_1.topics.id,
                    drizzleSchema_1.topicProgress.topicId,
                  ),
                )
                .where(
                  (0, drizzle_orm_1.sql)(
                    templateObject_24 ||
                      (templateObject_24 = __makeTemplateObject(
                        ['NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)'],
                        ['NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)'],
                      )),
                  ),
                )
                .groupBy(drizzleSchema_1.topics.subjectId),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows];
        }
      });
    });
  },
  getWeakestTopics: function () {
    return __awaiter(this, arguments, void 0, function (limitCount) {
      var rows;
      if (limitCount === void 0) {
        limitCount = 5;
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              buildTopicsQuery(
                (0, drizzle_orm_1.and)(
                  (0, drizzle_orm_1.sql)(
                    templateObject_25 ||
                      (templateObject_25 = __makeTemplateObject(['', ' > 0'], ['', ' > 0'])),
                    drizzleSchema_1.topicProgress.timesStudied,
                  ),
                  (0, drizzle_orm_1.lt)(drizzleSchema_1.topicProgress.confidence, 3),
                  (0, drizzle_orm_1.sql)(
                    templateObject_26 ||
                      (templateObject_26 = __makeTemplateObject(
                        ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ', ') = 0'],
                        ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ', ') = 0'],
                      )),
                    drizzleSchema_1.topics.id,
                  ),
                ),
                limitCount,
                [
                  (0, drizzle_orm_1.asc)(drizzleSchema_1.topicProgress.confidence),
                  (0, drizzle_orm_1.desc)(drizzleSchema_1.topicProgress.timesStudied),
                ],
              ),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  getHighPriorityUnseenTopics: function () {
    return __awaiter(this, arguments, void 0, function (limitCount) {
      var rows;
      if (limitCount === void 0) {
        limitCount = 3;
      }
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              buildTopicsQuery(
                (0, drizzle_orm_1.and)(
                  (0, drizzle_orm_1.sql)(
                    templateObject_27 ||
                      (templateObject_27 = __makeTemplateObject(
                        ['COALESCE(', ", 'unseen') = 'unseen'"],
                        ['COALESCE(', ", 'unseen') = 'unseen'"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                  (0, drizzle_orm_1.sql)(
                    templateObject_28 ||
                      (templateObject_28 = __makeTemplateObject(
                        ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ', ') = 0'],
                        ['(SELECT COUNT(*) FROM topics c WHERE c.parent_topic_id = ', ') = 0'],
                      )),
                    drizzleSchema_1.topics.id,
                  ),
                ),
                limitCount,
                [
                  (0, drizzle_orm_1.desc)(drizzleSchema_1.topics.inicetPriority),
                  (0, drizzle_orm_1.sql)(
                    templateObject_29 ||
                      (templateObject_29 = __makeTemplateObject(['RANDOM()'], ['RANDOM()'])),
                  ),
                ],
              ),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  getNemesisTopics: function () {
    return __awaiter(this, void 0, void 0, function () {
      var rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            return [
              4 /*yield*/,
              buildTopicsQuery(
                (0, drizzle_orm_1.eq)(drizzleSchema_1.topicProgress.isNemesis, 1),
                10,
                [
                  (0, drizzle_orm_1.desc)(drizzleSchema_1.topicProgress.wrongCount),
                  (0, drizzle_orm_1.asc)(drizzleSchema_1.topicProgress.confidence),
                ],
              ),
            ];
          case 1:
            rows = _a.sent();
            return [2 /*return*/, rows.map(mapTopicRow)];
        }
      });
    });
  },
  markNemesisTopics: function () {
    return __awaiter(this, void 0, void 0, function () {
      var db;
      var _this = this;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              (0, database_1.runInTransaction)(function () {
                return __awaiter(_this, void 0, void 0, function () {
                  return __generator(this, function (_a) {
                    switch (_a.label) {
                      case 0:
                        return [
                          4 /*yield*/,
                          db.update(drizzleSchema_1.topicProgress).set({ isNemesis: 0 }),
                        ];
                      case 1:
                        _a.sent();
                        return [
                          4 /*yield*/,
                          db
                            .update(drizzleSchema_1.topicProgress)
                            .set({ isNemesis: 1 })
                            .where(
                              (0, drizzle_orm_1.and)(
                                (0, drizzle_orm_1.gte)(drizzleSchema_1.topicProgress.wrongCount, 3),
                                (0, drizzle_orm_1.lt)(drizzleSchema_1.topicProgress.confidence, 3),
                                (0, drizzle_orm_1.sql)(
                                  templateObject_30 ||
                                    (templateObject_30 = __makeTemplateObject(
                                      ['', ' > 0'],
                                      ['', ' > 0'],
                                    )),
                                  drizzleSchema_1.topicProgress.timesStudied,
                                ),
                              ),
                            ),
                        ];
                      case 2:
                        _a.sent();
                        return [2 /*return*/];
                    }
                  });
                });
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  incrementWrongCount: function (topicId) {
    return __awaiter(this, void 0, void 0, function () {
      var db;
      var _this = this;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              (0, database_1.runInTransaction)(function () {
                return __awaiter(_this, void 0, void 0, function () {
                  return __generator(this, function (_a) {
                    switch (_a.label) {
                      case 0:
                        return [
                          4 /*yield*/,
                          db
                            .update(drizzleSchema_1.topicProgress)
                            .set({
                              wrongCount: (0, drizzle_orm_1.sql)(
                                templateObject_31 ||
                                  (templateObject_31 = __makeTemplateObject(
                                    ['', ' + 1'],
                                    ['', ' + 1'],
                                  )),
                                drizzleSchema_1.topicProgress.wrongCount,
                              ),
                            })
                            .where(
                              (0, drizzle_orm_1.eq)(drizzleSchema_1.topicProgress.topicId, topicId),
                            ),
                        ];
                      case 1:
                        _a.sent();
                        return [
                          4 /*yield*/,
                          db
                            .update(drizzleSchema_1.topicProgress)
                            .set({ isNemesis: 1 })
                            .where(
                              (0, drizzle_orm_1.and)(
                                (0, drizzle_orm_1.eq)(
                                  drizzleSchema_1.topicProgress.topicId,
                                  topicId,
                                ),
                                (0, drizzle_orm_1.gte)(drizzleSchema_1.topicProgress.wrongCount, 3),
                                (0, drizzle_orm_1.lt)(drizzleSchema_1.topicProgress.confidence, 3),
                              ),
                            ),
                        ];
                      case 2:
                        _a.sent();
                        return [2 /*return*/];
                    }
                  });
                });
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  markTopicNeedsAttention: function (topicId) {
    return __awaiter(this, void 0, void 0, function () {
      var db, now;
      var _this = this;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            now = Date.now();
            return [
              4 /*yield*/,
              (0, database_1.runInTransaction)(function () {
                return __awaiter(_this, void 0, void 0, function () {
                  return __generator(this, function (_a) {
                    switch (_a.label) {
                      case 0:
                        return [
                          4 /*yield*/,
                          db
                            .insert(drizzleSchema_1.topicProgress)
                            .values({
                              topicId: topicId,
                              status: 'seen',
                              confidence: 1,
                              lastStudiedAt: now,
                              timesStudied: 1,
                            })
                            .onConflictDoUpdate({
                              target: drizzleSchema_1.topicProgress.topicId,
                              set: {
                                confidence: (0, drizzle_orm_1.sql)(
                                  templateObject_32 ||
                                    (templateObject_32 = __makeTemplateObject(
                                      ['MIN(', ', 1)'],
                                      ['MIN(', ', 1)'],
                                    )),
                                  drizzleSchema_1.topicProgress.confidence,
                                ),
                                lastStudiedAt: now,
                                timesStudied: (0, drizzle_orm_1.sql)(
                                  templateObject_33 ||
                                    (templateObject_33 = __makeTemplateObject(
                                      ['', ' + 1'],
                                      ['', ' + 1'],
                                    )),
                                  drizzleSchema_1.topicProgress.timesStudied,
                                ),
                              },
                            }),
                        ];
                      case 1:
                        _a.sent();
                        return [2 /*return*/];
                    }
                  });
                });
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  markTopicDiscussedInChat: function (topicId) {
    return __awaiter(this, void 0, void 0, function () {
      var db, now;
      var _this = this;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            now = Date.now();
            return [
              4 /*yield*/,
              (0, database_1.runInTransaction)(function () {
                return __awaiter(_this, void 0, void 0, function () {
                  return __generator(this, function (_a) {
                    switch (_a.label) {
                      case 0:
                        return [
                          4 /*yield*/,
                          db
                            .insert(drizzleSchema_1.topicProgress)
                            .values({
                              topicId: topicId,
                              status: 'seen',
                              confidence: 1,
                              lastStudiedAt: now,
                              timesStudied: 1,
                            })
                            .onConflictDoUpdate({
                              target: drizzleSchema_1.topicProgress.topicId,
                              set: {
                                status: (0, drizzle_orm_1.sql)(
                                  templateObject_34 ||
                                    (templateObject_34 = __makeTemplateObject(
                                      ['CASE WHEN ', " = 'unseen' THEN 'seen' ELSE ", ' END'],
                                      ['CASE WHEN ', " = 'unseen' THEN 'seen' ELSE ", ' END'],
                                    )),
                                  drizzleSchema_1.topicProgress.status,
                                  drizzleSchema_1.topicProgress.status,
                                ),
                                confidence: (0, drizzle_orm_1.sql)(
                                  templateObject_35 ||
                                    (templateObject_35 = __makeTemplateObject(
                                      ['MAX(', ', 1)'],
                                      ['MAX(', ', 1)'],
                                    )),
                                  drizzleSchema_1.topicProgress.confidence,
                                ),
                                lastStudiedAt: now,
                                timesStudied: (0, drizzle_orm_1.sql)(
                                  templateObject_36 ||
                                    (templateObject_36 = __makeTemplateObject(
                                      ['', ' + 1'],
                                      ['', ' + 1'],
                                    )),
                                  drizzleSchema_1.topicProgress.timesStudied,
                                ),
                              },
                            }),
                        ];
                      case 1:
                        _a.sent();
                        return [2 /*return*/];
                    }
                  });
                });
              }),
            ];
          case 1:
            _a.sent();
            return [2 /*return*/];
        }
      });
    });
  },
  getSubjectBreakdown: function () {
    return __awaiter(this, void 0, void 0, function () {
      var db, rows;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            return [
              4 /*yield*/,
              db
                .select({
                  id: drizzleSchema_1.subjects.id,
                  name: drizzleSchema_1.subjects.name,
                  shortCode: drizzleSchema_1.subjects.shortCode,
                  color: drizzleSchema_1.subjects.colorHex,
                  total: (0, drizzle_orm_1.count)(drizzleSchema_1.topics.id),
                  covered: (0, drizzle_orm_1.sql)(
                    templateObject_37 ||
                      (templateObject_37 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN ', " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                  mastered: (0, drizzle_orm_1.sql)(
                    templateObject_38 ||
                      (templateObject_38 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', " = 'mastered' THEN 1 ELSE 0 END)"],
                        ['SUM(CASE WHEN ', " = 'mastered' THEN 1 ELSE 0 END)"],
                      )),
                    drizzleSchema_1.topicProgress.status,
                  ),
                  highYieldTotal: (0, drizzle_orm_1.sql)(
                    templateObject_39 ||
                      (templateObject_39 = __makeTemplateObject(
                        ['SUM(CASE WHEN ', ' >= 4 THEN 1 ELSE 0 END)'],
                        ['SUM(CASE WHEN ', ' >= 4 THEN 1 ELSE 0 END)'],
                      )),
                    drizzleSchema_1.topics.inicetPriority,
                  ),
                  highYieldCovered: (0, drizzle_orm_1.sql)(
                    templateObject_40 ||
                      (templateObject_40 = __makeTemplateObject(
                        [
                          'SUM(CASE WHEN ',
                          ' >= 4 AND ',
                          " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)",
                        ],
                        [
                          'SUM(CASE WHEN ',
                          ' >= 4 AND ',
                          " IN ('seen','reviewed','mastered') THEN 1 ELSE 0 END)",
                        ],
                      )),
                    drizzleSchema_1.topics.inicetPriority,
                    drizzleSchema_1.topicProgress.status,
                  ),
                })
                .from(drizzleSchema_1.subjects)
                .leftJoin(
                  drizzleSchema_1.topics,
                  (0, drizzle_orm_1.and)(
                    (0, drizzle_orm_1.eq)(
                      drizzleSchema_1.topics.subjectId,
                      drizzleSchema_1.subjects.id,
                    ),
                    (0, drizzle_orm_1.sql)(
                      templateObject_41 ||
                        (templateObject_41 = __makeTemplateObject(
                          [
                            'NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)',
                          ],
                          [
                            'NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = topics.id)',
                          ],
                        )),
                    ),
                  ),
                )
                .leftJoin(
                  drizzleSchema_1.topicProgress,
                  (0, drizzle_orm_1.eq)(
                    drizzleSchema_1.topics.id,
                    drizzleSchema_1.topicProgress.topicId,
                  ),
                )
                .groupBy(drizzleSchema_1.subjects.id)
                .orderBy(drizzleSchema_1.subjects.name),
            ];
          case 1:
            rows = _a.sent();
            return [
              2 /*return*/,
              rows.map(function (r) {
                var _a, _b, _c, _d, _e, _f;
                return {
                  id: r.id,
                  name: r.name,
                  shortCode: r.shortCode,
                  color: r.color,
                  total: (_a = r.total) !== null && _a !== void 0 ? _a : 0,
                  covered: (_b = r.covered) !== null && _b !== void 0 ? _b : 0,
                  mastered: (_c = r.mastered) !== null && _c !== void 0 ? _c : 0,
                  highYieldTotal: (_d = r.highYieldTotal) !== null && _d !== void 0 ? _d : 0,
                  highYieldCovered: (_e = r.highYieldCovered) !== null && _e !== void 0 ? _e : 0,
                  percent:
                    r.total > 0
                      ? Math.round(
                          (((_f = r.covered) !== null && _f !== void 0 ? _f : 0) / r.total) * 100,
                        )
                      : 0,
                };
              }),
            ];
        }
      });
    });
  },
  getReviewCalendarData: function (year, month) {
    return __awaiter(this, void 0, void 0, function () {
      var db, startDate, endDate, rows, byDate, _i, rows_1, r, existing;
      return __generator(this, function (_a) {
        switch (_a.label) {
          case 0:
            db = (0, drizzle_1.getDrizzleDb)();
            startDate = ''.concat(year, '-').concat(String(month + 1).padStart(2, '0'), '-01');
            endDate =
              month === 11
                ? ''.concat(year + 1, '-01-01')
                : ''.concat(year, '-').concat(String(month + 2).padStart(2, '0'), '-01');
            return [
              4 /*yield*/,
              db
                .select({
                  reviewDate: (0, drizzle_orm_1.sql)(
                    templateObject_42 ||
                      (templateObject_42 = __makeTemplateObject(['DATE(', ')'], ['DATE(', ')'])),
                    drizzleSchema_1.topicProgress.fsrsDue,
                  ),
                  topicName: drizzleSchema_1.topics.name,
                  confidence: drizzleSchema_1.topicProgress.confidence,
                })
                .from(drizzleSchema_1.topicProgress)
                .innerJoin(
                  drizzleSchema_1.topics,
                  (0, drizzle_orm_1.eq)(
                    drizzleSchema_1.topicProgress.topicId,
                    drizzleSchema_1.topics.id,
                  ),
                )
                .where(
                  (0, drizzle_orm_1.and)(
                    (0, drizzle_orm_1.sql)(
                      templateObject_43 ||
                        (templateObject_43 = __makeTemplateObject(
                          ['', " != 'unseen'"],
                          ['', " != 'unseen'"],
                        )),
                      drizzleSchema_1.topicProgress.status,
                    ),
                    (0, drizzle_orm_1.isNotNull)(drizzleSchema_1.topicProgress.fsrsDue),
                    (0, drizzle_orm_1.gte)(
                      (0, drizzle_orm_1.sql)(
                        templateObject_44 ||
                          (templateObject_44 = __makeTemplateObject(
                            ['DATE(', ')'],
                            ['DATE(', ')'],
                          )),
                        drizzleSchema_1.topicProgress.fsrsDue,
                      ),
                      startDate,
                    ),
                    (0, drizzle_orm_1.lt)(
                      (0, drizzle_orm_1.sql)(
                        templateObject_45 ||
                          (templateObject_45 = __makeTemplateObject(
                            ['DATE(', ')'],
                            ['DATE(', ')'],
                          )),
                        drizzleSchema_1.topicProgress.fsrsDue,
                      ),
                      endDate,
                    ),
                  ),
                )
                .orderBy(
                  (0, drizzle_orm_1.sql)(
                    templateObject_46 ||
                      (templateObject_46 = __makeTemplateObject(
                        ['DATE(', ') ASC'],
                        ['DATE(', ') ASC'],
                      )),
                    drizzleSchema_1.topicProgress.fsrsDue,
                  ),
                ),
            ];
          case 1:
            rows = _a.sent();
            byDate = new Map();
            for (_i = 0, rows_1 = rows; _i < rows_1.length; _i++) {
              r = rows_1[_i];
              existing = byDate.get(r.reviewDate);
              if (existing) {
                existing.count++;
                existing.topics.push({ name: r.topicName, confidence: r.confidence });
              } else {
                byDate.set(r.reviewDate, {
                  date: r.reviewDate,
                  count: 1,
                  topics: [{ name: r.topicName, confidence: r.confidence }],
                });
              }
            }
            return [2 /*return*/, Array.from(byDate.values())];
        }
      });
    });
  },
};
var templateObject_1,
  templateObject_2,
  templateObject_3,
  templateObject_4,
  templateObject_5,
  templateObject_6,
  templateObject_7,
  templateObject_8,
  templateObject_9,
  templateObject_10,
  templateObject_11,
  templateObject_12,
  templateObject_13,
  templateObject_14,
  templateObject_15,
  templateObject_16,
  templateObject_17,
  templateObject_18,
  templateObject_19,
  templateObject_20,
  templateObject_21,
  templateObject_22,
  templateObject_23,
  templateObject_24,
  templateObject_25,
  templateObject_26,
  templateObject_27,
  templateObject_28,
  templateObject_29,
  templateObject_30,
  templateObject_31,
  templateObject_32,
  templateObject_33,
  templateObject_34,
  templateObject_35,
  templateObject_36,
  templateObject_37,
  templateObject_38,
  templateObject_39,
  templateObject_40,
  templateObject_41,
  templateObject_42,
  templateObject_43,
  templateObject_44,
  templateObject_45,
  templateObject_46;
