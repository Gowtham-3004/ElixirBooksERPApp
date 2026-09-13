// Sales / purchase analysis, gross margin, branch & project profitability, budget variance (FR-RPT-004/005, FR-TRD-004).
import { useMemo } from 'react';
import { C, nav, useSession, useCollection, db } from '../../store';
import type { DocHeader, Journal, Dimension, Branch } from '../../store';
import { DataTable, KpiTile, Meter, Segmented, type Column } from '../../components/ui';
import { fmtMoney, fmtPct, fmtQty } from '../../lib/format';
import { ReportFrame, useReportFilters, RangeBar, useRange, rangeLabel, BranchPicker, DimensionPicker, drillToLedger } from './ReportFrame';
import { analysis, postedDocs, profitAndLoss, type AnalysisDim, type AnalysisRow } from './compute';
import { activeBudget, budgetVsActual } from '../budgets/compute';

function PartyPicker({ collection, label, value, onChange }: { collection: string; label: string; value: string; onChange: (v: string) => void }) {
  const rows = useCollection<any>(C[collection as keyof typeof C]);
  return <div><label className="field-label">{label}</label><select className="field-input sm" value={value} onChange={(e) => onChange(e.target.value)} style={{ minWidth: 180 }}><option value="">All</option>{rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>;
}

const DIMS_SALE: { value: AnalysisDim; label: string }[] = [{ value: 'customer', label: 'Customer' }, { value: 'item', label: 'Item' }, { value: 'group', label: 'Item group' }, { value: 'salesperson', label: 'Salesperson' }, { value: 'branch', label: 'Branch' }, { value: 'period', label: 'Period' }];
const DIMS_PUR: { value: AnalysisDim; label: string }[] = [{ value: 'supplier', label: 'Supplier' }, { value: 'item', label: 'Item' }, { value: 'group', label: 'Item group' }, { value: 'branch', label: 'Branch' }, { value: 'period', label: 'Period' }];

export function TradeAnalysis({ direction }: { direction: 'sale' | 'purchase' }) {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'QTD', period: s.state.periodCode ?? '', from: '', to: '', branchId: '', by: direction === 'sale' ? 'customer' : 'supplier', partyId: '', itemId: '', project: '', includeCredits: '1' });
  const range = useRange(f);
  const docs = useCollection<DocHeader>(direction === 'sale' ? C.salesInvoices : C.vendorInvoices);
  const notes = useCollection<DocHeader>(direction === 'sale' ? C.creditNotes : C.debitNotes);
  const pos = useCollection<DocHeader>(C.posBills);
  const rows = useMemo(() => {
    const opts = { branchId: f.branchId || undefined, partyId: f.partyId || undefined, itemId: f.itemId || undefined, dimension: f.project ? { type: 'Project', id: f.project } : undefined };
    const main = [...postedDocs(direction === 'sale' ? C.salesInvoices : C.vendorInvoices, range, opts), ...(direction === 'sale' ? postedDocs(C.posBills, range, opts) : [])];
    const credits = f.includeCredits === '1' ? postedDocs(direction === 'sale' ? C.creditNotes : C.debitNotes, range, opts) : [];
    return analysis(main, f.by as AnalysisDim, direction, credits);
  }, [docs, notes, pos, range, f, direction]);
  const totals = rows.reduce((t, r) => ({ docs: t.docs + r.docs, taxable: t.taxable + r.taxable, tax: t.tax + r.tax, total: t.total + r.total, cogs: t.cogs + r.cogs, margin: t.margin + r.margin }), { docs: 0, taxable: 0, tax: 0, total: 0, cogs: 0, margin: 0 });
  const cols: Column<AnalysisRow>[] = [
    { key: 'label', label: (direction === 'sale' ? DIMS_SALE : DIMS_PUR).find((d) => d.value === f.by)?.label ?? 'Key', render: (r) => <div><div className="cell-primary">{r.label}</div>{r.sub && <div className="cell-secondary identifier">{r.sub}</div>}</div>, sortable: true },
    { key: 'docs', label: 'Docs', align: 'right', sortable: true },
    { key: 'qty', label: 'Qty', align: 'right', render: (r) => <span className="money">{fmtQty(r.qty)}</span> },
    { key: 'taxable', label: direction === 'sale' ? 'Net sales' : 'Net purchases', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.taxable, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(totals.taxable, s.currency)}</span>, sortable: true },
    { key: 'tax', label: 'Tax', align: 'right', render: (r) => <span className="money">{fmtMoney(r.tax, s.currency)}</span>, total: () => <span className="money">{fmtMoney(totals.tax, s.currency)}</span> },
    { key: 'total', label: 'Gross', align: 'right', render: (r) => <span className="money">{fmtMoney(r.total, s.currency)}</span>, total: () => <span className="money">{fmtMoney(totals.total, s.currency)}</span> },
    ...(direction === 'sale' ? [
      { key: 'cogs', label: 'COGS (avg cost)', align: 'right', render: (r) => <span className="money">{fmtMoney(r.cogs, s.currency)}</span>, total: () => <span className="money">{fmtMoney(totals.cogs, s.currency)}</span> } as Column<AnalysisRow>,
      { key: 'margin', label: 'Gross margin', align: 'right', render: (r) => <span className="money" style={{ color: r.margin >= 0 ? '#12784E' : '#C0393F', fontWeight: 600 }}>{fmtMoney(r.margin, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(totals.margin, s.currency)}</span>, sortable: true } as Column<AnalysisRow>,
      { key: 'marginPct', label: 'GM %', align: 'right', render: (r) => <span className="money">{fmtPct(r.marginPct)}</span>, sortable: true } as Column<AnalysisRow>,
    ] : []),
    { key: 'share', label: 'Share', width: 140, render: (r) => <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1 }}><Meter value={totals.taxable ? (r.taxable / totals.taxable) * 100 : 0} tone="good" /></div><span style={{ fontSize: 11, width: 36, textAlign: 'right' }}>{totals.taxable ? fmtPct((r.taxable / totals.taxable) * 100, 0) : '—'}</span></div> },
  ];
  const id = direction === 'sale' ? 'sales-analysis' : 'purchase-analysis';
  return (
    <ReportFrame id={id} title={direction === 'sale' ? 'Sales analysis' : 'Purchase analysis'} rangeLabel={rangeLabel(range)} filterState={f} exportColumns={cols.filter((c) => c.key !== 'share').map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /><PartyPicker collection={direction === 'sale' ? 'customers' : 'suppliers'} label={direction === 'sale' ? 'Customer' : 'Supplier'} value={f.partyId} onChange={(v) => set({ partyId: v })} /><PartyPicker collection="items" label="Item" value={f.itemId} onChange={(v) => set({ itemId: v })} /><DimensionPicker type="Project" value={f.project} onChange={(v) => set({ project: v })} /><div><label className="field-label">Group by</label><Segmented value={f.by} onChange={(v) => set({ by: v })} options={direction === 'sale' ? DIMS_SALE : DIMS_PUR} /></div><div><label className="field-label">Notes</label><Segmented value={f.includeCredits} onChange={(v) => set({ includeCredits: v })} options={[{ value: '1', label: 'Net of credits' }, { value: '0', label: 'Gross' }]} /></div></>}>
      <div className="grid-4">
        <KpiTile label={direction === 'sale' ? 'Net sales' : 'Net purchases'} value={fmtMoney(totals.taxable, s.currency)} sub={`${totals.docs} documents`} />
        <KpiTile label="Tax" value={fmtMoney(totals.tax, s.currency)} />
        {direction === 'sale' ? <KpiTile label="Gross margin" value={fmtMoney(totals.margin, s.currency)} delta={totals.taxable ? fmtPct((totals.margin / totals.taxable) * 100) : '—'} deltaTone={totals.margin >= 0 ? 'good' : 'bad'} sub="revenue − COGS at average cost" /> : <KpiTile label="Suppliers" value={new Set(rows.map((r) => r.key)).size} />}
        <KpiTile label="Top line share" value={rows[0] ? fmtPct(totals.taxable ? (rows[0].taxable / totals.taxable) * 100 : 0, 0) : '—'} sub={rows[0]?.label} />
      </div>
      <DataTable rows={rows} rowKey={(r) => r.key} columns={cols} dense showTotals onRowClick={(r) => { if (f.by === 'customer') nav.go(`sales/invoices?customer=${r.key}`); else if (f.by === 'supplier') nav.go(`purchase/vendor-invoices?supplier=${r.key}`); else if (f.by === 'item') nav.go(`masters/items/${r.key}`); }} emptyTitle={`No posted ${direction === 'sale' ? 'sales' : 'purchase'} documents in ${rangeLabel(range)}`} emptyDescription={direction === 'sale' ? 'Posted sales invoices and POS bills feed this report.' : 'Posted vendor invoices feed this report.'} />
    </ReportFrame>
  );
}

