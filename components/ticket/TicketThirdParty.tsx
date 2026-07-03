/** Third-party support details — device name, issue info, ticket reference.
 * Only rendered for THIRD_PARTY_SUPPORT tickets. Device name + issue info are
 * required before the ticket can close (enforced by the backend); editable by
 * Admin/Manager or the assigned engineer until the ticket is closed. */

import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Section } from '@/components/ui/Section';
import { Badge, Banner, Button, Field } from '@/components/ui/kit';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { TicketDetail } from '@/lib/types';

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

export default function TicketThirdParty({ reference, ticket, reload }: Props) {
  const api = useApi();
  const { user } = useAuth();

  const canEdit =
    (user?.role === 'MANAGER' ||
      user?.role === 'ADMIN' ||
      ticket.assigned_engineer?.id === user?.id) &&
    ticket.status !== 'CLOSED';

  const [device, setDevice] = useState(ticket.third_party_device_name ?? '');
  const [issue, setIssue] = useState(ticket.third_party_issue_info ?? '');
  const [ref, setRef] = useState(ticket.third_party_ticket_ref ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the form in sync with the ticket after a save (which refetches).
  useEffect(() => {
    setDevice(ticket.third_party_device_name ?? '');
    setIssue(ticket.third_party_issue_info ?? '');
    setRef(ticket.third_party_ticket_ref ?? '');
  }, [
    ticket.third_party_device_name,
    ticket.third_party_issue_info,
    ticket.third_party_ticket_ref,
  ]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateThirdPartyInfo(reference, {
        third_party_device_name: device.trim(),
        third_party_issue_info: issue.trim(),
        third_party_ticket_ref: ref.trim(),
      });
      reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) {
    // Read-only view for anyone who can't edit (or once closed).
    return (
      <Section title="Third-party support">
        <View style={styles.body}>
          <ReadRow label="Device name" value={ticket.third_party_device_name} />
          <ReadRow label="Issue info" value={ticket.third_party_issue_info} />
          <ReadRow label="Ticket reference" value={ticket.third_party_ticket_ref} />
        </View>
      </Section>
    );
  }

  return (
    <Section title="Third-party support">
      <View style={styles.body}>
        {error && <Banner message={error} />}
        <Text style={styles.hint}>
          Device name and issue info are required to close this ticket.
        </Text>
        <Field
          label="Third-party device name"
          required
          value={device}
          onChangeText={setDevice}
          placeholder="e.g. Epson TM-T88 printer"
        />
        <Field
          label="Issue info"
          required
          value={issue}
          onChangeText={setIssue}
          placeholder="Describe the third-party device issue"
          multiline
          numberOfLines={3}
        />
        <Field
          label="Third-party ticket reference (optional)"
          value={ref}
          onChangeText={setRef}
          placeholder="Reference no. in the third party's system"
        />
        <Button
          title="Save third-party details"
          icon="save-outline"
          loading={busy}
          onPress={save}
        />
      </View>
    </Section>
  );
}

function ReadRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.readRow}>
      <Text style={styles.readLabel}>{label}</Text>
      <Text style={styles.readValue}>{value?.trim() || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  hint: { fontSize: fontSize.sm, color: colors.inkMuted },
  readRow: { gap: 2 },
  readLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkSoft },
  readValue: { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 21 },
});
