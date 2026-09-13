// Declarative configs for the simple masters: payment terms, UOMs, reason codes, salespersons,
// HSN/SAC, TDS/TCS sections, currencies (FR-TDS-001, FR-FX-001) + read-only reference data.
import { useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { Currency, HsnCode, PaymentTerm, ReasonCode, Salesperson, TaxRate, TdsSection, Uom } from '../../store';
import { Badge, DataTable, Money, PageHeader, Tabs } from '../../components/ui';
import { INDIA_STATES } from '../../lib/format';
import { SimpleRegister, nextCode, type SimpleMasterConfig } from './SimpleRegister';

export function PaymentTermsRegister() {
  const cfg: SimpleMasterConfig<PaymentTerm> = {
    collection: C.paymentTerms, entity: 'paymentTerms', objectType: 'Payment Term', title: 'Payment terms', permission: 'masters.paymentterms', searchKeys: ['code', 'name'], dupFields: ['code', 'name'],
    columns: [
      { key: 'name', label: 'Term', sortable: true, render: (r) => <span><strong>{r.name}</strong> <span className="identifier" style={{ color: '#5F6368', marginLeft: 6 }}>{r.code}</span></span> },
      { key: 'days', label: 'Due in', align: 'right', sortable: true, render: (r) => (r.days === 0 ? 'Immediate' : `${r.days} days`) },
      { key: 'discount', label: 'Early-payment discount', render: (r) => (r.discountPct ? `${r.discountPct}% if paid within ${r.discountDays} days` : '—') },
      { key: 'usage', label: 'Used by', render: (r) => { const n = db.get<any>(C.customers).filter((c) => c.paymentTerms === r.name).length + db.get<any>(C.suppliers).filter((c) => c.purchaseTerms === r.name).length; return n ? `${n} parties` : '—'; } },
    ],
    fields: [
      { key: 'code', label: 'Code', required: true, uppercase: true },
      { key: 'name', label: 'Name', required: true, help: 'Shown on documents, e.g. "Net 30"' },
      { key: 'days', label: 'Due after (days)', type: 'number', decimals: 0, required: true, validate: (v) => (v >= 0 ? null : 'Days must be 0 or more') },
      { key: 'discountPct', label: 'Discount %', type: 'percent', help: 'Optional early-payment discount' },
      { key: 'discountDays', label: 'Discount within (days)', type: 'number', decimals: 0, validate: (v, all) => (all.discountPct && !(v > 0) ? 'Discount days required when a discount applies' : all.discountPct && v > all.days ? 'Discount window must be within the due period' : null) },
    ],
    blank: (rows) => ({ code: nextCode(rows, 'PT-'), name: '', days: 30, status: 'Active' }),
  };
  return <SimpleRegister cfg={cfg} />;
}

export function UomRegister() {
  const cfg: SimpleMasterConfig<Uom> = {
    collection: C.uoms, entity: 'uoms', objectType: 'UOM', title: 'Units of measure', permission: 'masters.uoms', searchKeys: ['code', 'name'], dupFields: ['code', 'name'],
    columns: [
      { key: 'code', label: 'Code', sortable: true, render: (r) => <span className="identifier" style={{ fontWeight: 500 }}>{r.code}</span> },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'decimals', label: 'Decimals', align: 'right' },
      { key: 'usage', label: 'Items', align: 'right', render: (r) => db.get<any>(C.items).filter((i) => i.baseUom === r.code || i.altUoms?.some((u: any) => u.uom === r.code)).length || '—' },
    ],
    fields: [
      { key: 'code', label: 'Code', required: true, help: 'e.g. Nos, Kg, MT, Hr' },
      { key: 'name', label: 'Name', required: true },
      { key: 'decimals', label: 'Quantity decimals', type: 'number', decimals: 0, required: true, validate: (v) => (v >= 0 && v <= 6 ? null : '0 to 6 decimals') },
    ],
    blank: () => ({ code: '', name: '', decimals: 0, status: 'Active' }),
  };
  return <SimpleRegister cfg={cfg} />;
}

