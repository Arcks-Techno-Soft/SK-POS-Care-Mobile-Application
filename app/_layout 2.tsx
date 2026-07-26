import 'react-native-reanimated';

import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { UpdateBanner } from '@/components/UpdateBanner';
import { AuthProvider, useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { OtaUpdatesProvider } from '@/lib/updates';

/** Watches auth status and keeps the user on a route they're allowed to see. */
function RootNavigator() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const root = segments[0] as string | undefined;

    if (status === 'needsLogin') {
      if (root !== 'login') router.replace('/login');
    } else if (status === 'locked') {
      if (root !== 'lock') router.replace('/lock');
    } else {
      // authenticated — allow the app and the passcode-setup screen
      if (root === 'login' || root === 'lock' || root == null) {
        router.replace('/tickets');
      }
    }
  }, [status, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="lock" />
      <Stack.Screen name="set-passcode" />
      <Stack.Screen name="r/[reference]" />
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <OtaUpdatesProvider>
            <AuthProvider>
              <StatusBar style="dark" />
              <View style={{ flex: 1 }}>
                <RootNavigator />
                <UpdateBanner />
              </View>
            </AuthProvider>
          </OtaUpdatesProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
