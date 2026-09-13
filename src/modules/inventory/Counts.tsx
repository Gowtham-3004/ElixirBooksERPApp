// Stock counts (FR-INV-007): create count sheet, enter counts inline, variance summary, approval, post variance adjustment.
import { useState } from 'react';
import { C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { ApprovalRequest } from '../../store';
import { RegisterPage, Button, Badge, TwoLine, DateField, SelectField, TextArea, useToast, EmptyState, Banner, SummaryBlock, Tabs, ApprovalsTab, ActivityTab, PageHeader, Modal } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, fmtDateTime } from '../../lib/format';
import type { StockCount } from './types';
import * as A from './actions';
import { useConfirm, DocLink } from '../purchase/shared';

export function Counts({ id }: { id?: string }) {
  if (id === 'new') return <CountCreate />;
  if (id) return <CountSheet id={id} />;
  return <CountRegister />;
}

function CountRegister() {
  const rows = useCollection<StockCount>(C.stockCounts);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <RegisterPage<StockCount> title="Stock counts" subtitle={`${mine.length} count sheets · frozen system quantity vs counted · approved variance posts an adjustment`} entity="stock counts" rows={mine} searchKeys={['number', 'warehouseName', 'itemGroup']}
      columns={[
        { key: 'number', label: 'Count #', sortable: true, render: (r) => <span className="identifier link">{r.number}</span> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'warehouseName', label: 'Warehouse', sortable: true }, { key: 'itemGroup', label: 'Scope', render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{r.itemGroup ?? 'All items'}</span> },
        { key: 'lines', label: 'Lines', align: 'right', render: (r) => r.countLines.length },
        { key: 'progress', label: 'Progress', render: (r) => { const v = A.countVariance(r); return <span style={{ fontSize: 12 }}><span style={{ color: '#12784E', fontWeight: 600 }}>{v.matched}</span> matched · <span style={{ color: '#C0393F', fontWeight: 600 }}>{v.variances}</span> variances · <span style={{ color: '#B0B5BF', fontWeight: 600 }}>{v.pending}</span> pending</span>; } },
        { key: 'net', label: 'Net variance', align: 'right', render: (r) => { const v = A.countVariance(r); return <span className="money" style={{ color: v.netValue < 0 ? '#C0393F' : v.netValue > 0 ? '#12784E' : undefined }}>{fmtMoney(v.netValue)}</span>; } },
        { key: 'adjustmentNumber', label: 'Adjustment', render: (r) => <DocLink path={r.adjustmentId ? `inventory/adjustments/${r.adjustmentId}` : undefined} number={r.adjustmentNumber} /> },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status === 'Submitted' ? 'Pending Approval' : r.status}>{r.status === 'Submitted' ? 'Pending approval' : r.status}</Badge> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: 'In progress', filter: (r) => r.status === 'In Progress' || r.status === 'Draft' }, { id: 'pending', label: 'Awaiting approval', filter: (r) => r.status === 'Submitted' }, { id: 'approved', label: 'Approved', filter: (r) => r.status === 'Approved' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }]}
      primaryAction={{ label: 'New count sheet', onClick: () => nav.go('inventory/counts/new'), disabled: !s.can('inventory.count.create'), reason: !s.can('inventory.count.create') ? 'Requires inventory.count.create' : undefined }} onRowClick={(r) => nav.go(`inventory/counts/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`inventory/counts/${r.id}`) }]} />
  );
}

function CountCreate() {
  const toast = useToast();
  const s = useSession();
  const whs = A.activeWarehouses().filter((w) => w.type !== 'Transit');
  const groups = Array.from(new Set(A.stockItems().map((i) => i.group).filter(Boolean))) as string[];
  const [form, setForm] = useState({ warehouseId: s.company?.defaults.warehouseId ?? whs[0]?.id ?? '', group: '', date: engine.today(), notes: '' });
  const preview = A.stockItems().filter((i) => !form.group || i.group === form.group).filter((i) => engine.stockPosition(i.id, form.warehouseId).onHand !== 0);
  return (
    <div className="page">
      <PageHeader title="New stock count" subtitle="System quantities are frozen when the sheet is created; count against the frozen figure." back={{ label: 'Stock counts', path: 'inventory/counts' }} actions={<Button variant="primary" onClick={() => { try { const sc = A.createCount({ warehouseId: form.warehouseId, group: form.group || undefined, date: form.date, notes: form.notes }); toast.success(`${sc.number} created · ${sc.countLines.length} lines frozen`); nav.go(`inventory/counts/${sc.id}`); } catch (e: any) { toast.error(e.message); } }}>Create & freeze</Button>} />
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        <SelectField label="Warehouse" required value={form.warehouseId} onChange={(v) => setForm({ ...form, warehouseId: v })} options={whs.map((w) => ({ value: w.id, label: w.name }))} />
        <SelectField label="Item group" value={form.group} onChange={(v) => setForm({ ...form, group: v })} options={[{ value: '', label: 'All stock items' }, ...groups.map((g) => ({ value: g, label: g }))]} />
        <DateField label="Count date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} checkPeriod />
        <TextArea label="Instructions" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} style={{ gridColumn: 'span 3' }} rows={2} />
      </div>
      <div className="card" style={{ padding: 16 }}><div className="section-title">{preview.length} item(s) with stock will be frozen</div><div style={{ fontSize: 12, color: '#5F6368' }}>{preview.map((i) => i.name).join(' · ') || 'Nothing in stock for this selection'}</div></div>
    </div>
  );
}

function CountSheet({ id }: { id: string }) {
  const sc = useRecord<StockCount>(C.stockCounts, id);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [tab, setTab] = useState<'sheet' | 'approvals' | 'activity'>('sheet');
  const [showOnly, setShowOnly] = useState<'all' | 'pending' | 'variance'>('all');
  const [reject, setReject] = useState(false);
  if (!sc) return <EmptyState title="Count not found" action={<Button onClick={() => nav.go('inventory/counts')}>Back</Button>} />;
  const merged = { ...sc, countLines: sc.countLines.map((l) => (counts[l.id] !== undefined ? { ...l, countedQty: counts[l.id] } : l)) };
  const v = A.countVariance(merged);
  const editable = sc.status === 'In Progress' || sc.status === 'Draft' || sc.status === 'Rejected';
  const pending = approvals.find((a) => a.docId === id && a.status === 'Pending');
  const canAct = pending ? engine.canActOnApproval(pending) : { ok: sc.status === 'Submitted' && (s.can('inventory.count.approve') || s.can('approvals.act')), reason: 'Requires Operations Manager' };
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const save = () => run(() => { A.saveCountProgress(id, counts); setCounts({}); }, 'Progress saved');
  const rows = v.rows.filter((r) => showOnly === 'all' || (showOnly === 'pending' ? r.variance === null : r.variance !== null && r.variance !== 0));
  const dirty = Object.keys(counts).length > 0;
  return (
    <>
      <div className="page">
        <div className="page-header">
          <div><button type="button" className="btn-link" style={{ color: '#5F6368' }} onClick={() => nav.go('inventory/counts')}>← Stock counts</button><h1 className="page-title" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{sc.number} <Badge status={sc.status === 'Submitted' ? 'Pending Approval' : sc.status}>{sc.status === 'Submitted' ? 'Pending approval' : sc.status}</Badge></h1><div className="page-subtitle">{sc.warehouseName} · {fmtDate(sc.date)} · frozen {fmtDateTime(sc.frozenAt)} · {sc.itemGroup ?? 'all items'}</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editable && <Button onClick={save} disabled={!dirty}>Save progress</Button>}
            {editable && <Button variant="primary" disabled={v.pending > 0 && !dirty} reason={v.pending > 0 ? `${v.pending} line(s) pending` : undefined} onClick={() => { if (dirty) save(); confirm.open({ title: `Submit ${sc.number} for approval?`, statement: `${v.variances} variance(s) · net ${fmtMoney(v.netValue)} · gross ${fmtMoney(v.absValue)}`, consequences: [{ engine: 'Workflow', text: v.absValue > 5000 ? 'Operations Manager approval (variance above ₹5,000)' : 'Auto-approved — below the adjustment threshold' }], confirmLabel: 'Submit count', onConfirm: () => { A.submitCount(id); toast.success('Submitted'); } }); }}>Submit for approval</Button>}
            {sc.status === 'Submitted' && <><Button variant="danger" disabled={!canAct.ok} reason={canAct.reason} onClick={() => setReject(true)}>Reject</Button><Button variant="primary" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Approve count ${sc.number}?`, statement: `${v.variances} variance(s) · net ${fmtMoney(v.netValue)}`, reasonRequired: true, confirmLabel: 'Approve count', onConfirm: (r) => { A.approveCountDirect(id, 'Approved', r); toast.success('Approved'); } })}>Approve</Button></>}
            {sc.status === 'Approved' && <Button variant="primary" onClick={() => confirm.open({ title: 'Post variance adjustment?', statement: `${v.variances} line(s) adjusted in ${sc.warehouseName} · net ${fmtMoney(v.netValue)}`, consequences: [{ engine: 'Stock', text: 'Stock is corrected to the counted quantities' }, { engine: 'Journal', text: 'Dr/Cr Inventory vs Inventory adjustments (5020)' }, { engine: 'Numbering', text: 'An approved Stock Adjustment is created and posted' }], confirmLabel: 'Post variance adjustment', onConfirm: () => { const r = A.postCountVariance(id); toast.success(r.adjustment ? `${r.adjustment.number} posted` : 'Count closed — no variances'); } })}>Post variance adjustment</Button>}
          </div>
        </div>
        {sc.status === 'Rejected' && <Banner tone="danger">Rejected — recount and resubmit. {approvals.filter((a) => a.docId === id).slice(-1)[0]?.history.slice(-1)[0]?.comment}</Banner>}
        <SummaryBlock items={[{ label: 'Lines', value: v.rows.length }, { label: 'Matched', value: v.matched, tone: 'good' }, { label: 'Variances', value: v.variances, tone: v.variances ? 'danger' : undefined }, { label: 'Pending', value: v.pending, tone: v.pending ? 'warn' : undefined }, { label: 'Net variance value', value: fmtMoney(v.netValue), tone: v.netValue < 0 ? 'danger' : v.netValue > 0 ? 'good' : undefined }, { label: 'Gross variance', value: fmtMoney(v.absValue) }, ...(sc.adjustmentNumber ? [{ label: 'Adjustment', value: sc.adjustmentNumber }] : [])]} />
        <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'sheet', label: 'Count sheet' }, { id: 'approvals', label: 'Approvals' }, { id: 'activity', label: 'Activity' }]} />
        {tab === 'sheet' && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 6, padding: '8px 12px', borderBottom: '1px solid #EAEAEA' }}>{(['all', 'pending', 'variance'] as const).map((k) => <button key={k} type="button" className={`chip ${showOnly === k ? 'selected' : ''}`} onClick={() => setShowOnly(k)}>{k === 'all' ? 'All' : k === 'pending' ? 'Pending' : 'Variances'}</button>)}</div>
            <table className="data-table">
              <thead><tr><th>SKU</th><th>Item</th><th>Batch</th><th className="right">System qty (frozen)</th><th className="right" style={{ width: 150 }}>Counted qty</th><th className="right">Variance</th><th className="right">Value</th><th>Counted by</th><th>Status</th></tr></thead>
              <tbody>{rows.map((l) => (
                <tr key={l.id} style={{ background: l.variance !== null && l.variance !== 0 ? '#FFF7E8' : l.variance === null ? '#FAFAFA' : undefined }}>
                  <td className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{l.itemCode}</td><td>{l.itemName}</td><td className="identifier">{l.batch ?? '—'}</td>
                  <td className="right money">{fmtQty(l.systemQty)}</td>
                  <td className="right">{editable ? <input type="number" step="any" className="field-input grid num" style={{ width: 120, border: l.countedQty === null ? '1px solid #325CFF' : undefined }} value={l.countedQty ?? ''} placeholder="Enter count" onChange={(e) => setCounts({ ...counts, [l.id]: e.target.value === '' ? null : Number(e.target.value) })} /> : <span className="money">{l.countedQty ?? '—'}</span>}</td>
                  <td className="right">{l.variance !== null ? <span className="money" style={{ fontWeight: 600, color: l.variance === 0 ? '#12784E' : '#C0393F' }}>{l.variance > 0 ? '+' : ''}{fmtQty(l.variance)}</span> : <span style={{ color: '#B0B5BF' }}>—</span>}</td>
                  <td className="right money" style={{ color: l.varianceValue < 0 ? '#C0393F' : undefined }}>{l.variance ? fmtMoney(l.varianceValue) : '—'}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{l.countedBy ? <TwoLine primary={l.countedBy} secondary={fmtDateTime(l.countedAt)} /> : '—'}</td>
                  <td><Badge status={l.variance === null ? 'Pending' : l.variance === 0 ? 'Matched' : 'Variance'}>{l.variance === null ? 'Pending' : l.variance === 0 ? 'Matched' : 'Variance'}</Badge></td>
                </tr>))}</tbody>
            </table>
          </div>)}
        {tab === 'approvals' && <div className="card" style={{ padding: 16 }}><ApprovalsTab approvalId={sc.approvalId} docId={sc.id} /></div>}
        {tab === 'activity' && <div className="card" style={{ padding: 16 }}><ActivityTab objectId={sc.id} correlationId={sc.correlationId} /></div>}
      </div>
      <Modal open={reject} onClose={() => setReject(false)} title="Reject count" description="The sheet goes back for a recount.">
        <RejectBody onDone={(r) => { run(() => A.approveCountDirect(id, 'Rejected', r), 'Rejected'); setReject(false); }} onCancel={() => setReject(false)} />
      </Modal>
      {confirm.dialog}
    </>
  );
}

function RejectBody({ onDone, onCancel }: { onDone: (r: string) => void; onCancel: () => void }) {
  const [r, setR] = useState('');
  return <div><TextArea label="Reason" value={r} onChange={setR} minLength={10} /><div className="modal-footer" style={{ padding: '16px 0 0' }}><Button onClick={onCancel}>Keep</Button><Button variant="danger" disabled={r.trim().length < 10} onClick={() => onDone(r)}>Reject count</Button></div></div>;
}

