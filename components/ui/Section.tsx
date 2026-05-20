/** A titled content block — used to group detail-screen sections. */

import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/kit';
import { colors, fontSize, spacing } from '@/lib/theme';

interface SectionProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Remove inner padding (e.g. for list rows that draw their own dividers). */
  flush?: boolean;
}

export function Section({ title, subtitle, right, children, flush }: SectionProps) {
  return (
    <Card padded={false} style={styles.card}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {right}
      </View>
      <View style={flush ? undefined : styles.body}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  title: { fontSize: fontSize.md, fontWeight: '700', color: colors.ink },
  subtitle: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 2 },
  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
