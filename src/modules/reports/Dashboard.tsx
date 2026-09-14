// CFO dashboard (FR-RPT-005/006, design §6.8 / §7.18): live KPI tiles with scope · period · currency · updated meta rows,
// stale pill + refresh after 5 minutes, revenue trend, branch performance, quick report links.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { C, nav, useSession, useCollection, IDS, engine } from '../../store';
import type { Journal, OpenItem, Branch } from '../../store';
import { Button, Pill, Segmented, Card } from '../../components/ui';
import { RefreshIcon, DownloadIcon, TrendingUpIcon, TrendingDownIcon } from '../../components/Icons';
import { fmtMoneyCompact, fmtMoney, fmtPct, fmtPeriod, toCSV, downloadText } from '../../lib/format';
import { profitAndLoss, balanceSheet, ageing, ledgerBalances, presetRange, monthRange, shiftRange, periodsBetween, type Range } from './compute';
import { activeBudget, budgetVsActual } from '../budgets/compute';
import { ledgerTax } from '../taxation/derive';

const STALE_MS = 5 * 60 * 1000;

export function useFreshness() {
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  const stale = now - lastRefreshed.getTime() > STALE_MS;
  const ageMin = Math.floor((now - lastRefreshed.getTime()) / 60000);
  return { lastRefreshed, stale, ageMin, refresh: () => { setLastRefreshed(new Date()); setNow(Date.now()); }, updated: lastRefreshed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) };
}

function Widget({ title, sub, children, meta, onDrill, stale, onRefresh, span }: { title: string; sub?: string; children: ReactNode; meta: string; onDrill?: () => void; stale?: boolean; onRefresh?: () => void; span?: number }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12, gridColumn: span ? `span ${span}` : undefined, cursor: onDrill ? 'pointer' : undefined }} onClick={onDrill}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div><div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>{sub && <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>{sub}</div>}</div>
        {stale && <span onClick={(e) => { e.stopPropagation(); onRefresh?.(); }}><Pill tone="warning">Stale · refresh</Pill></span>}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-4)', borderTop: '1px solid var(--surface-3)', paddingTop: 8 }}>{meta}</div>
    </div>
  );
}

