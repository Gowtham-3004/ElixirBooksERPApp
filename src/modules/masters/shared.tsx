// Shared helpers for master registers: code generation, duplicate rules (FR-MDM-004),
// audited saves with before/after (FR-MDM-005), reference counting (FR-MDM-001),
// change-history tab, simple form state, and status tabs.
import { useMemo, useState, type ReactNode } from 'react';
import { db, C, engine, useCollection, useDb, useSession } from '../../store';
import type { AuditEvent, BaseRecord, Company } from '../../store';
import { Badge, Banner, Button, CheckboxField, ChipGroup, Drawer, EmptyState, SelectField } from '../../components/ui';
import type { MenuAction } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';
import type { AccountingSettings } from '../accounting/types';

// ── Form state ─────────────────────────────────────────────────────────────

export function useForm<T extends object>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const [errors, setErrorsRaw] = useState<Record<string, string>>({});
  const set = <K extends keyof T>(k: K, val: T[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    setErrorsRaw((e) => { if (!e[k as string]) return e; const n = { ...e }; delete n[k as string]; return n; });
  };
  const patch = (p: Partial<T>) => setV((prev) => ({ ...prev, ...p }));
  const reset = (t: T) => { setV(t); setErrorsRaw({}); };
  const setErrors = (e: Record<string, string>) => setErrorsRaw(e);
  return { v, set, patch, errors, setErrors, reset };
}

export function ErrorSummary({ errors }: { errors: Record<string, string> }) {
  const n = Object.keys(errors).length;
  if (!n) return null;
  return <Banner tone="danger">{n === 1 ? '1 field needs attention' : `${n} fields need attention`}: {Object.values(errors).slice(0, 3).join(' · ')}</Banner>;
}

// ── Codes ──────────────────────────────────────────────────────────────────

