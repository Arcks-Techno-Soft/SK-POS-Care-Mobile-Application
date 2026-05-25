/** Modal bottom-sheet picker. */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { colors, fontSize, radius, spacing } from '@/lib/theme';

export interface SelectOption {
  label: string;
  value: string;
  sublabel?: string;
}

interface SelectProps {
  label?: string;
  value: string | null;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  /** Title shown at the top of the picker sheet. */
  sheetTitle?: string;
}

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = 'Select…',
  required,
  disabled,
  sheetTitle,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.wrap}>
      {label && (
        <Text style={styles.label}>
          {label}
          {required && <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
      )}
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.control, disabled && { opacity: 0.5 }]}
      >
        <Text
          style={[styles.controlText, !selected && { color: colors.inkFaint }]}
          numberOfLines={1}
        >
          {selected ? selected.label : placeholder}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.inkSubtle} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Animated.View entering={SlideInDown.duration(240)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{sheetTitle ?? label ?? 'Select'}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.inkMuted} />
              </Pressable>
            </View>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <Pressable
                    style={styles.option}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>
                        {item.label}
                      </Text>
                      {item.sublabel && (
                        <Text style={styles.optionSub}>{item.sublabel}</Text>
                      )}
                    </View>
                    {active && (
                      <Ionicons name="checkmark" size={20} color={colors.ink} />
                    )}
                  </Pressable>
                );
              }}
            />
          </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Build SelectOptions from a plain string array. */
export function toOptions(values: readonly string[]): SelectOption[] {
  return values.map((v) => ({ label: v, value: v }));
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkSoft },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  controlText: { fontSize: fontSize.md, color: colors.ink, flex: 1 },

  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10,10,10,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: spacing.xxl,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceSunken,
  },
  optionText: { fontSize: fontSize.md, color: colors.inkSoft },
  optionTextActive: { fontWeight: '700', color: colors.ink },
  optionSub: { fontSize: fontSize.xs, color: colors.inkSubtle, marginTop: 2 },
});
