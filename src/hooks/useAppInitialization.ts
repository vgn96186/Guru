import { useEffect, useState } from 'react';
import { runAppBootstrap, resolveInitialRoute, type InitialRoute } from '../services/appBootstrap';

export interface AppInitializationState {
  dbReady: boolean;
  initialRoute: InitialRoute | null;
  error: string | null;
  isReady: boolean;
}

/**
 * Handles cold-start initialization: DB bootstrap and initial route resolution.
 * Simplifies App.tsx by encapsulating the complex useEffect logic.
 */
export function useAppInitialization(): AppInitializationState {
  const [dbReady, setDbReady] = useState(false);
  const [initialRoute, setInitialRoute] = useState<InitialRoute | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runAppBootstrap().then((outcome) => {
      if (outcome.success) {
        setDbReady(true);
      } else {
        setError(outcome.message);
      }
    });
  }, []);

  useEffect(() => {
    if (!dbReady) return;
    resolveInitialRoute()
      .then((route) => setInitialRoute(route))
      .catch((e) => {
        console.warn('[App] resolveInitialRoute failed:', e);
        setInitialRoute('CheckIn');
      });
  }, [dbReady]);

  return {
    dbReady,
    initialRoute,
    error,
    isReady: dbReady && initialRoute !== null,
  };
}
