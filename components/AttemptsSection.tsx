import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Badge, Banner, Button, Divider, Field } from '@/components/ui/kit';
import { Section } from '@/components/ui/Section';
import { ApiError } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { roleLabel } from '@/lib/options';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { PickedImage, User } from '@/lib/types';

/** Minimal note shape shared by ticket WorkNote and InstallationNote. */
type AttemptNote = {
  id: number;
  body: string;
  created_at: string;
  author: User;
  attachments: { storage_url: string }[];
};

/** Minimal attempt shape shared by TicketAttempt and InstallationAttempt. */
export type AttemptVM = {
  id: number;
  attempt_number: number;
  started_at: string;
  ended_at: string | null;
  started_by: User | null;
  notes: AttemptNote[];
};

/**
 * Work-attempts log shared by the ticket and installation detail screens.
 * Engineers start an attempt, add notes + photos inside it, then end it; the
 * next attempt becomes available. All actions go through the parent-supplied
 * callbacks (which hit the API and reload the detail).
 */
export function AttemptsSection({
  attempts,
  canWork,
  canStart,
  onStartAttempt,
  onEndAttempt,
  onAddNote,
}: {
  attempts: AttemptVM[];
  /** Assignee / Manager / Admin may run attempts on a workable status. */
  canWork: boolean;
  /** Parent status allows starting a new attempt (no open one exists). */
  canStart: boolean;
  onStartAttempt: () => Promise<void>;
  onEndAttempt: (attemptId: number) => Promise<void>;
  onAddNote: (body: string, images: PickedImage[]) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [images, setImages] = useState<PickedImage[]>([]);

  const openAttempt = attempts.find((a) => !a.ended_at) ?? null;
  const nextNumber = attempts.reduce((m, a) => Math.max(m, a.attempt_number), 0) + 1;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBanner(null);
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleStart = () => run('start', onStartAttempt);

  const handleEnd = (attemptId: number) => {
    Alert.alert('End attempt', 'End this attempt? You can start another later.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End attempt', onPress: () => run('end', () => onEndAttempt(attemptId)) },
    ]);
  };

  const handleAddNote = async () => {
    if (!body.trim() && images.length === 0) {
      Alert.alert('Note', 'Please enter a note or attach a photo.');
      return;
    }
    await run('note', async () => {
      await onAddNote(body.trim(), images);
      setBody('');
      setImages([]);
    });
  };

  return (
    <Section
      title="Work attempts"
      subtitle={attempts.length ? `${attempts.length} attempt${attempts.length === 1 ? '' : 's'}` : undefined}
    >
      {banner && <Banner message={banner} tone="danger" />}

      {attempts.length === 0 && (
        <Text style={styles.dim}>
          {canStart
            ? 'No attempts yet. Start your first attempt to log work on-site.'
            : 'No attempts yet.'}
        </Text>
      )}

      {attempts.map((attempt, idx) => {
        const isOpen = !attempt.ended_at;
        return (
          <View key={attempt.id} style={[styles.card, idx > 0 && { marginTop: spacing.md }]}>
            <View style={styles.cardHead}>
              <Text style={styles.attemptTitle}>Attempt {attempt.attempt_number}</Text>
              <Badge
                label={isOpen ? 'In progress' : 'Done'}
                tone={isOpen ? 'warn' : 'success'}
              />
            </View>
            <Text style={styles.meta}>
              {attempt.started_by ? `${attempt.started_by.name} · ` : ''}
              Started {formatDateTime(attempt.started_at)}
              {attempt.ended_at ? ` · Ended ${formatDateTime(attempt.ended_at)}` : ''}
            </Text>

            {attempt.notes.length === 0 ? (
              <Text style={styles.dimSmall}>No notes in this attempt yet.</Text>
            ) : (
              attempt.notes.map((note, nIdx) => (
                <View key={note.id} style={nIdx > 0 ? { marginTop: spacing.sm } : undefined}>
                  <View style={styles.noteHead}>
                    <Text style={styles.noteAuthor}>
                      {note.author.name}{' '}
                      <Text style={styles.noteRole}>· {roleLabel(note.author.role)}</Text>
                    </Text>
                    <Text style={styles.noteTime}>{timeAgo(note.created_at)}</Text>
                  </View>
                  {!!note.body && <Text style={styles.noteBody}>{note.body}</Text>}
                  {note.attachments.length > 0 && (
                    <View style={{ marginTop: spacing.sm }}>
                      <AttachmentGallery urls={note.attachments.map((a) => a.storage_url)} />
                    </View>
                  )}
                </View>
              ))
            )}

            {/* Composer + End — only inside the open attempt, for workers. */}
            {isOpen && canWork && (
              <View style={styles.composer}>
                <Divider style={{ marginVertical: spacing.md }} />
                <Field
                  label="Add note"
                  value={body}
                  onChangeText={setBody}
                  placeholder="Describe the work done in this attempt…"
                  multiline
                />
                <PhotoPicker images={images} onChange={setImages} disabled={busy === 'note'} />
                <Button
                  title="Add note"
                  variant="secondary"
                  icon="chatbubble-outline"
                  onPress={handleAddNote}
                  loading={busy === 'note'}
                  style={{ marginTop: spacing.xs }}
                />
                <Button
                  title="End attempt"
                  icon="stop-circle-outline"
                  onPress={() => handleEnd(attempt.id)}
                  loading={busy === 'end'}
                  style={{ marginTop: spacing.sm }}
                />
              </View>
            )}
          </View>
        );
      })}

      {/* Start a new attempt when none is open and the status allows it. */}
      {canWork && canStart && !openAttempt && (
        <Button
          title={`Start attempt ${nextNumber}`}
          icon="play-circle-outline"
          onPress={handleStart}
          loading={busy === 'start'}
          style={{ marginTop: attempts.length ? spacing.md : 0 }}
        />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.inkMuted, fontSize: fontSize.sm },
  dimSmall: { color: colors.inkFaint, fontSize: fontSize.xs, marginTop: spacing.xs },
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attemptTitle: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  meta: { fontSize: fontSize.xs, color: colors.inkMuted, marginTop: 2, marginBottom: spacing.sm },
  composer: {},
  noteHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteAuthor: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },
  noteRole: { fontWeight: '400', color: colors.inkMuted },
  noteTime: { fontSize: fontSize.xs, color: colors.inkFaint },
  noteBody: { fontSize: fontSize.sm, color: colors.ink, marginTop: 2 },
});