export function MarginReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'QTD', period: s.state.periodCode ?? '', from: '', to: '', branchId: '' });
  const range = useRange(f);
  const docs = useCollection<DocHeader>(C.salesInvoices);
  const journals = useCollection<Journal>(C.journals);
  const byItem = useMemo(() => analysis([...postedDocs(C.salesInvoices, range, { branchId: f.branchId || undefined }), ...postedDocs(C.posBills, range, { branchId: f.branchId || undefined })], 'item', 'sale', postedDocs(C.creditNotes, range, { branchId: f.branchId || undefined })), [docs, range, f.branchId]);
  const pl = useMemo(() => profitAndLoss(range, { branchId: f.branchId || undefined }), [range, f.branchId, journals]);
  const totals = byItem.reduce((t, r) => ({ taxable: t.taxable + r.taxable, cogs: t.cogs + r.cogs, margin: t.margin + r.margin }), { taxable: 0, cogs: 0, margin: 0 });
  const cols: Column<AnalysisRow>[] = [
    { key: 'label', label: 'Item', render: (r) => <div><div className="cell-primary">{r.label}</div><div className="cell-secondary identifier">{r.sub}</div></div>, sortable: true },
    { key: 'qty', label: 'Qty sold', align: 'right', render: (r) => <span className="money">{fmtQty(r.qty)}</span> },
    { key: 'taxable', label: 'Revenue', align: 'right', render: (r) => <span className="money">{fmtMoney(r.taxable, s.currency)}</span>, total: () => <span className="money">{fmtMoney(totals.taxable, s.currency)}</span>, sortable: true },
    { key: 'cogs', label: 'COGS (avg cost)', align: 'right', render: (r) => <span className="money">{fmtMoney(r.cogs, s.currency)}</span>, total: () => <span className="money">{fmtMoney(totals.cogs, s.currency)}</span> },
    { key: 'margin', label: 'Gross margin', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.margin >= 0 ? '#12784E' : '#C0393F' }}>{fmtMoney(r.margin, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(totals.margin, s.currency)}</span>, sortable: true },
    { key: 'marginPct', label: 'GM %', align: 'right', render: (r) => <span className="money">{fmtPct(r.marginPct)}</span>, sortable: true },
    { key: 'bar', label: '', width: 120, render: (r) => <Meter value={Math.max(0, r.marginPct)} max={100} tone={r.marginPct < 10 ? 'danger' : r.marginPct < 25 ? 'warn' : 'good'} /> },
  ];
  return (
    <ReportFrame id="margin" title="Gross margin analysis" subtitle="Invoice revenue vs cost of goods at average cost (FR-TRD-004) — compared with the ledger gross profit" rangeLabel={rangeLabel(range)} filterState={f} exportColumns={cols.filter((c) => c.key !== 'bar').map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => byItem as any}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /></>}>
      <div className="grid-4">
        <KpiTile label="Revenue (invoices)" value={fmtMoney(totals.taxable, s.currency)} />
        <KpiTile label="COGS at avg cost" value={fmtMoney(totals.cogs, s.currency)} />
        <KpiTile label="Gross margin (invoices)" value={fmtMoney(totals.margin, s.currency)} delta={totals.taxable ? fmtPct((totals.margin / totals.taxable) * 100) : '—'} deltaTone="good" />
        <KpiTile label="Gross profit (ledger)" value={fmtMoney(pl.grossProfit, s.currency)} sub={`revenue ${fmtMoney(pl.revenue, s.currency)} · COGS ${fmtMoney(pl.cogs, s.currency)}`} onClick={() => nav.go('reports/pl')} />
      </div>
      <DataTable rows={byItem} rowKey={(r) => r.key} columns={cols} dense showTotals emptyTitle="No sales in this range" />
    </ReportFrame>
  );
}

