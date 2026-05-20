/** Full-screen signature capture modal backed by react-native-signature-canvas. */

import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SignatureScreen, { type SignatureViewRef } from 'react-native-signature-canvas';

import { Button } from '@/components/ui/kit';
import { saveSignaturePng } from '@/lib/signature';
import { colors, fontSize, spacing } from '@/lib/theme';

const WEB_STYLE = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; margin: 0; }
  body, html { height: 100%; background: #fff; }
`;

interface SignaturePadProps {
  visible: boolean;
  title: string;
  /** Description of who is signing, shown above the pad. */
  caption?: string;
  onCancel: () => void;
  onConfirm: (fileUri: string) => void;
}

export function SignaturePad({
  visible,
  title,
  caption,
  onCancel,
  onConfirm,
}: SignaturePadProps) {
  const ref = useRef<SignatureViewRef>(null);
  const [saving, setSaving] = useState(false);

  const handleOK = async (signature: string) => {
    try {
      setSaving(true);
      const uri = await saveSignaturePng(signature);
      onConfirm(uri);
    } catch (e) {
      Alert.alert('Signature', (e as Error).message ?? 'Could not save signature.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {caption && <Text style={styles.caption}>{caption}</Text>}
          </View>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.inkMuted} />
          </Pressable>
        </View>

        <View style={styles.padWrap}>
          <SignatureScreen
            ref={ref}
            onOK={handleOK}
            onEmpty={() => Alert.alert('Signature', 'Please sign before saving.')}
            webStyle={WEB_STYLE}
            backgroundColor="#FFFFFF"
            penColor="#0A0A0A"
            descriptionText=""
          />
          <View pointerEvents="none" style={styles.signLine}>
            <Text style={styles.signHint}>Sign above</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Button
            title="Clear"
            variant="secondary"
            fullWidth={false}
            onPress={() => ref.current?.clearSignature()}
            style={{ flex: 1 }}
          />
          <Button
            title="Save signature"
            loading={saving}
            fullWidth={false}
            onPress={() => ref.current?.readSignature()}
            style={{ flex: 2 }}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  caption: { fontSize: fontSize.sm, color: colors.inkSubtle, marginTop: 2 },
  padWrap: { flex: 1, margin: spacing.lg, borderWidth: 1, borderColor: colors.line },
  signLine: {
    position: 'absolute',
    bottom: 28,
    left: 24,
    right: 24,
    borderTopWidth: 1,
    borderTopColor: colors.lineStrong,
    alignItems: 'center',
  },
  signHint: { fontSize: fontSize.xs, color: colors.inkFaint, marginTop: 4 },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
  },
});
