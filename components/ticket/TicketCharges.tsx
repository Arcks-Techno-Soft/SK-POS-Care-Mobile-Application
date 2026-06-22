/** Spares & charges — service fee, spare line items, and billing totals. */

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

import { KeyboardAwareSheet } from '@/components/KeyboardAwareSheet';
import { Section } from '@/components/ui/Section';
import { Badge, Banner, Button, Divider, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { formatINR } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { ticketIsOperable, ticketLockReason } from '@/lib/options';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type {
  ChargeLineItem,
  ChargesSummary,
  SpareCatalogItem,
  TicketDetail,
} from '@/lib/types';

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

export default function TicketCharges({ reference, ticket, reload }: Props) {
  const api = useApi();
  const { user } = useAuth();
  const chargesQuery = useQuery<ChargesSummary>(
    () => api.getCharges(reference),
    [reference],
  );

  const [feeOpen, setFeeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editLine, setEditLine] = useState<ChargeLineItem | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const charges = chargesQuery.data;
  const operable = ticketIsOperable(ticket.status);
  // Remote-support tickets carry no spare parts — show only the service fee.
  const isRemote = ticket.service_type === 'REMOTE_SUPPORT';

  // Out-of-warranty payment tracking. payment_status is null on legacy tickets
  // (created before the feature) — those never show payment UI.
  // `payment_required` is computed by the backend (out-of-warranty, or covered
  // with charges). Out-of-warranty additionally requires a positive amount.
  const outOfWarranty = ticket.warranty_status === 'OUT_OF_WARRANTY';
  const paymentPending =
    !!ticket.payment_required &&
    ticket.payment_status === 'PENDING' &&
    ticket.status === 'RESOLVED';
  const paymentCollected = ticket.payment_status === 'COLLECTED';
  // The ticket only *holds* for payment once both signatures are captured;
  // before that, "payment pending" is just an early heads-up.
  const bothSigned =
    !!ticket.resolution?.customer_signed_at && !!ticket.resolution?.engineer_signed_at;
  const canCollect =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    ticket.assigned_engineer?.id === user?.id;

  return (
    <Section title={isRemote ? 'Service charge' : 'Spares & charges'}>
      <View style={styles.body}>
        {chargesQuery.loading && !charges ? (
          <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.md }} />
        ) : chargesQuery.error && !charges ? (
          <Banner message={chargesQuery.error} />
        ) : charges ? (
          <>
            {/* Service fee — always shown and editable now (defaults to ₹0).
                For covered tickets (under warranty / AMC) the billable line
                makes clear the customer owes ₹0 even if a fee is recorded. */}
            <>
              <View style={styles.feeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.lineName}>Service fee</Text>
                  {charges.service_fee_billable_inr !==
                    charges.service_fee_inr && (
                    <Text style={styles.meta}>
                      Billable {formatINR(charges.service_fee_billable_inr)}
                    </Text>
                  )}
                </View>
                <Text style={styles.lineTotal}>
                  {formatINR(charges.service_fee_inr)}
                </Text>
                {operable && (
                  <Pressable
                    onPress={() => setFeeOpen(true)}
                    hitSlop={8}
                    style={styles.iconBtn}
                  >
                    <Ionicons name="create-outline" size={18} color={colors.inkMuted} />
                  </Pressable>
                )}
              </View>

              <Divider style={{ marginVertical: spacing.sm }} />
            </>

            {/* Spare lines — not applicable to remote-support tickets. */}
            {!isRemote &&
              (charges.items.length === 0 ? (
                <Text style={styles.empty}>No spare parts added.</Text>
              ) : (
                charges.items.map((item, i) => (
                  <View key={item.id}>
                    {i > 0 && <Divider style={{ marginVertical: spacing.sm }} />}
                    <ChargeRow
                      item={item}
                      editable={operable}
                      onEdit={() => setEditLine(item)}
                      onRemove={() =>
                        Alert.alert(
                          'Remove spare',
                          `Remove "${item.name}" from this ticket?`,
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Remove',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  await api.removeSpare(reference, item.id);
                                  chargesQuery.reload();
                                } catch (e) {
                                  Alert.alert('Charges', errMsg(e));
                                }
                              },
                            },
                          ],
                        )
                      }
                    />
                  </View>
                ))
              ))}

            {!isRemote && <Divider style={{ marginVertical: spacing.md }} />}

            {/* Totals */}
            {!isRemote && (
              <>
                <TotalRow
                  label="Spares (list price)"
                  value={formatINR(charges.spares_list_price_total_inr)}
                />
                <TotalRow
                  label="Spares (billable)"
                  value={formatINR(charges.spares_billable_total_inr)}
                />
              </>
            )}
            <TotalRow
              label="Grand total"
              value={formatINR(charges.grand_total_inr)}
              strong
            />

            {charges.is_warranty && (
              <View style={{ marginTop: spacing.sm }}>
                <Banner
                  message={
                    isRemote
                      ? 'Covered ticket (under warranty / AMC) — service charge waived (₹0).'
                      : 'Covered ticket (under warranty / AMC) — spares and service charge are waived (₹0).'
                  }
                  tone="info"
                />
              </View>
            )}

            {!isRemote && (
            <View style={{ marginTop: spacing.md }}>
              {operable ? (
                <Button
                  title="Add spare"
                  icon="add"
                  variant="secondary"
                  onPress={() => setAddOpen(true)}
                />
              ) : (
                <Text style={styles.hint}>{ticketLockReason(ticket.status)}</Text>
              )}
            </View>
            )}

            {/* Out-of-warranty payment: held at RESOLVED until collected. */}
            {paymentCollected ? (
              <View style={{ marginTop: spacing.md }}>
                <Banner
                  tone="success"
                  message={`Payment collected${
                    ticket.payment_amount_inr != null
                      ? ` · ${formatINR(ticket.payment_amount_inr)}`
                      : ''
                  }${
                    ticket.payment_collected_by
                      ? ` by ${ticket.payment_collected_by.name}`
                      : ''
                  }`}
                />
              </View>
            ) : paymentPending ? (
              <View style={{ marginTop: spacing.md }}>
                <Divider style={{ marginBottom: spacing.md }} />
                <View style={styles.feeRow}>
                  <Badge label="Payment pending" tone="warn" />
                  <View style={{ flex: 1 }} />
                </View>
                <Text style={[styles.meta, { marginTop: spacing.xs }]}>
                  {bothSigned
                    ? 'Signed off — payment not collected. Record it to close the ticket.'
                    : 'Payment due — collect after sign-off.'}
                </Text>
                {bothSigned && canCollect && (
                  <Button
                    title="Mark payment collected"
                    icon="cash-outline"
                    onPress={() => setPayOpen(true)}
                    style={{ marginTop: spacing.sm }}
                  />
                )}
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      {/* Service fee modal */}
      <ServiceFeeModal
        visible={feeOpen}
        current={charges?.service_fee_inr ?? 0}
        onClose={() => setFeeOpen(false)}
        onSave={async (fee) => {
          try {
            await api.updateServiceFee(reference, fee);
            setFeeOpen(false);
            chargesQuery.reload();
          } catch (e) {
            Alert.alert('Charges', errMsg(e));
            throw e;
          }
        }}
      />

      {/* Edit spare modal */}
      <EditSpareModal
        item={editLine}
        onClose={() => setEditLine(null)}
        onSave={async (qty, price) => {
          if (!editLine) return;
          try {
            await api.updateSpare(reference, editLine.id, {
              quantity: qty,
              unit_price_inr: price,
            });
            setEditLine(null);
            chargesQuery.reload();
          } catch (e) {
            Alert.alert('Charges', errMsg(e));
            throw e;
          }
        }}
      />

      {/* Add spare modal */}
      <AddSpareModal
        visible={addOpen}
        productCategory={ticket.product_category}
        onClose={() => setAddOpen(false)}
        onAdd={async (body) => {
          try {
            await api.addSpare(reference, body);
            setAddOpen(false);
            chargesQuery.reload();
          } catch (e) {
            Alert.alert('Charges', errMsg(e));
            throw e;
          }
        }}
      />

      {/* Collect payment modal */}
      <CollectPaymentModal
        visible={payOpen}
        defaultAmount={charges?.grand_total_inr ?? 0}
        requirePositive={outOfWarranty}
        onClose={() => setPayOpen(false)}
        onSave={async (amount) => {
          try {
            await api.collectPayment(reference, amount);
            setPayOpen(false);
            reload();
            chargesQuery.reload();
          } catch (e) {
            Alert.alert('Payment', errMsg(e));
            throw e;
          }
        }}
      />
    </Section>
  );
}

