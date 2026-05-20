import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/lib/nav';

export default function AnalyticsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Analytics' }} />
    </Stack>
  );
}
