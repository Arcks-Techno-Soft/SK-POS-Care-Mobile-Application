/**
 * Slim, non-blocking banner pinned to the top of the app. Appears only once an
 * OTA update has been downloaded and is waiting for a restart. Tapping Restart
 * applies it immediately; ignoring it is fine — the staged update auto-applies
 * on the next launch.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOtaUpdates } from '@/lib/updates';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

export function UpdateBanner() {
  const { ready, apply } = useOtaUpdates();
  const insets = useSafeAreaInsets();

  if (!ready) return null;

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.xs }]} pointerEvents="box-none">
      <View style={styles.card}>
        <Text style={styles.text} numberOfLines={1}>
          A new version is ready
        </Text>
        <Pressable
          onPress={apply}
          style={({ pressed }) => [styles.button, { opacity: pressed ? 0.7 : 1 }]}
          hitSlop={8}
        >
          <Text style={styles.buttonText}>Restart</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: { color: colors.surface, fontSize: fontSize.sm, fontWeight: '600', flexShrink: 1 },
  button: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  buttonText: { color: colors.ink, fontSize: fontSize.sm, fontWeight: '700' },
});
