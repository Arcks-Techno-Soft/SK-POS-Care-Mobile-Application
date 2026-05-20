/** Numeric passcode entry — dot indicator + on-screen keypad. */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/lib/theme';

interface PasscodeKeypadProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  /** Shows a biometric key in the bottom-left slot when provided. */
  onBiometric?: () => void;
  error?: boolean;
  disabled?: boolean;
}

export function PasscodeKeypad({
  value,
  onChange,
  length = 4,
  onBiometric,
  error,
  disabled,
}: PasscodeKeypadProps) {
  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    onChange(value + digit);
  };
  const backspace = () => {
    if (disabled || value.length === 0) return;
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.root}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && styles.dotFilled,
              error && styles.dotError,
            ]}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Key key={d} label={d} onPress={() => press(d)} disabled={disabled} />
        ))}
        {onBiometric ? (
          <Key icon="finger-print" onPress={onBiometric} disabled={disabled} />
        ) : (
          <View style={styles.key} />
        )}
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <Key icon="backspace-outline" onPress={backspace} disabled={disabled} />
      </View>
    </View>
  );
}

function Key({
  label,
  icon,
  onPress,
  disabled,
}: {
  label?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.key,
        pressed && styles.keyPressed,
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={26} color={colors.ink} />
      ) : (
        <Text style={styles.keyText}>{label}</Text>
      )}
    </Pressable>
  );
}

const KEY_SIZE = 76;

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: spacing.xxl },
  dots: { flexDirection: 'row', gap: spacing.lg },
  dot: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: colors.ink, borderColor: colors.ink },
  dotError: { borderColor: colors.danger },

  grid: {
    width: KEY_SIZE * 3 + spacing.lg * 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  key: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: KEY_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.surfaceSunken },
  keyText: { fontSize: 30, fontWeight: '400', color: colors.ink },
});
