/** Workflow action card — drives the ticket through its status lifecycle. */

import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareSheet } from '@/components/KeyboardAwareSheet';

import { Section } from '@/components/ui/Section';
import { Button, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { usePendingTickets } from '@/lib/pending-tickets';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { TicketDetail, User } from '@/lib/types';

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

export default function TicketWorkflow({ reference, ticket, reload }: Props) {
  const api = useApi();
  const { user } = useAuth();
  const { refresh: refreshPending } = usePendingTickets();

  const [busy, setBusy] = useState(false);
  const [engineers, setEngineers] = useState<User[] | null>(null);
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const [engineersError, setEngineersError] = useState<string | null>(null);
  const [pickedEngineer, setPickedEngineer] = useState<string | null>(null);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const isManagerOrAdmin = user?.role === 'MANAGER' || user?.role === 'ADMIN';
  const assignedToMe =
    ticket.assigned_engineer != null && ticket.assigned_engineer.id === user?.id;
  // Warranty must be decided before assigning. Mirrors the backend gate so the
  // user sees why the Assign buttons are disabled instead of hitting a 400.
  const warrantyUnknown = ticket.warranty_status === 'UNKNOWN';
  // Remote support resolves and closes in one step — no signatures or PDF.
  const isRemote = ticket.service_type === 'REMOTE_SUPPORT';

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      reload();
      refreshPending(); // keep the Tickets-tab "awaiting acceptance" badge in sync
    } catch (e) {
      Alert.alert('Workflow', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const loadEngineers = async () => {
    if (engineers || loadingEngineers) return;
    setLoadingEngineers(true);
    setEngineersError(null);
    try {
      const list = await api.listEngineers();
      setEngineers(list);
    } catch (e) {
      setEngineersError(errMsg(e));
    } finally {
      setLoadingEngineers(false);
    }
  };

  // Engineers populate the assign dropdown — load them automatically once the
  // ticket is ready to be assigned (ACKNOWLEDGED) or, for managers/admins, while
  // it sits ASSIGNED-but-not-yet-accepted so it can be re-assigned.
  useEffect(() => {
    if (
      ticket.status === 'ACKNOWLEDGED' ||
      (ticket.status === 'ASSIGNED' && isManagerOrAdmin)
    ) {
      loadEngineers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.status]);

  // Re-assign a still-unaccepted ticket to a different engineer. Reuses the
  // assign endpoint, which overwrites the current assignee server-side.
  const confirmReassign = () => {
    if (!pickedEngineer) return;
    const target = engineers?.find((e) => String(e.id) === pickedEngineer);
    Alert.alert(
      'Re-assign ticket',
      `Re-assign this ticket to ${target?.name ?? 'the selected engineer'}? ` +
        `${ticket.assigned_engineer?.name ?? 'The current engineer'} will no longer be assigned.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-assign',
          onPress: () =>
            run(async () => {
              await api.assignTicket(reference, Number(pickedEngineer));
              setPickedEngineer(null);
            }),
        },
      ],
    );
  };

  const submitResolve = async () => {
    if (summary.trim().length < 10) {
      setResolveError('Please write at least 10 characters.');
      return;
    }
    setResolving(true);
    setResolveError(null);
    try {
      await api.resolveTicket(reference, summary.trim());
      setResolveOpen(false);
      setSummary('');
      reload();
    } catch (e) {
      setResolveError(errMsg(e));
    } finally {
      setResolving(false);
    }
  };

  return (
    <Section title="Workflow">
      <View style={styles.body}>
        {ticket.status === 'OPEN' && (
          <Button
            title="Acknowledge ticket"
            icon="checkmark-circle-outline"
            loading={busy}
            onPress={() => run(() => api.acknowledgeTicket(reference))}
          />
        )}

        {ticket.status === 'ACKNOWLEDGED' && (
          <>
            {warrantyUnknown && (
              <Text style={styles.warrantyNote}>
                Set the warranty status (Under Warranty / Out of Warranty / AMC)
                above before assigning this ticket.
              </Text>
            )}
            <Select
              label="Assign to engineer"
              value={pickedEngineer}
              placeholder={loadingEngineers ? 'Loading engineers…' : 'Select an engineer…'}
              sheetTitle="Engineers"
              options={(engineers ?? []).map((e) => ({
                label: e.name,
                value: String(e.id),
                sublabel: e.district ?? undefined,
              }))}
              onChange={setPickedEngineer}
            />
            {engineersError && (
              <View style={styles.engineersError}>
                <Text style={styles.muted}>{engineersError}</Text>
                <Button
                  title="Retry"
                  variant="secondary"
                  size="sm"
                  loading={loadingEngineers}
                  onPress={loadEngineers}
                />
              </View>
            )}
            {!loadingEngineers && !engineersError && engineers?.length === 0 && (
              <Text style={styles.muted}>No active engineers found.</Text>
            )}
            <Button
              title="Assign"
              icon="person-add-outline"
              loading={busy}
              disabled={!pickedEngineer || warrantyUnknown}
              onPress={() =>
                run(() => api.assignTicket(reference, Number(pickedEngineer)))
              }
            />
            {isManagerOrAdmin && (
              <Button
                title="Assign to me"
                variant="secondary"
                loading={busy}
                disabled={warrantyUnknown}
                onPress={() => run(() => api.selfAssignTicket(reference))}
              />
            )}
          </>
        )}

        {ticket.status === 'ASSIGNED' && (
          <>
            {assignedToMe ? (
              <Button
                title="Accept ticket"
                icon="hand-left-outline"
                loading={busy}
                onPress={() => run(() => api.acceptTicket(reference))}
              />
            ) : (
              <Text style={styles.muted}>
                Assigned to {ticket.assigned_engineer?.name ?? 'an engineer'} — awaiting
                their acceptance.
              </Text>
            )}

            {/* The engineer hasn't accepted yet, so a manager/admin can hand the
                ticket to someone else. */}
            {isManagerOrAdmin && (
              <View style={styles.reassign}>
                <Text style={styles.reassignHint}>
                  Not accepted yet — re-assign to a different engineer if needed.
                </Text>
                <Select
                  label="Re-assign to engineer"
                  value={pickedEngineer}
                  placeholder={
                    loadingEngineers ? 'Loading engineers…' : 'Select an engineer…'
                  }
                  sheetTitle="Engineers"
                  options={(engineers ?? [])
                    .filter((e) => e.id !== ticket.assigned_engineer?.id)
                    .map((e) => ({
                      label: e.name,
                      value: String(e.id),
                      sublabel: e.district ?? undefined,
                    }))}
                  onChange={setPickedEngineer}
                />
                {engineersError && (
                  <View style={styles.engineersError}>
                    <Text style={styles.muted}>{engineersError}</Text>
                    <Button
                      title="Retry"
                      variant="secondary"
                      size="sm"
                      loading={loadingEngineers}
                      onPress={loadEngineers}
                    />
                  </View>
                )}
                <Button
                  title="Re-assign"
                  icon="swap-horizontal-outline"
                  variant="secondary"
                  loading={busy}
                  disabled={!pickedEngineer}
                  onPress={confirmReassign}
                />
              </View>
            )}
          </>
        )}

        {ticket.status === 'ACCEPTED' &&
          (assignedToMe ? (
            <Button
              title="Start work"
              icon="play-outline"
              loading={busy}
              onPress={() => run(() => api.startWork(reference))}
            />
          ) : (
            <Text style={styles.muted}>
              Accepted by {ticket.assigned_engineer?.name ?? 'the engineer'} — awaiting
              start of work.
            </Text>
          ))}

        {ticket.status === 'RESOLVING' &&
          (assignedToMe ? (
            <Button
              title={isRemote ? 'Resolve & close' : 'Mark resolved'}
              icon="checkmark-done-outline"
              onPress={() => {
                setSummary('');
                setResolveError(null);
                setResolveOpen(true);
              }}
            />
          ) : (
            <Text style={styles.muted}>
              {ticket.assigned_engineer?.name ?? 'The engineer'} is working on this
              ticket.
            </Text>
          ))}

        {ticket.status === 'RESOLVED' && (
          <Text style={styles.muted}>Resolved — collect sign-off below.</Text>
        )}

        {ticket.status === 'CLOSED' && (
          <Text style={styles.muted}>Ticket closed.</Text>
        )}

        {/* Actor / timestamp trail */}
        <View style={styles.trail}>
          {ticket.acknowledged_at && (
            <Text style={styles.trailLine}>
              Acknowledged by {ticket.acknowledged_by?.name ?? 'someone'} ·{' '}
              {formatDateTime(ticket.acknowledged_at)}
            </Text>
          )}
          {ticket.assigned_at && (
            <Text style={styles.trailLine}>
              Assigned to {ticket.assigned_engineer?.name ?? 'an engineer'}
              {ticket.assigned_by ? ` by ${ticket.assigned_by.name}` : ''} ·{' '}
              {formatDateTime(ticket.assigned_at)}
            </Text>
          )}
          {ticket.accepted_at && (
            <Text style={styles.trailLine}>
              Accepted · {formatDateTime(ticket.accepted_at)}
            </Text>
          )}
          {ticket.resolving_started_at && (
            <Text style={styles.trailLine}>
              Work started · {formatDateTime(ticket.resolving_started_at)}
            </Text>
          )}
          {ticket.resolved_at && (
            <Text style={styles.trailLine}>
              Resolved · {formatDateTime(ticket.resolved_at)}
            </Text>
          )}
        </View>
      </View>

      {/* Resolve modal */}
      <Modal
        visible={resolveOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setResolveOpen(false)}
      >
        <KeyboardAwareSheet>
        <Pressable style={styles.backdrop} onPress={() => setResolveOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {isRemote ? 'Resolve & close' : 'Mark resolved'}
            </Text>
            <Text style={styles.sheetHint}>
              {isRemote
                ? 'Remote support — this resolves and closes the ticket immediately. No signatures or PDF.'
                : 'Summarise what was done to resolve this ticket.'}
            </Text>
            <Field
              value={summary}
              onChangeText={(t) => {
                setSummary(t);
                if (resolveError) setResolveError(null);
              }}
              placeholder="Resolution summary…"
              multiline
              error={resolveError ?? undefined}
            />
            <View style={styles.sheetActions}>
              <Button
                title="Cancel"
                variant="secondary"
                fullWidth={false}
                onPress={() => setResolveOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={isRemote ? 'Resolve & close' : 'Resolve ticket'}
                loading={resolving}
                fullWidth={false}
                onPress={submitResolve}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAwareSheet>
      </Modal>
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  muted: { fontSize: fontSize.sm, color: colors.inkSubtle, lineHeight: 20 },
  warrantyNote: {
    fontSize: fontSize.sm,
    color: colors.warn,
    backgroundColor: colors.warnSoft,
    lineHeight: 20,
    padding: spacing.sm,
    borderRadius: radius.sm,
  },
  engineersError: { gap: spacing.sm },
  reassign: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  reassignHint: { fontSize: fontSize.sm, color: colors.inkSubtle, lineHeight: 20 },
  trail: { gap: 4, marginTop: spacing.xs },
  trailLine: { fontSize: fontSize.xs, color: colors.inkSubtle },

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
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  sheetHint: { fontSize: fontSize.sm, color: colors.inkSubtle },
  sheetActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
});
