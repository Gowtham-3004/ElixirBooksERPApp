// Formatting + validation helpers shared by every module.
// Never hand-roll money/date formatting in pages — use these.

export type Locale = 'en-IN' | 'en-US' | 'en-GB' | 'ar-AE';

const SYMBOLS: Record<string, string> = { INR: '₹', USD: '$', AED: 'AED ', GBP: '£', EUR: '€', SGD: 'S$', JPY: '¥' };
const MINOR: Record<string, number> = { INR: 2, USD: 2, AED: 2, GBP: 2, EUR: 2, SGD: 2, JPY: 0, KWD: 3 };

export function minorUnits(currency: string): number {
  return MINOR[currency] ?? 2;
}

/** Format a number with locale grouping (en-IN gives 1,18,000.00). */
export function fmtNumber(n: number, decimals = 2, locale: Locale = 'en-IN'): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export interface MoneyOpts {
  locale?: Locale;
  /** show the ISO code ("INR 1,000.00") instead of the symbol */
  code?: boolean;
  decimals?: number;
  /** no symbol or code at all — statement columns that carry the currency in the header */
  bare?: boolean;
  /** accounting style: (1,000.00) instead of −1,000.00 */
  parens?: boolean;
}

/** The pieces of a money string, so the UI can style the minor units and the sign separately.
 *  sign + mark + integer + minor === fmtMoney(n, currency, opts) for every currency and locale. */
export interface MoneyParts { negative: boolean; sign: '' | '−'; mark: string; integer: string; minor: string }

const formatters = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: Locale, decimals: number): Intl.NumberFormat {
  const key = `${locale}:${decimals}`;
  let f = formatters.get(key);
  if (!f) { f = new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); formatters.set(key, f); }
  return f;
}

export function splitMoney(n: number, currency = 'INR', opts: MoneyOpts = {}): MoneyParts | null {
  if (n === null || n === undefined || isNaN(n)) return null;
  const decimals = opts.decimals ?? minorUnits(currency);
  const parts = numberFormat(opts.locale ?? 'en-IN', decimals).formatToParts(Math.abs(n));
  const integer = parts.filter((p) => p.type === 'integer' || p.type === 'group').map((p) => p.value).join('');
  const minor = parts.filter((p) => p.type === 'decimal' || p.type === 'fraction').map((p) => p.value).join('');
  const mark = opts.bare ? '' : opts.code || !SYMBOLS[currency] ? `${currency} ` : SYMBOLS[currency];
  const negative = n < 0;
  return { negative, sign: negative ? '−' : '', mark, integer, minor };
}

/** Money with currency mark. Negative uses a true minus (U+2212) unless `parens` asks for accounting style. */
export function fmtMoney(n: number, currency = 'INR', opts: MoneyOpts = {}): string {
  const p = splitMoney(n, currency, opts);
  if (!p) return '—';
  const body = p.mark + p.integer + p.minor;
  return p.negative && opts.parens ? `(${body})` : p.sign + body;
}

