// Tax rates configuration (FR-TAX-001..003): register, form with components + account mapping,
// and a "Try it" calculator that runs engine.computeLineTax with explanation lines.
import { useMemo, useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { TaxRate } from '../../store';
import { Badge, Button, CheckboxField, DateField, Drawer, EntityPicker, Money, NumberField, PercentField, RegisterPage, SelectField, TextField, TwoLine, useAccountOptions, useToast } from '../../components/ui';
import { INDIA_STATES, fmtDate, fmtMoney } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, saveMaster, statusTabs, useForm } from './shared';

const TREATMENTS: TaxRate['treatment'][] = ['Taxable', 'Exempt', 'Nil-rated', 'Non-GST', 'Zero-rated'];

export function TaxRateRegister() {
  const s = useSession();
  const rows = useCollection<TaxRate>(C.taxRates).filter((t) => t.companyId === s.state.companyId);
  const items = useCollection<any>(C.items);
  const [editing, setEditing] = useState<TaxRate | null | 'new'>(null);
  const [tryIt, setTryIt] = useState<string | null | 'open'>(null);
  const [rules, setRules] = useState(false);
  const canEdit = s.can('masters.taxrates.edit') || s.can('masters.taxrates.create') || s.can('taxation.*') || s.can('masters.*');
  return (
    <>
      <RegisterPage<TaxRate>
        title="Tax rates"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${s.company?.localizationPack} pack v${s.company?.localizationVersion} · rule version ${rows[0]?.ruleVersion ?? '—'}`}
        entity="tax rates"
        rows={rows}
        searchKeys={['code', 'name', 'treatment', 'ruleVersion']}
        tabs={statusTabs<TaxRate>([{ id: 'rcm', label: 'Reverse charge', filter: (r) => r.reverseCharge }, { id: 'zero', label: 'Exempt / nil / zero', filter: (r) => r.treatment !== 'Taxable' }])}
        filters={[{ key: 'treatment', label: 'Treatment', type: 'select', options: TREATMENTS.map((t) => ({ value: t, label: t })) }, { key: 'type', label: 'Type', type: 'select', options: ['GST', 'VAT', 'None'].map((t) => ({ value: t, label: t })) }]}
        applyFilter={(r, f) => (!f.treatment || r.treatment === f.treatment) && (!f.type || r.type === f.type)}
        primaryAction={{ label: 'New tax rate', onClick: () => setEditing('new'), disabled: !canEdit, reason: canEdit ? undefined : 'Requires tax configuration permission' }}
        actions={<><Button variant="tinted" onClick={() => setTryIt('open')}>Try it — tax calculator</Button><Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button></>}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => masterRowActions({ collection: C.taxRates, objectType: 'Tax Rate', row: r, canEdit, onEdit: () => setEditing(r), extra: [{ label: 'Try it', onClick: () => setTryIt(r.id) }] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.taxRates, 'Tax Rate', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Tax rate', sortable: true, render: (r) => <TwoLine primary={r.name} secondary={r.code} mono />, value: (r) => r.name },
          { key: 'rate', label: 'Rate', align: 'right', sortable: true, render: (r) => `${r.rate}%${r.cessRate ? ` + ${r.cessRate}% cess` : ''}` },
          { key: 'components', label: 'Components', render: (r) => (r.components.length ? <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{r.components.map((c) => <span key={c.name} className="pill pill-neutral">{c.name} {c.rate}%</span>)}</span> : '—') },
          { key: 'treatment', label: 'Treatment', render: (r) => <span>{r.treatment}{r.reverseCharge && <span className="pill pill-warning" style={{ marginLeft: 6 }}>RCM</span>}</span> },
          { key: 'type', label: 'Type' },
          { key: 'effective', label: 'Effective', render: (r) => `${fmtDate(r.effectiveFrom)} → ${r.effectiveTo ? fmtDate(r.effectiveTo) : 'open'}` },
          { key: 'ruleVersion', label: 'Rule', render: (r) => <span className="identifier">{r.ruleVersion}</span> },
          { key: 'items', label: 'Items', align: 'right', render: (r) => items.filter((i) => i.taxRateId === r.id).length || '—' },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <TaxRateForm taxRate={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {tryIt && <TaxCalculator initialRateId={tryIt === 'open' ? undefined : tryIt} onClose={() => setTryIt(null)} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="taxRates" entityLabel="Tax rates" candidateFields={['code', 'name']} />
    </>
  );
}

function TaxRateForm({ taxRate, onClose }: { taxRate?: TaxRate; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<TaxRate>(C.taxRates).filter((t) => t.companyId === s.state.companyId);
  const outAcc = useAccountOptions((a) => a.type === 'Liability');
  const inAcc = useAccountOptions((a) => a.type === 'Asset');
  const f = useForm<any>(taxRate ? { ...taxRate, components: taxRate.components.map((c) => ({ ...c })), outputAccountIds: { ...(taxRate.outputAccountIds ?? {}) }, inputAccountIds: { ...(taxRate.inputAccountIds ?? {}) } } : { code: '', name: '', rate: 18, components: [{ name: 'CGST', rate: 9 }, { name: 'SGST', rate: 9 }, { name: 'IGST', rate: 18 }], type: 'GST', treatment: 'Taxable', reverseCharge: false, cessRate: 0, effectiveFrom: '2017-07-01', effectiveTo: '', ruleVersion: rows[0]?.ruleVersion ?? 'IN-GST-2026.1', status: 'Active', outputAccountIds: { CGST: 'acc_2300', SGST: 'acc_2301', IGST: 'acc_2302' }, inputAccountIds: { CGST: 'acc_1400', SGST: 'acc_1401', IGST: 'acc_1402' } });
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const dups = useMemo(() => findDuplicates('taxRates', rows, f.v, taxRate?.id), [rows, f.v.code, f.v.name]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const setRate = (rate: number) => f.patch({ rate, components: f.v.type === 'GST' && f.v.treatment === 'Taxable' ? [{ name: 'CGST', rate: rate / 2 }, { name: 'SGST', rate: rate / 2 }, { name: 'IGST', rate }, ...(f.v.cessRate ? [{ name: 'CESS', rate: f.v.cessRate }] : [])] : f.v.type === 'VAT' ? [{ name: 'VAT', rate }] : f.v.components });
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.code.trim()) e.code = 'Code is required';
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (f.v.rate < 0 || f.v.rate > 100) e.rate = 'Rate must be 0–100';
    if (f.v.treatment !== 'Taxable' && f.v.rate !== 0) e.rate = `${f.v.treatment} rates must be 0%`;
    if (f.v.effectiveTo && f.v.effectiveTo < f.v.effectiveFrom) e.effectiveTo = 'Effective-to must be after effective-from';
    if (f.v.components.some((c: any) => !c.name)) e.components = 'Every component needs a name';
    if (!f.v.ruleVersion.trim()) e.ruleVersion = 'Rule version is required (FR-TAX-005)';
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const saved = saveMaster<TaxRate>(C.taxRates, 'Tax Rate', { ...f.v, code: f.v.code.toUpperCase(), effectiveTo: f.v.effectiveTo || undefined, cessRate: f.v.cessRate || undefined }, taxRate?.id, { expectedVersion: taxRate?.version });
      toast.success(`Tax rate ${saved.code} ${taxRate ? 'updated' : 'created'}`);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? 'Could not save'); setSaving(false); }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  return (
    <Drawer open onClose={onClose} title={taxRate ? `Edit ${taxRate.name}` : 'New tax rate'} subtitle="FR-TAX-002/003 · components, treatment, reverse charge, cess, effective period, rule version, account mapping" width={760}
      headerRight={taxRate && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={taxRate ? 'Save tax rate' : 'Create tax rate'} disabled={blocked} /> : undefined}>
      {tab === 'history' && taxRate ? <ChangeHistory objectId={taxRate.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
          {taxRate && <div className="banner info">Posted documents keep the rate, components and rule version they were computed with (FR-TAX-005) — editing here affects future documents only.</div>}
          <div style={grid}>
            <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} />
            <TextField label="Name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
            <SelectField label="Type" value={f.v.type} onChange={(v) => f.set('type', v)} options={['GST', 'VAT', 'None']} />
            <SelectField label="Treatment" value={f.v.treatment} onChange={(v) => f.patch({ treatment: v, rate: v === 'Taxable' ? f.v.rate : 0, components: v === 'Taxable' ? f.v.components : [] })} options={TREATMENTS} help={f.v.treatment === 'Zero-rated' ? 'Exports / SEZ under LUT — input credit allowed' : f.v.treatment === 'Exempt' ? 'No tax; input credit reversed' : undefined} />
            <PercentField label="Rate" value={f.v.rate} onChange={setRate} error={f.errors.rate} disabled={f.v.treatment !== 'Taxable'} />
            <PercentField label="Compensation cess" value={f.v.cessRate ?? 0} onChange={(v) => f.patch({ cessRate: v, components: [...f.v.components.filter((c: any) => c.name !== 'CESS'), ...(v ? [{ name: 'CESS', rate: v }] : [])] })} disabled={f.v.type !== 'GST' || f.v.treatment !== 'Taxable'} />
            <DateField label="Effective from" required value={f.v.effectiveFrom} onChange={(v) => f.set('effectiveFrom', v)} />
            <DateField label="Effective to" value={f.v.effectiveTo} onChange={(v) => f.set('effectiveTo', v)} error={f.errors.effectiveTo} />
            <TextField label="Rule version" required value={f.v.ruleVersion} onChange={(v) => f.set('ruleVersion', v)} error={f.errors.ruleVersion} help="Stamped on every posted document" />
            <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive']} />
          </div>
          <CheckboxField checked={f.v.reverseCharge} onChange={(v) => f.set('reverseCharge', v)} label="Reverse charge (RCM)" help="Tax is payable by the recipient and is not added to the invoice total" />
          <section>
            <div className="section-title">Components & account mapping</div>
            <table className="data-table dense">
              <thead><tr><th>Component</th><th className="right">Rate %</th><th>Output (sales) account</th><th>Input (purchase) account</th><th /></tr></thead>
              <tbody>
                {f.v.components.map((c: any, i: number) => (
                  <tr key={i}>
                    <td><input className="field-input grid" value={c.name} onChange={(e) => f.set('components', f.v.components.map((x: any, j: number) => (j === i ? { ...x, name: e.target.value.toUpperCase() } : x)))} style={{ width: 100 }} /></td>
                    <td><input className="field-input grid num" type="number" step="0.01" value={c.rate} onChange={(e) => f.set('components', f.v.components.map((x: any, j: number) => (j === i ? { ...x, rate: Number(e.target.value) } : x)))} style={{ width: 90 }} /></td>
                    <td style={{ minWidth: 220 }}><EntityPicker value={f.v.outputAccountIds[c.name]} onChange={(v) => f.set('outputAccountIds', { ...f.v.outputAccountIds, [c.name]: v })} options={outAcc} size="grid" placeholder="Output account…" /></td>
                    <td style={{ minWidth: 220 }}><EntityPicker value={f.v.inputAccountIds[c.name]} onChange={(v) => f.set('inputAccountIds', { ...f.v.inputAccountIds, [c.name]: v })} options={inAcc} size="grid" placeholder="Input account…" /></td>
                    <td><Button size="sm" variant="ghost" onClick={() => f.set('components', f.v.components.filter((_: any, j: number) => j !== i))}>✕</Button></td>
                  </tr>
                ))}
                {!f.v.components.length && <tr><td colSpan={5} style={{ color: 'var(--ink-3)', textAlign: 'center' }}>No components — nothing is charged</td></tr>}
              </tbody>
            </table>
            {f.errors.components && <div className="field-error">{f.errors.components}</div>}
            <div style={{ marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => f.set('components', [...f.v.components, { name: '', rate: 0 }])}>+ Add component</Button></div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

export function TaxCalculator({ initialRateId, onClose }: { initialRateId?: string; onClose: () => void }) {
  const s = useSession();
  const rates = useCollection<TaxRate>(C.taxRates).filter((t) => t.companyId === s.state.companyId && t.status === 'Active');
  const [rateId, setRateId] = useState(initialRateId ?? rates.find((r) => r.code === 'GST18')?.id ?? rates[0]?.id ?? '');
  const [seller, setSeller] = useState(s.company?.address.stateCode ?? '27');
  const [buyer, setBuyer] = useState('27');
  const [treatment, setTreatment] = useState('Registered');
  const [direction, setDirection] = useState<'sale' | 'purchase'>('sale');
  const [qty, setQty] = useState(10);
  const [rate, setRate] = useState(1000);
  const [disc, setDisc] = useState(0);
  const [incl, setIncl] = useState(false);
  const res = rateId ? engine.computeLineTax({ qty, rate, discountPct: disc, taxRateId: rateId, taxInclusive: incl }, { sellerStateCode: seller, buyerStateCode: buyer, treatment, direction, companyId: s.state.companyId }) : null;
  const tr = rates.find((r) => r.id === rateId);
  const stateOpts = INDIA_STATES.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }));
  return (
    <Drawer open onClose={onClose} title="Try it — tax calculator" subtitle="Runs the same engine.computeLineTax used on every document (FR-TAX-001/002)" width={720} footer={<Button variant="ghost" onClick={onClose}>Close calculator</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SelectField label="Tax rate" value={rateId} onChange={setRateId} options={rates.map((r) => ({ value: r.id, label: `${r.name} (${r.code})` }))} style={{ gridColumn: '1 / -1' }} />
        <SelectField label="Direction" value={direction} onChange={setDirection} options={[{ value: 'sale', label: 'Sale (output tax)' }, { value: 'purchase', label: 'Purchase (input tax)' }]} />
        <SelectField label="Party tax treatment" value={treatment} onChange={setTreatment} options={['Registered', 'Unregistered', 'Composition', 'SEZ', 'Export', 'Overseas', 'Deemed Export']} />
        <SelectField label="Seller state" value={seller} onChange={setSeller} options={stateOpts} />
        <SelectField label="Place of supply (buyer state)" value={buyer} onChange={setBuyer} options={stateOpts} />
        <NumberField label="Quantity" value={qty} onChange={setQty} decimals={3} />
        <NumberField label="Rate" value={rate} onChange={setRate} prefix="₹" />
        <PercentField label="Discount" value={disc} onChange={setDisc} />
        <div style={{ paddingTop: 24 }}><CheckboxField checked={incl} onChange={setIncl} label="Price is tax-inclusive" /></div>
      </div>
      {res && (
        <div className="card" style={{ padding: 18, marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
            <div><div className="section-label">Taxable</div><div style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(res.taxable)}</div></div>
            <div><div className="section-label">Tax</div><div style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(res.taxAmt)}</div></div>
            <div><div className="section-label">Line total</div><div style={{ fontSize: 18, fontWeight: 600 }}>{fmtMoney(res.taxable + (res.reverseCharge ? 0 : res.taxAmt))}</div></div>
            <div><div className="section-label">Treatment</div><div style={{ fontSize: 14, marginTop: 4 }}><Badge status={res.taxAmt > 0 ? 'Approved' : 'Draft'}>{res.treatment}</Badge>{res.reverseCharge && <Badge status="Returned" style={{ marginLeft: 6 }}>RCM</Badge>}</div></div>
            <div><div className="section-label">Supply</div><div style={{ fontSize: 14, marginTop: 4 }}>{res.interState ? 'Inter-state (IGST)' : 'Intra-state (CGST + SGST)'}</div></div>
          </div>
          <table className="data-table dense">
            <thead><tr><th>Component</th><th className="right">Rate</th><th className="right">Amount</th><th>{direction === 'sale' ? 'Output account' : 'Input account'}</th></tr></thead>
            <tbody>
              {Object.entries(res.components).map(([k, v]) => { const accId = (direction === 'sale' ? tr?.outputAccountIds : tr?.inputAccountIds)?.[k]; const acc = accId ? db.find<any>(C.accounts, accId) : undefined; return <tr key={k}><td>{k}</td><td className="right">{k === 'CESS' ? tr?.cessRate : k === 'IGST' || k === 'VAT' || k === 'TAX' ? res.rate : res.rate / 2}%</td><td className="right"><Money value={v} /></td><td>{acc ? `${acc.code} · ${acc.name}` : <span style={{ color: 'var(--danger)' }}>Not mapped</span>}</td></tr>; })}
              {!Object.keys(res.components).length && <tr><td colSpan={4} style={{ color: 'var(--ink-3)' }}>No tax components apply</td></tr>}
            </tbody>
          </table>
          <div className="section-label" style={{ marginTop: 14, marginBottom: 6 }}>How this was calculated</div>
          <ul style={{ fontSize: 13, paddingLeft: 18, color: 'var(--ink-2)' }}>
            <li>Seller {INDIA_STATES.find((x) => x.code === seller)?.name ?? seller} → place of supply {INDIA_STATES.find((x) => x.code === buyer)?.name ?? buyer}; party treatment {treatment}</li>
            <li>Gross {fmtMoney(qty * rate)}{disc ? ` less ${disc}% discount` : ''} → taxable {fmtMoney(res.taxable)}</li>
            {res.explanation.map((x, i) => <li key={i}>{x}</li>)}
            <li>Rule version <span className="identifier">{res.ruleVersion}</span> — stamped on the posted document</li>
          </ul>
        </div>
      )}
    </Drawer>
  );
}
