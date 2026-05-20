import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { Banner, Button, Field } from '@/components/ui/kit';
import { useAuth } from '@/lib/auth';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

const EMULATOR_URL = 'http://10.0.2.2:8000';

export default function LoginScreen() {
  const { serverUrl, setServerUrl, signIn } = useAuth();
  const router = useRouter();

  const [server, setServer] = useState(serverUrl);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    await setServerUrl(server);
    const result = await signIn(username, password);
    setBusy(false);
    if (result.ok) {
      router.replace('/set-passcode');
    } else {
      setError(result.error ?? 'Sign in failed.');
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.head}>
            <Brand size="lg" tagline="Internal field operations" />
          </View>

          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Use your SK-POS Care staff account. You&apos;ll set a quick passcode
            next.
          </Text>

          {error && (
            <View style={{ marginTop: spacing.md }}>
              <Banner message={error} />
            </View>
          )}

          <View style={styles.form}>
            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              placeholder="e.g. owner"
              autoCapitalize="none"
              autoCorrect={false}
              required
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              secureTextEntry
              autoCapitalize="none"
              required
            />

            <Pressable
              style={styles.serverToggle}
              onPress={() => setShowServer((s) => !s)}
            >
              <Ionicons
                name={showServer ? 'chevron-down' : 'chevron-forward'}
                size={15}
                color={colors.inkSubtle}
              />
              <Text style={styles.serverToggleText}>Backend server</Text>
              <Text style={styles.serverUrlPreview} numberOfLines={1}>
                {server}
              </Text>
            </Pressable>

            {showServer && (
              <View style={styles.serverBox}>
                <Field
                  label="Server URL"
                  value={server}
                  onChangeText={setServer}
                  placeholder="http://10.0.2.2:8000"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  hint="Android emulator: 10.0.2.2 · Physical phone: your computer's LAN IP"
                />
                <Pressable
                  style={styles.preset}
                  onPress={() => setServer(EMULATOR_URL)}
                >
                  <Ionicons name="phone-portrait-outline" size={14} color={colors.ink} />
                  <Text style={styles.presetText}>Use emulator address</Text>
                </Pressable>
              </View>
            )}

            <Button title="Sign in" onPress={submit} loading={busy} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { padding: spacing.xl, paddingTop: spacing.xxxl, gap: spacing.xs },
  head: { marginBottom: spacing.xxxl },
  title: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.ink },
  subtitle: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    marginTop: 4,
    lineHeight: 20,
  },
  form: { marginTop: spacing.xl, gap: spacing.lg },
  serverToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serverToggleText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkMuted },
  serverUrlPreview: {
    flex: 1,
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    textAlign: 'right',
  },
  serverBox: {
    gap: spacing.md,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
  },
  presetText: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
});
