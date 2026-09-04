import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyState, ErrorView } from '@/components/States';
import AdminTicketActionModals, {
  type AdminActionMode,
} from '@/components/ticket/AdminTicketActionModals';
import { Badge, Card, Chip, Field } from '@/components/ui/kit';
import { Select, toOptions } from '@/components/ui/Select';
import { useApi, useAuth } from '@/lib/auth';
import { useDebounced } from '@/lib/hooks';
import { timeAgo } from '@/lib/format';
import {
  isAdminLevel,
  isSuperAdmin,
  prettyEnum,
  SEVERITIES,
  TICKET_STATUSES,
} from '@/lib/options';
import { colors, fontSize, severityTone, spacing, statusTone, warrantyTone } from '@/lib/theme';
import type { TicketListItem } from '@/lib/types';

const PAGE = 25;
const DATE_OPTIONS = [
  { label: 'Any time', value: '0' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

export default function TicketsListScreen() {
  const api = useApi();
  const router = useRouter();
  const { user } = useAuth();
  const isEngineer = user?.role === 'ENGINEER';
  // Quick close is Admin-level since 2026-09-04; quick delete stays a reserved
  // Super Admin power.
  const canForceClose = isAdminLevel(user?.role);
  const canDelete = isSuperAdmin(user?.role);
  // Quick close/delete — actionRef is the row being acted on.
  const [actionRef, setActionRef] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<AdminActionMode>(null);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState('ALL');
  const [severity, setSeverity] = useState('ALL');
  const [days, setDays] = useState('0');

  const [items, setItems] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number, mode: 'replace' | 'append' | 'refresh') => {
      if (mode === 'replace') setLoading(true);
      if (mode === 'append') setLoadingMore(true);
      if (mode === 'refresh') setRefreshing(true);
      setError(null);
      try {
        const res = await api.listTickets({
          status: status === 'ALL' ? undefined : status,
          severity: severity === 'ALL' ? undefined : severity,
          search: debouncedSearch.trim() || undefined,
          created_within_days: days === '0' ? undefined : Number(days),
          limit: PAGE,
          offset,
        });
        setTotal(res.total);
        setItems((prev) => (mode === 'append' ? [...prev, ...res.items] : res.items));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [api, status, severity, debouncedSearch, days],
  );

  useEffect(() => {
    fetchPage(0, 'replace');
  }, [fetchPage]);

  const loadMore = () => {
    if (loadingMore || loading || items.length >= total) return;
    fetchPage(items.length, 'append');
  };

  const header = (
    <View style={styles.header}>
      <Field
        value={search}
        onChangeText={setSearch}
        placeholder="Search reference, business, serial…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {['ALL', ...TICKET_STATUSES].map((s) => (
          <Chip
            key={s}
            label={s === 'ALL' ? 'All' : prettyEnum(s)}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </ScrollView>
      <View style={styles.filterRow}>
        <View style={{ flex: 1 }}>
          <Select
            value={severity}
            onChange={setSeverity}
            sheetTitle="Severity"
            options={[
              { label: 'Any severity', value: 'ALL' },
              ...toOptions(SEVERITIES).map((o) => ({ ...o, label: prettyEnum(o.value) })),
            ]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Select
            value={days}
            onChange={setDays}
            sheetTitle="Created within"
            options={DATE_OPTIONS}
          />
        </View>
      </View>
      <Text style={styles.count}>
        {loading ? 'Loading…' : `${total} ticket${total === 1 ? '' : 's'}`}
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: isEngineer ? 'My work' : 'Tickets',
          // Any staff member can open a ticket; engineer-opened ones reach the
          // admin inbox tagged "Opened by <name>".
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(tabs)/tickets/new')}
              hitSlop={10}
              style={{ marginRight: 4 }}
            >
              <Ionicons name="add" size={26} color={colors.ink} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={items}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => (
          <TicketCard
            ticket={item}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/tickets/[reference]',
                params: { reference: item.reference },
              })
            }
            admin={
              canForceClose
                ? {
                    onClose: () => {
                      setActionRef(item.reference);
                      setActionMode('close');
                    },
                    onDelete: canDelete
                      ? () => {
                          setActionRef(item.reference);
                          setActionMode('delete');
                        }
                      : undefined,
                  }
                : undefined
            }
          />
        )}
        ListHeaderComponent={header}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => fetchPage(0, 'refresh')}
            tintColor={colors.inkMuted}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          loading ? (
            <View style={styles.placeholder}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : error ? (
            <View style={styles.placeholder}>
              <ErrorView message={error} onRetry={() => fetchPage(0, 'replace')} />
            </View>
          ) : (
            <View style={styles.placeholder}>
              <EmptyState
                icon="checkmark-done-circle-outline"
                title="No tickets"
                subtitle={
                  isEngineer
                    ? 'Nothing is assigned to you right now.'
                    : 'No tickets match these filters.'
                }
              />
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.lg }} />
          ) : null
        }
      />

      {canForceClose && actionRef && (
        <AdminTicketActionModals
          reference={actionRef}
          mode={actionMode}
          onClose={() => setActionMode(null)}
          onChanged={() => {
            setActionMode(null);
            fetchPage(0, 'refresh');
          }}
          onDeleted={() => {
            setActionMode(null);
            fetchPage(0, 'refresh');
          }}
        />
      )}
    </View>
  );
}

