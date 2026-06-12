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

  const [busy, setBusy] = useState(false);
  const [engineers, setEngineers] = useState<User[] | null>(null);
  const [loadingEngineers, setLoadingEngineers] = useState(false);
  const [engineersError, setEngineersError] = useState<string | null>(null);
  const [pickedEngineer, setPickedEngineer] = useState<string | null>(null);

  const [resolveOpen, setResolveOpen] = useState(false);
  const [summary, setSummary] = useState('');
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const isManagerOrOwner = user?.role === 'MANAGER' || user?.role === 'OWNER';
  const assignedToMe =
    ticket.assigned_engineer != null && ticket.assigned_engineer.id === user?.id;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      reload();
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

  // Engineers populate the assign dropdown — load them automatically as soon
  // as the ticket is acknowledged and ready to be assigned.
  useEffect(() => {
    if (ticket.status === 'ACKNOWLEDGED') loadEngineers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket.status]);

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
              disabled={!pickedEngineer}
              onPress={() =>
                run(() => api.assignTicket(reference, Number(pickedEngineer)))
              }
            />
            {isManagerOrOwner && (
              <Button
                title="Assign to me"
                variant="secondary"
                loading={busy}
                onPress={() => run(() => api.selfAssignTicket(reference))}
              />
            )}
          </>
        )}

        {ticket.status === 'ASSIGNED' &&
          (assignedToMe ? (
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
          ))}

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
              title="Mark resolved"
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
            <Text style={styles.sheetTitle}>Mark resolved</Text>
            <Text style={styles.sheetHint}>
              Summarise what was done to resolve this ticket.
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
                title="Resolve ticket"
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
  engineersError: { gap: spacing.sm },
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