export function ReasonCodeRegister() {
  const cats: ReasonCode['category'][] = ['Return', 'Adjustment', 'Reversal', 'Period', 'Credit', 'Rejection', 'Other'];
  const cfg: SimpleMasterConfig<ReasonCode> = {
    collection: C.reasonCodes, entity: 'reasonCodes', objectType: 'Reason Code', title: 'Reason codes', permission: 'masters.reasoncodes', searchKeys: ['code', 'name', 'category'], dupFields: ['code', 'name'],
    filters: [{ key: 'category', label: 'Category', type: 'select', options: cats.map((c) => ({ value: c, label: c })) }],
    applyFilter: (r, f) => !f.category || r.category === f.category,
    columns: [
      { key: 'code', label: 'Code', sortable: true, render: (r) => <span className="identifier" style={{ fontWeight: 500 }}>{r.code}</span> },
      { key: 'name', label: 'Reason', sortable: true },
      { key: 'category', label: 'Category', sortable: true, render: (r) => <span className="pill pill-neutral">{r.category}</span> },
    ],
    fields: [
      { key: 'code', label: 'Code', required: true, uppercase: true },
      { key: 'category', label: 'Category', type: 'select', options: cats, required: true, help: 'Reversal / Period reasons appear in confirmation dialogs' },
      { key: 'name', label: 'Reason text', required: true, span: 2 },
    ],
    blank: () => ({ code: '', name: '', category: 'Adjustment', status: 'Active' }),
  };
  return <SimpleRegister cfg={cfg} />;
}

export function SalespersonRegister() {
  const cfg: SimpleMasterConfig<Salesperson> = {
    collection: C.salespersons, entity: 'salespersons', objectType: 'Salesperson', title: 'Salespersons', permission: 'masters.salespersons', searchKeys: ['code', 'name'], dupFields: ['code', 'name', 'employeeId'],
    columns: [
      { key: 'name', label: 'Salesperson', sortable: true, render: (r) => <span><strong>{r.name}</strong> <span className="identifier" style={{ color: '#5F6368', marginLeft: 6 }}>{r.code}</span></span> },
      { key: 'employee', label: 'Employee', render: (r) => db.find<any>(C.employees, r.employeeId)?.name ?? <span style={{ color: '#5F6368' }}>External</span> },
      { key: 'target', label: 'Annual target', align: 'right', render: (r) => (r.target ? <Money value={r.target} /> : '—'), value: (r) => r.target },
      { key: 'customers', label: 'Customers', align: 'right', render: (r) => db.get<any>(C.customers).filter((c) => c.salespersonId === r.id).length || '—' },
    ],
    fields: [
      { key: 'code', label: 'Code', required: true, uppercase: true },
      { key: 'name', label: 'Name', required: true },
      { key: 'employeeId', label: 'Linked employee', type: 'employee', help: 'Optional — for commission and payroll linkage' },
      { key: 'target', label: 'Annual target', type: 'money' },
    ],
    blank: (rows) => ({ code: nextCode(rows, 'SP-', 2), name: '', status: 'Active' }),
    extraRowActions: (r) => [{ label: 'Customers', onClick: () => nav.go('masters/customers') }],
  };
  return <SimpleRegister cfg={cfg} />;
}

export function HsnRegister() {
  const taxRates = db.get<TaxRate>(C.taxRates).filter((t) => t.status === 'Active');
  const cfg: SimpleMasterConfig<HsnCode & { status?: string }> = {
    collection: C.hsnCodes, entity: 'hsnCodes', objectType: 'HSN / SAC Code', title: 'HSN / SAC codes', permission: 'masters.hsn', searchKeys: ['code', 'description'], dupFields: ['code'], noStatus: true, companyScoped: false,
    subtitle: (rows) => `${rows.filter((r) => r.type === 'HSN').length} HSN (goods) · ${rows.filter((r) => r.type === 'SAC').length} SAC (services)`,
    filters: [{ key: 'type', label: 'Type', type: 'select', options: [{ value: 'HSN', label: 'HSN (goods)' }, { value: 'SAC', label: 'SAC (services)' }] }],
    applyFilter: (r, f) => !f.type || r.type === f.type,
    columns: [
      { key: 'code', label: 'Code', sortable: true, render: (r) => <span className="identifier" style={{ fontWeight: 500 }}>{r.code}</span> },
      { key: 'description', label: 'Description', sortable: true },
      { key: 'type', label: 'Type', render: (r) => <span className="pill pill-neutral">{r.type}</span> },
      { key: 'tax', label: 'Default tax', render: (r) => taxRates.find((t) => t.id === r.defaultTaxRateId)?.name ?? '—' },
      { key: 'items', label: 'Items', align: 'right', render: (r) => db.get<any>(C.items).filter((i) => i.hsn === r.code).length || '—' },
    ],
    fields: [
      { key: 'code', label: 'Code', required: true, validate: (v) => (/^\d{4,8}$/.test(v) ? null : 'HSN is 4–8 digits; SAC is 6 digits') },
      { key: 'type', label: 'Type', type: 'select', options: ['HSN', 'SAC'], required: true },
      { key: 'description', label: 'Description', required: true, span: 2 },
      { key: 'defaultTaxRateId', label: 'Default tax rate', type: 'select', options: taxRates.map((t) => ({ value: t.id, label: t.name })), help: 'Applied to new items that pick this code' },
    ],
    blank: () => ({ code: '', description: '', type: 'HSN' }),
    label: (r) => r.code,
  };
  return <SimpleRegister cfg={cfg} />;
}

