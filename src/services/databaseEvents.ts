import { EventEmitter } from 'eventemitter3';

/**
 * Global event bus for database updates.
 * Use this to notify the UI or stores when data has changed from background tasks.
 */
export const dbEvents = new EventEmitter();

export const DB_EVENT_KEYS = {
  LECTURE_SAVED: 'LECTURE_SAVED',
  TRANSCRIPT_RECOVERED: 'TRANSCRIPT_RECOVERED',
  RECORDING_RECOVERED: 'RECORDING_RECOVERED',
  PROGRESS_UPDATED: 'PROGRESS_UPDATED',
  PROFILE_UPDATED: 'PROFILE_UPDATED',
};

export function notifyDbUpdate(event: string, payload?: any) {
  if (__DEV__) console.log(`[DB_EVENT] Notifying: ${event}`);
  dbEvents.emit(event, payload);
}
