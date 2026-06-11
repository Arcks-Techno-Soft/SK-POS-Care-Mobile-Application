/** Standard screen container with optional pull-to-refresh scrolling. */

import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { KeyboardAvoider } from '@/components/KeyboardAvoider';
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
      <KeyboardAvoider style={styles.root}>
        <ScrollView
          style={styles.root}
          contentContainerStyle={[
            padded && styles.padded,
            styles.scrollContent,
            contentStyle,
          ]}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
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
      </KeyboardAvoider>
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
