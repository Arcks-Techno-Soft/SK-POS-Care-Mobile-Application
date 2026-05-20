import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/lib/nav';

export default function InstallationsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Installations' }} />
      <Stack.Screen name="new" options={{ title: 'New installation' }} />
      <Stack.Screen name="[reference]" options={{ title: 'Installation' }} />
    </Stack>
  );
}
