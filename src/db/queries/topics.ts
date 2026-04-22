export { topicsRepositoryDrizzle } from '../repositories/topicsRepository.drizzle';

// Re-export all the methods from the new drizzle repository to maintain compatibility
import { topicsRepositoryDrizzle } from '../repositories/topicsRepository.drizzle';

export const {
  getAllSubjects,
  getSubjectByName,
  getSubjectById,
  queueTopicSuggestionInTx,
  getPendingTopicSuggestions,
  approveTopicSuggestion,
  rejectTopicSuggestion,
  getTopicsBySubject,
  getAllTopicsWithProgress,
  getTopicById,
  updateTopicProgressInTx,
  updateTopicProgress,
  updateTopicsProgressBatch,
  updateTopicNotes,
  getTopicsDueForReview,
  getSubjectStatsAggregated,
  getSubjectCoverage,
  getWeakestTopics,
  getHighPriorityUnseenTopics,
  getNemesisTopics,
  markNemesisTopics,
  incrementWrongCount,
  markTopicNeedsAttention,
  markTopicDiscussedInChat,
  getSubjectBreakdown,
  createTopic,
  searchTopicsByName,
  getReviewCalendarData,
} = topicsRepositoryDrizzle;

// Export types if any were needed downstream
export type {
  TopicSuggestion,
  SubjectStatsRow,
  SubjectBreakdownRow,
  ReviewDay,
  TopicProgressUpdate,
} from '../repositories/topicsRepository.drizzle';
