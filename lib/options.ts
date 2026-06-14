/** Dropdown option lists — mirror the web app's lib/options.ts. */

import type {
  InstallationStatus,
  Role,
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

export const WARRANTY_STATUSES: WarrantyStatus[] = [
  'UNKNOWN',
  'UNDER_WARRANTY',
  'OUT_OF_WARRANTY',
];

export const ASSIGNABLE_ROLES: Role[] = ['MANAGER', 'ENGINEER'];

export const BUSINESS_TYPES = [
  'Restaurant',
  'Hotel',
  'Retail Store',
  'Cafe',
  'Cloud Kitchen',
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

/** Human-readable label for a role. MANAGER is shown as "Admin" (matches web). */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'ADMIN':
      return 'Admin';
    case 'MANAGER':
      return 'Manager';
    case 'ENGINEER':
      return 'Engineer';
    default:
      return role;
  }
}

/** Title-case an enum value, e.g. UNDER_WARRANTY -> "Under Warranty". */
export function prettyEnum(value: string): string {
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
