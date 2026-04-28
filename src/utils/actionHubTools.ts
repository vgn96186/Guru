import {
  ACTION_HUB_TOOL_IDS,
  DEFAULT_ACTION_HUB_TOOLS,
  type ActionHubToolId,
} from '../constants/actionHubTools';

export function sanitizeActionHubTools(value: unknown): ActionHubToolId[] {
  const allowed = new Set<ActionHubToolId>(ACTION_HUB_TOOL_IDS);
  const input = Array.isArray(value) ? (value as unknown[]) : [];
  const cleaned: ActionHubToolId[] = [];
  for (const v of input) {
    if (typeof v !== 'string') continue;
    if (!allowed.has(v as ActionHubToolId)) continue;
    if (cleaned.includes(v as ActionHubToolId)) continue;
    cleaned.push(v as ActionHubToolId);
  }

  const filled = [...cleaned];
  for (const d of DEFAULT_ACTION_HUB_TOOLS) {
    if (filled.length >= 6) break;
    if (!filled.includes(d)) filled.push(d);
  }

  return filled.slice(0, 6);
}
