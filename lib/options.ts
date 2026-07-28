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

/** Roles a Super Admin may assign when creating a user via the Users screen.
 *  Superset of ASSIGNABLE_ROLES — adds the admin tiers. Mirrors what the
 *  backend `POST /admin/users` now accepts (SUPER_ADMIN|ADMIN|MANAGER|ENGINEER|SALES). */
export const CREATABLE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'ENGINEER', 'SALES'];

/** True for the top-tier role. The legacy 'OWNER' alias is treated identically. */
export function isSuperAdmin(role?: Role | string | null): boolean {
  return role === 'SUPER_ADMIN' || role === 'OWNER';
}

/** True for any admin-tier user (plain ADMIN or SUPER_ADMIN). Use for general
 *  admin gates — a Super Admin keeps everything an Admin can do. */
export function isAdminLevel(role?: Role | string | null): boolean {
  return role === 'ADMIN' || isSuperAdmin(role);
}

/** The common Manager-or-above gate (acknowledge, assign, hold/resume). */
export function isAdminOrManager(role?: Role | string | null): boolean {
  return role === 'MANAGER' || isAdminLevel(role);
}

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

type EngineerLike = {
  open_ticket_count?: number;
  open_service_call_count?: number;
  open_installation_count?: number;
  district?: string | null;
  name: string;
  username?: string;
  role?: string;
};

/** Sample/test accounts are prefixed TEST (name or username) — e.g.
 *  "TEST_Sales Rep" / "test_engg" / "Test Manager". They stay selectable but
 *  belong at the very bottom so a real engineer is never displaced by one,
 *  and they are never suggested as the recommended pick. */
const isTestAccount = (e: EngineerLike) => {
  const test = /^test[\s_\-.]/;
  return test.test((e.name ?? '').trim().toLowerCase())
    || test.test((e.username ?? '').trim().toLowerCase());
};

/** Caption describing an engineer's current workload for the assign picker,
 *  e.g. "13 open jobs (SC-7 / INS-6)" — SC = service calls (tickets),
 *  INS = installations. Only jobs still needing a visit count; see the backend
 *  EngineerOption. The bracket is dropped if the API didn't send the split
 *  (older backend), leaving the plain total.
 *  Managers are assignable but are a fallback (not the default pick), so pass
 *  `recommendable = false` for them to suppress the "recommended" wording. */
export function engineerLoadLabel(e: EngineerLike, recommendable = true): string {
  const n = e.open_ticket_count ?? 0;
  if (n === 0) {
    return recommendable && !isTestAccount(e) ? 'Available — recommended' : 'No open jobs';
  }
  const hasSplit =
    e.open_service_call_count !== undefined || e.open_installation_count !== undefined;
  const split = hasSplit
    ? ` (SC-${e.open_service_call_count ?? 0} / INS-${e.open_installation_count ?? 0})`
    : '';
  return `${n} open job${n === 1 ? '' : 's'}${split}`;
}

/** Managers can be assigned (they sometimes work jobs themselves) but sink
 *  below engineers/sales in the picker so engineers stay the default pick. */
const isManagerRole = (e: EngineerLike) => (e.role ?? '').toUpperCase() === 'MANAGER';

/** Returns a comparator that sorts engineers for the assign picker:
 *  1. test accounts always last, whatever their district or load,
 *  2. engineers whose district matches the job's area first (case-insensitive),
 *  3. non-managers before managers (managers are a fallback assignee),
 *  4. then least-busy (fewest open service calls + installations),
 *  5. then alphabetically.
 *  Pass the job's city (tickets/installations carry no district field). */
export function byEngineerAvailability(targetArea?: string | null) {
  const target = targetArea?.trim().toLowerCase() || null;
  return (a: EngineerLike, b: EngineerLike): number => {
    // Checked before district so a test account can't ride a district match
    // to the top of the list.
    const aTest = isTestAccount(a) ? 1 : 0;
    const bTest = isTestAccount(b) ? 1 : 0;
    if (aTest !== bTest) return aTest - bTest;
    if (target) {
      const aLocal = (a.district ?? '').trim().toLowerCase() === target ? 0 : 1;
      const bLocal = (b.district ?? '').trim().toLowerCase() === target ? 0 : 1;
      if (aLocal !== bLocal) return aLocal - bLocal;
    }
    const aMgr = isManagerRole(a) ? 1 : 0;
    const bMgr = isManagerRole(b) ? 1 : 0;
    if (aMgr !== bMgr) return aMgr - bMgr;
    return (
      (a.open_ticket_count ?? 0) - (b.open_ticket_count ?? 0) || a.name.localeCompare(b.name)
    );
  };
}

/** Human-readable label for a role. MANAGER is shown as "Admin" (matches web). */
export function roleLabel(role: Role): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super Admin';
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
 *
 * `onHold` is passed separately because hold is an overlay: a parked ticket
 * keeps its ACCEPTED/RESOLVING status but the backend 409s every action on it.
 */
export function ticketIsOperable(status: TicketStatus, onHold?: boolean): boolean {
  if (onHold) return false;
  return status === 'ACCEPTED' || status === 'RESOLVING' || status === 'RESOLVED';
}

/** Short explanation of why a ticket's operations are locked. */
export function ticketLockReason(status: TicketStatus, onHold?: boolean): string {
  if (onHold) return 'This ticket is on hold — a Manager or Admin must resume it.';
  if (status === 'CLOSED') return 'This ticket is closed — no further changes.';
  return 'Available once the assigned engineer accepts the ticket.';
}

/**
 * Whether a job may be parked, and by whom. Manager/Admin/Owner only, and only
 * while field work is still outstanding — RESOLVED/COMPLETED are done bar the
 * signature, and already don't count toward anyone's open jobs.
 */
export function canHoldTicket(role: string, status: TicketStatus, onHold?: boolean): boolean {
  if (onHold || !isAdminOrManager(role)) return false;
  return ['OPEN', 'ACKNOWLEDGED', 'ASSIGNED', 'ACCEPTED', 'RESOLVING'].includes(status);
}

export function canHoldInstallation(
  role: string,
  status: InstallationStatus,
  onHold?: boolean
): boolean {
  if (onHold || !isAdminOrManager(role)) return false;
  return status === 'NEW' || status === 'ASSIGNED';
}

/** Resuming is the same audience as holding, whatever the stage. */
export function canResumeJob(role: string, onHold?: boolean): boolean {
  return !!onHold && isAdminOrManager(role);
}
