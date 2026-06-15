/**
 * SK-POS Support API client.
 *
 * One `Api` instance is created by the auth provider. It reads the current
 * server URL and JWT lazily through getters so it never goes stale, and calls
 * `onUnauthorized` when the backend rejects the token (401).
 */

import type {
  Analytics,
  ChargesSummary,
  FieldSignLink,
  InstallationDetail,
  InstallationEvent,
  InstallationListItem,
  InstallationNote,
  Page,
  PdfLink,
  PickedDocument,
  PickedImage,
  RosterContact,
  Shipment,
  SpareCatalogItem,
  SubEngineer,
  TicketDetail,
  TicketEvent,
  TicketListItem,
  TokenResponse,
  User,
  WorkNote,
} from './types';

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

function extractMessage(data: unknown, status: number): string {
  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data === 'object') {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((d) => (d && typeof d === 'object' ? (d as { msg?: string }).msg : null))
        .filter(Boolean);
      if (msgs.length) return msgs.join('\n');
    }
  }
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'Not found.';
  if (status === 409) return 'That conflicts with the current state.';
  return `Request failed (${status}).`;
}

interface ApiConfig {
  getBaseUrl: () => string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  json?: unknown;
  form?: FormData;
  noAuthRedirect?: boolean;
}

/** Normalise a user-entered host into a clean base URL. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export class Api {
  private cfg: ApiConfig;

  constructor(cfg: ApiConfig) {
    this.cfg = cfg;
  }

  private async request<T>(
    method: string,
    path: string,
    opts: RequestOptions = {},
  ): Promise<T> {
    const base = normalizeBaseUrl(this.cfg.getBaseUrl());
    if (!base) {
      throw new ApiError(0, 'No server URL set.');
    }

    let url = `${base}/api/v1${path}`;
    if (opts.query) {
      const qs = Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&');
      if (qs) url += `?${qs}`;
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.cfg.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    let body: string | FormData | undefined;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form) {
      // Let fetch set the multipart boundary itself.
      body = opts.form;
    }

    // Fail fast instead of spinning forever when the host is unreachable.
    const controller = new AbortController();
    const timeoutMs = opts.form ? 45000 : 20000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, signal: controller.signal });
    } catch (e) {
      const aborted = (e as Error)?.name === 'AbortError';
      throw new ApiError(
        0,
        aborted
          ? `The server at ${base} did not respond. Check the server URL on the login screen and that the backend is reachable from this device.`
          : `Could not reach the server at ${base}. Check the server URL and that the backend is running.`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      if (!opts.noAuthRedirect) this.cfg.onUnauthorized();
      throw new ApiError(401, 'Your session has expired. Please sign in again.');
    }

    if (res.status === 204) return undefined as T;

    const text = await res.text();
    let data: unknown;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }

    if (!res.ok) {
      throw new ApiError(res.status, extractMessage(data, res.status), data);
    }
    return data as T;
  }

  private appendImages(form: FormData, field: string, images: PickedImage[]): void {
    for (const img of images) {
      form.append(field, {
        uri: img.uri,
        name: img.name,
        type: img.type,
      } as unknown as Blob);
    }
  }

  /* ---------------- auth ---------------- */

  login(username: string, password: string): Promise<TokenResponse> {
    return this.request<TokenResponse>('POST', '/auth/login', {
      json: { username, password },
      noAuthRedirect: true,
    });
  }

  me(): Promise<User> {
    return this.request<User>('GET', '/auth/me');
  }

  /* ---------------- push notifications ---------------- */

  registerPushToken(token: string, platform: string): Promise<void> {
    return this.request<void>('POST', '/admin/push/register', {
      json: { token, platform },
    });
  }

  unregisterPushToken(token: string): Promise<void> {
    return this.request<void>('POST', '/admin/push/unregister', {
      json: { token },
    });
  }

  /* ---------------- tickets ---------------- */

  /**
   * Create a ticket on behalf of a customer.
   *
   * Mirrors the public customer form: POST /tickets as multipart, with the
   * ticket data JSON-encoded under `payload` and optional `files`.
   * Returns 409 with a DuplicateInfo body if the serial number already has
   * an open ticket inside the dedup window — surface it to the user instead
   * of treating it as a hard error.
   */
  createTicket(
    body: {
      business_name: string;
      contact_name: string;
      phone: string;
      email?: string;
      business_type: string;
      address_line1: string;
      address_line2?: string;
      address_line3?: string;
      city: string;
      state: string;
      pincode: string;
      latitude?: number;
      longitude?: number;
      product_category: string;
      serial_number: string;
      issue_category: string;
      description: string;
      preferred_contact_time?: string;
    },
    images: PickedImage[],
  ): Promise<TicketDetail> {
    const form = new FormData();
    form.append('payload', JSON.stringify(body));
    this.appendImages(form, 'files', images);
    return this.request('POST', '/tickets', { form });
  }

  listTickets(params: {
    status?: string;
    severity?: string;
    product?: string;
    search?: string;
    created_within_days?: number;
    limit?: number;
    offset?: number;
  }): Promise<Page<TicketListItem>> {
    return this.request('GET', '/admin/tickets', { query: params });
  }

  getTicket(reference: string): Promise<TicketDetail> {
    return this.request('GET', `/admin/tickets/${reference}`);
  }

  ticketEvents(reference: string): Promise<TicketEvent[]> {
    return this.request('GET', `/admin/tickets/${reference}/events`);
  }

  ticketNotes(reference: string): Promise<WorkNote[]> {
    return this.request('GET', `/admin/tickets/${reference}/notes`);
  }

  addTicketNote(
    reference: string,
    body: string,
    images: PickedImage[],
  ): Promise<WorkNote> {
    const form = new FormData();
    form.append('body', body);
    this.appendImages(form, 'images', images);
    return this.request('POST', `/admin/tickets/${reference}/notes`, { form });
  }

  acknowledgeTicket(reference: string): Promise<TicketDetail> {
    return this.request('POST', `/admin/tickets/${reference}/acknowledge`);
  }

  assignTicket(reference: string, engineerId: number): Promise<TicketDetail> {
    return this.request('POST', `/admin/tickets/${reference}/assign`, {
      json: { engineer_id: engineerId },
    });
  }

  selfAssignTicket(reference: string): Promise<TicketDetail> {
    return this.request('POST', `/admin/tickets/${reference}/self-assign`);
  }

  acceptTicket(reference: string): Promise<TicketDetail> {
    return this.request('POST', `/admin/tickets/${reference}/accept`);
  }

  startWork(reference: string): Promise<TicketDetail> {
    return this.request('POST', `/admin/tickets/${reference}/start-work`);
  }

  resolveTicket(reference: string, summary: string): Promise<TicketDetail> {
    return this.request('POST', `/admin/tickets/${reference}/resolve`, {
      json: { summary },
    });
  }

  updateWarranty(reference: string, warranty_status: string): Promise<TicketDetail> {
    return this.request('PATCH', `/admin/tickets/${reference}/warranty`, {
      json: { warranty_status },
    });
  }

  updateSeverity(reference: string, severity: string): Promise<TicketDetail> {
    return this.request('PATCH', `/admin/tickets/${reference}/severity`, {
      json: { severity },
    });
  }

  setServiceType(reference: string, service_type: string): Promise<TicketDetail> {
    return this.request('PATCH', `/admin/tickets/${reference}/service-type`, {
      json: { service_type },
    });
  }

  signTicketCustomer(
    reference: string,
    signerName: string,
    signatureUri: string,
  ): Promise<TicketDetail> {
    const form = new FormData();
    form.append('signer_name', signerName);
    form.append('signature', {
      uri: signatureUri,
      name: 'customer-signature.png',
      type: 'image/png',
    } as unknown as Blob);
    return this.request('POST', `/admin/tickets/${reference}/sign-customer`, { form });
  }

  signTicketEngineer(reference: string, signatureUri: string): Promise<TicketDetail> {
    const form = new FormData();
    form.append('signature', {
      uri: signatureUri,
      name: 'engineer-signature.png',
      type: 'image/png',
    } as unknown as Blob);
    return this.request('POST', `/admin/tickets/${reference}/sign-engineer`, { form });
  }

  fieldSignLink(reference: string): Promise<FieldSignLink> {
    return this.request('POST', `/admin/tickets/${reference}/field-sign-link`);
  }

  getTicketPdf(reference: string): Promise<PdfLink> {
    return this.request('GET', `/admin/tickets/${reference}/pdf`);
  }

  regenerateTicketPdf(reference: string): Promise<PdfLink> {
    return this.request('POST', `/admin/tickets/${reference}/pdf/regenerate`);
  }

  /* ---------------- sub-engineers ---------------- */

  listSubEngineers(reference: string): Promise<SubEngineer[]> {
    return this.request('GET', `/admin/tickets/${reference}/sub-engineers`);
  }

  subEngineerSuggestions(reference: string): Promise<RosterContact[]> {
    return this.request('GET', `/admin/tickets/${reference}/sub-engineer-suggestions`);
  }

  addSubEngineer(
    reference: string,
    body: { roster_id?: number; name?: string; phone?: string; location?: string },
  ): Promise<SubEngineer> {
    return this.request('POST', `/admin/tickets/${reference}/sub-engineers`, {
      json: body,
    });
  }

  updateSubEngineerFee(
    reference: string,
    subId: number,
    feeInr: number,
  ): Promise<SubEngineer> {
    return this.request('PATCH', `/admin/tickets/${reference}/sub-engineers/${subId}`, {
      json: { fee_inr: feeInr },
    });
  }

  removeSubEngineer(reference: string, subId: number): Promise<void> {
    return this.request('DELETE', `/admin/tickets/${reference}/sub-engineers/${subId}`);
  }

  /* ---------------- spares & charges ---------------- */

  spareCatalog(product?: string): Promise<SpareCatalogItem[]> {
    return this.request('GET', '/admin/spare-catalog', { query: { product } });
  }

  getCharges(reference: string): Promise<ChargesSummary> {
    return this.request('GET', `/admin/tickets/${reference}/charges`);
  }

  addSpare(
    reference: string,
    body: { catalog_id?: number; name?: string; unit_price_inr?: number; quantity?: number },
  ): Promise<unknown> {
    return this.request('POST', `/admin/tickets/${reference}/spares`, { json: body });
  }

  updateSpare(
    reference: string,
    spareId: number,
    body: { unit_price_inr?: number; quantity?: number },
  ): Promise<unknown> {
    return this.request('PATCH', `/admin/tickets/${reference}/spares/${spareId}`, {
      json: body,
    });
  }

  removeSpare(reference: string, spareId: number): Promise<void> {
    return this.request('DELETE', `/admin/tickets/${reference}/spares/${spareId}`);
  }

  updateServiceFee(reference: string, serviceFeeInr: number): Promise<ChargesSummary> {
    return this.request('PATCH', `/admin/tickets/${reference}/service-fee`, {
      json: { service_fee_inr: serviceFeeInr },
    });
  }

  /* ---------------- shipments ---------------- */

  listShipments(reference: string): Promise<Shipment[]> {
    return this.request('GET', `/admin/tickets/${reference}/shipments`);
  }

  createShipment(
    reference: string,
    body: {
      courier_name: string;
      tracking_id?: string;
      items: { catalog_id?: number; name?: string; quantity?: number }[];
    },
  ): Promise<Shipment> {
    return this.request('POST', `/admin/tickets/${reference}/shipments`, { json: body });
  }

  deliverShipment(reference: string, shipmentId: number): Promise<Shipment> {
    return this.request(
      'POST',
      `/admin/tickets/${reference}/shipments/${shipmentId}/deliver`,
    );
  }

  /* ---------------- engineers / users ---------------- */

  listEngineers(): Promise<User[]> {
    return this.request('GET', '/admin/engineers');
  }

  listUsers(): Promise<User[]> {
    return this.request('GET', '/admin/users');
  }

  createUser(body: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    username: string;
    password: string;
    role: string;
    district?: string;
  }): Promise<{ user: User }> {
    return this.request('POST', '/admin/users', { json: body });
  }

  setUserActive(userId: number, active: boolean): Promise<User> {
    return this.request('PATCH', `/admin/users/${userId}/active`, {
      json: { active },
    });
  }

  /* ---------------- sub-engineer roster ---------------- */

  listRoster(district?: string, includeInactive = false): Promise<RosterContact[]> {
    return this.request('GET', '/admin/sub-engineer-roster', {
      query: { district, include_inactive: includeInactive },
    });
  }

  createRosterContact(body: {
    name: string;
    phone: string;
    district: string;
  }): Promise<RosterContact> {
    return this.request('POST', '/admin/sub-engineer-roster', { json: body });
  }

  updateRosterContact(
    entryId: number,
    body: { name?: string; phone?: string; district?: string; active?: boolean },
  ): Promise<RosterContact> {
    return this.request('PATCH', `/admin/sub-engineer-roster/${entryId}`, {
      json: body,
    });
  }

  /* ---------------- analytics ---------------- */

  analytics(days: number): Promise<Analytics> {
    return this.request('GET', '/admin/analytics', { query: { days } });
  }

  /* ---------------- installations ---------------- */

  listInstallations(params: {
    status?: string;
    search?: string;
    created_within_days?: number;
    limit?: number;
    offset?: number;
  }): Promise<Page<InstallationListItem>> {
    return this.request('GET', '/admin/installations', { query: params });
  }

  getInstallation(reference: string): Promise<InstallationDetail> {
    return this.request('GET', `/admin/installations/${reference}`);
  }

  createInstallation(body: {
    business_name: string;
    business_category: string;
    contact_name: string;
    phone: string;
    email?: string;
    invoice_number: string;
    address_line1: string;
    address_line2?: string;
    address_line3?: string;
    city: string;
    state: string;
    pincode: string;
    latitude?: number;
    longitude?: number;
    assigned_engineer_id?: number;
  }): Promise<InstallationDetail> {
    return this.request('POST', '/admin/installations', { json: body });
  }

  updateInstallationAddress(
    reference: string,
    body: {
      address_line1: string;
      address_line2?: string | null;
      address_line3?: string | null;
      city: string;
      state: string;
      pincode: string;
      latitude?: number | null;
      longitude?: number | null;
    },
  ): Promise<InstallationDetail> {
    return this.request('PATCH', `/admin/installations/${reference}/address`, {
      json: body,
    });
  }

  installationEvents(reference: string): Promise<InstallationEvent[]> {
    return this.request('GET', `/admin/installations/${reference}/events`);
  }

  installationNotes(reference: string): Promise<InstallationNote[]> {
    return this.request('GET', `/admin/installations/${reference}/notes`);
  }

  addInstallationNote(
    reference: string,
    body: string,
    images: PickedImage[],
  ): Promise<InstallationNote> {
    const form = new FormData();
    form.append('body', body);
    this.appendImages(form, 'images', images);
    return this.request('POST', `/admin/installations/${reference}/notes`, { form });
  }

  assignInstallation(reference: string, engineerId: number): Promise<InstallationDetail> {
    return this.request('POST', `/admin/installations/${reference}/assign`, {
      json: { engineer_id: engineerId },
    });
  }

  selfAssignInstallation(reference: string): Promise<InstallationDetail> {
    return this.request('POST', `/admin/installations/${reference}/self-assign`);
  }

  closeInstallation(reference: string): Promise<InstallationDetail> {
    return this.request('POST', `/admin/installations/${reference}/close`);
  }

  updateInstallationInvoice(
    reference: string,
    invoiceNumber: string,
  ): Promise<InstallationDetail> {
    return this.request('PATCH', `/admin/installations/${reference}/invoice`, {
      json: { invoice_number: invoiceNumber },
    });
  }

  uploadInstallationInvoiceDocument(
    reference: string,
    doc: PickedDocument,
  ): Promise<InstallationDetail> {
    const form = new FormData();
    form.append('file', {
      uri: doc.uri,
      name: doc.name,
      type: doc.type,
    } as unknown as Blob);
    return this.request('POST', `/admin/installations/${reference}/invoice-document`, {
      form,
    });
  }

  deleteInstallationInvoiceDocument(reference: string): Promise<InstallationDetail> {
    return this.request('DELETE', `/admin/installations/${reference}/invoice-document`);
  }

  signInstallationCustomer(
    reference: string,
    signerName: string,
    signatureUri: string,
  ): Promise<InstallationDetail> {
    const form = new FormData();
    form.append('signer_name', signerName);
    form.append('signature', {
      uri: signatureUri,
      name: 'customer-signature.png',
      type: 'image/png',
    } as unknown as Blob);
    return this.request('POST', `/admin/installations/${reference}/sign-customer`, {
      form,
    });
  }

  signInstallationEngineer(
    reference: string,
    signatureUri: string,
  ): Promise<InstallationDetail> {
    const form = new FormData();
    form.append('signature', {
      uri: signatureUri,
      name: 'engineer-signature.png',
      type: 'image/png',
    } as unknown as Blob);
    return this.request('POST', `/admin/installations/${reference}/sign-engineer`, {
      form,
    });
  }

  getInstallationPdf(reference: string): Promise<PdfLink> {
    return this.request('GET', `/admin/installations/${reference}/pdf`);
  }
}
