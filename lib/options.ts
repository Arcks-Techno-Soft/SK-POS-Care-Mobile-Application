/** Dropdown option lists — mirror the web app's lib/options.ts. */

import type {
  InstallationStatus,
  Role,
  ServiceType,
  Severity,
  TicketStatus,
  WarrantyStatus,
} from './types';

export const TICKET_STATUSES: TicketStatus[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'ACCEPTED',
  'RESOLVING',
  'RESOLVED',
  'CLOSED',
];

export const INSTALLATION_STATUSES: InstallationStatus[] = [
  'NEW',
  'ASSIGNED',
  'COMPLETED',
  'CLOSED',
];

export const SEVERITIES: Severity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Selectable warranty statuses. UNKNOWN is intentionally excluded — it is only
// the initial (unset) state of a freshly raised ticket; the user must pick one
// of these three before the ticket can be assigned.
export const WARRANTY_STATUSES: WarrantyStatus[] = [
  'UNDER_WARRANTY',
  'OUT_OF_WARRANTY',
  'AMC',
];

// How the ticket is serviced. SITE_VISIT is the default; REMOTE_SUPPORT skips
// signatures, PDF and spare parts and closes in one Resolve & Close step;
// THIRD_PARTY_SUPPORT closes on the engineer signature alone (no customer
// signature) and captures the third-party device details.
export const SERVICE_TYPES: ServiceType[] = ['SITE_VISIT', 'REMOTE_SUPPORT', 'THIRD_PARTY_SUPPORT'];

export const ASSIGNABLE_ROLES: Role[] = ['MANAGER', 'ENGINEER', 'SALES'];

export const BUSINESS_TYPES = [
  'Restaurant',
  'Hotel',
  'Retail Store',
  'Cafe',
  'Cloud Kitchen',
  'Food Court',
  'Ice Cream Parlour',
  'Partner',
  'Other',
];

export const PRODUCT_CATEGORIES = [
  'POS Machine',
  'Printer',
  'Kitchen Display Screen',
  'UPS',
  'Kiosk',
  'Tablet',
  'Monitor',
  'CCTV',
  'Other',
];

export const ISSUE_CATEGORIES = [
  'Not Powering On',
  'Display Issue',
  'Printing Issue',
  'Connectivity',
  'Software Crash',
  'Physical Damage',
  'Other',
];

export const PREFERRED_CONTACT_TIMES = [
  'Morning (9 AM - 12 PM)',
  'Afternoon (12 PM - 4 PM)',
  'Evening (4 PM - 8 PM)',
  'Anytime',
];

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Delhi',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
];

/** Caption describing an engineer's current workload for the assign picker.
 *  Workload = open tickets + pending installations (see backend EngineerOption). */
export function engineerLoadLabel(count?: number | null): string {
  const n = count ?? 0;
  return n === 0
    ? 'Available — recommended'
    : `${n} open job${n === 1 ? '' : 's'}`;
}

type EngineerLike = { open_ticket_count?: number; district?: string | null; name: string };

/** Returns a comparator that sorts engineers for the assign picker:
 *  1. engineers whose district matches the job's area first (case-insensitive),
 *  2. then least-busy (fewest open tickets + installations),
 *  3. then alphabetically.
 *  Pass the job's city (tickets/installations carry no district field). */
export function byEngineerAvailability(targetArea?: string | null) {
  const target = targetArea?.trim().toLowerCase() || null;
  return (a: EngineerLike, b: EngineerLike): number => {
    if (target) {
      const aLocal = (a.district ?? '').trim().toLowerCase() === target ? 0 : 1;
      const bLocal = (b.district ?? '').trim().toLowerCase() === target ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
    }
    return (
      (a.open_ticket_count ?? 0) - (b.open_ticket_count ?? 0) || a.name.localeCompare(b.name)
    );
  };
}

/** Human-readable label for a role. MANAGER is shown as "Admin" (matches web). */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'MANAGER':
      return 'Manager';
    case 'ENGINEER':
      return 'Engineer';
    case 'SALES':
      return 'Sales';
    default:
      return role;
  }
}

/** Enum values that should keep their literal casing (acronyms). */
const ENUM_ACRONYMS = new Set(['AMC']);

/** Title-case an enum value, e.g. UNDER_WARRANTY -> "Under Warranty". */
export function prettyEnum(value: string): string {
  if (ENUM_ACRONYMS.has(value)) return value;
  return value
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Whether work operations (notes, sub-engineers, spares, shipments) may be
 * performed on a ticket. Allowed only between the engineer accepting the
 * ticket and the ticket being closed — i.e. ACCEPTED, RESOLVING, RESOLVED.
 */
export function ticketIsOperable(status: TicketStatus): boolean {
  return status === 'ACCEPTED' || status === 'RESOLVING' || status === 'RESOLVED';
}

/** Short explanation of why a ticket's operations are locked. */
export function ticketLockReason(status: TicketStatus): string {
  if (status === 'CLOSED') return 'This ticket is closed — no further changes.';
  return 'Available once the assigned engineer accepts the ticket.';
}
