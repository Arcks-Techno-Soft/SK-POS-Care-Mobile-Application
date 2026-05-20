/**
 * On-device persistence.
 *
 * Sensitive values (credentials, passcode hash, JWT) live in expo-secure-store,
 * which is backed by the Android Keystore. Non-sensitive values (server URL,
 * UI prefs) live in AsyncStorage.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import type { User } from './types';

const SECURE = {
  credentials: 'sk_credentials',
  passcode: 'sk_passcode',
  session: 'sk_session',
};

const PLAIN = {
  serverUrl: 'sk_server_url',
  prefs: 'sk_prefs',
};

export interface Credentials {
  username: string;
  password: string;
}

export interface StoredSession {
  token: string;
  expiresAt: string;
  user: User;
}

interface StoredPasscode {
  hash: string;
  salt: string;
}

export interface Prefs {
  biometricEnabled: boolean;
}

const DEFAULT_PREFS: Prefs = { biometricEnabled: false };

/* ---------- credentials ---------- */

export async function saveCredentials(c: Credentials): Promise<void> {
  await SecureStore.setItemAsync(SECURE.credentials, JSON.stringify(c));
}

export async function getCredentials(): Promise<Credentials | null> {
  const raw = await SecureStore.getItemAsync(SECURE.credentials);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Credentials;
  } catch {
    return null;
  }
}

/* ---------- passcode ---------- */

async function hashPasscode(code: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${salt}::${code}`,
  );
}

export async function setPasscode(code: string): Promise<void> {
  const salt = Crypto.randomUUID();
  const hash = await hashPasscode(code, salt);
  const payload: StoredPasscode = { hash, salt };
  await SecureStore.setItemAsync(SECURE.passcode, JSON.stringify(payload));
}

export async function hasPasscode(): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(SECURE.passcode);
  return !!raw;
}

export async function verifyPasscode(code: string): Promise<boolean> {
  const raw = await SecureStore.getItemAsync(SECURE.passcode);
  if (!raw) return false;
  try {
    const stored = JSON.parse(raw) as StoredPasscode;
    const hash = await hashPasscode(code, stored.salt);
    return hash === stored.hash;
  } catch {
    return false;
  }
}

export async function clearPasscode(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE.passcode);
}

/* ---------- cached session (JWT) ---------- */

export async function saveSession(s: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SECURE.session, JSON.stringify(s));
}

export async function getSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SECURE.session);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SECURE.session);
}

/* ---------- server URL ---------- */

export async function getServerUrl(): Promise<string | null> {
  return AsyncStorage.getItem(PLAIN.serverUrl);
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(PLAIN.serverUrl, url);
}

/* ---------- prefs ---------- */

export async function getPrefs(): Promise<Prefs> {
  const raw = await AsyncStorage.getItem(PLAIN.prefs);
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export async function setPrefs(p: Prefs): Promise<void> {
  await AsyncStorage.setItem(PLAIN.prefs, JSON.stringify(p));
}

/* ---------- full wipe (sign out) ---------- */

/** Removes the account entirely. The saved server URL is kept for convenience. */
export async function wipeAccount(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(SECURE.credentials),
    SecureStore.deleteItemAsync(SECURE.passcode),
    SecureStore.deleteItemAsync(SECURE.session),
    AsyncStorage.removeItem(PLAIN.prefs),
  ]);
}
