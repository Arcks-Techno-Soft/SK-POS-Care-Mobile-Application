/** Ticket detail screen — header, workflow, and all sub-resource sections. */

import { useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  Alert,
  Linking,
  Pressable,
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
import TicketThirdParty from '@/components/ticket/TicketThirdParty';
import TicketWorkflow from '@/components/ticket/TicketWorkflow';
import AdminTicketActions from '@/components/ticket/AdminTicketActions';
import { Badge, Button, Card, Field, KeyValue } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { Select, toOptions } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import {
  INDIAN_STATES,
  isAdminLevel,
  isSuperAdmin,
  prettyEnum,
  SERVICE_TYPES,
  SEVERITIES,
  WARRANTY_STATUSES,
} from '@/lib/options';
import {
  colors,
  fontSize,
  radius,
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
  // The override controls below (force-close + delete) are reserved Super Admin
  // powers, so gate them to super-admin only — not plain admins.
  const isAdmin = isSuperAdmin(user?.role);

  const {
    data: ticket,
    loading,
    error,
    errorStatus,
    refreshing,
    refresh,
    reload,
  } = useQuery<TicketDetail>(() => api.getTicket(reference), [reference]);

  const canEditMeta = user?.role === 'MANAGER' || isAdminLevel(user?.role);

  // Warranty registry lookup. The server applies the verdict itself when that's
  // unambiguous; when it would overturn an existing status (or an AMC) it comes
  // back with requires_confirmation and we ask before re-sending confirm=true.
  const [checkingWarranty, setCheckingWarranty] = useState(false);
  const runWarrantyCheck = async (confirm: boolean) => {
    setCheckingWarranty(true);
    try {
      const r = await api.checkWarranty(reference, confirm);
      if (r.applied) reload();

      if (!r.found) {
        Alert.alert(
          'Invalid serial no.',
          `Serial "${r.serial_number}" isn't in the warranty registry. Check the number on the device, or register the unit under Warranty management.`,
          [{ text: 'OK' }],
        );
        return;
      }
      if (r.requires_confirmation) {
        Alert.alert('Check warranty status', r.message, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Apply anyway',
            style: 'destructive',
            onPress: () => void runWarrantyCheck(true),
          },
        ]);
        return;
      }
      const detail = r.warranty?.expiry_date ? `\n\nExpires ${r.warranty.expiry_date}` : '';
      Alert.alert(
        r.verdict === 'UNDER_WARRANTY' ? 'Under warranty' : 'Out of warranty',
        `${r.warranty?.product_name ?? ''}${detail}`.trim() || r.message,
        [{ text: 'OK' }],
      );
    } catch (e) {
      showError(e);
    } finally {
      setCheckingWarranty(false);
    }
  };
  const checkWarranty = () => void runWarrantyCheck(false);
  // Remote-support tickets skip signatures, PDF, spare parts and shipments.
  const isRemote = ticket?.service_type === 'REMOTE_SUPPORT';
  // Third-party support: engineer-signature-only close, no spares/shipments.
  const isThirdParty = ticket?.service_type === 'THIRD_PARTY_SUPPORT';
  // Service type can be set by Admin/Manager or the assigned engineer, until
  // the ticket is resolved/closed.
  const canEditServiceType =
    (canEditMeta || (!!ticket && ticket.assigned_engineer?.id === user?.id)) &&
    ticket?.status !== 'RESOLVED' &&
    ticket?.status !== 'CLOSED';
  // Customer + address stay correctable by Admin/Manager or the assigned
  // engineer until the ticket is CLOSED.
  const canEditDetails =
    (canEditMeta || (!!ticket && ticket.assigned_engineer?.id === user?.id)) &&
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
              {ticket.status === 'RESOLVED' && ticket.payment_awaiting_verification && (
                <Badge label="Awaiting verification" tone="info" />
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
            <TicketCustomerRow
              ticket={ticket}
              canEdit={canEditDetails}
              api={api}
              onReload={reload}
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
            <TicketAddressRow
              ticket={ticket}
              canEdit={canEditDetails}
              api={api}
              onReload={reload}
            />
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
                  <Pressable
                    onPress={checkWarranty}
                    disabled={checkingWarranty}
                    style={[styles.checkWarrantyBtn, checkingWarranty && { opacity: 0.5 }]}
                  >
                    <Text style={styles.checkWarrantyText}>
                      {checkingWarranty ? 'Checking…' : 'Check warranty status'}
                    </Text>
                  </Pressable>
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
          {isThirdParty && (
            <TicketThirdParty reference={reference} ticket={ticket} reload={reload} />
          )}
          <TicketSubEngineers reference={reference} ticket={ticket} reload={reload} />
          <TicketCharges reference={reference} ticket={ticket} reload={reload} />
          {!isRemote && !isThirdParty && (
            <TicketShipments reference={reference} ticket={ticket} reload={reload} />
          )}
          {!isRemote &&
            (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
              <TicketSignoff reference={reference} ticket={ticket} reload={reload} />
            )}
          <TicketEvents reference={reference} ticket={ticket} reload={reload} />

          {isAdmin && (
            <Section title="Super Admin controls">
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

/* Customer / contact details — read-only with an inline edit form. Editable by
   Admin/Manager or the assigned engineer until the ticket is CLOSED. */
function TicketCustomerRow({
  ticket,
  canEdit,
  api,
  onReload,
}: {
  ticket: TicketDetail;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [contactName, setContactName] = useState('');
  const [profile, setProfile] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setBusinessName(ticket.business_name ?? '');
    setBusinessType(ticket.business_type ?? '');
    setContactName(ticket.contact_name ?? '');
    setProfile(ticket.contact_person_profile ?? '');
    setPhone(ticket.phone ?? '');
    setEmail(ticket.email ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (businessName.trim().length < 2) return Alert.alert('Customer', 'Business name is required.');
    if (businessType.trim().length < 2) return Alert.alert('Customer', 'Business type is required.');
    if (contactName.trim().length < 2) return Alert.alert('Customer', 'Contact name is required.');
    if (phone.replace(/\D/g, '').replace(/^91/, '').length !== 10)
      return Alert.alert('Customer', 'Enter a valid 10-digit mobile number.');
    setSaving(true);
    try {
      await api.updateTicketCustomer(ticket.reference, {
        business_name: businessName.trim(),
        business_type: businessType.trim(),
        contact_name: contactName.trim(),
        contact_person_profile: profile.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
      });
      setEditing(false);
      onReload();
    } catch (e) {
      Alert.alert(
        'Customer',
        e instanceof ApiError ? e.message : 'Could not update the customer details.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <View style={styles.editBox}>
        <Text style={styles.editLabel}>Customer Details</Text>
        <Field value={businessName} onChangeText={setBusinessName} placeholder="Business name" autoCapitalize="words" />
        <Field value={businessType} onChangeText={setBusinessType} placeholder="Business type" autoCapitalize="words" />
        <Field value={contactName} onChangeText={setContactName} placeholder="Contact name" autoCapitalize="words" />
        <Field value={profile} onChangeText={setProfile} placeholder="Contact role (optional)" autoCapitalize="words" />
        <Field value={phone} onChangeText={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" />
        <Field value={email} onChangeText={setEmail} placeholder="Email (optional)" keyboardType="email-address" autoCapitalize="none" />
        <View style={styles.editBtnRow}>
          <Button title="Cancel" variant="secondary" size="sm" fullWidth={false} onPress={() => setEditing(false)} />
          <Button title="Save" size="sm" fullWidth={false} loading={saving} onPress={save} />
        </View>
      </View>
    );
  }

  return (
    <>
      <KeyValue
        label="Contact"
        value={
          ticket.contact_person_profile
            ? `${ticket.contact_name} · ${ticket.contact_person_profile}`
            : ticket.contact_name
        }
      />
      <KeyValue
        label="Phone"
        value={
          ticket.phone ? (
            <Text style={styles.link} onPress={() => Linking.openURL(`tel:${ticket.phone}`)}>
              {ticket.phone}
            </Text>
          ) : (
            '—'
          )
        }
      />
      {!!ticket.email && <KeyValue label="Email" value={ticket.email} />}
      {!!ticket.business_type && <KeyValue label="Business type" value={ticket.business_type} />}
      {canEdit && (
        <Text style={styles.editLink} onPress={start}>
          Edit customer details
        </Text>
      )}
    </>
  );
}

/* Site address — read-only with an inline edit form. Same gate. Preserves any
   map pin previously dropped on the web. */
function TicketAddressRow({
  ticket,
  canEdit,
  api,
  onReload,
}: {
  ticket: TicketDetail;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [line3, setLine3] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState<string | null>(null);
  const [pincode, setPincode] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setLine1(ticket.address_line1 ?? '');
    setLine2(ticket.address_line2 ?? '');
    setLine3(ticket.address_line3 ?? '');
    setCity(ticket.city ?? '');
    setStateName(ticket.state ?? null);
    setPincode(ticket.pincode ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (line1.trim().length < 3) return Alert.alert('Address', 'Address line 1 is required.');
    if (city.trim().length < 2) return Alert.alert('Address', 'City is required.');
    if (!stateName) return Alert.alert('Address', 'Select a state.');
    if (!/^\d{4,10}$/.test(pincode.trim()))
      return Alert.alert('Address', 'Enter a valid pincode (digits only).');
    setSaving(true);
    try {
      await api.updateTicketAddress(ticket.reference, {
        address_line1: line1.trim(),
        address_line2: line2.trim() || null,
        address_line3: line3.trim() || null,
        city: city.trim(),
        state: stateName,
        pincode: pincode.trim(),
        // Preserve any pin previously dropped on the web.
        latitude: ticket.latitude,
        longitude: ticket.longitude,
      });
      setEditing(false);
      onReload();
    } catch (e) {
      Alert.alert(
        'Address',
        e instanceof ApiError ? e.message : 'Could not update the address.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <View style={styles.editBox}>
        <Text style={styles.editLabel}>Site Address</Text>
        <Field value={line1} onChangeText={setLine1} placeholder="Address line 1" />
        <Field value={line2} onChangeText={setLine2} placeholder="Address line 2 (optional)" />
        <Field value={line3} onChangeText={setLine3} placeholder="Address line 3 (optional)" />
        <Field value={city} onChangeText={setCity} placeholder="City" autoCapitalize="words" />
        <Select
          value={stateName}
          onChange={setStateName}
          placeholder="Select state"
          sheetTitle="State"
          options={INDIAN_STATES.map((s) => ({ label: s, value: s }))}
        />
        <Field value={pincode} onChangeText={setPincode} placeholder="Pincode" keyboardType="number-pad" />
        <View style={styles.editBtnRow}>
          <Button title="Cancel" variant="secondary" size="sm" fullWidth={false} onPress={() => setEditing(false)} />
          <Button title="Save" size="sm" fullWidth={false} loading={saving} onPress={save} />
        </View>
      </View>
    );
  }

  return (
    <>
      <KeyValue label="Address" value={formatAddress(ticket) || '—'} />
      {canEdit && (
        <Text style={styles.editLink} onPress={start}>
          Edit address
        </Text>
      )}
    </>
  );
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

  // Deliberately grey/secondary: a lookup, not a workflow action.
  checkWarrantyBtn: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceSunken,
  },
  checkWarrantyText: { fontSize: fontSize.xs, color: colors.inkMuted, fontWeight: '600' },

  editBox: { gap: spacing.sm, marginTop: spacing.sm },
  editLabel: { fontSize: fontSize.sm, color: colors.inkSubtle, fontWeight: '600' },
  editBtnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  editLink: {
    fontSize: fontSize.sm,
    color: colors.info,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
});
