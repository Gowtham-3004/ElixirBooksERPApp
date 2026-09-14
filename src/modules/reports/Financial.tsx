// Financial statements: P&L, balance sheet, cash flow, trial balance, journal register (FR-RPT-002/009).
import { useMemo, useState } from 'react';
import { db, C, nav, useSession, useCollection } from '../../store';
import type { Journal } from '../../store';
import { Banner, Button, DataTable, KpiTile, Badge, Money, SummaryBlock, Segmented, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPeriod, fmtPct } from '../../lib/format';
import { ReportFrame, useReportFilters, RangeBar, useRange, rangeLabel, BranchPicker, StatementTable, drillToLedger, DimensionPicker, PeriodPicker } from './ReportFrame';
import { profitAndLoss, balanceSheet, cashFlow, trialBalance, shiftRange, monthRange, type Range } from './compute';

const DEF = { preset: 'YTD', period: '', from: '', to: '', branchId: '', compare: 'prior', project: '' };

export function ProfitLoss() {
  const s = useSession();
  const [f, set] = useReportFilters({ ...DEF, period: s.state.periodCode ?? '' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const compareRange: Range | undefined = f.compare === 'prior' ? shiftRange(range, -(Math.max(1, monthsIn(range)))) : f.compare === 'ly' ? shiftRange(range, -12) : undefined;
  const pl = useMemo(() => profitAndLoss(range, { branchId: f.branchId || undefined, compare: compareRange, dimension: f.project ? { type: 'Project', id: f.project } : undefined }), [range, f.branchId, f.compare, f.project, journals]);
  // reconciliation: P&L net must equal the movement in equity (profit for the period) on the balance sheet
  const bs = useMemo(() => balanceSheet(range.to, { branchId: f.branchId || undefined }), [range.to, f.branchId, journals]);
  const bsPrior = useMemo(() => balanceSheet(new Date(new Date(range.from + 'T00:00:00').getTime() - 86400000).toISOString().slice(0, 10), { branchId: f.branchId || undefined }), [range.from, f.branchId, journals]);
  const reconDiff = Math.round((bs.retainedCurrent - bsPrior.retainedCurrent - pl.netProfit) * 100) / 100;
  const margin = pl.revenue ? (pl.grossProfit / pl.revenue) * 100 : 0;
  const netMargin = pl.revenue ? (pl.netProfit / pl.revenue) * 100 : 0;
  return (
    <ReportFrame id="pl" title="Profit & Loss" rangeLabel={rangeLabel(range)} filterState={f}
      exportColumns={[{ key: 'code', label: 'Code' }, { key: 'label', label: 'Particulars' }, { key: 'amount', label: 'Amount' }, { key: 'compare', label: 'Comparative' }]}
      exportRows={() => pl.lines.map((l) => ({ code: l.code ?? '', label: l.label, amount: l.amount, compare: l.compare ?? '' }))}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /><DimensionPicker type="Project" value={f.project} onChange={(v) => set({ project: v })} /><div><label className="field-label">Compare</label><Segmented value={f.compare} onChange={(v) => set({ compare: v })} options={[{ value: 'none', label: 'None' }, { value: 'prior', label: 'Prior period' }, { value: 'ly', label: 'Last year' }]} /></div></>}>
      <div className="grid-4">
        <KpiTile label="Revenue" amount={pl.revenue} currency={s.currency} sub={rangeLabel(range)} />
        <KpiTile label="Gross margin" value={fmtPct(margin)} sub={`on ${fmtMoney(pl.revenue, s.currency)}`} />
        <KpiTile label="Operating expenses" amount={pl.opex} currency={s.currency} sub={`incl. depreciation ${fmtMoney(pl.depreciation, s.currency)}`} />
        <KpiTile label="Net profit" amount={pl.netProfit} currency={s.currency} delta={fmtPct(netMargin) + ' net margin'} deltaTone={pl.netProfit >= 0 ? 'good' : 'bad'} sub="before tax" />
      </div>
      {reconDiff === 0 ? <Banner tone="success">Reconciles: P&L net profit equals the change in unappropriated profit on the balance sheet at the same cut-off (FR-RPT-009).</Banner> : <Banner tone="warning">Reconciliation difference of {fmtMoney(reconDiff, s.currency)} between P&L net profit and the balance-sheet movement — check journals posted outside the range or opening balances.</Banner>}
      <StatementTable rows={pl.lines} currency={s.currency} valueLabel={rangeLabel(range)} compareLabel={compareRange ? rangeLabel(compareRange) : undefined} onDrill={(id) => drillToLedger(id, range)} />
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Computed live from posted journals · click an account to open its ledger · amounts in {s.currency}.</div>
    </ReportFrame>
  );
}

function monthsIn(r: Range): number {
  const a = new Date(r.from + 'T00:00:00'), b = new Date(r.to + 'T00:00:00');
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
}

export function BalanceSheetPage() {
  const s = useSession();
  const [f, set] = useReportFilters({ period: s.state.periodCode ?? '', branchId: '', compare: 'prior' });
  const journals = useCollection<Journal>(C.journals);
  const asOf = monthRange(f.period || s.state.periodCode || '2026-09').to;
  const compareAsOf = f.compare === 'prior' ? shiftRange(monthRange(f.period || '2026-09'), -1).to : f.compare === 'ly' ? shiftRange(monthRange(f.period || '2026-09'), -12).to : undefined;
  const bs = useMemo(() => balanceSheet(asOf, { branchId: f.branchId || undefined, compareAsOf }), [asOf, f.branchId, compareAsOf, journals]);
  const cols = (rows: typeof bs.assets) => <StatementTable rows={rows} currency={s.currency} valueLabel={`As at ${fmtDate(asOf)}`} compareLabel={compareAsOf ? `As at ${fmtDate(compareAsOf)}` : undefined} onDrill={(id) => drillToLedger(id, { from: s.company?.booksFrom ?? '2020-04-01', to: asOf })} />;
  return (
    <ReportFrame id="balance-sheet" title="Balance sheet" rangeLabel={`As at ${fmtDate(asOf)}`} filterState={f}
      exportColumns={[{ key: 'side', label: 'Side' }, { key: 'code', label: 'Code' }, { key: 'label', label: 'Particulars' }, { key: 'amount', label: 'Amount' }]}
      exportRows={() => [...bs.assets.map((l) => ({ side: 'Assets', code: l.code ?? '', label: l.label, amount: l.amount })), ...bs.liabilities.map((l) => ({ side: 'Equity & liabilities', code: l.code ?? '', label: l.label, amount: l.amount }))]}
      filters={<><PeriodPicker value={f.period} onChange={(v) => set({ period: v })} label="As at end of" /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /><div><label className="field-label">Comparative</label><Segmented value={f.compare} onChange={(v) => set({ compare: v })} options={[{ value: 'none', label: 'None' }, { value: 'prior', label: 'Prior month' }, { value: 'ly', label: 'Last year' }]} /></div></>}>
      <div className="grid-4">
        <KpiTile label="Total assets" amount={bs.totalAssets} currency={s.currency} />
        <KpiTile label="Total liabilities" amount={bs.totalLiabilities} currency={s.currency} />
        <KpiTile label="Equity (incl. current profit)" amount={bs.totalEquity} currency={s.currency} sub={`profit for the period ${fmtMoney(bs.retainedCurrent, s.currency)}`} />
        <KpiTile label="Assets − (L + E)" amount={bs.difference} currency={s.currency} deltaTone={bs.difference === 0 ? 'good' : 'bad'} delta={bs.difference === 0 ? 'Balanced' : 'Does not balance'} />
      </div>
      {bs.difference !== 0 && <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('accounting/opening-balances')}>Review opening balances</Button>}>Balance sheet is out of balance by {fmtMoney(bs.difference, s.currency)} at this cut-off — usually opening balances loaded without a balancing equity entry (FR-RPT-009 exception).</Banner>}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div><div className="section-title">Assets</div>{cols(bs.assets)}<div style={{ padding: '8px 12px', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}><span>Total assets</span><span className="money">{fmtMoney(bs.totalAssets, s.currency)}</span></div></div>
        <div><div className="section-title" style={{ color: 'var(--good)' }}>Equity & liabilities</div>{cols(bs.liabilities)}<div style={{ padding: '8px 12px', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}><span>Total equity & liabilities</span><span className="money">{fmtMoney(bs.totalLE, s.currency)}</span></div></div>
      </div>
    </ReportFrame>
  );
}

export function CashFlowPage() {
  const s = useSession();
  const [f, set] = useReportFilters({ ...DEF, period: s.state.periodCode ?? '' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const cf = useMemo(() => cashFlow(range, { branchId: f.branchId || undefined }), [range, f.branchId, journals]);
  const section = (title: string, rows: typeof cf.operating, total: number) => (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink)', borderBottom: '1px solid var(--line-strong)', fontSize: 13 }}>{title}</div>
      <table className="data-table dense"><tbody>
        {rows.map((r, i) => <tr key={i}><td style={{ paddingLeft: 14 + r.level * 20, fontWeight: r.level === 0 ? 600 : 400 }}>{r.label}</td><td className="right money" style={{ width: 180 }}>{fmtMoney(r.amount, s.currency, { parens: true })}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={2} style={{ color: 'var(--ink-4)' }}>No movements in this range</td></tr>}
        <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}><td>Net cash from {title.split('from ')[1] ?? title.toLowerCase()}</td><td className="right money" style={{ color: total < 0 ? 'var(--danger)' : 'var(--good)' }}>{fmtMoney(total, s.currency)}</td></tr>
      </tbody></table>
    </div>
  );
  return (
    <ReportFrame id="cash-flow" title="Cash flow statement" subtitle="Indirect method — classified by account group (operating: current assets & liabilities · investing: fixed assets · financing: borrowings & equity)" rangeLabel={rangeLabel(range)} filterState={f}
      exportColumns={[{ key: 'section', label: 'Section' }, { key: 'label', label: 'Line' }, { key: 'amount', label: 'Amount' }]}
      exportRows={() => [...cf.operating.map((r) => ({ section: 'Operating', ...r })), ...cf.investing.map((r) => ({ section: 'Investing', ...r })), ...cf.financing.map((r) => ({ section: 'Financing', ...r }))]}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /></>}>
      <div className="grid-4">
        <KpiTile label="Opening cash & bank" amount={cf.openingCash} currency={s.currency} />
        <KpiTile label="Net change (statement)" amount={cf.netChange} currency={s.currency} deltaTone={cf.netChange >= 0 ? 'good' : 'bad'} />
        <KpiTile label="Closing cash & bank" amount={cf.closingCash} currency={s.currency} sub={`actual change ${fmtMoney(cf.actualChange, s.currency)}`} />
        <KpiTile label="Unexplained difference" amount={cf.difference} currency={s.currency} deltaTone={cf.difference === 0 ? 'good' : 'bad'} delta={cf.difference === 0 ? 'Reconciled to bank & cash ledgers' : 'Investigate'} />
      </div>
      {section('A. Cash flow from operating activities', cf.operating, cf.netOperating)}
      {section('B. Cash flow from investing activities', cf.investing, cf.netInvesting)}
      {section('C. Cash flow from financing activities', cf.financing, cf.netFinancing)}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderRadius: 8, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Net increase / (decrease) in cash</span>
        <Money value={cf.netChange} currency={s.currency} size="lg" tone="auto" parens />
      </div>
    </ReportFrame>
  );
}

export function TrialBalancePage() {
  const s = useSession();
  const [f, set] = useReportFilters({ ...DEF, preset: 'FY', period: s.state.periodCode ?? '' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const tb = useMemo(() => trialBalance(range, { branchId: f.branchId || undefined }), [range, f.branchId, journals]);
  const cols: Column<(typeof tb.rows)[number]>[] = [
    { key: 'code', label: 'Code', render: (r) => <span className="identifier">{r.code}</span>, sortable: true, width: 80 },
    { key: 'name', label: 'Account', sortable: true },
    { key: 'group', label: 'Group', render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.group}</span> },
    { key: 'openingDr', label: 'Opening Dr', align: 'right', render: (r) => <span className="money">{r.openingDr ? fmtMoney(r.openingDr, s.currency) : '—'}</span> },
    { key: 'openingCr', label: 'Opening Cr', align: 'right', render: (r) => <span className="money">{r.openingCr ? fmtMoney(r.openingCr, s.currency) : '—'}</span> },
    { key: 'dr', label: 'Debit', align: 'right', render: (r) => <span className="money">{r.dr ? fmtMoney(r.dr, s.currency) : '—'}</span>, total: (rows) => <span className="money">{fmtMoney(rows.reduce((x, r) => x + r.dr, 0), s.currency)}</span> },
    { key: 'cr', label: 'Credit', align: 'right', render: (r) => <span className="money">{r.cr ? fmtMoney(r.cr, s.currency) : '—'}</span>, total: (rows) => <span className="money">{fmtMoney(rows.reduce((x, r) => x + r.cr, 0), s.currency)}</span> },
    { key: 'closingDr', label: 'Closing Dr', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{r.closingDr ? fmtMoney(r.closingDr, s.currency) : '—'}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(tb.totalDr, s.currency)}</span> },
    { key: 'closingCr', label: 'Closing Cr', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{r.closingCr ? fmtMoney(r.closingCr, s.currency) : '—'}</span>, total: () => <span className="money" style={{ fontWeight: 700, color: tb.difference === 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(tb.totalCr, s.currency)}</span> },
  ];
  return (
    <ReportFrame id="trial-balance" title="Trial balance" rangeLabel={rangeLabel(range)} filterState={f}
      actions={<Button variant="secondary" size="sm" onClick={() => nav.go('accounting/trial-balance')}>Open in Accounting →</Button>}
      exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => tb.rows as any}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /></>}>
      {tb.difference !== 0 ? <Banner tone="warning">Trial balance does not balance: Dr {fmtMoney(tb.totalDr, s.currency)} vs Cr {fmtMoney(tb.totalCr, s.currency)} (difference {fmtMoney(tb.difference, s.currency)}). Opening balances were loaded without a balancing entry.</Banner> : <Banner tone="success">Trial balance is in balance — Dr {fmtMoney(tb.totalDr, s.currency)} = Cr {fmtMoney(tb.totalCr, s.currency)}.</Banner>}
      <DataTable rows={tb.rows} rowKey={(r) => r.accountId} columns={cols} dense onRowClick={(r) => drillToLedger(r.accountId, range)} showTotals totalsLabel={`Totals for ${tb.rows.length} accounts`} />
    </ReportFrame>
  );
}

