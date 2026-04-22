/**
 * Repository layer — abstraction between Zustand stores / UI and database queries.
 * Use repositories instead of importing from db/queries/progress directly.
 */
export { profileRepository, type UserProfile } from './profileRepository';
export { subjectsRepositoryDrizzle } from './subjectsRepository.drizzle';
export type { Subject } from '../../types';
export { dailyLogRepository, type DailyLog, type Mood } from './dailyLogRepository';
export { dailyLogRepositoryDrizzle } from './dailyLogRepository.drizzle';
export { dailyAgendaRepository } from './dailyAgendaRepository';
export { dailyAgendaRepositoryDrizzle } from './dailyAgendaRepository.drizzle';
export {
  contentFlagsRepositoryDrizzle,
  type FactCheckContradiction,
  type FlaggedContentItem,
  type FlagReason,
} from './contentFlagsRepository.drizzle';
export { externalLogsRepositoryDrizzle } from './externalLogsRepository.drizzle';
export { aiCacheRepositoryDrizzle } from './aiCacheRepository.drizzle';
export { brainDumpsRepositoryDrizzle } from './brainDumpsRepository.drizzle';
export { generatedStudyImagesRepositoryDrizzle } from './generatedStudyImagesRepository.drizzle';
export {
  guruChatRepositoryDrizzle,
  type ChatHistoryMessage,
  type GuruChatThread,
} from './guruChatRepository.drizzle';
export {
  guruChatSessionMemoryRepositoryDrizzle,
  type GuruChatSessionMemoryRow,
} from './guruChatSessionMemoryRepository.drizzle';
export { lectureScheduleRepositoryDrizzle } from './lectureScheduleRepository.drizzle';
export { mindMapsRepositoryDrizzle } from './mindMapsRepository.drizzle';
export {
  offlineQueueRepositoryDrizzle,
  type OfflineQueueItemRecord,
  type OfflineRequestType,
} from './offlineQueueRepository.drizzle';
export { topicProgressRepositoryDrizzle } from './topicProgressRepository.drizzle';
export { topicsRepositoryDrizzle, type CreateTopicInput } from './topicsRepository.drizzle';
export { sessionsRepositoryDrizzle } from './sessionsRepository.drizzle';
export {
  lectureNotesRepositoryDrizzle,
  type CreateLectureNoteInput,
  type LectureNoteRecord,
} from './lectureNotesRepository.drizzle';
export { questionBankRepositoryDrizzle } from './questionBankRepository.drizzle';