function TicketCard({
  ticket,
  onPress,
  admin,
}: {
  ticket: TicketListItem;
  onPress: () => void;
  // onDelete is absent for a plain Admin: force-close without soft-delete.
  admin?: { onClose: () => void; onDelete?: () => void };
}) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.ref}>{ticket.reference}</Text>
        <View style={styles.cardBadges}>
          {/* Hold sits NEXT TO the status badge — a held ticket still has a
              real workflow status worth showing. */}
          {ticket.on_hold && <Badge label="On hold" tone="warn" />}
          <Badge label={prettyEnum(ticket.status)} tone={statusTone(ticket.status)} />
        </View>
      </View>
      <Text style={styles.business} numberOfLines={1}>
        {ticket.business_name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {ticket.city}, {ticket.state}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {ticket.product_category} · <Text style={styles.mono}>{ticket.serial_number}</Text>
      </Text>
      <Text style={styles.issue} numberOfLines={1}>
        {ticket.issue_category}
      </Text>
      <View style={styles.cardBottom}>
        <View style={styles.badgeRow}>
          {/* A held ticket trades its severity badge for WHY it is parked:
              nobody is working it, so how urgent it would be matters less
              than what is blocking it. The "On hold" badge stays up top. */}
          {ticket.on_hold ? (
            <Text style={styles.holdReason} numberOfLines={2}>
              {ticket.hold_reason?.trim() || 'On hold — no reason given'}
            </Text>
          ) : (
            <Badge label={prettyEnum(ticket.severity)} tone={severityTone(ticket.severity)} />
          )}
          {ticket.warranty_status !== 'UNKNOWN' && (
            <Badge
              label={prettyEnum(ticket.warranty_status)}
              tone={warrantyTone(ticket.warranty_status)}
            />
          )}
        </View>
        <Text style={styles.time}>{timeAgo(ticket.created_at)}</Text>
      </View>
      <View style={styles.assignRow}>
        <Ionicons
          name={ticket.assigned_engineer ? 'person-circle-outline' : 'person-add-outline'}
          size={14}
          color={colors.inkSubtle}
        />
        <Text style={styles.assign}>
          {ticket.assigned_engineer ? ticket.assigned_engineer.name : 'Unassigned'}
        </Text>
        {ticket.raised_by ? (
          <Text style={styles.openedBy} numberOfLines={1}>
            · Created by {ticket.raised_by.name}
          </Text>
        ) : (
          <Text style={styles.openedBy} numberOfLines={1}>
            · Raised by customer — {ticket.contact_name}
            {ticket.contact_person_profile ? ` — ${ticket.contact_person_profile}` : ''}
          </Text>
        )}
      </View>

      {admin && (
        <View style={styles.adminRow}>
          {ticket.status !== 'CLOSED' && (
            <Pressable hitSlop={6} onPress={admin.onClose}>
              <Text style={styles.adminAction}>Close</Text>
            </Pressable>
          )}
          {admin.onDelete && (
            <Pressable hitSlop={6} onPress={admin.onDelete}>
              <Text style={styles.adminAction}>Delete</Text>
            </Pressable>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceRaised },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  filterRow: { flexDirection: 'row', gap: spacing.sm },
  count: { fontSize: fontSize.xs, color: colors.inkSubtle, fontWeight: '600' },
  adminRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  adminAction: { fontSize: fontSize.sm, fontWeight: '600', color: colors.danger },
  placeholder: { paddingTop: spacing.xxxl * 2 },

  card: { gap: 3 },
  cardBadges: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  ref: {
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.ink,
  },
  business: { fontSize: fontSize.lg, fontWeight: '600', color: colors.ink, marginTop: 2 },
  meta: { fontSize: fontSize.sm, color: colors.inkSubtle },
  mono: { fontFamily: 'monospace' },
  issue: { fontSize: fontSize.sm, color: colors.inkMuted },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  // flexShrink so a long hold reason wraps/clips instead of pushing the
  // timestamp off the card.
  badgeRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexShrink: 1 },
  // Two lines: one clipped "Customer not ready to pay th…" is worse than a
  // second line. Still capped so the card can't grow without bound.
  holdReason: { fontSize: fontSize.xs, color: colors.warn, flexShrink: 1, lineHeight: 15 },
  time: { fontSize: fontSize.xs, color: colors.inkSubtle },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSunken,
  },
  assign: { fontSize: fontSize.xs, color: colors.inkSubtle, fontWeight: '500' },
  openedBy: { flex: 1, fontSize: fontSize.xs, color: colors.inkSubtle },
});
