/**
 * API data shapes — mirrors the SK-POS Support FastAPI backend (app/schemas).
 * Field names match the JSON the backend returns exactly.
 */

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'ENGINEER' | 'SALES';

export type TicketStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'RESOLVING'
  | 'RESOLVED'
  | 'CLOSED';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type WarrantyStatus = 'UNKNOWN' | 'UNDER_WARRANTY' | 'OUT_OF_WARRANTY' | 'AMC';

export type ServiceType = 'SITE_VISIT' | 'REMOTE_SUPPORT' | 'THIRD_PARTY_SUPPORT';

export type InstallationStatus = 'NEW' | 'ASSIGNED' | 'COMPLETED' | 'CLOSED';

export interface User {
  id: number;
  username: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: Role;
  active: boolean;
  email: string | null;
  district: string | null;
  /** When true, this user can be credited as a sales rep on installations,
   * regardless of role. SALES-role users are eligible without this flag. */
  is_sales_rep?: boolean;
  /** Open workload total (service calls + installations) — set on the
   * /engineers picker list so the UI can recommend the least-busy engineers.
   * Counts only jobs still needing a visit; work awaiting sign-off is done. */
  open_ticket_count?: number;
  /** Service calls (tickets) inside that total — as primary or co-engineer. */
  open_service_call_count?: number;
  /** Installations inside that total. */
  open_installation_count?: number;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: User;
}

export interface Attachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_url: string;
}

export interface ResolutionDoc {
  customer_signer_name: string | null;
  customer_signed_at: string | null;
  customer_photo_captured_at: string | null;
  customer_photo_url: string | null;
  engineer_signed_at: string | null;
  engineer_signer_name: string | null;
  field_sign_link_generated_at: string | null;
  pdf_generated_at: string | null;
}

export interface SubEngineer {
  id: number;
  name: string;
  phone: string;
  location: string;
  fee_inr: number | null;
  created_at: string;
  created_by: User | null;
}

/** A co-assigned app user attending the same visit (view + notified only). */
export interface AdditionalEngineer {
  id: number;
  engineer: User;
  added_by: User | null;
  added_at: string;
}

/** Summary + pending checklist for the force-close confirmation. */
export interface ClosePreview {
  reference: string;
  business_name: string;
  status: TicketStatus;
  warranty_status: WarrantyStatus;
  service_type: ServiceType;
  assigned_engineer: User | null;
  additional_engineers: AdditionalEngineer[];
  acknowledged_at: string | null;
  assigned_at: string | null;
  accepted_at: string | null;
  resolving_started_at: string | null;
  resolved_at: string | null;
  pending: string[];
}

export interface RosterContact {
  id: number;
  name: string;
  phone: string;
  district: string;
  active: boolean;
  created_at: string;
  created_by: User | null;
}

/** Full ticket — POST /tickets and GET /admin/tickets/{ref}. */
export interface TicketDetail {
  id: number;
  reference: string;
  business_name: string;
  contact_name: string;
  contact_person_profile?: string | null;
  email: string | null;
  phone: string;
  business_type?: string;
  address_line1: string;
  address_line2: string | null;
  address_line3: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  product_category: string;
  serial_number: string;
  issue_category: string;
  severity: Severity;
  description?: string;
  status: TicketStatus;
  warranty_status: WarrantyStatus;
  service_type: ServiceType;
  // On hold — an overlay on `status`, so `status` still reads ASSIGNED /
  // RESOLVING etc. while parked. Gates every workflow action.
  on_hold?: boolean;
  held_at?: string | null;
  held_by?: User | null;
  hold_reason?: string | null;
  // Third-party support details (only for THIRD_PARTY_SUPPORT tickets).
  third_party_device_name?: string | null;
  third_party_issue_info?: string | null;
  third_party_ticket_ref?: string | null;
  // Payment tracking. payment_status null = legacy ticket (never gated).
  // payment_required is the backend-computed gate (OOW, or covered + charges).
  // COLLECTED only appears on historical rows; new tickets go
  // PENDING → AWAITING_VERIFICATION → VERIFIED.
  payment_status?: 'PENDING' | 'COLLECTED' | 'AWAITING_VERIFICATION' | 'VERIFIED' | null;
  payment_required?: boolean;
  payment_amount_inr?: number | null;
  payment_collected_at?: string | null;
  payment_collected_by?: User | null;
  // Admin verification of the collected money. A ticket that owed anything can't
  // close until payment_verified is true.
  payment_verified?: boolean;
  payment_awaiting_verification?: boolean;
  payment_verified_at?: string | null;
  payment_verified_by?: User | null;
  // Partial-payment money breakdown. Ticket closes only when pending hits ₹0.
  amount_due_inr?: number;
  amount_collected_inr?: number;
  amount_pending_inr?: number;
  preferred_contact_time?: string | null;
  raised_by: User | null;
  acknowledged_by: User | null;
  acknowledged_at: string | null;
  assigned_by: User | null;
  assigned_engineer: User | null;
  assigned_at: string | null;
  // Sales rep credited with this service call (view-only for the rep). Optional.
  sales_rep: User | null;
  accepted_at: string | null;
  resolving_started_at: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  resolution: ResolutionDoc | null;
  sub_engineers: SubEngineer[];
  additional_engineers: AdditionalEngineer[];
  attempts: TicketAttempt[];
  created_at: string;
  attachments: Attachment[];
}

