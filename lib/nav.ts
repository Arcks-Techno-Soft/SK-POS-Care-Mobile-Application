/** Shared navigation options for the per-tab stacks. */

import { colors, fontSize } from './theme';

export const stackScreenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: false,
  headerTintColor: colors.ink,
  headerTitleStyle: { fontWeight: '700' as const, fontSize: fontSize.lg },
  contentStyle: { backgroundColor: colors.surfaceRaised },
} as const;
