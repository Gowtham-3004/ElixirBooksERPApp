// Workspace provisioning (registration → tenant/company/branch/periods/owner) and
// onboarding persistence helpers. All writes go through the store so the wizard,
// company admin and home checklist see the same records.
import { db, C, engine, IDS } from '../../store';
import type { Branch, Company, GstinDetails, NumberSeries, OperatingProfileTemplate, Period, Tenant, User, Role } from '../../store';
import { addDays, fiscalYearOf, today, uid } from '../../lib/format';

export const COUNTRY_OPTIONS = [
  { code: 'IN', name: 'India', currency: 'INR', timeZone: 'Asia/Kolkata', locale: 'en-IN', pack: 'IN', fyStart: 4 },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', timeZone: 'Asia/Dubai', locale: 'en-US', pack: 'AE', fyStart: 1 },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', timeZone: 'Europe/London', locale: 'en-GB', pack: 'GB', fyStart: 4 },
  { code: 'SG', name: 'Singapore', currency: 'SGD', timeZone: 'Asia/Singapore', locale: 'en-US', pack: 'SG', fyStart: 1 },
  { code: 'US', name: 'United States', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', pack: 'US', fyStart: 1 },
];

export const TIME_ZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];
export const LOCALES = [{ value: 'en-IN', label: 'English (India) · 1,00,000.00' }, { value: 'en-US', label: 'English (US) · 100,000.00' }, { value: 'en-GB', label: 'English (UK) · 100,000.00' }, { value: 'ar-AE', label: 'Arabic (UAE)' }];
export const CURRENCIES = ['INR', 'USD', 'AED', 'EUR', 'GBP', 'SGD', 'JPY'];
export const BUSINESS_TYPES = ['Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Proprietorship', 'LLC', 'Branch office', 'Trust / Society', 'Other'];
export const ONBOARDING_KEYS = ['nature', 'legal', 'address', 'currency', 'periods', 'users', 'masters', 'opening', 'bank', 'numbering', 'einvoice'] as const;

export function profilesForNature(nature: Company['nature']): string[] {
  return nature === 'Hybrid' ? ['Trading', 'Manufacturing'] : [nature];
}

