/** SK-POS Care wordmark. */

import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/lib/theme';

export function Brand({
  size = 'lg',
  tagline,
}: {
  size?: 'sm' | 'lg';
  tagline?: string;
}) {
  const large = size === 'lg';
  const box = large ? 44 : 30;
  return (
    <View style={styles.row}>
      <View style={[styles.mark, { width: box, height: box }]}>
        <Text style={[styles.markText, { fontSize: large ? 17 : 12 }]}>SK</Text>
      </View>
      <View>
        <Text style={[styles.word, { fontSize: large ? 22 : 16 }]}>SK-POS Care</Text>
        {tagline && <Text style={styles.tagline}>{tagline}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: {
    backgroundColor: colors.ink,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: colors.onInk, fontWeight: '800', letterSpacing: 0.5 },
  word: { color: colors.ink, fontWeight: '700', letterSpacing: -0.4 },
  tagline: { color: colors.inkSubtle, fontSize: 12, marginTop: 1 },
});
