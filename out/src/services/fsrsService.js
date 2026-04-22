'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.mapConfidenceToRating = void 0;
exports.getInitialCard = getInitialCard;
exports.reviewCard = reviewCard;
exports.reviewCardFromConfidence = reviewCardFromConfidence;
exports.buildFsrsCard = buildFsrsCard;
exports.previewIntervals = previewIntervals;
exports.fsrsStatusFromCard = fsrsStatusFromCard;
var ts_fsrs_1 = require('ts-fsrs');
var fsrsHelpers_1 = require('./fsrsHelpers');
Object.defineProperty(exports, 'mapConfidenceToRating', {
  enumerable: true,
  get: function () {
    return fsrsHelpers_1.mapConfidenceToRating;
  },
});
var f = (0, ts_fsrs_1.fsrs)({
  maximum_interval: 365,
});
function getInitialCard() {
  return (0, ts_fsrs_1.createEmptyCard)(new Date());
}
function reviewCard(card, rating, now) {
  if (now === void 0) {
    now = new Date();
  }
  var logs = f.repeat(card, now);
  return logs[rating];
}
function reviewCardFromConfidence(card, confidence, now) {
  if (now === void 0) {
    now = new Date();
  }
  var logs = f.repeat(card, now);
  return (0, fsrsHelpers_1.selectReviewLogByConfidence)(logs, confidence);
}
function buildFsrsCard(progress) {
  if (progress.fsrsLastReview && progress.fsrsDue) {
    return {
      due: new Date(progress.fsrsDue),
      stability: progress.fsrsStability,
      difficulty: progress.fsrsDifficulty,
      elapsed_days: progress.fsrsElapsedDays,
      scheduled_days: progress.fsrsScheduledDays,
      reps: progress.fsrsReps,
      lapses: progress.fsrsLapses,
      state: progress.fsrsState,
      last_review: new Date(progress.fsrsLastReview),
    };
  }
  return getInitialCard();
}
function previewIntervals(card, now) {
  if (now === void 0) {
    now = new Date();
  }
  var logs = f.repeat(card, now);
  return {
    Again: logs[ts_fsrs_1.Rating.Again].card.scheduled_days,
    Hard: logs[ts_fsrs_1.Rating.Hard].card.scheduled_days,
    Good: logs[ts_fsrs_1.Rating.Good].card.scheduled_days,
    Easy: logs[ts_fsrs_1.Rating.Easy].card.scheduled_days,
  };
}
function fsrsStatusFromCard(card) {
  if (card.state === ts_fsrs_1.State.Learning || card.state === ts_fsrs_1.State.Relearning)
    return 'seen';
  if (card.state === ts_fsrs_1.State.Review && card.stability >= 21) return 'mastered';
  return 'reviewed';
}
