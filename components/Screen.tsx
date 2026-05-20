/** Standard screen container with optional pull-to-refresh scrolling. */

import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, spacing } from '@/lib/theme';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  refreshing,
  onRefresh,
  contentStyle,
}: ScreenProps) {
  if (scroll) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[
          padded && styles.padded,
          styles.scrollContent,
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={colors.inkMuted}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.root, padded && styles.padded, contentStyle]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceRaised },
  padded: { padding: spacing.lg },
  scrollContent: { paddingBottom: spacing.xxxl, gap: spacing.md },
});
