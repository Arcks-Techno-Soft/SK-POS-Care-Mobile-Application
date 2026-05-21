/** Work notes — chronological note feed with a composer. */

import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Section } from '@/components/ui/Section';
import { Avatar, Banner, Button, Divider, Field } from '@/components/ui/kit';
import { ApiError } from '@/lib/api';
import { useApi } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { roleLabel, ticketIsOperable, ticketLockReason } from '@/lib/options';
import { colors, fontSize, spacing } from '@/lib/theme';
import type { PickedImage, TicketDetail, WorkNote } from '@/lib/types';

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

export default function TicketNotes({ reference, ticket }: Props) {
  const api = useApi();
  const notesQuery = useQuery<WorkNote[]>(
    () => api.ticketNotes(reference),
    [reference],
  );

  const [body, setBody] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!body.trim()) {
      setError('Write a note before posting.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.addTicketNote(reference, body.trim(), images);
      setBody('');
      setImages([]);
      notesQuery.reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setSubmitting(false);
    }
  };

  const notes = notesQuery.data ?? [];
  const operable = ticketIsOperable(ticket.status);

  return (
    <Section title="Work notes" subtitle={notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : undefined}>
      <View style={styles.body}>
        {notesQuery.loading && !notesQuery.data ? (
          <ActivityIndicator color={colors.inkMuted} style={{ marginVertical: spacing.md }} />
        ) : notesQuery.error && !notesQuery.data ? (
          <Banner message={notesQuery.error} />
        ) : notes.length === 0 ? (
          <Text style={styles.empty}>No work notes yet.</Text>
        ) : (
          notes.map((note, i) => (
            <View key={note.id}>
              {i > 0 && <Divider style={{ marginVertical: spacing.md }} />}
              <View style={styles.noteHead}>
                <Avatar name={note.author.name} size={30} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.author}>{note.author.name}</Text>
                  <Text style={styles.authorMeta}>
                    {roleLabel(note.author.role)} · {timeAgo(note.created_at)}
                  </Text>
                </View>
              </View>
              <Text style={styles.noteBody}>{note.body}</Text>
              {note.attachments.length > 0 && (
                <View style={{ marginTop: spacing.sm }}>
                  <AttachmentGallery
                    urls={note.attachments.map((a) => a.storage_url)}
                    size={72}
                  />
                </View>
              )}
            </View>
          ))
        )}

        <Divider style={{ marginVertical: spacing.sm }} />

        {/* Composer */}
        {operable ? (
          <View style={styles.composer}>
            {error && <Banner message={error} />}
            <Field
              label="Add a note"
              value={body}
              onChangeText={(t) => {
                setBody(t);
                if (error) setError(null);
              }}
              placeholder="Describe progress, findings, next steps…"
              multiline
            />
            <PhotoPicker images={images} onChange={setImages} disabled={submitting} />
            <Button
              title="Add note"
              icon="send-outline"
              loading={submitting}
              onPress={submit}
            />
          </View>
        ) : (
          <Text style={styles.empty}>{ticketLockReason(ticket.status)}</Text>
        )}
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.xs },
  empty: { fontSize: fontSize.sm, color: colors.inkSubtle, paddingVertical: spacing.xs },

  noteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  author: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  authorMeta: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 1 },
  noteBody: { fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: 21 },

  composer: { gap: spacing.md },
});
