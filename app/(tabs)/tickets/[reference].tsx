/** Ticket detail screen — header, workflow, and all sub-resource sections. */

import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Alert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { EmptyState, Loading, ErrorView } from '@/components/States';
import TicketCharges from '@/components/ticket/TicketCharges';
import TicketEvents from '@/components/ticket/TicketEvents';
import TicketNotes from '@/components/ticket/TicketNotes';
import TicketShipments from '@/components/ticket/TicketShipments';
import TicketSignoff from '@/components/ticket/TicketSignoff';
import TicketSubEngineers from '@/components/ticket/TicketSubEngineers';
import TicketWorkflow from '@/components/ticket/TicketWorkflow';
import { Badge, Button, Card, KeyValue } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { Select, toOptions } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { prettyEnum, SEVERITIES, WARRANTY_STATUSES } from '@/lib/options';
import {
  colors,
  fontSize,
  severityTone,
  spacing,
  statusTone,
  warrantyTone,
} from '@/lib/theme';
import type { TicketDetail } from '@/lib/types';

export default function TicketDetailScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const api = useApi();
  const { user } = useAuth();

  const {
    data: ticket,
    loading,
    error,
    errorStatus,
    refreshing,
    refresh,
    reload,
  } = useQuery<TicketDetail>(() => api.getTicket(reference), [reference]);

  const canEditMeta = user?.role === 'MANAGER' || user?.role === 'OWNER';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: ticket?.reference ?? 'Ticket' }} />

      {loading && !ticket ? (
        <Loading label="Loading ticket…" />
      ) : !ticket && (errorStatus === 403 || errorStatus === 404) ? (
        <EmptyState
          icon="lock-closed-outline"
          title="Access restricted"
          subtitle={`Ticket ${reference} isn't assigned to you, so the details aren't visible from your account. Only the assigned engineer, managers, and owners can open it.`}
        />
      ) : error && !ticket ? (
        <ErrorView message={error} onRetry={reload} />
      ) : ticket ? (
        <KeyboardAvoider style={styles.root}>
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refresh}
              tintColor={colors.inkMuted}
            />
          }
        >
          {/* Header card */}
          <Card style={styles.headerCard}>
            <Text style={styles.business}>{ticket.business_name}</Text>
            <View style={styles.badgeRow}>
              <Badge label={prettyEnum(ticket.status)} tone={statusTone(ticket.status)} />
              <Badge
                label={prettyEnum(ticket.severity)}
                tone={severityTone(ticket.severity)}
              />
              {ticket.warranty_status !== 'UNKNOWN' && (
                <Badge
                  label={prettyEnum(ticket.warranty_status)}
                  tone={warrantyTone(ticket.warranty_status)}
                />
              )}
            </View>
            <View style={styles.headerMeta}>
              <Text style={styles.ref}>{ticket.reference}</Text>
              <Text style={styles.time}>Created {timeAgo(ticket.created_at)}</Text>
            </View>
          </Card>

          {/* Workflow */}
          <TicketWorkflow reference={reference} ticket={ticket} reload={reload} />

          {/* Customer & site */}
          <Section title="Customer & site">
            <KeyValue label="Contact" value={ticket.contact_name} />
            {!!ticket.raised_by && (
              <KeyValue
                label="Raised by"
                value={`${ticket.raised_by.name}${
                  ticket.raised_by.role === 'ENGINEER' ? ' (Engineer)' : ''
                }`}
              />
            )}
            <KeyValue
              label="Phone"
              value={
                ticket.phone ? (
                  <Text
                    style={styles.link}
                    onPress={() => Linking.openURL(`tel:${ticket.phone}`)}
                  >
                    {ticket.phone}
                  </Text>
                ) : (
                  '—'
                )
              }
            />
            {!!ticket.email && <KeyValue label="Email" value={ticket.email} />}
            {!!ticket.business_type && (
              <KeyValue label="Business type" value={ticket.business_type} />
            )}
            <KeyValue label="Address" value={formatAddress(ticket)} />
            {!!ticket.preferred_contact_time && (
              <KeyValue
                label="Preferred time"
                value={ticket.preferred_contact_time}
              />
            )}
            {ticket.latitude != null && ticket.longitude != null && (
              <View style={{ marginTop: spacing.md }}>
                <Button
                  title="Open in Maps"
                  icon="map-outline"
                  variant="secondary"
                  onPress={() =>
                    Linking.openURL(
                      `https://www.google.com/maps/search/?api=1&query=${ticket.latitude},${ticket.longitude}`,
                    )
                  }
                />
              </View>
            )}
          </Section>

          {/* Product & issue */}
          <Section title="Product & issue">
            <KeyValue label="Product" value={ticket.product_category} />
            <KeyValue label="Serial no." value={ticket.serial_number} mono />
            <KeyValue label="Issue" value={ticket.issue_category} />
            {!!ticket.description && (
              <View style={styles.descBlock}>
                <Text style={styles.descLabel}>Description</Text>
                <Text style={styles.descText}>{ticket.description}</Text>
              </View>
            )}
            <View style={styles.metaEditRow}>
              <Text style={styles.metaEditLabel}>Severity</Text>
              {canEditMeta ? (
                <View style={{ flex: 1 }}>
                  <Select
                    value={ticket.severity}
                    sheetTitle="Severity"
                    options={toOptions(SEVERITIES).map((o) => ({
                      ...o,
                      label: prettyEnum(o.value),
                    }))}
                    onChange={async (value) => {
                      if (value === ticket.severity) return;
                      try {
                        await api.updateSeverity(reference, value);
                        reload();
                      } catch (e) {
                        showError(e);
                      }
                    }}
                  />
                </View>
              ) : (
                <Badge
                  label={prettyEnum(ticket.severity)}
                  tone={severityTone(ticket.severity)}
                />
              )}
            </View>
            <View style={styles.metaEditRow}>
              <Text style={styles.metaEditLabel}>Warranty</Text>
              {canEditMeta ? (
                <View style={{ flex: 1 }}>
                  <Select
                    value={ticket.warranty_status}
                    sheetTitle="Warranty status"
                    options={toOptions(WARRANTY_STATUSES).map((o) => ({
                      ...o,
                      label: prettyEnum(o.value),
                    }))}
                    onChange={async (value) => {
                      if (value === ticket.warranty_status) return;
                      try {
                        await api.updateWarranty(reference, value);
                        reload();
                      } catch (e) {
                        showError(e);
                      }
                    }}
                  />
                </View>
              ) : (
                <Badge
                  label={prettyEnum(ticket.warranty_status)}
                  tone={warrantyTone(ticket.warranty_status)}
                />
              )}
            </View>
          </Section>

          {/* Customer attachments */}
          {ticket.attachments.length > 0 && (
            <Section title="Customer attachments">
              <AttachmentGallery
                urls={ticket.attachments.map((a) => a.storage_url)}
              />
            </Section>
          )}

          <TicketNotes reference={reference} ticket={ticket} reload={reload} />
          <TicketSubEngineers reference={reference} ticket={ticket} reload={reload} />
          <TicketCharges reference={reference} ticket={ticket} reload={reload} />
          <TicketShipments reference={reference} ticket={ticket} reload={reload} />
          {(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
            <TicketSignoff reference={reference} ticket={ticket} reload={reload} />
          )}
          <TicketEvents reference={reference} ticket={ticket} reload={reload} />
        </ScrollView>
        </KeyboardAvoider>
      ) : null}
    </View>
  );
}

function showError(e: unknown) {
  const msg = e instanceof ApiError ? e.message : (e as Error)?.message ?? 'Something went wrong.';
  Alert.alert('Error', msg);
}

function formatAddress(t: TicketDetail): string {
  const lines = [
    t.address_line1,
    t.address_line2,
    t.address_line3,
    [t.city, t.state].filter(Boolean).join(', '),
    t.pincode,
  ].filter((l) => !!l && String(l).trim());
  return lines.join('\n');
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceRaised },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },

  headerCard: { gap: spacing.sm },
  business: { fontSize: fontSize.xxl, fontWeight: '700', color: colors.ink },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: 2,
  },
  ref: {
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  time: { fontSize: fontSize.xs, color: colors.inkSubtle },

  link: {
    fontSize: fontSize.sm,
    color: colors.info,
    fontWeight: '600',
    textAlign: 'right',
  },

  descBlock: { marginTop: spacing.sm, gap: 4 },
  descLabel: { fontSize: fontSize.sm, color: colors.inkSubtle },
  descText: { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 21 },

  metaEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metaEditLabel: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    width: 72,
  },
});
