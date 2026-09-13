// Stock transfers (FR-INV-006): register (incl. in-transit view), form, detail with dispatch / receive / reverse.
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, SelectField, TextArea, TextField, EntityPicker, useItemOptions, NumberField, ActivityTab, AccountingTab, AttachmentsPanel, RailSection, KV, useToast, Banner, EmptyState, PeriodBanner, ActionMenu, Modal, SummaryBlock } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, fmtDateTime } from '../../lib/format';
import type { StockTransfer, TransferLine } from './types';
import * as A from './actions';
import { useConfirm, ItemLink } from '../purchase/shared';
import { StockMovesForSource } from '../purchase/Grns';

export function Transfers({ id }: { id?: string }) {
  if (id === 'new') return <TransferForm />;
  if (id) return <TransferDetail id={id} />;
  return <TransferRegister />;
}

function TransferRegister() {
  const rows = useCollection<StockTransfer>(C.stockTransfers);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  const transit = mine.filter((r) => r.status === 'In Transit');
  return (
    <RegisterPage<StockTransfer> title="Stock transfers" subtitle={`${mine.length} transfers · ${transit.length} in transit (${fmtMoney(transit.reduce((x, r) => x + r.totalValue, 0))})`} entity="transfers" rows={mine} searchKeys={['number', 'fromWarehouseName', 'toWarehouseName', 'vehicleNo']}
      columns={[
        { key: 'number', label: 'TRF #', sortable: true, render: (r) => <span className="identifier link">{r.number}</span> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'fromWarehouseName', label: 'From', sortable: true }, { key: 'toWarehouseName', label: 'To', sortable: true },
        { key: 'item', label: 'Item(s)', render: (r) => <TwoLine primary={r.lines[0]?.itemName ?? '—'} secondary={r.lines.length > 1 ? `+${r.lines.length - 1} more` : r.lines[0]?.itemCode} /> },
        { key: 'qty', label: 'Qty', align: 'right', render: (r) => <span className="money">{fmtQty(r.lines.reduce((x, l) => x + l.qty, 0))}</span> },
        { key: 'received', label: 'Received', align: 'right', render: (r) => r.status === 'Completed' ? <span className="money">{fmtQty(r.lines.reduce((x, l) => x + (l.receivedQty ?? 0), 0))}{r.lines.some((l) => (l.shortageQty ?? 0) + (l.damageQty ?? 0) > 0) && <span style={{ color: '#C0393F' }}> (−{fmtQty(r.lines.reduce((x, l) => x + (l.shortageQty ?? 0) + (l.damageQty ?? 0), 0))})</span>}</span> : <span style={{ color: '#B0B5BF' }}>—</span> },
        { key: 'totalValue', label: 'Value', align: 'right', sortable: true, render: (r) => <span className="money">{fmtMoney(r.totalValue)}</span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totalValue, 0)) },
        { key: 'dispatchedAt', label: 'Dispatched', render: (r) => r.dispatchedAt ? fmtDate(r.dispatchedAt) : '—' },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status} /> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'transit', label: 'In transit', filter: (r) => r.status === 'In Transit' }, { id: 'done', label: 'Completed', filter: (r) => r.status === 'Completed' }, { id: 'rev', label: 'Reversed / cancelled', filter: (r) => r.status === 'Reversed' || r.status === 'Cancelled' }]}
      primaryAction={{ label: 'New transfer', onClick: () => nav.go('inventory/transfers/new'), disabled: !s.can('inventory.transfer.create'), reason: !s.can('inventory.transfer.create') ? 'Requires inventory.transfer.create' : undefined }} onRowClick={(r) => nav.go(`inventory/transfers/${r.id}`)}
      rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`inventory/transfers/${r.id}`) }, ...(r.status === 'In Transit' ? [{ label: 'Receive', onClick: () => nav.go(`inventory/transfers/${r.id}?receive=1`) }] : [])]} rowClass={(r) => (r.status === 'In Transit' ? 'selected' : undefined)} />
  );
}