export function ProfitabilityReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'YTD', period: s.state.periodCode ?? '', from: '', to: '', by: 'branch' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId);
  const projects = useCollection<Dimension>(C.dimensions).filter((d) => d.type === 'Project');
  const rows = useMemo(() => {
    const keys = f.by === 'branch' ? branches.map((b) => ({ id: b.id, label: b.name, sub: b.code })) : projects.map((p) => ({ id: p.id, label: p.name, sub: p.code }));
    return keys.map((k) => {
      const pl = f.by === 'branch' ? profitAndLoss(range, { branchId: k.id }) : profitAndLoss(range, { dimension: { type: 'Project', id: k.id } });
      return { id: k.id, label: k.label, sub: k.sub, revenue: pl.revenue, cogs: pl.cogs, grossProfit: pl.grossProfit, opex: pl.opex, netProfit: pl.netProfit, gmPct: pl.revenue ? (pl.grossProfit / pl.revenue) * 100 : 0, nmPct: pl.revenue ? (pl.netProfit / pl.revenue) * 100 : 0 };
    }).filter((r) => r.revenue !== 0 || r.opex !== 0 || r.cogs !== 0).sort((a, b) => b.revenue - a.revenue);
  }, [f.by, range, journals, branches, projects]);
  const total = rows.reduce((t, r) => ({ revenue: t.revenue + r.revenue, netProfit: t.netProfit + r.netProfit }), { revenue: 0, netProfit: 0 });
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'label', label: f.by === 'branch' ? 'Branch' : 'Project', render: (r) => <div><div className="cell-primary">{r.label}</div><div className="cell-secondary identifier">{r.sub}</div></div> },
    { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.revenue, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(total.revenue, s.currency)}</span>, sortable: true },
    { key: 'cogs', label: 'COGS', align: 'right', render: (r) => <span className="money">{fmtMoney(r.cogs, s.currency)}</span> },
    { key: 'grossProfit', label: 'Gross profit', align: 'right', render: (r) => <span className="money">{fmtMoney(r.grossProfit, s.currency)}</span> },
    { key: 'gmPct', label: 'GM %', align: 'right', render: (r) => <span className="money">{fmtPct(r.gmPct)}</span> },
    { key: 'opex', label: 'Opex', align: 'right', render: (r) => <span className="money">{fmtMoney(r.opex, s.currency)}</span> },
    { key: 'netProfit', label: 'Net profit', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.netProfit >= 0 ? '#12784E' : '#C0393F' }}>{fmtMoney(r.netProfit, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(total.netProfit, s.currency)}</span>, sortable: true },
    { key: 'nmPct', label: 'NM %', align: 'right', render: (r) => <span className="money">{fmtPct(r.nmPct)}</span> },
    { key: 'share', label: 'Revenue share', width: 140, render: (r) => <Meter value={total.revenue ? (r.revenue / total.revenue) * 100 : 0} tone="good" /> },
  ];
  return (
    <ReportFrame id="profitability" title={f.by === 'branch' ? 'Branch profitability' : 'Project profitability'} subtitle={f.by === 'branch' ? 'Journals by branch (Branch dimension)' : 'Journals carrying a Project dimension'} rangeLabel={rangeLabel(range)} filterState={f} exportColumns={cols.filter((c) => c.key !== 'share').map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><RangeBar f={f} set={set} /><div><label className="field-label">By</label><Segmented value={f.by} onChange={(v) => set({ by: v })} options={[{ value: 'branch', label: 'Branch' }, { value: 'project', label: 'Project' }]} /></div></>}>
      <DataTable rows={rows} columns={cols} dense showTotals onRowClick={(r) => nav.go(`reports/pl?preset=${f.preset}&period=${f.period}&${f.by === 'branch' ? 'branchId' : 'project'}=${r.id}`)} emptyTitle={`No ${f.by} activity in this range`} emptyDescription={f.by === 'project' ? 'Post journals or documents with a Project dimension to see project P&L.' : undefined} />
    </ReportFrame>
  );
}