/** Compact money for dashboards: ₹1.2 Cr / ₹4.5 L / ₹12,000.00 */
export function fmtMoneyCompact(n: number, currency = 'INR'): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const mark = SYMBOLS[currency] ?? `${currency} `;
  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${mark}${(abs / 1e7).toFixed(2)} Cr`;
    if (abs >= 1e5) return `${sign}${mark}${(abs / 1e5).toFixed(2)} L`;
  } else {
    if (abs >= 1e9) return `${sign}${mark}${(abs / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${sign}${mark}${(abs / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${sign}${mark}${(abs / 1e3).toFixed(1)}K`;
  }
  return fmtMoney(n, currency);
}

export function fmtQty(n: number, uom?: string, decimals = 2): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const s = n.toLocaleString('en-IN', { minimumFractionDigits: Number.isInteger(n) ? 0 : decimals, maximumFractionDigits: decimals });
  return uom ? `${s} ${uom}` : s;
}

export function fmtPct(n: number, decimals = 1): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `${n.toFixed(decimals)}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO (yyyy-mm-dd or full ISO) → "21 Apr 2026" */
export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** ISO → "10:00, 21 Apr 2026" */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}, ${fmtDate(iso)}`;
}

/** "2026-04" → "Apr 2026" */
export function fmtPeriod(code?: string): string {
  if (!code) return '—';
  const [y, m] = code.split('-');
  return `${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}

export function today(): string {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  const da = new Date(a.slice(0, 10) + 'T00:00:00').getTime();
  const dbb = new Date(b.slice(0, 10) + 'T00:00:00').getTime();
  return Math.round((dbb - da) / 86400000);
}

export function periodCodeOf(iso: string): string {
  return iso.slice(0, 7);
}

/** Fiscal-year label for a date given the FY start month (1–12). e.g. 2026-04 → "2026-27" */
export function fiscalYearOf(iso: string, fyStartMonth = 4): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const startYear = m >= fyStartMonth ? y : y - 1;
  if (fyStartMonth === 1) return String(startYear);
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function round(n: number, decimals = 2): number {
  const f = Math.pow(10, decimals);
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Ageing bucket for a due date relative to as-of date. */
export function ageingBucket(dueDate: string, asOf = today()): 'current' | 'd030' | 'd3160' | 'd6190' | 'd90p' {
  const days = daysBetween(dueDate, asOf);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd030';
  if (days <= 60) return 'd3160';
  if (days <= 90) return 'd6190';
  return 'd90p';
}

/** Indian number → words (for print/PDF) */
export function amountInWords(n: number, currency = 'INR'): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number) => (x < 20 ? ones[x] : tens[Math.floor(x / 10)] + (x % 10 ? ' ' + ones[x % 10] : ''));
  const three = (x: number) => (x >= 100 ? ones[Math.floor(x / 100)] + ' Hundred' + (x % 100 ? ' ' + two(x % 100) : '') : two(x));
  const whole = Math.floor(Math.abs(n));
  const paise = Math.round((Math.abs(n) - whole) * 100);
  if (whole === 0 && paise === 0) return 'Zero';
  let s = '';
  const crore = Math.floor(whole / 1e7);
  const lakh = Math.floor((whole % 1e7) / 1e5);
  const thousand = Math.floor((whole % 1e5) / 1e3);
  const rest = whole % 1e3;
  if (crore) s += three(crore) + ' Crore ';
  if (lakh) s += two(lakh) + ' Lakh ';
  if (thousand) s += two(thousand) + ' Thousand ';
  if (rest) s += three(rest);
  const unit = currency === 'INR' ? 'Rupees' : currency;
  const minor = currency === 'INR' ? 'Paise' : 'Cents';
  return `${s.trim()} ${unit}${paise ? ` and ${two(paise)} ${minor}` : ''} Only`;
}

// ── Validators (India localization) ────────────────────────────────────────

export function validateGSTIN(v: string): string | null {
  if (!v) return null;
  if (v.length !== 15) return 'GSTIN must be 15 characters: 2-digit state code + PAN + entity + Z + check digit';
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(v)) return 'GSTIN format is invalid (e.g. 27AAAPL1234C1Z5)';
  return null;
}

export function validatePAN(v: string): string | null {
  if (!v) return null;
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v)) return 'PAN must be 5 letters, 4 digits, 1 letter (e.g. AAAPL1234C)';
  return null;
}

export function validateIFSC(v: string): string | null {
  if (!v) return null;
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(v)) return 'IFSC must be 4 letters, 0, then 6 alphanumerics (e.g. HDFC0001234)';
  return null;
}

export function validateEmail(v: string): string | null {
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
  return null;
}

export function validatePIN(v: string): string | null {
  if (!v) return null;
  if (!/^[1-9][0-9]{5}$/.test(v)) return 'PIN must be 6 digits';
  return null;
}

export const INDIA_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' }, { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' }, { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' }, { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' }, { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' }, { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' }, { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' }, { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' }, { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar' }, { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
];

export function stateCodeOf(stateName: string): string | undefined {
  return INDIA_STATES.find((s) => s.name === stateName)?.code;
}

export function stateNameOf(code: string): string | undefined {
  return INDIA_STATES.find((s) => s.code === code)?.name;
}

/** Simple CSV builder for exports */
export function toCSV(rows: Record<string, unknown>[], columns?: { key: string; label: string }[]): string {
  if (rows.length === 0) return '';
  const cols = columns ?? Object.keys(rows[0]).map((k) => ({ key: k, label: k }));
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(r[c.key])).join(','))].join('\n');
}

export function downloadText(filename: string, text: string, mime = 'text/csv') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function correlationId(): string {
  return 'corr_' + Math.random().toString(36).slice(2, 10).toUpperCase() + Date.now().toString(36).toUpperCase();
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}
