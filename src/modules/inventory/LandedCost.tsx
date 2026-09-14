// Landed cost (FR-TRD-003): register, form (GRN selection, cost lines, basis, allocation preview), detail.
import { useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, SelectField, TextField, TextArea, MoneyField, EntityPicker, useSupplierOptions, RadioCards, AccountingTab, ActivityTab, AttachmentsPanel, RailSection, KV, useToast, Banner, EmptyState, PeriodBanner, ActionMenu, SummaryBlock } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, uid } from '../../lib/format';
import type { LandedCost, LandedCostBasis } from './types';
import type { Grn } from '../purchase/types';
import * as A from './actions';
import { useConfirm, DocLink, ItemLink, whName } from '../purchase/shared';
import { StockMovesForSource } from '../purchase/Grns';

export function LandedCostPage({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <LandedCostForm grnId={params.grn} />;
  if (id) return <LandedCostDetail id={id} />;
  return <LandedCostRegister />;
}

function LandedCostRegister() {
  const rows = useCollection<LandedCost>(C.landedCosts);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <RegisterPage<LandedCost> title="Landed cost" subtitle={`${mine.length} documents · freight / duty / insurance capitalised onto received stock without touching the supplier invoice`} entity="landed costs" rows={mine} searchKeys={['number', 'grnNumbers']}
      columns={[
        { key: 'number', label: 'LC #', sortable: true, render: (r) => <span className="identifier link">{r.number}</span> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'grnNumbers', label: 'GRNs', render: (r) => <span style={{ fontSize: 12 }}>{r.grnNumbers.map((n, i) => <DocLink key={n} path={`purchase/grn/${r.grnIds[i]}`} number={n} />)}</span> },
        { key: 'costs', label: 'Cost lines', render: (r) => <TwoLine primary={r.costs.map((c) => c.name).join(', ')} secondary={`${r.costs.length} line(s)`} /> },
        { key: 'basis', label: 'Basis', render: (r) => <Badge status="Draft">{r.basis}</Badge> },
        { key: 'lines', label: 'Stock lines', align: 'right', render: (r) => r.allocations.length },
        { key: 'totalCost', label: 'Total cost', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.totalCost)}</span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totalCost, 0)) },
        { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'rev', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
      primaryAction={{ label: 'New landed cost', onClick: () => nav.go('inventory/landed-cost/new') }} onRowClick={(r) => nav.go(`inventory/landed-cost/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`inventory/landed-cost/${r.id}`) }]} />
  );
}

function LandedCostForm({ grnId, existing }: { grnId?: string; existing?: LandedCost }) {
  const toast = useToast();
  const grns = useCollection<Grn>(C.grns).filter((g) => g.status === 'Posted' && g.lines.some((l) => l.acceptedQty > 0)).sort((a, b) => b.date.localeCompare(a.date));
  const suppliers = useSupplierOptions();
  const [lc, setLc] = useState<LandedCost>(() => A.computeLandedCost(existing ?? A.newLandedCost(grnId ? [grnId] : [])));
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<LandedCost>) => setLc((d) => A.computeLandedCost({ ...d, ...p }));
  const toggleGrn = (id: string) => set({ grnIds: lc.grnIds.includes(id) ? lc.grnIds.filter((x) => x !== id) : [...lc.grnIds, id] });
  const post = () => { try { const out = A.postLandedCost(lc); toast.success(`${out.number} posted · inventory revalued`); nav.go(`inventory/landed-cost/${out.id}`); } catch (e: any) { setErr(e.message); } };
  const saveDraft = () => { try { const ex = db.find<LandedCost>(C.landedCosts, lc.id); const out = ex ? db.update<LandedCost>(C.landedCosts, lc.id, { ...lc }) : db.insert<LandedCost>(C.landedCosts, { ...lc, number: 'LC/DRAFT' }); toast.success('Draft saved'); nav.go(`inventory/landed-cost/${out.id}`); } catch (e: any) { setErr(e.message); } };
  const expenseAccounts = db.get<any>(C.accounts).filter((a) => a.type === 'Expense' && a.postingAllowed && a.status === 'Active');
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.back('inventory/landed-cost')}>← Landed cost</button><h1 className="page-title">{existing ? `Edit ${existing.number}` : 'New landed cost'}</h1><div className="page-subtitle">Allocates freight / duty / insurance across the selected GRN lines by {lc.basis.toLowerCase()} · posts value-only stock movements + Dr Inventory / Cr charges account</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" onClick={() => nav.back('inventory/landed-cost')}>Discard</Button><Button onClick={saveDraft}>Save draft</Button><Button variant="primary" tone="good" onClick={post}>Post landed cost</Button></div>
      </div>
      <PeriodBanner date={lc.date} />
      {err && <Banner tone="danger" onDismiss={() => setErr(null)}>{err}</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}>
          <div className="section-title">Goods receipts ({lc.grnIds.length} selected)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflow: 'auto' }}>{grns.map((g) => <label key={g.id} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, padding: '6px 8px', border: `1px solid ${lc.grnIds.includes(g.id) ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 8 }}><input type="checkbox" className="checkbox" checked={lc.grnIds.includes(g.id)} onChange={() => toggleGrn(g.id)} /><TwoLine primary={`${g.number} · ${g.partyName}`} secondary={`${fmtDate(g.date)} · ${g.lines.length} line(s) · ${fmtMoney(g.totals.taxable)}${g.landedCostIds?.length ? ' · already has landed cost' : ''}`} /></label>)}{grns.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>No posted GRNs</div>}</div>
        </div>
        <div className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignContent: 'start' }}>
          <DateField label="Date" required value={lc.date} onChange={(v) => set({ date: v })} checkPeriod />
          <div />
          <RadioCards label="Allocation basis" value={lc.basis} onChange={(v) => set({ basis: v as LandedCostBasis })} columns={3} options={[{ value: 'Value', label: 'By value', description: 'Proportional to line value' }, { value: 'Qty', label: 'By quantity', description: 'Proportional to accepted qty' }, { value: 'Weight', label: 'By weight', description: 'Uses Kg alt-UOM where defined' }]} style={{ gridColumn: 'span 2' }} />
          <TextArea label="Notes" value={lc.notes} onChange={(v) => set({ notes: v })} style={{ gridColumn: 'span 2' }} rows={2} />
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}>
        <div className="section-title">Cost lines</div>
        {lc.costs.map((c) => (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 140px 1fr 160px 32px', gap: 8, alignItems: 'end', marginBottom: 8 }}>
            <TextField size="sm" label="Cost" value={c.name} onChange={(v) => set({ costs: lc.costs.map((x) => (x.id === c.id ? { ...x, name: v } : x)) })} placeholder="Freight / customs duty / insurance" />
            <EntityPicker size="sm" label="Charged by" value={c.supplierId} onChange={(v, o) => set({ costs: lc.costs.map((x) => (x.id === c.id ? { ...x, supplierId: v, supplierName: o?.primary } : x)) })} options={suppliers} />
            <MoneyField size="sm" label="Amount" value={c.amount} onChange={(v) => set({ costs: lc.costs.map((x) => (x.id === c.id ? { ...x, amount: v } : x)) })} />
            <TextField size="sm" label="Reference" value={c.reference} onChange={(v) => set({ costs: lc.costs.map((x) => (x.id === c.id ? { ...x, reference: v } : x)) })} />
            <SelectField size="sm" label="Credit account" value={c.accountId ?? 'acc_5030'} onChange={(v) => set({ costs: lc.costs.map((x) => (x.id === c.id ? { ...x, accountId: v } : x)) })} options={expenseAccounts.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
            <button type="button" className="btn-icon" onClick={() => set({ costs: lc.costs.filter((x) => x.id !== c.id) })}>✕</button>
          </div>
        ))}
        <button type="button" className="btn-link" onClick={() => set({ costs: [...lc.costs, { id: uid('lc'), name: 'Freight', amount: 0, accountId: 'acc_5030' }] })}>+ Add cost line</button>
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>Total to allocate <strong style={{ color: 'var(--ink)' }}>{fmtMoney(lc.totalCost)}</strong> · the charge was already expensed on its own invoice; posting moves it into inventory (Cr the expense account)</div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontWeight: 600, fontSize: 13 }}>Allocation preview · {lc.allocations.length} stock line(s)</div>
        {lc.allocations.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>Select at least one GRN with accepted stock lines.</div> : <table className="data-table dense"><thead><tr><th>GRN</th><th>Item</th><th>Warehouse</th><th className="right">Qty</th><th className="right">Line value</th><th className="right">Weight</th><th className="right">Allocated</th><th className="right">Rate before</th><th className="right">Rate after</th></tr></thead><tbody>{lc.allocations.map((a) => <tr key={a.id}><td className="identifier">{a.grnNumber}</td><td>{a.itemName}</td><td>{whName(a.warehouseId)}</td><td className="right money">{fmtQty(a.qty)}</td><td className="right money">{fmtMoney(a.baseValue)}</td><td className="right money">{a.weight ? fmtQty(a.weight) : '—'}</td><td className="right money" style={{ fontWeight: 600, color: 'var(--good)' }}>{fmtMoney(a.allocated)}</td><td className="right money">{fmtMoney(a.qty ? a.baseValue / a.qty : 0)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(a.newRate)}</td></tr>)}</tbody><tfoot><tr><td colSpan={6}>Total</td><td className="right money">{fmtMoney(lc.allocations.reduce((x, a) => x + a.allocated, 0))}</td><td colSpan={2} /></tr></tfoot></table>}
      </div>
    </div>
  );
}

