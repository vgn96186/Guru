import { QueryClient } from '@tanstack/react-query';
import { dbEvents, DB_EVENT_KEYS } from './databaseEvents';
import { PROFILE_QUERY_KEY } from '../hooks/queries/useProfile';

/**
 * Singleton QueryClient — exported so dbEvents listeners and service layer
 * can call queryClient.invalidateQueries() outside React component trees.
 *
 * Configured for local SQLite: staleTime=Infinity (never auto-stale),
 * invalidation is explicit (triggered by dbEvents or mutations).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: 1000 * 60 * 10, // 10 min
      retry: 1,
    },
  },
});

// ─── Global dbEvents → query invalidation ────────────────────────────────────
// Replaces the dbEvents listeners that were in useAppStore.
// Background tasks emit these events after writing to the DB; we invalidate
// the affected queries so TanStack Query re-fetches in the background.

const invalidateProfile = () =>
  queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });

dbEvents.on(DB_EVENT_KEYS.PROFILE_UPDATED, invalidateProfile);
dbEvents.on(DB_EVENT_KEYS.PROGRESS_UPDATED, invalidateProfile);
dbEvents.on(DB_EVENT_KEYS.LECTURE_SAVED, invalidateProfile);
dbEvents.on(DB_EVENT_KEYS.TRANSCRIPT_RECOVERED, invalidateProfile);
