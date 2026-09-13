// Material issues — register, issue/return form with batch & serial picking, detail (FR-MFG-009).
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item } from '../../store';
import { RegisterPage, PageHeader, Button, Badge, NumberField, DateField, SelectField, TextArea, EntityPicker, ScopeLine, SummaryBlock, DataTable, useToast, PeriodBanner, EmptyState, Pill, KV, Segmented, ActivityTab, AccountingTab, type Column } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, today } from '../../lib/format';
import type { MaterialIssue, ProductionOrder } from './types';
import { batchesOnHand, mfgSettings, serialsOnHand, whName, wipBatchesForOrder } from './core';
import { defaultIssueLines, postIssue, postReturn, reverseIssue, type IssueLineInput } from './issueActions';
import { useConfirm, SectionCard, OrderLink, ItemLink, JournalLink } from './shared';

export function IssuesPage({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <IssueForm orderId={params.order} mode={params.mode === 'return' ? 'Return' : 'Issue'} />;
  if (id) return <IssueDetail id={id} />;
  return <IssueRegister />;
}

function IssueRegister() {
  const s = useSession();
  const cid = s.state.companyId;
  const issues = useCollection<MaterialIssue>(C.materialIssues).filter((i) => i.companyId === cid);
  const orders = useCollection<ProductionOrder>(C.productionOrders);
  const toast = useToast();
  const confirm = useConfirm();
  const rows = useMemo(() => issues.slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [issues]);
  const open = orders.filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const columns: Column<MaterialIssue>[] = [
    { key: 'number', label: 'Document', sortable: true, render: (i) => <span className="identifier link" style={{ fontWeight: 500 }}>{i.number}</span> },
    { key: 'type', label: 'Type', render: (i) => <Badge status={i.type === 'Return' ? 'Returned' : i.type === 'Backflush' ? 'Matched' : 'Posted'}>{i.type}</Badge> },
    { key: 'date', label: 'Date', sortable: true, render: (i) => fmtDate(i.date) },
    { key: 'orderNumber', label: 'Production order', render: (i) => <div><OrderLink id={i.orderId} number={i.orderNumber} /><div className="cell-secondary">{db.find<ProductionOrder>(C.productionOrders, i.orderId)?.itemName ?? ''}</div></div> },
    { key: 'lines', label: 'Lines', align: 'right', render: (i) => <span className="money">{i.lines.length}</span> },
    { key: 'items', label: 'Materials', render: (i) => <span style={{ fontSize: 12 }}>{i.lines.slice(0, 2).map((l) => `${l.itemName} ${fmtQty(l.qty, l.uom, 3)}`).join(', ')}{i.lines.length > 2 ? ` +${i.lines.length - 2}` : ''}</span> },
    { key: 'totalValue', label: 'Value', align: 'right', sortable: true, render: (i) => <span className="money">{fmtMoney(i.totalValue, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + (x.status === 'Posted' ? (x.type === 'Return' ? -x.totalValue : x.totalValue) : 0), 0), s.currency)}</span> },
    { key: 'journalNumber', label: 'Journal', render: (i) => <JournalLink id={i.journalId} /> },
    { key: 'status', label: 'Status', render: (i) => <Badge status={i.status} /> },
  ];
  return (
    <>
      <RegisterPage title="Material issues" subtitle={<ScopeLine extra={`${issues.filter((i) => i.status === 'Posted').length} posted · net ${fmtMoney(issues.filter((i) => i.status === 'Posted').reduce((a, i) => a + (i.type === 'Return' ? -i.totalValue : i.totalValue), 0), s.currency)} to WIP`} />}
        rows={rows} columns={columns} entity="issues" searchKeys={['number', 'orderNumber']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'issue', label: 'Issues', filter: (i) => i.type === 'Issue' }, { id: 'backflush', label: 'Backflush', filter: (i) => i.type === 'Backflush' }, { id: 'return', label: 'Returns', filter: (i) => i.type === 'Return' }, { id: 'reversed', label: 'Reversed', filter: (i) => i.status === 'Reversed' }]}
        primaryAction={{ label: 'Issue materials', onClick: () => nav.go('production/issues/new'), disabled: open.length === 0, reason: open.length === 0 ? 'No released production orders' : undefined }}
        onRowClick={(i) => nav.go(`production/issues/${i.id}`)}
        rowActions={(i) => [{ label: 'Open order', onClick: () => nav.go(`production/orders/${i.orderId}`) }, { label: 'Reverse', danger: true, onClick: () => confirm.open({ title: `Reverse ${i.number}?`, reasonRequired: true, confirmLabel: 'Reverse issue', danger: true, consequences: [{ engine: 'Stock', text: 'Movements reversed with linked entries' }, { engine: 'Journal', text: 'Reversal journal posted' }], onConfirm: (r) => { reverseIssue(i.id, r); toast.success(`${i.number} reversed`); } }), disabled: i.status !== 'Posted', reason: i.status !== 'Posted' ? `Already ${i.status}` : undefined }]} />
      {confirm.dialog}
    </>
  );
}

