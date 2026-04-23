import { questionBankRepositoryDrizzle } from '../repositories/questionBankRepository.drizzle';

export const saveQuestion = questionBankRepositoryDrizzle.saveQuestion;
export const saveBulkQuestions = questionBankRepositoryDrizzle.saveBulkQuestions;
export const deleteQuestion = questionBankRepositoryDrizzle.deleteQuestion;
export const toggleBookmark = questionBankRepositoryDrizzle.toggleBookmark;
export const markMastered = questionBankRepositoryDrizzle.markMastered;
export const recordAttempt = questionBankRepositoryDrizzle.recordAttempt;
export const getQuestions = questionBankRepositoryDrizzle.getQuestions;
export const getQuestionCount = questionBankRepositoryDrizzle.getQuestionCount;
export const getPracticeSet = questionBankRepositoryDrizzle.getPracticeSet;
export const getDueForReview = questionBankRepositoryDrizzle.getDueForReview;
export const getCachedUnseenQuestionsForSessionFallback =
  questionBankRepositoryDrizzle.getCachedUnseenQuestionsForSessionFallback;
export const getSubjectStats = questionBankRepositoryDrizzle.getSubjectStats;
