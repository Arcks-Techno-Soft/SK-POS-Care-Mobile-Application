/** Spare-part shipments — courier tracking with item lines. */

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
import { formatDateTime } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { Shipment, TicketDetail } from '@/lib/types';

interface Props {
  reference: string;
  ticket: TicketDetail;
  reload: () => void;
}

interface DraftItem {
  key: string;
  name: string;
  quantity: string;
}

function errMsg(e: unknown): string {
  return e instanceof ApiError
    ? e.message
    : (e as Error)?.message ?? 'Something went wrong.';
}

export default function TicketShipments({ reference }: Props) {
  const api = useApi();
  const shipmentsQuery = useQuery<Shipment[]>(
    () => api.listShipments(reference),
    [reference],
  );

  const [addOpen, setAddOpen] = useState(false);
  const [deliveringId, setDeliveringId] = useState<number | null>(null);

  const shipments = shipmentsQuery.data ?? [];

  const markDelivered = async (shipmentId: number) => {
    setDeliveringId(shipmentId);
    try {
      await api.deliverShipment(reference, shipmentId);
      shipmentsQuery.reload();
    } catch (e) {
      Alert.alert('Shipments', errMsg(e));
    } finally {
      setDeliveringId(null);
    }
  };

  return (
    <Section
      title="Spare-part shipments"
      subtitle={shipments.length ? `${shipments.length} shipment${shipments.length === 1 ? '' : 's'}` : undefined}
    >
      <View style={styles.body}>
        {shipmentsQuery.loading && !shipmentsQuery.data ? (
          <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.md }} />
        ) : shipmentsQuery.error && !shipmentsQuery.data ? (
          <Banner message={shipmentsQuery.error} />
        ) : shipments.length === 0 ? (
          <Text style={styles.empty}>No shipments recorded.</Text>
        ) : (
          shipments.map((s, i) => (
            <View key={s.id}>
              {i > 0 && <Divider style={{ marginVertical: spacing.md }} />}
              <View style={styles.shipHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.courier}>{s.courier_name}</Text>
                  {!!s.tracking_id && (
                    <Text style={styles.tracking}>{s.tracking_id}</Text>
                  )}
                </View>
                {s.delivered_at ? (
                  <Badge label="Delivered" tone="success" />
                ) : (
                  <Badge label="In transit" tone="info" />
                )}
              </View>
              <Text style={styles.meta}>
                Departed {formatDateTime(s.departed_at)}
              </Text>
              {s.delivered_at && (
                <Text style={styles.meta}>
                  Delivered {formatDateTime(s.delivered_at)}
                </Text>
              )}
              {s.items.length > 0 && (
                <View style={styles.itemList}>
                  {s.items.map((it) => (
                    <Text key={it.id} style={styles.itemLine}>
                      • {it.name} × {it.quantity}
                    </Text>
                  ))}
                </View>
              )}
              {!s.delivered_at && (
                <View style={{ marginTop: spacing.sm }}>
                  <Button
                    title="Mark delivered"
                    icon="checkmark-circle-outline"
                    variant="secondary"
                    size="sm"
                    loading={deliveringId === s.id}
                    onPress={() => markDelivered(s.id)}
                  />
                </View>
              )}
            </View>
          ))
        )}

        <Divider style={{ marginVertical: spacing.sm }} />
        <Button
          title="Add shipment"
          icon="add"
          variant="secondary"
          onPress={() => setAddOpen(true)}
        />
      </View>

      <AddShipmentModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreate={async (body) => {
          try {
            await api.createShipment(reference, body);
            setAddOpen(false);
            shipmentsQuery.reload();
          } catch (e) {
            Alert.alert('Shipments', errMsg(e));
            throw e;
          }
        }}
      />
    </Section>
  );
}

/* ---------------- Add shipment modal ---------------- */

function AddShipmentModal({
  visible,
  onClose,
  onCreate,
}: {
  visible: boolean;
  onClose: () => void;
  onCreate: (body: {
    courier_name: string;
    tracking_id?: string;
    items: { name?: string; quantity?: number }[];
  }) => Promise<void>;
}) {
  const [courier, setCourier] = useState('');
  const [tracking, setTracking] = useState('');
  const [items, setItems] = useState<DraftItem[]>([
    { key: 'i0', name: '', quantity: '1' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setWasVisible(true);
    setCourier('');
    setTracking('');
    setItems([{ key: `i${Date.now()}`, name: '', quantity: '1' }]);
    setError(null);
  }
  if (!visible && wasVisible) setWasVisible(false);

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    if (error) setError(null);
  };

  const addItemRow = () =>
    setItems((prev) => [
      ...prev,
      { key: `i${Date.now()}`, name: '', quantity: '1' },
    ]);

  const removeItemRow = (key: string) =>
    setItems((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));

  const submit = async () => {
    if (!courier.trim()) {
      setError('Courier name is required.');
      return;
    }
    const filled = items.filter((it) => it.name.trim());
    if (filled.length === 0) {
      setError('Add at least one item.');
      return;
    }
    const payloadItems: { name: string; quantity: number }[] = [];
    for (const it of filled) {
      const q = Number(it.quantity);
      if (isNaN(q) || q < 1) {
        setError(`Quantity for "${it.name}" must be at least 1.`);
        return;
      }
      payloadItems.push({ name: it.name.trim(), quantity: Math.round(q) });
    }
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        courier_name: courier.trim(),
        tracking_id: tracking.trim() || undefined,
        items: payloadItems,
      });
    } catch {
      // surfaced upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, styles.tallSheet]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Add shipment</Text>
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

            <Field
              label="Courier"
              value={courier}
              onChangeText={(t) => {
                setCourier(t);
                if (error) setError(null);
              }}
              placeholder="Courier company"
              required
            />
            <Field
              label="Tracking ID"
              value={tracking}
              onChangeText={setTracking}
              placeholder="Tracking number"
            />

            <Text style={styles.groupLabel}>Items</Text>
            {items.map((it, idx) => (
              <View key={it.key} style={styles.itemRow}>
                <View style={{ flex: 3 }}>
                  <Field
                    value={it.name}
                    onChangeText={(t) => updateItem(it.key, { name: t })}
                    placeholder={`Item ${idx + 1} name`}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Field
                    value={it.quantity}
                    onChangeText={(t) => updateItem(it.key, { quantity: t })}
                    placeholder="Qty"
                    keyboardType="number-pad"
                  />
                </View>
                {items.length > 1 && (
                  <Pressable
                    onPress={() => removeItemRow(it.key)}
                    hitSlop={8}
                    style={styles.removeItem}
                  >
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </Pressable>
                )}
              </View>
            ))}
            <Button
              title="Add another item"
              icon="add"
              variant="ghost"
              size="sm"
              onPress={addItemRow}
            />

            <Button
              title="Create shipment"
              icon="cube-outline"
              loading={saving}
              onPress={submit}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs },
  empty: { fontSize: fontSize.sm, color: colors.inkSubtle, paddingVertical: spacing.xs },

  shipHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  courier: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  tracking: {
    fontFamily: 'monospace',
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: 1,
  },
  meta: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 3 },
  itemList: { marginTop: spacing.sm, gap: 2 },
  itemLine: { fontSize: fontSize.sm, color: colors.inkSoft },

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
  groupLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  removeItem: { padding: 4, marginTop: 2 },
});
