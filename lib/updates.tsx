/**
 * In-app OTA update manager.
 *
 * Why this exists: the default expo-updates flow downloads new bundles in the
 * *background* and only swaps them in on a full restart. Budget Android OEMs
 * (MIUI/ColorOS/FuntouchOS) freeze background work, so that download never
 * finishes and the device gets stuck on a stale bundle ("no OTA"). Here we
 * pull updates while the app is in the *foreground* (on launch + on resume),
 * which those OEM restrictions don't touch.
 *
 * We deliberately never force-reload mid-session — an engineer may be filling a
 * work-note. A fetched update is staged (expo-updates auto-applies it on the
 * next natural launch) and we surface a non-blocking "Restart" banner so they
 * can apply it immediately if they want.
 */

import * as Updates from 'expo-updates';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

export type OtaStatus =
  | 'idle' // never checked yet
  | 'checking' // asking the server
  | 'downloading' // pulling the new bundle
  | 'ready' // downloaded, waiting for restart
  | 'upToDate' // checked, nothing new
  | 'error'; // last check failed

type OtaContextValue = {
  status: OtaStatus;
  error: string | null;
  /** A new bundle is downloaded and will launch on restart. */
  ready: boolean;
  /** Manually check + download (used by the More screen button). */
  check: () => Promise<void>;
  /** Restart now into the staged update. */
  apply: () => Promise<void>;
};

const OtaContext = createContext<OtaContextValue | null>(null);

/** Don't auto-recheck more often than this on resume (manual checks bypass it). */
const MIN_AUTO_INTERVAL_MS = 30_000;

export function OtaUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<OtaStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const inFlight = useRef(false);
  const lastAutoCheck = useRef(0);

  const run = useCallback(
    async (manual: boolean) => {
      // Updates are disabled in Expo Go and dev builds — no-op so the UI still
      // renders sensibly instead of throwing.
      if (__DEV__ || !Updates.isEnabled) {
        if (manual) setStatus('upToDate');
        return;
      }
      // One waiting update is enough; don't keep re-downloading it.
      if (ready || inFlight.current) return;
      if (!manual && Date.now() - lastAutoCheck.current < MIN_AUTO_INTERVAL_MS) return;

      inFlight.current = true;
      if (!manual) lastAutoCheck.current = Date.now();
      try {
        setError(null);
        setStatus('checking');
        const result = await Updates.checkForUpdateAsync();
        if (!result.isAvailable) {
          setStatus('upToDate');
          return;
        }
        setStatus('downloading');
        await Updates.fetchUpdateAsync();
        setReady(true);
        setStatus('ready');
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Update check failed.');
      } finally {
        inFlight.current = false;
      }
    },
    [ready],
  );

  // Check once on mount, then every time the app returns to the foreground.
  useEffect(() => {
    run(false);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') run(false);
    });
    return () => sub.remove();
  }, [run]);

  const check = useCallback(() => run(true), [run]);

  const apply = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Could not restart.');
    }
  }, []);

  return (
    <OtaContext.Provider value={{ status, error, ready, check, apply }}>
      {children}
    </OtaContext.Provider>
  );
}

export function useOtaUpdates(): OtaContextValue {
  const ctx = useContext(OtaContext);
  if (!ctx) throw new Error('useOtaUpdates must be used within OtaUpdatesProvider');
  return ctx;
}

/** Human-readable one-liner for the More screen. */
export function otaStatusLabel(status: OtaStatus): string {
  switch (status) {
    case 'checking':
      return 'Checking for updates…';
    case 'downloading':
      return 'Downloading update…';
    case 'ready':
      return 'Update ready — restart to apply';
    case 'upToDate':
      return 'You’re on the latest version';
    case 'error':
      return 'Update check failed — tap to retry';
    default:
      return 'Tap to check for updates';
  }
}
