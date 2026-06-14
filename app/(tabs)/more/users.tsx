/**
 * Staff accounts screen — Admin only.
 * Lists all users (managers + engineers) and allows activation/deactivation
 * and creating new staff accounts.
 */

import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
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
import { Avatar, Badge, Banner, Button, Card, Divider, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { useApi, useAuth } from '@/lib/auth';
import { useQuery } from '@/lib/hooks';
import { ASSIGNABLE_ROLES, roleLabel } from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { User } from '@/lib/types';

/* ---------- username validation ---------- */
const USERNAME_RE = /^[a-z0-9._-]{3,50}$/;

/* ---------- role options ---------- */
const ROLE_OPTIONS = ASSIGNABLE_ROLES.map((r) => ({ label: roleLabel(r), value: r }));

/* ---------- user card ---------- */

function UserCard({
  user,
  currentUserId,
  onToggleActive,
  toggling,
}: {
  user: User;
  currentUserId: number;
  onToggleActive: (user: User) => void;
  toggling: boolean;
}) {
  const isSelf = user.id === currentUserId;
  const tone = user.active ? 'success' : 'neutral';

  return (
    <Card style={styles.userCard}>
      <View style={styles.userCardTop}>
        <Avatar name={user.name} size={42} />
        <View style={styles.userInfo}>
          <Text style={styles.userName} numberOfLines={1}>{user.name}</Text>
          <Text style={styles.userRole}>{roleLabel(user.role)}</Text>
          <Text style={styles.userMeta} numberOfLines={1}>@{user.username}</Text>
        </View>
        <Badge label={user.active ? 'Active' : 'Inactive'} tone={tone} />
      </View>

      {(user.email || user.phone || user.district) && (
        <>
          <Divider style={styles.cardDivider} />
          <View style={styles.userDetails}>
            {!!user.email && (
              <View style={styles.detailRow}>
                <Ionicons name="mail-outline" size={13} color={colors.inkSubtle} />
                <Text style={styles.detailText} numberOfLines={1}>{user.email}</Text>
              </View>
            )}
            {!!user.phone && (
              <View style={styles.detailRow}>
                <Ionicons name="call-outline" size={13} color={colors.inkSubtle} />
                <Text style={styles.detailText}>{user.phone}</Text>
              </View>
            )}
            {!!user.district && (
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={13} color={colors.inkSubtle} />
                <Text style={styles.detailText}>{user.district}</Text>
              </View>
            )}
          </View>
        </>
      )}

      {!isSelf && (
        <>
          <Divider style={styles.cardDivider} />
          <Button
            title={user.active ? 'Deactivate' : 'Activate'}
            variant="secondary"
            size="sm"
            loading={toggling}
            onPress={() => onToggleActive(user)}
            style={{ alignSelf: 'flex-start' }}
            fullWidth={false}
          />
        </>
      )}
      {isSelf && (
        <Text style={styles.selfNote}>This is your account</Text>
      )}
    </Card>
  );
}

/* ---------- create-user form modal ---------- */

interface CreateForm {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  role: string;
  district: string;
}

const EMPTY_FORM: CreateForm = {
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  username: '',
  password: '',
  role: '',
  district: '',
};

function CreateUserModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const api = useApi();
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<CreateForm>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function set(field: keyof CreateForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const errs: Partial<CreateForm> = {};
    if (!form.first_name.trim()) errs.first_name = 'Required';
    if (!form.last_name.trim()) errs.last_name = 'Required';
    if (!form.phone.trim()) errs.phone = 'Required';
    if (!form.email.trim()) errs.email = 'Required';
    if (!form.username.trim()) {
      errs.username = 'Required';
    } else if (!USERNAME_RE.test(form.username)) {
      errs.username = 'Must be 3–50 lowercase letters, digits, . _ -';
    }
    if (!form.password) {
      errs.password = 'Required';
    } else if (form.password.length < 8) {
      errs.password = 'At least 8 characters';
    }
    if (!form.role) errs.role = 'Required';
    if (form.role === 'ENGINEER' && !form.district.trim()) errs.district = 'Required for engineers';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createUser({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        district: form.role === 'ENGINEER' ? form.district.trim() : undefined,
      });
      setForm(EMPTY_FORM);
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
    setForm(EMPTY_FORM);
    setErrors({});
    setSubmitError(null);
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.modalRoot}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Create staff account</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color={colors.inkMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.modalBody}
          keyboardShouldPersistTaps="handled"
        >
          {!!submitError && (
            <Banner message={submitError} tone="danger" />
          )}

          <View style={styles.nameRow}>
            <View style={{ flex: 1 }}>
              <Field
                label="First name"
                required
                value={form.first_name}
                onChangeText={(v) => set('first_name', v)}
                error={errors.first_name}
                autoCapitalize="words"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Last name"
                required
                value={form.last_name}
                onChangeText={(v) => set('last_name', v)}
                error={errors.last_name}
                autoCapitalize="words"
              />
            </View>
          </View>

          <Field
            label="Phone"
            required
            value={form.phone}
            onChangeText={(v) => set('phone', v)}
            error={errors.phone}
            keyboardType="phone-pad"
          />

          <Field
            label="Email"
            required
            value={form.email}
            onChangeText={(v) => set('email', v)}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Field
            label="Username"
            required
            value={form.username}
            onChangeText={(v) => set('username', v.toLowerCase())}
            error={errors.username}
            autoCapitalize="none"
            autoCorrect={false}
            hint="3–50 characters: letters, digits, . _ -"
          />

          <Field
            label="Password"
            required
            value={form.password}
            onChangeText={(v) => set('password', v)}
            error={errors.password}
            secureTextEntry
            hint="Minimum 8 characters"
          />

          <Select
            label="Role"
            required
            value={form.role || null}
            options={ROLE_OPTIONS}
            onChange={(v) => set('role', v)}
            sheetTitle="Select role"
          />
          {!!errors.role && <Text style={styles.fieldError}>{errors.role}</Text>}

          {form.role === 'ENGINEER' && (
            <Field
              label="District"
              required
              value={form.district}
              onChangeText={(v) => set('district', v)}
              error={errors.district}
              autoCapitalize="words"
              placeholder="e.g. Bengaluru Urban"
            />
          )}

          <Button
            title="Create account"
            loading={submitting}
            onPress={handleSubmit}
          />
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ---------- main screen ---------- */

export default function UsersScreen() {
  const { user: currentUser } = useAuth();
  const api = useApi();
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data, loading, refreshing, error, refresh } = useQuery<User[]>(
    () => api.listUsers(),
    [],
  );

  if (currentUser?.role !== 'ADMIN') {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Staff accounts' }} />
        <EmptyState
          icon="lock-closed-outline"
          title="Admins only"
          subtitle="Only owners can manage staff accounts."
        />
      </Screen>
    );
  }

  async function handleToggleActive(user: User) {
    const action = user.active ? 'Deactivate' : 'Activate';
    Alert.alert(
      `${action} ${user.name}?`,
      user.active
        ? 'This will prevent them from signing in.'
        : 'This will allow them to sign in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action,
          style: user.active ? 'destructive' : 'default',
          onPress: async () => {
            setTogglingId(user.id);
            try {
              await api.setUserActive(user.id, !user.active);
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

  return (
    <>
      <Stack.Screen options={{ title: 'Staff accounts' }} />
      <Screen scroll refreshing={refreshing} onRefresh={refresh}>
        <Button
          title="Create staff account"
          icon="person-add-outline"
          onPress={() => setShowCreate(true)}
          variant="secondary"
        />

        {loading && !data ? (
          <Loading label="Loading users…" />
        ) : error && !data ? (
          <ErrorView message={error} onRetry={refresh} />
        ) : !data?.length ? (
          <EmptyState
            icon="people-outline"
            title="No staff accounts"
            subtitle="Create accounts for managers and engineers."
          />
        ) : (
          data.map((u) => (
            <UserCard
              key={u.id}
              user={u}
              currentUserId={currentUser.id}
              onToggleActive={handleToggleActive}
              toggling={togglingId === u.id}
            />
          ))
        )}
      </Screen>

      <CreateUserModal
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={refresh}
      />
    </>
  );
}

const styles = StyleSheet.create({
  userCard: {
    gap: spacing.sm,
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: colors.ink,
  },
  userRole: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: colors.inkSubtle,
  },
  userMeta: {
    fontSize: fontSize.sm,
    color: colors.inkFaint,
  },
  cardDivider: {
    marginVertical: spacing.sm,
  },
  userDetails: {
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailText: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    flex: 1,
  },
  selfNote: {
    fontSize: fontSize.xs,
    color: colors.inkFaint,
    fontStyle: 'italic',
    marginTop: spacing.xs,
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
  nameRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldError: {
    fontSize: fontSize.xs,
    color: colors.danger,
    marginTop: -spacing.sm,
  },
});
