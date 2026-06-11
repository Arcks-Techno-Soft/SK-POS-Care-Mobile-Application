/**
 * Wraps scrollable form content so the focused text input stays above the
 * keyboard. Pair with `automaticallyAdjustKeyboardInsets` on the inner
 * ScrollView (iOS); this handles the Android side by resizing the container.
 */

import { useHeaderHeight } from '@react-navigation/elements';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

interface KeyboardAvoiderProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function KeyboardAvoider({ children, style }: KeyboardAvoiderProps) {
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      style={style ?? { flex: 1 }}
      // iOS relies on the ScrollView's automaticallyAdjustKeyboardInsets, so
      // no padding here; Android shrinks the container to lift the inputs.
      behavior={Platform.OS === 'ios' ? undefined : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
