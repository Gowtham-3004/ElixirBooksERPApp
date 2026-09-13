// Customers register + form (FR-PTY-001/003/004, FR-MDM-001..005).
import { useEffect, useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import type { Customer, PriceList, Salesperson, TdsSection, Currency, PaymentTerm } from '../../store';
import { Badge, Button, Drawer, EntityPicker, IdentifierField, Money, MoneyField, RadioCards, RegisterPage, SelectField, TextArea, TextField, TwoLine, useAccountOptions, useToast } from '../../components/ui';
import { stateNameOf, validateGSTIN, validatePAN, validateEmail } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, nextCode, saveMaster, statusTabs, useForm } from './shared';
import { AddressesEditor, ContactsEditor } from './partyShared';
import { ImportWizard } from '../../components/ui';
import { customerImport } from './importDefs';

export const CUSTOMER_GROUPS = ['Distributor', 'Dealer', 'Corporate', 'Manufacturer', 'Retail', 'Exporter', 'Overseas', 'Government', 'Other'];
const TREATMENTS: Customer['taxTreatment'][] = ['Registered', 'Unregistered', 'Composition', 'SEZ', 'Export', 'Overseas', 'Deemed Export'];

export function partyState(c: { addresses: { purpose: string; isDefault: boolean; address: { state: string } }[]; gstin?: string }): string {
  const billing = c.addresses.find((a) => a.purpose !== 'Shipping' && a.isDefault) ?? c.addresses[0];
  return billing?.address.state || (c.gstin ? stateNameOf(c.gstin.slice(0, 2)) ?? '—' : '—');
}

