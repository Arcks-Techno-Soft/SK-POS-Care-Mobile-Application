/**
 * API data shapes — mirrors the SK-POS Support FastAPI backend (app/schemas).
 * Field names match the JSON the backend returns exactly.
 */

export type Role = 'ADMIN' | 'MANAGER' | 'ENGINEER';

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

export type ServiceType = 'SITE_VISIT' | 'REMOTE_SUPPORT';

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
  preferred_contact_time?: string | null;
  raised_by: User | null;
  acknowledged_by: User | null;
  acknowledged_at: string | null;
  assigned_by: User | null;
  assigned_engineer: User | null;
  assigned_at: string | null;
  accepted_at: string | null;
  resolving_started_at: string | null;
  resolved_at: string | null;
  resolution_summary: string | null;
  resolution: ResolutionDoc | null;
  sub_engineers: SubEngineer[];
  created_at: string;
  attachments: Attachment[];
}

/** Row in GET /admin/tickets list. */
export interface TicketListItem {
  id: number;
  reference: string;
  business_name: string;
  city: string;
  state: string;
  product_category: string;
  serial_number: string;
  issue_category: string;
  severity: Severity;
  status: TicketStatus;
  warranty_status: WarrantyStatus;
  service_type: ServiceType;
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
  engineer_signed_at: string | null;
  pdf_generated_at: string | null;
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
  status: InstallationStatus;
  created_by: User | null;
  assigned_by: User | null;
  assigned_engineer: User | null;
  assigned_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string;
  resolution: InstallationResolutionDoc | null;
}

export interface InstallationListItem {
  id: number;
  reference: string;
  business_name: string;
  business_category: string;
  contact_name: string;
  phone: string;
  invoice_number: string;
  status: InstallationStatus;
  created_by: User | null;
  assigned_engineer: User | null;
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

export interface DuplicateInfo {
  duplicate: true;
  existing_reference: string;
  existing_status: string;
  created_at: string;
  hours_until_new_allowed: number;
  message: string;
}
