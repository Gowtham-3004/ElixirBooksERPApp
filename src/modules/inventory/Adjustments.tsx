// Stock adjustments (FR-INV-005): register, form, detail with approval / post / reverse.
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { ApprovalRequest, Item, ReasonCode } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, SelectField, TextArea, EntityPicker, useItemOptions, NumberField, ActivityTab, AccountingTab, ApprovalsTab, AttachmentsPanel, RailSection, KV, useToast, Banner, EmptyState, PeriodBanner, ActionMenu } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import type { StockAdjustment, AdjustmentLine } from './types';
import * as A from './actions';
import { useConfirm, ItemLink, DocLink } from '../purchase/shared';
import { StockMovesForSource } from '../purchase/Grns';

export function Adjustments({ id }: { id?: string }) {
  if (id === 'new') return <AdjustmentForm />;
  if (id) return <AdjustmentDetail id={id} />;
  return <AdjustmentRegister />;
}

function AdjustmentRegister() {
  const rows = useCollection<StockAdjustment>(C.stockAdjustments);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  const rule = db.findBy<any>(C.workflowRules, (w) => w.docType === 'Stock Adjustment' && w.status === 'Active');
  return (
    <RegisterPage<StockAdjustment> title="Stock adjustments" subtitle={`${mine.length} adjustments · ${rule ? `${rule.name} (${rule.conditions.map((c: any) => `${c.field} ${c.op} ${c.value}`).join(', ')})` : 'no approval rule'}`} entity="adjustments" rows={mine} searchKeys={['number', 'reason', 'warehouseName']}
      columns={[
        { key: 'number', label: 'ADJ #', sortable: true, render: (r) => <span className="identifier link">{r.number}</span> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'item', label: 'Item(s)', render: (r) => <TwoLine primary={r.lines[0]?.itemName ?? '—'} secondary={r.lines.length > 1 ? `+${r.lines.length - 1} more` : r.lines[0]?.itemCode} /> },
        { key: 'warehouseName', label: 'Warehouse', sortable: true, render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{r.warehouseName}</span> },
        { key: 'adjustmentType', label: 'Type', sortable: true, render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{r.adjustmentType}</span> },
        { key: 'qty', label: 'Qty change', align: 'right', render: (r) => { const q = r.lines.reduce((x, l) => x + l.qty, 0); return <span className="money" style={{ fontWeight: 600, color: q < 0 ? '#C0393F' : '#12784E' }}>{q > 0 ? '+' : ''}{fmtQty(q)}</span>; } },
        { key: 'reason', label: 'Reason', render: (r) => <span style={{ fontSize: 12, color: '#5F6368', maxWidth: 220, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason}</span> },
        { key: 'totalValue', label: 'Value', align: 'right', sortable: true, value: (r) => r.totalValue, render: (r) => <span className="money">{fmtMoney(r.totalValue)}</span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totalValue, 0)) },
        { key: 'approverName', label: 'Approver', render: (r) => r.approverName ?? '—' },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status === 'Submitted' ? 'Pending Approval' : r.status}>{r.status === 'Submitted' ? 'Pending approval' : r.status}</Badge> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'pending', label: 'Pending approval', filter: (r) => r.status === 'Submitted' }, { id: 'approved', label: 'Approved', filter: (r) => r.status === 'Approved' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
      primaryAction={{ label: 'New adjustment', onClick: () => nav.go('inventory/adjustments/new'), disabled: !s.can('inventory.adjustment.create'), reason: !s.can('inventory.adjustment.create') ? 'Requires inventory.adjustment.create' : undefined }} onRowClick={(r) => nav.go(`inventory/adjustments/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`inventory/adjustments/${r.id}`) }]} />
  );
}

function AdjustmentForm({ existing }: { existing?: StockAdjustment }) {
  const toast = useToast();
  const [a, setA] = useState<StockAdjustment>(() => { const base = existing ?? A.newAdjustment(); const itemParam = nav.get().params.item; return A.computeAdjustment(itemParam && !existing ? { ...base, lines: [A.adjustmentLine(itemParam, base.warehouseId)] } : base); });
  const [errs, setErrs] = useState<string[]>([]);
  const items = useItemOptions((i) => i.isStock);
  const whs = A.activeWarehouses().filter((w) => w.type !== 'Transit');
  const reasons = db.get<ReasonCode>(C.reasonCodes).filter((r) => r.status === 'Active' && (r.category === 'Adjustment' || r.category === 'Other'));
  const set = (p: Partial<StockAdjustment>) => setA((d) => A.computeAdjustment({ ...d, ...p }));
  const upd = (lid: string, p: Partial<AdjustmentLine>) => set({ lines: a.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const needsApproval = !!engine.resolveWorkflow('Stock Adjustment', { amount: a.totalValue, branchId: a.branchId });
  const submit = () => { const e = A.validateAdjustment(a); if (e.length) { setErrs(e); return; } try { const out = A.submitAdjustment(a); toast.success(out.status === 'Posted' ? `${out.number} posted` : `${out.number} submitted for approval`); nav.go(`inventory/adjustments/${out.id}`); } catch (err: any) { setErrs([err.message]); } };
  const save = () => { try { const out = A.saveAdjustment(a); toast.success('Draft saved'); nav.go(`inventory/adjustments/${out.id}`); } catch (err: any) { setErrs([err.message]); } };
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: '#5F6368' }} onClick={() => nav.back('inventory/adjustments')}>← Adjustments</button><h1 className="page-title">{existing ? `Edit ${existing.number}` : 'New stock adjustment'}</h1><div className="page-subtitle">Reason required (FR-INV-005) · {needsApproval ? 'value exceeds the approval threshold — Operations Manager approval' : 'below threshold — posts directly'}</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" onClick={() => nav.back('inventory/adjustments')}>Discard</Button><Button onClick={save}>Save draft</Button><Button variant="primary" onClick={submit}>{needsApproval ? 'Submit for approval' : 'Post adjustment'}</Button></div>
      </div>
      <PeriodBanner date={a.date} />
      {errs.length > 0 && <Banner tone="danger" onDismiss={() => setErrs([])}><ul style={{ margin: 0, paddingLeft: 16 }}>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul></Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <DateField label="Date" required value={a.date} onChange={(v) => set({ date: v })} checkPeriod />
        <SelectField label="Warehouse" required value={a.warehouseId} onChange={(v) => set({ warehouseId: v, lines: a.lines.map((l) => (l.itemId ? { ...A.adjustmentLine(l.itemId, v, l.qty), id: l.id, batch: l.batch, reasonCode: l.reasonCode } : l)) })} options={whs.map((w) => ({ value: w.id, label: w.name }))} />
        <SelectField label="Adjustment type" required value={a.adjustmentType} onChange={(v) => set({ adjustmentType: v as StockAdjustment['adjustmentType'] })} options={['Count variance', 'Write-off', 'Found', 'Damage', 'Rework', 'Other']} />
        <SelectField label="Reason code" required value={a.reasonCode} onChange={(v) => set({ reasonCode: v })} options={reasons.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))} placeholder="— Reason code —" />
        <TextArea label="Reason (audited)" required value={a.reason} onChange={(v) => set({ reason: v })} style={{ gridColumn: 'span 4' }} rows={2} minLength={10} placeholder="Business reason — shown to the approver and kept in the audit trail" />
      </div>
      <div className="card" style={{ overflow: 'visible' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 36 }}>#</th><th style={{ minWidth: 260 }}>Item</th><th className="right">On hand</th><th className="right" style={{ width: 120 }}>Qty ± </th><th style={{ width: 70 }}>UOM</th><th className="right" style={{ width: 120 }}>Rate (AVCO)</th><th style={{ width: 150 }}>Batch / serials</th><th style={{ width: 160 }}>Line reason</th><th className="right" style={{ width: 130 }}>Value</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {a.lines.map((l, i) => { const item = db.find<Item>(C.items, l.itemId); const pos = l.itemId ? engine.stockPosition(l.itemId, a.warehouseId, { batch: l.batch || undefined }) : undefined; return (
              <tr key={l.id} className={l.qty < 0 && pos && pos.onHand + l.qty < 0 ? 'error-row' : ''}>
                <td>{i + 1}</td>
                <td><EntityPicker size="grid" value={l.itemId} onChange={(iid) => upd(l.id, iid ? { ...A.adjustmentLine(iid, a.warehouseId, l.qty || 0), id: l.id } : { itemId: undefined, itemName: '' })} options={items} recentKey="items" /></td>
                <td className="right money" style={{ color: '#5F6368' }}>{pos ? fmtQty(pos.onHand) : '—'}</td>
                <td><NumberField size="grid" value={l.qty} onChange={(v) => upd(l.id, { qty: v })} decimals={3} /></td>
                <td style={{ fontSize: 12 }}>{l.uom}</td>
                <td><NumberField size="grid" value={l.rate} onChange={(v) => upd(l.id, { rate: v })} decimals={2} min={0} /></td>
                <td>{item?.tracking === 'Batch' ? <input className="field-input grid" placeholder="Batch" value={l.batch ?? ''} onChange={(e) => upd(l.id, { batch: e.target.value })} /> : item?.tracking === 'Serial' ? <input className="field-input grid" placeholder="Serials, comma-separated" value={(l.serials ?? []).join(',')} onChange={(e) => upd(l.id, { serials: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /> : <span style={{ color: '#B0B5BF', fontSize: 12 }}>—</span>}</td>
                <td><select className="field-input grid" value={l.reasonCode ?? ''} onChange={(e) => upd(l.id, { reasonCode: e.target.value })}><option value="">Header reason</option>{reasons.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}</select></td>
                <td className="right money" style={{ color: l.qty < 0 ? '#C0393F' : '#12784E' }}>{l.qty < 0 ? '−' : ''}{fmtMoney(l.value)}</td>
                <td><button type="button" className="btn-icon" onClick={() => set({ lines: a.lines.filter((x) => x.id !== l.id) })}>✕</button></td>
              </tr>); })}
            {a.lines.length === 0 && <tr><td colSpan={10} style={{ textAlign: 'center', color: '#5F6368', height: 64 }}>No lines — add an item</td></tr>}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #EAEAEA', background: '#F9FBFC', fontSize: 12, color: '#5F6368' }}><button type="button" className="btn-link" onClick={() => set({ lines: [...a.lines, { ...engine.newLine({ warehouseId: a.warehouseId }), value: 0 } as AdjustmentLine] })}>+ Add line</button><span>Adjustment value <strong style={{ color: '#0A0A0A' }}>{fmtMoney(a.totalValue)}</strong> · journal Dr/Cr Inventory vs 5020 Inventory adjustments</span></div>
      </div>
      <div className="card" style={{ padding: 16 }}><div className="section-title">Attachments (count sheet, damage photos)</div><AttachmentsPanel objectType="Stock Adjustment" objectId={a.id} /></div>
    </div>
  );
}

function AdjustmentDetail({ id }: { id: string }) {
  const a = useRecord<StockAdjustment>(C.stockAdjustments, id);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  if (!a) return <EmptyState title="Adjustment not found" action={<Button onClick={() => nav.go('inventory/adjustments')}>Back</Button>} />;
  if (nav.get().params.edit && (a.status === 'Draft' || a.status === 'Returned')) return <AdjustmentForm existing={a} />;
  const pending = approvals.find((x) => x.docId === id && x.status === 'Pending');
  const canAct = pending ? engine.canActOnApproval(pending) : { ok: false, reason: 'No pending approval' };
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const acc = db.find<Item>(C.items, a.lines[0]?.itemId)?.inventoryAccountId ?? 'acc_1200';
  const net = a.lines.reduce((x, l) => x + l.qty * l.rate, 0);
  return (
    <>
      <DocumentPage backLabel="Adjustments" onBack={() => nav.go('inventory/adjustments')} number={a.number} badges={<><Badge status={a.status === 'Submitted' ? 'Pending Approval' : a.status}>{a.status === 'Submitted' ? 'Pending approval' : a.status}</Badge><Badge status="Draft">{a.adjustmentType}</Badge></>} amount={{ label: 'Adjustment value', value: a.totalValue, currency: s.currency }}
        rail={<><RailSection label="Adjustment"><KV items={[{ k: 'Date', v: fmtDate(a.date) }, { k: 'Warehouse', v: a.warehouseName }, { k: 'Reason code', v: a.reasonCode }, { k: 'Reason', v: a.reason }, { k: 'Approver', v: a.approverName ?? '—' }, ...(a.countNumber ? [{ k: 'Stock count', v: <DocLink path={`inventory/counts/${a.countId}`} number={a.countNumber} /> }] : []), { k: 'Created', v: `${fmtDate(a.createdAt)} · ${a.createdBy}` }, ...(a.postedAt ? [{ k: 'Posted', v: `${fmtDate(a.postedAt)} · ${a.postedBy}` }] : []), ...(a.reversalReason ? [{ k: 'Reversed', v: a.reversalReason }] : [])]} /></RailSection><RailSection label="Attachments"><AttachmentsPanel objectType="Stock Adjustment" objectId={a.id} readOnly={a.status !== 'Draft'} /></RailSection></>}
        tabs={[
          { id: 'lines', label: 'Lines', content: <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>#</th><th>Item</th><th className="right">Qty</th><th>UOM</th><th>Batch / serial</th><th className="right">Rate</th><th className="right">Value</th><th>Reason</th></tr></thead><tbody>{a.lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money" style={{ fontWeight: 600, color: l.qty < 0 ? '#C0393F' : '#12784E' }}>{l.qty > 0 ? '+' : ''}{fmtQty(l.qty)}</td><td>{l.uom}</td><td className="identifier">{l.batch ?? (l.serials?.length ? l.serials.join(', ') : '—')}</td><td className="right money">{fmtMoney(l.rate)}</td><td className="right money">{fmtMoney(l.value)}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{l.reasonCode ?? a.reasonCode}</td></tr>)}</tbody></table></div> },
          { id: 'stock', label: 'Stock movements', content: <StockMovesForSource sourceId={a.id} /> },
          { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={a.journalId} currency={s.currency} projected={a.status !== 'Posted' && a.status !== 'Reversed' ? (net >= 0 ? [{ accountId: acc, dr: net }, { accountId: 'acc_5020', cr: net }] : [{ accountId: 'acc_5020', dr: -net }, { accountId: acc, cr: -net }]) : undefined} /> },
          { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={a.approvalId} docId={a.id} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={a.id} correlationId={a.correlationId} /> },
        ]}
        footer={<>
          <div style={{ flex: 1 }} />
          {(a.status === 'Draft' || a.status === 'Returned') && <Button onClick={() => nav.go(`inventory/adjustments/${id}?edit=1`)}>Edit</Button>}
          {(a.status === 'Draft' || a.status === 'Returned') && <Button variant="primary" onClick={() => run(() => A.submitAdjustment(a), 'Submitted')}>Submit</Button>}
          {pending && <Button variant="danger" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Reject ${a.number}?`, reasonRequired: true, confirmLabel: 'Reject', danger: true, onConfirm: (r) => engine.actOnApproval(pending.id, 'Reject', { comment: r }) })}>Reject</Button>}
          {pending && <Button variant="primary" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Approve ${a.number}?`, statement: `${a.adjustmentType} · ${fmtMoney(a.totalValue)} · ${a.reason}`, reasonRequired: true, consequences: [{ engine: 'Workflow', text: 'Adjustment becomes Approved and can be posted' }], confirmLabel: 'Approve adjustment', onConfirm: (r) => engine.actOnApproval(pending.id, 'Approve', { comment: r }) })}>Approve</Button>}
          {a.status === 'Approved' && <Button variant="primary" onClick={() => confirm.open({ title: `Post ${a.number}?`, consequences: [{ engine: 'Stock', text: `${a.lines.length} movement(s) in ${a.warehouseName}` }, { engine: 'Journal', text: `${net >= 0 ? 'Dr Inventory / Cr' : 'Dr'} Inventory adjustments ${fmtMoney(Math.abs(net))}` }], confirmLabel: 'Post adjustment', onConfirm: () => { A.postAdjustment(id); toast.success('Posted'); } })}>Post adjustment</Button>}
          {a.status === 'Posted' && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Reverse', danger: true, onClick: () => confirm.open({ title: `Reverse ${a.number}?`, consequences: [{ engine: 'Stock', text: 'Opposite movements', tone: 'warning' }, { engine: 'Journal', text: `Reversal of ${a.journalNumber}`, tone: 'warning' }], reasonRequired: true, confirmLabel: 'Reverse adjustment', cancelLabel: 'Keep', danger: true, onConfirm: (r) => { A.reverseAdjustment(id, r); toast.success('Reversed'); } }) }]} />}
        </>} />
      {confirm.dialog}
    </>
  );
}
