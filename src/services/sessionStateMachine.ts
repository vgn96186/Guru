import type { SessionState } from '../types';

const VALID_TRANSITIONS: Record<SessionState, SessionState[]> = {
  planning: ['agenda_reveal', 'studying', 'session_done'],
  agenda_reveal: ['studying'],
  studying: ['studying', 'topic_done', 'session_done'],
  topic_done: ['studying', 'session_done'],
  session_done: ['planning'],
};

export function isValidTransition(from: SessionState, to: SessionState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function transitionTo(
  current: SessionState,
  target: SessionState,
): { ok: true; state: SessionState } | { ok: false; error: string } {
  if (!isValidTransition(current, target)) {
    return {
      ok: false,
      error: `Invalid session state transition: ${current} -> ${target}`,
    };
  }
  return { ok: true, state: target };
}

export function assertTransition(from: SessionState, to: SessionState): void {
  if (!isValidTransition(from, to)) {
    throw new Error(`Invalid session state transition: ${from} -> ${to}`);
  }
}
