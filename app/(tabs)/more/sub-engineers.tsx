/**
 * Sub-engineer roster — Admin only.
 * Lists all roster contacts with district filter, add/edit/toggle-active.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/Screen';
import { EmptyState, ErrorView, Loading } from '@/components/States';
import { Badge, Banner, Button, Card, Divider, Field } from '@/components/ui/kit';
import { useApi, useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/hooks';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { RosterContact } from '@/lib/types';

/* ---------- add-contact form modal ---------- */

interface AddForm {
  name: string;
  phone: string;
  district: string;
}

const EMPTY_ADD: AddForm = { name: '', phone: '', district: '' };

function AddContactModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState<AddForm>(EMPTY_ADD);
  const [errors, setErrors] = useState<Partial<AddForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set(field: keyof AddForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<AddForm> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    if (!form.district.trim()) errs.district = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createRosterContact({
        name: form.name.trim(),
        phone: form.phone.trim(),
        district: form.district.trim(),
      });
      setForm(EMPTY_ADD);
      setErrors({});
      onCreated();
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setForm(EMPTY_ADD);
    setErrors({});
    setSubmitError(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add contact</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalBody}
          keyboardShouldPersistTaps="handled"
        >
          {!!submitError && <Banner message={submitError} tone="danger" />}

          <Field
            label="Name"
            required
            value={form.name}
            onChangeText={(v) => set('name', v)}
            error={errors.name}
            autoCapitalize="words"
          />
          <Field
            label="Phone"
            required
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            error={errors.phone}
            keyboardType="phone-pad"
          />
          <Field
            label="District"
            required
            value={form.district}
            onChangeText={(v) => set('district', v)}
            error={errors.district}
            autoCapitalize="words"
            placeholder="e.g. Bengaluru Urban"
          />

          <Button title="Add contact" loading={submitting} onPress={handleSubmit} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ---------- edit-contact modal ---------- */

interface EditForm {
  name: string;
  phone: string;
  district: string;
}

function EditContactModal({
  contact,
  onClose,
  onSaved,
}: {
  contact: RosterContact | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState<EditForm>({
    name: contact?.name ?? '',
    phone: contact?.phone ?? '',
    district: contact?.district ?? '',
  });
  const [errors, setErrors] = useState<Partial<EditForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Sync form fields whenever a different contact is opened
  useEffect(() => {
    if (contact) {
      setForm({ name: contact.name, phone: contact.phone, district: contact.district });
      setErrors({});
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id]);

  function set(field: keyof EditForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<EditForm> = {};
    if (!form.name.trim()) errs.name = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    if (!form.district.trim()) errs.district = 'Required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!contact || !validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.updateRosterContact(contact.id, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        district: form.district.trim(),
      });
      onSaved();
      onClose();
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setErrors({});
    setSubmitError(null);
    onClose();
  }

  return (
    <Modal visible={!!contact} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Edit contact</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalBody}
          keyboardShouldPersistTaps="handled"
        >
          {!!submitError && <Banner message={submitError} tone="danger" />}

          <Field
            label="Name"
            required
            value={form.name}
            onChangeText={(v) => set('name', v)}
            error={errors.name}
            autoCapitalize="words"
          />
          <Field
            label="Phone"
            required
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            error={errors.phone}
            keyboardType="phone-pad"
          />
          <Field
            label="District"
            required
            value={form.district}
            onChangeText={(v) => set('district', v)}
            error={errors.district}
            autoCapitalize="words"
          />

          <Button title="Save changes" loading={submitting} onPress={handleSubmit} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ---------- roster contact card ---------- */

function RosterCard({
  contact,
  onToggleActive,
  toggling,
  onEdit,
}: {
  contact: RosterContact;
  onToggleActive: (contact: RosterContact) => void;
  toggling: boolean;
  onEdit: (contact: RosterContact) => void;
}) {
  return (
    <Card style={styles.rosterCard}>
      <View style={styles.rosterTop}>
        <View style={styles.rosterInfo}>
          <Text style={styles.rosterName} numberOfLines={1}>{contact.name}</Text>
          <View style={styles.rosterMeta}>
            <Ionicons name="call-outline" size={13} color={colors.inkSubtle} />
            <Text style={styles.rosterMetaText}>{contact.phone}</Text>
          </View>
          <View style={styles.rosterMeta}>
            <Ionicons name="location-outline" size={13} color={colors.inkSubtle} />
            <Text style={styles.rosterMetaText}>{contact.district}</Text>
          </View>
        </View>
        <Badge
          label={contact.active ? 'Active' : 'Inactive'}
          tone={contact.active ? 'success' : 'neutral'}
        />
      </View>

      <Divider style={styles.cardDivider} />

      <View style={styles.rosterActions}>
        <Button
          title={contact.active ? 'Deactivate' : 'Activate'}
          variant="secondary"
          size="sm"
          fullWidth={false}
          loading={toggling}
          onPress={() => onToggleActive(contact)}
        />
        <Button
          title="Edit"
          variant="ghost"
          size="sm"
          fullWidth={false}
          icon="pencil-outline"
          onPress={() => onEdit(contact)}
        />
      </View>
    </Card>
  );
}

/* ---------- main screen ---------- */

export default function SubEngineersScreen() {
  const { user } = useAuth();
  const api = useApi();
  const [districtFilter, setDistrictFilter] = useState('');
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editContact, setEditContact] = useState<RosterContact | null>(null);

  const { data, loading, refreshing, error, refresh } = useQuery<RosterContact[]>(
    () => api.listRoster(undefined, true),
    [],
  );

  if (user?.role !== 'ADMIN') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Sub-engineer roster' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="Admins only"
          subtitle="Only owners can manage the sub-engineer roster."
        />
      </Screen>
    );
  }

  /* client-side district filter */
  const trimmed = districtFilter.trim().toLowerCase();
  const filtered = data
    ? trimmed
      ? data.filter((c) => c.district?.toLowerCase().includes(trimmed))
      : data
    : [];

  async function handleToggleActive(contact: RosterContact) {
    const action = contact.active ? 'Deactivate' : 'Activate';
    Alert.alert(
      `${action} ${contact.name}?`,
      contact.active
        ? 'This contact will no longer appear in suggestions.'
        : 'This contact will appear in sub-engineer suggestions.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: contact.active ? 'destructive' : 'default',
          onPress: async () => {
            setTogglingId(contact.id);
            try {
              await api.updateRosterContact(contact.id, { active: !contact.active });
              refresh();
            } catch (e) {
              Alert.alert('Error', (e as Error).message);
            } finally {
              setTogglingId(null);
            }
          },
        },
      ],
    );
  }

  const activeCount = data?.filter((c) => c.active).length ?? 0;
  const totalCount = data?.length ?? 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Sub-engineer roster' }} />
      <Screen scroll refreshing={refreshing} onRefresh={refresh}>
        <Button
          title="Add contact"
          icon="person-add-outline"
          variant="secondary"
          onPress={() => setShowAdd(true)}
        />

        <Field
          placeholder="Filter by district…"
          value={districtFilter}
          onChangeText={setDistrictFilter}
          autoCapitalize="words"
          autoCorrect={false}
        />

        {loading && !data ? (
          <Loading label="Loading roster…" />
        ) : error && !data ? (
          <ErrorView message={error} onRetry={refresh} />
        ) : (
          <>
            <Text style={styles.countLabel}>
              {filtered.length} contact{filtered.length === 1 ? '' : 's'}
              {trimmed ? ` in "${districtFilter.trim()}"` : ''}
              {totalCount > 0 ? ` · ${activeCount} active` : ''}
            </Text>

            {filtered.length === 0 ? (
              <EmptyState
                icon="people-outline"
                title="No contacts"
                subtitle={
                  trimmed
                    ? `No contacts match "${districtFilter.trim()}".`
                    : 'Add sub-engineer contacts to build the roster.'
                }
              />
            ) : (
              filtered.map((contact) => (
                <RosterCard
                  key={contact.id}
                  contact={contact}
                  onToggleActive={handleToggleActive}
                  toggling={togglingId === contact.id}
                  onEdit={setEditContact}
                />
              ))
            )}
          </>
        )}
      </Screen>

      <AddContactModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onCreated={refresh}
      />

      <EditContactModal
        contact={editContact}
        onClose={() => setEditContact(null)}
        onSaved={refresh}
      />
    </>
  );
}

const styles = StyleSheet.create({
  countLabel: {
    fontSize: fontSize.xs,
    color: colors.inkSubtle,
    fontWeight: '600',
  },

  rosterCard: {
    gap: spacing.sm,
  },
  rosterTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rosterInfo: {
    flex: 1,
    gap: 3,
  },
  rosterName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: 2,
  },
  rosterMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rosterMetaText: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
  },
  cardDivider: {
    marginVertical: spacing.xs,
  },
  rosterActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },

  /* modal */
  modalRoot: {
    flex: 1,
    backgroundColor: colors.surfaceRaised,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.ink,
  },
  modalBody: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxl,
  },
});
