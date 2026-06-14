/**
 * Analytics dashboard — Admin only.
 * Shows KPI cards, status/severity breakdowns, per-day series, issue/product
 * breakdowns, and engineer performance. All data from GET /admin/analytics.
 */

import { Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { EmptyState, ErrorView, Loading } from '@/components/States';
import { Avatar, Badge, Card, Divider, SectionTitle } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { Section } from '@/components/ui/Section';
import { useApi, useAuth } from '@/lib/auth';
import { formatHours } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { colors, fontSize, radius, spacing, toneStyles } from '@/lib/theme';
import type { Analytics, EngineerPerf, IssueBreakdownRow, ProductBreakdownRow } from '@/lib/types';

/* ---------- day options ---------- */

const DAY_OPTIONS = [
  { label: 'Last 7 days', value: '7' },
  { label: 'Last 30 days', value: '30' },
  { label: 'Last 90 days', value: '90' },
  { label: 'Last 365 days', value: '365' },
];

/* ---------- KPI card ---------- */

function KpiCard({ label, value, sub, tone = 'neutral' }: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
}) {
  const t = toneStyles[tone];
  return (
    <Card style={styles.kpiCard}>
      <Text style={[styles.kpiValue, { color: t.fg }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
      {!!sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </Card>
  );
}

/* ---------- horizontal bar row ---------- */

function BarRow({ label, value, max, tone = 'info' }: {
  label: string;
  value: number;
  max: number;
  tone?: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const t = toneStyles[tone];
  return (
    <View style={styles.barRow}>
      <View style={styles.barLabelRow}>
        <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
        <Text style={[styles.barValue, { color: t.fg }]}>{value}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: t.fg }]} />
      </View>
    </View>
  );
}

/* ---------- per-day mini chart (text-based) ---------- */

function DaySeries({ data }: { data: Analytics['tickets_per_day'] }) {
  if (!data?.length) return null;
  const last14 = data.slice(-14);
  const maxVal = Math.max(...last14.map((d) => Math.max(d.created ?? 0, d.resolved ?? 0)), 1);

  return (
    <View style={styles.daySeries}>
      {last14.map((point) => {
        const createdH = Math.max(0, ((point.created ?? 0) / maxVal) * 48);
        const resolvedH = Math.max(0, ((point.resolved ?? 0) / maxVal) * 48);
        const label = point.date?.slice(5) ?? ''; // MM-DD
        return (
          <View key={point.date} style={styles.dayCol}>
            <View style={styles.dayBars}>
              <View style={[styles.dayBar, styles.dayBarCreated, { height: createdH }]} />
              <View style={[styles.dayBar, styles.dayBarResolved, { height: resolvedH }]} />
            </View>
            <Text style={styles.dayLabel}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/* ---------- engineer performance row ---------- */

function EngineerRow({ eng }: { eng: EngineerPerf }) {
  return (
    <View style={styles.engRow}>
      <Avatar name={eng.name ?? '?'} size={38} />
      <View style={styles.engInfo}>
        <Text style={styles.engName} numberOfLines={1}>{eng.name ?? '—'}</Text>
        <Text style={styles.engMeta}>
          {eng.assigned ?? 0} assigned · {eng.resolved ?? 0} resolved
        </Text>
      </View>
      <View style={styles.engStats}>
        <Text style={styles.engRate}>{(eng.completion_rate ?? 0).toFixed(1)}%</Text>
        <Text style={styles.engHours}>{formatHours(eng.avg_hours ?? 0)}</Text>
      </View>
    </View>
  );
}

/* ---------- main screen ---------- */

export default function AnalyticsScreen() {
  const { user } = useAuth();
  const api = useApi();
  const [days, setDays] = useState('30');

  const { data, loading, refreshing, error, refresh } = useQuery<Analytics>(
    () => api.analytics(Number(days)),
    [days],
  );

  if (user?.role !== 'ADMIN') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Analytics' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="Admins only"
          subtitle="The analytics dashboard is only available to owners."
        />
      </Screen>
    );
  }

  const kpis = data?.kpis;
  const byStatus = data?.by_status ?? {};
  const bySeverity = data?.by_severity ?? {};
  const maxStatus = Math.max(...Object.values(byStatus), 1);
  const maxSeverity = Math.max(...Object.values(bySeverity), 1);

  const statusToneMap: Record<string, 'neutral' | 'info' | 'success' | 'warn' | 'danger'> = {
    OPEN: 'warn',
    ACKNOWLEDGED: 'info',
    ASSIGNED: 'info',
    ACCEPTED: 'info',
    RESOLVING: 'info',
    RESOLVED: 'success',
    CLOSED: 'neutral',
  };
  const severityToneMap: Record<string, 'neutral' | 'info' | 'success' | 'warn' | 'danger'> = {
    LOW: 'neutral',
    MEDIUM: 'info',
    HIGH: 'warn',
    CRITICAL: 'danger',
  };

  return (
    <Screen scroll refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: 'Analytics' }} />

      {/* Days picker */}
      <Select
        label="Period"
        value={days}
        options={DAY_OPTIONS}
        onChange={setDays}
        sheetTitle="Select period"
      />

      {loading && !data ? (
        <Loading label="Loading analytics…" />
      ) : error && !data ? (
        <ErrorView message={error} onRetry={refresh} />
      ) : (
        <>
          {/* KPI cards */}
          <SectionTitle>Overview — all time</SectionTitle>
          <View style={styles.kpiGrid}>
            <KpiCard label="Total" value={kpis?.total_tickets ?? 0} />
            <KpiCard label="Open" value={kpis?.open_tickets ?? 0} tone="warn" />
            <KpiCard label="Resolved" value={kpis?.resolved_tickets ?? 0} tone="success" />
            <KpiCard label="Closed" value={kpis?.closed_tickets ?? 0} tone="neutral" />
          </View>

          <SectionTitle>Last {days} days</SectionTitle>
          <View style={styles.kpiGrid}>
            <KpiCard
              label="Created"
              value={kpis?.window_tickets ?? 0}
              tone="info"
            />
            <KpiCard
              label="Resolved"
              value={kpis?.window_resolved ?? 0}
              tone="success"
            />
            <KpiCard
              label="Avg resolution"
              value={formatHours(kpis?.avg_resolution_hours)}
              tone="neutral"
            />
          </View>

          {/* Status breakdown */}
          <Section title="By status" subtitle="All tickets">
            {Object.keys(byStatus).length === 0 ? (
              <Text style={styles.empty}>No data</Text>
            ) : (
              Object.entries(byStatus)
                .sort(([, a], [, b]) => b - a)
                .map(([status, count]) => (
                  <BarRow
                    key={status}
                    label={status.replace(/_/g, ' ')}
                    value={count}
                    max={maxStatus}
                    tone={statusToneMap[status] ?? 'neutral'}
                  />
                ))
            )}
          </Section>

          {/* Severity breakdown */}
          <Section title="By severity" subtitle={`Last ${days} days`}>
            {Object.keys(bySeverity).length === 0 ? (
              <Text style={styles.empty}>No data</Text>
            ) : (
              (['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const).map((sev) => {
                const count = bySeverity[sev];
                if (count == null) return null;
                return (
                  <BarRow
                    key={sev}
                    label={sev}
                    value={count}
                    max={maxSeverity}
                    tone={severityToneMap[sev] ?? 'neutral'}
                  />
                );
              })
            )}
          </Section>

          {/* Tickets per day */}
          {(data?.tickets_per_day?.length ?? 0) > 0 && (
            <Section
              title="Tickets per day"
              subtitle={`Last 14 of ${days} days — dark=created, light=resolved`}
            >
              <DaySeries data={data!.tickets_per_day} />
            </Section>
          )}

          {/* Issue breakdown */}
          {(data?.issue_breakdown?.length ?? 0) > 0 && (
            <Section title="By issue category" subtitle="Resolved tickets, sorted by avg resolution time">
              {data!.issue_breakdown.map((row: IssueBreakdownRow, idx) => (
                <View key={row.issue_category}>
                  {idx > 0 && <Divider />}
                  <View style={styles.issueRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.issueCategory} numberOfLines={1}>
                        {row.issue_category ?? '—'}
                      </Text>
                      <Text style={styles.issueSub}>
                        {row.resolved_count ?? 0} resolved
                      </Text>
                    </View>
                    <Text style={styles.issueHours}>{formatHours(row.avg_hours)}</Text>
                  </View>
                </View>
              ))}
            </Section>
          )}

          {/* Product breakdown */}
          {(data?.product_breakdown?.length ?? 0) > 0 && (
            <Section title="By product category" subtitle="All tickets, sorted by volume">
              {data!.product_breakdown.map((row: ProductBreakdownRow, idx) => (
                <View key={row.product_category}>
                  {idx > 0 && <Divider />}
                  <View style={styles.productRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.productName} numberOfLines={1}>
                        {row.product_category ?? '—'}
                      </Text>
                      <Text style={styles.productSub}>
                        {row.resolved ?? 0}/{row.total ?? 0} resolved
                      </Text>
                    </View>
                    <View style={styles.productRight}>
                      <Badge label={String(row.total ?? 0)} tone="neutral" />
                      <Text style={styles.productHours}>{formatHours(row.avg_hours)}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </Section>
          )}

          {/* Engineer performance */}
          {(data?.engineer_performance?.length ?? 0) > 0 && (
            <Section
              title="Engineer performance"
              subtitle="All tickets — % complete · avg resolution"
            >
              {data!.engineer_performance.map((eng: EngineerPerf, idx) => (
                <View key={eng.engineer_id}>
                  {idx > 0 && <Divider />}
                  <EngineerRow eng={eng} />
                </View>
              ))}
            </Section>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    minWidth: 120,
    gap: 2,
    padding: spacing.md,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: fontSize.xxl,
    fontWeight: '800',
    color: colors.ink,
  },
  kpiLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: colors.inkSubtle,
    textAlign: 'center',
  },
  kpiSub: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    textAlign: 'center',
  },

  barRow: {
    gap: 4,
    paddingVertical: spacing.sm,
  },
  barLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  barLabel: {
    fontSize: fontSize.sm,
    color: colors.inkSoft,
    flex: 1,
  },
  barValue: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'right',
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  barFill: {
    height: 6,
    borderRadius: radius.pill,
    minWidth: 4,
  },

  daySeries: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    paddingTop: spacing.sm,
    height: 80,
  },
  dayCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 3,
  },
  dayBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
  },
  dayBar: {
    width: 5,
    borderRadius: 2,
    minHeight: 2,
  },
  dayBarCreated: { backgroundColor: colors.ink },
  dayBarResolved: { backgroundColor: colors.inkFaint },
  dayLabel: {
    fontSize: 8,
    color: colors.inkFaint,
    textAlign: 'center',
  },

  issueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  issueCategory: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
  },
  issueSub: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
    marginTop: 2,
  },
  issueHours: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.inkMuted,
  },

  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  productName: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
  },
  productSub: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
    marginTop: 2,
  },
  productRight: {
    alignItems: 'flex-end',
    gap: 3,
  },
  productHours: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
  },

  engRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  engInfo: {
    flex: 1,
  },
  engName: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: colors.ink,
  },
  engMeta: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
    marginTop: 2,
  },
  engStats: {
    alignItems: 'flex-end',
    gap: 2,
  },
  engRate: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.success,
  },
  engHours: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
  },

  empty: {
    fontSize: fontSize.sm,
    color: colors.inkFaint,
    paddingVertical: spacing.sm,
  },
});
