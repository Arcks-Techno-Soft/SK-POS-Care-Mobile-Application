import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { AttemptsSection } from '@/components/AttemptsSection';
import { PhotoPicker } from '@/components/PhotoPicker';
import { SignaturePad } from '@/components/SignaturePad';
import { ErrorView, Loading } from '@/components/States';
import { Badge, Banner, Button, Card, Divider, Field, KeyValue } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { pickFromLibrary, takePhoto } from '@/lib/images';
import { usePendingTickets } from '@/lib/pending-tickets';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { INDIAN_STATES, prettyEnum, roleLabel } from '@/lib/options';
import { colors, fontSize, spacing, statusTone } from '@/lib/theme';
import type {
  InstallationDetail,
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

  const canManage = user?.role === 'MANAGER' || user?.role === 'ADMIN';
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
            api={api}
            onReload={reloadAndBadge}
          />

          {/* 3. Details */}
          <Section title="Details">
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
              (canManage || installation.assigned_engineer?.id === user?.id)
            }
            canStart={
              installation.status === 'ASSIGNED' &&
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

          {/* 5. Sign-off (COMPLETED or CLOSED) */}
          {(installation.status === 'COMPLETED' || installation.status === 'CLOSED') && (
            <SignoffSection installation={installation} api={api} onReload={reloadAndBadge} />
          )}

          {/* 6. Activity */}
          <ActivitySection reference={reference} api={api} />
        </KeyboardAwareScrollView>
      ) : null}
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

/* ─── Invoice document (view / upload / replace / remove) ─── */

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
  const doc = installation.invoice_document;

  const pickAndUpload = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      setBusy(true);
      await api.uploadInstallationInvoiceDocument(installation.reference, {
        uri: asset.uri,
        name: asset.name ?? 'invoice',
        type: asset.mimeType ?? 'application/octet-stream',
      });
      onReload();
    } catch (e) {
      Alert.alert(
        'Invoice document',
        e instanceof ApiError ? e.message : 'Could not upload the document.',
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    Alert.alert('Invoice document', 'Remove the uploaded invoice document?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await api.deleteInstallationInvoiceDocument(installation.reference);
            onReload();
          } catch (e) {
            Alert.alert(
              'Invoice document',
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
      label="Invoice Document"
      value={
        <View style={styles.docValueWrap}>
          {doc ? (
            <Pressable onPress={() => WebBrowser.openBrowserAsync(doc.storage_url)}>
              <Text style={styles.docLink} numberOfLines={1}>
                📄 {doc.filename}
              </Text>
            </Pressable>
          ) : (
            <Text style={styles.docNone}>No document</Text>
          )}
          {canEdit && (
            <View style={styles.docActionsRow}>
              <Pressable onPress={pickAndUpload} hitSlop={8} disabled={busy}>
                <Text style={styles.invoiceEdit}>
                  {busy ? 'Working…' : doc ? 'Replace' : 'Upload'}
                </Text>
              </Pressable>
              {doc && !busy && (
                <Pressable onPress={remove} hitSlop={8}>
                  <Text style={styles.docRemove}>Remove</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      }
    />
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
  api,
  onReload,
}: {
  installation: InstallationDetail;
  canManage: boolean;
  api: ReturnType<typeof useApi>;
  onReload: () => void;
}) {
  const [selectedEngineerId, setSelectedEngineerId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [selfAssigning, setSelfAssigning] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);

  // Finishing requires at least one completed attempt and none still open.
  const openAttempt = installation.attempts.find((a) => !a.ended_at) ?? null;
  const endedAttempts = installation.attempts.filter((a) => a.ended_at).length;
  const canFinish = !openAttempt && endedAttempts > 0;

  const { data: engineers } = useQuery<User[]>(
    () => api.listEngineers(),
    [],
  );

  const engineerOptions = (engineers ?? []).map((e) => ({
    label: e.name,
    value: String(e.id),
    sublabel: e.district ?? undefined,
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

      {installation.status === 'NEW' && (
        <View style={styles.workflowBlock}>
          <Select
            label="Assign to engineer"
            value={selectedEngineerId}
            onChange={setSelectedEngineerId}
            options={engineerOptions}
            placeholder="Select engineer…"
            sheetTitle="Select Engineer"
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

      {installation.status === 'ASSIGNED' && (
        <View style={styles.workflowBlock}>
          {canFinish ? (
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

      {/* Timestamps */}
      <View style={styles.timestamps}>
        {installation.created_by && (
          <Text style={styles.tsRow}>
            Created by {installation.created_by.name}
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
  api,
  onReload,
}: {
  installation: InstallationDetail;
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

  const resolution = installation.resolution;
  const serverPhotoCaptured = !!resolution?.customer_photo_captured_at;

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

      {/* Customer signature */}
      <Text style={styles.signoffLabel}>Customer Signature</Text>
      {resolution?.customer_signed_at ? (
        <Text style={styles.signedInfo}>
          Signed by {resolution.customer_signer_name} · {formatDateTime(resolution.customer_signed_at)}
        </Text>
      ) : (
        <Button
          title="Collect Customer Signature"
          variant="secondary"
          icon="create-outline"
          onPress={handleStartCustomerSign}
          loading={signingCustomer}
          style={{ marginBottom: spacing.sm }}
        />
      )}

      <Divider style={{ marginVertical: spacing.md }} />

      {/* Engineer signature */}
      <Text style={styles.signoffLabel}>Engineer Signature</Text>
      {resolution?.engineer_signed_at ? (
        <Text style={styles.signedInfo}>
          Signed · {formatDateTime(resolution.engineer_signed_at)}
        </Text>
      ) : (
        <Button
          title="Add Engineer Signature"
          variant="secondary"
          icon="create-outline"
          onPress={() => setEngineerPadVisible(true)}
          loading={signingEngineer}
          style={{ marginBottom: spacing.sm }}
        />
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

      {/* PDF */}
      <Button
        title="View Installation PDF"
        variant="ghost"
        icon="document-outline"
        onPress={handleViewPdf}
        loading={pdfLoading}
      />

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
  docValueWrap: { alignItems: 'flex-end', gap: spacing.xs, flexShrink: 1 },
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
