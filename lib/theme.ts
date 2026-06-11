/**
 * SK-POS Support design tokens — mirrors the web app's premium light palette.
 * The app is light-mode only (locked via app.json userInterfaceStyle).
 */

export const colors = {
  // Ink (text)
  ink: '#0A0A0A',
  inkSoft: '#1A1A1A',
  inkMuted: '#525252',
  inkSubtle: '#737373',
  inkFaint: '#A3A3A3',

  // Surfaces
  surface: '#FFFFFF',
  surfaceRaised: '#FAFAFA',
  surfaceSunken: '#F5F5F5',

  // Lines
  line: '#E5E5E5',
  lineStrong: '#D4D4D4',

  // Semantic
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warn: '#CA8A04',
  warnSoft: '#FEF9C3',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
  info: '#2563EB',
  infoSoft: '#DBEAFE',

  // Inverse
  onInk: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 11,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 26,
  xxxl: 32,
} as const;

export const shadow = {
  soft: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  lift: {
    shadowColor: '#0A0A0A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 6,
  },
} as const;

/** Tone for a coloured pill/badge. */
export type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

export const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSunken, fg: colors.inkMuted },
  info: { bg: colors.infoSoft, fg: colors.info },
  success: { bg: colors.successSoft, fg: colors.success },
  warn: { bg: colors.warnSoft, fg: colors.warn },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
};

/** Ticket / installation status → badge tone. */
export function statusTone(status: string): Tone {
  switch (status) {
    case 'OPEN':
    case 'NEW':
      return 'warn';
    case 'ACKNOWLEDGED':
    case 'ASSIGNED':
    case 'ACCEPTED':
      return 'info';
    case 'RESOLVING':
      return 'info';
    case 'RESOLVED':
    case 'COMPLETED':
      return 'success';
    case 'CLOSED':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Severity → badge tone. */
export function severityTone(severity: string): Tone {
  switch (severity) {
    case 'LOW':
      return 'neutral';
    case 'MEDIUM':
      return 'info';
    case 'HIGH':
      return 'warn';
    case 'CRITICAL':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** Warranty → badge tone. */
export function warrantyTone(warranty: string): Tone {
  switch (warranty) {
    case 'UNDER_WARRANTY':
      return 'success';
    case 'OUT_OF_WARRANTY':
      return 'danger';
    default:
      return 'neutral';
  }
}
