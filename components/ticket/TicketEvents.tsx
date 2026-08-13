/** Activity — a vertical timeline of ticket events. */

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Section } from '@/components/ui/Section';
import { Banner } from '@/components/ui/kit';
import { useApi } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { prettyEnum } from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { TicketDetail, TicketEvent } from '@/lib/types';

interface Props {
  reference: string;
  ticket: TicketDetail;
  reload: () => void;
}

export default function TicketEvents({ reference }: Props) {
  const api = useApi();
  const eventsQuery = useQuery<TicketEvent[]>(
    () => api.ticketEvents(reference),
    [reference],
  );

  // Newest first.
  const events = [...(eventsQuery.data ?? [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <Section title="Activity">
      <View style={styles.body}>
        {eventsQuery.loading && !eventsQuery.data ? (
          <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.md }} />
        ) : eventsQuery.error && !eventsQuery.data ? (
          <Banner message={eventsQuery.error} />
        ) : events.length === 0 ? (
          <Text style={styles.empty}>No activity yet.</Text>
        ) : (
          events.map((event, i) => (
            <View key={event.id} style={styles.row}>
              {/* Timeline rail */}
              <View style={styles.rail}>
                <View style={styles.dot} />
                {i < events.length - 1 && <View style={styles.line} />}
              </View>
              {/* Event content */}
              <View style={styles.content}>
                <Text style={styles.eventType}>
                  {prettyEnum(event.event_type)}
                </Text>
                <Text style={styles.meta}>
                  {event.actor?.name ?? 'System'} · {timeAgo(event.created_at)}
                </Text>
                {event.from_status && event.to_status && (
                  <Text style={styles.transition}>
                    {prettyEnum(event.from_status)} → {prettyEnum(event.to_status)}
                  </Text>
                )}
                {typeof event.payload?.reason === 'string' && !!event.payload.reason && (
                  <Text style={styles.note}>{event.payload.reason}</Text>
                )}
                {!!event.note && <Text style={styles.note}>{event.note}</Text>}
              </View>
            </View>
          ))
        )}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: 0 },
  empty: { fontSize: fontSize.sm, color: colors.inkSubtle, paddingVertical: spacing.xs },

  row: { flexDirection: 'row', gap: spacing.md },
  rail: { width: 12, alignItems: 'center' },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ink,
    marginTop: 4,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: colors.line,
    marginTop: 2,
  },
  content: { flex: 1, paddingBottom: spacing.lg },
  eventType: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  meta: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 2 },
  transition: {
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    fontWeight: '600',
    marginTop: 3,
  },
  note: { fontSize: fontSize.sm, color: colors.inkSoft, marginTop: 4, lineHeight: 19 },
});
