/** Controlled close/delete confirmation modals for Admin/Owner overrides.
 * Driven by `mode` so it can be hosted from the detail screen OR the list. */

import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareSheet } from '@/components/KeyboardAwareSheet';
import { Button, Field } from '@/components/ui/kit';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { ClosePreview } from '@/lib/types';

export type AdminActionMode = 'close' | 'delete' | null;

function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : (e as Error)?.message ?? 'Something went wrong.';
}

interface Props {
  reference: string;
  mode: AdminActionMode;
  onClose: () => void;
  /** Force-close succeeded — refresh source view. */
  onChanged: () => void;
  /** Delete succeeded — the ticket is now hidden. */
  onDeleted: () => void;
}

export default function AdminTicketActionModals({
  reference,
  mode,
  onClose,
  onChanged,
  onDeleted,
}: Props) {
  const api = useApi();

  const [preview, setPreview] = useState<ClosePreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reason, setReason] = useState('');

  const [confirmText, setConfirmText] = useState('');
  const [delReason, setDelReason] = useState('');

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load the close preview whenever the close modal opens for a reference.
  useEffect(() => {
    if (mode !== 'close') return;
    setPreview(null);
    setReason('');
    setErr(null);
    setLoadingPreview(true);
    let alive = true;
    (async () => {
      try {
        const p = await api.closePreview(reference);
        if (alive) setPreview(p);
      } catch (e) {
        if (alive) setErr(errMsg(e));
      } finally {
        if (alive) setLoadingPreview(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [mode, reference, api]);

  useEffect(() => {
    if (mode === 'delete') {
      setConfirmText('');
      setDelReason('');
      setErr(null);
    }
  }, [mode, reference]);

  const submitClose = async () => {
    if (reason.trim().length < 3) {
      setErr('Please enter a reason for closing.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.forceCloseTicket(reference, reason.trim());
      onChanged();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const matches = confirmText.trim().toUpperCase() === reference.toUpperCase();

  const submitDelete = async () => {
    if (!matches) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteTicket(reference, delReason);
      onDeleted();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* ---------------- Close (review) ---------------- */}
      <Modal
        visible={mode === 'close'}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <KeyboardAwareSheet>
          <Pressable style={styles.backdrop} onPress={onClose}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Close ticket {reference}</Text>
              <Text style={styles.sheetHint}>Review what&apos;s still pending before closing.</Text>

              <ScrollView style={styles.previewScroll} keyboardShouldPersistTaps="handled">
                {loadingPreview && <Text style={styles.muted}>Loading summary…</Text>}
                {preview && (
                  <>
                    <SummaryRow label="Status" value={preview.status} />
                    <SummaryRow label="Assigned to" value={preview.assigned_engineer?.name ?? '—'} />
                    {preview.additional_engineers.length > 0 && (
                      <SummaryRow
                        label="Co-engineers"
                        value={preview.additional_engineers.map((a) => a.engineer.name).join(', ')}
                      />
                    )}
                    {preview.resolved_at && (
                      <SummaryRow label="Resolved" value={formatDateTime(preview.resolved_at)} />
                    )}
                    <Text style={styles.pendingTitle}>Still pending ({preview.pending.length})</Text>
                    {preview.pending.length === 0 ? (
                      <Text style={styles.okText}>Nothing outstanding — this ticket is complete.</Text>
                    ) : (
                      <View style={styles.pendingBox}>
                        {preview.pending.map((p, i) => (
                          <Text key={i} style={styles.pendingItem}>⚠  {p}</Text>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </ScrollView>

              <Field
                label="Reason for closing *"
                value={reason}
                onChangeText={(t) => {
                  setReason(t);
                  if (err) setErr(null);
                }}
                placeholder="Why is this ticket being closed?"
                multiline
                error={err ?? undefined}
              />

              <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" fullWidth={false} onPress={onClose} style={styles.flex} />
                <Button
                  title="Close ticket"
                  variant="danger"
                  loading={busy}
                  disabled={loadingPreview || !preview || reason.trim().length < 3}
                  fullWidth={false}
                  onPress={submitClose}
                  style={styles.flex}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareSheet>
      </Modal>

      {/* ---------------- Delete (confirm) ---------------- */}
      <Modal
        visible={mode === 'delete'}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <KeyboardAwareSheet>
          <Pressable style={styles.backdrop} onPress={onClose}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.sheetTitle, { color: colors.danger }]}>
                Delete ticket {reference}
              </Text>
              <Text style={styles.sheetHint}>
                This hides the ticket from every list, in any status. Recoverable by support.
              </Text>

              <Field
                label={`Type ${reference} to confirm`}
                value={confirmText}
                onChangeText={(t) => {
                  setConfirmText(t);
                  if (err) setErr(null);
                }}
                placeholder={reference}
                autoCapitalize="characters"
              />
              <Field
                label="Reason (optional)"
                value={delReason}
                onChangeText={setDelReason}
                placeholder="Why is this ticket being deleted?"
                multiline
                error={err ?? undefined}
              />

              <View style={styles.actions}>
                <Button title="Cancel" variant="secondary" fullWidth={false} onPress={onClose} style={styles.flex} />
                <Button
                  title="Delete permanently"
                  variant="danger"
                  loading={busy}
                  disabled={!matches}
                  fullWidth={false}
                  onPress={submitDelete}
                  style={styles.flex}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareSheet>
      </Modal>
    </>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  muted: { fontSize: fontSize.sm, color: colors.inkSubtle, lineHeight: 20 },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,10,10,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  sheetHint: { fontSize: fontSize.sm, color: colors.inkSubtle },
  previewScroll: { maxHeight: 220 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, gap: spacing.md },
  summaryLabel: { fontSize: fontSize.sm, color: colors.inkSubtle },
  summaryValue: { fontSize: fontSize.sm, color: colors.ink, flexShrink: 1, textAlign: 'right' },
  pendingTitle: { marginTop: spacing.sm, fontSize: fontSize.xs, fontWeight: '700', color: colors.inkSubtle, textTransform: 'uppercase' },
  okText: { marginTop: 4, fontSize: fontSize.sm, color: colors.success },
  pendingBox: { marginTop: 4, backgroundColor: colors.warnSoft, borderRadius: radius.sm, padding: spacing.sm, gap: 2 },
  pendingItem: { fontSize: fontSize.sm, color: colors.warn, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
});
