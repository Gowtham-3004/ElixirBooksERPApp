// Genealogy — forward and reverse batch/serial trace across issues, orders, outputs and downstream movements (FR-MFG-015).
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { StockMovement } from '../../store';
import { PageHeader, Button, Badge, Pill, TextField, Segmented, DataTable, SummaryBlock, EmptyState, KV, useToast, type Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import type { MaterialIssue, ProductionOrder, ProductionReceipt, QualityInspection, SubcontractOrder } from './types';
import { whName } from './core';
import { SectionCard, OrderLink, ItemLink, DocLink } from './shared';

interface TraceNode {
  order: ProductionOrder;
  outputs: ProductionReceipt[];
  components: { itemId: string; itemName: string; qty: number; batch?: string; serials?: string[]; issueNumber: string; issueId: string; source: 'Issue' | 'Subcontract' }[];
  inspections: QualityInspection[];
  downstream: StockMovement[];
}

export function GenealogyPage({ params, id }: { params: Record<string, string>; id?: string }) {
  const s = useSession();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid);
  const receipts = useCollection<ProductionReceipt>(C.productionReceipts).filter((r) => r.companyId === cid);
  const issues = useCollection<MaterialIssue>(C.materialIssues).filter((i) => i.companyId === cid);
  const subs = useCollection<SubcontractOrder>(C.subcontractOrders).filter((x) => x.companyId === cid);
  const inspections = useCollection<QualityInspection>(C.qualityInspections).filter((q) => q.companyId === cid);
  const moves = useCollection<StockMovement>(C.stockMovements).filter((m) => m.companyId === cid);
  const [q, setQ] = useState(params.q ?? id ?? '');
  const [dir, setDir] = useState<'forward' | 'reverse'>('forward');

  const suggestions = useMemo(() => {
    const out = new Set<string>();
    receipts.filter((r) => r.status === 'Posted').forEach((r) => { if (r.batch) out.add(r.batch); (r.serials ?? []).forEach((sn) => out.add(sn)); });
    return Array.from(out).slice(0, 24);
  }, [receipts]);

  /** Forward: a finished lot/serial → its production order → components issued → where it went. */
  const forward = useMemo((): TraceNode[] => {
    if (!q.trim()) return [];
    const term = q.trim().toLowerCase();
    const matched = receipts.filter((r) => r.status === 'Posted' && ((r.batch ?? '').toLowerCase() === term || (r.serials ?? []).some((sn) => sn.toLowerCase() === term) || r.number.toLowerCase() === term || r.orderNumber.toLowerCase() === term));
    const orderIds = Array.from(new Set(matched.map((r) => r.orderId).concat(orders.filter((o) => o.number.toLowerCase() === term || (o.lotNumber ?? '').toLowerCase() === term).map((o) => o.id))));
    return orderIds.map((oid) => {
      const order = orders.find((o) => o.id === oid)!;
      if (!order) return null;
      const outputs = receipts.filter((r) => r.orderId === oid && r.status === 'Posted');
      const components = [
        ...issues.filter((i) => i.orderId === oid && i.status === 'Posted' && i.type !== 'Return').flatMap((i) => i.lines.map((l) => ({ itemId: l.itemId, itemName: l.itemName, qty: l.qty, batch: l.batch, serials: l.serials, issueNumber: i.number, issueId: i.id, source: 'Issue' as const }))),
        ...subs.filter((x) => x.orderId === oid).flatMap((x) => x.itemsSent.map((l) => ({ itemId: l.itemId, itemName: l.itemName, qty: l.qty, batch: l.batch, serials: undefined, issueNumber: x.number, issueId: x.id, source: 'Subcontract' as const }))),
      ];
      const outBatches = outputs.map((r) => r.batch).filter(Boolean) as string[];
      const outSerials = outputs.flatMap((r) => r.serials ?? []);
      const downstream = moves.filter((m) => m.baseQty < 0 && !m.reversalOfId && m.sourceType !== 'Production Receipt' && m.itemId === order.itemId && ((m.batch && outBatches.includes(m.batch)) || (m.serials ?? []).some((sn) => outSerials.includes(sn))));
      return { order, outputs, components, inspections: inspections.filter((x) => (x.refType === 'Production Order' && x.refId === oid) || (x.refType === 'Production Receipt' && outputs.some((r) => r.id === x.refId))), downstream };
    }).filter(Boolean) as TraceNode[];
  }, [q, receipts, orders, issues, subs, inspections, moves]);

  /** Reverse: a component batch → every production order it was issued to → the finished lots produced. */
  const reverse = useMemo(() => {
    if (!q.trim()) return [];
    const term = q.trim().toLowerCase();
    const hits = issues.filter((i) => i.status === 'Posted' && i.type !== 'Return' && i.lines.some((l) => (l.batch ?? '').toLowerCase() === term || (l.serials ?? []).some((sn) => sn.toLowerCase() === term)));
    const subHits = subs.filter((x) => x.itemsSent.some((l) => (l.batch ?? '').toLowerCase() === term));
    const orderIds = Array.from(new Set([...hits.map((i) => i.orderId), ...subHits.map((x) => x.orderId).filter(Boolean) as string[]]));
    return orderIds.map((oid) => {
      const order = orders.find((o) => o.id === oid);
      if (!order) return null;
      const lines = hits.filter((i) => i.orderId === oid).flatMap((i) => i.lines.filter((l) => (l.batch ?? '').toLowerCase() === term || (l.serials ?? []).some((sn) => sn.toLowerCase() === term)).map((l) => ({ ...l, issueNumber: i.number, date: i.date })));
      const outputs = receipts.filter((r) => r.orderId === oid && r.status === 'Posted');
      return { order, lines, outputs, qtyUsed: lines.reduce((a, l) => a + l.qty, 0) };
    }).filter(Boolean) as { order: ProductionOrder; lines: any[]; outputs: ProductionReceipt[]; qtyUsed: number }[];
  }, [q, issues, subs, orders, receipts]);

  const hasResult = dir === 'forward' ? forward.length > 0 : reverse.length > 0;
  return (
    <div className="page">
      <PageHeader title="Genealogy" subtitle="Trace a finished lot or serial back to its components, or a component batch forward to every finished lot"
        actions={<><Segmented value={dir} onChange={(v) => setDir(v)} options={[{ value: 'forward', label: 'Finished lot → components' }, { value: 'reverse', label: 'Component batch → finished lots' }]} /><Button onClick={() => window.print()} disabled={!hasResult} reason={!hasResult ? 'Search first' : undefined}>Print</Button></>} />
      <SectionCard>
        <TextField label={dir === 'forward' ? 'Lot / serial / receipt / order number' : 'Component batch or serial'} value={q} onChange={setQ} placeholder={dir === 'forward' ? 'e.g. LOT-PRD-0011-1 or FRM-0001' : 'e.g. HR-2603-A'} autoFocus />
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            <span style={{ fontSize: 12, color: '#5F6368', alignSelf: 'center' }}>Recent output lots:</span>
            {suggestions.slice(0, 10).map((x) => <span key={x} className={`chip ${q === x ? 'selected' : ''}`} onClick={() => { setQ(x); setDir('forward'); }}>{x}</span>)}
          </div>
        )}
      </SectionCard>
      {!q.trim() && <EmptyState title="Search a batch or serial number" description="Every issue, output, inspection and downstream movement carrying that identifier is linked into one tree." icon="🌳" />}
      {q.trim() && !hasResult && <EmptyState title={`Nothing found for "${q}"`} description={dir === 'forward' ? 'Try a finished-goods lot number, a serial, a receipt number or a production order number.' : 'Try a raw-material batch that has been issued to production.'} icon="🔍" action={<Button variant="link" onClick={() => setDir(dir === 'forward' ? 'reverse' : 'forward')}>Search the other direction</Button>} />}
      {dir === 'forward' && forward.map((node) => (
        <div key={node.order.id} className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><div className="section-title" style={{ marginBottom: 2 }}><OrderLink id={node.order.id} number={node.order.number} /> · {node.order.itemName}</div><div style={{ fontSize: 12, color: '#5F6368' }}>BOM {node.order.bomCode} v{node.order.bomVersion} · {fmtQty(node.order.qty, node.order.uom, 3)} planned · {fmtDate(node.order.plannedStart)} → {fmtDate(node.order.actualEnd ?? node.order.plannedEnd)}</div></div>
            <Badge status={node.order.status} />
          </div>
          <SummaryBlock items={[{ label: 'Components issued', value: String(node.components.length) }, { label: 'Outputs', value: `${node.outputs.length} receipt(s) · ${fmtQty(node.outputs.reduce((a, r) => a + r.qty, 0), node.order.uom, 3)}` }, { label: 'Scrap', value: fmtQty(node.order.scrapQty, node.order.uom, 3) }, { label: 'Inspections', value: String(node.inspections.length) }, { label: 'Downstream movements', value: String(node.downstream.length) }]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <SectionCard title="① Components consumed" padding={0}>
              <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Qty</th><th>Batch / serials</th><th>Document</th></tr></thead><tbody>
                {node.components.map((cp, i) => <tr key={i}><td><ItemLink id={cp.itemId} name={cp.itemName} /></td><td className="right money">{fmtQty(cp.qty, undefined, 3)}</td><td className="identifier" style={{ fontSize: 12 }}>{cp.batch ?? cp.serials?.join(', ') ?? '—'}{cp.batch && <Button size="sm" variant="link" style={{ marginLeft: 6 }} onClick={() => { setQ(cp.batch!); setDir('reverse'); }}>trace</Button>}</td><td><DocLink path={cp.source === 'Issue' ? `production/issues/${cp.issueId}` : `production/subcontracting/${cp.issueId}`} number={cp.issueNumber} /></td></tr>)}
                {node.components.length === 0 && <tr><td colSpan={4} style={{ padding: 12, color: '#5F6368' }}>No components issued.</td></tr>}
              </tbody></table>
            </SectionCard>
            <SectionCard title="② Outputs produced" padding={0}>
              <table className="data-table dense"><thead><tr><th>Receipt</th><th className="right">Qty</th><th>Lot / serials</th><th>Warehouse</th><th className="right">Unit cost</th></tr></thead><tbody>
                {node.outputs.map((r) => <tr key={r.id}><td><DocLink path={`production/receipts/${r.id}`} number={r.number} /></td><td className="right money">{fmtQty(r.qty, r.uom, 3)}</td><td className="identifier" style={{ fontSize: 12 }}>{r.batch ?? ((r.serials ?? []).join(', ') || '—')}</td><td style={{ fontSize: 12 }}>{whName(r.warehouseId)}</td><td className="right money">{fmtMoney(r.unitCost, s.currency)}</td></tr>)}
              </tbody></table>
            </SectionCard>
          </div>
          {node.inspections.length > 0 && (
            <SectionCard title="③ Quality" padding={0}>
              <table className="data-table dense"><thead><tr><th>Inspection</th><th>Type</th><th>Outcome</th><th>Disposition</th><th className="right">Accepted / rejected</th><th>Date</th></tr></thead><tbody>
                {node.inspections.map((x) => <tr key={x.id} className="clickable" onClick={() => nav.go(`production/quality/${x.id}`)}><td className="identifier link">{x.number}</td><td>{x.type}</td><td>{x.outcome ? <Pill tone={x.outcome === 'Pass' ? 'good' : x.outcome === 'Fail' ? 'critical' : 'warning'}>{x.outcome}</Pill> : <Badge status={x.status} />}</td><td>{x.disposition ?? '—'}</td><td className="right money">{x.acceptedQty} / {x.rejectedQty}</td><td>{fmtDate(x.date)}</td></tr>)}
              </tbody></table>
            </SectionCard>
          )}
          <SectionCard title="④ Where the output went" padding={0}>
            <DataTable rows={node.downstream} columns={[
              { key: 'date', label: 'Date', render: (m) => fmtDate(m.date) },
              { key: 'type', label: 'Movement', render: (m) => <Badge status={m.type === 'Delivery' || m.type === 'POS Sale' ? 'Delivered' : 'Posted'}>{m.type}</Badge> },
              { key: 'sourceNumber', label: 'Document', render: (m) => <span className="identifier" style={{ fontSize: 12 }}>{m.sourceType} {m.sourceNumber}</span> },
              { key: 'qty', label: 'Qty', align: 'right', render: (m) => <span className="money">{fmtQty(Math.abs(m.baseQty), m.uom, 3)}</span> },
              { key: 'batch', label: 'Lot / serials', render: (m) => <span className="identifier" style={{ fontSize: 12 }}>{m.batch ?? m.serials?.join(', ') ?? '—'}</span> },
              { key: 'warehouseName', label: 'From', render: (m) => m.warehouseName ?? whName(m.warehouseId) },
            ] as Column<StockMovement>[]} emptyTitle="Still in stock" emptyDescription="No sale, consumption or transfer of this lot yet." />
          </SectionCard>
        </div>
      ))}
      {dir === 'reverse' && reverse.length > 0 && (
        <SectionCard title={`Batch "${q}" was consumed by ${reverse.length} production order(s)`} padding={0}>
          <table className="data-table dense"><thead><tr><th>Production order</th><th>Item produced</th><th>Status</th><th className="right">Qty of this batch used</th><th>Issue</th><th>Finished lots / serials</th></tr></thead><tbody>
            {reverse.map((r) => (
              <tr key={r.order.id}>
                <td><OrderLink id={r.order.id} number={r.order.number} /></td>
                <td><ItemLink id={r.order.itemId} name={r.order.itemName} /></td>
                <td><Badge status={r.order.status} /></td>
                <td className="right money">{fmtQty(r.qtyUsed, undefined, 3)}</td>
                <td className="identifier" style={{ fontSize: 12 }}>{r.lines.map((l: any) => l.issueNumber).join(', ')}</td>
                <td style={{ fontSize: 12 }}>{r.outputs.map((o) => <span key={o.id} style={{ marginRight: 8 }}><span className="identifier link" onClick={() => { setQ(o.batch ?? o.serials?.[0] ?? ''); setDir('forward'); }}>{o.batch ?? `${o.serials?.length ?? 0} serial(s)`}</span></span>)}{r.outputs.length === 0 && <span style={{ color: '#5F6368' }}>No output yet</span>}</td>
              </tr>))}
          </tbody></table>
        </SectionCard>
      )}
      {hasResult && <div style={{ fontSize: 12, color: '#6E6E71' }}>Trace is built from the immutable stock ledger: production issues into WIP, production receipts out of WIP and every later outbound movement carrying the same batch or serial.</div>}
    </div>
  );
}
