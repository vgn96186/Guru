'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getReviewCalendarData =
  exports.searchTopicsByName =
  exports.createTopic =
  exports.getSubjectBreakdown =
  exports.markTopicDiscussedInChat =
  exports.markTopicNeedsAttention =
  exports.incrementWrongCount =
  exports.markNemesisTopics =
  exports.getNemesisTopics =
  exports.getHighPriorityUnseenTopics =
  exports.getWeakestTopics =
  exports.getSubjectCoverage =
  exports.getSubjectStatsAggregated =
  exports.getTopicsDueForReview =
  exports.updateTopicNotes =
  exports.updateTopicsProgressBatch =
  exports.updateTopicProgress =
  exports.updateTopicProgressInTx =
  exports.getTopicById =
  exports.getAllTopicsWithProgress =
  exports.getTopicsBySubject =
  exports.rejectTopicSuggestion =
  exports.approveTopicSuggestion =
  exports.getPendingTopicSuggestions =
  exports.queueTopicSuggestionInTx =
  exports.getSubjectById =
  exports.getSubjectByName =
  exports.getAllSubjects =
  exports.topicsRepositoryDrizzle =
    void 0;
var topicsRepository_drizzle_1 = require('../repositories/topicsRepository.drizzle');
Object.defineProperty(exports, 'topicsRepositoryDrizzle', {
  enumerable: true,
  get: function () {
    return topicsRepository_drizzle_1.topicsRepositoryDrizzle;
  },
});
// Re-export all the methods from the new drizzle repository to maintain compatibility
var topicsRepository_drizzle_2 = require('../repositories/topicsRepository.drizzle');
(exports.getAllSubjects = topicsRepository_drizzle_2.topicsRepositoryDrizzle.getAllSubjects),
  (exports.getSubjectByName = topicsRepository_drizzle_2.topicsRepositoryDrizzle.getSubjectByName),
  (exports.getSubjectById = topicsRepository_drizzle_2.topicsRepositoryDrizzle.getSubjectById),
  (exports.queueTopicSuggestionInTx =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.queueTopicSuggestionInTx),
  (exports.getPendingTopicSuggestions =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getPendingTopicSuggestions),
  (exports.approveTopicSuggestion =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.approveTopicSuggestion),
  (exports.rejectTopicSuggestion =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.rejectTopicSuggestion),
  (exports.getTopicsBySubject =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getTopicsBySubject),
  (exports.getAllTopicsWithProgress =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getAllTopicsWithProgress),
  (exports.getTopicById = topicsRepository_drizzle_2.topicsRepositoryDrizzle.getTopicById),
  (exports.updateTopicProgressInTx =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.updateTopicProgressInTx),
  (exports.updateTopicProgress =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.updateTopicProgress),
  (exports.updateTopicsProgressBatch =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.updateTopicsProgressBatch),
  (exports.updateTopicNotes = topicsRepository_drizzle_2.topicsRepositoryDrizzle.updateTopicNotes),
  (exports.getTopicsDueForReview =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getTopicsDueForReview),
  (exports.getSubjectStatsAggregated =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getSubjectStatsAggregated),
  (exports.getSubjectCoverage =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getSubjectCoverage),
  (exports.getWeakestTopics = topicsRepository_drizzle_2.topicsRepositoryDrizzle.getWeakestTopics),
  (exports.getHighPriorityUnseenTopics =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getHighPriorityUnseenTopics),
  (exports.getNemesisTopics = topicsRepository_drizzle_2.topicsRepositoryDrizzle.getNemesisTopics),
  (exports.markNemesisTopics =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.markNemesisTopics),
  (exports.incrementWrongCount =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.incrementWrongCount),
  (exports.markTopicNeedsAttention =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.markTopicNeedsAttention),
  (exports.markTopicDiscussedInChat =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.markTopicDiscussedInChat),
  (exports.getSubjectBreakdown =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getSubjectBreakdown),
  (exports.createTopic = topicsRepository_drizzle_2.topicsRepositoryDrizzle.createTopic),
  (exports.searchTopicsByName =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.searchTopicsByName),
  (exports.getReviewCalendarData =
    topicsRepository_drizzle_2.topicsRepositoryDrizzle.getReviewCalendarData);
