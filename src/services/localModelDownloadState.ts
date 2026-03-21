export type LocalModelDownloadType = 'llm' | 'whisper';
export type LocalModelDownloadSource = 'bootstrap' | 'manual';
export type LocalModelDownloadStage =
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'complete'
  | 'error';

export interface LocalModelDownloadSnapshot {
  visible: boolean;
  type: LocalModelDownloadType;
  source: LocalModelDownloadSource;
  stage: LocalModelDownloadStage;
  modelName: string;
  progress: number;
  downloadedBytes?: number;
  totalBytes?: number;
  message?: string;
}

type Listener = (snapshot: LocalModelDownloadSnapshot | null) => void;

let snapshot: LocalModelDownloadSnapshot | null = null;
const listeners = new Set<Listener>();

function emit(nextSnapshot: LocalModelDownloadSnapshot | null): void {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener(snapshot));
}

export function getLocalModelDownloadSnapshot(): LocalModelDownloadSnapshot | null {
  return snapshot;
}

export function subscribeToLocalModelDownload(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function updateLocalModelDownload(nextSnapshot: LocalModelDownloadSnapshot): void {
  emit(nextSnapshot);
}

export function clearLocalModelDownload(): void {
  emit(null);
}

// Minimized state — persists across snapshots so the overlay stays collapsed
let minimized = false;
const minimizedListeners = new Set<(m: boolean) => void>();

export function isDownloadMinimized(): boolean {
  return minimized;
}

export function setDownloadMinimized(value: boolean): void {
  minimized = value;
  minimizedListeners.forEach((l) => l(minimized));
}

export function subscribeToMinimized(listener: (m: boolean) => void): () => void {
  minimizedListeners.add(listener);
  listener(minimized);
  return () => {
    minimizedListeners.delete(listener);
  };
}