function LandedCostDetail({ id }: { id: string }) {
  const lc = useRecord<LandedCost>(C.landedCosts, id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  if (!lc) return <EmptyState title="Landed cost not found" action={<Button onClick={() => nav.go('inventory/landed-cost')}>Back</Button>} />;
  if (nav.get().params.edit && lc.status === 'Draft') return <LandedCostForm existing={lc} />;
  return (
    <>
      <DocumentPage backLabel="Landed cost" onBack={() => nav.go('inventory/landed-cost')} number={lc.number} badges={<><Badge status={lc.status} /><Badge status="Draft">by {lc.basis}</Badge></>} amount={{ label: 'Capitalised', value: lc.totalCost, currency: s.currency }}
        rail={<><RailSection label="Document"><KV items={[{ k: 'Date', v: fmtDate(lc.date) }, { k: 'GRNs', v: <span>{lc.grnNumbers.map((n, i) => <DocLink key={n} path={`purchase/grn/${lc.grnIds[i]}`} number={n} />)}</span> }, { k: 'Basis', v: lc.basis }, { k: 'Notes', v: lc.notes ?? '—' }, ...(lc.postedAt ? [{ k: 'Posted', v: `${fmtDate(lc.postedAt)} · ${lc.postedBy}` }] : []), ...(lc.reversalReason ? [{ k: 'Reversed', v: lc.reversalReason }] : [])]} /></RailSection><RailSection label="Attachments"><AttachmentsPanel objectType="Landed Cost" objectId={lc.id} readOnly={lc.status !== 'Draft'} /></RailSection></>}
        tabs={[
          { id: 'alloc', label: 'Allocation', content: <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><SummaryBlock items={lc.costs.map((c) => ({ label: c.name + (c.supplierName ? ` · ${c.supplierName}` : ''), value: fmtMoney(c.amount) }))} /><div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>GRN</th><th>Item</th><th>Warehouse</th><th className="right">Qty</th><th className="right">Line value</th><th className="right">Allocated</th><th className="right">Rate after</th></tr></thead><tbody>{lc.allocations.map((a) => <tr key={a.id}><td className="identifier">{a.grnNumber}</td><td><ItemLink id={a.itemId} name={a.itemName} /></td><td>{whName(a.warehouseId)}</td><td className="right money">{fmtQty(a.qty)}</td><td className="right money">{fmtMoney(a.baseValue)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(a.allocated)}</td><td className="right money">{fmtMoney(a.newRate)}</td></tr>)}</tbody></table></div></div> },
          { id: 'stock', label: 'Stock movements', content: <StockMovesForSource sourceId={lc.id} /> },
          { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={lc.journalId} currency={s.currency} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={lc.id} correlationId={lc.correlationId} /> },
        ]}
        footer={<><div style={{ flex: 1 }} />{lc.status === 'Draft' && <Button onClick={() => nav.go(`inventory/landed-cost/${id}?edit=1`)}>Edit</Button>}{lc.status === 'Draft' && <Button variant="primary" tone="good" onClick={() => { try { A.postLandedCost(lc); toast.success('Posted'); } catch (e: any) { toast.error(e.message); } }}>Post landed cost</Button>}{lc.status === 'Posted' && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Reverse', danger: true, onClick: () => confirm.open({ title: `Reverse ${lc.number}?`, consequences: [{ engine: 'Stock', text: 'Value-only reversal movements', tone: 'warning' }, { engine: 'Journal', text: `Reversal of ${lc.journalNumber}`, tone: 'warning' }], reasonRequired: true, confirmLabel: 'Reverse landed cost', cancelLabel: 'Keep', danger: true, onConfirm: (r) => { A.reverseLandedCost(id, r); toast.success('Reversed'); } }) }]} />}</>} />
      {confirm.dialog}
    </>
  );
}
