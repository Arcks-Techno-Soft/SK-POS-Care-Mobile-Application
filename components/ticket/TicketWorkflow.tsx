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
import { byEngineerAvailability, engineerLoadLabel } from '@/lib/options';
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
  const [pickedCoEngineer, setPickedCoEngineer] = useState<string | null>(null);

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
      (ticket.status === 'ASSIGNED' && isManagerOrAdmin) ||
      // Managers/admins also need the list to add co-assigned engineers once a
      // primary engineer is on the ticket.
      (isManagerOrAdmin && ticket.assigned_engineer != null)
    ) {
      loadEngineers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.status]);

  // Co-assigned engineers: extra app users attending the same visit. View +
  // notified only — only the primary assignee drives the workflow.
  const coEngineers = ticket.additional_engineers ?? [];
  const canManageCoEngineers =
    isManagerOrAdmin &&
    ticket.assigned_engineer != null &&
    ticket.status !== 'CLOSED';
  // Picker options exclude the primary assignee and anyone already co-assigned.
  const coEngineerOptions = (engineers ?? [])
    .filter(
      (e) =>
        e.id !== ticket.assigned_engineer?.id &&
        !coEngineers.some((c) => c.engineer.id === e.id),
    )
    .sort(byEngineerAvailability(ticket.city))
    .map((e) => ({
      label: e.name,
      value: String(e.id),
      sublabel: engineerLoadLabel(e.open_ticket_count) + (e.district ? ` · ${e.district}` : ''),
    }));

  const addCoEngineer = () => {
    if (!pickedCoEngineer) return;
    run(async () => {
      await api.addEngineer(reference, Number(pickedCoEngineer));
      setPickedCoEngineer(null);
    });
  };

  const removeCoEngineer = (engineerId: number, name: string) => {
    Alert.alert(
      'Remove engineer',
      `Remove ${name} from this ticket? They'll no longer see it or get updates.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => run(() => api.removeEngineer(reference, engineerId)),
        },
      ],
    );
  };

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
              options={[...(engineers ?? [])].sort(byEngineerAvailability(ticket.city)).map((e) => ({
                label: e.name,
                value: String(e.id),
                sublabel: engineerLoadLabel(e.open_ticket_count) + (e.district ? ` · ${e.district}` : ''),
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
                    .sort(byEngineerAvailability(ticket.city))
                    .map((e) => ({
                      label: e.name,
                      value: String(e.id),
                      sublabel: engineerLoadLabel(e.open_ticket_count) + (e.district ? ` · ${e.district}` : ''),
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
            <Text style={styles.muted}>
              Start your first attempt below to begin work.
            </Text>
          ) : (
            <Text style={styles.muted}>
              Accepted by {ticket.assigned_engineer?.name ?? 'the engineer'} — awaiting
              start of work.
            </Text>
          ))}

        {ticket.status === 'RESOLVING' &&
          (assignedToMe ? (
            ticket.attempts.some((a) => !a.ended_at) ? (
              <Text style={styles.muted}>End the open attempt below before resolving.</Text>
            ) : ticket.attempts.filter((a) => a.ended_at).length === 0 ? (
              <Text style={styles.muted}>Log at least one attempt below before resolving.</Text>
            ) : (
              <Button
                title={isRemote ? 'Resolve & close' : 'Mark resolved'}
                icon="checkmark-done-outline"
                onPress={() => {
                  setSummary('');
                  setResolveError(null);
                  setResolveOpen(true);
                }}
              />
            )
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

        {/* Co-assigned engineers — extra app users on the same visit. Shown
            once a primary engineer exists; managers/admins can add or remove. */}
        {ticket.assigned_engineer != null &&
          (coEngineers.length > 0 || canManageCoEngineers) && (
            <View style={styles.coEng}>
              <Text style={styles.coEngTitle}>Co-assigned engineers</Text>
              {coEngineers.length === 0 ? (
                <Text style={styles.muted}>
                  None yet. Add another engineer if two need to attend this visit.
                </Text>
              ) : (
                coEngineers.map((c) => (
                  <View key={c.id} style={styles.coEngRow}>
                    <View style={styles.coEngInfo}>
                      <Text style={styles.coEngName}>{c.engineer.name}</Text>
                      {c.engineer.district && (
                        <Text style={styles.muted}>{c.engineer.district}</Text>
                      )}
                    </View>
                    {canManageCoEngineers && (
                      <Pressable
                        disabled={busy}
                        onPress={() => removeCoEngineer(c.engineer.id, c.engineer.name)}
                        hitSlop={8}
                      >
                        <Text style={styles.coEngRemove}>Remove</Text>
                      </Pressable>
                    )}
                  </View>
                ))
              )}

              {canManageCoEngineers && (
                <>
                  <Select
                    label="Add another engineer"
                    value={pickedCoEngineer}
                    placeholder={
                      loadingEngineers ? 'Loading engineers…' : 'Select an engineer…'
                    }
                    sheetTitle="Engineers"
                    options={coEngineerOptions}
                    onChange={setPickedCoEngineer}
                  />
                  <Button
                    title="Add engineer"
                    icon="person-add-outline"
                    variant="secondary"
                    loading={busy}
                    disabled={!pickedCoEngineer}
                    onPress={addCoEngineer}
                  />
                </>
              )}
            </View>
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
  coEng: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  coEngTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.ink },
  coEngRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  coEngInfo: { flex: 1 },
  coEngName: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  coEngRemove: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '600' },
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
