/** Formatting helpers — dates, currency, relative time. */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

/** "20 May 2026" */
export function formatDate(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "20 May 2026, 2:30 PM" */
export function formatDateTime(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${m} ${ampm}`;
}

/** "just now" / "5m ago" / "3h ago" / "2d ago" / falls back to date */
export function timeAgo(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '—';
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  if (secs < 90) return '1m ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

/** "₹1,200" — whole rupees with thousands separators. */
export function formatINR(amount: number | null | undefined): string {
  if (amount == null) return '₹0';
  const n = Math.round(amount);
  // Indian grouping (lakh/crore)
  const s = Math.abs(n).toString();
  let out: string;
  if (s.length <= 3) {
    out = s;
  } else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    out = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return `${n < 0 ? '-' : ''}₹${out}`;
}

/** Rounded hours, e.g. 12.4 -> "12.4 h" */
export function formatHours(hours: number | null | undefined): string {
  if (hours == null) return '—';
  return `${Math.round(hours * 10) / 10} h`;
}

/** First + last initial, e.g. "Abhishek Gowda" -> "AG" */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
