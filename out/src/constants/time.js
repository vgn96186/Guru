"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.INTERVALS = exports.MS_PER_DAY = exports.MS_PER_HOUR = exports.MS_PER_MINUTE = exports.MS_PER_SECOND = void 0;
/** Milliseconds per second / minute / hour / day. Single source of truth for time math. */
exports.MS_PER_SECOND = 1000;
exports.MS_PER_MINUTE = 60 * exports.MS_PER_SECOND;
exports.MS_PER_HOUR = 60 * exports.MS_PER_MINUTE;
exports.MS_PER_DAY = 24 * exports.MS_PER_HOUR;
/** Common intervals used across the app. */
exports.INTERVALS = {
    ONE_SECOND: exports.MS_PER_SECOND,
    ONE_MINUTE: exports.MS_PER_MINUTE,
    FIVE_MINUTES: 5 * exports.MS_PER_MINUTE,
    TEN_MINUTES: 10 * exports.MS_PER_MINUTE,
    FOUR_HOURS: 4 * exports.MS_PER_HOUR,
    TWO_DAYS: 2 * exports.MS_PER_DAY,
    SEVEN_DAYS: 7 * exports.MS_PER_DAY,
};
