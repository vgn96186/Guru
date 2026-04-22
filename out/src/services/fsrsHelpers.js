"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapConfidenceToRating = mapConfidenceToRating;
exports.selectReviewLogByConfidence = selectReviewLogByConfidence;
var ts_fsrs_1 = require("ts-fsrs");
function mapConfidenceToRating(confidence) {
    var floored = Math.floor(confidence);
    if (floored <= 1)
        return ts_fsrs_1.Rating.Again;
    if (floored === 2)
        return ts_fsrs_1.Rating.Hard;
    if (floored === 3)
        return ts_fsrs_1.Rating.Good;
    return ts_fsrs_1.Rating.Easy;
}
function selectReviewLogByConfidence(logs, confidence) {
    var rating = mapConfidenceToRating(confidence);
    return logs[rating];
}
