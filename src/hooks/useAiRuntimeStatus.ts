import { useEffect, useState } from 'react';
import {
  getAiRuntimeSnapshot,
  subscribeToAiRuntime,
  type AiRuntimeSnapshot,
} from '../services/ai/runtimeActivity';

export function useAiRuntimeStatus(): AiRuntimeSnapshot {
  const [snapshot, setSnapshot] = useState<AiRuntimeSnapshot>(getAiRuntimeSnapshot());

  useEffect(() => subscribeToAiRuntime(setSnapshot), []);

  return snapshot;
}
