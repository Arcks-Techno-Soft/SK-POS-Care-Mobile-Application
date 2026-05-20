import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Brand } from '@/components/Brand';
import { colors, spacing } from '@/lib/theme';

/** Startup splash — the root navigator redirects away once auth status resolves. */
export default function Index() {
  return (
    <View style={styles.root}>
      <Brand size="lg" tagline="Internal field operations" />
      <ActivityIndicator color={colors.inkFaint} style={{ marginTop: spacing.xxl }} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
