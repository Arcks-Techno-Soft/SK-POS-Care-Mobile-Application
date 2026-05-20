import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/lib/nav';

export default function MoreLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="users" options={{ title: 'Staff accounts' }} />
      <Stack.Screen name="sub-engineers" options={{ title: 'Sub-engineer roster' }} />
    </Stack>
  );
}
