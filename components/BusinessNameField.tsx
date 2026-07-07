/**
 * Business-name input with server-backed suggestions.
 *
 * Debounced (300ms, min 2 chars) lookup of distinct business names from past
 * tickets + installations, so staff reuse one spelling per customer instead
 * of creating near-duplicates. Free typing is always allowed — suggestions
 * are a convenience, never a constraint, and a failed lookup is ignored.
 */

import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Field } from '@/components/ui/kit';
import { useApi } from '@/lib/auth';
import { colors, fontSize, radius, spacing } from '@/lib/theme';

type Props = {
  value: string;
  onChangeText: (v: string) => void;
  label?: string;
  required?: boolean;
  placeholder?: string;
  error?: string;
};

export function BusinessNameField({
  value,
  onChangeText,
  label = 'Business Name',
  required,
  placeholder,
  error,
}: Props) {
  const api = useApi();
  const [suggestions, setSuggestions] = useState<string[]>([]);
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
        .then((names) => {
          // Dropping exact matches is also what closes the list after a pick.
          if (!stale) setSuggestions(names.filter((n) => n.toLowerCase() !== q.toLowerCase()));
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
          {suggestions.map((name) => (
            <Pressable
              key={name}
              onPress={() => {
                onChangeText(name);
                setSuggestions([]);
              }}
              style={({ pressed }) => [
                styles.item,
                pressed && { backgroundColor: colors.surfaceSunken },
              ]}
            >
              <Text style={styles.itemText} numberOfLines={1}>
                {name}
              </Text>
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  itemText: { fontSize: fontSize.md, color: colors.ink },
});
