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
import { Badge, Card, Chip, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { useApi, useAuth } from '@/lib/auth';
import { dateOnlyRelative, formatDateOnly, timeAgo } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { INSTALLATION_STATUSES, prettyEnum } from '@/lib/options';
import { colors, fontSize, spacing, statusTone } from '@/lib/theme';
import type { InstallationListItem } from '@/lib/types';

const PAGE = 25;
const DATE_OPTIONS = [
  { label: 'Any time', value: '0' },
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
];

export default function InstallationsListScreen() {
  const api = useApi();
  const router = useRouter();
  const { user } = useAuth();
  const isEngineer = user?.role === 'ENGINEER';

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState('ALL');
  const [days, setDays] = useState('0');

  const [items, setItems] = useState<InstallationListItem[]>([]);
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
        const res = await api.listInstallations({
          status: status === 'ALL' ? undefined : status,
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
    [api, status, debouncedSearch, days],
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
        placeholder="Search reference, business, contact, invoice…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {(['ALL', ...INSTALLATION_STATUSES] as string[]).map((s) => (
          <Chip
            key={s}
            label={s === 'ALL' ? 'All' : prettyEnum(s)}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </ScrollView>
      <Select
        value={days}
        onChange={setDays}
        sheetTitle="Created within"
        options={DATE_OPTIONS}
      />
      <Text style={styles.count}>
        {loading ? 'Loading…' : `${total} installation${total === 1 ? '' : 's'}`}
      </Text>
    </View>
  );

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: isEngineer ? 'My work' : 'Installations',
          // Any staff member can open an installation; engineer-opened ones
          // reach the admin queue tagged "Opened by <name>".
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(tabs)/installations/new')}
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
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <InstallationCard
            installation={item}
            onPress={() =>
              router.push({
                pathname: '/(tabs)/installations/[reference]',
                params: { reference: item.reference },
              })
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
                icon="construct-outline"
                title="No installations"
                subtitle="No installations match these filters."
              />
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator
              color={colors.inkMuted}
              style={{ marginVertical: spacing.lg }}
            />
          ) : null
        }
      />
    </View>
  );
}

function InstallationCard({
  installation,
  onPress,
}: {
  installation: InstallationListItem;
  onPress: () => void;
}) {
  return (
    <Card onPress={onPress} style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.ref}>{installation.reference}</Text>
        <Badge
          label={prettyEnum(installation.status)}
          tone={statusTone(installation.status)}
        />
      </View>
      <Text style={styles.business} numberOfLines={1}>
        {installation.business_name}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {installation.business_category}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {installation.contact_name} · {installation.phone}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        Invoice: <Text style={styles.mono}>{installation.invoice_number}</Text>
      </Text>
      {installation.expected_installation_date ? (
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={13} color={colors.inkSubtle} />
          <Text style={styles.meta} numberOfLines={1}>
            Expected {formatDateOnly(installation.expected_installation_date)}
            <Text style={styles.dateRel}>
              {' · '}
              {dateOnlyRelative(installation.expected_installation_date)}
            </Text>
          </Text>
        </View>
      ) : null}
      <View style={styles.cardBottom}>
        <View style={styles.assignRow}>
          <Ionicons
            name={
              installation.assigned_engineer ? 'person-circle-outline' : 'person-add-outline'
            }
            size={14}
            color={colors.inkSubtle}
          />
          <Text style={styles.assign}>
            {installation.assigned_engineer
              ? installation.assigned_engineer.name
              : 'Unassigned'}
          </Text>
          {installation.created_by && (
            <Text style={styles.openedBy} numberOfLines={1}>
              · Created by {installation.created_by.name}
            </Text>
          )}
        </View>
        <Text style={styles.time}>{timeAgo(installation.created_at)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceRaised },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  header: { gap: spacing.md, marginBottom: spacing.xs },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  count: { fontSize: fontSize.xs, color: colors.inkSubtle, fontWeight: '600' },
  placeholder: { paddingTop: spacing.xxxl * 2 },

  card: { gap: 3 },
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
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateRel: { color: colors.info, fontWeight: '600' },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceSunken,
  },
  assignRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  assign: { fontSize: fontSize.xs, color: colors.inkSubtle, fontWeight: '500' },
  openedBy: { flexShrink: 1, fontSize: fontSize.xs, color: colors.inkSubtle },
  time: { fontSize: fontSize.xs, color: colors.inkSubtle, marginLeft: spacing.sm },
});
