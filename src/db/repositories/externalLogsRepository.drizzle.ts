import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { getDrizzleDb } from '../drizzle';
import { externalAppLogs } from '../drizzleSchema';
import type {
  ExternalAppLog,
  NoteEnhancementStatus,
  SessionPipelineEvent,
  SessionPipelineTelemetry,
  TranscriptionStatus,
} from '../queries/externalLogs';

type ExternalAppLogRow = typeof externalAppLogs.$inferSelect;

function parseTelemetry(raw: string | null | undefined): SessionPipelineTelemetry | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionPipelineTelemetry;
  } catch {
    return null;
  }
}

function mergeTelemetry(
  current: SessionPipelineTelemetry | null,
  patch: Partial<SessionPipelineTelemetry>,
): SessionPipelineTelemetry {
  return {
    ...(current ?? {}),
    ...patch,
    providerAttempts: {
      ...(current?.providerAttempts ?? {}),
      ...(patch.providerAttempts ?? {}),
    },
    events: patch.events ?? current?.events,
    stages: {
      ...(current?.stages ?? {}),
      ...(patch.stages ?? {}),
    },
  };
}

function mapRowToExternalAppLog(row: ExternalAppLogRow): ExternalAppLog {
  return {
    id: row.id,
    appName: row.appName,
    launchedAt: row.launchedAt,
    returnedAt: row.returnedAt ?? null,
    durationMinutes: row.durationMinutes ?? null,
    notes: row.notes ?? undefined,
    recordingPath: row.recordingPath ?? null,
    transcriptionStatus: (row.transcriptionStatus ?? 'pending') as TranscriptionStatus,
    transcriptionError: row.transcriptionError ?? null,
    lectureNoteId: row.lectureNoteId ?? null,
    noteEnhancementStatus: (row.noteEnhancementStatus ?? null) as NoteEnhancementStatus | null,
    pipelineTelemetry: parseTelemetry(row.pipelineMetricsJson),
  };
}