function TransferForm({ existing }: { existing?: StockTransfer }) {
  const toast = useToast();
  const [t, setT] = useState<StockTransfer>(() => { const base = existing ?? A.newTransfer(); const itemParam = nav.get().params.item; return A.computeTransfer(itemParam && !existing ? { ...base, lines: [A.transferLine(itemParam, base.fromWarehouseId)] } : base); });
  const [errs, setErrs] = useState<string[]>([]);
  const items = useItemOptions((i) => i.isStock);
  const whs = A.activeWarehouses().filter((w) => w.type !== 'Transit');
  const set = (p: Partial<StockTransfer>) => setT((d) => A.computeTransfer({ ...d, ...p }));
  const upd = (lid: string, p: Partial<TransferLine>) => set({ lines: t.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const act = (dispatch: boolean) => { const e = A.validateTransfer(t); if (e.length) { setErrs(e); return; } try { const saved = A.saveTransfer(t); if (dispatch) { A.dispatchTransfer(saved.id); toast.success(`${saved.number} dispatched — stock in transit`); } else toast.success(`${saved.number} saved`); nav.go(`inventory/transfers/${saved.id}`); } catch (err: any) { setErrs([err.message]); } };
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: '#5F6368' }} onClick={() => nav.back('inventory/transfers')}>← Transfers</button><h1 className="page-title">{existing ? `Edit ${existing.number}` : 'New stock transfer'}</h1><div className="page-subtitle">Draft → Dispatch (source → In-Transit) → Receive (In-Transit → destination, shortage / damage to scrap)</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" onClick={() => nav.back('inventory/transfers')}>Discard</Button><Button onClick={() => act(false)}>Save draft</Button><Button variant="primary" onClick={() => act(true)}>Save &amp; dispatch</Button></div>
      </div>
      <PeriodBanner date={t.date} />
      {errs.length > 0 && <Banner tone="danger" onDismiss={() => setErrs([])}><ul style={{ margin: 0, paddingLeft: 16 }}>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul></Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <DateField label="Date" required value={t.date} onChange={(v) => set({ date: v })} checkPeriod />
        <SelectField label="From warehouse" required value={t.fromWarehouseId} onChange={(v) => set({ fromWarehouseId: v, lines: t.lines.map((l) => (l.itemId ? { ...A.transferLine(l.itemId, v, l.qty), id: l.id, batch: l.batch } : l)) })} options={whs.map((w) => ({ value: w.id, label: w.name }))} />
        <SelectField label="To warehouse" required value={t.toWarehouseId} onChange={(v) => set({ toWarehouseId: v })} options={whs.filter((w) => w.id !== t.fromWarehouseId).map((w) => ({ value: w.id, label: w.name }))} />
        <TextField label="Vehicle / LR no." value={t.vehicleNo} onChange={(v) => set({ vehicleNo: v })} />
        <TextArea label="Notes" value={t.notes} onChange={(v) => set({ notes: v })} style={{ gridColumn: 'span 4' }} rows={1} />
      </div>
      <div className="card" style={{ overflow: 'visible' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 36 }}>#</th><th style={{ minWidth: 260 }}>Item</th><th className="right">Available at source</th><th className="right" style={{ width: 120 }}>Qty</th><th style={{ width: 70 }}>UOM</th><th style={{ width: 160 }}>Batch / serials</th><th className="right">Rate</th><th className="right">Value</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {t.lines.map((l, i) => { const item = db.find<Item>(C.items, l.itemId); const pos = l.itemId ? engine.stockPosition(l.itemId, t.fromWarehouseId, { batch: l.batch || undefined }) : undefined; return (
              <tr key={l.id} className={pos && l.qty > pos.available ? 'error-row' : ''}>
                <td>{i + 1}</td>
                <td><EntityPicker size="grid" value={l.itemId} onChange={(iid) => upd(l.id, iid ? { ...A.transferLine(iid, t.fromWarehouseId, l.qty || 1), id: l.id } : { itemId: undefined, itemName: '' })} options={items} recentKey="items" /></td>
                <td className="right money" style={{ color: pos && l.qty > pos.available ? '#C0393F' : '#5F6368' }}>{pos ? `${fmtQty(pos.available)} (${fmtQty(pos.onHand)} on hand)` : '—'}</td>
                <td><NumberField size="grid" value={l.qty} onChange={(v) => upd(l.id, { qty: v })} decimals={3} min={0} /></td>
                <td style={{ fontSize: 12 }}>{l.uom}</td>
                <td>{item?.tracking === 'Batch' ? <select className="field-input grid" value={l.batch ?? ''} onChange={(e) => upd(l.id, { batch: e.target.value || undefined })}><option value="">Any batch</option>{A.batchBalances(item.id, t.fromWarehouseId).filter((b) => b.qty > 0).map((b) => <option key={b.batch} value={b.batch}>{b.batch} ({fmtQty(b.qty)})</option>)}</select> : item?.tracking === 'Serial' ? <input className="field-input grid" placeholder="Serials, comma-separated" value={(l.serials ?? []).join(',')} onChange={(e) => upd(l.id, { serials: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} /> : <span style={{ color: '#B0B5BF', fontSize: 12 }}>—</span>}</td>
                <td className="right money">{fmtMoney(l.rate)}</td><td className="right money">{fmtMoney(l.amount)}</td>
                <td><button type="button" className="btn-icon" onClick={() => set({ lines: t.lines.filter((x) => x.id !== l.id) })}>✕</button></td>
              </tr>); })}
            {t.lines.length === 0 && <tr><td colSpan={9} style={{ textAlign: 'center', color: '#5F6368', height: 64 }}>No lines</td></tr>}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #EAEAEA', background: '#F9FBFC', fontSize: 12, color: '#5F6368' }}><button type="button" className="btn-link" onClick={() => set({ lines: [...t.lines, { ...engine.newLine({ warehouseId: t.fromWarehouseId }) } as TransferLine] })}>+ Add line</button><span>Transfer value <strong style={{ color: '#0A0A0A' }}>{fmtMoney(t.totalValue)}</strong> at source AVCO</span></div>
      </div>
    </div>
  );
}

