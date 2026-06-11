import * as WebBrowser from 'expo-web-browser';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { KeyboardAvoider } from '@/components/KeyboardAvoider';
import { PhotoPicker } from '@/components/PhotoPicker';
import { SignaturePad } from '@/components/SignaturePad';
import { ErrorView, Loading } from '@/components/States';
import { Badge, Banner, Button, Card, Divider, Field, KeyValue } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { prettyEnum, roleLabel } from '@/lib/options';
import { colors, fontSize, spacing, statusTone } from '@/lib/theme';
import type {
  InstallationDetail,
  InstallationEvent,
  InstallationNote,
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

  const canManage = user?.role === 'MANAGER' || user?.role === 'OWNER';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: installation?.reference ?? 'Installation' }} />

      {loading && !installation ? (
        <Loading label="Loading installation…" />
      ) : error && !installation ? (
        <ErrorView message={error} onRetry={reload} />
      ) : installation ? (
        <KeyboardAvoider style={styles.root}>
        <ScrollView
          style={styles.root}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
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
            onReload={reload}
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
            <Divider />
            <KeyValue label="Invoice Number" value={installation.invoice_number} mono />
          </Section>

          {/* 4. Work Notes */}
          <NotesSection reference={reference} api={api} />

          {/* 5. Sign-off (COMPLETED or CLOSED) */}
          {(installation.status === 'COMPLETED' || installation.status === 'CLOSED') && (
            <SignoffSection installation={installation} api={api} onReload={reload} />
          )}

          {/* 6. Activity */}
          <ActivitySection reference={reference} api={api} />
        </ScrollView>
        </KeyboardAvoider>
      ) : null}
    </View>
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
    Alert.alert('Mark Completed', 'Confirm that the installation is complete?', [
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
          <Button
            title="Mark Completed"
            icon="checkmark-circle-outline"
            onPress={handleComplete}
            loading={completing}
          />
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

/* ─── Notes ─── */

function NotesSection({
  reference,
  api,
}: {
  reference: string;
  api: ReturnType<typeof useApi>;
}) {
  const {
    data: notes,
    loading,
    reload: reloadNotes,
  } = useQuery<InstallationNote[]>(() => api.installationNotes(reference), [reference]);

  const [body, setBody] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [adding, setAdding] = useState(false);
  const [noteBanner, setNoteBanner] = useState<string | null>(null);

  const handleAddNote = async () => {
    if (!body.trim() && images.length === 0) {
      Alert.alert('Note', 'Please enter a note or attach a photo.');
      return;
    }
    setNoteBanner(null);
    setAdding(true);
    try {
      await api.addInstallationNote(reference, body.trim(), images);
      setBody('');
      setImages([]);
      reloadNotes();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setNoteBanner(msg);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Section title="Work Notes">
      {loading && (
        <Text style={styles.dimText}>Loading notes…</Text>
      )}

      {!loading && (!notes || notes.length === 0) && (
        <Text style={styles.dimText}>No notes yet.</Text>
      )}

      {(notes ?? []).map((note, idx) => (
        <View key={note.id}>
          {idx > 0 && <Divider style={{ marginVertical: spacing.sm }} />}
          <View style={styles.noteHeader}>
            <Text style={styles.noteAuthor}>
              {note.author.name}{' '}
              <Text style={styles.noteRole}>· {roleLabel(note.author.role)}</Text>
            </Text>
            <Text style={styles.noteTime}>{timeAgo(note.created_at)}</Text>
          </View>
          <Text style={styles.noteBody}>{note.body}</Text>
          {note.attachments.length > 0 && (
            <View style={{ marginTop: spacing.sm }}>
              <AttachmentGallery urls={note.attachments.map((a) => a.storage_url)} />
            </View>
          )}
        </View>
      ))}

      <Divider style={{ marginTop: spacing.md, marginBottom: spacing.md }} />

      {noteBanner && <Banner message={noteBanner} tone="danger" />}

      <Field
        label="Add note"
        value={body}
        onChangeText={setBody}
        placeholder="Describe the work done…"
        multiline
      />
      <PhotoPicker images={images} onChange={setImages} />
      <Button
        title="Add Note"
        variant="secondary"
        icon="chatbubble-outline"
        onPress={handleAddNote}
        loading={adding}
        style={{ marginTop: spacing.xs }}
      />
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

  const handleEngineerSignConfirm = async (fileUri: string) => {
    setEngineerPadVisible(false);
    setBanner(null);
    setSigningEngineer(true);
    try {
      await api.signInstallationEngineer(installation.reference, fileUri);
      onReload();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : (e as Error).message;
      setBanner(msg);
    } finally {
      setSigningEngineer(false);
    }
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

  workflowBlock: { gap: spacing.sm },
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
