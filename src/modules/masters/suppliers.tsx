// Suppliers register + form (FR-PTY-002/005). Bank-detail changes go through approval.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { ApprovalRequest, BankDetail, Supplier, TdsSection, Currency, PaymentTerm } from '../../store';
import { Badge, Button, Drawer, EntityPicker, IdentifierField, ImportWizard, MaskedValue, RegisterPage, SelectField, TextArea, TextField, TwoLine, Money, useAccountOptions, useToast } from '../../components/ui';
import { stateNameOf, validateGSTIN, validatePAN, validateEmail, validateIFSC, uid } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, nextCode, saveMaster, statusTabs, useForm } from './shared';
import { AddressesEditor, ContactsEditor } from './partyShared';
import { partyState } from './customers';
import { supplierImport } from './importDefs';

const TREATMENTS: Supplier['taxTreatment'][] = ['Registered', 'Unregistered', 'Composition', 'SEZ', 'Export', 'Overseas', 'Deemed Export'];
const SUPPLIER_GROUPS = ['Raw Material', 'Consumables', 'Packaging', 'Hardware', 'Services', 'Capital Goods', 'Utilities', 'Other'];

/** Supplier status can be clobbered by generic workflow completion; normalise for display and repair bank-detail states. */
export function normaliseSupplierStatus(st: string): Supplier['status'] {
  return st === 'Active' || st === 'Inactive' || st === 'Blocked' ? st : 'Active';
}

export function useSyncBankApprovals() {
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const suppliers = useCollection<Supplier>(C.suppliers);
  useEffect(() => {
    const done = approvals.filter((a) => a.docType === 'Supplier Bank Detail' && (a.status === 'Approved' || a.status === 'Rejected'));
    db.transaction(() => {
      suppliers.forEach((sup) => {
        let changed = false;
        const bankDetails = sup.bankDetails.map((b) => {
          if (b.status !== 'Pending Approval') return b;
          const req = done.find((a) => a.docId === sup.id && (a.summary ?? '').includes(b.id));
          if (!req) return b;
          changed = true;
          const step = [...req.steps].reverse().find((st) => st.actedBy);
          return { ...b, status: req.status === 'Approved' ? 'Approved' as const : 'Rejected' as const, approvedBy: step?.actedBy, approvedAt: step?.actedAt ?? req.completedAt };
        });
        const status = normaliseSupplierStatus(sup.status);
        if (changed || status !== sup.status) {
          db.update<Supplier>(C.suppliers, sup.id, { bankDetails, status });
          if (changed) engine.audit({ action: 'supplier.bank_detail_resolved', objectType: 'Supplier', objectId: sup.id, objectNumber: sup.code, detail: 'Bank detail approval outcome applied', sensitive: true });
        }
      });
    });
  }, [approvals, suppliers]);
}

