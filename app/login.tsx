import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand } from '@/components/Brand';
import { Banner, Button, Field } from '@/components/ui/kit';
import { useAuth } from '@/lib/auth';
import { colors, fontSize, spacing } from '@/lib/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    setError(null);
    // Server URL is fixed to the production backend by lib/auth.tsx
    // (DEFAULT_SERVER_URL). Override path lives in the More tab for
    // debugging — end users never touch it here.
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
            Use your SK-POS Support staff account. You&apos;ll set a quick passcode
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
});
