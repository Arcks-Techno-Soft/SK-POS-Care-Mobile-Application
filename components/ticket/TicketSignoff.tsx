/** Resolution & sign-off — signatures, field-sign link, and PDF. */

import { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { AttachmentGallery } from '@/components/AttachmentGallery';
import { KeyboardAwareSheet } from '@/components/KeyboardAwareSheet';
import { SignaturePad } from '@/components/SignaturePad';
import { Section } from '@/components/ui/Section';
import { Badge, Banner, Button, Divider, Field } from '@/components/ui/kit';
import { ApiError } from '@/lib/api';
import { useApi, useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { pickFromLibrary, takePhoto } from '@/lib/images';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { PickedImage, TicketDetail } from '@/lib/types';

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

export default function TicketSignoff({ reference, ticket, reload }: Props) {
  const api = useApi();
  const { user } = useAuth();
  const isManagerOrAdmin = user?.role === 'MANAGER' || user?.role === 'ADMIN';

  const resolution = ticket.resolution;
  const customerSigned = !!resolution?.customer_signed_at;
  const engineerSigned = !!resolution?.engineer_signed_at;
  // Third-party tickets close on the engineer signature alone — no customer
  // signature, customer photo, or field sign-off link.
  const isThirdParty = ticket.service_type === 'THIRD_PARTY_SUPPORT';

  // Customer photo is captured during the engineer sign-off step (the engineer
  // signature closes the ticket, so this is the last chance to attach it).
  const serverPhotoCaptured = !!resolution?.customer_photo_captured_at;

  // The photo just picked on this device, shown as a preview immediately and
  // kept around (even if the upload fails) so the engineer always sees it.
  const [pendingPhoto, setPendingPhoto] = useState<PickedImage | null>(null);

  // Customer signature flow: name modal -> signature pad.
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [customerPadOpen, setCustomerPadOpen] = useState(false);

  const [engineerPadOpen, setEngineerPadOpen] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState<string | null>(null);

  const submitCustomerSignature = async (fileUri: string) => {
    setCustomerPadOpen(false);
    setBusy(true);
    setError(null);
    try {
      await api.signTicketCustomer(reference, signerName.trim(), fileUri);
      setSignerName('');
      reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // Submit the engineer signature (+ optional customer photo) — this closes
  // the ticket and generates the PDF.
  const submitEngineerSignature = async (fileUri: string, photo?: PickedImage) => {
    setBusy(true);
    setError(null);
    try {
      await api.signTicketEngineer(reference, fileUri, photo);
      reload();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  // After the engineer signs, prompt them to capture the customer's photo, then
  // submit the signature + photo together. The photo is optional (Skip allowed).
  const promptCustomerPhoto = (fileUri: string) => {
    setEngineerPadOpen(false);
    const pick = async (source: () => Promise<PickedImage[]>) => {
      try {
        const picked = await source();
        if (!picked.length) {
          // Picker cancelled — re-show the prompt so it isn't silently dropped.
          promptCustomerPhoto(fileUri);
          return;
        }
        // Show the preview right away, then upload.
        setPendingPhoto(picked[0]);
        submitEngineerSignature(fileUri, picked[0]);
      } catch (e) {
        setError(errMsg(e));
      }
    };
    Alert.alert(
      'Add customer photo',
      'Capture a photo of the customer for the resolution record.',
      [
        { text: 'Take photo', onPress: () => pick(takePhoto) },
        { text: 'Choose from library', onPress: () => pick(pickFromLibrary) },
        {
          text: 'Skip & finish',
          style: 'cancel',
          onPress: () => submitEngineerSignature(fileUri),
        },
      ],
    );
  };

  const generateLink = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.fieldSignLink(reference);
      setLinkUrl(res.url);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const shareLink = async (url: string) => {
    try {
      await Share.share({
        message: `Field sign-off link for ticket ${reference}: ${url}`,
        url,
      });
    } catch {
      // user cancelled — ignore
    }
  };

  const openPdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.getTicketPdf(reference);
      await WebBrowser.openBrowserAsync(res.url);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError('The resolution PDF is not ready yet. Try regenerating it.');
      } else {
        setError(errMsg(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const regeneratePdf = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.regenerateTicketPdf(reference);
      await WebBrowser.openBrowserAsync(res.url);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Resolution & sign-off">
      <View style={styles.body}>
        {error && <Banner message={error} />}

        {/* Resolution summary */}
        <View>
          <Text style={styles.label}>Resolution summary</Text>
          <Text style={styles.summary}>
            {ticket.resolution_summary?.trim() || 'No summary recorded.'}
          </Text>
        </View>

        <Divider style={{ marginVertical: spacing.sm }} />

        {/* Customer signature — not used on third-party tickets */}
        {!isThirdParty && (
          <>
            <View style={styles.signRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Customer signature</Text>
                {customerSigned ? (
                  <Text style={styles.signedText}>
                    Signed by {resolution?.customer_signer_name ?? 'customer'} ·{' '}
                    {formatDateTime(resolution?.customer_signed_at)}
                  </Text>
                ) : (
                  <Text style={styles.pending}>Not signed yet.</Text>
                )}
              </View>
              {customerSigned && <Badge label="Signed" tone="success" />}
            </View>
            {!customerSigned && (
              <Button
                title="Capture customer signature"
                icon="create-outline"
                variant="secondary"
                loading={busy}
                onPress={() => {
                  setSignerName('');
                  setNameError(null);
                  setNameModalOpen(true);
                }}
              />
            )}

            <Divider style={{ marginVertical: spacing.sm }} />
          </>
        )}

        {/* Engineer signature */}
        <View style={styles.signRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Engineer signature</Text>
            {engineerSigned ? (
              <Text style={styles.signedText}>
                Signed{resolution?.engineer_signer_name
                  ? ` by ${resolution.engineer_signer_name}`
                  : ''}{' '}
                · {formatDateTime(resolution?.engineer_signed_at)}
              </Text>
            ) : (
              <Text style={styles.pending}>Not signed yet.</Text>
            )}
          </View>
          {engineerSigned && <Badge label="Signed" tone="success" />}
        </View>
        {!engineerSigned && (
          <Button
            title="Capture engineer signature"
            icon="create-outline"
            variant="secondary"
            loading={busy}
            onPress={() => setEngineerPadOpen(true)}
          />
        )}

        <Divider style={{ marginVertical: spacing.sm }} />

        {/* Customer photo + field sign-off link — not used on third-party */}
        {!isThirdParty && (
          <>
            {/* Customer photo — captured during engineer sign-off (read-only here) */}
            <View style={styles.signRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Customer photo</Text>
                {serverPhotoCaptured ? (
                  <Text style={styles.signedText}>
                    Captured · {formatDateTime(resolution?.customer_photo_captured_at)}
                  </Text>
                ) : pendingPhoto ? (
                  <Text style={styles.signedText}>
                    {busy ? 'Uploading photo…' : 'Photo ready.'}
                  </Text>
                ) : (
                  <Text style={styles.pending}>
                    {engineerSigned
                      ? 'No photo captured.'
                      : 'Captured when the engineer signs off.'}
                  </Text>
                )}
              </View>
              {serverPhotoCaptured && <Badge label="Added" tone="success" />}
            </View>
            {pendingPhoto ? (
              <AttachmentGallery urls={[pendingPhoto.uri]} size={96} />
            ) : (
              !!resolution?.customer_photo_url && (
                <AttachmentGallery urls={[resolution.customer_photo_url]} size={96} />
              )
            )}

            <Divider style={{ marginVertical: spacing.sm }} />

            {/* Field sign-off link */}
            <Button
              title="Generate field sign-off link"
              icon="link-outline"
              variant="secondary"
              loading={busy}
              onPress={generateLink}
            />
            {!!linkUrl && (
              <View style={styles.linkBox}>
                <Text style={styles.linkText} selectable numberOfLines={2}>
                  {linkUrl}
                </Text>
                <Button
                  title="Share link"
                  icon="share-outline"
                  size="sm"
                  onPress={() => shareLink(linkUrl)}
                />
              </View>
            )}

            <Divider style={{ marginVertical: spacing.sm }} />
          </>
        )}

        {/* PDF */}
        <Button
          title="View resolution PDF"
          icon="document-text-outline"
          variant="secondary"
          loading={busy}
          onPress={openPdf}
        />
        {isManagerOrAdmin && (
          <Button
            title="Regenerate PDF"
            icon="refresh-outline"
            variant="ghost"
            size="sm"
            loading={busy}
            onPress={regeneratePdf}
          />
        )}
      </View>

      {/* Customer signer name modal */}
      <Modal
        visible={nameModalOpen}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setNameModalOpen(false)}
      >
        <KeyboardAwareSheet>
        <Pressable style={styles.backdrop} onPress={() => setNameModalOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Customer sign-off</Text>
            <Text style={styles.sheetHint}>
              Enter the name of the person signing on the customer&apos;s behalf.
            </Text>
            <Field
              label="Signer name"
              value={signerName}
              onChangeText={(t) => {
                setSignerName(t);
                if (nameError) setNameError(null);
              }}
              placeholder="Full name"
              error={nameError ?? undefined}
              required
            />
            <View style={styles.sheetActions}>
              <Button
                title="Cancel"
                variant="secondary"
                fullWidth={false}
                onPress={() => setNameModalOpen(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Continue"
                fullWidth={false}
                onPress={() => {
                  if (!signerName.trim()) {
                    setNameError('Signer name is required.');
                    return;
                  }
                  setNameModalOpen(false);
                  setCustomerPadOpen(true);
                }}
                style={{ flex: 1 }}
              />
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAwareSheet>
      </Modal>

      {/* Customer signature pad */}
      <SignaturePad
        visible={customerPadOpen}
        title="Customer signature"
        caption={signerName ? `Signing as ${signerName}` : undefined}
        onCancel={() => setCustomerPadOpen(false)}
        onConfirm={submitCustomerSignature}
      />

      {/* Engineer signature pad — after signing, prompt for the customer photo
          (site-visit); third-party closes on the engineer signature alone. */}
      <SignaturePad
        visible={engineerPadOpen}
        title="Engineer signature"
        caption={user?.name ? `Signing as ${user.name}` : undefined}
        onCancel={() => setEngineerPadOpen(false)}
        onConfirm={
          isThirdParty
            ? (uri) => {
                setEngineerPadOpen(false);
                submitEngineerSignature(uri);
              }
            : promptCustomerPhoto
        }
      />
    </Section>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkSoft },
  summary: {
    fontSize: fontSize.sm,
    color: colors.inkSoft,
    lineHeight: 21,
    marginTop: 4,
  },

  signRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  signedText: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 3 },
  pending: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 3 },

  linkBox: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  linkText: {
    fontSize: fontSize.xs,
    color: colors.info,
    fontFamily: 'monospace',
  },

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
