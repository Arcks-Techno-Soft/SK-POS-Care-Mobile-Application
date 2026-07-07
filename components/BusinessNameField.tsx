/**
 * Business-name input with server-backed suggestions.
 *
 * Debounced (300ms, min 2 chars) lookup of distinct business names from past
 * tickets + installations, so staff reuse one spelling per customer instead
 * of creating near-duplicates. Each suggestion carries its category, so
 * picking one can also pre-fill the business type via `onSelectSuggestion`.
 * Free typing is always allowed — suggestions are a convenience, never a
 * constraint, and a failed lookup is ignored.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/ui/kit';
import { useApi } from '@/lib/auth';
import { colors, fontSize, radius, spacing } from '@/lib/theme';
import type { BusinessSuggestion } from '@/lib/types';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  /** Called when a suggestion is tapped, so the screen can pre-fill the category. */
  onSelectSuggestion?: (s: BusinessSuggestion) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
};

export function BusinessNameField({
  value,
  onChangeText,
  onSelectSuggestion,
  label = 'Business Name',
  required,
  placeholder,
  error,
}: Props) {
  const api = useApi();
  const [suggestions, setSuggestions] = useState<BusinessSuggestion[]>([]);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(() => {
      api
        .suggestBusinessNames(q)
        .then((hits) => {
          // Dropping exact matches is also what closes the list after a pick.
          if (!stale)
            setSuggestions(
              hits.filter((h) => h.business_name.toLowerCase() !== q.toLowerCase()),
            );
        })
        .catch(() => {
          if (!stale) setSuggestions([]);
        });
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value, api]);

  return (
    <View>
      <Field
        label={label}
        required={required}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        error={error}
        autoCapitalize="words"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {focused && suggestions.length > 0 && (
        <View style={styles.list}>
          {suggestions.map((s) => (
            <Pressable
              key={s.business_name}
              onPress={() => {
                onChangeText(s.business_name);
                onSelectSuggestion?.(s);
                setSuggestions([]);
              }}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text style={styles.itemText} numberOfLines={1}>
                {s.business_name}
              </Text>
              {!!s.business_type && (
                <Text style={styles.itemMeta} numberOfLines={1}>
                  {s.business_type}
                </Text>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  itemText: { flexShrink: 1, fontSize: fontSize.md, color: colors.ink },
  itemMeta: { flexShrink: 0, fontSize: fontSize.xs, color: colors.inkSubtle },
});
