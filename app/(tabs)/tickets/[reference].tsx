/** Ticket detail screen — header, workflow, and all sub-resource sections. */

import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { AttemptsSection } from '@/components/AttemptsSection';
import { EmptyState, Loading, ErrorView } from '@/components/States';
import TicketCharges from '@/components/ticket/TicketCharges';
import TicketEvents from '@/components/ticket/TicketEvents';
import TicketShipments from '@/components/ticket/TicketShipments';
import TicketSignoff from '@/components/ticket/TicketSignoff';
import TicketSubEngineers from '@/components/ticket/TicketSubEngineers';
import TicketWorkflow from '@/components/ticket/TicketWorkflow';
import AdminTicketActions from '@/components/ticket/AdminTicketActions';
import { Badge, Button, Card, KeyValue } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { Select, toOptions } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { prettyEnum, SERVICE_TYPES, SEVERITIES, WARRANTY_STATUSES } from '@/lib/options';
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
  const router = useRouter();
  const api = useApi();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN'; // OWNER is normalized to ADMIN at login

  const {
    data: ticket,
    loading,
    error,
    errorStatus,
    refreshing,
    refresh,
    reload,
  } = useQuery<TicketDetail>(() => api.getTicket(reference), [reference]);

  const canEditMeta = user?.role === 'MANAGER' || user?.role === 'ADMIN';
  // Remote-support tickets skip signatures, PDF, spare parts and shipments.
  const isRemote = ticket?.service_type === 'REMOTE_SUPPORT';
  // Service type can be set by Admin/Manager or the assigned engineer, until
  // the ticket is resolved/closed.
  const canEditServiceType =
    (canEditMeta || (!!ticket && ticket.assigned_engineer?.id === user?.id)) &&
    ticket?.status !== 'RESOLVED' &&
    ticket?.status !== 'CLOSED';

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
        <KeyboardAwareScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={spacing.xl}
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
              {ticket.status === 'RESOLVED' &&
                ticket.payment_required &&
                ticket.payment_status === 'PENDING' && (
                  <Badge label="Payment pending" tone="warn" />
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
            <KeyValue
              label="Contact"
              value={
                ticket.contact_person_profile
                  ? `${ticket.contact_name} · ${ticket.contact_person_profile}`
                  : ticket.contact_name
              }
            />
            {ticket.raised_by ? (
              <KeyValue
                label="Raised by"
                value={`${ticket.raised_by.name}${
                  ticket.raised_by.role === 'ENGINEER' ? ' (Engineer)' : ''
                }`}
              />
            ) : (
              <KeyValue
                label="Raised by"
                value={`Customer — ${ticket.contact_name}${
                  ticket.contact_person_profile ? ` — ${ticket.contact_person_profile}` : ''
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
              <Text style={styles.metaEditLabel}>
                Warranty
                {ticket.warranty_status === 'UNKNOWN' && (
                  <Text style={{ color: colors.danger }}> *</Text>
                )}
              </Text>
              {canEditMeta ? (
                <View style={{ flex: 1 }}>
                  <Select
                    value={ticket.warranty_status}
                    sheetTitle="Warranty status"
                    placeholder="Select warranty status…"
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
              ) : ticket.warranty_status === 'UNKNOWN' ? (
                <Text style={styles.metaEditLabel}>Not set</Text>
              ) : (
                <Badge
                  label={prettyEnum(ticket.warranty_status)}
                  tone={warrantyTone(ticket.warranty_status)}
                />
              )}
            </View>
            <View style={styles.metaEditRow}>
              <Text style={styles.metaEditLabel}>Service type</Text>
              {canEditServiceType ? (
                <View style={{ flex: 1 }}>
                  <Select
                    value={ticket.service_type}
                    sheetTitle="Service type"
                    options={toOptions(SERVICE_TYPES).map((o) => ({
                      ...o,
                      label: prettyEnum(o.value),
                    }))}
                    onChange={async (value) => {
                      if (value === ticket.service_type) return;
                      try {
                        await api.setServiceType(reference, value);
                        reload();
                      } catch (e) {
                        showError(e);
                      }
                    }}
                  />
                </View>
              ) : (
                <Badge label={prettyEnum(ticket.service_type)} tone="neutral" />
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

          <AttemptsSection
            attempts={ticket.attempts}
            canWork={
              ticket.assigned_engineer?.id === user?.id && ticket.status === 'RESOLVING'
            }
            canStart={
              ticket.assigned_engineer?.id === user?.id &&
              (ticket.status === 'ACCEPTED' || ticket.status === 'RESOLVING')
            }
            onStartAttempt={async () => {
              await api.startTicketAttempt(reference);
              reload();
            }}
            onEndAttempt={async (attemptId) => {
              await api.endTicketAttempt(reference, attemptId);
              reload();
            }}
            onAddNote={async (body, images) => {
              await api.addTicketNote(reference, body, images);
              reload();
            }}
          />
          <TicketSubEngineers reference={reference} ticket={ticket} reload={reload} />
          <TicketCharges reference={reference} ticket={ticket} reload={reload} />
          {!isRemote && (
            <TicketShipments reference={reference} ticket={ticket} reload={reload} />
          )}
          {!isRemote &&
            (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
              <TicketSignoff reference={reference} ticket={ticket} reload={reload} />
            )}
          <TicketEvents reference={reference} ticket={ticket} reload={reload} />

          {isAdmin && (
            <Section title="Owner / Admin controls">
              <AdminTicketActions
                reference={reference}
                status={ticket.status}
                onChanged={reload}
                onDeleted={() => router.back()}
              />
            </Section>
          )}
        </KeyboardAwareScrollView>
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
