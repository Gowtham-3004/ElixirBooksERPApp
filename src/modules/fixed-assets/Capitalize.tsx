// Capitalize (FR-AST-002): from posted vendor-invoice lines (flagged capital or any line) or manual with ConfirmDialog + journal.
import { useState } from 'react';
import { C, nav, useSession, useCollection, IDS, db } from '../../store';
import { Button, Banner, ConfirmDialog, TextField, TextArea, DateField, MoneyField, NumberField, SelectField, EntityPicker, useEmployeeOptions, useAccountOptions, useDimensionOptions, Segmented, useToast, Badge, KV, DataTable, Toggle, ScopeLine } from '../../components/ui';
import { fmtMoney, fmtDate, today } from '../../lib/format';
import type { AssetCategory } from './types';
import { capitalize, capitalizableLines, type CapitalizeInput } from './actions';

export function CapitalizePage() {
  const s = useSession();
  const toast = useToast();
  const cats = useCollection<AssetCategory>(C.assetCategories).filter((c) => c.status === 'Active');
  const vinv = useCollection<any>(C.vendorInvoices);
  const empOpts = useEmployeeOptions();
  const accOpts = useAccountOptions((a) => a.controlType === 'Bank' || a.controlType === 'AP' || a.controlType === 'WIP' || a.type === 'Liability');
  const ccOpts = useDimensionOptions('CostCentre');
  const branches = useCollection<any>(C.branches).filter((b) => b.companyId === s.state.companyId && b.status === 'Active');
  const [mode, setMode] = useState<'invoice' | 'manual'>('invoice');
  const lines = capitalizableLines();
  const [f, setF] = useState<CapitalizeInput>({ name: '', categoryId: cats[0]?.id ?? '', location: 'Head Office', branchId: s.state.branchId, acquisitionDate: today(), capitalizationDate: today(), inServiceDate: today(), cost: 0, residual: 0, quantity: 1, postJournal: true, creditAccountId: IDS.accWIP, sourceType: 'Manual', dimensions: { CostCentre: IDS.dimCCMumbai } });
  const [confirm, setConfirm] = useState(false);
  const canCap = s.can('fixed-assets.*') || s.can('fixed-assets.asset.create');
  const cat = cats.find((c) => c.id === f.categoryId);
  const pickLine = (row: (typeof lines)[number]) => {
    const item = db.find<any>(C.items, row.line.itemId);
    setF({ ...f, name: row.line.itemName || row.line.description || 'Asset', description: row.line.description, cost: row.line.taxable || row.line.amount, quantity: row.line.qty, acquisitionDate: row.doc.date, capitalizationDate: today(), inServiceDate: today(), sourceType: 'Vendor Invoice', sourceId: row.doc.id, sourceNumber: row.doc.number, supplierId: row.doc.partyId, supplierName: row.doc.partyName ?? row.doc.partySnapshot?.name, creditAccountId: row.line.accountId ?? IDS.accPurchases, notes: `line:${row.line.id}`, categoryId: item?.type === 'Asset' ? f.categoryId : f.categoryId, postJournal: true });
    setMode('manual');
    toast.info(`Prefilled from ${row.doc.number} — review and confirm`);
  };
  const submit = () => { try { const a = capitalize(f); toast.success(`${a.number} capitalized`, { label: 'Open asset', path: `fixed-assets/register/${a.id}` }); nav.go(`fixed-assets/register/${a.id}`); } catch (e: any) { toast.error(e.message); } };
  const valid = f.name.trim() && f.categoryId && f.cost > 0 && f.residual < f.cost;
  return (
    <div className="page">
      <div className="page-header"><div><h1 className="page-title">Capitalize asset</h1><div className="page-subtitle"><ScopeLine extra="Asset origin: purchase invoice / GRN or authorized manual capitalization" /></div></div><Segmented value={mode} onChange={setMode} options={[{ value: 'invoice', label: 'From vendor invoice' }, { value: 'manual', label: 'Manual / review' }]} /></div>
      {mode === 'invoice' && (
        <>
          <Banner tone="info">Posted vendor-invoice lines not yet linked to an asset. Lines on capital items or asset accounts are flagged; any line can be capitalized (the purchase expense is reclassified to the asset account).</Banner>
          <DataTable rows={lines.map((r) => ({ id: `${r.doc.id}:${r.line.id}`, ...r }))} dense columns={[
            { key: 'doc', label: 'Invoice', render: (r) => <div><span className="identifier link">{r.doc.number}</span><div className="cell-secondary">{fmtDate(r.doc.date)} · {r.doc.partyName ?? r.doc.partySnapshot?.name}</div></div> },
            { key: 'line', label: 'Line', render: (r) => <div><div className="cell-primary">{r.line.itemName}</div><div className="cell-secondary">{r.line.description ?? r.line.itemCode ?? ''}</div></div> },
            { key: 'qty', label: 'Qty', align: 'right', render: (r) => r.line.qty },
            { key: 'amount', label: 'Taxable value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.line.taxable || r.line.amount, r.doc.currency)}</span> },
            { key: 'account', label: 'Booked to', render: (r) => <span style={{ fontSize: 12 }}>{db.find<any>(C.accounts, r.line.accountId)?.name ?? 'Purchases'}</span> },
            { key: 'capital', label: 'Capital?', render: (r) => (r.capital ? <Badge status="Approved">Capital item</Badge> : <Badge status="Draft">Expense line</Badge>) },
            { key: 'act', label: '', render: (r) => <Button size="sm" variant="primary" onClick={() => pickLine(r)} disabled={!canCap}>Capitalize</Button> },
          ]} emptyTitle="No posted vendor-invoice lines to capitalize" emptyDescription={`${vinv.length} vendor invoices on file — post one with a capital item, or switch to manual capitalization.`} emptyAction={<Button variant="secondary" onClick={() => setMode('manual')}>Manual capitalization</Button>} />
        </>
      )}
      {mode === 'manual' && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="section-title">Asset</div>
            <TextField label="Name" required value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="CNC lathe · Laptop fleet · Delivery van" />
            <TextArea label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={2} />
            <div className="grid-2">
              <SelectField label="Category" required value={f.categoryId} onChange={(v) => { const c = cats.find((x) => x.id === v); setF({ ...f, categoryId: v, method: c?.method, ratePct: c?.ratePct, usefulLifeYears: c?.usefulLifeYears }); }} options={cats.map((c) => ({ value: c.id, label: `${c.name} · ${c.method} ${c.ratePct}%` }))} />
              <NumberField label="Quantity" value={f.quantity ?? 1} onChange={(v) => setF({ ...f, quantity: v })} decimals={0} min={1} />
              <TextField label="Location" value={f.location} onChange={(v) => setF({ ...f, location: v })} />
              <SelectField label="Branch" value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
              <EntityPicker label="Custodian" value={f.custodianId} onChange={(v) => setF({ ...f, custodianId: v })} options={empOpts} />
              <EntityPicker label="Cost centre" value={f.dimensions?.CostCentre} onChange={(v) => setF({ ...f, dimensions: { ...(f.dimensions ?? {}), CostCentre: v ?? '' } })} options={ccOpts} />
              <TextField label="Serial number" value={f.serialNo} onChange={(v) => setF({ ...f, serialNo: v })} />
              <DateField label="Warranty until" value={f.warrantyUntil} onChange={(v) => setF({ ...f, warrantyUntil: v || undefined })} />
            </div>
            <div className="section-title" style={{ marginTop: 8 }}>Dates & value</div>
            <div className="grid-3">
              <DateField label="Acquisition" required value={f.acquisitionDate} onChange={(v) => setF({ ...f, acquisitionDate: v })} />
              <DateField label="Capitalization" required value={f.capitalizationDate} onChange={(v) => setF({ ...f, capitalizationDate: v })} checkPeriod={f.postJournal} />
              <DateField label="In service" required value={f.inServiceDate} onChange={(v) => setF({ ...f, inServiceDate: v })} help="Depreciation starts here (prorated)" />
              <MoneyField label="Cost" required value={f.cost} onChange={(v) => setF({ ...f, cost: v })} />
              <MoneyField label="Residual value" value={f.residual} onChange={(v) => setF({ ...f, residual: v })} />
              <NumberField label="Useful life (years)" value={f.usefulLifeYears ?? cat?.usefulLifeYears ?? 0} onChange={(v) => setF({ ...f, usefulLifeYears: v })} decimals={0} />
              <SelectField label="Method" value={f.method ?? cat?.method} onChange={(v) => setF({ ...f, method: v as any })} options={['WDV', 'SLM']} />
              <NumberField label="Rate %" value={f.ratePct ?? cat?.ratePct ?? 0} onChange={(v) => setF({ ...f, ratePct: v })} suffix="%" />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="section-title">Source & accounting</div>
              <KV items={[{ k: 'Origin', v: f.sourceType ?? 'Manual' }, { k: 'Source document', v: f.sourceNumber ?? '—' }, { k: 'Supplier', v: f.supplierName ?? '—' }, { k: 'Asset account', v: db.find<any>(C.accounts, cat?.assetAccountId)?.name ?? '—' }, { k: 'Depreciation', v: `${db.find<any>(C.accounts, cat?.depreciationAccountId)?.name ?? '—'} / ${db.find<any>(C.accounts, cat?.accumulatedAccountId)?.name ?? '—'}` }]} />
              <Toggle on={f.postJournal} onChange={(v) => setF({ ...f, postJournal: v })} label="Post capitalization journal" help={f.sourceType === 'Vendor Invoice' ? 'Reclassifies the purchase line: Dr asset account · Cr the account the invoice line was booked to' : 'Dr asset account · Cr the credit account below (CWIP / bank / payable). Turn off if the asset is already in the PPE balance (opening).'} />
              {f.postJournal && f.sourceType !== 'Vendor Invoice' && <EntityPicker label="Credit account" value={f.creditAccountId} onChange={(v) => setF({ ...f, creditAccountId: v })} options={accOpts} />}
              {f.postJournal && f.sourceType === 'Vendor Invoice' && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Credit: {db.find<any>(C.accounts, f.creditAccountId)?.name ?? 'Purchases'} (invoice line account)</div>}
              <TextArea label="Notes" value={f.notes?.startsWith('line:') ? '' : f.notes} onChange={(v) => setF({ ...f, notes: f.notes?.startsWith('line:') ? f.notes : v })} rows={2} />
            </div>
            <div className="summary-block">
              <div className="ladder-row"><span className="ladder-label">Cost</span><span className="ladder-value">{fmtMoney(f.cost, s.currency)}</span></div>
              <div className="ladder-row"><span className="ladder-label">Residual</span><span className="ladder-value">{fmtMoney(f.residual, s.currency)}</span></div>
              <div className="ladder-row"><span className="ladder-label">Depreciable base</span><span className="ladder-value" style={{ fontWeight: 600 }}>{fmtMoney(Math.max(0, f.cost - f.residual), s.currency)}</span></div>
              <div className="ladder-row"><span className="ladder-label">First-year depreciation ({f.method ?? cat?.method} {f.ratePct ?? cat?.ratePct}%)</span><span className="ladder-value">{fmtMoney((((f.method ?? cat?.method) === 'WDV' ? f.cost : Math.max(0, f.cost - f.residual)) * (f.ratePct ?? cat?.ratePct ?? 0)) / 100, s.currency)}</span></div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><Button variant="ghost" onClick={() => nav.go('fixed-assets/register')}>Cancel</Button><Button variant="primary" onClick={() => setConfirm(true)} disabled={!valid || !canCap} reason={!canCap ? 'Requires fixed-assets permission' : !valid ? 'Name, category and a cost above residual are required' : undefined}>Capitalize asset</Button></div>
          </div>
        </div>
      )}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Capitalize ${f.name || 'asset'} at ${fmtMoney(f.cost, s.currency)}`} statement={`${f.sourceType === 'Vendor Invoice' ? `From ${f.sourceNumber}` : 'Manual capitalization (authorized)'} · in service ${fmtDate(f.inServiceDate)} · ${cat?.name}`} confirmLabel="Capitalize asset" cancelLabel="Review again" consequences={[{ engine: 'Numbering', text: 'Next asset number allocated (FA-nnn)', tone: 'info' }, ...(f.postJournal ? [{ engine: 'Journal', text: `Dr ${db.find<any>(C.accounts, cat?.assetAccountId)?.name} ${fmtMoney(f.cost, s.currency)} · Cr ${db.find<any>(C.accounts, f.creditAccountId)?.name ?? 'Purchases'}`, tone: 'info' as const }] : [{ engine: 'Journal', text: 'No journal — asset assumed already in PPE balance', tone: 'warning' as const }]), { engine: 'Statutory', text: `Depreciation ${f.method ?? cat?.method} ${f.ratePct ?? cat?.ratePct}% from ${fmtDate(f.inServiceDate)}, prorated in the first month`, tone: 'success' }]} onConfirm={submit} />
    </div>
  );
}
