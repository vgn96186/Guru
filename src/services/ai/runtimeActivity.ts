export type AiRuntimeRequestKind = 'json' | 'text' | 'stream';

export interface AiRuntimeRequestMeta {
  requestId: string;
  kind: AiRuntimeRequestKind;
  startedAt: number;
  backend?: string;
  modelUsed?: string;
}

export interface AiRuntimeSnapshot {
  activeCount: number;
  active: AiRuntimeRequestMeta[];
  lastCompletedAt: number | null;
  lastModelUsed: string | null;
  lastBackend: string | null;
  lastKind: AiRuntimeRequestKind | null;
  lastError: string | null;
}

type Listener = (snapshot: AiRuntimeSnapshot) => void;

const listeners = new Set<Listener>();
const activeRequests = new Map<string, AiRuntimeRequestMeta>();

let lastCompletedAt: number | null = null;
let lastModelUsed: string | null = null;
let lastBackend: string | null = null;
let lastKind: AiRuntimeRequestKind | null = null;
let lastError: string | null = null;

function buildSnapshot(): AiRuntimeSnapshot {
  return {
    activeCount: activeRequests.size,
    active: Array.from(activeRequests.values()).sort((a, b) => a.startedAt - b.startedAt),
    lastCompletedAt,
    lastModelUsed,
    lastBackend,
    lastKind,
    lastError,
  };
}

function emit() {
  const snapshot = buildSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function getAiRuntimeSnapshot(): AiRuntimeSnapshot {
  return buildSnapshot();
}

export function subscribeToAiRuntime(listener: Listener): () => void {
  listeners.add(listener);
  listener(buildSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function markAiRuntimeStart(meta: AiRuntimeRequestMeta) {
  activeRequests.set(meta.requestId, meta);
  emit();
}

export function markAiRuntimeFinish(
  requestId: string,
  meta?: Partial<Pick<AiRuntimeRequestMeta, 'backend' | 'kind' | 'modelUsed'>>,
  error?: string | null,
) {
  const activeMeta = activeRequests.get(requestId);
  activeRequests.delete(requestId);

  lastCompletedAt = Date.now();
  lastModelUsed = meta?.modelUsed ?? activeMeta?.modelUsed ?? lastModelUsed;
  lastBackend = meta?.backend ?? activeMeta?.backend ?? lastBackend;
  lastKind = meta?.kind ?? activeMeta?.kind ?? lastKind;
  lastError = error ?? null;

  emit();
}
