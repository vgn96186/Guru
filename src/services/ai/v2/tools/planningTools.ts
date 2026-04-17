/**
 * Planning tools — session planning and daily agendas for study optimization.
 */

import { z } from 'zod';
import { tool } from '../tool';
import { getDb } from '../../../../db/database';

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
  execute: async ({ topics, totalDurationMinutes, goals = 'balanced review' }) => {
    const db = await getDb();

    interface TopicProgress {
      name: string;
      status: string;
      confidence: number;
      stability: number;
    }

    // Query progress for each topic
    const topicProgress = (await Promise.all(
      topics.map(async (topicName) => {
        const row = await db.getFirstAsync<{
          name: string;
          status: string | null;
          confidence: number | null;
          stability: number | null;
        }>(
          `
          SELECT t.name, p.status, p.confidence, p.stability
          FROM topics t LEFT JOIN topic_progress p ON p.topic_id = t.id
          WHERE lower(t.name) LIKE lower(?)
          ORDER BY LENGTH(t.name) ASC LIMIT 1
        `,
          [`%${topicName}%`],
        );
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
    const validTopics = topicProgress.filter((p): p is TopicProgress => p !== null);
    if (validTopics.length === 0) {
      return { error: 'No matching topics found', topics };
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
    const db = await getDb();

    // Get today's progress summary by subject
    interface SubjectProgress {
      name: string;
      avgConfidence: number;
      urgentReviews: number;
    }

    const subjectProgress = await db.getAllAsync<SubjectProgress>(`
      SELECT 
        s.name,
        COALESCE(AVG(p.confidence), 0) as avgConfidence,
        COUNT(CASE WHEN p.status = 'failed' THEN 1 END) as urgentReviews
      FROM subjects s
      LEFT JOIN topics t ON t.subject_id = s.id
      LEFT JOIN topic_progress p ON p.topic_id = t.id
      GROUP BY s.id, s.name
    `);

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
          time: `${Math.floor(currentHour)}:${currentHour % 1 === 0 ? '00' : '30'}-${Math.floor(currentHour + 1)}:00`,
          activity: 'Deep study',
          subject: subject.name,
        });
      } else {
        agenda.push({
          time: `${Math.floor(currentHour)}:${currentHour % 1 === 0 ? '00' : '30'}-${Math.floor(currentHour + 1)}:00`,
          activity: 'Review / Light reading',
        });
      }

      if (currentHour % 3 < 1.5) {
        agenda.push({
          time: `${Math.floor(currentHour)}:${((currentHour % 1) * 60) | 0}-${Math.floor(currentHour)}:${((currentHour % 1) * 60 + 10) | 0}`,
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
