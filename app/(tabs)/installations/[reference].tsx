import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { KeyboardAwareSheet } from '@/components/KeyboardAwareSheet';
import { AttemptsSection } from '@/components/AttemptsSection';
import InstallationSubEngineers from '@/components/installation/InstallationSubEngineers';
import { PhotoPicker } from '@/components/PhotoPicker';
import { SignaturePad } from '@/components/SignaturePad';
import { ErrorView, Loading } from '@/components/States';
import { DateField } from '@/components/ui/DateField';
import { Badge, Banner, Button, Card, Divider, Field, KeyValue } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { pickFromLibrary, takePhoto } from '@/lib/images';
import { usePendingTickets } from '@/lib/pending-tickets';
import { dateOnlyRelative, formatDateOnly, formatDateTime, timeAgo, todayISO } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import {
  byEngineerAvailability,
  engineerLoadLabel,
  INDIAN_STATES,
  isAdminLevel,
  prettyEnum,
  roleLabel,
} from '@/lib/options';
import { colors, fontSize, radius, spacing, statusTone } from '@/lib/theme';
import type {
  InstallationDetail,
  InvoiceDocument,
  InstallationEvent,
  PickedImage,
  User,
} from '@/lib/types';

export default function InstallationDetailScreen() {
  const { reference } = useLocalSearchParams<{ reference: string }>();
  const api = useApi();
  const { user } = useAuth();

  const {
    data: installation,
    loading,
    error,
    refreshing,
    refresh,
    reload,
  } = useQuery<InstallationDetail>(() => api.getInstallation(reference), [reference]);

  const { refresh: refreshPending } = usePendingTickets();
  // Reload the installation AND refresh the tab badge after any workflow action.
  const reloadAndBadge = () => {
    reload();
    refreshPending();
  };

  const canManage = user?.role === 'MANAGER' || isAdminLevel(user?.role);
  // The assigned engineer (or a self-assigned manager) — the only non-manager
  // who may act on the installation. Everyone else (e.g. SALES) is view-only.
  const isAssignee =
    !!installation && installation.assigned_engineer?.id === user?.id;
  const canAct = canManage || isAssignee;
  // Invoice is editable by the assignee / Admin / Manager, but only until the
  // installation is CLOSED (after which it's frozen into the signed PDF).
  const canEditInvoice =
    !!installation &&
    installation.status !== 'CLOSED' &&
    (canManage || installation.assigned_engineer?.id === user?.id);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: installation?.reference ?? 'Installation' }} />

      {loading && !installation ? (
        <Loading label="Loading installation…" />
      ) : error && !installation ? (
        <ErrorView message={error} onRetry={reload} />
      ) : installation ? (
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
          {/* 1. Header card */}
          <Card style={styles.headerCard}>
            <Text style={styles.business}>{installation.business_name}</Text>
            <View style={styles.badgeRow}>
              <Badge
                label={prettyEnum(installation.status)}
                tone={statusTone(installation.status)}
              />
            </View>
            <View style={styles.headerMeta}>
              <Text style={styles.ref}>{installation.reference}</Text>
              <Text style={styles.time}>Created {timeAgo(installation.created_at)}</Text>
            </View>
          </Card>

          {/* 2. Workflow */}
          <WorkflowSection
            installation={installation}
            canManage={canManage}
            isAssignee={isAssignee}
            api={api}
            onReload={reloadAndBadge}
          />

          {/* 3. Details */}
          <Section title="Details">
            <CustomerRow
              installation={installation}
              canEdit={canEditInvoice}
              api={api}
              onReload={reloadAndBadge}
            />
            {installation.products_for_installation ? (
              <>
                <Divider />
                <KeyValue
                  label="Products"
                  value={installation.products_for_installation}
                />
              </>
            ) : null}
            <Divider />
            <ExpectedDateRow
              installation={installation}
              // The API gates this on Admin / Manager, unlike the invoice.
              canEdit={canManage && installation.status !== 'CLOSED'}
              api={api}
              onReload={reloadAndBadge}
            />
            <Divider />
            <InvoiceRow
              installation={installation}
              canEdit={canEditInvoice}
              api={api}
              onReload={reloadAndBadge}
            />
            <Divider />
            <InvoiceDocumentRow
              installation={installation}
              canEdit={canEditInvoice}
              api={api}
              onReload={reloadAndBadge}
            />
            <Divider />
            <AddressRow
              installation={installation}
              canEdit={canEditInvoice}
              api={api}
              onReload={reloadAndBadge}
            />
          </Section>

          {/* 4. Work attempts (notes + photos grouped per visit) */}
          <AttemptsSection
            attempts={installation.attempts}
            canWork={
              installation.status === 'ASSIGNED' &&
              !installation.on_hold &&
              (canManage || installation.assigned_engineer?.id === user?.id)
            }
            canStart={
              installation.status === 'ASSIGNED' &&
              !installation.on_hold &&
              (canManage || installation.assigned_engineer?.id === user?.id)
            }
            onStartAttempt={async () => {
              await api.startInstallationAttempt(reference);
              reloadAndBadge();
            }}
            onEndAttempt={async (attemptId) => {
              await api.endInstallationAttempt(reference, attemptId);
              reloadAndBadge();
            }}
            onAddNote={async (body, images) => {
              await api.addInstallationNote(reference, body, images);
              reloadAndBadge();
            }}
          />

          {/* 5. Field sub-engineers (off-field contractors on this job) */}
          <InstallationSubEngineers
            reference={reference}
            installation={installation}
          />

          {/* 6. Sign-off (COMPLETED or CLOSED) */}
          {(installation.status === 'COMPLETED' || installation.status === 'CLOSED') && (
            <SignoffSection
              installation={installation}
              canAct={canAct}
              api={api}
              onReload={reloadAndBadge}
            />
          )}

          {/* 7. Activity */}
          <ActivitySection reference={reference} api={api} />
        </KeyboardAwareScrollView>
      ) : null}
    </View>
  );
}

/* ─── Expected installation date (Admin / Manager, editable until CLOSED) ─── */

