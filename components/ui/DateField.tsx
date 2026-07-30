/** DateField — a calendar picker built from plain React Native primitives.
 *
 *  Deliberately dependency-free: adding a native date-picker module would
 *  force a new APK/AAB, whereas this ships as a JS-only OTA update. Values
 *  are exchanged as bare "yyyy-mm-dd" strings to match the API's date-only
 *  fields, and all arithmetic runs in the device's local timezone.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDateOnly, parseISODate, toISODate, todayISO } from '@/lib/format';
import { colors, fontSize, spacing } from '@/lib/theme';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

type Cell = { day: number; iso: string } | null;

/** Leading blanks + the month's days, padded out to whole weeks. */
function monthCells(year: number, month: number): Cell[] {
  const lead = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const cells: Cell[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) {
    cells.push({ day: d, iso: toISODate(new Date(year, month, d)) });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = 'Select a date…',
  sheetTitle,
  helper,
  error,
  minDate,
  disabled = false,
  clearable = true,
}: {
  label?: string;
  /** "yyyy-mm-dd", or null when unset. */
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  sheetTitle?: string;
  helper?: string;
  error?: string;
  /** Earliest selectable date, "yyyy-mm-dd". Earlier days render disabled. */
  minDate?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The month the grid is showing — starts on the selected date, else today.
  const [cursor, setCursor] = useState(() => parseISODate(value) ?? new Date());

  // Re-centre on the current value each time the sheet opens, so re-opening
  // after a save doesn't leave the user stranded on last month.
  useEffect(() => {
    if (open) setCursor(parseISODate(value) ?? new Date());
  }, [open, value]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const cells = monthCells(year, month);
  const today = todayISO();

  const step = (delta: number) => setCursor(new Date(year, month + delta, 1));

  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.control, disabled && styles.controlDisabled]}
      >
        <Text style={value ? styles.value : styles.placeholder} numberOfLines={1}>
          {value ? formatDateOnly(value) : placeholder}
        </Text>
        <Ionicons name="calendar-outline" size={18} color={colors.inkSubtle} />
      </Pressable>

      {!!error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{sheetTitle ?? label ?? 'Select a date'}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10}>
              <Ionicons name="close" size={22} color={colors.inkSubtle} />
            </Pressable>
          </View>

          <View style={styles.monthBar}>
            <Pressable onPress={() => step(-1)} hitSlop={10} style={styles.arrow}>
              <Ionicons name="chevron-back" size={20} color={colors.ink} />
            </Pressable>
            <Text style={styles.monthLabel}>
              {MONTH_NAMES[month]} {year}
            </Text>
            <Pressable onPress={() => step(1)} hitSlop={10} style={styles.arrow}>
              <Ionicons name="chevron-forward" size={20} color={colors.ink} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAYS.map((w, i) => (
              <Text key={`${w}-${i}`} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell, i) => {
              if (!cell) return <View key={`blank-${i}`} style={styles.cell} />;
              // ISO date strings sort lexicographically, so a plain string
              // compare is a correct "is this before the minimum?" test.
              const blocked = !!minDate && cell.iso < minDate;
              const selected = cell.iso === value;
              return (
                <Pressable
                  key={cell.iso}
                  disabled={blocked}
                  onPress={() => {
                    onChange(cell.iso);
                    setOpen(false);
                  }}
                  style={[styles.cell, selected && styles.cellSelected]}
                >
                  <Text
                    style={[
                      styles.cellText,
                      cell.iso === today && !selected && styles.cellToday,
                      selected && styles.cellTextSelected,
                      blocked && styles.cellTextBlocked,
                    ]}
                  >
                    {cell.day}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            {clearable && (
              <Pressable
                onPress={() => {
                  onChange(null);
                  setOpen(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.clear}>Clear date</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                if (minDate && today < minDate) return;
                onChange(today);
                setOpen(false);
              }}
              hitSlop={8}
            >
              <Text style={styles.action}>Today</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.inkSubtle, fontWeight: '500' },
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
  },
  controlDisabled: { opacity: 0.5 },
  value: { flex: 1, fontSize: fontSize.sm, color: colors.ink },
  placeholder: { flex: 1, fontSize: fontSize.sm, color: colors.inkSubtle },
  helper: { fontSize: fontSize.xs, color: colors.inkSubtle },
  error: { fontSize: fontSize.xs, color: colors.danger },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: { fontSize: fontSize.lg, fontWeight: '700', color: colors.ink },

  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.surfaceSunken,
  },
  monthLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.ink },

  weekRow: { flexDirection: 'row' },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: colors.inkSubtle,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellSelected: { backgroundColor: colors.ink, borderRadius: 999 },
  cellText: { fontSize: fontSize.sm, color: colors.ink },
  cellToday: { fontWeight: '800', color: colors.info },
  cellTextSelected: { color: colors.surface, fontWeight: '700' },
  cellTextBlocked: { color: colors.line },

  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  clear: { fontSize: fontSize.sm, color: colors.danger, fontWeight: '500' },
  action: { fontSize: fontSize.sm, color: colors.info, fontWeight: '600' },
});

export default DateField;
