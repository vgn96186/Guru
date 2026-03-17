/** Milliseconds per second / minute / hour / day. Single source of truth for time math. */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Common intervals used across the app. */
export const INTERVALS = {
  ONE_SECOND: MS_PER_SECOND,
  ONE_MINUTE: MS_PER_MINUTE,
  FIVE_MINUTES: 5 * MS_PER_MINUTE,
  TEN_MINUTES: 10 * MS_PER_MINUTE,
  FOUR_HOURS: 4 * MS_PER_HOUR,
  TWO_DAYS: 2 * MS_PER_DAY,
  SEVEN_DAYS: 7 * MS_PER_DAY,
} as const;