function TransferDetail({ id }: { id: string }) {
  const t = useRecord<StockTransfer>(C.stockTransfers, id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [receive, setReceive] = useState(!!nav.get().params.receive);
  const [recv, setRecv] = useState<Record<string, { receivedQty: number; damageQty: number; reason: string }>>({});
  if (!t) return <EmptyState title="Transfer not found" action={<Button onClick={() => nav.go('inventory/transfers')}>Back</Button>} />;
  if (nav.get().params.edit && t.status === 'Draft') return <TransferForm existing={t} />;
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const line = (l: TransferLine) => recv[l.id] ?? { receivedQty: l.qty, damageQty: 0, reason: '' };
  const doReceive = () => run(() => { A.receiveTransfer(id, t.lines.map((l) => ({ lineId: l.id, ...line(l) }))); setReceive(false); }, 'Transfer received');
  return (
    <>
      <DocumentPage backLabel="Transfers" onBack={() => nav.go('inventory/transfers')} number={t.number} badges={<Badge status={t.status} />} amount={{ label: 'Transfer value', value: t.totalValue, currency: s.currency }}
        rail={<><RailSection label="Route"><KV items={[{ k: 'From', v: t.fromWarehouseName }, { k: 'To', v: t.toWarehouseName }, { k: 'Date', v: fmtDate(t.date) }, { k: 'Vehicle / LR', v: t.vehicleNo ?? '—' }, { k: 'Dispatched', v: t.dispatchedAt ? `${fmtDateTime(t.dispatchedAt)} · ${t.dispatchedBy}` : '—' }, { k: 'Received', v: t.receivedAt ? `${fmtDateTime(t.receivedAt)} · ${t.receivedBy}` : '—' }, ...(t.reversalReason ? [{ k: 'Reversed', v: t.reversalReason }] : []), ...(t.cancelReason ? [{ k: 'Cancelled', v: t.cancelReason }] : [])]} /></RailSection><RailSection label="Attachments"><AttachmentsPanel objectType="Stock Transfer" objectId={t.id} readOnly={t.status !== 'Draft'} /></RailSection></>}
        tabs={[
          { id: 'lines', label: 'Lines', content: <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{t.status === 'In Transit' && <Banner tone="info">Goods are in the transit warehouse. Receive to move them into {t.toWarehouseName}; record shortage / damage with a reason.</Banner>}<div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>#</th><th>Item</th><th className="right">Dispatched</th><th className="right">Received</th><th className="right">Damaged</th><th className="right">Short</th><th>Reason</th><th>Batch / serial</th><th className="right">Rate</th><th className="right">Value</th></tr></thead><tbody>{t.lines.map((l, i) => <tr key={l.id} className={(l.shortageQty ?? 0) + (l.damageQty ?? 0) > 0 ? 'error-row' : ''}><td>{i + 1}</td><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money">{fmtQty(l.qty)}</td><td className="right money">{l.receivedQty !== undefined ? fmtQty(l.receivedQty) : '—'}</td><td className="right money" style={{ color: l.damageQty ? '#C0393F' : undefined }}>{l.damageQty ? fmtQty(l.damageQty) : '—'}</td><td className="right money" style={{ color: l.shortageQty ? '#C0393F' : undefined }}>{l.shortageQty ? fmtQty(l.shortageQty) : '—'}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{l.shortageReason ?? '—'}</td><td className="identifier">{l.batch ?? (l.serials?.length ? `${l.serials.length} sn` : '—')}</td><td className="right money">{fmtMoney(l.rate)}</td><td className="right money">{fmtMoney(l.amount)}</td></tr>)}</tbody></table></div></div> },
          { id: 'stock', label: 'Stock movements', content: <StockMovesForSource sourceId={t.id} /> },
          { id: 'accounting', label: 'Accounting', content: t.journalId ? <AccountingTab journalId={t.journalId} currency={s.currency} /> : <EmptyState compact title="No accounting impact" description="Transfers between warehouses of the same company move quantity only; shortage / damage posts to Scrap & Rework." /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={t.id} correlationId={t.correlationId} /> },
        ]}
        footer={<>
          <div style={{ flex: 1 }} />
          {t.status === 'Draft' && <Button onClick={() => nav.go(`inventory/transfers/${id}?edit=1`)}>Edit</Button>}
          {t.status === 'Draft' && <Button variant="primary" onClick={() => confirm.open({ title: `Dispatch ${t.number}?`, statement: `${t.lines.length} line(s) leave ${t.fromWarehouseName} into In-Transit.`, consequences: [{ engine: 'Stock', text: 'Transfer Out at source · Transfer In at transit warehouse' }], confirmLabel: 'Dispatch', onConfirm: () => { A.dispatchTransfer(id); toast.success('Dispatched'); } })}>Dispatch</Button>}
          {t.status === 'In Transit' && <Button variant="primary" onClick={() => setReceive(true)}>Receive</Button>}
          {(t.status === 'In Transit' || t.status === 'Completed') && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Reverse transfer', danger: true, onClick: () => confirm.open({ title: `Reverse ${t.number}?`, consequences: [{ engine: 'Stock', text: 'All movements reversed — goods return to the source warehouse', tone: 'warning' }], reasonRequired: true, confirmLabel: 'Reverse transfer', cancelLabel: 'Keep', danger: true, onConfirm: (r) => { A.reverseTransfer(id, r); toast.success('Reversed'); } }) }]} />}
          {t.status === 'Draft' && <Button variant="ghost" onClick={() => confirm.open({ title: `Cancel ${t.number}?`, reasonRequired: true, confirmLabel: 'Cancel transfer', cancelLabel: 'Keep', danger: true, onConfirm: (r) => A.cancelTransfer(id, r) })}>Cancel</Button>}
        </>} />
      <Modal open={receive} onClose={() => setReceive(false)} title={`Receive ${t.number} at ${t.toWarehouseName}`} description="Confirm the quantity received; shortage and damage move to the scrap warehouse with a reason and post to Scrap & Rework." width={760} footer={<><Button onClick={() => setReceive(false)}>Cancel</Button><Button variant="primary" onClick={doReceive}>Confirm receipt</Button></>}>
        <SummaryBlock items={[{ label: 'Dispatched', value: fmtQty(t.lines.reduce((x, l) => x + l.qty, 0)) }, { label: 'Receiving', value: fmtQty(t.lines.reduce((x, l) => x + line(l).receivedQty, 0)), tone: 'good' }, { label: 'Damage / short', value: fmtQty(t.lines.reduce((x, l) => x + line(l).damageQty + (l.qty - line(l).receivedQty - line(l).damageQty), 0)), tone: 'danger' }]} />
        <div className="card" style={{ marginTop: 12, overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Item</th><th className="right">Dispatched</th><th className="right" style={{ width: 110 }}>Received</th><th className="right" style={{ width: 100 }}>Damaged</th><th className="right">Short</th><th style={{ minWidth: 180 }}>Reason</th></tr></thead><tbody>{t.lines.map((l) => { const r = line(l); const short = Math.max(0, l.qty - r.receivedQty - r.damageQty); return <tr key={l.id}><td>{l.itemName}</td><td className="right money">{fmtQty(l.qty)}</td><td><NumberField size="grid" value={r.receivedQty} onChange={(v) => setRecv({ ...recv, [l.id]: { ...r, receivedQty: v } })} decimals={3} min={0} max={l.qty} /></td><td><NumberField size="grid" value={r.damageQty} onChange={(v) => setRecv({ ...recv, [l.id]: { ...r, damageQty: v } })} decimals={3} min={0} max={l.qty} /></td><td className="right money" style={{ color: short ? '#C0393F' : undefined }}>{fmtQty(short)}</td><td><input className="field-input grid" placeholder={short || r.damageQty ? 'Required' : 'Optional'} value={r.reason} onChange={(e) => setRecv({ ...recv, [l.id]: { ...r, reason: e.target.value } })} /></td></tr>; })}</tbody></table></div>
      </Modal>
      {confirm.dialog}
    </>
  );
}
