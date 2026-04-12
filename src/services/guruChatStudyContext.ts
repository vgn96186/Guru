import type { UserProfile } from '../types';
import { profileRepository } from '../db/repositories';
import { getDb } from '../db/database';
import { buildExamIntelligenceBrief, getExamTargetIntelligence } from './examIntelligence';

const MAX_LEN = 760;

/**
 * Compact, bounded snapshot of FSRS/review state + exam countdown for Guru Chat prompts.
 * Omits heavy joins; safe to call on each send (samples only).
 */
export async function buildBoundedGuruChatStudyContext(
  profile: UserProfile | null,
  syllabusTopicId?: number,
): Promise<string | undefined> {
  if (!profile) return undefined;
  try {
    const db = getDb();
    const [due, weak] = await Promise.all([
      profileRepository.getReviewDueTopics(),
      profileRepository.getWeakestTopics(5),
    ]);
    const mastery = await db.getFirstAsync<{
      unseen: number;
      seen_needs_quiz: number;
      reviewed: number;
      mastered: number;
      foundational_gaps: number;
    }>(
      `SELECT
          SUM(CASE WHEN COALESCE(tp.status, 'unseen') = 'unseen' THEN 1 ELSE 0 END) AS unseen,
          SUM(CASE WHEN COALESCE(tp.status, 'unseen') = 'seen' AND COALESCE(tp.confidence, 0) < 1 THEN 1 ELSE 0 END) AS seen_needs_quiz,
          SUM(CASE WHEN COALESCE(tp.status, 'unseen') = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
          SUM(CASE WHEN COALESCE(tp.status, 'unseen') = 'mastered' THEN 1 ELSE 0 END) AS mastered,
          SUM(CASE
              WHEN COALESCE(tp.status, 'unseen') != 'unseen'
                AND (
                  COALESCE(tp.confidence, 0) <= 1
                  OR COALESCE(tp.wrong_count, 0) >= 2
                  OR COALESCE(tp.is_nemesis, 0) = 1
                )
              THEN 1 ELSE 0 END) AS foundational_gaps
       FROM topics t
       LEFT JOIN topic_progress tp ON tp.topic_id = t.id
       WHERE NOT EXISTS (SELECT 1 FROM topics c WHERE c.parent_topic_id = t.id)`,
    );

    const examLabel = profile.examType === 'NEET' ? 'NEET-PG' : 'INI-CET';
    const examDate = profile.examType === 'NEET' ? profile.neetDate : profile.inicetDate;
    const days = profileRepository.getDaysToExam(examDate);
    const examIntelligence = getExamTargetIntelligence(profile, profileRepository.getDaysToExam);

    const parts: string[] = [];
    if (syllabusTopicId != null) {
      const topicRow = await db.getFirstAsync<{
        id: number;
        name: string;
        subject_id: number;
        subject_name: string;
        parent_topic_id: number | null;
        parent_name: string | null;
        status: string | null;
        confidence: number | null;
        wrong_count: number | null;
        is_nemesis: number | null;
        next_review_date: string | null;
      }>(
        `SELECT
            t.id,
            t.name,
            t.subject_id,
            s.name AS subject_name,
            t.parent_topic_id,
            parent.name AS parent_name,
            COALESCE(tp.status, 'unseen') AS status,
            COALESCE(tp.confidence, 0) AS confidence,
            COALESCE(tp.wrong_count, 0) AS wrong_count,
            COALESCE(tp.is_nemesis, 0) AS is_nemesis,
            tp.next_review_date
         FROM topics t
         JOIN subjects s ON s.id = t.subject_id
         LEFT JOIN topics parent ON parent.id = t.parent_topic_id
         LEFT JOIN topic_progress tp ON tp.topic_id = t.id
         WHERE t.id = ?`,
        [syllabusTopicId],
      );

      if (topicRow) {
        const siblingWeakRows = await db.getAllAsync<{ name: string }>(
          `SELECT t.name
           FROM topics t
           LEFT JOIN topic_progress tp ON tp.topic_id = t.id
           WHERE t.id != ?
             AND t.subject_id = ?
           ORDER BY COALESCE(tp.is_nemesis, 0) DESC,
                    COALESCE(tp.wrong_count, 0) DESC,
                    COALESCE(tp.confidence, 0) ASC,
                    t.inicet_priority DESC,
                    t.name ASC
           LIMIT 3`,
          [topicRow.id, topicRow.subject_id],
        );

        const topicParts = [
          `Current topic: ${topicRow.name} (${topicRow.subject_name})`,
          topicRow.parent_name ? `Parent topic: ${topicRow.parent_name}` : null,
          `Topic mastery: status ${topicRow.status}, confidence ${topicRow.confidence}/3, wrongs ${
            topicRow.wrong_count
          }, nemesis ${topicRow.is_nemesis ? 'yes' : 'no'}`,
          topicRow.next_review_date ? `Next review date: ${topicRow.next_review_date}` : null,
          siblingWeakRows.length > 0
            ? `Nearby weak topics: ${siblingWeakRows.map((row) => row.name).join(', ')}`
            : null,
        ].filter(Boolean);
        parts.push(topicParts.join(' | '));
      }
    }
    if (days > 0) {
      parts.push(`${examLabel} in ${days} day(s)`);
    }
    parts.push(buildExamIntelligenceBrief(examIntelligence));
    if (due.length > 0) {
      const sample = due
        .slice(0, 6)
        .map((t) => t.topicName)
        .join(', ');
      parts.push(`Review queue (sample): ${sample}`);
    }
    if (weak.length > 0) {
      const w = weak
        .slice(0, 4)
        .map((t) => t.name)
        .join(', ');
      parts.push(`Lower-confidence topics (sample): ${w}`);
    }
    if (mastery) {
      const unseen = mastery.unseen ?? 0;
      const seenNeedsQuiz = mastery.seen_needs_quiz ?? 0;
      const reviewed = mastery.reviewed ?? 0;
      const mastered = mastery.mastered ?? 0;
      const gaps = mastery.foundational_gaps ?? 0;
      const total = unseen + seenNeedsQuiz + reviewed + mastered;
      if (total > 0) {
        parts.push(
          `Mastery snapshot: unseen ${unseen}, watched-not-quizzed ${seenNeedsQuiz}, reviewed ${reviewed}, mastered ${mastered}`,
        );
      }
      if (gaps > 0) {
        parts.push(
          `Foundational gaps flagged: ${gaps}. Tutor should explain prerequisites first and avoid assumed jargon.`,
        );
      }
    }
    if (parts.length === 0) return undefined;
    let out = parts.join(' | ');
    if (out.length > MAX_LEN) {
      out = `${out.slice(0, MAX_LEN - 3)}...`;
    }
    return out;
  } catch {
    return undefined;
  }
}
