import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { PasscodeKeypad } from '@/components/PasscodeKeypad';
import { useAuth } from '@/lib/auth';
import { colors, fontSize, spacing } from '@/lib/theme';

export default function LockScreen() {
  const {
    lockedAccount,
    biometricEnabled,
    unlockWithPasscode,
    unlockWithBiometric,
    signOut,
  } = useAuth();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tryBiometric = useCallback(async () => {
    setBusy(true);
    const r = await unlockWithBiometric();
    setBusy(false);
    if (!r.ok && r.error && r.error !== 'Biometric check cancelled.') {
      setError(r.error);
    }
  }, [unlockWithBiometric]);

  // Offer biometrics immediately when enabled.
  useEffect(() => {
    if (biometricEnabled) tryBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verify once four digits are entered.
  useEffect(() => {
    if (code.length !== 4) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      const r = await unlockWithPasscode(code);
      if (cancelled) return;
      setBusy(false);
      if (!r.ok) {
        setError(r.error ?? 'Incorrect passcode.');
        setCode('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, unlockWithPasscode]);

  const confirmSignOut = () => {
    Alert.alert(
      'Sign out',
      'This removes the account from this device. You will need your username and password to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
      ],
    );
  };

  const firstName = (lockedAccount?.name ?? '').split(/\s+/)[0];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.top}>
        <Brand size="sm" />
      </View>

      <View style={styles.middle}>
        <Text style={styles.title}>
          {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        </Text>
        <Text style={styles.subtitle}>
          {error ?? 'Enter your passcode to unlock'}
        </Text>

        <View style={{ marginTop: spacing.xxxl }}>
          <PasscodeKeypad
            value={code}
            onChange={(v) => {
              setError(null);
              setCode(v);
            }}
            onBiometric={biometricEnabled ? tryBiometric : undefined}
            error={!!error}
            disabled={busy}
          />
        </View>
      </View>

      <Pressable style={styles.bottom} onPress={confirmSignOut} hitSlop={10}>
        <Text style={styles.signOut}>Not you? Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    marginTop: 6,
    textAlign: 'center',
  },
  bottom: { alignItems: 'center', paddingVertical: spacing.xl },
  signOut: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkMuted },
});
