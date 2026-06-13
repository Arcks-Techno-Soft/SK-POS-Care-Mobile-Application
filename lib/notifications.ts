/**
 * Push notifications — Expo token registration + foreground display + badge.
 *
 * Flow:
 *   - After login, `registerForPush` asks permission, gets the device's Expo
 *     push token, and sends it to the backend (POST /admin/push/register).
 *   - The backend pushes to these tokens when a ticket is raised (owners/
 *     managers) or assigned (the engineer).
 *   - On logout, `unregisterForPush` removes the token so a signed-out device
 *     stops receiving alerts.
 *
 * All functions are best-effort: a failure here never blocks login/logout.
 * Remote push requires a real device + a development/production build (it does
 * NOT work in Expo Go on Android, and Android also needs FCM configured).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Api } from './api';

// Remember the token so we can unregister it on logout without re-prompting.
let cachedToken: string | null = null;

/** Show a banner + play sound + bump badge even when the app is foregrounded. */
export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#000000',
  });
}

function getProjectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

/** Request permission and return this device's Expo push token, or null. */
export async function getExpoPushToken(): Promise<string | null> {
  // Simulators/emulators can't receive a real push token.
  if (!Device.isDevice) {
    console.log('[push] not a physical device — no token');
    return null;
  }

  await ensureAndroidChannel();

  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted || current.status === 'granted';
  if (!granted) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted || req.status === 'granted';
  }
  if (!granted) {
    console.log('[push] notification permission NOT granted');
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.log('[push] no EAS projectId found in config');
    return null;
  }

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  cachedToken = data;
  return data;
}

/** Get the token and register it with the backend for the logged-in user. */
export async function registerForPush(api: Api): Promise<void> {
  try {
    const token = await getExpoPushToken();
    if (!token) return;
    await api.registerPushToken(token, Platform.OS);
  } catch {
    // best-effort — never block the session
  }
}

/** Remove this device's token from the backend (called on logout). */
export async function unregisterForPush(api: Api): Promise<void> {
  try {
    const token = cachedToken ?? (await getExpoPushToken());
    if (!token) return;
    await api.unregisterPushToken(token);
    cachedToken = null;
  } catch {
    // ignore
  }
}

/** Reset the app-icon badge (e.g. when the user opens the app). */
export async function clearBadge(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // ignore
  }
}
