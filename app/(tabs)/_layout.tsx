import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useAuth } from '@/lib/auth';
import { isAdminLevel } from '@/lib/options';
import { PendingTicketsProvider, usePendingTickets } from '@/lib/pending-tickets';
import { colors, fontSize } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <PendingTicketsProvider>
      <TabsInner />
    </PendingTicketsProvider>
  );
}

function TabsInner() {
  const { user } = useAuth();
  const { ticketCount, installCount } = usePendingTickets();
  // Analytics is available to Admins and Managers.
  const canViewAnalytics = isAdminLevel(user?.role) || user?.role === 'MANAGER';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.ink,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: fontSize.xs, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          // Engineer: assigned-not-accepted. Admin/Manager: unassigned.
          tabBarBadge: ticketCount > 0 ? ticketCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 11 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="construct-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="installations"
        options={{
          title: 'Installs',
          // Engineer: assigned-not-actioned. Admin/Manager: unassigned (NEW).
          tabBarBadge: installCount > 0 ? installCount : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.danger, color: '#fff', fontSize: 11 },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="cube-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          href: canViewAnalytics ? undefined : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="ellipsis-horizontal-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
