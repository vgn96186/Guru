/**
 * Daily agenda repository — decouples UI from persistence logic.
 * Delegates to the Drizzle-backed dailyAgendaRepositoryDrizzle for implementation.
 */
import { dailyAgendaRepositoryDrizzle } from './dailyAgendaRepository.drizzle';

export const dailyAgendaRepository = {
  getDailyAgenda: dailyAgendaRepositoryDrizzle.getDailyAgenda,
  saveDailyAgenda: dailyAgendaRepositoryDrizzle.saveDailyAgenda,
  deleteDailyAgenda: dailyAgendaRepositoryDrizzle.deleteDailyAgenda,
  logPlanEvent: dailyAgendaRepositoryDrizzle.logPlanEvent,
};