/* ---------------- Charge line row ---------------- */

function ChargeRow({
  item,
  editable,
  onEdit,
  onRemove,
}: {
  item: ChargeLineItem;
  editable: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <View>
      <View style={styles.feeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lineName}>{item.name}</Text>
          <Text style={styles.meta}>
            {item.quantity} × {formatINR(item.unit_price_inr)}
          </Text>
        </View>
        <Text style={styles.lineTotal}>{formatINR(item.line_total_inr)}</Text>
      </View>
      <View style={styles.lineActions}>
        <Badge
          label={item.billable ? 'Billable' : 'Not billable'}
          tone={item.billable ? 'success' : 'neutral'}
        />
        <View style={{ flex: 1 }} />
        {editable && (
          <>
            <Button
              title="Edit"
              variant="secondary"
              size="sm"
              fullWidth={false}
              onPress={onEdit}
            />
            <Button
              title="Remove"
              variant="danger"
              size="sm"
              fullWidth={false}
              onPress={onRemove}
            />
          </>
        )}
      </View>
    </View>
  );
}

function TotalRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, strong && styles.totalLabelStrong]}>
        {label}
      </Text>
      <Text style={[styles.totalValue, strong && styles.totalValueStrong]}>
        {value}
      </Text>
    </View>
  );
}

