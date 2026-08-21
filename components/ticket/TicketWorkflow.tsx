/** Workflow action card — drives the ticket through its status lifecycle. */

import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { KeyboardAwareSheet } from '@/components/KeyboardAwareSheet';

import { Section } from '@/components/ui/Section';
import { Button, Field } from '@/components/ui/kit';
import { Select } from '@/components/ui/Select';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import {
  byEngineerAvailability,
  canHoldTicket,
  canResumeJob,
  engineerLoadLabel,
  isAdminLevel,
} from '@/lib/options';
import { usePendingTickets } from '@/lib/pending-tickets';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { ChargesSummary, TicketDetail, User } from '@/lib/types';

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

  // Sales rep credited with this service call (optional, view-only for the rep).
  const [salesReps, setSalesReps] = useState<User[] | null>(null);
  const [salesRepId, setSalesRepId] = useState<string | null>(
    ticket.sales_rep ? String(ticket.sales_rep.id) : null,
  );
  const [savingSalesRep, setSavingSalesRep] = useState(false);

  // Hold sheet — a reason is mandatory, matching the backend.
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [holdError, setHoldError] = useState<string | null>(null);

  // Decline sheet — the assigned engineer hands the ticket back with a
  // mandatory reason. After a successful decline the ticket leaves the
  // engineer's scope entirely, so we navigate back instead of reloading.
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declineError, setDeclineError] = useState<string | null>(null);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  // Charges shown for a final confirm at resolve time. Fetched when the modal
  // opens so the engineer confirms the exact service charge being billed.
  const [resolveCharges, setResolveCharges] = useState<ChargesSummary | null>(null);
  const [feeDraft, setFeeDraft] = useState('');
  // Setting a service charge below the per-service-type minimum is a reserved
  // Super Admin power — plain admins are held to the floor like everyone else.
  // Admin-level (Admin or Super Admin) may waive the out-of-warranty minimum.
  const canWaiveBelowMin = isAdminLevel(user?.role);

  const openResolve = async () => {
    setSummary('');
    setResolveError(null);
    setResolveCharges(null);
    setFeeDraft('');
    setResolveOpen(true);
    try {
      const c = await api.getCharges(reference);
      setResolveCharges(c);
      setFeeDraft(String(c.service_fee_inr));
    } catch {
      // Non-blocking — the engineer can still resolve; charge stays as-is.
    }
  };

  // Hold is an overlay on `status`, so it's checked separately everywhere.
  const onHold = !!ticket.on_hold;
  const showHold = canHoldTicket(user?.role ?? '', ticket.status, ticket.on_hold);
  const showResume = canResumeJob(user?.role ?? '', ticket.on_hold);

  const isManagerOrAdmin = user?.role === 'MANAGER' || isAdminLevel(user?.role);
  const assignedToMe =
    ticket.assigned_engineer != null && ticket.assigned_engineer.id === user?.id;
  // Warranty must be decided before assigning. Mirrors the backend gate so the
  // user sees why the Assign buttons are disabled instead of hitting a 400.
  const warrantyUnknown = ticket.warranty_status === 'UNKNOWN';
  // Remote support resolves and closes in one step — no signatures or PDF.
  const isRemote = ticket.service_type === 'REMOTE_SUPPORT';

  // Recorded field work (any attempt, open or ended) pins the ticket: no
  // decline, no rollback. Mirrors the backend guard so the buttons disappear
  // instead of the tap failing with a 409.
  const hasAnyAttempt = ticket.attempts.length > 0;

  const submitDecline = async () => {
    const reason = declineReason.trim();
    if (reason.length < 3) {
      setDeclineError('Give a short reason — the managers will see it.');
      return;
    }
    setBusy(true);
    setDeclineError(null);
    try {
      await api.declineTicket(reference, reason);
      setDeclineOpen(false);
      refreshPending();
      // The ticket is no longer assigned to this engineer, so it has left
      // their visible scope — reloading would 404. Go back to the list.
      Alert.alert('Ticket declined', 'It has been returned to the managers to re-triage.');
      router.back();
    } catch (e) {
      setDeclineError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmRollback = (what: 'accept' | 'start') => {
    Alert.alert(
      what === 'accept' ? 'Undo accept?' : 'Undo start work?',
      what === 'accept'
        ? 'The ticket goes back to Assigned — you can accept it again or decline it.'
        : 'The ticket goes back to Accepted, as if work had not started.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Undo', style: 'destructive', onPress: () => run(() => api.rollbackTicket(reference)) },
      ],
    );
  };

  const submitHold = async () => {
    const reason = holdReason.trim();
    if (reason.length < 3) {
      setHoldError('Give a short reason — it shows on the ticket.');
      return;
    }
    setBusy(true);
    setHoldError(null);
    try {
      await api.holdTicket(reference, reason);
      setHoldOpen(false);
      setHoldReason('');
      reload();
      refreshPending();
    } catch (e) {
      setHoldError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmResume = () => {
    Alert.alert(
      'Resume ticket',
      'This goes back onto the assignee\u2019s open jobs and restarts its SLA clock.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume',
          onPress: () => run(() => api.resumeTicket(reference)),
        },
      ],
    );
  };

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

  // Sales rep credit — Admin/Manager only, editable until the ticket is CLOSED.
  const canManageSalesRep = isManagerOrAdmin && ticket.status !== 'CLOSED';

  useEffect(() => {
    if (!canManageSalesRep || salesReps) return;
    api
      .listSalesReps()
      .then(setSalesReps)
      .catch(() => setSalesReps([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageSalesRep]);

  const salesRepOptions = [
    { label: 'None', value: '' },
    ...(salesReps ?? []).map((r) => ({ label: r.name, value: String(r.id) })),
  ];

  const handleSetSalesRep = async () => {
    setSavingSalesRep(true);
    try {
      await api.setTicketSalesRep(reference, salesRepId ? Number(salesRepId) : null);
      reload();
    } catch (e) {
      Alert.alert('Sales rep', errMsg(e));
    } finally {
      setSavingSalesRep(false);
    }
  };

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
      sublabel:
        (e.role === 'MANAGER' ? 'Manager · ' : e.role === 'SALES' ? 'Sales rep · ' : '') +
        engineerLoadLabel(e, e.role !== 'MANAGER') +
        (e.district ? ` · ${e.district}` : ''),
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
    // Confirm the service charge. Reject a below-minimum amount instead of
    // silently accepting it — only an Admin (or Super Admin) may go below the
    // floor.
    const min = resolveCharges?.service_fee_min_inr ?? 0;
    const fee = Math.round(Number(feeDraft) || 0);
    if (!canWaiveBelowMin && min > 0 && fee < min) {
      setResolveError(
        `Service charge can't be below ₹${min.toLocaleString('en-IN')}. Only an Admin can set lower.`,
      );
      return;
    }
    setResolving(true);
    setResolveError(null);
    try {
      // Persist the confirmed charge first (only if it changed), so the
      // resolution/PDF reflects exactly what was confirmed.
      if (resolveCharges && fee !== resolveCharges.service_fee_inr) {
        await api.updateServiceFee(reference, fee);
      }
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
        {/* Parked by a Manager/Admin. Every workflow control below is hidden
            because the backend 409s all of them while held. */}
        {onHold && (
          <View style={styles.holdCard}>
            <Text style={styles.holdTitle}>On hold</Text>
            {ticket.hold_reason ? (
              <Text style={styles.holdReason}>{ticket.hold_reason}</Text>
            ) : null}
            <Text style={styles.holdHint}>
              {ticket.held_by?.name ? `Put on hold by ${ticket.held_by.name}. ` : ''}
              Work is frozen and this ticket isn&apos;t counted in anyone&apos;s
              open jobs.
            </Text>
            {showResume && (
              <Button
                title="Resume ticket"
                icon="play-circle-outline"
                loading={busy}
                onPress={confirmResume}
                style={{ marginTop: spacing.sm }}
              />
            )}
          </View>
        )}

        {!onHold && (
          <>
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
              label="Assign to"
              value={pickedEngineer}
              placeholder={loadingEngineers ? 'Loading…' : 'Select an assignee…'}
              sheetTitle="Assignees"
              options={[...(engineers ?? [])].sort(byEngineerAvailability(ticket.city)).map((e) => ({
                label: e.name,
                value: String(e.id),
                sublabel:
                  (e.role === 'MANAGER' ? 'Manager · ' : e.role === 'SALES' ? 'Sales rep · ' : '') +
                  engineerLoadLabel(e, e.role !== 'MANAGER') +
                  (e.district ? ` · ${e.district}` : ''),
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
              <>
                <Button
                  title="Accept ticket"
                  icon="hand-left-outline"
                  loading={busy}
                  onPress={() => run(() => api.acceptTicket(reference))}
                />
                <Button
                  title="Decline ticket"
                  icon="close-circle-outline"
                  variant="secondary"
                  loading={busy}
                  onPress={() => {
                    setDeclineReason('');
                    setDeclineError(null);
                    setDeclineOpen(true);
                  }}
                />
              </>
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
                      sublabel:
        (e.role === 'MANAGER' ? 'Manager · ' : e.role === 'SALES' ? 'Sales rep · ' : '') +
        engineerLoadLabel(e, e.role !== 'MANAGER') +
        (e.district ? ` · ${e.district}` : ''),
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
            <>
              <Text style={styles.muted}>
                Start your first attempt below to begin work.
              </Text>
              {!hasAnyAttempt && (
                <>
                  <Button
                    title="Undo accept"
                    icon="arrow-undo-outline"
                    variant="secondary"
                    loading={busy}
                    onPress={() => confirmRollback('accept')}
                  />
                  <Button
                    title="Decline ticket"
                    icon="close-circle-outline"
                    variant="secondary"
                    loading={busy}
                    onPress={() => {
                      setDeclineReason('');
                      setDeclineError(null);
                      setDeclineOpen(true);
                    }}
                  />
                </>
              )}
            </>
          ) : (
            <Text style={styles.muted}>
              Accepted by {ticket.assigned_engineer?.name ?? 'the engineer'} — awaiting
              start of work.
            </Text>
          ))}

        {ticket.status === 'RESOLVING' && (
          <>
            {assignedToMe ? (
              ticket.attempts.some((a) => !a.ended_at) ? (
                <Text style={styles.muted}>End the open attempt below before resolving.</Text>
              ) : ticket.attempts.filter((a) => a.ended_at).length === 0 ? (
                <>
                  <Text style={styles.muted}>Log at least one attempt below before resolving.</Text>
                  {!hasAnyAttempt && (
                    <Button
                      title="Undo start work"
                      icon="arrow-undo-outline"
                      variant="secondary"
                      loading={busy}
                      onPress={() => confirmRollback('start')}
                    />
                  )}
                </>
              ) : (
                <Button
                  title={isRemote ? 'Resolve & close' : 'Mark resolved'}
                  icon="checkmark-done-outline"
                  onPress={openResolve}
                />
              )
            ) : (
              <Text style={styles.muted}>
                {ticket.assigned_engineer?.name ?? 'The engineer'} is working on this
                ticket.
              </Text>
            )}

            {/* A manager/admin can hand a mid-resolution ticket to another
                engineer — but not while the current engineer still has an
                attempt open, or that work would be orphaned. */}
            {isManagerOrAdmin && (
              <View style={styles.reassign}>
                {ticket.attempts.some((a) => !a.ended_at) ? (
                  <Text style={styles.reassignHint}>
                    {ticket.assigned_engineer?.name ?? 'The current engineer'} has a
                    work attempt still in progress. Ask them to end it before this
                    ticket can be re-assigned.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.reassignHint}>
                      Re-assign this ticket to a different engineer if needed.
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
                          sublabel:
        (e.role === 'MANAGER' ? 'Manager · ' : e.role === 'SALES' ? 'Sales rep · ' : '') +
        engineerLoadLabel(e, e.role !== 'MANAGER') +
        (e.district ? ` · ${e.district}` : ''),
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
                  </>
                )}
              </View>
            )}
          </>
        )}

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

        {/* Sales representative — Admin/Manager credit who sourced the deal.
            Optional (a 'None' option); editable until the ticket is CLOSED. */}
        {canManageSalesRep && (
          <View style={styles.coEng}>
            <Text style={styles.coEngTitle}>Sales representative</Text>
            <Select
              label="Sales representative"
              value={salesRepId}
              onChange={(v) => setSalesRepId(v || null)}
              options={salesRepOptions}
              placeholder="None"
              sheetTitle="Sales Representative"
            />
            <Button
              title={ticket.sales_rep ? 'Update sales rep' : 'Set sales rep'}
              icon="briefcase-outline"
              variant="secondary"
              loading={savingSalesRep}
              disabled={
                salesRepId === (ticket.sales_rep ? String(ticket.sales_rep.id) : null)
              }
              onPress={handleSetSalesRep}
            />
          </View>
        )}
          </>
        )}

        {/* Parking the job — the exception, not the expected next step. */}
        {showHold && (
          <View style={styles.holdAction}>
            <Text style={styles.holdActionHint}>
              Park this ticket while it&apos;s blocked. It stops counting toward
              the engineer&apos;s open jobs and its SLA clock pauses until you
              resume it.
            </Text>
            <Button
              title="Put on hold"
              icon="pause-circle-outline"
              variant="secondary"
              loading={busy}
              onPress={() => setHoldOpen(true)}
            />
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
          {ticket.sales_rep && (
            <Text style={styles.trailLine}>
              Sales rep: {ticket.sales_rep.name}
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

      {/* Hold modal — reason is mandatory (the backend enforces min 3 chars). */}
      <Modal
        visible={holdOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setHoldOpen(false)}
      >
        <KeyboardAwareSheet>
          <Pressable style={styles.backdrop} onPress={() => setHoldOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Put ticket on hold</Text>
              <Text style={styles.sheetHint}>
                Work is frozen until a Manager or Admin resumes it. The assignee
                and current stage are kept, so resuming picks up where this left
                off.
              </Text>
              <Field
                value={holdReason}
                onChangeText={(t) => {
                  setHoldReason(t);
                  if (holdError) setHoldError(null);
                }}
                placeholder="e.g. waiting on a spare part from the vendor"
                multiline
                error={holdError ?? undefined}
              />
              <View style={styles.sheetActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setHoldOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Put on hold"
                  fullWidth={false}
                  loading={busy}
                  onPress={submitHold}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareSheet>
      </Modal>

      {/* Decline modal — mandatory reason, mirrors the hold sheet. */}
      <Modal
        visible={declineOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setDeclineOpen(false)}
      >
        <KeyboardAwareSheet>
          <Pressable style={styles.backdrop} onPress={() => setDeclineOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Decline this ticket</Text>
              <Text style={styles.sheetHint}>
                It goes back to the managers to re-triage, and they&apos;ll see
                your reason. You won&apos;t see this ticket again unless it is
                re-assigned to you.
              </Text>
              <Field
                value={declineReason}
                onChangeText={(t) => {
                  setDeclineReason(t);
                  if (declineError) setDeclineError(null);
                }}
                placeholder="e.g. out of my district this week"
                multiline
                error={declineError ?? undefined}
              />
              <View style={styles.sheetActions}>
                <Button
                  title="Cancel"
                  variant="secondary"
                  fullWidth={false}
                  onPress={() => setDeclineOpen(false)}
                  style={{ flex: 1 }}
                />
                <Button
                  title="Decline"
                  fullWidth={false}
                  loading={busy}
                  onPress={submitDecline}
                  style={{ flex: 1 }}
                />
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAwareSheet>
      </Modal>

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
            {/* Confirm the service charge — the amount billed on resolution.
                Editable as a final check; only committed on Confirm. */}
            <Field
              label="Service charge (₹)"
              value={feeDraft}
              onChangeText={(t) => {
                setFeeDraft(t);
                if (resolveError) setResolveError(null);
              }}
              placeholder="0"
              keyboardType="number-pad"
              hint={
                (resolveCharges?.service_fee_min_inr ?? 0) > 0
                  ? `Minimum ₹${resolveCharges!.service_fee_min_inr.toLocaleString('en-IN')}${
                      canWaiveBelowMin ? ' · you can set lower' : ''
                    }`
                  : undefined
              }
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
  holdCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
  },
  holdTitle: { fontSize: fontSize.sm, fontWeight: '700', color: colors.warn },
  holdReason: { fontSize: fontSize.md, color: colors.ink, lineHeight: 21 },
  holdHint: { fontSize: fontSize.sm, color: colors.warn, lineHeight: 19 },
  holdAction: { gap: spacing.sm },
  holdActionHint: { fontSize: fontSize.sm, color: colors.inkSubtle, lineHeight: 19 },
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
