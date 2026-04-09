// src/db/queries/contentFlags.ts

import { getDb, nowTs, SQL_AI_CACHE } from '../database';
import type { ContentType } from '../../types';

export type FlagReason = 'incorrect_fact' | 'outdated_info' | 'wrong_dosage' | 'missing_concept' | 'other';

export interface FlaggedContentItem {
  topicId: number;
  topicName: string;
  subjectName: string;
  contentType: ContentType;
  flagReason: FlagReason | 'auto_flagged';
  userNote?: string;
  flaggedAt: number;
  resolved: boolean;
}

/**
 * Flag content with user-provided reason.
 */
export async function flagContentWithReason(
  topicId: number,
  contentType: ContentType,
  reason: FlagReason,
  note?: string,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO user_content_flags (topic_id, content_type, flag_reason, user_note, flagged_at)
     VALUES (?, ?, ?, ?, ?)`,
    [topicId, contentType, reason, note ?? null, nowTs()],
  );

  await db.runAsync(
    `UPDATE ${SQL_AI_CACHE} SET is_flagged = 1 WHERE topic_id = ? AND content_type = ?`,
    [topicId, contentType],
  );
}

/**
 * Log automated fact-check result.
 */
export async function logFactCheckResult(
  topicId: number,
  contentType: ContentType,
  status: 'passed' | 'failed' | 'inconclusive',
  contradictions: Array<{ claim: string; trustedSource: string; trustedText: string; similarity: number }>,
): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `INSERT INTO content_fact_checks (topic_id, content_type, check_status, contradictions_json, checked_at)
     VALUES (?, ?, ?, ?, ?)`,
    [topicId, contentType, status, JSON.stringify(contradictions), nowTs()],
  );
}

/**
 * Get all flagged content (both user-flagged and auto-flagged).
 */
export async function getFlaggedContent(): Promise<FlaggedContentItem[]> {
  const db = getDb();
  const rows = await db.getAllAsync<{
    topic_id: number;
    topic_name: string;
    subject_name: string;
    content_type: string;
    flag_reason: string | null;
    user_note: string | null;
    flagged_at: number;
    resolved: number;
  }>(
    `SELECT DISTINCT
       c.topic_id,
       t.name AS topic_name,
       s.name AS subject_name,
       c.content_type,
       u.flag_reason,
       u.user_note,
       COALESCE(u.flagged_at, 0) AS flagged_at,
       COALESCE(u.resolved, 0) AS resolved
     FROM ${SQL_AI_CACHE} c
     JOIN topics t ON c.topic_id = t.id
     JOIN subjects s ON t.subject_id = s.id
     LEFT JOIN user_content_flags u ON c.topic_id = u.topic_id AND c.content_type = u.content_type
     WHERE c.is_flagged = 1
     ORDER BY flagged_at DESC`,
  );

  return rows.map((r) => ({
    topicId: r.topic_id,
    topicName: r.topic_name,
    subjectName: r.subject_name,
    contentType: r.content_type as ContentType,
    flagReason: (r.flag_reason as FlagReason) || 'auto_flagged',
    userNote: r.user_note ?? undefined,
    flaggedAt: r.flagged_at,
    resolved: r.resolved === 1,
  }));
}

/**
 * Resolve (dismiss) content flags for a topic+type.
 */
export async function resolveContentFlags(topicId: number, contentType: ContentType): Promise<void> {
  const db = getDb();
  await db.runAsync(
    `UPDATE user_content_flags SET resolved = 1, resolved_at = ? WHERE topic_id = ? AND content_type = ?`,
    [nowTs(), topicId, contentType],
  );
}
