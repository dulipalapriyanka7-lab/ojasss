const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat('en-IN');

/** ₹1,234.50 from integer paise. */
export const rupees = (paise: number | string | null | undefined) => inr.format(Number(paise ?? 0) / 100);

/** 1.2K, 3.4L — compact counts, Indian numbering. */
export const count = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return v < 1000 ? whole.format(v) : compact.format(v);
};

export const number = (n: number | string | null | undefined) => whole.format(Number(n ?? 0));

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto', style: 'short' });
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const a = Math.abs(s);
  if (a < 45) return 'now';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 604800) return rtf.format(Math.round(s / 86400), 'day');
  return dateFmt.format(new Date(iso));
}

export const date = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const dateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');
export const time = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '');

export function duration(ms: number | null | undefined): string {
  if (!ms) return '0:00';
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const humanize = (s: string | null | undefined) =>
  (s ?? '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export function paiseFromRupeesInput(input: string): number | null {
  const clean = input.replace(/[,\s₹]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}