/* ---------------- Service fee modal ---------------- */

function ServiceFeeModal({
  visible,
  current,
  onClose,
  onSave,
}: {
  visible: boolean;
  current: number;
  onClose: () => void;
  onSave: (fee: number) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setWasVisible(true);
    setValue(String(current));
    setError(null);
  }
  if (!visible && wasVisible) setWasVisible(false);

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
      // surfaced upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAwareSheet>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Service fee</Text>
          <Field
            label="Service fee (₹)"
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
              title="Save"
              loading={saving}
              fullWidth={false}
              onPress={submit}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAwareSheet>
    </Modal>
  );
}

/* ---------------- Collect payment modal ---------------- */

function CollectPaymentModal({
  visible,
  defaultAmount,
  requirePositive,
  onClose,
  onSave,
}: {
  visible: boolean;
  defaultAmount: number;
  /** Out-of-warranty must collect > ₹0; covered tickets may record ₹0. */
  requirePositive: boolean;
  onClose: () => void;
  onSave: (amount: number) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setWasVisible(true);
    setValue(String(defaultAmount));
    setError(null);
  }
  if (!visible && wasVisible) setWasVisible(false);

  const submit = async () => {
    const amount = Number(value);
    if (value.trim() === '' || isNaN(amount) || amount < 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (requirePositive && amount <= 0) {
      setError('Enter an amount greater than ₹0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(Math.round(amount));
    } catch {
      // surfaced upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAwareSheet>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Collect payment</Text>
          <Text style={styles.sheetHint}>
            Recording payment closes this ticket.
          </Text>
          <Field
            label="Amount collected (₹)"
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
              title="Collect & close"
              loading={saving}
              fullWidth={false}
              onPress={submit}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAwareSheet>
    </Modal>
  );
}

/* ---------------- Edit spare modal ---------------- */

function EditSpareModal({
  item,
  onClose,
  onSave,
}: {
  item: ChargeLineItem | null;
  onClose: () => void;
  onSave: (quantity: number, unitPrice: number) => Promise<void>;
}) {
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openedId, setOpenedId] = useState<number | null>(null);
  if (item && item.id !== openedId) {
    setOpenedId(item.id);
    setQty(String(item.quantity));
    setPrice(String(item.unit_price_inr));
    setError(null);
  }

  const submit = async () => {
    const q = Number(qty);
    const p = Number(price);
    if (isNaN(q) || q < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    if (isNaN(p) || p < 0) {
      setError('Enter a valid unit price.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(Math.round(q), Math.round(p));
    } catch {
      // surfaced upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!item} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAwareSheet>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Edit spare</Text>
          {!!item && <Text style={styles.sheetHint}>{item.name}</Text>}
          <Field
            label="Quantity"
            value={qty}
            onChangeText={(t) => {
              setQty(t);
              if (error) setError(null);
            }}
            placeholder="1"
            keyboardType="number-pad"
          />
          <Field
            label="Unit price (₹)"
            value={price}
            onChangeText={(t) => {
              setPrice(t);
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
              title="Save"
              loading={saving}
              fullWidth={false}
              onPress={submit}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
      </KeyboardAwareSheet>
    </Modal>
  );
}

/* ---------------- Add spare modal ---------------- */

function AddSpareModal({
  visible,
  productCategory,
  onClose,
  onAdd,
}: {
  visible: boolean;
  productCategory: string;
  onClose: () => void;
  onAdd: (body: {
    catalog_id?: number;
    name?: string;
    unit_price_inr?: number;
    quantity?: number;
  }) => Promise<void>;
}) {
  const api = useApi();

  const [catalog, setCatalog] = useState<SpareCatalogItem[] | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [catalogId, setCatalogId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setWasVisible(true);
    setCatalogId(null);
    setName('');
    setPrice('');
    setQty('1');
    setError(null);
    setLoadingCatalog(true);
    api
      .spareCatalog(productCategory)
      .then((list) => setCatalog(list))
      .catch((e) => setCatalogError(errMsg(e)))
      .finally(() => setLoadingCatalog(false));
  }
  if (!visible && wasVisible) {
    setWasVisible(false);
    setCatalog(null);
    setCatalogError(null);
  }

  const pickCatalog = (id: string) => {
    setCatalogId(id);
    const item = catalog?.find((c) => String(c.id) === id);
    if (item) {
      setName(item.name);
      setPrice(String(item.default_price_inr));
    }
  };

  const submit = async () => {
    const q = Number(qty);
    if (isNaN(q) || q < 1) {
      setError('Quantity must be at least 1.');
      return;
    }
    const p = Number(price);
    if (catalogId == null) {
      if (!name.trim()) {
        setError('Enter a spare name or pick from the catalog.');
        return;
      }
      if (isNaN(p) || p < 0) {
        setError('Enter a valid unit price.');
        return;
      }
    }
    setSaving(true);
    setError(null);
    try {
      if (catalogId != null) {
        await onAdd({ catalog_id: Number(catalogId), quantity: Math.round(q) });
      } else {
        await onAdd({
          name: name.trim(),
          unit_price_inr: Math.round(p),
          quantity: Math.round(q),
        });
      }
    } catch {
      // surfaced upstream
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAwareSheet>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, styles.tallSheet]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>Add spare</Text>
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

            {loadingCatalog ? (
              <ActivityIndicator
                color={colors.inkMuted}
                style={{ marginVertical: spacing.sm }}
              />
            ) : catalogError ? (
              <Banner message={catalogError} tone="warn" />
            ) : catalog && catalog.length > 0 ? (
              <Select
                label="From catalog"
                value={catalogId}
                placeholder="Pick a catalog spare…"
                sheetTitle="Spare catalog"
                options={catalog.map((c) => ({
                  label: c.name,
                  value: String(c.id),
                  sublabel: formatINR(c.default_price_inr),
                }))}
                onChange={pickCatalog}
              />
            ) : (
              <Text style={styles.hint}>
                No catalog spares for {productCategory}. Enter one manually below.
              </Text>
            )}

            <Field
              label="Name"
              value={name}
              onChangeText={(t) => {
                setName(t);
                setCatalogId(null);
                if (error) setError(null);
              }}
              placeholder="Spare part name"
            />
            <Field
              label="Unit price (₹)"
              value={price}
              onChangeText={(t) => {
                setPrice(t);
                setCatalogId(null);
                if (error) setError(null);
              }}
              placeholder="0"
              keyboardType="number-pad"
            />
            <Field
              label="Quantity"
              value={qty}
              onChangeText={(t) => {
                setQty(t);
                if (error) setError(null);
              }}
              placeholder="1"
              keyboardType="number-pad"
            />
            <Button
              title="Add spare"
              icon="add"
              loading={saving}
              onPress={submit}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
      </KeyboardAwareSheet>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs },
  empty: { fontSize: fontSize.sm, color: colors.inkSubtle, paddingVertical: spacing.xs },
  hint: { fontSize: fontSize.xs, color: colors.inkSubtle },

  feeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lineName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  meta: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 1 },
  lineTotal: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  iconBtn: { padding: 2 },
  lineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  totalLabel: { fontSize: fontSize.sm, color: colors.inkSubtle },
  totalLabelStrong: { color: colors.ink, fontWeight: '700' },
  totalValue: { fontSize: fontSize.sm, color: colors.inkSoft, fontWeight: '600' },
  totalValueStrong: { fontSize: fontSize.md, color: colors.ink, fontWeight: '700' },

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
});