export function SupplierRegister() {
  const s = useSession();
  useSyncBankApprovals();
  const rows = useCollection<Supplier>(C.suppliers).filter((c) => c.companyId === s.state.companyId);
  const openItems = useCollection<any>(C.openItems);
  const [editing, setEditing] = useState<Supplier | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const [imp, setImp] = useState(false);
  const canEdit = s.can('masters.suppliers.edit') || s.can('masters.suppliers.create');
  const payable = (id: string) => openItems.filter((o) => o.partyType === 'Supplier' && o.partyId === id && o.status !== 'Settled' && o.status !== 'Written Off').reduce((sum, o) => sum + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0);
  return (
    <>
      <RegisterPage<Supplier>
        title="Suppliers"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${rows.filter((r) => r.msmeNumber).length} MSME · ${s.company?.tradeName}`}
        entity="suppliers"
        rows={rows}
        searchKeys={['name', 'code', 'gstin', 'email', 'msmeNumber']}
        searchPlaceholder="Name, GSTIN, Udyam…"
        tabs={statusTabs<Supplier>([{ id: 'msme', label: 'MSME', filter: (r) => !!r.msmeNumber }, { id: 'pending-bank', label: 'Bank pending', filter: (r) => r.bankDetails.some((b) => b.status === 'Pending Approval') }])}
        filters={[{ key: 'group', label: 'Group', type: 'select', options: Array.from(new Set(rows.map((r) => r.group).filter(Boolean))).map((g) => ({ value: g!, label: g! })) }, { key: 'taxTreatment', label: 'Tax treatment', type: 'select', options: TREATMENTS.map((t) => ({ value: t, label: t })) }, { key: 'state', label: 'State', type: 'text' }]}
        applyFilter={(r, f) => (!f.group || r.group === f.group) && (!f.taxTreatment || r.taxTreatment === f.taxTreatment) && (!f.state || partyState(r).toLowerCase().includes(String(f.state).toLowerCase()))}
        primaryAction={{ label: 'New supplier', onClick: () => setEditing('new'), disabled: !s.can('masters.suppliers.create'), reason: s.can('masters.suppliers.create') ? undefined : 'Requires supplier create permission' }}
        importAction={() => setImp(true)}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        onRowClick={(r) => nav.go(`masters/suppliers/${r.id}`)}
        rowActions={(r) => masterRowActions({ collection: C.suppliers, objectType: 'Supplier', row: r, canEdit, onView: () => nav.go(`masters/suppliers/${r.id}`), onEdit: () => setEditing(r), extra: [{ label: 'Supplier ledger', onClick: () => nav.go(`accounting/supplier-ledger?party=${r.id}`) }] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.suppliers, 'Supplier', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Supplier', sortable: true, render: (r) => <TwoLine primary={r.displayName || r.name} secondary={r.gstin ?? r.code} mono />, value: (r) => r.name },
          { key: 'group', label: 'Group', render: (r) => <span style={{ color: 'var(--ink-3)' }}>{r.group ?? '—'}</span> },
          { key: 'state', label: 'State', render: (r) => partyState(r), value: (r) => partyState(r) },
          { key: 'purchaseTerms', label: 'Terms', render: (r) => <span style={{ color: 'var(--ink-3)' }}>{r.purchaseTerms}</span> },
          { key: 'tds', label: 'TDS', render: (r) => { const t = db.find<TdsSection>(C.tdsSections, r.tdsSectionId); return t ? <span className="identifier">{t.section}</span> : '—'; } },
          { key: 'bank', label: 'Bank', render: (r) => { const p = r.bankDetails.filter((b) => b.status === 'Pending Approval').length; const a = r.bankDetails.filter((b) => b.status === 'Approved').length; return <span style={{ display: 'inline-flex', gap: 4 }}>{a ? <Badge status="Approved">{a} approved</Badge> : null}{p ? <Badge status="Pending Approval">{p} pending</Badge> : null}{!a && !p ? '—' : null}</span>; } },
          { key: 'payable', label: 'Payable', align: 'right', sortable: true, render: (r) => <Money value={payable(r.id)} currency={s.currency} />, value: (r) => payable(r.id), total: (rs) => <Money value={rs.reduce((a, r) => a + payable(r.id), 0)} currency={s.currency} /> },
          { key: 'msme', label: 'MSME', render: (r) => (r.msmeNumber ? <span className="pill pill-good" title={r.msmeNumber}>MSME</span> : '—'), value: (r) => r.msmeNumber },
          { key: 'status', label: 'Status', render: (r) => <Badge status={normaliseSupplierStatus(r.status)} />, value: (r) => r.status },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <SupplierForm supplier={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={(c) => { setEditing(null); if (editing === 'new') nav.go(`masters/suppliers/${c.id}`); }} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="suppliers" entityLabel="Suppliers" candidateFields={['name', 'gstin', 'pan', 'code', 'email', 'phone']} />
      <ImportWizard open={imp} onClose={() => setImp(false)} {...supplierImport(rows)} />
    </>
  );
}

function blank(rows: Supplier[], defaults: any) {
  return { code: nextCode(rows, 'S-'), name: '', displayName: '', group: 'Raw Material', gstin: '', pan: '', taxTreatment: 'Registered', addresses: [], contacts: [], currency: 'INR', purchaseTerms: defaults?.paymentTerms ?? 'Net 30', payableAccountId: defaults?.payableAccountId, bankDetails: [], tdsSectionId: undefined, msmeNumber: '', status: 'Active', email: '', phone: '', notes: '' };
}

export function SupplierForm({ supplier, onClose, onSaved }: { supplier?: Supplier; onClose: () => void; onSaved: (c: Supplier) => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<Supplier>(C.suppliers).filter((c) => c.companyId === s.state.companyId);
  const f = useForm<any>(supplier ? { ...supplier } : blank(rows, s.company?.defaults));
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const tds = useCollection<TdsSection>(C.tdsSections).filter((t) => t.status === 'Active' && (t.applicability === 'Supplier' || t.applicability === 'Any'));
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active');
  const terms = useCollection<PaymentTerm>(C.paymentTerms).filter((t) => t.status === 'Active');
  const apAccounts = useAccountOptions((a) => a.isControl && a.controlType === 'AP');
  const dups = useMemo(() => findDuplicates('suppliers', rows, f.v, supplier?.id), [rows, f.v.name, f.v.gstin, f.v.pan, f.v.code, f.v.email, f.v.phone]);
  const blocked = dups.some((d) => d.mode === 'Block');
  useEffect(() => {
    const g: string = f.v.gstin ?? '';
    if (g.length === 15 && !validateGSTIN(g)) {
      const patch: any = {};
      if (!f.v.pan) patch.pan = g.slice(2, 12);
      const stateName = stateNameOf(g.slice(0, 2));
      if (stateName && !f.v.addresses.length) patch.addresses = [{ id: uid('adr'), purpose: 'Both', isDefault: true, address: { line1: '', city: '', state: stateName, stateCode: g.slice(0, 2), pin: '', country: 'IN' } }];
      if (Object.keys(patch).length) f.patch(patch);
    }
  }, [f.v.gstin]);
  const validate = () => {
    const e: Record<string, string> = {};
    if (!f.v.name?.trim()) e.name = 'Legal name is required';
    if (!f.v.code?.trim()) e.code = 'Code is required';
    if (f.v.gstin && validateGSTIN(f.v.gstin)) e.gstin = validateGSTIN(f.v.gstin)!;
    if (f.v.pan && validatePAN(f.v.pan)) e.pan = validatePAN(f.v.pan)!;
    if (f.v.email && validateEmail(f.v.email)) e.email = validateEmail(f.v.email)!;
    if (f.v.taxTreatment === 'Registered' && !f.v.gstin) e.gstin = 'GSTIN is required for a registered supplier';
    if (f.v.tdsSectionId && !f.v.pan) e.pan = 'PAN is required when a TDS section applies (else 20% applies)';
    if (f.v.addresses.some((a: any) => !a.address.line1 || !a.address.city)) e.addresses = 'Every address needs line 1 and city';
    f.setErrors(e);
    return !Object.keys(e).length;
  };
  const save = () => {
    if (saving || !validate() || blocked) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate to continue' }); return; }
    setSaving(true);
    try {
      const values = { ...f.v, name: f.v.name.trim(), displayName: f.v.displayName?.trim() || undefined, gstin: f.v.gstin || undefined, pan: f.v.pan || undefined, msmeNumber: f.v.msmeNumber || undefined };
      const saved = saveMaster<Supplier>(C.suppliers, 'Supplier', values, supplier?.id, { expectedVersion: supplier?.version });
      toast.success(supplier ? `${saved.name} updated` : `Supplier ${saved.code} created`);
      onSaved(saved);
    } catch (e: any) { toast.error(e?.message ?? 'Could not save supplier'); setSaving(false); }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  return (
    <Drawer open onClose={onClose} title={supplier ? `Edit ${supplier.name}` : 'New supplier'} subtitle={supplier ? `${supplier.code} · v${supplier.version}` : 'Supplier master · FR-PTY-002'} width={840}
      headerRight={supplier && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={supplier ? 'Save supplier' : 'Create supplier'} disabled={blocked} reason={blocked ? 'Duplicate blocked by register rules' : undefined} /> : undefined}>
      {tab === 'history' && supplier ? <ChangeHistory objectId={supplier.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
          <section>
            <div className="section-title">Identity</div>
            <div style={grid}>
              <TextField label="Legal name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
              <TextField label="Display name" value={f.v.displayName} onChange={(v) => f.set('displayName', v)} />
              <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} />
              <SelectField label="Group" value={f.v.group} onChange={(v) => f.set('group', v)} options={Array.from(new Set([...SUPPLIER_GROUPS, ...rows.map((r) => r.group).filter(Boolean) as string[]]))} />
              <IdentifierField kind="GSTIN" value={f.v.gstin} onChange={(v) => f.set('gstin', v)} help={f.errors.gstin} />
              <IdentifierField kind="PAN" value={f.v.pan} onChange={(v) => f.set('pan', v)} help={f.errors.pan} />
              <SelectField label="Tax treatment" value={f.v.taxTreatment} onChange={(v) => f.set('taxTreatment', v)} options={TREATMENTS} />
              <TextField label="MSME / Udyam number" value={f.v.msmeNumber} onChange={(v) => f.set('msmeNumber', v.toUpperCase())} help="MSME suppliers: 45-day payment rule applies (Section 43B(h))" />
              <TextField label="Email" value={f.v.email} onChange={(v) => f.set('email', v)} error={f.errors.email} type="email" />
              <TextField label="Phone" value={f.v.phone} onChange={(v) => f.set('phone', v)} />
              <SelectField label="Status" value={normaliseSupplierStatus(f.v.status)} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive', 'Blocked']} />
            </div>
          </section>
          <section><div className="section-title">Addresses</div><AddressesEditor value={f.v.addresses} onChange={(v) => f.set('addresses', v)} error={f.errors.addresses} /></section>
          <section><div className="section-title">Contacts</div><ContactsEditor value={f.v.contacts} onChange={(v) => f.set('contacts', v)} /></section>
          <section>
            <div className="section-title">Purchase terms</div>
            <div style={grid}>
              <SelectField label="Default currency" value={f.v.currency} onChange={(v) => f.set('currency', v)} options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
              <SelectField label="Purchase terms" value={f.v.purchaseTerms} onChange={(v) => f.set('purchaseTerms', v)} options={terms.map((t) => ({ value: t.name, label: `${t.name} (${t.days} days)` }))} />
              <EntityPicker label="Payable account" value={f.v.payableAccountId} onChange={(v) => f.set('payableAccountId', v)} options={apAccounts} help="AP control account for this supplier's open items" />
              <SelectField label="TDS section" value={f.v.tdsSectionId ?? ''} onChange={(v) => f.set('tdsSectionId', v || undefined)} options={tds.map((t) => ({ value: t.id, label: `${t.section} · ${t.description} (${t.rate}%${!f.v.pan ? `, ${t.ratePanMissing}% without PAN` : ''})` }))} allowEmpty placeholder="— Not applicable —" />
            </div>
          </section>
          {supplier && <div className="banner info">Bank details are managed from the supplier page — every addition or change needs Treasury approval (FR-PTY-005).</div>}
          <TextArea label="Notes" value={f.v.notes} onChange={(v) => f.set('notes', v)} rows={2} />
        </div>
      )}
    </Drawer>
  );
}

// ── Bank details (FR-PTY-005) ──────────────────────────────────────────────

export function BankDetailForm({ supplier, existing, onClose }: { supplier: Supplier; existing?: BankDetail; onClose: () => void }) {
  const toast = useToast();
  const f = useForm({ bankName: existing?.bankName ?? '', accountNumber: '', confirm: '', ifsc: existing?.ifsc ?? '', accountName: existing?.accountName ?? supplier.name, reason: '' });
  const [saving, setSaving] = useState(false);
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.bankName.trim()) e.bankName = 'Bank name is required';
    if (!/^\d{9,18}$/.test(f.v.accountNumber)) e.accountNumber = 'Account number must be 9–18 digits';
    if (f.v.accountNumber !== f.v.confirm) e.confirm = 'Account numbers do not match';
    if (validateIFSC(f.v.ifsc)) e.ifsc = validateIFSC(f.v.ifsc) ?? 'IFSC required';
    if (!f.v.accountName.trim()) e.accountName = 'Account holder name is required';
    if (f.v.reason.trim().length < 10) e.reason = 'A reason of at least 10 characters is required';
    f.setErrors(e);
    if (Object.keys(e).length || saving) return;
    setSaving(true);
    try {
      const detail: BankDetail = { id: uid('bank'), bankName: f.v.bankName.trim(), accountNumber: f.v.accountNumber, ifsc: f.v.ifsc.toUpperCase(), accountName: f.v.accountName.trim(), status: 'Pending Approval' };
      const masked = '••••' + detail.accountNumber.slice(-4);
      db.transaction(() => {
        const bankDetails = existing ? supplier.bankDetails.map((b) => (b.id === existing.id ? { ...b, status: 'Rejected' as const } : b)).concat(detail) : [...supplier.bankDetails, detail];
        db.update<Supplier>(C.suppliers, supplier.id, { bankDetails });
        engine.audit({ action: existing ? 'supplier.bank_detail_changed' : 'supplier.bank_detail_added', objectType: 'Supplier', objectId: supplier.id, objectNumber: supplier.code, detail: `${detail.bankName} ${masked} · ${f.v.reason}`, before: existing ? { bankDetail: `${existing.bankName} ••••${existing.accountNumber.slice(-4)}` } : undefined, after: { bankDetail: `${detail.bankName} ${masked}` }, sensitive: true });
        const req = engine.submitForApproval({ docType: 'Supplier Bank Detail', collection: C.suppliers, docId: supplier.id, docNumber: `${supplier.code} · ${detail.bankName} ${masked}`, amount: 0, summary: `Bank detail ${detail.id}: ${detail.bankName} ${masked} (${detail.ifsc}) — ${f.v.reason}`, skipStatusUpdate: true });
        if (!req) db.update<Supplier>(C.suppliers, supplier.id, { bankDetails: bankDetails.map((b) => (b.id === detail.id ? { ...b, status: 'Approved', approvedBy: engine.ctx().userName, approvedAt: new Date().toISOString() } : b)) });
      });
      toast.success(`Bank detail ${masked} submitted for Treasury approval`, { label: 'Approvals', path: 'approvals' });
      onClose();
    } catch (e: any) { toast.error(e?.message ?? 'Could not save bank detail'); setSaving(false); }
  };
  return (
    <Drawer open onClose={onClose} title={existing ? 'Change bank detail' : 'Add bank detail'} subtitle={`${supplier.name} · needs Treasury approval before use in payments`} width={520}
      footer={<DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel="Submit for approval" />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <ErrorSummary errors={f.errors} />
        <TextField label="Bank name" required value={f.v.bankName} onChange={(v) => f.set('bankName', v)} error={f.errors.bankName} autoFocus />
        <TextField label="Account number" required value={f.v.accountNumber} onChange={(v) => f.set('accountNumber', v.replace(/\D/g, ''))} error={f.errors.accountNumber} type="password" />
        <TextField label="Confirm account number" required value={f.v.confirm} onChange={(v) => f.set('confirm', v.replace(/\D/g, ''))} error={f.errors.confirm} />
        <IdentifierField kind="IFSC" required value={f.v.ifsc} onChange={(v) => f.set('ifsc', v)} help={f.errors.ifsc} />
        <TextField label="Account holder name" required value={f.v.accountName} onChange={(v) => f.set('accountName', v)} error={f.errors.accountName} help="Must match the supplier's legal name for vendor payments" />
        <TextArea label="Reason for change" required value={f.v.reason} onChange={(v) => f.set('reason', v)} error={f.errors.reason} minLength={10} placeholder="e.g. Supplier moved to a new current account — letter dated 10 Sep attached" />
      </div>
    </Drawer>
  );
}

export function BankDetailsList({ supplier, canManage }: { supplier: Supplier; canManage: boolean }) {
  const [form, setForm] = useState<{ open: boolean; existing?: BankDetail }>({ open: false });
  const s = useSession();
  const canReveal = s.can('masters.suppliers.reveal') || s.can('masters.suppliers.*') || s.can('banking.*');
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Bank details</div>
        <Button size="sm" variant="secondary" onClick={() => setForm({ open: true })} disabled={!canManage} reason={canManage ? undefined : 'Requires supplier edit permission'}>+ Add bank detail</Button>
      </div>
      {supplier.bankDetails.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No bank details — payments will be blocked until an approved account exists.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {supplier.bankDetails.map((b) => (
          <div key={b.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{b.bankName} <span style={{ fontWeight: 400, color: 'var(--ink-3)' }}>· {b.accountName}</span></div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                A/c <MaskedValue value={b.accountNumber} canReveal={canReveal} onReveal={() => engine.audit({ action: 'supplier.bank_revealed', objectType: 'Supplier', objectId: supplier.id, objectNumber: supplier.code, detail: `Revealed ${b.bankName} ••••${b.accountNumber.slice(-4)}`, sensitive: true })} /> · IFSC <span className="identifier">{b.ifsc}</span>
                {b.approvedBy && <> · {b.status === 'Approved' ? 'approved' : 'reviewed'} by {b.approvedBy}</>}
              </div>
            </div>
            <Badge status={b.status} />
            {b.status === 'Approved' && <Button size="sm" variant="ghost" onClick={() => setForm({ open: true, existing: b })} disabled={!canManage}>Change</Button>}
          </div>
        ))}
      </div>
      {form.open && <BankDetailForm supplier={supplier} existing={form.existing} onClose={() => setForm({ open: false })} />}
    </div>
  );
}