export function templateForNature(nature: Company['nature']): OperatingProfileTemplate | undefined {
  return db.findBy<OperatingProfileTemplate>(C.profileTemplates, (t) => t.nature === nature);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Build the 12 monthly periods of the fiscal year that contains `anchorDate`. Does not write. */
export function buildFyPeriods(companyId: string, fyStartMonth: number, anchorDate = today(), opts: { openFrom?: string } = {}): Omit<Period, 'id' | 'createdAt' | 'updatedAt' | 'version'>[] {
  const d = new Date(anchorDate.slice(0, 10) + 'T00:00:00');
  const y = d.getFullYear();
  const startYear = d.getMonth() + 1 >= fyStartMonth ? y : y - 1;
  const fy = fiscalYearOf(`${startYear}-${String(fyStartMonth).padStart(2, '0')}-01`, fyStartMonth);
  const cur = today().slice(0, 7);
  const out: Omit<Period, 'id' | 'createdAt' | 'updatedAt' | 'version'>[] = [];
  for (let i = 0; i < 12; i++) {
    const m0 = fyStartMonth - 1 + i;
    const yy = startYear + Math.floor(m0 / 12);
    const mm = (m0 % 12) + 1;
    const code = `${yy}-${String(mm).padStart(2, '0')}`;
    const start = `${code}-01`;
    const end = `${code}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
    const status: Period['status'] = code > cur ? 'Future' : opts.openFrom && code < opts.openFrom.slice(0, 7) ? 'Future' : 'Open';
    out.push({ companyId, fy, code, label: `${MONTHS[mm - 1]} ${yy}`, start, end, status, history: [] });
  }
  return out;
}

/** Ensure the FY periods exist for a company (idempotent by code). Returns the rows for that FY. */
export function ensureFyPeriods(companyId: string, fyStartMonth: number, anchorDate = today(), opts: { openFrom?: string } = {}): Period[] {
  const wanted = buildFyPeriods(companyId, fyStartMonth, anchorDate, opts);
  const existing = db.where<Period>(C.periods, (p) => p.companyId === companyId);
  const created: Period[] = [];
  db.transaction(() => {
    wanted.forEach((w) => {
      if (existing.some((e) => e.code === w.code)) return;
      created.push(db.insert<Period>(C.periods, { ...w, id: `per_${companyId.replace(/^co_/, '')}_${w.code}` }));
    });
  });
  return db.where<Period>(C.periods, (p) => p.companyId === companyId && p.fy === wanted[0].fy).sort((a, b) => a.code.localeCompare(b.code));
}

const DEFAULT_SERIES: [string, string, NumberSeries['allocation']][] = [
  ['Sales Invoice', 'INV', 'On post'], ['Credit Note', 'CN', 'On post'], ['Quotation', 'QT', 'On save'], ['Sales Order', 'SO', 'On save'], ['Delivery', 'DC', 'On post'],
  ['Receipt', 'RCPT', 'On post'], ['Purchase Order', 'PO', 'On save'], ['GRN', 'GRN', 'On post'], ['Vendor Invoice', 'VINV', 'On post'], ['Payment', 'PMT', 'On post'], ['Journal', 'JV', 'On post'],
];

/** Default number series for a new company — lazily extended by engine.allocateNumber for anything else. */
export function ensureDefaultSeries(companyId: string, fyStartMonth: number) {
  const fy = fiscalYearOf(today(), fyStartMonth);
  const short = fy.includes('-') ? fy.slice(2) : fy;
  db.transaction(() => {
    DEFAULT_SERIES.forEach(([docType, prefix, allocation]) => {
      if (db.findBy<NumberSeries>(C.numberSeries, (s) => s.companyId === companyId && s.docType === docType)) return;
      db.insert<NumberSeries>(C.numberSeries, { companyId, docType, fy, prefix: `${prefix}/${short}/`, suffix: '', padding: 4, next: 1, resetRule: 'FY', allocation, status: 'Active', voids: [] });
    });
  });
}

export interface CreateWorkspaceInput {
  fullName: string;
  email: string;
  companyName: string;
  country: string; // ISO code
  nature: Company['nature'];
  /** GSTIN lookup applied on the registration screen — prefills legal identity, registration and address for the wizard to verify. */
  gstin?: GstinDetails;
}

/** Registration: tenant (14-day trial) + company + default branch + FY periods + owner user + number series. */
export function createWorkspace(input: CreateWorkspaceInput): { tenant: Tenant; company: Company; branch: Branch; user: User } {
  const c = COUNTRY_OPTIONS.find((x) => x.code === input.country) ?? COUNTRY_OPTIONS[0];
  const now = new Date().toISOString();
  const code = input.companyName.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'CO';
  // Ids are fixed up front so the company's registration and the head-office branch can reference each other in one pass.
  const d = input.gstin;
  const regId = d ? uid('reg') : undefined;
  const branchId = uid('br');
  const emptyAddress = { line1: '', city: '', state: '', stateCode: undefined, pin: '', country: c.code };
  const address = d ? { ...d.address, country: c.code } : emptyAddress;
  return db.transaction(() => {
    const tenant = db.insert<Tenant>(C.tenants, {
      companyId: undefined, name: input.companyName, planId: IDS.planGrowth, subscriptionState: 'Trial', trialEndsAt: addDays(today(), 14), ownerUserId: '',
      usage: { users: 1, companies: 1, invoicesPerMonth: 0, storageMb: 0 }, country: c.code,
    });
    const company = db.insert<Company>(C.companies, {
      companyId: undefined, tenantId: tenant.id, code, legalName: d?.legalName ?? input.companyName, tradeName: input.companyName, country: c.code, baseCurrency: c.currency, reportingCurrency: undefined,
      permittedCurrencies: Array.from(new Set([c.currency, 'USD'])), timeZone: c.timeZone, locale: c.locale, language: 'en', fiscalYearStartMonth: c.fyStart,
      booksFrom: today(), openingBalanceDate: today(), nature: input.nature, profiles: profilesForNature(input.nature), profileHistory: [], businessType: d?.constitution ?? 'Private Limited',
      pan: d?.pan, address, email: input.email, logoText: input.companyName.trim().charAt(0).toUpperCase() || 'E', brandColor: '#325CFF',
      localizationPack: c.pack, localizationVersion: c.pack === 'IN' ? '1.4' : '1.0',
      registrations: d && regId ? [{ id: regId, type: 'GSTIN', number: d.gstin, state: d.state, stateCode: d.stateCode, branchId, status: 'Active', isSez: d.isSez }] : [],
      gstinLookup: d,
      defaults: { allowNegativeStock: false, valuationMethod: 'AVCO', matchingMode: '3-way', matchTolerancePct: 2, matchToleranceAmt: 500, creditPolicy: 'Warn', directInvoiceStock: true, paymentTerms: 'Net 30' },
      status: 'Active',
      onboarding: { nature: 'Done', legal: 'Pending', address: 'Pending', currency: 'Pending', periods: 'Pending', users: 'Pending', masters: 'Pending', opening: 'Pending', bank: 'Pending', numbering: 'Done', einvoice: 'Pending' },
    });
    const branch = db.insert<Branch>(C.branches, { id: branchId, companyId: company.id, code: 'BR-001', name: 'Head Office', type: 'Office', address, gstin: d?.gstin, registrationId: regId, status: 'Active', isDefault: true });
    const ownerRole = db.find<Role>(C.roles, IDS.rOwner);
    const user = db.insert<User>(C.users, {
      companyId: company.id, tenantId: tenant.id, name: input.fullName, email: input.email.trim().toLowerCase(), roleIds: ownerRole ? [ownerRole.id] : [], companyIds: [company.id], branchIds: [],
      status: 'Active', mfaEnabled: false, passwordSet: true, isTenantOwner: true, lastLoginAt: now, sessions: [{ id: uid('s'), device: 'This browser', at: now, current: true }],
    });
    db.update<Tenant>(C.tenants, tenant.id, { ownerUserId: user.id });
    buildFyPeriods(company.id, c.fyStart).forEach((p) => db.insert<Period>(C.periods, { ...p, id: `per_${company.id.replace(/^co_/, '')}_${p.code}` }));
    ensureDefaultSeries(company.id, c.fyStart);
    db.update<Company>(C.companies, company.id, { onboarding: { ...company.onboarding, periods: 'Done' } });
    db.insert(C.audit, { companyId: company.id, tenantId: tenant.id, at: now, actor: user.name, actorId: user.id, action: 'tenant.created', objectType: 'Tenant', objectId: tenant.id, objectNumber: tenant.name, result: 'Success', correlationId: 'corr_' + Date.now().toString(36).toUpperCase(), channel: 'web', detail: `Trial (14 days) · ${input.nature} · ${c.name} · ${c.currency}${d ? ` · GSTIN ${d.gstin} via ${d.provider}` : ''}` });
    db.insert(C.notifications, { companyId: company.id, userId: user.id, at: now, type: 'system', title: `Welcome to Elixir Books, ${input.fullName.split(' ')[0]}`, body: 'Your 14-day Growth trial has started. Finish the setup wizard to go live.', link: 'home', read: false, status: 'delivered', channel: 'in-app' });
    return { tenant, company, branch, user };
  });
}

/** Persist a wizard step into the company record and flip its onboarding flag. */
export function saveOnboardingStep(companyId: string, patch: Partial<Company>, flags: Record<string, 'Done' | 'Pending' | 'Blocked'> = {}) {
  const co = db.find<Company>(C.companies, companyId);
  if (!co) return;
  db.update<Company>(C.companies, companyId, { ...patch, onboarding: { ...co.onboarding, ...flags } });
}

/** Readiness rows for the checklist card (FR-ORG-008). */
export interface ReadinessRow { key: string; label: string; status: 'Done' | 'Pending' | 'Blocked'; detail?: string; link: string }

export function readinessFor(co: Company): ReadinessRow[] {
  const o = co.onboarding ?? {};
  const branches = db.count(C.branches, (b) => b.companyId === co.id && b.status === 'Active');
  const users = db.count(C.users, (u) => u.companyIds?.includes(co.id));
  const periods = db.count(C.periods, (p) => p.companyId === co.id);
  const bank = db.count(C.accounts, (a) => a.companyId === co.id && a.isBank);
  const series = db.count(C.numberSeries, (s) => s.companyId === co.id && s.status === 'Active');
  const hasGstin = co.registrations.some((r) => r.type === 'GSTIN' && r.status === 'Active');
  const rows: ReadinessRow[] = [
    { key: 'nature', label: 'Business nature & operating profile', status: o.nature ?? (co.profiles.length ? 'Done' : 'Pending'), detail: co.profiles.join(' + ') || undefined, link: 'admin/profile' },
    { key: 'legal', label: 'Legal identity & registrations', status: o.legal ?? 'Pending', detail: co.pan ? `PAN ${co.pan}${hasGstin ? ' · GSTIN on file' : ''}` : 'PAN missing', link: 'admin/company' },
    { key: 'address', label: 'Registered address & branches', status: o.address ?? 'Pending', detail: `${branches} active branch${branches === 1 ? '' : 'es'}`, link: 'admin/branches' },
    { key: 'currency', label: 'Currency, fiscal calendar & locale', status: o.currency ?? 'Pending', detail: `${co.baseCurrency} · FY starts ${MONTHS[(co.fiscalYearStartMonth ?? 4) - 1]} · ${co.timeZone}`, link: 'admin/company' },
    { key: 'periods', label: 'Financial year & periods', status: periods ? (o.periods ?? 'Done') : 'Blocked', detail: periods ? `${periods} periods` : 'No accounting periods — postings will be refused', link: 'admin/periods' },
    { key: 'users', label: 'Users & roles', status: o.users ?? (users > 1 ? 'Done' : 'Pending'), detail: `${users} user${users === 1 ? '' : 's'}`, link: 'admin/users' },
    { key: 'masters', label: 'Masters (customers, suppliers, items, accounts)', status: o.masters ?? 'Pending', link: 'masters' },
    { key: 'opening', label: 'Opening balances', status: o.opening ?? 'Pending', detail: o.opening === 'Blocked' ? 'Opening-balance date falls in a locked period' : undefined, link: 'accounting/opening-balances' },
    { key: 'bank', label: 'Bank accounts', status: o.bank ?? (bank ? 'Done' : 'Pending'), detail: bank ? `${bank} bank account${bank === 1 ? '' : 's'}` : 'No bank account yet', link: 'banking' },
    { key: 'numbering', label: 'Document number series', status: series ? 'Done' : 'Pending', detail: `${series} series`, link: 'admin/numbering' },
    { key: 'einvoice', label: 'e-Invoice / e-Way bill credentials', status: co.localizationPack === 'IN' ? (o.einvoice ?? 'Pending') : 'Done', detail: co.localizationPack === 'IN' ? undefined : 'Not applicable for this pack', link: 'admin/integrations' },
  ];
  return rows;
}

export function markOnboardingComplete(companyId: string) {
  const co = db.find<Company>(C.companies, companyId);
  if (!co) return;
  const rows = readinessFor(co);
  const flags: Company['onboarding'] = { ...co.onboarding };
  rows.forEach((r) => { flags[r.key] = r.status; });
  db.update<Company>(C.companies, companyId, { onboarding: flags });
  engine.audit({ action: 'onboarding.completed', objectType: 'Company', objectId: companyId, objectNumber: co.code, detail: `${rows.filter((r) => r.status === 'Done').length} of ${rows.length} setup items complete` });
}
