import { linearTheme as n } from '../../../theme/linearTheme';
import { MS_PER_DAY } from '../../../constants/time';
import type { TopicStatus } from '../../../types';

export const STATUS_COLORS: Record<TopicStatus, string> = {
  unseen: n.colors.textMuted,
  seen: n.colors.accent,
  reviewed: n.colors.warning,
  mastered: n.colors.success,
};

export const STATUS_LABELS: Record<TopicStatus, string> = {
  unseen: 'Unseen',
  seen: 'Seen',
  reviewed: 'Reviewed',
  mastered: 'Mastered',
};

export const STATUS_BADGE_VARIANTS: Record<
  TopicStatus,
  'default' | 'accent' | 'warning' | 'success'
> = {
  unseen: 'default',
  seen: 'accent',
  reviewed: 'warning',
  mastered: 'success',
};

export const STATUS_ORDER: TopicStatus[] = ['unseen', 'seen', 'reviewed', 'mastered'];

export type TopicFilter = 'all' | 'due' | 'unseen' | 'weak' | 'high_yield' | 'notes';

export const FILTER_OPTIONS: Array<{ key: TopicFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'due', label: 'Due' },
  { key: 'unseen', label: 'Unseen' },
  { key: 'weak', label: 'Weak' },
  { key: 'high_yield', label: 'High Yield' },
  { key: 'notes', label: 'Notes' },
];

export const formatReviewDate = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const today = new Date().toISOString().slice(0, 10);
  if (dateStr === today) return 'Review today';
  const tomorrow = new Date(Date.now() + MS_PER_DAY).toISOString().slice(0, 10);
  if (dateStr === tomorrow) return 'Review tomorrow';
  if (dateStr < today) return 'Overdue for review!';
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / MS_PER_DAY);
  return `Review in ${days} days`;
};
