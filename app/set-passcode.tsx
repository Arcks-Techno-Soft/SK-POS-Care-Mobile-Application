import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PasscodeKeypad } from '@/components/PasscodeKeypad';
import { Button } from '@/components/ui/kit';
import { useAuth } from '@/lib/auth';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Phase = 'create' | 'confirm' | 'biometric';

export default function SetPasscodeScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const isChange = params.mode === 'change';
  const { setPasscode, enableBiometric, biometricAvailable } = useAuth();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('create');
  const [first, setFirst] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    if (isChange) router.back();
    else router.replace('/tickets');
  };

  useEffect(() => {
    if (code.length !== 4) return;

    if (phase === 'create') {
      setFirst(code);
      setCode('');
      setError(null);
      setPhase('confirm');
      return;
    }

    // confirm
    if (code !== first) {
      setError('Those passcodes did not match. Start again.');
      setFirst('');
      setCode('');
      setPhase('create');
      return;
    }

    let cancelled = false;
    (async () => {
      setBusy(true);
      await setPasscode(code);
      if (cancelled) return;
      setBusy(false);
      if (!isChange && biometricAvailable) {
        setPhase('biometric');
      } else {
        if (isChange) Alert.alert('Passcode updated', 'Your new passcode is saved.');
        finish();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const onEnableBiometric = async () => {
    setBusy(true);
    const r = await enableBiometric();
    setBusy(false);
    if (!r.ok && r.error) Alert.alert('Biometric unlock', r.error);
    finish();
  };

  /* ---- biometric opt-in ---- */
  if (phase === 'biometric') {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.bioWrap}>
          <View style={styles.bioIcon}>
            <Ionicons name="finger-print" size={40} color={colors.ink} />
          </View>
          <Text style={styles.title}>Enable biometric unlock?</Text>
          <Text style={styles.subtitle}>
            Unlock SK-POS Care with your fingerprint or face. Your passcode still
            works as a backup.
          </Text>
          <View style={styles.bioActions}>
            <Button title="Enable biometrics" onPress={onEnableBiometric} loading={busy} />
            <Button title="Not now" variant="ghost" onPress={finish} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  /* ---- create / confirm ---- */
  const creating = phase === 'create';
  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.topBar}>
        {isChange ? (
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.inkMuted} />
          </Pressable>
        ) : (
          <View style={{ width: 26 }} />
        )}
        {!isChange && (
          <Pressable onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.middle}>
        <View style={styles.lockIcon}>
          <Ionicons name="lock-closed" size={26} color={colors.ink} />
        </View>
        <Text style={styles.title}>
          {creating
            ? isChange
              ? 'New passcode'
              : 'Create a passcode'
            : 'Confirm passcode'}
        </Text>
        <Text style={[styles.subtitle, !!error && { color: colors.danger }]}>
          {error ??
            (creating
              ? 'Pick a 4-digit code to unlock the app quickly.'
              : 'Enter the same 4 digits again.')}
        </Text>

        <View style={{ marginTop: spacing.xxxl }}>
          <PasscodeKeypad value={code} onChange={setCode} error={!!error} disabled={busy} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  skip: { fontSize: fontSize.md, fontWeight: '600', color: colors.inkMuted },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    lineHeight: 20,
  },
  bioWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  bioIcon: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  bioActions: { alignSelf: 'stretch', marginTop: spacing.xxxl, gap: spacing.sm },
});