/** One work attempt (visit) with its notes + photos. */
export interface TicketAttempt {
  id: number;
  attempt_number: number;
  started_at: string;
  ended_at: string | null;
  started_by: User | null;
  notes: WorkNote[];
}

/** Row in GET /admin/tickets list. */
export interface TicketListItem {
  id: number;
  reference: string;
  business_name: string;
  // Customer contact + their role — used to tag customer-raised tickets
  // ("Raised by customer — <name> — <profile>").
  contact_name: string;
  contact_person_profile?: string | null;
  city: string;
  state: string;
  product_category: string;
  serial_number: string;
  issue_category: string;
  severity: Severity;
  status: TicketStatus;
  warranty_status: WarrantyStatus;
  service_type: ServiceType;
  // On-hold overlay — the list badges these rather than hiding them.
  on_hold?: boolean;
  hold_reason?: string | null;
  raised_by: User | null;
  assigned_engineer: User | null;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface NoteAttachment {
  id: number;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_url: string;
}

export interface WorkNote {
  id: number;
  body: string;
  created_at: string;
  author: User;
  attachments: NoteAttachment[];
}

export interface TicketEvent {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor: User | null;
}

export interface ChargeLineItem {
  id: number;
  catalog_id: number | null;
  name: string;
  unit_price_inr: number;
  quantity: number;
  line_total_inr: number;
  billable: boolean;
}

export interface ChargesSummary {
  warranty_status: WarrantyStatus;
  is_warranty: boolean;
  service_fee_inr: number;
  service_fee_billable_inr: number;
  // Minimum service fee for this ticket (0 = no floor). Non-Admins can't set
  // below this; an Admin can.
  service_fee_min_inr: number;
  spares_list_price_total_inr: number;
  spares_billable_total_inr: number;
  grand_total_inr: number;
  items: ChargeLineItem[];
}

export interface SpareCatalogItem {
  id: number;
  product_category: string;
  name: string;
  default_price_inr: number;
}

export interface ShipmentItem {
  id: number;
  catalog_id: number | null;
  name: string;
  quantity: number;
}

export interface Shipment {
  id: number;
  courier_name: string;
  tracking_id: string | null;
  departed_at: string;
  delivered_at: string | null;
  created_at: string;
  created_by: User | null;
  items: ShipmentItem[];
}

export interface FieldSignLink {
  url: string;
  token: string;
  generated_at: string;
}

export interface PdfLink {
  url: string;
  filename: string;
  generated_at: string;
}

/* ----- Installations ----- */

export interface InstallationResolutionDoc {
  customer_signer_name: string | null;
  customer_signed_at: string | null;
  customer_photo_captured_at: string | null;
  customer_photo_url: string | null;
  engineer_signed_at: string | null;
  pdf_generated_at: string | null;
  /** Set once the off-field signing link is generated — on-site signing then
   *  pauses and the sub-engineer captures both signatures via the link. */
  field_sign_link_generated_at?: string | null;
}

export interface InstallationDetail {
  id: number;
  reference: string;
  business_name: string;
  business_category: string;
  contact_name: string;
  phone: string;
  email: string | null;
  invoice_number: string;
  products_for_installation: string | null;
  /** Planned on-site date, "yyyy-mm-dd". Drives the upcoming-installation
   *  WhatsApp reminder to Super Admin / Admin / Managers. Null until set. */
  expected_installation_date?: string | null;
  /** Every attached invoice document. `invoice_document` is the most recent
   *  one, kept by the API for older clients — prefer this list. */
  invoice_documents?: InvoiceDocument[];
  invoice_document: InvoiceDocument | null;
  status: InstallationStatus;
  // On hold — an overlay on `status`, so `status` still reads NEW /
  // ASSIGNED while parked. Gates every workflow action.
  on_hold?: boolean;
  held_at?: string | null;
  held_by?: User | null;
  hold_reason?: string | null;
  address_line1: string | null;
  address_line2: string | null;
  address_line3: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  created_by: User | null;
  assigned_by: User | null;
  assigned_engineer: User | null;
  sales_rep: User | null;
  assigned_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string;
  resolution: InstallationResolutionDoc | null;
  attempts: InstallationAttempt[];
  /** Off-field contractors attending this installation. */
  sub_engineers?: SubEngineer[];
}

/** One installation work attempt (visit) with its notes + photos. */
export interface InstallationAttempt {
  id: number;
  attempt_number: number;
  started_at: string;
  ended_at: string | null;
  started_by: User | null;
  notes: InstallationNote[];
}

/** Result of POST /tickets/{ref}/check-warranty.
 *
 *  `found: false` means the serial isn't in the registry at all.
 *  `requires_confirmation` means the verdict was NOT applied — it would
 *  overturn an existing status (or an AMC), which changes what is billed. */
export interface WarrantyCheckResult {
  found: boolean;
  serial_number: string;
  verdict?: string | null;
  current_status?: string | null;
  applied: boolean;
  requires_confirmation: boolean;
  conflict_reason?: 'AMC' | 'DIFFERS' | null;
  warranty?: {
    product_name: string;
    serial_number: string;
    invoice_number?: string | null;
    customer_name?: string | null;
    sale_date?: string | null;
    warranty_months?: number | null;
    expiry_date?: string | null;
  } | null;
  message: string;
}

/** One uploaded invoice document (PDF or image). Several may be attached. */
export interface InvoiceDocument {
  /** null only on a legacy row the backend hasn't backfilled — such a row can't
   *  be deleted individually, so the UI falls back to "remove all". */
  id?: number | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  storage_url: string;
  uploaded_at: string | null;
}

export interface InstallationListItem {
  id: number;
  reference: string;
  business_name: string;
  business_category: string;
  contact_name: string;
  phone: string;
  invoice_number: string;
  /** Planned on-site date, "yyyy-mm-dd", or null if none is set yet. */
  expected_installation_date?: string | null;
  status: InstallationStatus;
  // On-hold overlay — the list badges these rather than hiding them.
  on_hold?: boolean;
  hold_reason?: string | null;
  created_by: User | null;
  assigned_engineer: User | null;
  sales_rep: User | null;
  created_at: string;
}

export interface InstallationNote {
  id: number;
  body: string;
  created_at: string;
  author: User;
  attachments: NoteAttachment[];
}

export interface InstallationEvent {
  id: number;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  payload: Record<string, unknown> | null;
  note: string | null;
  created_at: string;
  actor: User | null;
}

/* ----- Analytics ----- */

/** One engineer's perf row returned by the backend. */
export interface EngineerPerf {
  engineer_id: number;
  name: string;
  assigned: number;
  resolved: number;
  /** 0.0 (not null) when no resolved tickets. */
  avg_hours: number;
  completion_rate: number;
}

/** Per-issue-category row (issue_breakdown). */
export interface IssueBreakdownRow {
  issue_category: string;
  avg_hours: number;
  resolved_count: number;
}

/** Per-product-category row (product_breakdown). */
export interface ProductBreakdownRow {
  product_category: string;
  total: number;
  resolved: number;
  avg_hours: number;
}

/** One point in the tickets_per_day series. */
export interface DayPoint {
  date: string; // ISO date "YYYY-MM-DD"
  created: number;
  resolved: number;
}

/** One point in the resolution_trend series. */
export interface ResolutionTrendPoint {
  date: string;
  avg_hours: number | null;
  count: number;
}

/** KPI sub-object inside the analytics response. */
export interface AnalyticsKpis {
  total_tickets: number;
  open_tickets: number;
  /** Held jobs are excluded from open_tickets and counted here instead. */
  on_hold_tickets?: number;
  resolved_tickets: number;
  closed_tickets: number;
  /** Tickets created inside the window. */
  window_tickets: number;
  /** Tickets resolved inside the window. */
  window_resolved: number;
  /** Avg resolution hours (0.0 when none). */
  avg_resolution_hours: number;
}

/** Full response from GET /api/v1/admin/analytics?days=N */
export interface Analytics {
  window_days: number;
  kpis: AnalyticsKpis;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
  tickets_per_day: DayPoint[];
  resolution_trend: ResolutionTrendPoint[];
  issue_breakdown: IssueBreakdownRow[];
  product_breakdown: ProductBreakdownRow[];
  engineer_performance: EngineerPerf[];
}

/** @deprecated Use IssueBreakdownRow or ProductBreakdownRow. Kept for backwards compat. */
export interface BreakdownRow {
  key: string;
  total: number;
  resolved?: number;
  avg_resolution_hours?: number | null;
}

/* ----- Local app types ----- */

/** A photo picked from camera/library, ready for multipart upload. */
export interface PickedImage {
  uri: string;
  name: string;
  type: string;
}

/** A document (PDF/image) picked via the document picker, ready for upload. */
export interface PickedDocument {
  uri: string;
  name: string;
  type: string;
}

export interface DuplicateInfo {
  duplicate: true;
  existing_reference: string;
  existing_status: string;
  created_at: string;
  hours_until_new_allowed: number;
  message: string;
}

/** A business-name autocomplete hit: the name plus the category last recorded
 *  for it (may be an empty string if none was ever stored). */
export interface BusinessSuggestion {
  business_name: string;
  business_type: string;
}