export function BudgetVarianceReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'YTD', period: s.state.periodCode ?? '', from: '', to: '', branchId: '' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const budgets = useCollection<any>(C.budgets);
  const fy = s.state.fy ?? '2026-27';
  const budget = useMemo(() => activeBudget(fy), [budgets, fy]);
  const res = useMemo(() => budgetVsActual(budget, range, { branchId: f.branchId || undefined }), [budget, range, f.branchId, journals]);
  const rows = [...res.rows, res.totals.income, res.totals.expense, res.totals.net];
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'name', label: 'Account / cost head', render: (r) => <span style={{ fontWeight: r.kind === 'account' ? 400 : 600, paddingLeft: r.kind === 'account' ? 16 : 0, textTransform: r.kind === 'group' ? 'uppercase' : undefined, fontSize: r.kind === 'group' ? 11 : 13, color: r.kind === 'group' ? '#5F6368' : '#0A0A0A' }}>{r.code && <span className="identifier" style={{ marginRight: 6, color: '#6E6E71' }}>{r.code}</span>}{r.name}</span> },
    { key: 'budgetFy', label: 'Budget (FY)', align: 'right', render: (r) => <span className="money">{fmtMoney(r.budgetFy, s.currency)}</span> },
    { key: 'budgetPeriod', label: 'Budget (range)', align: 'right', render: (r) => <span className="money">{fmtMoney(r.budgetPeriod, s.currency)}</span> },
    { key: 'actual', label: 'Actual', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.actual, s.currency)}</span> },
    { key: 'committed', label: 'Committed', align: 'right', render: (r) => <span className="money" style={{ color: r.committed ? '#F97316' : '#B0B5BF' }}>{r.committed ? fmtMoney(r.committed, s.currency) : '—'}</span> },
    { key: 'variance', label: 'Variance', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.favorable ? '#12784E' : '#C0393F' }}>{r.favorable ? '+' : ''}{fmtMoney(r.variance, s.currency)}</span> },
    { key: 'util', label: 'Utilization', width: 150, render: (r) => r.type === 'Expense' && r.kind === 'account' ? <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ flex: 1 }}><Meter value={Math.min(r.utilizationPct, 100)} /></div><span style={{ fontSize: 11, width: 36, textAlign: 'right' }}>{r.utilizationPct === 999 ? '∞' : fmtPct(r.utilizationPct, 0)}</span></div> : null },
  ];
  return (
    <ReportFrame id="budget-variance" title="Budget variance" subtitle={budget ? `${budget.name} · v${budget.version}.${budget.revision} · ${budget.status}` : `No budget approved for FY ${fy}`} rangeLabel={rangeLabel(range)} filterState={f} exportColumns={cols.filter((c) => c.key !== 'util').map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /></>}>
      <div className="grid-4">
        <KpiTile label="Income vs budget" value={fmtMoney(res.totals.income.actual, s.currency)} delta={`${res.totals.income.favorable ? '+' : ''}${fmtMoney(res.totals.income.variance, s.currency)}`} deltaTone={res.totals.income.favorable ? 'good' : 'bad'} sub={`budget ${fmtMoney(res.totals.income.budgetPeriod, s.currency)}`} />
        <KpiTile label="Expenses vs budget" value={fmtMoney(res.totals.expense.actual, s.currency)} delta={`${res.totals.expense.favorable ? '+' : ''}${fmtMoney(res.totals.expense.variance, s.currency)} available`} deltaTone={res.totals.expense.favorable ? 'good' : 'bad'} sub={`budget ${fmtMoney(res.totals.expense.budgetPeriod, s.currency)} · committed ${fmtMoney(res.totals.expense.committed, s.currency)}`} />
        <KpiTile label="Net result" value={fmtMoney(res.totals.net.actual, s.currency)} delta={`${res.totals.net.favorable ? '+' : ''}${fmtMoney(res.totals.net.variance, s.currency)} vs plan`} deltaTone={res.totals.net.favorable ? 'good' : 'bad'} />
        <KpiTile label="Expense utilization" value={fmtPct(res.totals.expense.utilizationPct, 0)} sub="actual + committed ÷ budget" />
      </div>
      <DataTable rows={rows} rowKey={(r) => r.accountId || r.name} columns={cols} dense rowClass={(r) => (r.kind !== 'account' ? 'selected' : undefined)} onRowClick={(r) => r.accountId && drillToLedger(r.accountId, range)} emptyTitle="No budget lines or actuals" emptyDescription="Approve a budget under Budgets & Expenses to compare against actuals." />
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Committed = unreceived value of approved purchase orders in the range · {db.count(C.purchaseOrders)} POs on file.</div>
    </ReportFrame>
  );
}