export function TdsRegister() {
  const cfg: SimpleMasterConfig<TdsSection> = {
    collection: C.tdsSections, entity: 'tdsSections', objectType: 'TDS / TCS Section', title: 'TDS / TCS sections', permission: 'masters.tds', searchKeys: ['section', 'description'], dupFields: ['section'], label: (r) => r.section, drawerWidth: 680,
    subtitle: (rows) => `${rows.filter((r) => r.kind === 'TDS').length} TDS · ${rows.filter((r) => r.kind === 'TCS').length} TCS · FR-TDS-001`,
    extraTabs: [{ id: 'tds', label: 'TDS', filter: (r) => r.kind === 'TDS' }, { id: 'tcs', label: 'TCS', filter: (r) => r.kind === 'TCS' }],
    columns: [
      { key: 'section', label: 'Section', sortable: true, render: (r) => <span><span className="identifier" style={{ fontWeight: 600 }}>{r.section}</span> <span className="pill pill-neutral" style={{ marginLeft: 6 }}>{r.kind}</span></span> },
      { key: 'description', label: 'Nature of payment' },
      { key: 'rate', label: 'Rate', align: 'right', render: (r) => `${r.rate}%` },
      { key: 'ratePanMissing', label: 'No PAN', align: 'right', render: (r) => `${r.ratePanMissing}%` },
      { key: 'thresholdPerTxn', label: 'Threshold / txn', align: 'right', render: (r) => (r.thresholdPerTxn ? <Money value={r.thresholdPerTxn} /> : '—') },
      { key: 'thresholdAnnual', label: 'Annual', align: 'right', render: (r) => (r.thresholdAnnual ? <Money value={r.thresholdAnnual} /> : '—') },
      { key: 'basis', label: 'Basis' },
      { key: 'applicability', label: 'Applies to' },
      { key: 'account', label: 'Account', render: (r) => { const a = db.find<any>(C.accounts, r.accountId); return a ? <span className="identifier">{a.code}</span> : '—'; } },
    ],
    fields: [
      { key: 'section', label: 'Section', required: true, help: 'e.g. 194C, 194J, 206C(1H)' },
      { key: 'kind', label: 'Kind', type: 'select', options: ['TDS', 'TCS'], required: true },
      { key: 'description', label: 'Nature of payment', required: true, span: 2 },
      { key: 'rate', label: 'Rate %', type: 'percent', required: true },
      { key: 'ratePanMissing', label: 'Rate when PAN missing %', type: 'percent', required: true, help: 'Section 206AA — typically 20%' },
      { key: 'thresholdPerTxn', label: 'Threshold per transaction', type: 'money' },
      { key: 'thresholdAnnual', label: 'Annual threshold', type: 'money' },
      { key: 'basis', label: 'Deduct on', type: 'select', options: ['Payment', 'Invoice', 'Earlier'], required: true, help: 'Earlier of invoice booking or payment' },
      { key: 'applicability', label: 'Applies to', type: 'select', options: ['Supplier', 'Customer', 'Employee', 'Any'], required: true },
      { key: 'accountId', label: 'Payable / receivable account', type: 'account', accountFilter: (a) => a.type === 'Liability' || a.type === 'Asset', span: 2 },
    ],
    blank: () => ({ section: '', description: '', rate: 0, ratePanMissing: 20, thresholdPerTxn: 0, thresholdAnnual: 0, basis: 'Earlier', applicability: 'Supplier', kind: 'TDS', status: 'Active' }),
  };
  return <SimpleRegister cfg={cfg} />;
}

