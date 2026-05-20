/** Loading / error / empty placeholder views. */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/kit';
import { colors, fontSize, spacing } from '@/lib/theme';

export function Loading({ label }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.ink} />
      {label && <Text style={styles.dim}>{label}</Text>}
    </View>
  );
}

export function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name="cloud-offline-outline" size={42} color={colors.inkFaint} />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.dim}>{message}</Text>
      {onRetry && (
        <View style={{ marginTop: spacing.md }}>
          <Button title="Try again" variant="secondary" fullWidth={false} onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.center}>
      <Ionicons name={icon} size={42} color={colors.inkFaint} />
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.dim}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.sm,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  dim: {
    fontSize: fontSize.sm,
    color: colors.inkSubtle,
    textAlign: 'center',
    lineHeight: 20,
  },
});
