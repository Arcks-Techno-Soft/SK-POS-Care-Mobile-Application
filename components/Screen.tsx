/** Standard screen container with optional pull-to-refresh scrolling. */

import {
  RefreshControl,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';

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
    // KeyboardAwareScrollView scrolls the focused input just above the keyboard
    // on demand. Unlike a KeyboardAvoidingView with behavior="padding", it does
    // NOT reserve a keyboard-height block of empty space, so short forms no
    // longer show a blank gap above the keyboard while typing.
    return (
      <KeyboardAwareScrollView
        style={styles.root}
        contentContainerStyle={[
          padded && styles.padded,
          styles.scrollContent,
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={spacing.xl}
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
      </KeyboardAwareScrollView>
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
