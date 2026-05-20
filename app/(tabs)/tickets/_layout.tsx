import { Stack } from 'expo-router';

import { stackScreenOptions } from '@/lib/nav';

export default function TicketsLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ title: 'Tickets' }} />
      <Stack.Screen name="[reference]" options={{ title: 'Ticket' }} />
    </Stack>
  );
}