function IssueForm({ orderId, mode }: { orderId?: string; mode: 'Issue' | 'Return' }) {
  const s = useSession();
  const toast = useToast();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const settings = mfgSettings();
  const [oid, setOid] = useState(orderId ?? orders[0]?.id ?? '');
  const [kind, setKind] = useState<'Issue' | 'Return'>(mode);
  const order = useRecord<ProductionOrder>(C.productionOrders, oid);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<IssueLineInput[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState('');
  if (order && loadedFor !== `${order.id}:${kind}`) {
    setLoadedFor(`${order.id}:${kind}`);
    setLines(kind === 'Issue' ? defaultIssueLines(order).filter((l) => l.qty > 0) : order.components.filter((c) => c.issuedQty - c.returnedQty - c.consumedQty > 0).map((c) => { const wipB = wipBatchesForOrder(order, c.itemId); return { componentId: c.id, itemId: c.itemId, qty: Math.round((c.issuedQty - c.returnedQty - c.consumedQty) * 1000) / 1000, batch: wipB[0]?.batch, warehouseId: c.warehouseId ?? order.rmWarehouseId, serials: c.tracking === 'Serial' ? wipB[0]?.serials : undefined }; }));
  }
  const setLine = (i: number, patch: Partial<IssueLineInput>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const value = lines.reduce((a, l) => { const wh = kind === 'Issue' ? l.warehouseId ?? order?.rmWarehouseId ?? '' : order?.wipWarehouseId ?? ''; return a + l.qty * engine.stockPosition(l.itemId, wh, { batch: l.batch }).avgRate; }, 0);
  const submit = () => {
    if (!order) { setErr('Choose a production order'); return; }
    try {
      const doc = kind === 'Issue' ? postIssue(order.id, lines.filter((l) => l.qty > 0), { date, notes }) : postReturn(order.id, lines.filter((l) => l.qty > 0), { date, notes });
      toast.success(`${doc.number} posted · ${fmtMoney(doc.totalValue, s.currency)} ${kind === 'Issue' ? 'to' : 'from'} WIP`, { label: 'Open', path: `production/issues/${doc.id}` });
      nav.go(`production/orders/${order.id}?tab=components`);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="page">
      <PageHeader title={kind === 'Issue' ? 'Issue materials to production' : 'Return materials from the floor'} subtitle={order ? `${order.number} · ${order.itemName} × ${order.qty} ${order.uom}` : 'Pick a released production order'} back={{ label: order ? order.number : 'Material issues', path: order ? `production/orders/${order.id}` : 'production/issues' }}
        actions={<><Segmented value={kind} onChange={(v) => setKind(v)} options={[{ value: 'Issue', label: 'Issue' }, { value: 'Return', label: 'Return' }]} /><Button onClick={() => nav.go('production/issues')}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!order || lines.every((l) => l.qty <= 0)} reason={!order ? 'Choose an order' : lines.every((l) => l.qty <= 0) ? 'Nothing to post' : undefined}>{kind === 'Issue' ? 'Post issue' : 'Post return'}</Button></>} />
      <PeriodBanner date={date} />
      {err && <div className="banner danger">{err}</div>}
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
          <SelectField label="Production order" required value={oid} onChange={setOid} options={orders.map((o) => ({ value: o.id, label: `${o.number} · ${o.itemName} × ${o.qty}` }))} placeholder="Pick an order" allowEmpty />
          <DateField label="Date" value={date} onChange={setDate} checkPeriod />
          <div><label className="field-label">From → to</label><div style={{ fontSize: 13, paddingTop: 8 }}>{order ? (kind === 'Issue' ? `${whName(order.rmWarehouseId)} → ${whName(order.wipWarehouseId)}` : `${whName(order.wipWarehouseId)} → ${whName(order.rmWarehouseId)}`) : '—'}</div></div>
          <div><label className="field-label">Tolerance</label><div style={{ fontSize: 13, paddingTop: 8 }}>Over-issue blocked above +{settings.overIssueTolerancePct}%</div></div>
        </div>
      </SectionCard>
      {order ? (
        <SectionCard title={kind === 'Issue' ? 'Lines — defaults to remaining planned quantity incl. scrap' : 'Lines — floor stock available to return'} padding={0}>
          <table className="data-table dense"><thead><tr><th>Component</th><th className="right">Planned</th><th className="right">Issued</th><th className="right">{kind === 'Issue' ? 'Remaining' : 'On floor'}</th><th className="right" style={{ width: 120 }}>Qty</th><th style={{ width: 200 }}>Batch / serials</th><th>Warehouse</th><th className="right">Rate</th><th className="right">Value</th></tr></thead><tbody>
            {lines.map((l, i) => {
              const cmp = order.components.find((c) => c.id === l.componentId) ?? order.components.find((c) => c.itemId === l.itemId);
              const it = db.find<Item>(C.items, l.itemId);
              const whId = kind === 'Issue' ? l.warehouseId ?? order.rmWarehouseId : order.wipWarehouseId;
              const batches = kind === 'Issue' ? batchesOnHand(l.itemId, whId) : wipBatchesForOrder(order, l.itemId).map((b) => ({ batch: b.batch ?? '', qty: b.qty, rate: b.rate }));
              const pos = engine.stockPosition(l.itemId, whId, { batch: l.batch });
              const remaining = cmp ? (kind === 'Issue' ? Math.max(0, cmp.plannedQty - cmp.issuedQty + cmp.returnedQty) : cmp.issuedQty - cmp.returnedQty - cmp.consumedQty) : 0;
              const over = cmp && kind === 'Issue' && l.qty > cmp.plannedQty * (1 + settings.overIssueTolerancePct / 100) - cmp.issuedQty + cmp.returnedQty + 0.0005;
              return (
                <tr key={l.componentId ?? l.itemId} className={over ? 'error-row' : undefined}>
                  <td><ItemLink id={l.itemId} name={it?.name} /><div className="cell-secondary identifier">{it?.code} · {it?.tracking ?? 'None'}</div></td>
                  <td className="right money">{cmp ? fmtQty(cmp.plannedQty, cmp.uom, 3) : '—'}</td>
                  <td className="right money">{cmp ? fmtQty(cmp.issuedQty, undefined, 3) : '—'}</td>
                  <td className="right money">{fmtQty(remaining, undefined, 3)}</td>
                  <td><NumberField value={l.qty} onChange={(v) => setLine(i, { qty: v })} decimals={3} size="grid" error={over ? 'Over tolerance' : undefined} /></td>
                  <td>
                    {it?.tracking === 'Batch' ? <SelectField value={l.batch ?? ''} onChange={(v) => setLine(i, { batch: v || undefined })} options={[{ value: '', label: 'Pick batch…' }, ...batches.map((b) => ({ value: b.batch, label: `${b.batch} · ${fmtQty(b.qty, undefined, 3)} avail` }))]} size="grid" />
                      : it?.tracking === 'Serial' ? <SelectField value={(l.serials ?? []).join(',')} onChange={(v) => setLine(i, { serials: v ? v.split(',') : [] })} options={[{ value: '', label: 'Pick serials…' }, ...(kind === 'Issue' ? serialsOnHand(l.itemId, whId) : batches.flatMap(() => [])).slice(0, 20).map((sn) => ({ value: sn, label: sn }))]} size="grid" />
                      : <span style={{ fontSize: 12, color: '#B0B5BF' }}>Not tracked</span>}
                    {it?.tracking === 'Batch' && !l.batch && <div className="field-error">Batch required</div>}
                  </td>
                  <td style={{ fontSize: 12 }}>{whName(whId)}<div className="cell-secondary">{fmtQty(pos.available, undefined, 3)} available</div></td>
                  <td className="right money">{fmtMoney(pos.avgRate, s.currency)}</td>
                  <td className="right money">{fmtMoney(l.qty * pos.avgRate, s.currency)}</td>
                </tr>);
            })}
            {lines.length === 0 && <tr><td colSpan={9} style={{ padding: 16, color: '#5F6368' }}>{kind === 'Issue' ? 'Everything planned has been issued.' : 'No floor stock to return.'}</td></tr>}
          </tbody><tfoot><tr><td colSpan={8}>Total {kind === 'Issue' ? 'to WIP' : 'from WIP'}</td><td className="right money">{fmtMoney(value, s.currency)}</td></tr></tfoot></table>
        </SectionCard>
      ) : <EmptyState title="Pick a production order" description="Only Released / In Progress orders accept material issues." icon="🧾" />}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
        <SectionCard title="Notes"><TextArea value={notes} onChange={setNotes} rows={2} placeholder="Optional note recorded on the issue" /></SectionCard>
        <SectionCard title="Projected journal">
          <SummaryBlock style={{ flexDirection: 'column', gap: 6 }} items={kind === 'Issue' ? [{ label: 'Dr 1220 Work in Progress', value: fmtMoney(value, s.currency) }, { label: 'Cr inventory (1210 / 1200)', value: fmtMoney(value, s.currency) }] : [{ label: 'Dr inventory (1210 / 1200)', value: fmtMoney(value, s.currency) }, { label: 'Cr 1220 Work in Progress', value: fmtMoney(value, s.currency) }]} />
          <div style={{ marginTop: 8, fontSize: 12, color: '#6E6E71' }}>Valued at the warehouse moving-average rate. Duplicate postings of the same lines within a minute are blocked.</div>
        </SectionCard>
      </div>
    </div>
  );
}

function IssueDetail({ id }: { id: string }) {
  const s = useSession();
  const i = useRecord<MaterialIssue>(C.materialIssues, id);
  const toast = useToast();
  const confirm = useConfirm();
  if (!i) return <EmptyState title="Issue not found" action={<Button onClick={() => nav.go('production/issues')}>Back</Button>} />;
  const order = db.find<ProductionOrder>(C.productionOrders, i.orderId);
  return (
    <div className="page">
      <PageHeader title={i.number} subtitle={`${i.type} · ${fmtDate(i.date)} · ${i.orderNumber} · posted by ${i.postedBy} ${fmtDateTime(i.postedAt)}`} back={{ label: 'Material issues', path: 'production/issues' }}
        actions={<><Badge status={i.status} /><Button onClick={() => nav.go(`production/orders/${i.orderId}?tab=components`)}>Open order</Button><Button variant="danger" disabled={i.status !== 'Posted'} reason={i.status !== 'Posted' ? `Already ${i.status}` : undefined} onClick={() => confirm.open({ title: `Reverse ${i.number}?`, reasonRequired: true, confirmLabel: 'Reverse issue', danger: true, consequences: [{ engine: 'Stock', text: 'Stock movements reversed' }, { engine: 'Journal', text: 'Linked reversal journal' }], onConfirm: (r) => { reverseIssue(i.id, r); toast.success('Reversed'); } })}>Reverse</Button></>} />
      {i.reversalOfId && <div className="banner info">This document reverses {db.find<MaterialIssue>(C.materialIssues, i.reversalOfId)?.number}: {i.reversalReason}</div>}
      {i.status === 'Reversed' && <div className="banner warning">Reversed by {db.find<MaterialIssue>(C.materialIssues, i.reversedById ?? '')?.number}: {i.reversalReason}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <SectionCard title="Lines" padding={0}>
          <DataTable rows={i.lines} columns={[
            { key: 'itemName', label: 'Item', render: (l) => <div><ItemLink id={l.itemId} name={l.itemName} /><div className="cell-secondary identifier">{l.itemCode}</div></div> },
            { key: 'qty', label: 'Qty', align: 'right', render: (l) => <span className="money">{fmtQty(l.qty, l.uom, 3)}</span> },
            { key: 'batch', label: 'Batch / serials', render: (l) => <span className="identifier" style={{ fontSize: 12 }}>{l.batch ?? l.serials?.join(', ') ?? '—'}</span> },
            { key: 'warehouseId', label: 'From', render: (l) => whName(l.warehouseId) },
            { key: 'rate', label: 'Rate', align: 'right', render: (l) => <span className="money">{fmtMoney(l.rate, s.currency)}</span> },
            { key: 'value', label: 'Value', align: 'right', render: (l) => <span className="money">{fmtMoney(l.value, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, l) => a + l.value, 0), s.currency)}</span> },
          ] as Column<MaterialIssue['lines'][number]>[]} showTotals />
          <div style={{ padding: 16 }}><AccountingTab journalId={i.journalId} currency={s.currency} /></div>
        </SectionCard>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Document"><KV items={[{ k: 'Type', v: i.type }, { k: 'Order', v: <OrderLink id={i.orderId} number={i.orderNumber} /> }, { k: 'Item', v: order?.itemName ?? '—' }, { k: 'Total value', v: fmtMoney(i.totalValue, s.currency) }, { k: 'Journal', v: <JournalLink id={i.journalId} /> }, { k: 'Movements', v: `${i.movementIds.length}` }, { k: 'Notes', v: i.notes ?? '—' }]} /></SectionCard>
          <SectionCard title="Activity"><ActivityTab objectId={i.id} correlationId={i.correlationId} /></SectionCard>
        </div>
      </div>
      {confirm.dialog}
    </div>
  );
}