export function CurrencyRegister() {
  const cfg: SimpleMasterConfig<Currency> = {
    collection: C.currencies, entity: 'currencies', objectType: 'Currency', title: 'Currencies', permission: 'masters.currencies', searchKeys: ['code', 'name'], dupFields: ['code'], label: (r) => r.code, companyScoped: false,
    subtitle: (rows) => `${rows.filter((r) => r.status === 'Active').length} active · FR-FX-001 · precision and rounding drive every money field`,
    columns: [
      { key: 'code', label: 'Code', sortable: true, render: (r) => <span className="identifier" style={{ fontWeight: 600 }}>{r.code}</span> },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'symbol', label: 'Symbol' },
      { key: 'minorUnits', label: 'Minor units', align: 'right' },
      { key: 'roundingIncrement', label: 'Rounding', align: 'right', render: (r) => `${r.roundingIncrement} · ${r.roundingMode}` },
      { key: 'rates', label: 'Rates', align: 'right', render: (r) => db.get<any>(C.exchangeRates).filter((x) => x.base === r.code || x.quote === r.code).length || '—' },
    ],
    fields: [
      { key: 'code', label: 'ISO code', required: true, uppercase: true, validate: (v) => (/^[A-Z]{3}$/.test(v) ? null : 'ISO 4217 code is 3 letters') },
      { key: 'name', label: 'Name', required: true },
      { key: 'symbol', label: 'Display symbol', required: true },
      { key: 'minorUnits', label: 'Minor units (decimals)', type: 'number', decimals: 0, required: true, validate: (v) => (v >= 0 && v <= 4 ? null : '0–4') },
      { key: 'roundingIncrement', label: 'Rounding increment', type: 'number', decimals: 4, required: true, validate: (v) => (v > 0 ? null : 'Must be positive') },
      { key: 'roundingMode', label: 'Rounding mode', type: 'select', options: ['HalfUp', 'HalfEven', 'Down'], required: true },
    ],
    blank: () => ({ code: '', name: '', symbol: '', minorUnits: 2, roundingIncrement: 0.01, roundingMode: 'HalfUp', status: 'Active' }),
    extraRowActions: (r) => [{ label: 'Exchange rates', onClick: () => nav.go(`masters/exchange-rates?currency=${r.code}`) }],
  };
  return <SimpleRegister cfg={cfg} />;
}

export function ReferencePage() {
  const s = useSession();
  const countries = useCollection<any>(C.countries);
  const currencies = useCollection<Currency>(C.currencies);
  const [tab, setTab] = useState<'countries' | 'states' | 'currencies'>('countries');
  return (
    <div className="page">
      <PageHeader title="Countries, states & currencies" subtitle="Read-only reference data supplied by the localization pack — edit currencies under Finance › Currencies" />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'countries', label: 'Countries', count: countries.length }, { id: 'states', label: 'Indian states (GST codes)', count: INDIA_STATES.length }, { id: 'currencies', label: 'Currencies', count: currencies.length }]} variant="filter" />
      {tab === 'countries' && <DataTable rows={countries} dense columns={[{ key: 'code', label: 'ISO', render: (r) => <span className="identifier" style={{ fontWeight: 600 }}>{r.code}</span> }, { key: 'name', label: 'Country' }, { key: 'currency', label: 'Currency', render: (r) => <span className="currency-tag">{r.currency}</span> }, { key: 'pack', label: 'Localization pack', render: (r) => { const p = db.get<any>(C.localizationPacks).find((x) => x.country === r.code && x.status === 'Approved'); return p ? <span>{p.name} v{p.packVersion} <Badge status="Approved" /></span> : <span style={{ color: '#5F6368' }}>Generic</span>; } }, { key: 'used', label: 'Companies', render: (r) => db.get<any>(C.companies).filter((c) => c.country === r.code).map((c) => c.tradeName).join(', ') || '—' }]} />}
      {tab === 'states' && <DataTable rows={INDIA_STATES.map((x) => ({ id: x.code, ...x }))} dense columns={[{ key: 'code', label: 'GST state code', render: (r) => <span className="identifier" style={{ fontWeight: 600 }}>{r.code}</span> }, { key: 'name', label: 'State / UT' }, { key: 'parties', label: 'Customers · suppliers', render: (r) => { const c = db.get<any>(C.customers).filter((x) => x.gstin?.startsWith(r.code)).length; const sp = db.get<any>(C.suppliers).filter((x) => x.gstin?.startsWith(r.code)).length; return c || sp ? `${c} · ${sp}` : '—'; } }, { key: 'seller', label: 'Our registration', render: (r) => (s.company?.registrations.some((g) => g.stateCode === r.code) ? <Badge status="Active">Registered</Badge> : '—') }]} />}
      {tab === 'currencies' && <DataTable rows={currencies} dense onRowClick={() => nav.go('masters/currencies')} columns={[{ key: 'code', label: 'Code', render: (r) => <span className="identifier" style={{ fontWeight: 600 }}>{r.code}</span> }, { key: 'name', label: 'Name' }, { key: 'symbol', label: 'Symbol' }, { key: 'minorUnits', label: 'Minor units', align: 'right' }, { key: 'roundingMode', label: 'Rounding' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> }]} />}
    </div>
  );
}
