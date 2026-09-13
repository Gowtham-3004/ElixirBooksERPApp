// WIP & costing — WIP report tying to GL 1220, variance analysis with drill-down, period close summary (FR-MFG-011/012).
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Item } from '../../store';
import { PageHeader, Button, Badge, Tabs, KpiTile, SummaryBlock, DataTable, ScopeLine, SelectField, DateField, EmptyState, Banner, Pill, Meter, useToast, type Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtPct, fmtQty, today } from '../../lib/format';
import type { MaterialIssue, ProductionOrder, ProductionReceipt, WipEntry } from './types';
import { componentUnitCost, item as findItem, mfgSettings, saveMfgSettings } from './core';
import { closeOrder } from './actions';
import { useConfirm, SectionCard, OrderLink, ItemLink, JournalLink, VarianceCell } from './shared';

export function WipPage({ params }: { params: Record<string, string> }) {
  const s = useSession();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid);
  const wipRows = useCollection<WipEntry>(C.wipEntries).filter((w) => w.companyId === cid);
  const receipts = useCollection<ProductionReceipt>(C.productionReceipts).filter((r) => r.companyId === cid);
  const issues = useCollection<MaterialIssue>(C.materialIssues).filter((i) => i.companyId === cid);
  useCollection(C.journals);
  const grns = useCollection<any>(C.grns);
  const toast = useToast();
  const confirm = useConfirm();
  const settings = mfgSettings();
  const [tab, setTab] = useState<'wip' | 'variance' | 'close'>((params.tab as any) ?? 'wip');
  const [drill, setDrill] = useState<string | null>(null);
  const [period, setPeriod] = useState(today().slice(0, 7));

  const perOrder = useMemo(() => orders.map((o) => {
    const rows = wipRows.filter((w) => w.orderId === o.id);
    const materialIn = rows.filter((w) => w.type === 'Material In').reduce((a, w) => a + w.amount, 0);
    const materialOut = rows.filter((w) => w.type === 'Material Return').reduce((a, w) => a + w.amount, 0);
    const conversion = rows.filter((w) => w.type === 'Conversion' || w.type === 'Subcontract').reduce((a, w) => a + w.amount, 0);
    const output = rows.filter((w) => w.type === 'Output' || w.type === 'By-product').reduce((a, w) => a + w.amount, 0);
    const scrap = rows.filter((w) => w.type === 'Scrap').reduce((a, w) => a + w.amount, 0);
    const variance = rows.filter((w) => w.type === 'Variance').reduce((a, w) => a + w.amount, 0);
    const reversal = rows.filter((w) => w.type === 'Reversal').reduce((a, w) => a + w.amount, 0);
    const balance = rows.reduce((a, w) => a + w.amount, 0);
    return { order: o, materialIn, materialOut, conversion, output: -output, scrap: -scrap, variance, reversal, balance, entries: rows.length };
  }).filter((x) => x.entries > 0), [orders, wipRows]);
  const wipTotal = perOrder.reduce((a, x) => a + x.balance, 0);
  const glWip = engine.accountBalance('acc_1220');
  const difference = Math.round((wipTotal - glWip.net) * 100) / 100;

  // variance analysis
  const variances = useMemo(() => orders.filter((o) => ['Completed', 'Closed', 'Partially Completed', 'In Progress'].includes(o.status)).map((o) => {
    const c = o.costs;
    const issued = issues.filter((i) => i.orderId === o.id && i.status === 'Posted');
    // material price variance: actual rate vs standard cost of issued components
    let priceVar = 0, usageVar = 0;
    o.components.filter((x) => !x.isPhantom).forEach((cmp) => {
      const std = componentUnitCost(findItem(cmp.itemId));
      const lines = issued.flatMap((i) => i.lines.filter((l) => l.itemId === cmp.itemId).map((l) => ({ ...l, sign: i.type === 'Return' ? -1 : 1 })));
      const actualQty = lines.reduce((a, l) => a + l.qty * l.sign, 0);
      const actualValue = lines.reduce((a, l) => a + l.value * l.sign, 0);
      priceVar += actualValue - actualQty * std;
      const expectedQty = o.receivedQty + o.scrapQty > 0 ? cmp.qtyPer * (1 + cmp.scrapPct / 100) * (o.receivedQty + o.scrapQty) : 0;
      usageVar += (cmp.consumedQty - expectedQty) * std;
    });
    const labourEff = o.operations.reduce((a, op) => { const stdMin = op.setupMin + op.runMinPerUnit * o.qty; const actMin = op.actualSetupMin + op.actualRunMin; return a + ((actMin - stdMin) / 60) * op.labourRate; }, 0);
    const overheadVar = c.overheadActual - c.overheadStd;
    const yieldVar = o.qty > 0 ? (o.scrapQty / o.qty) * c.totalStd : 0;
    return { order: o, priceVar: Math.round(priceVar * 100) / 100, usageVar: Math.round(usageVar * 100) / 100, labourEff: Math.round(labourEff * 100) / 100, overheadVar, yieldVar: Math.round(yieldVar * 100) / 100, total: c.variance };
  }), [orders, issues]);

  // purchase price variance for received RM (read GRNs defensively)
  const ppv = useMemo(() => {
    const out: { itemId: string; itemName: string; qty: number; actual: number; standard: number; variance: number; grns: string[] }[] = [];
    (grns ?? []).filter((g: any) => g && g.companyId === cid && g.status === 'Posted' && (g.date ?? '').slice(0, 7) === period).forEach((g: any) => {
      (g.lines ?? []).forEach((l: any) => {
        const it = db.find<Item>(C.items, l.itemId);
        if (!it || it.standardCost === undefined) return;
        const qty = l.acceptedQty ?? l.receivedQty ?? l.qty ?? 0;
        if (qty <= 0) return;
        const actual = qty * (l.rate ?? 0);
        const standard = qty * it.standardCost;
        const e = out.find((x) => x.itemId === it.id);
        if (e) { e.qty += qty; e.actual += actual; e.standard += standard; e.variance = Math.round((e.actual - e.standard) * 100) / 100; e.grns.push(g.number); }
        else out.push({ itemId: it.id, itemName: it.name, qty, actual, standard, variance: Math.round((actual - standard) * 100) / 100, grns: [g.number] });
      });
    });
    return out;
  }, [grns, cid, period]);

  const closeOrders = orders.filter((o) => o.status === 'Completed');
  const drillOrder = drill ? orders.find((o) => o.id === drill) : undefined;
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">WIP & costing</h1><div className="page-subtitle"><ScopeLine extra={`costing method ${settings.costingMethod}`} /></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SelectField value={settings.costingMethod} onChange={(v) => confirm.open({ title: `Switch costing to ${v}?`, statement: v === 'Standard' ? 'New receipts book at the item standard cost; the difference posts as variance when orders close.' : 'New receipts book at actual costs incurred to date ÷ units produced.', consequences: [{ engine: 'Journal', text: 'Posted documents are unchanged; only future receipts are affected' }], confirmLabel: `Use ${v} costing`, onConfirm: () => { saveMfgSettings({ costingMethod: v as 'Standard' | 'Actual' }); toast.success(`Costing method set to ${v}`); } })} options={[{ value: 'Actual', label: 'Actual costing' }, { value: 'Standard', label: 'Standard costing' }]} size="sm" />
          <Tabs variant="filter" tabs={[{ id: 'wip', label: 'WIP report' }, { id: 'variance', label: 'Variance analysis' }, { id: 'close', label: 'Period close' }]} value={tab} onChange={setTab} />
        </div>
      </div>
      {tab === 'wip' && (
        <>
          <div className="grid-4">
            <KpiTile label="WIP per order ledger" value={fmtMoney(wipTotal, s.currency)} sub={`${perOrder.filter((x) => Math.abs(x.balance) > 0.01).length} order(s) with a balance`} />
            <KpiTile label="GL 1220 Work in Progress" value={fmtMoney(glWip.net, s.currency)} sub={`Dr ${fmtMoney(glWip.dr, s.currency)} · Cr ${fmtMoney(glWip.cr, s.currency)}`} onClick={() => nav.go('accounting/ledger', { account: 'acc_1220' })} />
            <KpiTile label="Difference" value={fmtMoney(difference, s.currency)} deltaTone={Math.abs(difference) < 0.01 ? 'good' : 'bad'} delta={Math.abs(difference) < 0.01 ? '✓ Ties out' : 'Investigate'} sub="Order ledger vs general ledger" />
            <KpiTile label="Material in / output out" value={fmtMoney(perOrder.reduce((a, x) => a + x.materialIn + x.conversion, 0), s.currency)} sub={`Output ${fmtMoney(perOrder.reduce((a, x) => a + x.output, 0), s.currency)}`} />
          </div>
          {Math.abs(difference) >= 0.01 && <Banner tone="warning">WIP per order ({fmtMoney(wipTotal, s.currency)}) differs from GL account 1220 ({fmtMoney(glWip.net, s.currency)}) by {fmtMoney(difference, s.currency)}. Journals posted to 1220 outside a production order (manual journals, fixed-asset capitalisation) explain the difference.</Banner>}
          <SectionCard title="WIP by production order" padding={0}>
            <DataTable rows={perOrder} rowKey={(x) => x.order.id} columns={[
              { key: 'number', label: 'Order', render: (x) => <div><OrderLink id={x.order.id} number={x.order.number} /><div className="cell-secondary">{x.order.itemName}</div></div> },
              { key: 'status', label: 'Status', render: (x) => <Badge status={x.order.status} /> },
              { key: 'materialIn', label: 'Material in', align: 'right', render: (x) => <span className="money">{fmtMoney(x.materialIn, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + x.materialIn, 0), s.currency)}</span> },
              { key: 'materialOut', label: 'Returns', align: 'right', render: (x) => <span className="money">{x.materialOut ? fmtMoney(x.materialOut, s.currency) : '—'}</span> },
              { key: 'conversion', label: 'Conversion', align: 'right', render: (x) => <span className="money">{fmtMoney(x.conversion, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + x.conversion, 0), s.currency)}</span> },
              { key: 'output', label: 'Output out', align: 'right', render: (x) => <span className="money">{fmtMoney(x.output, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + x.output, 0), s.currency)}</span> },
              { key: 'scrap', label: 'Scrap', align: 'right', render: (x) => <span className="money" style={{ color: x.scrap ? '#C0393F' : undefined }}>{x.scrap ? fmtMoney(x.scrap, s.currency) : '—'}</span> },
              { key: 'variance', label: 'Variance on close', align: 'right', render: (x) => <span className="money">{x.variance ? fmtMoney(x.variance, s.currency) : '—'}</span> },
              { key: 'balance', label: 'WIP balance', align: 'right', sortable: true, render: (x) => <span className="money" style={{ fontWeight: 600, color: Math.abs(x.balance) < 0.01 ? '#12784E' : '#8A4B0F' }}>{fmtMoney(x.balance, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + x.balance, 0), s.currency)}</span> },
            ] as Column<(typeof perOrder)[number]>[]} onRowClick={(x) => nav.go(`production/orders/${x.order.id}?tab=costing`)} showTotals emptyTitle="Nothing in WIP" />
          </SectionCard>
          <SectionCard title="WIP ledger entries" padding={0}>
            <DataTable rows={wipRows.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40)} columns={[
              { key: 'date', label: 'Date', render: (w) => fmtDate(w.date) },
              { key: 'orderNumber', label: 'Order', render: (w) => <OrderLink id={w.orderId} number={w.orderNumber} /> },
              { key: 'type', label: 'Type', render: (w) => <Badge status={w.type === 'Variance' ? 'Returned' : w.type === 'Scrap' ? 'Rejected' : w.amount > 0 ? 'In Progress' : 'Posted'}>{w.type}</Badge> },
              { key: 'sourceNumber', label: 'Source', render: (w) => <span className="identifier" style={{ fontSize: 12 }}>{w.sourceNumber}</span> },
              { key: 'description', label: 'Description', render: (w) => <span style={{ fontSize: 12, color: '#5F6368' }}>{w.description ?? '—'}</span> },
              { key: 'journalNumber', label: 'Journal', render: (w) => <JournalLink id={w.journalId} /> },
              { key: 'amount', label: 'Amount', align: 'right', render: (w) => <span className={`money ${w.amount > 0 ? '' : 'money-positive'}`}>{fmtMoney(w.amount, s.currency)}</span> },
            ] as Column<WipEntry>[]} emptyTitle="No WIP entries" />
          </SectionCard>
        </>
      )}
      {tab === 'variance' && (
        <>
          <div className="grid-4">
            <KpiTile label="Total variance" value={fmtMoney(variances.reduce((a, v) => a + v.total, 0), s.currency)} sub={`${variances.length} order(s)`} deltaTone={variances.reduce((a, v) => a + v.total, 0) <= 0 ? 'good' : 'bad'} delta={variances.reduce((a, v) => a + v.total, 0) <= 0 ? 'Favourable' : 'Unfavourable'} />
            <KpiTile label="Material price" value={fmtMoney(variances.reduce((a, v) => a + v.priceVar, 0), s.currency)} sub="Issue rate vs standard cost" />
            <KpiTile label="Labour efficiency" value={fmtMoney(variances.reduce((a, v) => a + v.labourEff, 0), s.currency)} sub="Actual vs standard minutes" />
            <KpiTile label="Yield loss" value={fmtMoney(variances.reduce((a, v) => a + v.yieldVar, 0), s.currency)} sub="Scrap share of standard cost" />
          </div>
          <SectionCard title="Variance by order — click a row to drill into its WIP ledger" padding={0}>
            <DataTable rows={variances} rowKey={(v) => v.order.id} columns={[
              { key: 'number', label: 'Order', render: (v) => <div><OrderLink id={v.order.id} number={v.order.number} /><div className="cell-secondary">{v.order.itemName} × {v.order.qty}</div></div> },
              { key: 'status', label: 'Status', render: (v) => <Badge status={v.order.status} /> },
              { key: 'std', label: 'Standard', align: 'right', render: (v) => <span className="money">{fmtMoney(v.order.costs.totalStd, s.currency)}</span> },
              { key: 'actual', label: 'Actual', align: 'right', render: (v) => <span className="money">{fmtMoney(v.order.costs.totalActual, s.currency)}</span> },
              { key: 'priceVar', label: 'Material price', align: 'right', render: (v) => <span className={`money ${v.priceVar > 0 ? 'money-negative' : 'money-positive'}`}>{fmtMoney(v.priceVar, s.currency)}</span> },
              { key: 'usageVar', label: 'Material usage', align: 'right', render: (v) => <span className={`money ${v.usageVar > 0 ? 'money-negative' : 'money-positive'}`}>{fmtMoney(v.usageVar, s.currency)}</span> },
              { key: 'labourEff', label: 'Labour efficiency', align: 'right', render: (v) => <span className={`money ${v.labourEff > 0 ? 'money-negative' : 'money-positive'}`}>{fmtMoney(v.labourEff, s.currency)}</span> },
              { key: 'overheadVar', label: 'Overhead', align: 'right', render: (v) => <span className={`money ${v.overheadVar > 0 ? 'money-negative' : 'money-positive'}`}>{fmtMoney(v.overheadVar, s.currency)}</span> },
              { key: 'yieldVar', label: 'Yield', align: 'right', render: (v) => <span className="money" style={{ color: v.yieldVar ? '#C0393F' : undefined }}>{v.yieldVar ? fmtMoney(v.yieldVar, s.currency) : '—'}</span> },
              { key: 'total', label: 'Total variance', align: 'right', sortable: true, render: (v) => <VarianceCell std={v.order.costs.totalStd} actual={v.order.costs.totalActual} currency={s.currency} />, total: (r) => <span className="money">{fmtMoney(r.reduce((a, v) => a + v.total, 0), s.currency)}</span> },
            ] as Column<(typeof variances)[number]>[]} onRowClick={(v) => setDrill(drill === v.order.id ? null : v.order.id)} showTotals emptyTitle="No orders with cost history" />
          </SectionCard>
          {drillOrder && (
            <SectionCard title={`Drill-down · ${drillOrder.number}`} padding={0} actions={<Button size="sm" variant="link" onClick={() => nav.go(`production/orders/${drillOrder.id}?tab=costing`)}>Open costing tab</Button>}>
              <table className="data-table dense"><thead><tr><th>Date</th><th>Type</th><th>Source</th><th>Description</th><th>Journal</th><th className="right">Amount</th></tr></thead><tbody>
                {wipRows.filter((w) => w.orderId === drillOrder.id).sort((a, b) => a.date.localeCompare(b.date)).map((w) => <tr key={w.id}><td>{fmtDate(w.date)}</td><td>{w.type}</td><td className="identifier" style={{ fontSize: 12 }}>{w.sourceNumber}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{w.description ?? '—'}</td><td><JournalLink id={w.journalId} /></td><td className="right money">{fmtMoney(w.amount, s.currency)}</td></tr>)}
              </tbody></table>
            </SectionCard>
          )}
          <SectionCard title="Purchase price variance on received raw materials" padding={0} actions={<DateField value={`${period}-01`} onChange={(v) => setPeriod(v.slice(0, 7))} size="sm" />}>
            <DataTable rows={ppv} rowKey={(p) => p.itemId} columns={[
              { key: 'itemName', label: 'Item', render: (p) => <ItemLink id={p.itemId} name={p.itemName} /> },
              { key: 'qty', label: 'Received', align: 'right', render: (p) => <span className="money">{fmtQty(p.qty, undefined, 3)}</span> },
              { key: 'actual', label: 'Actual value', align: 'right', render: (p) => <span className="money">{fmtMoney(p.actual, s.currency)}</span> },
              { key: 'standard', label: 'At standard', align: 'right', render: (p) => <span className="money">{fmtMoney(p.standard, s.currency)}</span> },
              { key: 'variance', label: 'PPV', align: 'right', render: (p) => <span className={`money ${p.variance > 0 ? 'money-negative' : 'money-positive'}`}>{fmtMoney(p.variance, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, p) => a + p.variance, 0), s.currency)}</span> },
              { key: 'grns', label: 'GRNs', render: (p) => <span className="identifier" style={{ fontSize: 12 }}>{p.grns.slice(0, 3).join(', ')}{p.grns.length > 3 ? ` +${p.grns.length - 3}` : ''}</span> },
            ] as Column<(typeof ppv)[number]>[]} showTotals emptyTitle={`No goods receipts in ${period}`} emptyDescription="Purchase price variance compares the GRN rate with the item standard cost." />
          </SectionCard>
        </>
      )}
      {tab === 'close' && (
        <>
          <div className="grid-4">
            <KpiTile label="Completed, not closed" value={closeOrders.length} sub={`${fmtMoney(closeOrders.reduce((a, o) => a + o.costs.wipBalance, 0), s.currency)} WIP to clear`} />
            <KpiTile label="Open orders" value={orders.filter((o) => ['Released', 'In Progress', 'Partially Completed'].includes(o.status)).length} sub="Legitimately carry WIP" />
            <KpiTile label="Receipts on hold" value={receipts.filter((r) => r.status === 'Hold').length} sub="Blocks completion" deltaTone={receipts.filter((r) => r.status === 'Hold').length ? 'bad' : 'good'} delta={receipts.filter((r) => r.status === 'Hold').length ? 'Resolve QC' : 'Clear'} />
            <KpiTile label="GL 1220 balance" value={fmtMoney(glWip.net, s.currency)} sub={`Difference to order ledger ${fmtMoney(difference, s.currency)}`} />
          </div>
          <SectionCard title="Close period WIP — orders completed but not closed" padding={0} actions={<Button disabled={closeOrders.length === 0} reason={closeOrders.length === 0 ? 'Nothing to close' : undefined} onClick={() => confirm.open({ title: `Close ${closeOrders.length} completed order(s)?`, statement: `Each order posts its remaining WIP balance as a variance to 5710 so WIP nets to zero. Total to clear: ${fmtMoney(closeOrders.reduce((a, o) => a + o.costs.wipBalance, 0), s.currency)}.`, consequences: [{ engine: 'Journal', text: 'One variance journal per order' }, { engine: 'Workflow', text: 'Orders become read-only' }], confirmLabel: 'Close all completed', cancelLabel: 'Review individually', onConfirm: () => { let n = 0; closeOrders.forEach((o) => { try { closeOrder(o.id); n += 1; } catch (e: any) { toast.error(`${o.number}: ${e.message}`); } }); if (n) toast.success(`${n} order(s) closed`); } })}>Close all completed</Button>}>
            <DataTable rows={closeOrders} columns={[
              { key: 'number', label: 'Order', render: (o) => <OrderLink id={o.id} number={o.number} /> },
              { key: 'itemName', label: 'Item' },
              { key: 'completedAt', label: 'Completed', render: (o) => fmtDate(o.actualEnd ?? o.completedAt) },
              { key: 'std', label: 'Standard', align: 'right', render: (o) => <span className="money">{fmtMoney(o.costs.totalStd, s.currency)}</span> },
              { key: 'actual', label: 'Actual', align: 'right', render: (o) => <span className="money">{fmtMoney(o.costs.totalActual, s.currency)}</span> },
              { key: 'wip', label: 'WIP to clear', align: 'right', render: (o) => <span className="money" style={{ color: '#8A4B0F' }}>{fmtMoney(o.costs.wipBalance, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, o) => a + o.costs.wipBalance, 0), s.currency)}</span> },
              { key: 'act', label: '', render: (o) => <Button size="sm" variant="tinted" onClick={(e) => { e.stopPropagation(); nav.go(`production/orders/${o.id}?action=close`); }}>Close</Button> },
            ] as Column<ProductionOrder>[]} onRowClick={(o) => nav.go(`production/orders/${o.id}?tab=costing`)} showTotals emptyTitle="Nothing to close" emptyDescription="All completed orders have been closed." />
          </SectionCard>
          <SectionCard title="Reconciliation">
            <SummaryBlock items={[{ label: 'Order WIP ledger', value: fmtMoney(wipTotal, s.currency) }, { label: 'GL 1220', value: fmtMoney(glWip.net, s.currency) }, { label: 'Difference', value: fmtMoney(difference, s.currency), tone: Math.abs(difference) < 0.01 ? 'good' : 'warn' }, { label: 'Open orders carrying WIP', value: String(perOrder.filter((x) => Math.abs(x.balance) > 0.01).length) }]} />
            <div style={{ marginTop: 10, fontSize: 12, color: '#6E6E71' }}>Material issues and conversion postings debit 1220; receipts, by-products and scrap credit it. Closing an order posts the residual to 5710 Production Variances.</div>
          </SectionCard>
        </>
      )}
      {confirm.dialog}
    </div>
  );
}