export const externalLogsRepositoryDrizzle = {
  async startExternalAppSession(appName: string, recordingPath?: string): Promise<number> {
    const db = getDrizzleDb();
    const insertedRows = await db
      .insert(externalAppLogs)
      .values({
        appName,
        launchedAt: Date.now(),
        recordingPath: recordingPath ?? null,
        transcriptionStatus: 'recording',
      })
      .returning({ id: externalAppLogs.id });

    return insertedRows[0]?.id ?? 0;
  },

  async finishExternalAppSession(
    logId: number,
    durationMinutes: number,
    notes?: string,
  ): Promise<void> {
    const db = getDrizzleDb();
    await db
      .update(externalAppLogs)
      .set({
        returnedAt: Date.now(),
        durationMinutes,
        notes: notes || null,
      })
      .where(eq(externalAppLogs.id, logId));
  },

  async updateSessionTranscriptionStatus(
    logId: number,
    status: TranscriptionStatus,
    error?: string,
    lectureNoteId?: number,
  ): Promise<void> {
    const db = getDrizzleDb();
    try {
      await db
        .update(externalAppLogs)
        .set({
          transcriptionStatus: status,
          transcriptionError: error ?? null,
          lectureNoteId: lectureNoteId ?? null,
        })
        .where(eq(externalAppLogs.id, logId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such column') || msg.includes('no column named')) {
        if (__DEV__) console.warn('[externalLogs] Update failed, old schema:', msg);
      } else {
        throw err;
      }
    }
  },

  async updateSessionNoteEnhancementStatus(
    logId: number,
    status: NoteEnhancementStatus,
  ): Promise<void> {
    const db = getDrizzleDb();
    try {
      await db
        .update(externalAppLogs)
        .set({ noteEnhancementStatus: status })
        .where(eq(externalAppLogs.id, logId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such column') || msg.includes('no column named')) {
        if (__DEV__) console.warn('[externalLogs] Query failed, old schema:', msg);
      } else {
        throw err;
      }
    }
  },

  async updateSessionRecordingPath(logId: number, recordingPath: string): Promise<void> {
    const db = getDrizzleDb();
    try {
      await db.update(externalAppLogs).set({ recordingPath }).where(eq(externalAppLogs.id, logId));
    } catch (err) {
      if (__DEV__) console.warn('[externalLogs] Failed to update recording path:', err);
    }
  },

  async updateSessionPipelineTelemetry(
    logId: number,
    patch: Partial<SessionPipelineTelemetry>,
  ): Promise<void> {
    const db = getDrizzleDb();
    try {
      const rows = await db
        .select({ pipelineMetricsJson: externalAppLogs.pipelineMetricsJson })
        .from(externalAppLogs)
        .where(eq(externalAppLogs.id, logId))
        .limit(1);

      const merged = mergeTelemetry(parseTelemetry(rows[0]?.pipelineMetricsJson), patch);

      await db
        .update(externalAppLogs)
        .set({ pipelineMetricsJson: JSON.stringify(merged) })
        .where(eq(externalAppLogs.id, logId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such column') || msg.includes('no column named')) {
        if (__DEV__) console.warn('[externalLogs] Query failed, old schema:', msg);
      } else {
        throw err;
      }
    }
  },

  async appendSessionPipelineEvent(
    logId: number,
    event: SessionPipelineEvent,
    patch?: Partial<SessionPipelineTelemetry>,
  ): Promise<void> {
    const db = getDrizzleDb();
    try {
      const rows = await db
        .select({ pipelineMetricsJson: externalAppLogs.pipelineMetricsJson })
        .from(externalAppLogs)
        .where(eq(externalAppLogs.id, logId))
        .limit(1);

      const current = parseTelemetry(rows[0]?.pipelineMetricsJson);
      const nextEvents = [...(current?.events ?? []), event].slice(-20);
      const merged = mergeTelemetry(current, {
        ...(patch ?? {}),
        lastUpdatedAt: event.at,
        events: nextEvents,
      });

      await db
        .update(externalAppLogs)
        .set({ pipelineMetricsJson: JSON.stringify(merged) })
        .where(eq(externalAppLogs.id, logId));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such column') || msg.includes('no column named')) {
        if (__DEV__) console.warn('[externalLogs] Query failed, old schema:', msg);
      } else {
        throw err;
      }
    }
  },

  async getIncompleteExternalSession(): Promise<ExternalAppLog | null> {
    const db = getDrizzleDb();
    try {
      const rows = await db
        .select()
        .from(externalAppLogs)
        .where(isNull(externalAppLogs.returnedAt))
        .orderBy(desc(externalAppLogs.launchedAt))
        .limit(1);

      if (rows.length === 0) return null;
      return mapRowToExternalAppLog(rows[0]);
    } catch {
      return null;
    }
  },

  async getTodaysExternalStudyMinutes(): Promise<number> {
    const db = getDrizzleDb();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    try {
      const rows = await db
        .select({
          totalMinutes: sql<number>`COALESCE(SUM(${externalAppLogs.durationMinutes}), 0)`,
        })
        .from(externalAppLogs)
        .where(
          and(
            isNotNull(externalAppLogs.returnedAt),
            eq(externalAppLogs.transcriptionStatus, 'completed'),
            gte(externalAppLogs.returnedAt, startOfDay.getTime()),
          ),
        )
        .limit(1);

      return rows[0]?.totalMinutes ?? 0;
    } catch (err) {
      if (__DEV__) console.warn('[externalLogs] Failed to read today external study minutes:', err);
      return 0;
    }
  },

  async getFailedOrPendingTranscriptions(): Promise<ExternalAppLog[]> {
    const db = getDrizzleDb();
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // We cannot use `inArray` directly on literal strings if type mismatch occurs in older typescript, but drizzle allows it.
      const rows = await db
        .select()
        .from(externalAppLogs)
        .where(
          and(
            isNotNull(externalAppLogs.returnedAt),
            isNotNull(externalAppLogs.recordingPath),
            gt(externalAppLogs.launchedAt, sevenDaysAgo),
            or(
              inArray(externalAppLogs.transcriptionStatus, [
                'failed',
                'pending',
                'recording',
                'transcribing',
              ]),
              and(
                eq(externalAppLogs.transcriptionStatus, 'completed'),
                isNull(externalAppLogs.lectureNoteId),
              ),
            ),
          ),
        )
        .orderBy(desc(externalAppLogs.launchedAt))
        .limit(10);

      return rows.map(mapRowToExternalAppLog);
    } catch {
      return [];
    }
  },

  async getSessionsNeedingNoteEnhancement(): Promise<ExternalAppLog[]> {
    const db = getDrizzleDb();
    try {
      const rows = await db
        .select()
        .from(externalAppLogs)
        .where(
          and(
            isNotNull(externalAppLogs.lectureNoteId),
            eq(externalAppLogs.transcriptionStatus, 'completed'),
            or(
              isNull(externalAppLogs.noteEnhancementStatus),
              inArray(externalAppLogs.noteEnhancementStatus, ['pending', 'failed']),
            ),
          ),
        )
        .orderBy(desc(externalAppLogs.launchedAt))
        .limit(10);

      return rows.map(mapRowToExternalAppLog);
    } catch {
      return [];
    }
  },

  async getTotalExternalStudyMinutes(): Promise<number> {
    const db = getDrizzleDb();
    try {
      const rows = await db
        .select({
          totalMinutes: sql<number>`COALESCE(SUM(${externalAppLogs.durationMinutes}), 0)`,
        })
        .from(externalAppLogs)
        .where(
          and(
            isNotNull(externalAppLogs.durationMinutes),
            gt(externalAppLogs.durationMinutes, 0),
            eq(externalAppLogs.transcriptionStatus, 'completed'),
          ),
        )
        .limit(1);

      return rows[0]?.totalMinutes ?? 0;
    } catch {
      return 0;
    }
  },
};
