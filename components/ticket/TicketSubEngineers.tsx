/** Field sub-engineers — roster picks and manual entries with editable fees. */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Section } from '@/components/ui/Section';
import { Badge, Banner, Button, Divider, Field } from '@/components/ui/kit';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/auth';
import { formatINR } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { RosterContact, SubEngineer, TicketDetail } from '@/lib/types';

interface Props {
  reference: string;
  ticket: TicketDetail;
  reload: () => void;
}

function errMsg(e: unknown): string {
  return e instanceof ApiError
    ? e.message
    : (e as Error)?.message ?? 'Something went wrong.';
}

export default function TicketSubEngineers({ reference, ticket }: Props) {
  const api = useApi();
  const subsQuery = useQuery<SubEngineer[]>(
    () => api.listSubEngineers(reference),
    [reference],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [feeFor, setFeeFor] = useState<SubEngineer | null>(null);

  const subs = subsQuery.data ?? [];
  const canAdd = ticket.status !== 'OPEN';

  return (
    <Section
      title="Field sub-engineers"
      subtitle={subs.length ? `${subs.length} assigned` : undefined}
    >
      <View style={styles.body}>
        {subsQuery.loading && !subsQuery.data ? (
          <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.md }} />
        ) : subsQuery.error && !subsQuery.data ? (
          <Banner message={subsQuery.error} />
        ) : subs.length === 0 ? (
          <Text style={styles.empty}>No sub-engineers assigned.</Text>
        ) : (
          subs.map((sub, i) => (
            <View key={sub.id}>
              {i > 0 && <Divider style={{ marginVertical: spacing.md }} />}
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{sub.name}</Text>
                  {!!sub.phone && <Text style={styles.meta}>{sub.phone}</Text>}
                  {!!sub.location && <Text style={styles.meta}>{sub.location}</Text>}
                </View>
                <Badge
                  label={sub.fee_inr != null ? formatINR(sub.fee_inr) : 'Fee not set'}
                  tone={sub.fee_inr != null ? 'info' : 'neutral'}
                />
              </View>
              <View style={styles.rowActions}>
                <Button
                  title="Edit fee"
                  variant="secondary"
                  size="sm"
                  fullWidth={false}
                  onPress={() => setFeeFor(sub)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Remove"
                  variant="danger"
                  size="sm"
                  fullWidth={false}
                  onPress={() =>
                    Alert.alert(
                      'Remove sub-engineer',
                      `Remove ${sub.name} from this ticket?`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Remove',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await api.removeSubEngineer(reference, sub.id);
                              subsQuery.reload();
                            } catch (e) {
                              Alert.alert('Sub-engineers', errMsg(e));
                            }
                          },
                        },
                      ],
                    )
                  }
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ))
        )}

        <Divider style={{ marginVertical: spacing.sm }} />
        <Button
          title="Add sub-engineer"
          icon="add"
          variant="secondary"
          disabled={!canAdd}
          onPress={() => setAddOpen(true)}
        />
        {!canAdd && (
          <Text style={styles.hint}>
            Acknowledge the ticket before adding sub-engineers.
          </Text>
        )}
      </View>

      <FeeModal
        sub={feeFor}
        onClose={() => setFeeFor(null)}
        onSave={async (fee) => {
          if (!feeFor) return;
          try {
            await api.updateSubEngineerFee(reference, feeFor.id, fee);
            setFeeFor(null);
            subsQuery.reload();
          } catch (e) {
            Alert.alert('Sub-engineers', errMsg(e));
            throw e;
          }
        }}
      />

      <AddModal
        visible={addOpen}
        reference={reference}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          subsQuery.reload();
        }}
      />
    </Section>
  );
}

/* ---------------- Fee edit modal ---------------- */

