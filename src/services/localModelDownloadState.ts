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
const STAGE_RANK: Record<LocalModelDownloadStage, number> = {
  preparing: 1,
  downloading: 2,
  verifying: 3,
  complete: 4,
  error: 4,
};

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
  if (snapshot && nextSnapshot) {
    const isSameDownload =
      snapshot.type === nextSnapshot.type &&
      snapshot.source === nextSnapshot.source &&
      snapshot.modelName === nextSnapshot.modelName;
    if (isSameDownload) {
      // Stale Expo progress callbacks can fire after we moved to verifying/complete.
      if (
        (snapshot.stage === 'verifying' ||
          snapshot.stage === 'complete' ||
          snapshot.stage === 'error') &&
        nextSnapshot.stage === 'downloading'
      ) {
        return;
      }
      // After terminal states, ignore earlier pipeline stages (except fresh duplicates).
      if (snapshot.stage === 'complete' || snapshot.stage === 'error') {
        const currentRank = STAGE_RANK[snapshot.stage];
        const nextRank = STAGE_RANK[nextSnapshot.stage];
        if (nextRank < currentRank) {
          return;
        }
      }
    }
  }
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
