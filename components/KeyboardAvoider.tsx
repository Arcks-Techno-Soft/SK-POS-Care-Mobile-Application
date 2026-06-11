/**
 * Wraps scrollable form content so the focused text input stays above the
 * keyboard on both iOS and Android. Uses react-native-keyboard-controller's
 * KeyboardAvoidingView, which handles the New Architecture + edge-to-edge
 * Android setup correctly (the built-in RN one leaves a stale gap there).
 *
 * Requires <KeyboardProvider> at the app root and a native dev build —
 * it does not run in Expo Go.
 */

import { useHeaderHeight } from '@react-navigation/elements';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import type { StyleProp, ViewStyle } from 'react-native';

interface KeyboardAvoiderProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function KeyboardAvoider({ children, style }: KeyboardAvoiderProps) {
  const headerHeight = useHeaderHeight();
  return (
    <KeyboardAvoidingView
      style={style ?? { flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={headerHeight}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
