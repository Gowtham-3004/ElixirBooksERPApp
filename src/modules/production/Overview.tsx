// Production overview: KPIs, orders by status, bottlenecks, late orders, QC holds.
import { useMemo } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import { KpiTile, ScopeLine, Meter, Badge, Button, Pill, EmptyState } from '../../components/ui';
import { fmtMoney, fmtMoneyCompact, fmtDate, fmtPct, today, daysBetween } from '../../lib/format';
import type { ProductionOrder, ProductionReceipt, QualityInspection, WorkCentre } from './types';
import { ORDER_STATUSES, isLate } from './core';
import { capacityBoard } from './planning';
import { SectionCard, OrderLink } from './shared';

export function Overview() {
  const s = useSession();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid);
  const receipts = useCollection<ProductionReceipt>(C.productionReceipts).filter((r) => r.companyId === cid);
  const inspections = useCollection<QualityInspection>(C.qualityInspections).filter((q) => q.companyId === cid);
  const wcs = useCollection<WorkCentre>(C.workCentres).filter((w) => w.companyId === cid && w.status === 'Active');
  useCollection(C.journals);
  const month = today().slice(0, 7);
  const kpi = useMemo(() => {
    const active = orders.filter((o) => ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
    const done = orders.filter((o) => (o.status === 'Completed' || o.status === 'Closed') && o.actualEnd);
    const onTime = done.filter((o) => (o.actualEnd ?? '') <= o.plannedEnd).length;
    const wip = engine.accountBalance('acc_1220');
    const monthReceipts = receipts.filter((r) => r.status === 'Posted' && r.date.slice(0, 7) === month);
    const good = monthReceipts.reduce((x, r) => x + r.qty, 0);
    const scrap = monthReceipts.reduce((x, r) => x + r.scrapQty, 0);
    const loads = wcs.map((w) => { const b = capacityBoard(w, 1)[0]; return { w, load: b?.load ?? 0, cap: b?.capacity ?? 0 }; });
    const util = loads.reduce((x, l) => x + l.cap, 0) ? (loads.reduce((x, l) => x + l.load, 0) / loads.reduce((x, l) => x + l.cap, 0)) * 100 : 0;
    return { released: orders.filter((o) => o.status === 'Released').length, inProgress: orders.filter((o) => o.status === 'In Progress' || o.status === 'Partially Completed').length, active: active.length, onTimePct: done.length ? (onTime / done.length) * 100 : 0, doneCount: done.length, wip: wip.net, scrapPct: good + scrap ? (scrap / (good + scrap)) * 100 : 0, good, scrap, util, loads };
  }, [orders, receipts, wcs, month]);
  const late = orders.filter(isLate).sort((a, b) => a.plannedEnd.localeCompare(b.plannedEnd));
  const holds = receipts.filter((r) => r.status === 'Hold');
  const openQc = inspections.filter((q) => q.status === 'Open' || q.status === 'In Progress');
  const bottlenecks = wcs.map((w) => ({ w, weeks: capacityBoard(w, 4) })).map((x) => ({ ...x, peak: Math.max(0, ...x.weeks.map((k) => (k.capacity ? k.load / k.capacity : 0))) })).sort((a, b) => b.peak - a.peak);
  const counts = ORDER_STATUSES.map((st) => ({ st, n: orders.filter((o) => o.status === st).length })).filter((x) => x.n > 0);
  const recent = orders.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Production overview</h1><div className="page-subtitle"><ScopeLine extra={`${orders.length} orders · ${db.count(C.boms, (b: any) => b.companyId === cid && b.status === 'Active')} active BOMs`} /></div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => nav.go('production/mrp')}>Run MRP</Button><Button variant="primary" onClick={() => nav.go('production/orders/new')}>+ New production order</Button></div>
      </div>
      <div className="grid-4">
        <KpiTile label="Orders on the floor" value={kpi.active} sub={`${kpi.released} released · ${kpi.inProgress} in progress`} meta={`${late.length} late`} onClick={() => nav.go('production/orders')} />
        <KpiTile label="On-time completion" value={fmtPct(kpi.onTimePct, 0)} sub={`${kpi.doneCount} completed orders`} deltaTone={kpi.onTimePct >= 80 ? 'good' : 'bad'} delta={kpi.onTimePct >= 80 ? 'On target' : 'Below 80% target'} meta="Actual end ≤ planned end" />
        <KpiTile label="WIP value" value={fmtMoneyCompact(kpi.wip, s.currency)} sub="GL 1220 · Work in Progress" meta={<ScopeLine />} onClick={() => nav.go('production/wip')} />
        <KpiTile label="Scrap this month" value={fmtPct(kpi.scrapPct, 1)} sub={`${kpi.scrap} scrapped of ${kpi.good + kpi.scrap} produced`} deltaTone={kpi.scrapPct <= 3 ? 'good' : 'bad'} delta={kpi.scrapPct <= 3 ? 'Within 3% target' : 'Above 3% target'} meta={`Capacity utilisation this week ${fmtPct(kpi.util, 0)}`} />
      </div>
      <div className="grid-2">
        <SectionCard title="Orders by status">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {counts.map((c) => (
              <div key={c.st} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, cursor: 'pointer' }} onClick={() => nav.go('production/orders', { status: c.st })}>
                <span style={{ width: 150 }}><Badge status={c.st === 'Submitted' ? 'Awaiting Approval' : c.st}>{c.st}</Badge></span>
                <div style={{ flex: 1 }}><Meter value={c.n} max={orders.length} tone="good" /></div>
                <span className="money" style={{ width: 30, textAlign: 'right' }}>{c.n}</span>
              </div>
            ))}
            {counts.length === 0 && <EmptyState compact title="No production orders yet" action={<Button variant="primary" onClick={() => nav.go('production/orders/new')}>Create order</Button>} />}
          </div>
        </SectionCard>
        <SectionCard title="Bottleneck work centres · next 4 weeks" actions={<Button variant="link" onClick={() => nav.go('production/work-centres')}>Capacity board</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bottlenecks.map(({ w, weeks, peak }) => (
              <div key={w.id} style={{ fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}><span className="link" onClick={() => nav.go(`production/work-centres/${w.id}`)}>{w.name}</span><span style={{ color: peak >= 1 ? '#C0393F' : peak >= 0.8 ? '#8A4B0F' : '#5F6368' }}>peak {fmtPct(peak * 100, 0)} · {weeks.reduce((x, k) => x + k.load, 0).toFixed(1)} h load / {weeks.reduce((x, k) => x + k.capacity, 0).toFixed(0)} h</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>{weeks.map((k) => <Meter key={k.weekStart} value={k.load} max={k.capacity} />)}</div>
              </div>
            ))}
            {bottlenecks.length === 0 && <div style={{ fontSize: 13, color: '#5F6368' }}>No active work centres.</div>}
          </div>
        </SectionCard>
      </div>
      <div className="grid-2">
        <SectionCard title={`Late orders (${late.length})`} padding={0}>
          {late.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: '#12784E' }}>✓ Nothing is late</div> : (
            <table className="data-table dense"><thead><tr><th>Order</th><th>Item</th><th>Status</th><th>Planned end</th><th className="right">Days late</th><th className="right">Done</th></tr></thead><tbody>
              {late.map((o) => <tr key={o.id} className="clickable" onClick={() => nav.go(`production/orders/${o.id}`)}><td><OrderLink id={o.id} number={o.number} /></td><td>{o.itemName}</td><td><Badge status={o.status} /></td><td>{fmtDate(o.plannedEnd)}</td><td className="right"><Pill tone="critical">{daysBetween(o.plannedEnd, today())} d</Pill></td><td className="right money">{o.receivedQty} / {o.qty}</td></tr>)}
            </tbody></table>
          )}
        </SectionCard>
        <SectionCard title={`QC holds & open inspections (${holds.length + openQc.length})`} padding={0}>
          {holds.length + openQc.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: '#12784E' }}>✓ No receipts on hold</div> : (
            <table className="data-table dense"><thead><tr><th>Document</th><th>Item</th><th className="right">Qty</th><th>Since</th><th>Status</th></tr></thead><tbody>
              {holds.map((r) => <tr key={r.id} className="clickable" onClick={() => nav.go(r.inspectionId ? `production/quality/${r.inspectionId}` : `production/receipts/${r.id}`)}><td className="identifier">{r.number}</td><td>{r.itemName}</td><td className="right money">{r.qty}</td><td>{fmtDate(r.date)}</td><td><Badge status="Hold">On hold · {r.inspectionNumber ?? 'no inspection'}</Badge></td></tr>)}
              {openQc.filter((q) => q.refType !== 'Production Receipt').map((q) => <tr key={q.id} className="clickable" onClick={() => nav.go(`production/quality/${q.id}`)}><td className="identifier">{q.number}</td><td>{q.itemName}</td><td className="right money">{q.lotQty}</td><td>{fmtDate(q.date)}</td><td><Badge status={q.status} >{q.type} · {q.status}</Badge></td></tr>)}
            </tbody></table>
          )}
        </SectionCard>
      </div>
      <SectionCard title="Recent activity" padding={0} actions={<Button variant="link" onClick={() => nav.go('production/orders')}>All orders</Button>}>
        <table className="data-table dense"><thead><tr><th>Order</th><th>Item</th><th className="right">Qty</th><th>Status</th><th>Planned</th><th className="right">Std cost</th><th className="right">Actual</th><th>Updated</th></tr></thead><tbody>
          {recent.map((o) => <tr key={o.id} className="clickable" onClick={() => nav.go(`production/orders/${o.id}`)}><td><OrderLink id={o.id} number={o.number} /></td><td>{o.itemName}</td><td className="right money">{o.qty}</td><td><Badge status={o.status === 'Submitted' ? 'Awaiting Approval' : o.status}>{o.status}</Badge></td><td style={{ fontSize: 12 }}>{fmtDate(o.plannedStart)} → {fmtDate(o.plannedEnd)}</td><td className="right money">{fmtMoney(o.costs.totalStd, s.currency)}</td><td className="right money">{fmtMoney(o.costs.totalActual, s.currency)}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{fmtDate(o.updatedAt)}</td></tr>)}
        </tbody></table>
      </SectionCard>
    </div>
  );
}
