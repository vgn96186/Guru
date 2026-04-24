/**
 * Planning tools — session planning and daily agendas for study optimization.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { getDrizzleDb } from '../../../../db/drizzle';
import { topics, topicProgress, subjects } from '../../../../db/drizzleSchema';
import { sql, like, eq } from 'drizzle-orm';

/**
 * plan_session — Generate an optimized study session plan for given topics.
 * Queries user progress and suggests optimal order/duration per topic.
 */
export const planSessionTool = tool({
  name: 'plan_session',
  description:
    'Create a study session plan for 1-5 NEET-PG topics. Factors in your progress, confidence, and FSRS spacing. Returns ordered topics with time allocations and review flags.',
  inputSchema: z.object({
    topics: z
      .array(z.string())
      .min(1)
      .max(5)
      .describe('Topic names, e.g. ["Diabetes mellitus", "Hypertension"]'),
    totalDurationMinutes: z.number().min(15).max(120).describe('Total session time available'),
    goals: z
      .string()
      .optional()
      .describe('Session focus, e.g. "high-yield review" or "deep understanding"'),
  }),
  execute: async ({ topics: topicNames, totalDurationMinutes, goals = 'balanced review' }) => {
    const db = getDrizzleDb();

    interface TopicProgress {
      name: string;
      status: string;
      confidence: number;
      stability: number;
    }

    // Query progress for each topic
    const topicProgressArray = (await Promise.all(
      topicNames.map(async (topicName) => {
        const rows = await db
          .select({
            name: topics.name,
            status: topicProgress.status,
            confidence: topicProgress.confidence,
            stability: topicProgress.fsrsStability,
          })
          .from(topics)
          .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
          .where(like(sql`lower(${topics.name})`, `%${topicName.toLowerCase()}%`))
          .orderBy(sql`LENGTH(${topics.name}) ASC`)
          .limit(1);

        const row = rows[0];
        return row
          ? {
              name: row.name,
              status: row.status ?? 'unseen',
              confidence: row.confidence ?? 0,
              stability: row.stability ?? 0,
            }
          : null;
      }),
    )) as (TopicProgress | null)[];

    // Filter valid topics
    const validTopics = topicProgressArray.filter((p): p is TopicProgress => p !== null);
    if (validTopics.length === 0) {
      return { error: 'No matching topics found', topics: topicNames };
    }

    // Simple allocation: prioritize low-confidence first
    validTopics.sort((a, b) => b.confidence - a.confidence);

    const timePerTopic = Math.floor(totalDurationMinutes / validTopics.length);
    const plan = validTopics.map((topic) => ({
      topic: topic.name,
      durationMinutes: timePerTopic,
      priority: topic.confidence < 3 ? 'high' : 'medium',
      needsReview: topic.status === 'failed' || topic.confidence < 2,
    }));

    return {
      plan,
      summary: `${validTopics.length} topics planned for ${totalDurationMinutes}min (${goals}). Focus on ${validTopics[0].name} first.`,
    };
  },
});

/**
 * daily_agenda — Generate full-day study schedule based on syllabus progress.
 * Balances subjects, incorporates breaks, and upcoming mock tests.
 */
export const dailyAgendaTool = tool({
  name: 'daily_agenda',
  description:
    'Create a realistic daily study schedule. Pulls from syllabus progress, balances subjects, adds breaks/Pomodoro, and flags mock test days.',
  inputSchema: z.object({
    startHour: z.number().min(6).max(22).describe('Preferred start hour (24h)'),
    endHour: z.number().min(8).max(24).describe('Preferred end hour'),
    mockTestDay: z.boolean().optional().describe('Prioritize mock test prep today?'),
  }),
  execute: async ({ startHour, endHour, mockTestDay = false }) => {
    const db = getDrizzleDb();

    // Get today's progress summary by subject
    interface SubjectProgress {
      name: string;
      avgConfidence: number;
      urgentReviews: number;
    }

    const subjectProgressRows = await db
      .select({
        name: subjects.name,
        avgConfidence: sql<number>`COALESCE(AVG(${topicProgress.confidence}), 0)`,
        urgentReviews: sql<number>`CAST(SUM(CASE WHEN ${topicProgress.status} = 'failed' THEN 1 ELSE 0 END) AS INTEGER)`,
      })
      .from(subjects)
      .leftJoin(topics, eq(topics.subjectId, subjects.id))
      .leftJoin(topicProgress, eq(topicProgress.topicId, topics.id))
      .groupBy(subjects.id, subjects.name);

    const subjectProgress: SubjectProgress[] = subjectProgressRows.map((r) => ({
      name: r.name,
      avgConfidence: Number(r.avgConfidence),
      urgentReviews: Number(r.urgentReviews),
    }));

    // Simple agenda generation logic
    const agenda: Array<{ time: string; activity: string; subject?: string }> = [];
    let currentHour = startHour;

    if (mockTestDay) {
      agenda.push({
        time: `${currentHour}:00-${currentHour + 2}:00`,
        activity: 'Mock Test (Full length)',
      });
      currentHour += 3; // + review
      agenda.push({ time: `${currentHour}:00-${currentHour + 1}:00`, activity: 'Mock Review' });
      currentHour += 1;
    }

    // Balance low-confidence subjects
    const lowConfSubjects = subjectProgress
      .filter((s): s is SubjectProgress => s.avgConfidence < 3)
      .sort((a, b) => b.urgentReviews - a.urgentReviews);

    for (; currentHour < endHour; currentHour += 1.5) {
      if (lowConfSubjects.length > 0) {
        const subject = lowConfSubjects.shift()!;
        agenda.push({
          time: `${Math.floor(currentHour)}:${currentHour % 1 === 0 ? '00' : '30'}-${Math.floor(
            currentHour + 1,
          )}:00`,
          activity: 'Deep study',
          subject: subject.name,
        });
      } else {
        agenda.push({
          time: `${Math.floor(currentHour)}:${currentHour % 1 === 0 ? '00' : '30'}-${Math.floor(
            currentHour + 1,
          )}:00`,
          activity: 'Review / Light reading',
        });
      }

      if (currentHour % 3 < 1.5) {
        agenda.push({
          time: `${Math.floor(currentHour)}:${((currentHour % 1) * 60) | 0}-${Math.floor(
            currentHour,
          )}:${((currentHour % 1) * 60 + 10) | 0}`,
          activity: 'Break (walk/stretch)',
        });
      }
    }

    return {
      agenda,
      subjectPriorities: subjectProgress.map((s) => ({
        name: s.name,
        avgConfidence: s.avgConfidence,
        urgentReviews: s.urgentReviews,
      })),
      totalStudyHours: endHour - startHour,
    };
  },
});
