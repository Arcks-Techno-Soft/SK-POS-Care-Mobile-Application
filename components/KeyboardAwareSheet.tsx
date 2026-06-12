/**
 * Lifts a bottom-sheet <Modal>'s content above the keyboard.
 *
 * React Native's <Modal> renders in a separate native window, so the root
 * <KeyboardProvider> doesn't reach inside it — we re-provide it here and use
 * keyboard-controller's KeyboardAvoidingView (behavior="padding") to push the
 * flex-end sheet up by the keyboard height. Without this the keyboard covers
 * the sheet's input fields.
 *
 * Usage: place directly inside <Modal> and wrap the backdrop:
 *   <Modal ... statusBarTranslucent>
 *     <KeyboardAwareSheet>
 *       <Pressable style={styles.backdrop}>…</Pressable>
 *     </KeyboardAwareSheet>
 *   </Modal>
 */
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardProvider,
} from 'react-native-keyboard-controller';

export function KeyboardAwareSheet({ children }: { children: ReactNode }) {
  return (
    <KeyboardProvider>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        {children}
      </KeyboardAvoidingView>
    </KeyboardProvider>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
