/** Admin-level override buttons on the ticket detail screen: force-close (with
 * summary + pending review) and, for a Super Admin only, soft-delete. Both
 * buttons are red. Force-close became Admin-level on 2026-09-04; delete stays
 * reserved, so the caller passes canDelete. */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import AdminTicketActionModals, {
  type AdminActionMode,
} from '@/components/ticket/AdminTicketActionModals';
import { Button } from '@/components/ui/kit';
import { spacing } from '@/lib/theme';
import type { TicketStatus } from '@/lib/types';

interface Props {
  reference: string;
  status: TicketStatus;
  /** Refresh the ticket after a force-close. */
  onChanged: () => void;
  /** Navigate away after a delete (the ticket is now hidden). */
  onDeleted: () => void;
  /** Super Admin only — plain Admins get force-close without delete. */
  canDelete: boolean;
}

export default function AdminTicketActions({
  reference,
  status,
  onChanged,
  onDeleted,
  canDelete,
}: Props) {
  const [mode, setMode] = useState<AdminActionMode>(null);

  return (
    <View style={styles.row}>
      {status !== 'CLOSED' && (
        <Button
          title="Close ticket"
          variant="danger"
          icon="close-circle-outline"
          onPress={() => setMode('close')}
          style={styles.flex}
        />
      )}
      {canDelete && (
        <Button
          title="Delete ticket"
          variant="danger"
          icon="trash-outline"
          onPress={() => setMode('delete')}
          style={styles.flex}
        />
      )}

      <AdminTicketActionModals
        reference={reference}
        mode={mode}
        onClose={() => setMode(null)}
        onChanged={() => {
          setMode(null);
          onChanged();
        }}
        onDeleted={() => {
          setMode(null);
          onDeleted();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
