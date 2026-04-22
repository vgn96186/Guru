"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LectureAnalysisSchema = exports.FlashcardsContentSchema = exports.KeyPointsContentSchema = exports.QuizContentSchema = exports.QuizQuestionSchema = exports.DailyLogSchema = exports.GuruFrequencySchema = exports.HarassmentToneSchema = exports.StudyResourceModeSchema = exports.SessionModeSchema = exports.TopicStatusSchema = exports.ContentTypeSchema = exports.MoodSchema = void 0;
/**
 * Schemas — Zod-based single source of truth for data structures.
 * Export schemas for validation; derive types via z.infer.
 */
var core_1 = require("./core");
Object.defineProperty(exports, "MoodSchema", { enumerable: true, get: function () { return core_1.MoodSchema; } });
Object.defineProperty(exports, "ContentTypeSchema", { enumerable: true, get: function () { return core_1.ContentTypeSchema; } });
Object.defineProperty(exports, "TopicStatusSchema", { enumerable: true, get: function () { return core_1.TopicStatusSchema; } });
Object.defineProperty(exports, "SessionModeSchema", { enumerable: true, get: function () { return core_1.SessionModeSchema; } });
Object.defineProperty(exports, "StudyResourceModeSchema", { enumerable: true, get: function () { return core_1.StudyResourceModeSchema; } });
Object.defineProperty(exports, "HarassmentToneSchema", { enumerable: true, get: function () { return core_1.HarassmentToneSchema; } });
Object.defineProperty(exports, "GuruFrequencySchema", { enumerable: true, get: function () { return core_1.GuruFrequencySchema; } });
Object.defineProperty(exports, "DailyLogSchema", { enumerable: true, get: function () { return core_1.DailyLogSchema; } });
var ai_1 = require("./ai");
Object.defineProperty(exports, "QuizQuestionSchema", { enumerable: true, get: function () { return ai_1.QuizQuestionSchema; } });
Object.defineProperty(exports, "QuizContentSchema", { enumerable: true, get: function () { return ai_1.QuizContentSchema; } });
Object.defineProperty(exports, "KeyPointsContentSchema", { enumerable: true, get: function () { return ai_1.KeyPointsContentSchema; } });
Object.defineProperty(exports, "FlashcardsContentSchema", { enumerable: true, get: function () { return ai_1.FlashcardsContentSchema; } });
Object.defineProperty(exports, "LectureAnalysisSchema", { enumerable: true, get: function () { return ai_1.LectureAnalysisSchema; } });
