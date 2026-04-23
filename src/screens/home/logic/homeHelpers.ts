import type { DailyAgenda } from '../../../services/ai';
import type { TodayTask } from '../../../services/studyPlanner';
import type { TopicWithProgress } from '../../../types';

export function isLeafTopicIdListValid(allIds: number[], validLeafIds: Set<number>): boolean {
  return allIds.every((id) => validLeafIds.has(id));
}

export function tasksToAgenda(tasks: TodayTask[]): DailyAgenda {
  return {
    blocks: tasks.map((task, i) => ({
      id: `local-${i}`,
      title: task.topic.name,
      topicIds: [task.topic.id],
      durationMinutes: task.duration,
      startTime: task.timeLabel.split(' - ')[0],
      type: (task.type === 'review' ? 'review' : task.type === 'deep_dive' ? 'test' : 'study') as
        | 'study'
        | 'review'
        | 'test'
        | 'break',
      why: `${task.topic.subjectName} — ${
        task.type === 'review'
          ? 'due for review'
          : task.type === 'deep_dive'
            ? 'weak, needs deep dive'
            : 'new topic to cover'
      }`,
    })),
    guruNote:
      tasks.length > 0
        ? `${tasks.length} tasks lined up. Start with ${tasks[0].topic.name}.`
        : 'Nothing urgent today — great time to explore new topics.',
  };
}

export function normalizeAgendaForCompare(plan: DailyAgenda | null): string {
  if (!plan) return '';
  return JSON.stringify({
    blocks: plan.blocks.map((block) => ({
      title: block.title,
      topicIds: block.topicIds,
      durationMinutes: block.durationMinutes,
      startTime: block.startTime,
      type: block.type,
    })),
    guruNote: plan.guruNote,
  });
}

export function homeSelectionReasonFromTopic(
  topic: TopicWithProgress,
  fallbackType: 'new' | 'review' | 'deep_dive',
): string {
  const due = topic.progress.fsrsDue?.slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (due && due < today) return 'Review critical';
  if (topic.progress.status === 'seen' && topic.progress.confidence < 1) return 'Quiz pending';
  if (
    topic.progress.confidence <= 1 ||
    (topic.progress.wrongCount ?? 0) >= 2 ||
    topic.progress.isNemesis
  )
    return 'Foundation repair';
  if (topic.progress.status === 'unseen') return 'Fresh coverage';
  if (topic.inicetPriority >= 8) return 'High-yield focus';
  if (fallbackType === 'review') return 'Spaced repetition';
  return 'Novelty rotation';
}