/** Next code like C-0013 from existing rows with the same prefix. */
export function nextCode(rows: { code?: string }[], prefix: string, pad = 4): string {
  let max = 0;
  rows.forEach((r) => {
    const m = r.code?.match(new RegExp(`^${prefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

// ── Duplicate rules (FR-MDM-004) ───────────────────────────────────────────

export interface DupRule { fields: string[]; mode: 'Block' | 'Warn' }

const DEFAULT_RULES: Record<string, DupRule> = {
  customers: { fields: ['gstin', 'name'], mode: 'Block' },
  suppliers: { fields: ['gstin', 'name'], mode: 'Block' },
  employees: { fields: ['pan', 'code'], mode: 'Block' },
  items: { fields: ['code', 'name'], mode: 'Block' },
  warehouses: { fields: ['code'], mode: 'Block' },
  priceLists: { fields: ['code'], mode: 'Block' },
  hsnCodes: { fields: ['code'], mode: 'Block' },
  accounts: { fields: ['code'], mode: 'Block' },
  dimensions: { fields: ['code'], mode: 'Block' },
  taxRates: { fields: ['code'], mode: 'Block' },
  tdsSections: { fields: ['section'], mode: 'Block' },
  currencies: { fields: ['code'], mode: 'Block' },
  paymentTerms: { fields: ['code'], mode: 'Block' },
  uoms: { fields: ['code'], mode: 'Block' },
  reasonCodes: { fields: ['code'], mode: 'Block' },
  salespersons: { fields: ['code'], mode: 'Warn' },
};

export function useDuplicateRule(entity: string): DupRule {
  const s = useSession();
  const cfg = (s.company?.defaults as AccountingSettings | undefined)?.duplicateRules?.[entity];
  return cfg ?? DEFAULT_RULES[entity] ?? { fields: ['code'], mode: 'Block' };
}

export function duplicateRule(entity: string): DupRule {
  const co = engine.ctx().company;
  return (co?.defaults as AccountingSettings | undefined)?.duplicateRules?.[entity] ?? DEFAULT_RULES[entity] ?? { fields: ['code'], mode: 'Block' };
}

export interface DupHit { field: string; value: string; match: any; mode: 'Block' | 'Warn' }

export function findDuplicates(entity: string, rows: any[], values: Record<string, any>, excludeId?: string): DupHit[] {
  const rule = duplicateRule(entity);
  const hits: DupHit[] = [];
  rule.fields.forEach((f) => {
    const v = String(values[f] ?? '').trim().toLowerCase();
    if (!v) return;
    const m = rows.find((r) => r.id !== excludeId && String(r[f] ?? '').trim().toLowerCase() === v);
    if (m) hits.push({ field: f, value: String(values[f]), match: m, mode: rule.mode });
  });
  return hits;
}

export function DuplicateBanner({ hits, acknowledged, onAcknowledge, labelOf }: { hits: DupHit[]; acknowledged: boolean; onAcknowledge: (v: boolean) => void; labelOf?: (r: any) => string }) {
  if (!hits.length) return null;
  const blocking = hits.some((h) => h.mode === 'Block');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Banner tone={blocking ? 'danger' : 'warning'}>
        {blocking ? 'Duplicate blocked: ' : 'Possible duplicate: '}
        {hits.map((h) => `${h.field.toUpperCase()} "${h.value}" already exists on ${labelOf ? labelOf(h.match) : h.match.name ?? h.match.code}`).join(' · ')}
        {blocking ? ' — change the value or adjust the duplicate rules for this register.' : ''}
      </Banner>
      {!blocking && <CheckboxField checked={acknowledged} onChange={onAcknowledge} label="I have checked and this is not a duplicate — save anyway" />}
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = { gstin: 'GSTIN', pan: 'PAN', name: 'Name', code: 'Code', email: 'Email', phone: 'Phone', section: 'Section', barcode: 'Barcode', hsn: 'HSN/SAC', ifsc: 'IFSC' };

export function DuplicateRulesDrawer({ open, onClose, entity, entityLabel, candidateFields }: { open: boolean; onClose: () => void; entity: string; entityLabel: string; candidateFields: string[] }) {
  const s = useSession();
  const current = useDuplicateRule(entity);
  const [fields, setFields] = useState<string[]>(current.fields);
  const [mode, setMode] = useState<'Block' | 'Warn'>(current.mode);
  const save = () => {
    const co = s.company;
    if (!co) return;
    const defaults = co.defaults as Company['defaults'] & AccountingSettings;
    const rules = { ...(defaults.duplicateRules ?? {}), [entity]: { fields, mode } };
    db.update<Company>(C.companies, co.id, { defaults: { ...defaults, duplicateRules: rules } as Company['defaults'] });
    engine.audit({ action: 'master.duplicate_rules', objectType: entityLabel, detail: `${mode} on ${fields.join(', ')}`, before: { ...current }, after: { fields, mode } });
    onClose();
  };
  return (
    <Drawer open={open} onClose={onClose} title={`Duplicate rules — ${entityLabel}`} subtitle="FR-MDM-004 · applies on every create, edit and import" width={520}
      footer={<><Button variant="ghost" onClick={onClose}>Keep current rules</Button><Button variant="primary" onClick={save} disabled={!fields.length}>Save duplicate rules</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <ChipGroup label="Fields that must be unique" multiple value={fields} onChange={setFields} options={candidateFields.map((f) => ({ value: f, label: FIELD_LABELS[f] ?? f }))} />
        <SelectField label="When a duplicate is found" value={mode} onChange={setMode} options={[{ value: 'Block', label: 'Block — the record cannot be saved' }, { value: 'Warn', label: 'Warn — user must acknowledge before saving' }]} />
        <div className="banner info">Matching is case-insensitive on trimmed values. Imports skip duplicate rows automatically and list them in the import log.</div>
      </div>
    </Drawer>
  );
}

// ── Audited save (FR-MDM-005) ──────────────────────────────────────────────

function diff(before: any, after: any): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {}, a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  keys.forEach((k) => {
    if (['updatedAt', 'updatedBy', 'version', 'createdAt', 'createdBy', 'id', 'companyId'].includes(k)) return;
    const vb = JSON.stringify(before?.[k] ?? null), va = JSON.stringify(after?.[k] ?? null);
    if (vb !== va) { b[k] = before?.[k]; a[k] = after?.[k]; }
  });
  return { before: b, after: a };
}

const SENSITIVE = ['accountNumber', 'bankDetail', 'bankDetails', 'pan', 'uan', 'esiNumber'];

/** Insert or update a master row with an audit event carrying before/after. Returns the saved row. */
export function saveMaster<T extends BaseRecord>(collection: string, objectType: string, values: Partial<T> & Record<string, any>, id?: string, opts: { expectedVersion?: number; label?: (r: T) => string } = {}): T {
  const label = opts.label ?? ((r: any) => r.code ?? r.name ?? r.id);
  if (id) {
    const before = db.find<T>(collection, id);
    const after = db.update<T>(collection, id, values as Partial<T>, { expectedVersion: opts.expectedVersion });
    const d = diff(before, after);
    engine.audit({ action: `${objectType.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.updated`, objectType, objectId: id, objectNumber: label(after), detail: Object.keys(d.after).length ? `Changed ${Object.keys(d.after).join(', ')}` : 'No field changes', before: d.before, after: d.after, sensitive: Object.keys(d.after).some((k) => SENSITIVE.includes(k)) });
    return after;
  }
  const row = db.insert<T>(collection, values as any);
  engine.audit({ action: `${objectType.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.created`, objectType, objectId: row.id, objectNumber: label(row), detail: `Created ${label(row)}`, after: diff({}, row).after });
  return row;
}

export function setStatus<T extends BaseRecord & { status: string }>(collection: string, objectType: string, id: string, status: string, reason?: string) {
  const before = db.find<T>(collection, id);
  if (!before || before.status === status) return before;
  const after = db.update<T>(collection, id, { status } as Partial<T>);
  engine.audit({ action: `${objectType.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${status.toLowerCase()}`, objectType, objectId: id, objectNumber: (after as any).code ?? (after as any).name, detail: reason ?? `Status ${before.status} → ${status}`, before: { status: before.status }, after: { status } });
  return after;
}

// ── References (FR-MDM-001) ────────────────────────────────────────────────

const DOC_COLLECTIONS = [
  C.quotations, C.salesOrders, C.deliveries, C.salesInvoices, C.creditNotes, C.salesReturns, C.receipts, C.leads, C.crmActivities,
  C.requisitions, C.rfqs, C.supplierQuotes, C.purchaseOrders, C.grns, C.vendorInvoices, C.debitNotes, C.purchaseReturns, C.payments, C.paymentBatches,
  C.journals, C.openItems, C.stockMovements, C.reservations, C.stockAdjustments, C.stockTransfers, C.stockCounts, C.bankVouchers, C.bankAccounts,
  C.posBills, C.posReturns, C.payrollRuns, C.payslips, C.expenseClaims, C.assets, C.projects, C.contracts, C.timesheets, C.productionOrders, C.boms,
  C.priceListEntries, C.items, C.customers, C.suppliers, C.employees, C.salaryStructures, C.loans, C.budgets, C.recurringJournals,
];

const COLLECTION_LABEL: Record<string, string> = {
  quotations: 'quotations', salesOrders: 'sales orders', deliveries: 'deliveries', salesInvoices: 'sales invoices', creditNotes: 'credit notes', salesReturns: 'sales returns', receipts: 'receipts',
  requisitions: 'requisitions', purchaseOrders: 'purchase orders', grns: 'GRNs', vendorInvoices: 'vendor invoices', debitNotes: 'debit notes', payments: 'payments', journals: 'journals', openItems: 'open items',
  stockMovements: 'stock movements', priceListEntries: 'price list entries', items: 'items', customers: 'customers', suppliers: 'suppliers', employees: 'employees', bankAccounts: 'bank accounts', assets: 'assets', projects: 'projects', payslips: 'payslips',
};

/** Count documents that reference this master id (deep search). */
export function useReferences(id: string | undefined, selfCollection?: string): { count: number; detail: string; byCollection: Record<string, number> } {
  const snap = useDb();
  return useMemo(() => {
    const by: Record<string, number> = {};
    if (!id) return { count: 0, detail: '', byCollection: by };
    let count = 0;
    DOC_COLLECTIONS.forEach((col) => {
      if (col === selfCollection) return;
      const rows = snap[col] ?? [];
      const n = rows.filter((r) => r.id !== id && JSON.stringify(r).includes(`"${id}"`)).length;
      if (n) { by[col] = n; count += n; }
    });
    const detail = Object.entries(by).map(([k, n]) => `${n} ${COLLECTION_LABEL[k] ?? k}`).join(', ');
    return { count, detail, byCollection: by };
  }, [snap, id, selfCollection]);
}

export function referenceCount(id: string, selfCollection?: string): number {
  let count = 0;
  DOC_COLLECTIONS.forEach((col) => {
    if (col === selfCollection) return;
    count += db.get(col).filter((r) => r.id !== id && JSON.stringify(r).includes(`"${id}"`)).length;
  });
  return count;
}

// ── Change history tab (FR-MDM-005) ────────────────────────────────────────

export function ChangeHistory({ objectId }: { objectId: string }) {
  const events = useCollection<AuditEvent>(C.audit);
  const mine = events.filter((e) => e.objectId === objectId).sort((a, b) => b.at.localeCompare(a.at));
  if (!mine.length) return <EmptyState compact title="No changes recorded" description="Every create, edit, activation and approval on this record appears here with before/after values." />;
  const fmt = (v: unknown) => (v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 80) : String(v));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mine.map((e) => {
        const keys = Object.keys(e.after ?? {});
        return (
          <div key={e.id} className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}><strong>{e.action.split('.').pop()?.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}</strong> <span style={{ color: '#5F6368' }}>by {e.actor} · {e.channel}</span>{e.sensitive && <Badge status="Returned" style={{ marginLeft: 8 }}>sensitive</Badge>}</div>
              <span style={{ fontSize: 12, color: '#6E6E71', whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</span>
            </div>
            {e.detail && <div style={{ fontSize: 12, color: '#3C4043', marginTop: 4 }}>{e.detail}</div>}
            {keys.length > 0 && (
              <table className="data-table dense" style={{ marginTop: 8 }}>
                <thead><tr><th style={{ width: 160 }}>Field</th><th>Before</th><th>After</th></tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k}><td className="identifier">{k}</td><td style={{ color: '#8A4B0F' }}>{e.sensitive && SENSITIVE.includes(k) ? '•••• (masked)' : fmt(e.before?.[k])}</td><td style={{ color: '#12784E' }}>{e.sensitive && SENSITIVE.includes(k) ? '•••• (masked)' : fmt(e.after?.[k])}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
            <div style={{ fontSize: 11, color: '#B0B5BF', marginTop: 6 }}>Correlation {e.correlationId}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Status tabs & bulk actions ─────────────────────────────────────────────

export function statusTabs<T extends { status: string }>(extra: { id: string; label: string; filter: (r: T) => boolean }[] = []) {
  return [
    { id: 'active', label: 'Active', filter: (r: T) => r.status === 'Active' },
    { id: 'inactive', label: 'Inactive', filter: (r: T) => r.status !== 'Active' },
    ...extra,
    { id: 'all', label: 'All', filter: () => true },
  ];
}

export function bulkStatusActions(collection: string, objectType: string, ids: Set<string>, rows: any[], canEdit: boolean, extra: MenuAction[] = []): MenuAction[] {
  const reason = canEdit ? undefined : `Requires ${objectType} edit permission`;
  return [
    { label: 'Activate', onClick: () => db.transaction(() => rows.forEach((r) => setStatus(collection, objectType, r.id, 'Active', 'Bulk activate'))), disabled: !canEdit || rows.every((r) => r.status === 'Active'), reason },
    { label: 'Deactivate', onClick: () => db.transaction(() => rows.forEach((r) => setStatus(collection, objectType, r.id, 'Inactive', 'Bulk deactivate'))), disabled: !canEdit || rows.every((r) => r.status === 'Inactive'), reason },
    ...extra,
  ];
}

/** Row action list shared by every register: edit / activate / deactivate / delete (blocked when referenced). */
export function masterRowActions(opts: { collection: string; objectType: string; row: any; canEdit: boolean; onEdit: () => void; onView?: () => void; extra?: MenuAction[]; onDelete?: () => void }): MenuAction[] {
  const { collection, objectType, row, canEdit, onEdit, onView, extra = [] } = opts;
  const refs = referenceCount(row.id, collection);
  const reason = canEdit ? undefined : `Requires ${objectType.toLowerCase()} edit permission`;
  const actions: MenuAction[] = [];
  if (onView) actions.push({ label: 'Open', onClick: onView });
  actions.push({ label: 'Edit', onClick: onEdit, disabled: !canEdit, reason });
  if (row.status === 'Active') actions.push({ label: 'Deactivate', onClick: () => setStatus(collection, objectType, row.id, 'Inactive'), disabled: !canEdit, reason });
  else actions.push({ label: 'Activate', onClick: () => setStatus(collection, objectType, row.id, 'Active'), disabled: !canEdit, reason });
  actions.push(...extra);
  actions.push({ label: 'Delete', danger: true, separator: true, onClick: opts.onDelete ?? (() => { db.remove(collection, row.id); engine.audit({ action: `${objectType.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.deleted`, objectType, objectId: row.id, objectNumber: row.code ?? row.name, before: row }); }), disabled: !canEdit || refs > 0, reason: refs > 0 ? `Used in ${refs} document${refs === 1 ? '' : 's'} — deactivate instead` : reason });
  return actions;
}

/** Standard header pill: "used in N documents". */
export function UsagePill({ id, collection }: { id: string; collection: string }) {
  const refs = useReferences(id, collection);
  return <span className="pill pill-neutral" title={refs.detail}>{refs.count ? `Used in ${refs.count} document${refs.count === 1 ? '' : 's'}` : 'Not used yet'}</span>;
}

export function DrawerFooter({ onCancel, onSave, saveLabel, saving, disabled, reason, left }: { onCancel: () => void; onSave: () => void; saveLabel: string; saving?: boolean; disabled?: boolean; reason?: string; left?: ReactNode }) {
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{left ?? <Button variant="ghost" onClick={onCancel}>Discard changes</Button>}</div>
      <Button variant="primary" onClick={onSave} loading={saving} disabled={disabled} reason={reason}>{saveLabel}</Button>
    </>
  );
}

export function useCan(perm: string) {
  const s = useSession();
  return s.can(perm);
}
