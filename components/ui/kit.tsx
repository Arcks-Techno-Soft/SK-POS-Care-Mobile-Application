/** Core UI primitives — buttons, badges, cards, fields. */

import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { colors, fontSize, radius, spacing, toneStyles, type Tone } from '@/lib/theme';

/* ---------------- Button ---------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.ink, fg: colors.onInk, border: colors.ink },
    secondary: { bg: colors.surface, fg: colors.ink, border: colors.lineStrong },
    ghost: { bg: 'transparent', fg: colors.inkMuted, border: 'transparent' },
    danger: { bg: colors.danger, fg: colors.onInk, border: colors.danger },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.btn,
        size === 'sm' && styles.btnSm,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: isDisabled ? 0.45 : pressed ? 0.82 : 1,
          width: fullWidth ? '100%' : undefined,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 15 : 17} color={palette.fg} />}
          <Text
            style={[
              styles.btnText,
              size === 'sm' && styles.btnTextSm,
              { color: palette.fg },
            ]}
          >
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- Badge ---------------- */

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ---------------- Chip (selectable filter) ---------------- */

export function Chip({
  label,
  selected,
  onPress,
  count,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? colors.ink : colors.surface,
          borderColor: selected ? colors.ink : colors.line,
        },
      ]}
    >
      <Text
        style={[styles.chipText, { color: selected ? colors.onInk : colors.inkMuted }]}
      >
        {label}
      </Text>
      {count != null && (
        <View
          style={[
            styles.chipCount,
            { backgroundColor: selected ? 'rgba(255,255,255,0.22)' : colors.surfaceSunken },
          ]}
        >
          <Text
            style={[
              styles.chipCountText,
              { color: selected ? colors.onInk : colors.inkSubtle },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/* ---------------- Card ---------------- */

export function Card({
  children,
  style,
  onPress,
  padded = true,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
}) {
  const content = (
    <View style={[styles.card, padded && styles.cardPadded, style]}>{children}</View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {content}
    </Pressable>
  );
}

/* ---------------- Divider ---------------- */

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

/* ---------------- SectionTitle ---------------- */

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

/* ---------------- KeyValue row ---------------- */

export function KeyValue({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={[styles.kvValue, mono && styles.mono]}>{value}</Text>
      ) : (
        <View style={styles.kvValueWrap}>{value}</View>
      )}
    </View>
  );
}

/* ---------------- Avatar ---------------- */

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const parts = (name || '?').trim().split(/\s+/);
  const text =
    parts.length === 1
      ? parts[0].slice(0, 2).toUpperCase()
      : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.36 }]}>{text}</Text>
    </View>
  );
}

/* ---------------- Field (labeled text input) ---------------- */

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

export function Field({ label, hint, error, required, style, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      {label && (
        <Text style={styles.fieldLabel}>
          {label}
          {required && <Text style={{ color: colors.danger }}> *</Text>}
        </Text>
      )}
      <TextInput
        placeholderTextColor={colors.inkFaint}
        style={[
          styles.input,
          inputProps.multiline && styles.inputMultiline,
          !!error && { borderColor: colors.danger },
          style,
        ]}
        {...inputProps}
      />
      {!!error && <Text style={styles.fieldError}>{error}</Text>}
      {!error && !!hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

/* ---------------- Banner (inline feedback) ---------------- */

export function Banner({ message, tone = 'danger' }: { message: string; tone?: Tone }) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.banner, { backgroundColor: t.bg }]}>
      <Text style={[styles.bannerText, { color: t.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnSm: { minHeight: 38, borderRadius: radius.sm, paddingHorizontal: spacing.md },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  btnText: { fontSize: fontSize.md, fontWeight: '600' },
  btnTextSm: { fontSize: fontSize.sm },

  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: fontSize.xs, fontWeight: '700', letterSpacing: 0.3 },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: fontSize.sm, fontWeight: '600' },
  chipCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  chipCountText: { fontSize: fontSize.xs, fontWeight: '700' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardPadded: { padding: spacing.lg },

  divider: { height: 1, backgroundColor: colors.line },

  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.inkSubtle,
    textTransform: 'uppercase',
  },

  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.lg, paddingVertical: 6 },
  kvLabel: { fontSize: fontSize.sm, color: colors.inkSubtle, flexShrink: 0 },
  kvValue: {
    fontSize: fontSize.sm,
    color: colors.inkSoft,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  kvValueWrap: { flex: 1, alignItems: 'flex-end' },
  mono: { fontFamily: 'monospace' },

  avatar: {
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.onInk, fontWeight: '700' },

  field: { gap: 6 },
  fieldLabel: { fontSize: fontSize.sm, fontWeight: '600', color: colors.inkSoft },
  input: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: fontSize.md,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top', paddingTop: 12 },
  fieldError: { fontSize: fontSize.xs, color: colors.danger },
  fieldHint: { fontSize: fontSize.xs, color: colors.inkSubtle },

  banner: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  bannerText: { fontSize: fontSize.sm, fontWeight: '500' },
});