function FeeModal({
  sub,
  onClose,
  onSave,
}: {
  sub: SubEngineer | null;
  onClose: () => void;
  onSave: (fee: number) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the field whenever a new sub is opened.
  const [openedId, setOpenedId] = useState<number | null>(null);
  if (sub && sub.id !== openedId) {
    setOpenedId(sub.id);
    setValue(sub.fee_inr != null ? String(sub.fee_inr) : '');
    setError(null);
  }

  const submit = async () => {
    const fee = Number(value);
    if (value.trim() === '' || isNaN(fee) || fee < 0) {
      setError('Enter a valid fee amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(Math.round(fee));
    } catch {
      // onSave already surfaced the error.
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={!!sub}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Sub-engineer fee</Text>
          {!!sub && <Text style={styles.sheetHint}>{sub.name}</Text>}
          <Field
            label="Fee (₹)"
            value={value}
            onChangeText={(t) => {
              setValue(t);
              if (error) setError(null);
            }}
            placeholder="0"
            keyboardType="number-pad"
            error={error ?? undefined}
          />
          <View style={styles.sheetActions}>
            <Button
              title="Cancel"
              variant="secondary"
              fullWidth={false}
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button
              title="Save fee"
              loading={saving}
              fullWidth={false}
              onPress={submit}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ---------------- Add sub-engineer modal ---------------- */

function AddModal({
  visible,
  reference,
  onClose,
  onAdded,
}: {
  visible: boolean;
  reference: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const api = useApi();

  const [suggestions, setSuggestions] = useState<RosterContact[] | null>(null);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [suggError, setSuggError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | 'manual' | null>(null);

  // Load suggestions the first time the modal opens.
  const [hasOpened, setHasOpened] = useState(false);
  if (visible && !hasOpened) {
    setHasOpened(true);
    setLoadingSugg(true);
    api
      .subEngineerSuggestions(reference)
      .then((list) => setSuggestions(list))
      .catch((e) => setSuggError(errMsg(e)))
      .finally(() => setLoadingSugg(false));
  }
  if (!visible && hasOpened) {
    setHasOpened(false);
    setSuggestions(null);
    setSuggError(null);
    setName('');
    setPhone('');
    setLocation('');
    setError(null);
    setBusyId(null);
  }

  const addFromRoster = async (contact: RosterContact) => {
    setBusyId(contact.id);
    try {
      await api.addSubEngineer(reference, { roster_id: contact.id });
      onAdded();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  const addManual = async () => {
    if (!name.trim() || !phone.trim()) {
      setError('Name and phone are required.');
      return;
    }
    setBusyId('manual');
    setError(null);
    try {
      await api.addSubEngineer(reference, {
        name: name.trim(),
        phone: phone.trim(),
        location: location.trim() || undefined,
      });
      onAdded();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, styles.tallSheet]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Add sub-engineer</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.inkMuted} />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={{ gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
          {error && <Banner message={error} />}

          <Text style={styles.groupLabel}>From roster</Text>
          {loadingSugg ? (
            <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.sm }} />
          ) : suggError ? (
            <Banner message={suggError} tone="warn" />
          ) : suggestions && suggestions.length > 0 ? (
            suggestions.map((c) => (
              <View key={c.id} style={styles.suggRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.meta}>
                    {c.phone}
                    {c.district ? ` · ${c.district}` : ''}
                  </Text>
                </View>
                <Button
                  title="Add"
                  size="sm"
                  fullWidth={false}
                  loading={busyId === c.id}
                  disabled={busyId != null && busyId !== c.id}
                  onPress={() => addFromRoster(c)}
                />
              </View>
            ))
          ) : (
            <Text style={styles.empty}>No roster suggestions.</Text>
          )}

          <Divider style={{ marginVertical: spacing.md }} />

          <Text style={styles.groupLabel}>Manual entry</Text>
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Sub-engineer name"
            required
          />
          <Field
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            placeholder="Phone number"
            keyboardType="phone-pad"
            required
          />
          <Field
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="City / area"
          />
          <Button
            title="Add manually"
            icon="person-add-outline"
            loading={busyId === 'manual'}
            disabled={busyId != null && busyId !== 'manual'}
            onPress={addManual}
          />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  empty: { fontSize: fontSize.sm, color: colors.inkSubtle, paddingVertical: spacing.xs },
  hint: { fontSize: fontSize.xs, color: colors.inkSubtle },

  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  name: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  meta: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 1 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  tallSheet: { maxHeight: '88%' },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  sheetHint: { fontSize: fontSize.sm, color: colors.inkSubtle },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  groupLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
  },
  suggRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
});