function Tile({ label, value, delta, favorable, sub, meta, onClick, stale }: { label: string; value: string; delta?: string; favorable?: boolean; sub?: string; meta: string; onClick?: () => void; stale?: boolean }) {
  return (
    <div className="kpi-tile" style={{ cursor: onClick ? 'pointer' : undefined, display: 'flex', flexDirection: 'column', gap: 4 }} onClick={onClick}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span className="section-label">{label}</span>{stale && <Pill tone="warning">Stale</Pill>}</div>
      <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>{value}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        {delta ? <span style={{ color: favorable ? 'var(--good)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 3 }}>{favorable ? <TrendingUpIcon size={11} /> : <TrendingDownIcon size={11} />}{delta}</span> : <span />}
        {sub && <span style={{ color: 'var(--ink-4)', fontVariantNumeric: 'normal' }}>{sub}</span>}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 6, borderTop: '1px solid var(--surface-3)', paddingTop: 8, fontVariantNumeric: 'normal' }}>{meta}</div>
    </div>
  );
}

export function CfoDashboard() {
  const s = useSession();
  const fresh = useFreshness();
  const [preset, setPreset] = useState<'MTD' | 'QTD' | 'YTD'>('YTD');
  const journals = useCollection<Journal>(C.journals);
  const openItems = useCollection<OpenItem>(C.openItems);
  const budgets = useCollection<any>(C.budgets);
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId && b.status === 'Active');
  const period = s.state.periodCode ?? '2026-09';
  const fyStart = s.company?.fiscalYearStartMonth ?? 4;
  const range: Range = useMemo(() => presetRange(preset, period, fyStart), [preset, period, fyStart]);
  const prior = useMemo(() => shiftRange(range, -(periodsBetween(range).length)), [range]);
  const data = useMemo(() => {
    const pl = profitAndLoss(range);
    const plPrior = profitAndLoss(prior);
    const bs = balanceSheet(range.to);
    const bal = ledgerBalances({ to: range.to });
    const accounts = engine.db.where<any>(C.accounts, (a) => a.companyId === s.state.companyId);
    const cash = accounts.filter((a) => a.controlType === 'Bank' || a.controlType === 'Cash').reduce((x, a) => x + (bal.get(a.id)?.closing ?? 0), 0);
    const currentAssets = accounts.filter((a) => a.groupId === 'ag_ca').reduce((x, a) => x + (bal.get(a.id)?.closing ?? 0), 0);
    const currentLiab = accounts.filter((a) => a.groupId === 'ag_cl').reduce((x, a) => x - (bal.get(a.id)?.closing ?? 0), 0);
    const ar = ageing('Customer', range.to);
    const ap = ageing('Supplier', range.to);
    const days = Math.max(1, periodsBetween(range).length * 30);
    const dso = pl.revenue > 0 ? Math.round((ar.totals.total / pl.revenue) * days) : 0;
    const dpo = pl.cogs > 0 ? Math.round((ap.totals.total / pl.cogs) * days) : 0;
    const bud = activeBudget(s.state.fy ?? '2026-27');
    const bva = budgetVsActual(bud, range);
    const gst = ledgerTax(period, 'output');
    const itc = ledgerTax(period, 'input');
    const tds = engine.accountBalance(IDS.accTDSPayable, { to: range.to }).net;
    const trendPeriods = periodsBetween(shiftRange(monthRange(period), -5)).concat(period).slice(-6);
    const trend = trendPeriods.map((p) => ({ period: p, revenue: profitAndLoss(monthRange(p)).revenue }));
    const byBranch = branches.map((b) => { const p = profitAndLoss(range, { branchId: b.id }); return { branch: b, revenue: p.revenue, gm: p.revenue ? (p.grossProfit / p.revenue) * 100 : 0, net: p.netProfit }; }).sort((a, b) => b.revenue - a.revenue);
    return { pl, plPrior, bs, cash, currentAssets, currentLiab, ar, ap, dso, dpo, bva, gst, itc, tds, trend, byBranch, overdueAr: ar.rows.filter((r) => r.overdueDays > 0).length };
  }, [range, prior, journals, openItems, budgets, branches, period, s.state.companyId, s.state.fy, fresh.lastRefreshed]);
  const meta = `${s.company?.tradeName ?? s.company?.legalName} · ${s.branch?.name ?? 'All branches'} · ${preset === 'MTD' ? fmtPeriod(period) : preset} · ${s.currency} · Updated ${fresh.updated}`;
  const pct = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : 0);
  const gm = data.pl.revenue ? (data.pl.grossProfit / data.pl.revenue) * 100 : 0;
  const nm = data.pl.revenue ? (data.pl.netProfit / data.pl.revenue) * 100 : 0;
  const gmPrior = data.plPrior.revenue ? (data.plPrior.grossProfit / data.plPrior.revenue) * 100 : 0;
  const exportAll = () => downloadText(`cfo-dashboard-${range.to}.csv`, toCSV([
    { metric: 'Revenue', value: data.pl.revenue }, { metric: 'Gross margin %', value: gm.toFixed(1) }, { metric: 'Net profit', value: data.pl.netProfit }, { metric: 'Operating expenses', value: data.pl.opex },
    { metric: 'Cash & bank', value: data.cash }, { metric: 'AR outstanding', value: data.ar.totals.total }, { metric: 'AP outstanding', value: data.ap.totals.total }, { metric: 'Working capital', value: data.currentAssets - data.currentLiab },
    { metric: 'Budget variance (net)', value: data.bva.totals.net.variance }, { metric: 'GST payable (net, period)', value: data.gst.tax - data.itc.tax }, { metric: 'TDS payable', value: data.tds }, { metric: 'DSO', value: data.dso }, { metric: 'DPO', value: data.dpo },
  ]));
  const maxT = Math.max(1, ...data.trend.map((t) => t.revenue));
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">CFO Dashboard</h1>
          <p className="page-subtitle" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{meta}{fresh.stale && <Pill tone="warning">Stale {fresh.ageMin} min</Pill>}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Segmented value={preset} onChange={(v) => setPreset(v as any)} options={['MTD', 'QTD', 'YTD']} />
          <Button variant="secondary" icon={<RefreshIcon size={14} />} onClick={fresh.refresh}>Refresh</Button>
          <Button variant="secondary" icon={<DownloadIcon size={14} />} onClick={exportAll}>Export</Button>
        </div>
      </div>
      <div className="grid-4">
        <Tile label="Revenue" value={fmtMoneyCompact(data.pl.revenue, s.currency)} delta={`${pct(data.pl.revenue, data.plPrior.revenue) >= 0 ? '↑' : '↓'} ${fmtPct(Math.abs(pct(data.pl.revenue, data.plPrior.revenue)))}`} favorable={data.pl.revenue >= data.plPrior.revenue} sub="vs prior" meta={meta} stale={fresh.stale} onClick={() => nav.go(`reports/pl?preset=${preset}`)} />
        <Tile label="Gross margin" value={fmtPct(gm)} delta={`${gm - gmPrior >= 0 ? '↑' : '↓'} ${Math.abs(gm - gmPrior).toFixed(1)} pp`} favorable={gm >= gmPrior} sub={`on ${fmtMoneyCompact(data.pl.revenue, s.currency)}`} meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/margin')} />
        <Tile label="Operating expense" value={fmtMoneyCompact(data.pl.opex, s.currency)} delta={`${pct(data.pl.opex, data.plPrior.opex) >= 0 ? '↑' : '↓'} ${fmtPct(Math.abs(pct(data.pl.opex, data.plPrior.opex)))}`} favorable={data.pl.opex <= data.plPrior.opex} sub="vs prior" meta={meta} stale={fresh.stale} onClick={() => nav.go(`reports/pl?preset=${preset}`)} />
        <Tile label="Net profit" value={fmtMoneyCompact(data.pl.netProfit, s.currency)} delta={`${fmtPct(nm)} net margin`} favorable={data.pl.netProfit >= 0} sub="before tax" meta={meta} stale={fresh.stale} onClick={() => nav.go(`reports/pl?preset=${preset}`)} />
        <Tile label="AR outstanding" value={fmtMoneyCompact(data.ar.totals.total, s.currency)} delta={`${data.overdueAr} overdue`} favorable={data.overdueAr === 0} sub={`DSO ${data.dso} days`} meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/ar-ageing')} />
        <Tile label="AP outstanding" value={fmtMoneyCompact(data.ap.totals.total, s.currency)} delta={`${data.ap.rows.length} suppliers`} favorable sub={`DPO ${data.dpo} days`} meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/ap-ageing')} />
        <Tile label="Cash position" value={fmtMoneyCompact(data.cash, s.currency)} delta={data.cash >= 0 ? 'Positive' : 'Overdrawn'} favorable={data.cash >= 0} sub="all bank & cash accounts" meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/cash-flow')} />
        <Tile label="Working capital" value={fmtMoneyCompact(data.currentAssets - data.currentLiab, s.currency)} delta={`Current ratio ${data.currentLiab ? (data.currentAssets / data.currentLiab).toFixed(1) : '—'}`} favorable={data.currentAssets >= data.currentLiab} sub="current assets − liabilities" meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/balance-sheet')} />
        <Tile label="Budget variance" value={fmtMoneyCompact(data.bva.totals.net.variance, s.currency)} delta={data.bva.totals.net.favorable ? 'Ahead of plan' : 'Behind plan'} favorable={data.bva.totals.net.favorable} sub={`expenses at ${fmtPct(data.bva.totals.expense.utilizationPct, 0)}`} meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/budget-variance')} />
        <Tile label="GST liability (period)" value={fmtMoneyCompact(data.gst.tax - data.itc.tax, s.currency)} delta={`output ${fmtMoneyCompact(data.gst.tax, s.currency)} · ITC ${fmtMoneyCompact(data.itc.tax, s.currency)}`} favorable sub={fmtPeriod(period)} meta={meta} stale={fresh.stale} onClick={() => nav.go('taxation')} />
        <Tile label="TDS payable" value={fmtMoneyCompact(data.tds, s.currency)} delta="ledger 2310" favorable sub="deposit by 7th" meta={meta} stale={fresh.stale} onClick={() => nav.go('taxation/tds')} />
        <Tile label="EBITDA" value={fmtMoneyCompact(data.pl.ebitda, s.currency)} delta={`${fmtPct(data.pl.revenue ? (data.pl.ebitda / data.pl.revenue) * 100 : 0)} of revenue`} favorable={data.pl.ebitda >= 0} sub={`depreciation ${fmtMoneyCompact(data.pl.depreciation, s.currency)}`} meta={meta} stale={fresh.stale} onClick={() => nav.go('reports/pl')} />
      </div>
      <div className="grid-2">
        <Widget title="Revenue trend" sub="Monthly revenue from posted journals · 6-month view" meta={meta} stale={fresh.stale} onRefresh={fresh.refresh} onDrill={() => nav.go('reports/sales-analysis?by=period&preset=YTD')}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
            {data.trend.map((t, i) => (
              <div key={t.period} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 10, color: 'var(--ink-3)', fontVariantNumeric: 'tabular-nums' }}>{t.revenue ? fmtMoneyCompact(t.revenue, s.currency).replace(/\.\d+/, '') : ''}</span>
                <div style={{ width: '100%', background: i === data.trend.length - 1 ? 'var(--accent)' : 'var(--accent-soft)', borderRadius: '4px 4px 0 0', height: `${Math.max(2, (t.revenue / maxT) * 100)}px` }} title={fmtMoney(t.revenue, s.currency)} />
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{fmtPeriod(t.period).slice(0, 3)}</span>
              </div>
            ))}
          </div>
        </Widget>
        <Widget title="Branch performance" sub={`Revenue & gross margin by branch · ${preset}`} meta={meta} stale={fresh.stale} onRefresh={fresh.refresh} onDrill={() => nav.go('reports/profitability?by=branch')}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {data.byBranch.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>No data for {fmtPeriod(period)}</div>}
            {data.byBranch.map((b, i) => {
              const max = Math.max(1, ...data.byBranch.map((x) => x.revenue));
              return (
                <div key={b.branch.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div><span style={{ fontSize: 14, fontWeight: 500 }}>{b.branch.name}</span><span style={{ fontSize: 12, color: 'var(--ink-4)', marginLeft: 8 }}>GM {fmtPct(b.gm)} · net {fmtMoneyCompact(b.net, s.currency)}</span></div>
                    <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoneyCompact(b.revenue, s.currency)}</span>
                  </div>
                  <div style={{ height: 6, background: '#F3F5F5', borderRadius: 9999 }}><div style={{ height: '100%', width: `${(b.revenue / max) * 100}%`, background: ['#325CFF', '#22C55E', '#F97316', '#A855F7'][i % 4], borderRadius: 9999 }} /></div>
                </div>
              );
            })}
          </div>
        </Widget>
      </div>
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between' }}><h3 style={{ fontSize: 15, fontWeight: 600 }}>Quick reports</h3><span style={{ fontSize: 12, color: 'var(--ink-4)' }}>{meta}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { cat: 'Financial statements', items: [['Trial balance', 'reports/trial-balance'], ['Profit & loss', 'reports/pl'], ['Balance sheet', 'reports/balance-sheet'], ['Cash flow statement', 'reports/cash-flow']] },
            { cat: 'AR / AP', items: [['Customer outstanding', 'reports/customer-outstanding'], ['AR ageing', 'reports/ar-ageing'], ['Supplier outstanding', 'reports/supplier-outstanding'], ['AP ageing', 'reports/ap-ageing']] },
            { cat: 'Tax & compliance', items: [['GST summary', 'reports/gst-summary'], ['GSTR-1', 'taxation/gstr1'], ['TDS register', 'reports/tds'], ['e-Invoices', 'taxation/einvoices']] },
            { cat: 'Operations', items: [['Stock valuation', 'reports/stock-valuation'], ['Gross margin', 'reports/margin'], ['Budget variance', 'reports/budget-variance'], ['FX exposure', 'reports/fx-exposure']] },
          ].map((group, gi) => (
            <div key={group.cat} style={{ padding: '16px 20px', borderRight: gi < 3 ? '1px solid var(--line)' : 'none' }}>
              <div className="section-label" style={{ marginBottom: 10 }}>{group.cat}</div>
              {group.items.map(([label, path]) => <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }} onClick={() => nav.go(path)}><span style={{ fontSize: 13, color: 'var(--accent)' }}>{label}</span><span style={{ color: 'var(--ink-5)' }}>›</span></div>)}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
