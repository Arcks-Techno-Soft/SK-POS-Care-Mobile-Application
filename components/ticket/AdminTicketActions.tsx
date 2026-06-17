/** Admin/Owner-only override buttons on the ticket detail screen: force-close
 * (with summary + pending review) and soft-delete. Both buttons are red. */

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
}

export default function AdminTicketActions({ reference, status, onChanged, onDeleted }: Props) {
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
      <Button
        title="Delete ticket"
        variant="danger"
        icon="trash-outline"
        onPress={() => setMode('delete')}
        style={styles.flex}
      />

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
