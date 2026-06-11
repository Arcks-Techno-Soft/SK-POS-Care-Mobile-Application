/**
 * Auth provider — owns the session lifecycle and exposes the API client.
 *
 * Status machine:
 *   loading       — reading device storage at startup
 *   needsLogin    — no account on this device; show the login screen
 *   locked        — an account exists; show the passcode / biometric lock
 *   authenticated — valid JWT in memory; the app is usable
 *
 * Passcode login is a client-side convenience layer: the backend only knows
 * username/password, so unlocking re-authenticates silently using credentials
 * cached in the Android Keystore.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { Api, ApiError, normalizeBaseUrl } from './api';
import * as storage from './storage';
import type { Role, User } from './types';

// Production backend on Render. End users don't configure this — it's the
// app's permanent home. The override path in the More tab is kept so
// staging/local backends can still be aimed at when debugging.
const DEFAULT_SERVER_URL = 'https://arckscare-api.onrender.com';
/** Re-lock if the app was backgrounded longer than this. */
const LOCK_AFTER_MS = 90_000;

export type AuthStatus = 'loading' | 'needsLogin' | 'locked' | 'authenticated';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

interface LockedAccount {
  name: string;
  role: Role | null;
}

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  serverUrl: string;
  lockedAccount: LockedAccount | null;
  hasPasscode: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  api: Api;

  setServerUrl: (url: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<ActionResult>;
  setPasscode: (code: string) => Promise<void>;
  unlockWithPasscode: (code: string) => Promise<ActionResult>;
  unlockWithBiometric: () => Promise<ActionResult>;
  enableBiometric: () => Promise<ActionResult>;
  disableBiometric: () => Promise<void>;
  lock: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [serverUrl, setServerUrlState] = useState(DEFAULT_SERVER_URL);
  const [lockedAccount, setLockedAccount] = useState<LockedAccount | null>(null);
  const [hasPasscode, setHasPasscode] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  // Refs keep the API client and lifecycle handlers reading fresh values.
  const tokenRef = useRef<string | null>(null);
  const serverUrlRef = useRef(DEFAULT_SERVER_URL);
  const statusRef = useRef<AuthStatus>('loading');
  const hasPasscodeRef = useRef(false);
  const backgroundedAt = useRef<number | null>(null);

  statusRef.current = status;
  hasPasscodeRef.current = hasPasscode;

  const lock = useCallback(() => {
    tokenRef.current = null;
    setUser((current) => {
      if (current) setLockedAccount({ name: current.name, role: current.role });
      return current;
    });
    setStatus('locked');
  }, []);

  const apiRef = useRef<Api>(
    new Api({
      getBaseUrl: () => serverUrlRef.current,
      getToken: () => tokenRef.current,
      onUnauthorized: () => {
        // The token was rejected mid-session; fall back to the lock screen.
        if (statusRef.current === 'authenticated') {
          if (hasPasscodeRef.current) lock();
          else setStatus('needsLogin');
        }
      },
    }),
  );

  const applySession = useCallback((session: storage.StoredSession) => {
    tokenRef.current = session.token;
    setUser(session.user);
    setLockedAccount({ name: session.user.name, role: session.user.role });
    setStatus('authenticated');
  }, []);

  /** Get a fresh JWT: reuse a still-valid cached one, else re-login. */
  const reauthenticate = useCallback(async (): Promise<{
    ok: boolean;
    fatal?: boolean;
    error?: string;
  }> => {
    const cached = await storage.getSession();
    if (cached && new Date(cached.expiresAt).getTime() > Date.now() + 60_000) {
      applySession(cached);
      return { ok: true };
    }
    const creds = await storage.getCredentials();
    if (!creds) return { ok: false, fatal: true, error: 'No saved account.' };
    try {
      const res = await apiRef.current.login(creds.username, creds.password);
      const session: storage.StoredSession = {
        token: res.access_token,
        expiresAt: res.expires_at,
        user: res.user,
      };
      await storage.saveSession(session);
      applySession(session);
      return { ok: true };
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401 || err.status === 403) {
        return {
          ok: false,
          fatal: true,
          error: 'Your saved password is no longer valid. Please sign in again.',
        };
      }
      if (cached) {
        // Offline: fall back to the cached token even if near expiry.
        applySession(cached);
        return { ok: true };
      }
      return { ok: false, error: err.message };
    }
  }, [applySession]);

  const doSignOut = useCallback(async () => {
    await storage.wipeAccount();
    tokenRef.current = null;
    setUser(null);
    setLockedAccount(null);
    setHasPasscode(false);
    setBiometricEnabled(false);
    setStatus('needsLogin');
  }, []);

  /* ---------- startup ---------- */

  useEffect(() => {
    (async () => {
      const savedUrl = (await storage.getServerUrl()) ?? DEFAULT_SERVER_URL;
      serverUrlRef.current = savedUrl;
      setServerUrlState(savedUrl);

      const hw = await LocalAuthentication.hasHardwareAsync().catch(() => false);
      const enrolled = await LocalAuthentication.isEnrolledAsync().catch(() => false);
      const bioAvailable = hw && enrolled;
      setBiometricAvailable(bioAvailable);

      const [creds, passcodeSet, prefs] = await Promise.all([
        storage.getCredentials(),
        storage.hasPasscode(),
        storage.getPrefs(),
      ]);
      setHasPasscode(passcodeSet);
      setBiometricEnabled(prefs.biometricEnabled && bioAvailable);

      if (!creds) {
        setStatus('needsLogin');
        return;
      }

      const cached = await storage.getSession();
      if (cached) {
        setLockedAccount({ name: cached.user.name, role: cached.user.role });
      } else {
        setLockedAccount({ name: creds.username, role: null });
      }

      if (passcodeSet) {
        setStatus('locked');
      } else {
        const r = await reauthenticate();
        if (!r.ok) {
          if (r.fatal) await doSignOut();
          else setStatus('needsLogin');
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- auto-lock on background ---------- */

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const since = backgroundedAt.current;
        backgroundedAt.current = null;
        if (
          since != null &&
          Date.now() - since > LOCK_AFTER_MS &&
          statusRef.current === 'authenticated' &&
          hasPasscodeRef.current
        ) {
          lock();
        }
      }
    });
    return () => sub.remove();
  }, [lock]);

  /* ---------- actions ---------- */

  const setServerUrl = useCallback(async (url: string) => {
    const clean = normalizeBaseUrl(url);
    serverUrlRef.current = clean;
    setServerUrlState(clean);
    await storage.setServerUrl(clean);
  }, []);

  const signIn = useCallback(
    async (username: string, password: string): Promise<ActionResult> => {
      try {
        const res = await apiRef.current.login(username.trim(), password);
        const session: storage.StoredSession = {
          token: res.access_token,
          expiresAt: res.expires_at,
          user: res.user,
        };
        await storage.saveCredentials({ username: username.trim(), password });
        await storage.saveSession(session);
        applySession(session);
        return { ok: true };
      } catch (e) {
        const err = e as ApiError;
        if (err.status === 401) {
          return { ok: false, error: 'Invalid username or password.' };
        }
        return { ok: false, error: err.message };
      }
    },
    [applySession],
  );

  const setPasscode = useCallback(async (code: string) => {
    await storage.setPasscode(code);
    setHasPasscode(true);
  }, []);

  const unlockWithPasscode = useCallback(
    async (code: string): Promise<ActionResult> => {
      const valid = await storage.verifyPasscode(code);
      if (!valid) return { ok: false, error: 'Incorrect passcode.' };
      const r = await reauthenticate();
      if (!r.ok) {
        if (r.fatal) await doSignOut();
        return { ok: false, error: r.error };
      }
      return { ok: true };
    },
    [reauthenticate, doSignOut],
  );

  const unlockWithBiometric = useCallback(async (): Promise<ActionResult> => {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock SK-POS Support',
      cancelLabel: 'Use passcode',
    });
    if (!result.success) return { ok: false, error: 'Biometric check cancelled.' };
    const r = await reauthenticate();
    if (!r.ok) {
      if (r.fatal) await doSignOut();
      return { ok: false, error: r.error };
    }
    return { ok: true };
  }, [reauthenticate, doSignOut]);

  const enableBiometric = useCallback(async (): Promise<ActionResult> => {
    if (!biometricAvailable) {
      return { ok: false, error: 'No fingerprint or face is enrolled on this device.' };
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Confirm to enable biometric unlock',
    });
    if (!result.success) return { ok: false, error: 'Could not verify biometrics.' };
    await storage.setPrefs({ biometricEnabled: true });
    setBiometricEnabled(true);
    return { ok: true };
  }, [biometricAvailable]);

  const disableBiometric = useCallback(async () => {
    await storage.setPrefs({ biometricEnabled: false });
    setBiometricEnabled(false);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      serverUrl,
      lockedAccount,
      hasPasscode,
      biometricEnabled,
      biometricAvailable,
      api: apiRef.current,
      setServerUrl,
      signIn,
      setPasscode,
      unlockWithPasscode,
      unlockWithBiometric,
      enableBiometric,
      disableBiometric,
      lock,
      signOut: doSignOut,
    }),
    [
      status,
      user,
      serverUrl,
      lockedAccount,
      hasPasscode,
      biometricEnabled,
      biometricAvailable,
      setServerUrl,
      signIn,
      setPasscode,
      unlockWithPasscode,
      unlockWithBiometric,
      enableBiometric,
      disableBiometric,
      lock,
      doSignOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Convenience hook for screens that only need the API client. */
export function useApi(): Api {
  return useAuth().api;
}
