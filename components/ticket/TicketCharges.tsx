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
import { isAdminLevel, isSuperAdmin, ticketIsOperable, ticketLockReason } from '@/lib/options';
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
  // Refetch charges whenever the ticket's charge-affecting fields change (a
  // warranty/service-type/resolve action reloads the ticket) so this card can't
  // drift from the payment section, which reads ticket.amount_due_inr.
  const chargesQuery = useQuery<ChargesSummary>(
    () => api.getCharges(reference),
    [
      reference,
      ticket.amount_due_inr,
      ticket.warranty_status,
      ticket.service_type,
      ticket.status,
    ],
  );

  const [feeOpen, setFeeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editLine, setEditLine] = useState<ChargeLineItem | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const charges = chargesQuery.data;
  const operable = ticketIsOperable(ticket.status);
  // A Super Admin may correct the invoice (service fee + spares) at ANY status,
  // including after the ticket is CLOSED — a post-close billing correction the
  // backend now allows. Everyone else is held to the normal operable window.
  const canEditCharges = operable || isSuperAdmin(user?.role);
  // Remote-support tickets carry no spare parts — show only the service fee.
  const isRemote = ticket.service_type === 'REMOTE_SUPPORT';
  const isThirdParty = ticket.service_type === 'THIRD_PARTY_SUPPORT';
  // Both remote and third-party tickets carry no spare parts (service fee only).
  const noSpares = isRemote || isThirdParty;
  const engineerSigned = !!ticket.resolution?.engineer_signed_at;

  // Out-of-warranty payment tracking. payment_status is null on legacy tickets
  // (created before the feature) — those never show payment UI.
  // `payment_required` is computed by the backend (out-of-warranty, or covered
  // with charges). Out-of-warranty additionally requires a positive amount.
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
    isAdminLevel(user?.role) ||
    user?.role === 'MANAGER' ||
    ticket.assigned_engineer?.id === user?.id;
  // Money breakdown for partial payments (falls back to the charges total when
  // the backend hasn't sent the new fields yet, pre-deploy).
  const amountDue = ticket.amount_due_inr ?? charges?.grand_total_inr ?? 0;
  const amountCollected = ticket.amount_collected_inr ?? 0;
  const amountPending =
    ticket.amount_pending_inr ?? Math.max(0, amountDue - amountCollected);
  // Remote-support tickets have no signatures, so the balance can be collected
  // as soon as they're RESOLVED. Site visits collect after both signatures.
  const canCollectNow = isRemote || (isThirdParty ? engineerSigned : bothSigned);

  return (
    <Section title={noSpares ? 'Service charge' : 'Spares & charges'}>
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
                {canEditCharges && (
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
            {!noSpares &&
              (charges.items.length === 0 ? (
                <Text style={styles.empty}>No spare parts added.</Text>
              ) : (
                charges.items.map((item, i) => (
                  <View key={item.id}>
                    {i > 0 && <Divider style={{ marginVertical: spacing.sm }} />}
                    <ChargeRow
                      item={item}
                      editable={canEditCharges}
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

            {!noSpares && <Divider style={{ marginVertical: spacing.md }} />}

            {/* Totals */}
            {!noSpares && (
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
                    noSpares
                      ? 'Covered ticket (under warranty / AMC) — service charge waived (₹0).'
                      : 'Covered ticket (under warranty / AMC) — spares and service charge are waived (₹0).'
                  }
                  tone="info"
                />
              </View>
            )}

            {!noSpares && (
            <View style={{ marginTop: spacing.md }}>
              {canEditCharges ? (
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
                <View style={{ marginTop: spacing.xs, gap: 2 }}>
                  <Text style={styles.meta}>Total due: {formatINR(amountDue)}</Text>
                  {amountCollected > 0 && (
                    <Text style={styles.meta}>Collected: {formatINR(amountCollected)}</Text>
                  )}
                  <Text style={[styles.meta, { fontWeight: '700', color: colors.ink }]}>
                    Pending: {formatINR(amountPending)}
                  </Text>
                </View>
                <Text style={[styles.meta, { marginTop: spacing.xs }]}>
                  {canCollectNow
                    ? 'Collect the balance to close the ticket. Partial payments keep it open until paid in full.'
                    : 'Payment due — collect after sign-off.'}
                </Text>
                {canCollectNow && canCollect && (
                  <Button
                    title="Collect payment"
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
        min={charges?.service_fee_min_inr ?? 0}
        canWaiveBelowMin={isSuperAdmin(user?.role)}
        onClose={() => setFeeOpen(false)}
        onSave={async (fee) => {
          try {
            await api.updateServiceFee(reference, fee);
            setFeeOpen(false);
            chargesQuery.reload();
            reload(); // refresh the ticket so the payment section matches
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
        due={amountDue}
        collected={amountCollected}
        pending={amountPending}
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
  min,
  canWaiveBelowMin,
  onClose,
  onSave,
}: {
  visible: boolean;
  current: number;
  // Minimum service fee for this ticket (0 = no floor).
  min: number;
  // When true (Admin), the fee may be set below the minimum.
  canWaiveBelowMin: boolean;
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
    // Out-of-warranty tickets carry a minimum; only an Admin can go below it.
    if (min > 0 && fee < min && !canWaiveBelowMin) {
      setError(`Minimum is ₹${min.toLocaleString('en-IN')}. Only an Admin can set lower.`);
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
            hint={
              min > 0
                ? `Minimum ₹${min.toLocaleString('en-IN')}${
                    canWaiveBelowMin ? ' · Super Admin can set lower' : ''
                  }`
                : undefined
            }
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
  due,
  collected,
  pending,
  onClose,
  onSave,
}: {
  visible: boolean;
  due: number;
  collected: number;
  pending: number;
  onClose: () => void;
  onSave: (amount: number) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) {
    setWasVisible(true);
    setValue(String(pending));
    setError(null);
  }
  if (!visible && wasVisible) setWasVisible(false);

  const amount = Number(value);
  const validAmount =
    value.trim() !== '' && !isNaN(amount) && amount > 0 && amount <= pending;
  const clearsBalance = validAmount && Math.round(amount) === pending;

  const submit = async () => {
    if (value.trim() === '' || isNaN(amount) || amount <= 0) {
      setError('Enter an amount greater than ₹0.');
      return;
    }
    if (amount > pending) {
      setError(`Amount can't exceed the ${formatINR(pending)} still pending.`);
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
          <View style={{ gap: 2 }}>
            <Text style={styles.sheetHint}>Total due: {formatINR(due)}</Text>
            {collected > 0 && (
              <Text style={styles.sheetHint}>Already collected: {formatINR(collected)}</Text>
            )}
            <Text style={[styles.sheetHint, { fontWeight: '700', color: colors.ink }]}>
              Pending: {formatINR(pending)}
            </Text>
          </View>
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
          {validAmount && !clearsBalance && (
            <Text style={styles.sheetHint}>
              {formatINR(pending - Math.round(amount))} will remain pending — the ticket stays open until paid in full.
            </Text>
          )}
          <View style={styles.sheetActions}>
            <Button
              title="Cancel"
              variant="secondary"
              fullWidth={false}
              onPress={onClose}
              style={{ flex: 1 }}
            />
            <Button
              title={clearsBalance ? 'Collect & close' : 'Collect'}
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