export function CustomerRegister() {
  const s = useSession();
  const rows = useCollection<Customer>(C.customers).filter((c) => c.companyId === s.state.companyId);
  const openItems = useCollection<any>(C.openItems);
  const [editing, setEditing] = useState<Customer | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const [imp, setImp] = useState(false);
  const canEdit = s.can('masters.customers.edit') || s.can('masters.customers.create');
  const outstanding = (id: string) => openItems.filter((o) => o.partyType === 'Customer' && o.partyId === id && o.status !== 'Settled' && o.status !== 'Written Off').reduce((sum, o) => sum + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0);
  const groups = Array.from(new Set(rows.map((r) => r.group).filter(Boolean))) as string[];
  return (
    <>
      <RegisterPage<Customer>
        title="Customers"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${s.company?.tradeName} · FY ${s.state.fy}`}
        entity="customers"
        rows={rows}
        searchKeys={['name', 'code', 'gstin', 'email', 'displayName']}
        searchPlaceholder="Name, GSTIN, email…"
        tabs={statusTabs<Customer>([{ id: 'blocked', label: 'Blocked', filter: (r) => r.status === 'Blocked' }])}
        filters={[{ key: 'group', label: 'Group', type: 'select', options: groups.map((g) => ({ value: g, label: g })) }, { key: 'taxTreatment', label: 'Tax treatment', type: 'select', options: TREATMENTS.map((t) => ({ value: t, label: t })) }, { key: 'state', label: 'State', type: 'text' }, { key: 'creditPolicy', label: 'Credit policy', type: 'select', options: ['Inherit', 'Warn', 'Block', 'Override'].map((v) => ({ value: v, label: v })) }]}
        applyFilter={(r, f) => (!f.group || r.group === f.group) && (!f.taxTreatment || r.taxTreatment === f.taxTreatment) && (!f.state || partyState(r).toLowerCase().includes(String(f.state).toLowerCase())) && (!f.creditPolicy || r.creditPolicy === f.creditPolicy)}
        primaryAction={{ label: 'New customer', onClick: () => setEditing('new'), disabled: !s.can('masters.customers.create'), reason: s.can('masters.customers.create') ? undefined : 'Requires customer create permission' }}
        importAction={() => setImp(true)}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        onRowClick={(r) => nav.go(`masters/customers/${r.id}`)}
        rowActions={(r) => masterRowActions({ collection: C.customers, objectType: 'Customer', row: r, canEdit, onView: () => nav.go(`masters/customers/${r.id}`), onEdit: () => setEditing(r), extra: [{ label: 'Customer ledger', onClick: () => nav.go(`accounting/customer-ledger?party=${r.id}`) }, ...(r.status !== 'Blocked' ? [{ label: 'Block for new business', onClick: () => saveMaster<Customer>(C.customers, 'Customer', { status: 'Blocked' }, r.id), disabled: !canEdit }] : [])] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.customers, 'Customer', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={r.displayName || r.name} secondary={r.gstin ?? r.code} mono />, value: (r) => r.name },
          { key: 'type', label: 'Type', render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{r.gstin ? 'B2B' : 'B2C'} · {r.taxTreatment}</span>, value: (r) => r.taxTreatment },
          { key: 'state', label: 'State', render: (r) => partyState(r), value: (r) => partyState(r) },
          { key: 'paymentTerms', label: 'Terms', render: (r) => <span style={{ color: '#5F6368' }}>{r.paymentTerms}</span> },
          { key: 'creditLimit', label: 'Credit limit', align: 'right', sortable: true, render: (r) => <Money value={r.creditLimit} currency={s.currency} />, value: (r) => r.creditLimit },
          { key: 'outstanding', label: 'Outstanding', align: 'right', sortable: true, render: (r) => { const o = outstanding(r.id); return <Money value={o} currency={s.currency} tone={o > 0 ? 'negative' : 'none'} />; }, value: (r) => outstanding(r.id), total: (rs) => <Money value={rs.reduce((a, r) => a + outstanding(r.id), 0)} currency={s.currency} /> },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} />, value: (r) => r.status },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <CustomerForm customer={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={(c) => { setEditing(null); if (editing === 'new') nav.go(`masters/customers/${c.id}`); }} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="customers" entityLabel="Customers" candidateFields={['name', 'gstin', 'pan', 'code', 'email', 'phone']} />
      <ImportWizard open={imp} onClose={() => setImp(false)} {...customerImport(rows)} />
    </>
  );
}

// ── Form ───────────────────────────────────────────────────────────────────

function blank(rows: Customer[], defaults: any): Omit<Customer, keyof import('../../store').BaseRecord> {
  return { code: nextCode(rows, 'C-'), name: '', displayName: '', group: 'Corporate', gstin: '', pan: '', taxTreatment: 'Registered', addresses: [], contacts: [], currency: 'INR', paymentTerms: defaults?.paymentTerms ?? 'Net 30', creditLimit: 0, creditPolicy: 'Inherit', priceListId: defaults?.priceListId, salespersonId: undefined, receivableAccountId: defaults?.receivableAccountId, tdsSectionId: undefined, status: 'Active', email: '', phone: '', notes: '' };
}

export function CustomerForm({ customer, onClose, onSaved }: { customer?: Customer; onClose: () => void; onSaved: (c: Customer) => void }) {
  const s = useSession();
  const toast = useToast();
  const all = useCollection<Customer>(C.customers);
  const rows = all.filter((c) => c.companyId === s.state.companyId);
  const f = useForm<any>(customer ? { ...customer } : blank(rows, s.company?.defaults));
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const priceLists = useCollection<PriceList>(C.priceLists).filter((p) => p.type === 'Sales' && p.status === 'Active');
  const salespersons = useCollection<Salesperson>(C.salespersons).filter((p) => p.status === 'Active');
  const tds = useCollection<TdsSection>(C.tdsSections).filter((t) => t.status === 'Active' && (t.applicability === 'Customer' || t.applicability === 'Any'));
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active');
  const terms = useCollection<PaymentTerm>(C.paymentTerms).filter((t) => t.status === 'Active');
  const arAccounts = useAccountOptions((a) => a.isControl && a.controlType === 'AR');
  const dups = useMemo(() => findDuplicates('customers', rows, f.v, customer?.id), [rows, f.v.name, f.v.gstin, f.v.pan, f.v.code, f.v.email, f.v.phone]);
  const blocked = dups.some((d) => d.mode === 'Block');

  // auto state + PAN from GSTIN
  useEffect(() => {
    const g: string = f.v.gstin ?? '';
    if (g.length === 15 && !validateGSTIN(g)) {
      const pan = g.slice(2, 12);
      const stateName = stateNameOf(g.slice(0, 2));
      const patch: any = {};
      if (!f.v.pan) patch.pan = pan;
      if (stateName && f.v.addresses.length && !f.v.addresses[0].address.state) patch.addresses = f.v.addresses.map((a: any, i: number) => (i === 0 ? { ...a, address: { ...a.address, state: stateName, stateCode: g.slice(0, 2) } } : a));
      if (stateName && !f.v.addresses.length) patch.addresses = [{ id: 'adr_' + Date.now().toString(36), purpose: 'Both', isDefault: true, address: { line1: '', city: '', state: stateName, stateCode: g.slice(0, 2), pin: '', country: 'IN' } }];
      if (f.v.taxTreatment === 'Unregistered') patch.taxTreatment = 'Registered';
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
    if (f.v.taxTreatment === 'Registered' && !f.v.gstin) e.gstin = 'GSTIN is required for a registered customer';
    if (f.v.creditLimit < 0) e.creditLimit = 'Credit limit cannot be negative';
    if (!f.v.addresses.length && f.v.taxTreatment !== 'Unregistered') e.addresses = 'At least one billing address is needed to determine place of supply';
    const bill = f.v.addresses.filter((a: any) => a.purpose !== 'Shipping' && a.isDefault).length;
    if (f.v.addresses.length && bill === 0) e.addresses = 'Mark one billing (or Both) address as default';
    if (f.v.addresses.some((a: any) => !a.address.line1 || !a.address.city)) e.addresses = e.addresses ?? 'Every address needs line 1 and city';
    if (f.v.contacts.some((c: any) => !c.name)) e.contacts = 'Every contact needs a name';
    f.setErrors(e);
    return !Object.keys(e).length;
  };
  const save = () => {
    if (saving) return;
    if (!validate()) return;
    if (blocked) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate to continue' }); return; }
    setSaving(true);
    try {
      const values = { ...f.v, name: f.v.name.trim(), displayName: f.v.displayName?.trim() || undefined, gstin: f.v.gstin || undefined, pan: f.v.pan || undefined };
      const saved = saveMaster<Customer>(C.customers, 'Customer', values, customer?.id, { expectedVersion: customer?.version });
      toast.success(customer ? `${saved.name} updated` : `Customer ${saved.code} created`);
      onSaved(saved);
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save customer');
      setSaving(false);
    }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  return (
    <Drawer open onClose={onClose} title={customer ? `Edit ${customer.name}` : 'New customer'} subtitle={customer ? `${customer.code} · v${customer.version}` : 'Customer master · FR-PTY-001'} width={840}
      headerRight={customer && <div style={{ display: 'flex', gap: 0 }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={customer ? 'Save customer' : 'Create customer'} disabled={blocked} reason={blocked ? 'Duplicate blocked by register rules' : undefined} /> : undefined}>
      {tab === 'history' && customer ? <ChangeHistory objectId={customer.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
          <section>
            <div className="section-title">Identity</div>
            <div style={grid}>
              <TextField label="Legal name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
              <TextField label="Display name" value={f.v.displayName} onChange={(v) => f.set('displayName', v)} help="Shown on documents when different from the legal name" />
              <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} help="Auto-generated, editable" />
              <SelectField label="Group" value={f.v.group} onChange={(v) => f.set('group', v)} options={Array.from(new Set([...CUSTOMER_GROUPS, ...rows.map((r) => r.group).filter(Boolean) as string[]]))} />
              <IdentifierField kind="GSTIN" value={f.v.gstin} onChange={(v) => f.set('gstin', v)} help={f.errors.gstin ?? 'State and PAN are derived automatically'} />
              <IdentifierField kind="PAN" value={f.v.pan} onChange={(v) => f.set('pan', v)} help={f.errors.pan} />
              <SelectField label="Tax treatment" value={f.v.taxTreatment} onChange={(v) => f.set('taxTreatment', v)} options={TREATMENTS} help={f.v.taxTreatment === 'SEZ' || f.v.taxTreatment === 'Export' || f.v.taxTreatment === 'Overseas' ? 'Zero-rated: no GST charged on supplies (LUT)' : undefined} />
              <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive', 'Blocked']} help={f.v.status === 'Blocked' ? 'Blocked customers cannot be used on new documents' : undefined} />
              <TextField label="Email" value={f.v.email} onChange={(v) => f.set('email', v)} error={f.errors.email} type="email" />
              <TextField label="Phone" value={f.v.phone} onChange={(v) => f.set('phone', v)} />
            </div>
          </section>
          <section>
            <div className="section-title">Addresses <span style={{ fontWeight: 400, color: '#5F6368', fontSize: 12 }}>· one default per purpose; the default billing address drives place of supply</span></div>
            <AddressesEditor value={f.v.addresses} onChange={(v) => f.set('addresses', v)} error={f.errors.addresses} />
          </section>
          <section>
            <div className="section-title">Contacts</div>
            <ContactsEditor value={f.v.contacts} onChange={(v) => f.set('contacts', v)} />
            {f.errors.contacts && <div className="field-error">{f.errors.contacts}</div>}
          </section>
          <section>
            <div className="section-title">Commercial terms</div>
            <div style={grid}>
              <SelectField label="Currency" value={f.v.currency} onChange={(v) => f.set('currency', v)} options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
              <SelectField label="Payment terms" value={f.v.paymentTerms} onChange={(v) => f.set('paymentTerms', v)} options={terms.map((t) => ({ value: t.name, label: `${t.name} (${t.days} days${t.discountPct ? `, ${t.discountPct}% in ${t.discountDays}d` : ''})` }))} />
              <SelectField label="Price list" value={f.v.priceListId ?? ''} onChange={(v) => f.set('priceListId', v || undefined)} options={priceLists.map((p) => ({ value: p.id, label: `${p.name} (${p.currency}${p.taxInclusive ? ', tax incl.' : ''})` }))} allowEmpty placeholder="— Company default —" />
              <SelectField label="Salesperson" value={f.v.salespersonId ?? ''} onChange={(v) => f.set('salespersonId', v || undefined)} options={salespersons.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} allowEmpty placeholder="— None —" />
              <EntityPicker label="Receivable account" value={f.v.receivableAccountId} onChange={(v) => f.set('receivableAccountId', v)} options={arAccounts} help="AR control account for this customer's open items" />
              <SelectField label="TDS / TCS section" value={f.v.tdsSectionId ?? ''} onChange={(v) => f.set('tdsSectionId', v || undefined)} options={tds.map((t) => ({ value: t.id, label: `${t.section} · ${t.description} (${t.rate}%)` }))} allowEmpty placeholder="— Not applicable —" />
            </div>
          </section>
          <section>
            <div className="section-title">Credit</div>
            <div style={grid}>
              <MoneyField label="Credit limit" value={f.v.creditLimit} onChange={(v) => f.set('creditLimit', v)} currency={f.v.currency} error={f.errors.creditLimit} help="0 = no limit enforced" />
            </div>
            <RadioCards label="Credit policy" value={f.v.creditPolicy} onChange={(v) => f.set('creditPolicy', v)} columns={4} style={{ marginTop: 12 }} options={[
              { value: 'Inherit', label: 'Inherit', description: `Company default (${s.company?.defaults.creditPolicy ?? 'Warn'})` },
              { value: 'Warn', label: 'Warn', description: 'Show a warning when the limit is exceeded' },
              { value: 'Block', label: 'Block', description: 'Refuse new orders and invoices over the limit' },
              { value: 'Override', label: 'Override', description: 'Allow with approval (workflow)' },
            ]} />
          </section>
          <TextArea label="Notes" value={f.v.notes} onChange={(v) => f.set('notes', v)} rows={2} />
        </div>
      )}
    </Drawer>
  );
}

