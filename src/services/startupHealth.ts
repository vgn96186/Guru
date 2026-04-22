export type StartupHealthStage =
  | 'launching'
  | 'bootstrap_started'
  | 'bootstrap_succeeded'
  | 'bootstrap_failed'
  | 'db_ready'
  | 'route_ready'
  | 'ui_ready'
  | 'runtime_error'
  | 'render_error';

function sanitizeDetail(detail?: string | null): string {
  return (detail ?? '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function reportStartupHealth(stage: StartupHealthStage, detail?: string | null): void {
  const payload = sanitizeDetail(detail);
  if (stage === 'runtime_error') console.log('RUNTIME ERROR TRACE', new Error().stack);
  if (payload) {
    console.log(`GURU_HEALTH:${stage}:${payload}`);
    return;
  }
  console.log(`GURU_HEALTH:${stage}`);
}