function ExpectedDateRow({
  installation,
  canEdit,
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const current = installation.expected_installation_date ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<string | null>(current);
  const [saving, setSaving] = useState(false);

  const save = async (next: string | null) => {
    setSaving(true);
    try {
      await api.setInstallationExpectedDate(installation.reference, next);
      setEditing(false);
      onReload();
    } catch (e) {
      Alert.alert(
        'Expected date',
        e instanceof ApiError ? e.message : 'Could not update the expected date.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    const relative = dateOnlyRelative(current);
    return (
      <KeyValue
        label="Expected Installation"
        value={
          <View style={styles.invoiceValueRow}>
            <Text style={styles.expectedDate}>
              {current ? formatDateOnly(current) : 'Not scheduled'}
              {relative ? <Text style={styles.expectedRel}>{`  ${relative}`}</Text> : null}
            </Text>
            {canEdit && (
              <Pressable
                onPress={() => {
                  setValue(current);
                  setEditing(true);
                }}
                hitSlop={8}
              >
                <Text style={styles.invoiceEdit}>{current ? 'Edit' : 'Set'}</Text>
              </Pressable>
            )}
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.invoiceEditBox}>
      <Text style={styles.invoiceEditLabel}>Expected Installation Date</Text>
      <DateField
        value={value}
        onChange={setValue}
        placeholder="Not scheduled yet"
        sheetTitle="Expected Installation Date"
        helper="Admin and managers get a WhatsApp reminder ahead of this date."
        minDate={todayISO()}
      />
      <View style={styles.invoiceBtnRow}>
        <Button
          title="Cancel"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => {
            setValue(current);
            setEditing(false);
          }}
        />
        <Button
          title="Save"
          size="sm"
          fullWidth={false}
          loading={saving}
          onPress={() => save(value)}
        />
      </View>
    </View>
  );
}

/* ─── Invoice (editable) ─── */

// Mirrors the mobile new-installation form: the value stored when no invoice
// number is available yet.
const INVOICE_DEFERRED = 'To be added later';

function InvoiceRow({
  installation,
  canEdit,
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(installation.invoice_number);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next = value.trim();
    if (!next) {
      Alert.alert('Invoice', 'Enter an invoice number, or use “To be added later”.');
      return;
    }
    setSaving(true);
    try {
      await api.updateInstallationInvoice(installation.reference, next);
      setEditing(false);
      onReload();
    } catch (e) {
      Alert.alert(
        'Invoice',
        e instanceof ApiError ? e.message : 'Could not update the invoice number.',
      );
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <KeyValue
        label="Invoice Number"
        value={
          <View style={styles.invoiceValueRow}>
            <Text style={styles.invoiceValue}>{installation.invoice_number}</Text>
            {canEdit && (
              <Pressable
                onPress={() => {
                  setValue(installation.invoice_number);
                  setEditing(true);
                }}
                hitSlop={8}
              >
                <Text style={styles.invoiceEdit}>Edit</Text>
              </Pressable>
            )}
          </View>
        }
      />
    );
  }

  return (
    <View style={styles.invoiceEditBox}>
      <Text style={styles.invoiceEditLabel}>Invoice Number</Text>
      <Field
        value={value}
        onChangeText={setValue}
        placeholder="Invoice number"
        autoCapitalize="characters"
        autoFocus
      />
      <Pressable onPress={() => setValue(INVOICE_DEFERRED)} hitSlop={8}>
        <Text style={styles.invoiceEdit}>Set “{INVOICE_DEFERRED}”</Text>
      </Pressable>
      <View style={styles.invoiceBtnRow}>
        <Button
          title="Cancel"
          variant="secondary"
          size="sm"
          fullWidth={false}
          onPress={() => setEditing(false)}
        />
        <Button
          title="Save"
          size="sm"
          fullWidth={false}
          loading={saving}
          onPress={save}
        />
      </View>
    </View>
  );
}

/* ─── Invoice documents (view / add / remove) ─── */

/** Mirrors MAX_INVOICE_DOCUMENTS in the backend's installation_workflow. */
const MAX_INVOICE_DOCS = 10;

function InvoiceDocumentRow({
  installation,
  canEdit,
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [busy, setBusy] = useState(false);
  // Prefer the list; fall back to the singular field so this still renders
  // against a backend that predates multi-upload.
  const docs =
    installation.invoice_documents ??
    (installation.invoice_document ? [installation.invoice_document] : []);
  const atCap = docs.length >= MAX_INVOICE_DOCS;

  const pickAndUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (result.canceled) return;
      const picked = result.assets.slice(0, MAX_INVOICE_DOCS - docs.length);
      if (!picked.length) return;
      if (picked.length < result.assets.length) {
        Alert.alert(
          'Invoice documents',
          `Only ${picked.length} of ${result.assets.length} were uploaded — the limit is ${MAX_INVOICE_DOCS} per installation.`,
        );
      }
      setBusy(true);
      await api.uploadInstallationInvoiceDocuments(
        installation.reference,
        picked.map((a) => ({
          uri: a.uri,
          name: a.name ?? 'invoice',
          type: a.mimeType ?? 'application/octet-stream',
        })),
      );
      onReload();
    } catch (e) {
      Alert.alert(
        'Invoice documents',
        e instanceof ApiError ? e.message : 'Could not upload the documents.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = (doc: InvoiceDocument) => {
    Alert.alert('Invoice documents', `Remove "${doc.filename}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            // A legacy row with no id can only be cleared via the all-docs route.
            if (doc.id == null) {
              await api.deleteInstallationInvoiceDocument(installation.reference);
            } else {
              await api.deleteInstallationInvoiceDocumentById(
                installation.reference,
                doc.id,
              );
            }
            onReload();
          } catch (e) {
            Alert.alert(
              'Invoice documents',
              e instanceof ApiError ? e.message : 'Could not remove the document.',
            );
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <KeyValue
      label="Invoice Documents"
      value={
        <View style={styles.docValueWrap}>
          {docs.length ? (
            docs.map((doc, i) => (
              <View key={doc.id ?? `${doc.storage_url}-${i}`} style={styles.docRow}>
                <Pressable
                  style={{ flexShrink: 1 }}
                  onPress={() => WebBrowser.openBrowserAsync(doc.storage_url)}
                >
                  <Text style={styles.docLink} numberOfLines={1}>
                    📄 {doc.filename}
                  </Text>
                </Pressable>
                {canEdit && !busy && (
                  <Pressable onPress={() => remove(doc)} hitSlop={8}>
                    <Text style={styles.docRemove}>Remove</Text>
                  </Pressable>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.docNone}>No documents</Text>
          )}
          {canEdit && (
            <View style={styles.docActionsRow}>
              <Pressable onPress={pickAndUpload} hitSlop={8} disabled={busy || atCap}>
                <Text style={[styles.invoiceEdit, atCap && styles.docNone]}>
                  {busy ? 'Working…' : atCap ? `Limit ${MAX_INVOICE_DOCS} reached` : docs.length ? 'Add more' : 'Upload'}
                </Text>
              </Pressable>
              {!atCap && !busy && (
                <Text style={styles.docNone}>
                  {docs.length}/{MAX_INVOICE_DOCS}
                </Text>
              )}
            </View>
          )}
        </View>
      }
    />
  );
}

/* ─── Customer / contact details (editable) ─── */

function CustomerRow({
  installation,
  canEdit,
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canEdit: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setBusinessName(installation.business_name ?? '');
    setCategory(installation.business_category ?? '');
    setContactName(installation.contact_name ?? '');
    setPhone(installation.phone ?? '');
    setEmail(installation.email ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (businessName.trim().length < 2) return Alert.alert('Customer', 'Business name is required.');
    if (category.trim().length < 2) return Alert.alert('Customer', 'Business category is required.');
    if (contactName.trim().length < 2) return Alert.alert('Customer', 'Contact name is required.');
    if (phone.replace(/[^\d+]/g, '').replace(/^\+/, '').length < 7)
      return Alert.alert('Customer', 'Enter a valid phone number.');
    setSaving(true);
    try {
      await api.updateInstallationCustomer(installation.reference, {
        business_name: businessName.trim(),
        business_category: category.trim(),
        contact_name: contactName.trim(),
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
      <View style={styles.invoiceEditBox}>
        <Text style={styles.invoiceEditLabel}>Customer Details</Text>
        <Field value={businessName} onChangeText={setBusinessName} placeholder="Business name" autoCapitalize="words" />
        <Field value={category} onChangeText={setCategory} placeholder="Business category" autoCapitalize="words" />
        <Field value={contactName} onChangeText={setContactName} placeholder="Contact name" autoCapitalize="words" />
        <Field value={phone} onChangeText={setPhone} placeholder="Phone" keyboardType="phone-pad" />
        <Field value={email} onChangeText={setEmail} placeholder="Email (optional)" keyboardType="email-address" autoCapitalize="none" />
        <View style={styles.invoiceBtnRow}>
          <Button title="Cancel" variant="secondary" size="sm" fullWidth={false} onPress={() => setEditing(false)} />
          <Button title="Save" size="sm" fullWidth={false} loading={saving} onPress={save} />
        </View>
      </View>
    );
  }

  return (
    <>
      <KeyValue label="Business Category" value={installation.business_category} />
      <Divider />
      <KeyValue label="Contact Name" value={installation.contact_name} />
      <Divider />
      <KeyValue
        label="Phone"
        value={
          <Pressable onPress={() => Linking.openURL(`tel:${installation.phone}`)}>
            <Text style={styles.phoneLink}>{installation.phone}</Text>
          </Pressable>
        }
      />
      {installation.email ? (
        <>
          <Divider />
          <KeyValue label="Email" value={installation.email} />
        </>
      ) : null}
      {canEdit ? (
        <>
          <Divider />
          <Pressable onPress={start} hitSlop={8}>
            <Text style={styles.invoiceEdit}>Edit customer details</Text>
          </Pressable>
        </>
      ) : null}
    </>
  );
}

/* ─── Site address (editable) ─── */

const PINCODE_RE = /^\d{4,10}$/;

function AddressRow({
  installation,
  canEdit,
  api,
  onReload,
}: {
  installation: InstallationDetail;
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
    setLine1(installation.address_line1 ?? '');
    setLine2(installation.address_line2 ?? '');
    setLine3(installation.address_line3 ?? '');
    setCity(installation.city ?? '');
    setStateName(installation.state ?? null);
    setPincode(installation.pincode ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (line1.trim().length < 3) {
      Alert.alert('Address', 'Address line 1 is required.');
      return;
    }
    if (city.trim().length < 2) {
      Alert.alert('Address', 'City is required.');
      return;
    }
    if (!stateName) {
      Alert.alert('Address', 'Select a state.');
      return;
    }
    if (!PINCODE_RE.test(pincode.trim())) {
      Alert.alert('Address', 'Enter a valid pincode (digits only).');
      return;
    }
    setSaving(true);
    try {
      await api.updateInstallationAddress(installation.reference, {
        address_line1: line1.trim(),
        address_line2: line2.trim() || null,
        address_line3: line3.trim() || null,
        city: city.trim(),
        state: stateName,
        pincode: pincode.trim(),
        // Preserve any pin previously dropped on the web.
        latitude: installation.latitude,
        longitude: installation.longitude,
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
      <View style={styles.invoiceEditBox}>
        <Text style={styles.invoiceEditLabel}>Site Address</Text>
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
        <Field
          value={pincode}
          onChangeText={setPincode}
          placeholder="Pincode"
          keyboardType="number-pad"
        />
        <View style={styles.invoiceBtnRow}>
          <Button
            title="Cancel"
            variant="secondary"
            size="sm"
            fullWidth={false}
            onPress={() => setEditing(false)}
          />
          <Button title="Save" size="sm" fullWidth={false} loading={saving} onPress={save} />
        </View>
      </View>
    );
  }

  const lines = [
    installation.address_line1,
    installation.address_line2,
    installation.address_line3,
    [installation.city, installation.state, installation.pincode].filter(Boolean).join(', '),
  ].filter((l): l is string => !!l && l.trim().length > 0);

  const hasGeo = installation.latitude != null && installation.longitude != null;

  return (
    <KeyValue
      label="Site Address"
      value={
        <View style={styles.addressWrap}>
          {lines.length ? (
            lines.map((l, i) => (
              <Text key={i} style={styles.addressLine}>
                {l}
              </Text>
            ))
          ) : (
            <Text style={styles.docNone}>No address yet</Text>
          )}
          <View style={styles.addressActions}>
            {hasGeo && (
              <Pressable
                onPress={() =>
                  Linking.openURL(
                    `https://www.google.com/maps/search/?api=1&query=${installation.latitude},${installation.longitude}`,
                  )
                }
                hitSlop={8}
              >
                <Text style={styles.invoiceEdit}>Map</Text>
              </Pressable>
            )}
            {canEdit && (
              <Pressable onPress={start} hitSlop={8}>
                <Text style={styles.invoiceEdit}>{lines.length ? 'Edit' : 'Add'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      }
    />
  );
}

/* ─── Workflow ─── */

function WorkflowSection({
  installation,
  canManage,
  isAssignee,
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canManage: boolean;
  isAssignee: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selfAssigning, setSelfAssigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [salesRepId, setSalesRepId] = useState<string | null>(
    installation.sales_rep ? String(installation.sales_rep.id) : null,
  );
  const [savingSalesRep, setSavingSalesRep] = useState(false);
  // Hold sheet — a reason is mandatory, matching the backend.
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdBusy, setHoldBusy] = useState(false);
  const [holdError, setHoldError] = useState<string | null>(null);
  // Decline sheet — assigned engineer hands the installation back (→ NEW).
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineBusy, setDeclineBusy] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  // Hold is an overlay on `status`, so it's checked separately everywhere.
  const onHold = !!installation.on_hold;

  // Finishing requires at least one completed attempt and none still open.
  const openAttempt = installation.attempts.find((a) => !a.ended_at) ?? null;
  const endedAttempts = installation.attempts.filter((a) => a.ended_at).length;
  const canFinish = !openAttempt && endedAttempts > 0;

  const { data: engineers } = useQuery<User[]>(
    () => api.listEngineers(),
    [],
  );

  // Sales reps for the "sourced by" picker — only Admin/Manager set one.
  const { data: salesReps } = useQuery<User[]>(
    () => (canManage ? api.listSalesReps() : Promise.resolve([])),
    [canManage],
  );

  const salesRepOptions = [
    { label: 'None', value: '' },
    ...(salesReps ?? []).map((r) => ({ label: r.name, value: String(r.id) })),
  ];

  const handleSetSalesRep = async () => {
    setBanner(null);
    setSavingSalesRep(true);
    try {
      await api.setInstallationSalesRep(
        installation.reference,
        salesRepId ? Number(salesRepId) : null,
      );
      onReload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setBanner(msg);
    } finally {
      setSavingSalesRep(false);
    }
  };

  // Same-district engineers first, then least-busy; load + district in sublabel.
  const engineerOptions = [...(engineers ?? [])]
    .sort(byEngineerAvailability(installation.city))
    .map((e) => ({
      label: e.name,
      value: String(e.id),
      sublabel:
        (e.role === 'MANAGER' ? 'Manager · ' : e.role === 'SALES' ? 'Sales rep · ' : '') +
        engineerLoadLabel(e, e.role !== 'MANAGER') +
        (e.district ? ` · ${e.district}` : ''),
    }));

  const handleAssign = async () => {
    if (!selectedEngineerId) {
      Alert.alert('Assign', 'Please select an engineer first.');
      return;
    }
    setBanner(null);
    setAssigning(true);
    try {
      await api.assignInstallation(installation.reference, Number(selectedEngineerId));
      onReload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setBanner(msg);
    } finally {
      setAssigning(false);
    }
  };

  const handleReassign = () => {
    if (!selectedEngineerId) {
      Alert.alert('Re-assign', 'Please select an engineer first.');
      return;
    }
    const target = (engineers ?? []).find(
      (e) => String(e.id) === selectedEngineerId,
    );
    Alert.alert(
      'Re-assign installation',
      `Re-assign to ${target?.name ?? 'the selected engineer'}? ` +
        `${installation.assigned_engineer?.name ?? 'The current engineer'} will no longer be assigned.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-assign',
          onPress: async () => {
            setBanner(null);
            setAssigning(true);
            try {
              await api.assignInstallation(
                installation.reference,
                Number(selectedEngineerId),
              );
              setSelectedEngineerId(null);
              onReload();
            } catch (e) {
              const msg = e instanceof ApiError ? e.message : (e as Error).message;
              setBanner(msg);
            } finally {
              setAssigning(false);
            }
          },
        },
      ],
    );
  };

  const handleSelfAssign = async () => {
    setBanner(null);
    setSelfAssigning(true);
    try {
      await api.selfAssignInstallation(installation.reference);
      onReload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setBanner(msg);
    } finally {
      setSelfAssigning(false);
    }
  };

  const submitHold = async () => {
    const reason = holdReason.trim();
    if (reason.length < 3) {
      setHoldError('Give a short reason — it shows on the installation.');
      return;
    }
    setHoldBusy(true);
    setHoldError(null);
    try {
      await api.holdInstallation(installation.reference, reason);
      setHoldOpen(false);
      setHoldReason('');
      onReload();
    } catch (e) {
      setHoldError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setHoldBusy(false);
    }
  };

  const submitDecline = async () => {
    const reason = declineReason.trim();
    if (reason.length < 3) {
      setDeclineError('Give a short reason — the managers will see it.');
      return;
    }
    setDeclineBusy(true);
    setDeclineError(null);
    try {
      await api.declineInstallation(installation.reference, reason);
      setDeclineOpen(false);
      // The installation is no longer assigned to this engineer, so it has
      // left their visible scope — reloading would 404. Go back to the list.
      Alert.alert('Installation declined', 'It has been returned to the managers to re-triage.');
      router.back();
    } catch (e) {
      setDeclineError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setDeclineBusy(false);
    }
  };

  const handleResume = () => {
    Alert.alert(
      'Resume installation',
      'This goes back onto the assignee’s open jobs and restarts its reminders.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume',
          onPress: async () => {
            setBanner(null);
            setHoldBusy(true);
            try {
              await api.resumeInstallation(installation.reference);
              onReload();
            } catch (e) {
              setBanner(e instanceof ApiError ? e.message : (e as Error).message);
            } finally {
              setHoldBusy(false);
            }
          },
        },
      ],
    );
  };

  const handleComplete = async () => {
    Alert.alert('Finish installation', 'Confirm that the installation is complete? You’ll capture the customer signature next.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setBanner(null);
          setCompleting(true);
          try {
            await api.closeInstallation(installation.reference);
            onReload();
          } catch (e) {
            const msg = e instanceof ApiError ? e.message : (e as Error).message;
            setBanner(msg);
          } finally {
            setCompleting(false);
          }
        },
      },
    ]);
  };

  return (
    <Section title="Workflow">
      {banner && <Banner message={banner} tone="danger" />}

      {/* Parked by a Manager/Admin. The controls below are hidden because the
          backend 409s every one of them while held. */}
      {onHold && (
        <View style={styles.holdCard}>
          <Text style={styles.holdTitle}>On hold</Text>
          {installation.hold_reason ? (
            <Text style={styles.holdReason}>{installation.hold_reason}</Text>
          ) : null}
          <Text style={styles.holdHint}>
            {installation.held_by?.name
              ? `Put on hold by ${installation.held_by.name}. `
              : ''}
            Work is frozen and this installation isn’t counted in anyone’s open
            jobs.
          </Text>
          {canManage && (
            <Button
              title="Resume installation"
              icon="play-circle-outline"
              loading={holdBusy}
              onPress={handleResume}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </View>
      )}

      {!onHold && installation.status === 'NEW' && canManage && (
        <View style={styles.workflowBlock}>
          <Select
            label="Assign to"
            value={selectedEngineerId}
            onChange={setSelectedEngineerId}
            options={engineerOptions}
            placeholder="Select an assignee…"
            sheetTitle="Select Assignee"
          />
          <Button
            title="Assign"
            icon="person-add-outline"
            onPress={handleAssign}
            loading={assigning}
            disabled={!selectedEngineerId}
          />
          {canManage && (
            <Button
              title="Assign to me"
              variant="secondary"
              icon="person-outline"
              onPress={handleSelfAssign}
              loading={selfAssigning}
            />
          )}
        </View>
      )}

      {!onHold && installation.status === 'ASSIGNED' && (isAssignee || canManage) && (
        <View style={styles.workflowBlock}>
          {/* Only the assigned engineer (or self-assigned manager) finishes. */}
          {isAssignee &&
            (canFinish ? (
              <Button
                title="Finish installation"
                icon="checkmark-circle-outline"
                onPress={handleComplete}
                loading={completing}
              />
            ) : (
              <Text style={styles.workflowNote}>
                {openAttempt
                  ? 'End the open attempt below before finishing.'
                  : 'Start and end at least one attempt below before finishing.'}
              </Text>
            ))}

          {/* Hand the job back — assignee only, and only before any recorded
              field work (mirrors the backend guard). */}
          {isAssignee && installation.attempts.length === 0 && (
            <Button
              title="Decline installation"
              icon="close-circle-outline"
              variant="secondary"
              loading={declineBusy}
              onPress={() => {
                setDeclineReason('');
                setDeclineError(null);
                setDeclineOpen(true);
              }}
            />
          )}

          {/* Not completed yet — a manager/admin can re-assign to another engineer. */}
          {canManage && (
            <View style={styles.reassignBlock}>
              <Text style={styles.reassignHint}>
                Re-assign this installation to a different engineer if needed.
              </Text>
              <Select
                label="Re-assign to engineer"
                value={selectedEngineerId}
                onChange={setSelectedEngineerId}
                options={engineerOptions.filter(
                  (o) => o.value !== String(installation.assigned_engineer?.id),
                )}
                placeholder="Select engineer…"
                sheetTitle="Select Engineer"
              />
              <Button
                title="Re-assign"
                icon="swap-horizontal-outline"
                variant="secondary"
                onPress={handleReassign}
                loading={assigning}
                disabled={!selectedEngineerId}
              />
            </View>
          )}
        </View>
      )}

      {installation.status === 'COMPLETED' && (
        <Text style={styles.workflowNote}>
          Completed — collect sign-off below to close the installation.
        </Text>
      )}

      {installation.status === 'CLOSED' && (
        <Text style={styles.workflowNote}>Installation is closed.</Text>
      )}

      {/* Parking the job — the exception, not the expected next step. */}
      {canManage &&
        !onHold &&
        (installation.status === 'NEW' || installation.status === 'ASSIGNED') && (
          <View style={styles.reassignBlock}>
            <Text style={styles.reassignHint}>
              Park this installation while it’s blocked. It stops counting toward
              the engineer’s open jobs and pauses the upcoming-installation
              reminder until you resume it.
            </Text>
            <Button
              title="Put on hold"
              icon="pause-circle-outline"
              variant="secondary"
              onPress={() => setHoldOpen(true)}
              loading={holdBusy}
            />
          </View>
        )}

      {/* Hold sheet — reason is mandatory (the backend enforces min 3 chars). */}
      <Modal
        visible={holdOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setHoldOpen(false)}
      >
        <KeyboardAwareSheet>
          <Pressable style={styles.holdBackdrop} onPress={() => setHoldOpen(false)}>
            <Pressable style={styles.holdSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.holdSheetTitle}>Put installation on hold</Text>
              <Text style={styles.holdSheetHint}>
                Work is frozen until a Manager or Admin resumes it. The assignee
                and current stage are kept.
              </Text>
              <Field
                value={holdReason}
                onChangeText={(t) => {
                  setHoldReason(t);
                  if (holdError) setHoldError(null);
                }}
                placeholder="e.g. customer premises not ready"
                multiline
                error={holdError ?? undefined}
              />
              <View style={styles.holdSheetActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setHoldOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Put on hold"
                  fullWidth={false}
                  loading={holdBusy}
                  onPress={submitHold}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareSheet>
      </Modal>

      {/* Decline modal — mandatory reason, mirrors the hold sheet. */}
      <Modal
        visible={declineOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDeclineOpen(false)}
      >
        <KeyboardAwareSheet>
          <Pressable style={styles.holdBackdrop} onPress={() => setDeclineOpen(false)}>
            <Pressable style={styles.holdSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.holdSheetTitle}>Decline this installation</Text>
              <Text style={styles.holdSheetHint}>
                It goes back to the managers to re-assign, and they&apos;ll see
                your reason. You won&apos;t see it again unless it is
                re-assigned to you.
              </Text>
              <Field
                value={declineReason}
                onChangeText={(t) => {
                  setDeclineReason(t);
                  if (declineError) setDeclineError(null);
                }}
                placeholder="e.g. out of my district this week"
                multiline
                error={declineError ?? undefined}
              />
              <View style={styles.holdSheetActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setDeclineOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Decline"
                  fullWidth={false}
                  loading={declineBusy}
                  onPress={submitDecline}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareSheet>
      </Modal>

      {/* Sales representative — Admin/Manager credit who sourced the deal */}
      {canManage && installation.status !== 'CLOSED' && (
        <View style={styles.reassignBlock}>
          <Select
            label="Sales representative"
            value={salesRepId}
            onChange={(v) => setSalesRepId(v || null)}
            options={salesRepOptions}
            placeholder="None"
            sheetTitle="Sales Representative"
          />
          <Button
            title={installation.sales_rep ? 'Update sales rep' : 'Set sales rep'}
            icon="briefcase-outline"
            variant="secondary"
            onPress={handleSetSalesRep}
            loading={savingSalesRep}
            disabled={
              salesRepId ===
              (installation.sales_rep ? String(installation.sales_rep.id) : null)
            }
          />
        </View>
      )}

      {/* Timestamps */}
      <View style={styles.timestamps}>
        {installation.created_by && (
          <Text style={styles.tsRow}>
            Created by {installation.created_by.name}
          </Text>
        )}
        {installation.sales_rep && (
          <Text style={styles.tsRow}>
            Sales rep: {installation.sales_rep.name}
          </Text>
        )}
        {installation.assigned_engineer && (
          <Text style={styles.tsRow}>
            Assigned to {installation.assigned_engineer.name}
            {installation.assigned_at ? ` · ${formatDateTime(installation.assigned_at)}` : ''}
          </Text>
        )}
        {installation.completed_at && (
          <Text style={styles.tsRow}>Completed {formatDateTime(installation.completed_at)}</Text>
        )}
        {installation.closed_at && (
          <Text style={styles.tsRow}>Closed {formatDateTime(installation.closed_at)}</Text>
        )}
      </View>
    </Section>
  );
}

/* ─── Sign-off ─── */

function SignoffSection({
  installation,
  canAct,
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canAct: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [signerNameInput, setSignerNameInput] = useState('');
  const [signerModalVisible, setSignerModalVisible] = useState(false);
  const [pendingSignerName, setPendingSignerName] = useState('');
  const [customerPadVisible, setCustomerPadVisible] = useState(false);
  const [engineerPadVisible, setEngineerPadVisible] = useState(false);
  const [signingCustomer, setSigningCustomer] = useState(false);
  const [signingEngineer, setSigningEngineer] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  const [fieldLink, setFieldLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  const resolution = installation.resolution;
  const serverPhotoCaptured = !!resolution?.customer_photo_captured_at;
  // Once the off-field link exists, on-site signing pauses — the sub-engineer
  // captures both signatures through the link instead.
  const fieldMode = !!resolution?.field_sign_link_generated_at;
  const hasSubEngineer = (installation.sub_engineers?.length ?? 0) > 0;

  const generateFieldLink = async () => {
    setBanner(null);
    setGeneratingLink(true);
    try {
      const res = await api.installationFieldSignLink(installation.reference);
      setFieldLink(res.url);
      onReload();
    } catch (e) {
      setBanner(
        e instanceof ApiError ? e.message : 'Could not generate the signing link.',
      );
    } finally {
      setGeneratingLink(false);
    }
  };

  const shareFieldLink = async () => {
    if (!fieldLink) return;
    try {
      await Share.share({
        message: `Installation sign-off link for ${installation.reference}: ${fieldLink}`,
        url: fieldLink,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  // The photo just picked on this device, shown as a preview immediately and
  // kept around (even if the upload fails) so the engineer always sees it.
  const [pendingPhoto, setPendingPhoto] = useState<PickedImage | null>(null);

  const handleStartCustomerSign = () => {
    setSignerNameInput('');
    setSignerModalVisible(true);
  };

  const handleConfirmSignerName = () => {
    if (!signerNameInput.trim()) {
      Alert.alert('Sign-off', 'Please enter the signer name.');
      return;
    }
    setPendingSignerName(signerNameInput.trim());
    setSignerModalVisible(false);
    setCustomerPadVisible(true);
  };

  const handleCustomerSignConfirm = async (fileUri: string) => {
    setCustomerPadVisible(false);
    setBanner(null);
    setSigningCustomer(true);
    try {
      await api.signInstallationCustomer(installation.reference, pendingSignerName, fileUri);
      onReload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setBanner(msg);
    } finally {
      setSigningCustomer(false);
    }
  };

  // Submit the engineer signature (+ optional customer photo) — closes the
  // installation and generates the PDF.
  const submitEngineerSignature = async (fileUri: string, photo?: PickedImage) => {
    setBanner(null);
    setSigningEngineer(true);
    try {
      await api.signInstallationEngineer(installation.reference, fileUri, photo);
      onReload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setBanner(msg);
    } finally {
      setSigningEngineer(false);
    }
  };

  // After the engineer signs, prompt them to capture the customer's photo, then
  // submit the signature + photo together. The photo is optional (Skip allowed).
  const handleEngineerSignConfirm = (fileUri: string) => {
    setEngineerPadVisible(false);
    const pick = async (source: () => Promise<PickedImage[]>) => {
      try {
        const picked = await source();
        if (!picked.length) {
          handleEngineerSignConfirm(fileUri); // cancelled — re-prompt
          return;
        }
        // Show the preview right away, then upload.
        setPendingPhoto(picked[0]);
        submitEngineerSignature(fileUri, picked[0]);
      } catch (e) {
        setBanner(e instanceof ApiError ? e.message : (e as Error).message);
      }
    };
    Alert.alert(
      'Add customer photo',
      'Capture a photo of the customer for the installation record.',
      [
        { text: 'Take photo', onPress: () => pick(takePhoto) },
        { text: 'Choose from library', onPress: () => pick(pickFromLibrary) },
        {
          text: 'Skip & finish',
          style: 'cancel',
          onPress: () => submitEngineerSignature(fileUri),
        },
      ],
    );
  };

  const handleViewPdf = async () => {
    setBanner(null);
    setPdfLoading(true);
    try {
      const result = await api.getInstallationPdf(installation.reference);
      await WebBrowser.openBrowserAsync(result.url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        Alert.alert('PDF Not Ready', 'The installation PDF has not been generated yet. Please try again after both signatures are collected.');
      } else {
        const msg = e instanceof ApiError ? e.message : (e as Error).message;
        setBanner(msg);
      }
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <Section title="Sign-off">
      {banner && <Banner message={banner} tone="danger" />}

      {/* Off-field signing — send the link to a sub-engineer who captures both
          signatures and installation photos on site. */}
      {installation.status === 'COMPLETED' && !resolution?.engineer_signed_at && (
        <View style={{ marginBottom: spacing.md }}>
          <Text style={styles.signoffLabel}>Off-field signing</Text>
          {fieldMode ? (
            <>
              <Text
                style={[styles.signedInfo, { color: colors.inkSubtle, fontWeight: '400' }]}
              >
                Link sent to a sub-engineer — on-site signing is paused until
                they submit.
              </Text>
              {fieldLink ? (
                <>
                  <Text selectable style={styles.linkBox}>
                    {fieldLink}
                  </Text>
                  <Button
                    title="Share link"
                    variant="secondary"
                    icon="share-outline"
                    onPress={shareFieldLink}
                  />
                </>
              ) : (
                // `fieldLink` only lives in this screen's state, so re-opening
                // the installation loses it and left no way to resend. The
                // endpoint is idempotent — it returns the SAME token rather
                // than minting a new one — so asking again is safe.
                <Button
                  title="Show signing link"
                  variant="secondary"
                  icon="link-outline"
                  loading={generatingLink}
                  onPress={generateFieldLink}
                />
              )}
            </>
          ) : canAct && hasSubEngineer ? (
            <Button
              title="Generate sub-engineer signing link"
              variant="secondary"
              icon="link-outline"
              loading={generatingLink}
              onPress={generateFieldLink}
              style={{ marginBottom: spacing.sm }}
            />
          ) : canAct ? (
            <Text
              style={[styles.signedInfo, { color: colors.inkSubtle, fontWeight: '400' }]}
            >
              Add a field sub-engineer above to enable off-field signing.
            </Text>
          ) : null}
          <Divider style={{ marginVertical: spacing.md }} />
        </View>
      )}

      {/* Customer signature */}
      <Text style={styles.signoffLabel}>Customer Signature</Text>
      {resolution?.customer_signed_at ? (
        <Text style={styles.signedInfo}>
          Signed by {resolution.customer_signer_name} · {formatDateTime(resolution.customer_signed_at)}
        </Text>
      ) : canAct && !fieldMode ? (
        <Button
          title="Collect Customer Signature"
          variant="secondary"
          icon="create-outline"
          onPress={handleStartCustomerSign}
          loading={signingCustomer}
          style={{ marginBottom: spacing.sm }}
        />
      ) : (
        <Text style={[styles.signedInfo, { color: colors.inkSubtle, fontWeight: '400' }]}>
          Awaiting customer signature.
        </Text>
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      {/* Engineer signature */}
      <Text style={styles.signoffLabel}>Engineer Signature</Text>
      {resolution?.engineer_signed_at ? (
        <Text style={styles.signedInfo}>
          Signed · {formatDateTime(resolution.engineer_signed_at)}
        </Text>
      ) : canAct && !fieldMode ? (
        <Button
          title="Add Engineer Signature"
          variant="secondary"
          icon="create-outline"
          onPress={() => setEngineerPadVisible(true)}
          loading={signingEngineer}
          style={{ marginBottom: spacing.sm }}
        />
      ) : (
        <Text style={[styles.signedInfo, { color: colors.inkSubtle, fontWeight: '400' }]}>
          Awaiting engineer signature.
        </Text>
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      {/* Customer photo — captured during engineer sign-off (read-only here) */}
      <Text style={styles.signoffLabel}>Customer Photo</Text>
      {serverPhotoCaptured ? (
        <Text style={styles.signedInfo}>
          Captured · {formatDateTime(resolution?.customer_photo_captured_at)}
        </Text>
      ) : pendingPhoto ? (
        <Text style={styles.signedInfo}>
          {signingEngineer ? 'Uploading photo…' : 'Photo ready.'}
        </Text>
      ) : (
        <Text style={[styles.signedInfo, { color: colors.inkSubtle, fontWeight: '400' }]}>
          {resolution?.engineer_signed_at
            ? 'No photo captured.'
            : 'Captured when the engineer signs off.'}
        </Text>
      )}
      {pendingPhoto ? (
        <AttachmentGallery urls={[pendingPhoto.uri]} size={96} />
      ) : (
        !!resolution?.customer_photo_url && (
          <AttachmentGallery urls={[resolution.customer_photo_url]} size={96} />
        )
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      {/* PDF — Admin/Manager or the assigned engineer only (backend gates it). */}
      {canAct && (
        <Button
          title="View Installation PDF"
          variant="ghost"
          icon="document-outline"
          onPress={handleViewPdf}
          loading={pdfLoading}
        />
      )}

      {/* Signer name modal */}
      <Modal
        visible={signerModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSignerModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Customer Sign-off</Text>
            <Text style={styles.modalSubtitle}>
              Enter the name of the person signing on behalf of the customer.
            </Text>
            <Field
              label="Signer Name"
              required
              value={signerNameInput}
              onChangeText={setSignerNameInput}
              placeholder="e.g. Ramesh Kumar"
              autoCapitalize="words"
            />
            <View style={styles.modalActions}>
              <Button
                title="Cancel"
                variant="secondary"
                fullWidth={false}
                onPress={() => setSignerModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Next"
                fullWidth={false}
                onPress={handleConfirmSignerName}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Customer signature pad */}
      <SignaturePad
        visible={customerPadVisible}
        title="Customer Signature"
        caption={pendingSignerName ? `Signing as: ${pendingSignerName}` : undefined}
        onCancel={() => setCustomerPadVisible(false)}
        onConfirm={handleCustomerSignConfirm}
      />

      {/* Engineer signature pad */}
      <SignaturePad
        visible={engineerPadVisible}
        title="Engineer Signature"
        caption="Engineer confirms installation is complete"
        onCancel={() => setEngineerPadVisible(false)}
        onConfirm={handleEngineerSignConfirm}
      />
    </Section>
  );
}

/* ─── Activity ─── */

function ActivitySection({
  reference,
  api,
}: {
  reference: string;
  api: ReturnType<typeof useApi>;
}) {
  const { data: events, loading } = useQuery<InstallationEvent[]>(
    () => api.installationEvents(reference),
    [reference],
  );

  const sorted = [...(events ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <Section title="Activity">
      {loading && <Text style={styles.dimText}>Loading…</Text>}
      {!loading && sorted.length === 0 && (
        <Text style={styles.dimText}>No activity yet.</Text>
      )}
      {sorted.map((event, idx) => (
        <View key={event.id}>
          {idx > 0 && <View style={styles.timelineDivider} />}
          <View style={styles.eventRow}>
            <View style={styles.eventDot} />
            <View style={styles.eventContent}>
              <View style={styles.eventHeader}>
                <Text style={styles.eventType}>{prettyEnum(event.event_type)}</Text>
                <Text style={styles.eventTime}>{timeAgo(event.created_at)}</Text>
              </View>
              <Text style={styles.eventActor}>
                {event.actor ? event.actor.name : 'System'}
              </Text>
              {event.from_status && event.to_status && (
                <Text style={styles.eventStatus}>
                  {prettyEnum(event.from_status)} → {prettyEnum(event.to_status)}
                </Text>
              )}
              {event.note ? (
                <Text style={styles.eventNote}>{event.note}</Text>
              ) : null}
            </View>
          </View>
        </View>
      ))}
    </Section>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  holdCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  holdTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.warn },
  holdReason: { fontSize: fontSize.md, color: colors.ink, lineHeight: 21 },
  holdHint: { fontSize: fontSize.sm, color: colors.warn, lineHeight: 19 },
  holdBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  holdSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  holdSheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  holdSheetHint: { fontSize: fontSize.sm, color: colors.inkSubtle, lineHeight: 19 },
  holdSheetActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  root: { flex: 1, backgroundColor: colors.surfaceRaised },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },

  headerCard: { padding: spacing.lg, gap: spacing.sm },
  business: { fontSize: fontSize.xl, fontWeight: '700', color: colors.ink },
  badgeRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  headerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  ref: {
    fontFamily: 'monospace',
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: colors.inkMuted,
  },
  time: { fontSize: fontSize.xs, color: colors.inkSubtle },

  phoneLink: {
    fontSize: fontSize.sm,
    color: colors.info,
    fontWeight: '500',
    textAlign: 'right',
  },

  invoiceValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md },
  invoiceValue: { fontSize: fontSize.sm, color: colors.ink, fontFamily: 'monospace', textAlign: 'right', flexShrink: 1 },
  invoiceEdit: { fontSize: fontSize.sm, color: colors.info, fontWeight: '500' },
  expectedDate: { fontSize: fontSize.sm, color: colors.ink, textAlign: 'right', flexShrink: 1 },
  expectedRel: { color: colors.info, fontWeight: '600' },
  docValueWrap: { alignItems: 'flex-end', gap: spacing.xs, flexShrink: 1 },
  // One document per line: name truncates so Remove never gets pushed off.
  docRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  docLink: { fontSize: fontSize.sm, color: colors.info, textAlign: 'right' },
  docNone: { fontSize: fontSize.sm, color: colors.inkSubtle },
  docActionsRow: { flexDirection: 'row', gap: spacing.md },
  docRemove: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '500' },
  invoiceEditBox: { paddingVertical: spacing.sm, gap: spacing.sm },
  invoiceEditLabel: { fontSize: fontSize.sm, color: colors.inkSubtle, fontWeight: '500' },
  invoiceBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },

  addressWrap: { alignItems: 'flex-end', gap: spacing.xs, flexShrink: 1 },
  addressLine: { fontSize: fontSize.sm, color: colors.ink, textAlign: 'right' },
  addressActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },

  workflowBlock: { gap: spacing.sm },
  reassignBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  reassignHint: { fontSize: fontSize.sm, color: colors.inkSubtle, lineHeight: 20 },
  workflowNote: {
    fontSize: fontSize.sm,
    color: colors.inkMuted,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  timestamps: { gap: 4, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.surfaceSunken },
  tsRow: { fontSize: fontSize.xs, color: colors.inkSubtle },

  dimText: { fontSize: fontSize.sm, color: colors.inkSubtle, fontStyle: 'italic' },

  noteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  noteAuthor: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink, flex: 1 },
  noteRole: { fontWeight: '400', color: colors.inkSubtle },
  noteTime: { fontSize: fontSize.xs, color: colors.inkSubtle },
  noteBody: { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 20 },

  signoffLabel: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  signedInfo: {
    fontSize: fontSize.sm,
    color: colors.success,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  linkBox: {
    fontSize: fontSize.xs,
    color: colors.inkSoft,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.xl,
    width: '100%',
    gap: spacing.md,
  },
  modalTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  modalSubtitle: { fontSize: fontSize.sm, color: colors.inkSubtle },
  modalActions: { flexDirection: 'row', gap: spacing.md },

  eventRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.sm },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lineStrong,
    marginTop: 6,
    flexShrink: 0,
  },
  eventContent: { flex: 1, gap: 2 },
  eventHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eventType: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink, flex: 1 },
  eventTime: { fontSize: fontSize.xs, color: colors.inkSubtle },
  eventActor: { fontSize: fontSize.xs, color: colors.inkSubtle },
  eventStatus: { fontSize: fontSize.xs, color: colors.inkMuted, fontStyle: 'italic' },
  eventNote: { fontSize: fontSize.xs, color: colors.inkMuted, marginTop: 2 },
  timelineDivider: { height: 1, backgroundColor: colors.surfaceSunken, marginLeft: spacing.xl },
});
