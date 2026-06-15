/**
 * "More" tab — account hub, security settings, server URL, workspace admin,
 * and sign-out. Visible to all roles; workspace section is owner-only.
 */

import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '@/components/Screen';
import { Avatar, Banner, Button, Divider } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { useAuth } from '@/lib/auth';
import { roleLabel } from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';

/* ---------- reusable tappable row ---------- */

function Row({
  label,
  sub,
  right,
  onPress,
  last = false,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, { opacity: pressed && onPress ? 0.6 : 1 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>{label}</Text>
          {!!sub && <Text style={styles.rowSub}>{sub}</Text>}
        </View>
        {right}
      </Pressable>
      {!last && <Divider />}
    </>
  );
}

/* ---------- main screen ---------- */

export default function MoreScreen() {
  const { user, biometricAvailable, biometricEnabled, enableBiometric, disableBiometric, lock, signOut, serverUrl, setServerUrl } = useAuth();
  const router = useRouter();

  const [bioError, setBioError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState(serverUrl);

  // Version line: marketing version + native build number identify the binary
  // they installed; the OTA update id identifies the JS bundle they've pulled
  // (so a stale bundle on the right binary is still distinguishable).
  const version = Constants.expoConfig?.version ?? '—';
  const build = Application.nativeBuildVersion ?? '—';
  const ota = Updates.isEmbeddedLaunch
    ? 'no OTA'
    : `update ${Updates.updateId?.slice(0, 7) ?? '—'}`;

  /* ---- server URL override (for staging/test backends) ---- */
  async function handleSaveServerUrl() {
    const next = urlInput.trim();
    if (!next) return;
    Alert.alert(
      'Switch server & sign out',
      `Point the app at:\n${next}\n\nYou'll be signed out and need to sign in again against this server.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: async () => {
            await setServerUrl(next);
            await signOut();
          },
        },
      ],
    );
  }

  /* ---- biometric toggle ---- */
  async function handleBioToggle(val: boolean) {
    setBioError(null);
    if (val) {
      const result = await enableBiometric();
      if (!result.ok) setBioError(result.error ?? 'Could not enable biometric.');
    } else {
      await disableBiometric();
    }
  }


  /* ---- sign out ---- */
  function handleSignOut() {
    Alert.alert(
      'Sign out',
      'Are you sure you want to sign out? You will need your credentials to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: signOut },
      ],
    );
  }

  return (
    <Screen scroll>
      {/* ---- User card ---- */}
      <View style={styles.userCard}>
        <Avatar name={user?.name ?? '?'} size={56} />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{user?.name ?? '—'}</Text>
          <Text style={styles.userRole}>{user ? roleLabel(user.role) : '—'}</Text>
          <Text style={styles.userMeta} numberOfLines={1}>@{user?.username ?? '—'}</Text>
          {!!user?.email && (
            <Text style={styles.userMeta} numberOfLines={1}>{user.email}</Text>
          )}
        </View>
      </View>

      {/* ---- Security ---- */}
      <Section title="Security" flush>
        <Row
          label="Change passcode"
          onPress={() => router.push({ pathname: '/set-passcode', params: { mode: 'change' } })}
          right={<Text style={styles.chevron}>›</Text>}
        />
        <Row
          label="Biometric unlock"
          sub={
            !biometricAvailable
              ? 'No fingerprint/face enrolled on this device'
              : undefined
          }
          right={
            <Switch
              value={biometricEnabled}
              onValueChange={handleBioToggle}
              disabled={!biometricAvailable}
              trackColor={{ true: colors.ink, false: colors.lineStrong }}
              thumbColor={colors.surface}
            />
          }
        />
        {!!bioError && (
          <View style={styles.bannerWrap}>
            <Banner message={bioError} tone="danger" />
          </View>
        )}
        <Row
          label="Lock now"
          last
          onPress={lock}
          right={<Text style={styles.chevron}>›</Text>}
        />
      </Section>

      {/* ---- Workspace (owner-only) ---- */}
      {user?.role === 'ADMIN' && (
        <Section title="Workspace" flush>
          <Row
            label="Staff accounts"
            sub="Manage managers and engineers"
            onPress={() => router.push('/(tabs)/more/users')}
            right={<Text style={styles.chevron}>›</Text>}
          />
          <Row
            label="Sub-engineer roster"
            sub="Manage on-call sub-engineer contacts"
            last
            onPress={() => router.push('/(tabs)/more/sub-engineers')}
            right={<Text style={styles.chevron}>›</Text>}
          />
        </Section>
      )}

      {/* ---- Advanced: server URL override ---- */}
      <Section title="Advanced" flush>
        <View style={styles.serverBox}>
          <Text style={styles.rowSub}>Server URL</Text>
          <TextInput
            value={urlInput}
            onChangeText={setUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://your-backend.onrender.com"
            placeholderTextColor={colors.inkFaint}
            style={styles.serverInput}
          />
          <Button title="Switch server & sign out" variant="secondary" onPress={handleSaveServerUrl} />
        </View>
      </Section>

      {/* ---- Sign out ---- */}
      <Button title="Sign out" variant="danger" onPress={handleSignOut} />

      {/* ---- Footer ---- */}
      <Text style={styles.footer}>
        SK-POS Support v{version} ({build}) · {ota}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  userInfo: { flex: 1, gap: 2 },
  userName: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  userRole: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkSubtle },
  userMeta: { fontSize: fontSize.sm, color: colors.inkFaint },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    minHeight: 52,
  },
  rowLabel: { fontSize: fontSize.md, color: colors.ink, fontWeight: '500' },
  rowSub: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.inkFaint, lineHeight: 26 },

  bannerWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },

  serverBox: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: spacing.sm },
  serverInput: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fontSize.sm,
    color: colors.ink,
    backgroundColor: colors.surface,
  },

  footer: {
    textAlign: 'center',
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    paddingVertical: spacing.sm,
  },
});