export function JournalRegister() {
  const s = useSession();
  const [f, set] = useReportFilters({ ...DEF, preset: 'MTD', period: s.state.periodCode ?? '', source: '', status: '' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const [q, setQ] = useState('');
  const rows = useMemo(() => journals.filter((j) => (!j.companyId || j.companyId === s.state.companyId) && j.date >= range.from && j.date <= range.to && (!f.branchId || j.branchId === f.branchId) && (!f.source || j.sourceType === f.source) && (!f.status || j.status === f.status) && (!q || `${j.number} ${j.narration} ${j.sourceNumber ?? ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [journals, range, f, q, s.state.companyId]);
  const sources = Array.from(new Set(journals.map((j) => j.sourceType))).sort();
  const cols: Column<Journal>[] = [
    { key: 'number', label: 'Journal', render: (j) => <span className="identifier link">{j.number}</span>, sortable: true },
    { key: 'date', label: 'Date', render: (j) => fmtDate(j.date), sortable: true },
    { key: 'sourceType', label: 'Source', render: (j) => <span>{j.sourceType}{j.sourceNumber ? <span className="identifier" style={{ color: 'var(--ink-4)', marginLeft: 6, fontSize: 11 }}>{j.sourceNumber}</span> : null}</span> },
    { key: 'narration', label: 'Narration', render: (j) => <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{j.narration}</span> },
    { key: 'type', label: 'Type', render: (j) => <Badge status="Draft">{j.type}</Badge> },
    { key: 'totalDr', label: 'Debit', align: 'right', render: (j) => <span className="money">{fmtMoney(j.totalDr, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((x, j) => x + j.totalDr, 0), s.currency)}</span> },
    { key: 'totalCr', label: 'Credit', align: 'right', render: (j) => <span className="money">{fmtMoney(j.totalCr, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((x, j) => x + j.totalCr, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (j) => <Badge status={j.status} /> },
  ];
  return (
    <ReportFrame id="journal-register" title="Journal register" rangeLabel={rangeLabel(range)} filterState={f}
      exportColumns={[{ key: 'number', label: 'Journal' }, { key: 'date', label: 'Date' }, { key: 'sourceType', label: 'Source' }, { key: 'sourceNumber', label: 'Source no.' }, { key: 'narration', label: 'Narration' }, { key: 'totalDr', label: 'Dr' }, { key: 'totalCr', label: 'Cr' }, { key: 'status', label: 'Status' }]} exportRows={() => rows as any}
      actions={<Button variant="secondary" size="sm" onClick={() => nav.go('accounting/day-book')}>Day book →</Button>}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /><div><label className="field-label">Source</label><select className="field-input sm" value={f.source} onChange={(e) => set({ source: e.target.value })}><option value="">All sources</option>{sources.map((x) => <option key={x} value={x}>{x}</option>)}</select></div><div><label className="field-label">Status</label><select className="field-input sm" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="">All</option>{['Posted', 'Draft', 'Reversed'].map((x) => <option key={x}>{x}</option>)}</select></div><div><label className="field-label">Search</label><input className="field-input sm" placeholder="Number, narration…" value={q} onChange={(e) => setQ(e.target.value)} /></div></>}>
      <SummaryBlock items={[{ label: 'Journals', value: rows.length }, { label: 'Posted', value: rows.filter((j) => j.status === 'Posted').length, tone: 'good' }, { label: 'Reversed', value: rows.filter((j) => j.status === 'Reversed').length, tone: rows.some((j) => j.status === 'Reversed') ? 'warn' : undefined }, { label: 'Total debits', value: fmtMoney(rows.reduce((x, j) => x + j.totalDr, 0), s.currency) }]} />
      <DataTable rows={rows} columns={cols} dense onRowClick={(j) => nav.go(`accounting/journals/${j.id}`)} showTotals emptyTitle={`No journals in ${fmtPeriod(range.from.slice(0, 7))}`} />
    </ReportFrame>
  );
}

export function hasJournals(): boolean {
  return db.count(C.journals) > 0;
}
