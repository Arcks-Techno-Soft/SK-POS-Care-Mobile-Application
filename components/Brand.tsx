/** SK-POS Support wordmark. */

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '@/lib/theme';

const mark = require('@/assets/images/icon.png');

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
      <Image
        source={mark}
        style={[styles.mark, { width: box, height: box }]}
        contentFit="cover"
      />
      <View>
        <Text style={[styles.word, { fontSize: large ? 22 : 16 }]}>SK-POS Support</Text>
        {tagline && <Text style={styles.tagline}>{tagline}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { borderRadius: radius.md },
  word: { color: colors.ink, fontWeight: '700', letterSpacing: -0.4 },
  tagline: { color: colors.inkSubtle, fontSize: 12, marginTop: 1 },
});
