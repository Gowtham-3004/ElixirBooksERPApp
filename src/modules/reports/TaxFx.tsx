// Tax reports (GST summary, TDS register) and FX reports (FR-RPT-010/011).
import { useMemo } from 'react';
import { C, nav, useSession, useCollection, IDS, engine } from '../../store';
import type { Account, ExchangeRate, Journal, OpenItem } from '../../store';
import { DataTable, KpiTile, Badge, Pill, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtDateTime, fmtPeriod, today } from '../../lib/format';
import { ReportFrame, useReportFilters, PeriodPicker, RangeBar, useRange, rangeLabel } from './ReportFrame';
import { b2bRegister, b2cRegister, purchaseRegister, cdnRegister, sumRows, ledgerTax, tdsRegister } from '../taxation/derive';
import { fxExposure, realizedFx, rateAudit, ledgerBalances, type FxExposureRow } from './compute';

export function GstSummaryReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ period: s.state.periodCode ?? '' });
  const inv = useCollection<any>(C.salesInvoices); const vinv = useCollection<any>(C.vendorInvoices); const cn = useCollection<any>(C.creditNotes); const pos = useCollection<any>(C.posBills); const journals = useCollection<Journal>(C.journals);
  const period = f.period || s.state.periodCode || '2026-09';
  const data = useMemo(() => {
    const b2b = sumRows(b2bRegister({ period })), b2c = sumRows(b2cRegister({ period })), cdn = sumRows(cdnRegister({ period })), pur = purchaseRegister({ period });
    const elig = sumRows(pur.filter((r) => r.itcEligible)), inel = sumRows(pur.filter((r) => r.itcEligible === false));
    return { b2b, b2c, cdn, elig, inel, out: ledgerTax(period, 'output'), inp: ledgerTax(period, 'input') };
  }, [period, inv, vinv, cn, pos, journals]);
  const heads = [{ label: 'B2B sales (registered)', ...data.b2b }, { label: 'B2C sales (unregistered + POS)', ...data.b2c }, { label: 'Credit / debit notes', ...data.cdn }];
  const outTotal = { taxable: heads.reduce((x, h) => x + h.taxable, 0), cgst: heads.reduce((x, h) => x + h.cgst, 0), sgst: heads.reduce((x, h) => x + h.sgst, 0), igst: heads.reduce((x, h) => x + h.igst, 0) };
  const net = { cgst: outTotal.cgst - data.elig.cgst, sgst: outTotal.sgst - data.elig.sgst, igst: outTotal.igst - data.elig.igst };
  const cell = (n: number) => <td className="right money">{n ? fmtMoney(n, s.currency) : '—'}</td>;
  return (
    <ReportFrame id="gst-summary" title="GST summary" rangeLabel={fmtPeriod(period)} filterState={f} exportColumns={[{ key: 'label', label: 'Nature' }, { key: 'taxable', label: 'Taxable' }, { key: 'cgst', label: 'CGST' }, { key: 'sgst', label: 'SGST' }, { key: 'igst', label: 'IGST' }]} exportRows={() => [...heads, { label: 'ITC eligible', ...data.elig }, { label: 'ITC ineligible', ...data.inel }]}
      actions={<><Badge status="Draft">GSTIN {s.branch?.gstin ?? '—'}</Badge></>}
      filters={<PeriodPicker value={f.period} onChange={(v) => set({ period: v })} />}>
      <div className="section-label">Outward supplies (output tax) — from registers</div>
      <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Nature of supply</th><th className="right">Docs</th><th className="right">Taxable value</th><th className="right">CGST</th><th className="right">SGST</th><th className="right">IGST</th><th className="right">Cess</th></tr></thead><tbody>
        {heads.map((h) => <tr key={h.label} style={{ cursor: 'pointer' }} onClick={() => nav.go(h.label.startsWith('B2B') ? 'taxation/b2b' : h.label.startsWith('B2C') ? 'taxation/b2c' : 'taxation/cdn')}><td>{h.label}</td><td className="right">{h.count}</td>{cell(h.taxable)}{cell(h.cgst)}{cell(h.sgst)}{cell(h.igst)}{cell(h.cess)}</tr>)}
        <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}><td>Total output tax (registers)</td><td /><td className="right money">{fmtMoney(outTotal.taxable, s.currency)}</td><td className="right money">{fmtMoney(outTotal.cgst, s.currency)}</td><td className="right money">{fmtMoney(outTotal.sgst, s.currency)}</td><td className="right money">{fmtMoney(outTotal.igst, s.currency)}</td><td /></tr>
        <tr style={{ color: 'var(--ink-3)' }}><td>Output tax per ledger (2300/2301/2302 movement)</td><td /><td /><td className="right money">{fmtMoney(data.out.cgst, s.currency)}</td><td className="right money">{fmtMoney(data.out.sgst, s.currency)}</td><td className="right money">{fmtMoney(data.out.igst, s.currency)}</td><td /></tr>
      </tbody></table></div>
      <div className="section-label">Input tax credit (ITC)</div>
      <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Credit head</th><th className="right">Docs</th><th className="right">Taxable</th><th className="right">CGST</th><th className="right">SGST</th><th className="right">IGST</th></tr></thead><tbody>
        <tr style={{ cursor: 'pointer' }} onClick={() => nav.go('taxation/itc')}><td>Eligible ITC (registered suppliers)</td><td className="right">{data.elig.count}</td>{cell(data.elig.taxable)}{cell(data.elig.cgst)}{cell(data.elig.sgst)}{cell(data.elig.igst)}</tr>
        <tr style={{ cursor: 'pointer' }} onClick={() => nav.go('taxation/itc')}><td>Ineligible / blocked</td><td className="right">{data.inel.count}</td>{cell(data.inel.taxable)}{cell(data.inel.cgst)}{cell(data.inel.sgst)}{cell(data.inel.igst)}</tr>
        <tr style={{ color: 'var(--ink-3)' }}><td>Input tax per ledger (1400/1401/1402 movement)</td><td /><td /><td className="right money">{fmtMoney(data.inp.cgst, s.currency)}</td><td className="right money">{fmtMoney(data.inp.sgst, s.currency)}</td><td className="right money">{fmtMoney(data.inp.igst, s.currency)}</td></tr>
      </tbody></table></div>
      <div className="grid-4">
        <KpiTile label="Net CGST payable" value={fmtMoney(net.cgst, s.currency)} deltaTone={net.cgst > 0 ? 'bad' : 'good'} />
        <KpiTile label="Net SGST payable" value={fmtMoney(net.sgst, s.currency)} deltaTone={net.sgst > 0 ? 'bad' : 'good'} />
        <KpiTile label="Net IGST payable" value={fmtMoney(net.igst, s.currency)} deltaTone={net.igst > 0 ? 'bad' : 'good'} />
        <KpiTile label="Total GST payable (before set-off)" value={fmtMoney(net.cgst + net.sgst + net.igst, s.currency)} onClick={() => nav.go(`taxation/gstr3b?period=${period}`)} sub="Open GSTR-3B for set-off →" />
      </div>
    </ReportFrame>
  );
}

export function TdsReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ fy: s.state.fy ?? '2026-27', quarter: '', kind: '' });
  const pay = useCollection<any>(C.payments); const vinv = useCollection<any>(C.vendorInvoices); const rc = useCollection<any>(C.receipts); const ent = useCollection<any>(C.tdsEntries);
  const rows = useMemo(() => tdsRegister({ fy: f.fy || undefined, quarter: f.quarter || undefined, kind: (f.kind || undefined) as any }), [f, pay, vinv, rc, ent]);
  const total = rows.reduce((x, r) => x + r.amount, 0);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'sourceNumber', label: 'Reference', render: (r) => <div><span className="identifier link">{r.sourceNumber}</span><div className="cell-secondary">{r.sourceType}</div></div> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'partyName', label: 'Deductee / party', render: (r) => <div><div className="cell-primary">{r.partyName}</div><div className="cell-secondary identifier">{r.pan ?? 'PAN missing'}</div></div>, sortable: true },
    { key: 'section', label: 'Section', render: (r) => <Badge status="Draft">{r.section}</Badge> },
    { key: 'base', label: 'Base', align: 'right', render: (r) => <span className="money">{fmtMoney(r.base, s.currency)}</span> },
    { key: 'rate', label: 'Rate', render: (r) => (r.amount ? `${r.rate}%` : 'Nil') },
    { key: 'amount', label: 'TDS / TCS', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.amount ? 'var(--danger)' : 'var(--ink-5)' }}>{r.amount ? fmtMoney(r.amount, s.currency) : '—'}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(total, s.currency)}</span> },
    { key: 'quarter', label: 'Quarter' },
    { key: 'certificateNo', label: 'Certificate', render: (r) => <span className="identifier">{r.certificateNo ?? '—'}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Exempt' ? 'Cancelled' : r.status === 'Deducted' ? 'Posted' : r.status} >{r.status}</Badge> },
  ];
  return (
    <ReportFrame id="tds" title="TDS / TCS register" rangeLabel={`FY ${f.fy}${f.quarter ? ' · ' + f.quarter : ''}`} filterState={f} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      actions={<Badge status="Draft">Ledger 2310: {fmtMoney(engine.accountBalance(IDS.accTDSPayable).net, s.currency)}</Badge>}
      filters={<><div><label className="field-label">FY</label><select className="field-input sm" value={f.fy} onChange={(e) => set({ fy: e.target.value })}>{['2026-27', '2025-26'].map((x) => <option key={x}>{x}</option>)}</select></div><div><label className="field-label">Quarter</label><select className="field-input sm" value={f.quarter} onChange={(e) => set({ quarter: e.target.value })}><option value="">All</option>{['Q1', 'Q2', 'Q3', 'Q4'].map((x) => <option key={x}>{x}</option>)}</select></div><div><label className="field-label">Kind</label><select className="field-input sm" value={f.kind} onChange={(e) => set({ kind: e.target.value })}><option value="">TDS + TCS</option><option>TDS</option><option>TCS</option></select></div></>}>
      <DataTable rows={rows} columns={cols} dense showTotals onRowClick={(r) => (r.link ? nav.go(r.link) : nav.go('taxation/tds'))} emptyTitle="No TDS/TCS deductions" emptyDescription="Deductions derive from posted payments, vendor invoices and receipts." />
    </ReportFrame>
  );
}

// ── FX ─────────────────────────────────────────────────────────────────────

export function FxExposureReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ asOf: today(), side: '' });
  const items = useCollection<OpenItem>(C.openItems); const rates = useCollection<ExchangeRate>(C.exchangeRates); const journals = useCollection<Journal>(C.journals);
  const rows = useMemo(() => fxExposure(f.asOf).filter((r) => !f.side || r.partyType === f.side), [f, items, rates]);
  const banks = useMemo(() => { const bal = ledgerBalances({ to: f.asOf }); return useBankAccounts().map((a) => ({ id: a.id, code: a.code, name: a.name, currency: a.fixedCurrency ?? s.currency, balance: bal.get(a.id)?.closing ?? 0 })); }, [f.asOf, journals]);
  const byCur = useMemo(() => { const m = new Map<string, { currency: string; ar: number; ap: number; arBase: number; apBase: number; unrealized: number }>(); rows.forEach((r) => { const c = m.get(r.currency) ?? { currency: r.currency, ar: 0, ap: 0, arBase: 0, apBase: 0, unrealized: 0 }; if (r.partyType === 'Customer') { c.ar += r.outstanding; c.arBase += r.currentBase; } else { c.ap += r.outstanding; c.apBase += r.currentBase; } c.unrealized += r.unrealized; m.set(r.currency, c); }); return Array.from(m.values()); }, [rows]);
  const cols: Column<FxExposureRow>[] = [
    { key: 'docNumber', label: 'Document', render: (r) => <div><span className="identifier link">{r.docNumber}</span><div className="cell-secondary">{r.partyType} · {r.partyName}</div></div> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
    { key: 'dueDate', label: 'Due', render: (r) => fmtDate(r.dueDate) },
    { key: 'currency', label: 'Cur', render: (r) => <span className="currency-tag">{r.currency}</span> },
    { key: 'outstanding', label: 'Outstanding (txn)', align: 'right', render: (r) => <span className="money">{fmtMoney(r.outstanding, r.currency, { code: true })}</span> },
    { key: 'bookedRate', label: 'Booked rate', align: 'right', render: (r) => <span className="money">{r.bookedRate}</span> },
    { key: 'baseOutstanding', label: 'Base carrying', align: 'right', render: (r) => <span className="money">{fmtMoney(r.baseOutstanding, s.currency)}</span> },
    { key: 'currentRate', label: 'Current rate', align: 'right', render: (r) => <span className="money" title={r.rateSource}>{r.currentRate}</span> },
    { key: 'currentBase', label: 'At current rate', align: 'right', render: (r) => <span className="money">{fmtMoney(r.currentBase, s.currency)}</span> },
    { key: 'unrealized', label: 'Unrealized gain / (loss)', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.unrealized >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(r.unrealized, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.unrealized, 0), s.currency)}</span> },
  ];
  return (
    <ReportFrame id="fx-exposure" title="Currency-wise AR / AP & exposure" rangeLabel={`As at ${fmtDate(f.asOf)}`} filterState={f} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<><div><label className="field-label">As at</label><input type="date" className="field-input sm" value={f.asOf} onChange={(e) => set({ asOf: e.target.value })} /></div><div><label className="field-label">Side</label><select className="field-input sm" value={f.side} onChange={(e) => set({ side: e.target.value })}><option value="">AR + AP</option><option value="Customer">Receivables</option><option value="Supplier">Payables</option></select></div></>}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--hairline)' }}>Exposure by currency</div><table className="data-table dense"><thead><tr><th>Currency</th><th className="right">AR (txn)</th><th className="right">AP (txn)</th><th className="right">Net base</th><th className="right">Unrealized</th></tr></thead><tbody>{byCur.map((c) => <tr key={c.currency}><td><span className="currency-tag">{c.currency}</span></td><td className="right money">{fmtMoney(c.ar, c.currency, { code: true })}</td><td className="right money">{fmtMoney(c.ap, c.currency, { code: true })}</td><td className="right money">{fmtMoney(c.arBase - c.apBase, s.currency)}</td><td className="right money" style={{ color: c.unrealized >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(c.unrealized, s.currency)}</td></tr>)}{byCur.length === 0 && <tr><td colSpan={5} style={{ color: 'var(--ink-4)' }}>No foreign-currency open items</td></tr>}</tbody></table></div>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--hairline)' }}>Bank balances by currency</div><table className="data-table dense"><thead><tr><th>Account</th><th>Currency</th><th className="right">Balance (base)</th></tr></thead><tbody>{banks.map((b) => <tr key={b.id} style={{ cursor: 'pointer' }} onClick={() => nav.go(`accounting/ledger?account=${b.id}`)}><td><span className="identifier">{b.code}</span> · {b.name}</td><td><span className="currency-tag">{b.currency}</span></td><td className="right money">{fmtMoney(b.balance, s.currency)}</td></tr>)}</tbody></table></div>
      </div>
      <DataTable rows={rows} rowKey={(r) => r.openItemId} columns={cols} dense showTotals onRowClick={(r) => nav.go(r.partyType === 'Customer' ? 'sales/ar' : 'purchase/ap')} emptyTitle="No foreign-currency open items" emptyDescription="Foreign invoices (e.g. USD export sales) appear here with their booked and current rates." />
    </ReportFrame>
  );
}

function useBankAccounts(): Account[] {
  const cid = engine.ctx().companyId;
  return engine.db.where<Account>(C.accounts, (a) => a.companyId === cid && (a.isBank || a.controlType === 'Bank' || a.controlType === 'Cash'));
}

export function FxGainLossReport() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'FY', period: s.state.periodCode ?? '', from: '', to: '' });
  const range = useRange(f);
  const items = useCollection<OpenItem>(C.openItems); const journals = useCollection<Journal>(C.journals); const revals = useCollection<any>(C.revaluationRuns);
  const rows = useMemo(() => realizedFx(range), [range, items]);
  const ledger = useMemo(() => { const bal = ledgerBalances(range); const g = (id: string) => bal.get(id); return { realizedGain: (g(IDS.accFxGain)?.cr ?? 0) - (g(IDS.accFxGain)?.dr ?? 0), realizedLoss: (g(IDS.accFxLoss)?.dr ?? 0) - (g(IDS.accFxLoss)?.cr ?? 0), unrealGain: (g('acc_4920')?.cr ?? 0) - (g('acc_4920')?.dr ?? 0), unrealLoss: (g('acc_5610')?.dr ?? 0) - (g('acc_5610')?.cr ?? 0) }; }, [range, journals]);
  const fxJournals = useMemo(() => journals.filter((j) => j.status === 'Posted' && j.date >= range.from && j.date <= range.to && (j.sourceType === 'FX Settlement' || j.type === 'Revaluation')), [journals, range]);
  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'partyName', label: 'Party' },
    { key: 'docNumber', label: 'Document', render: (r) => <span className="identifier">{r.docNumber}</span> },
    { key: 'settledBy', label: 'Settled by', render: (r) => <span className="identifier link">{r.settledBy}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <span className="money">{fmtMoney(r.amount, r.currency, { code: true })}</span> },
    { key: 'bookedRate', label: 'Booked', align: 'right' },
    { key: 'settledRate', label: 'Settled', align: 'right' },
    { key: 'gainLoss', label: 'Realized gain / (loss)', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.gainLoss >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(r.gainLoss, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.gainLoss, 0), s.currency)}</span> },
  ];
  return (
    <ReportFrame id="fx-gainloss" title="FX gain / loss & revaluation" rangeLabel={rangeLabel(range)} filterState={f} exportColumns={cols.map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}
      filters={<RangeBar f={f} set={set} />}>
      <div className="grid-4">
        <KpiTile label="Realized gain (ledger 4910)" value={fmtMoney(ledger.realizedGain, s.currency)} onClick={() => nav.go(`accounting/ledger?account=${IDS.accFxGain}`)} />
        <KpiTile label="Realized loss (ledger 5600)" value={fmtMoney(ledger.realizedLoss, s.currency)} onClick={() => nav.go(`accounting/ledger?account=${IDS.accFxLoss}`)} />
        <KpiTile label="Unrealized gain (4920)" value={fmtMoney(ledger.unrealGain, s.currency)} sub="period-end revaluation" />
        <KpiTile label="Unrealized loss (5610)" value={fmtMoney(ledger.unrealLoss, s.currency)} sub="period-end revaluation" />
      </div>
      <div className="section-title">Realized gain / loss on settlements (from open-item settlement history)</div>
      <DataTable rows={rows} rowKey={(r) => r.docNumber + r.settledBy + r.date} columns={cols} dense showTotals emptyTitle="No realized FX in this range" emptyDescription="Settling a foreign-currency invoice at a different rate posts a realized gain or loss." />
      <div className="section-title">Revaluation runs & FX journals</div>
      <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Run / journal</th><th>Date</th><th>Type</th><th>Narration</th><th className="right">Amount</th><th>Status</th></tr></thead><tbody>
        {revals.map((r: any) => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav.go('accounting/revaluation')}><td className="identifier link">{r.number ?? r.id}</td><td>{fmtDate(r.date ?? r.asOf)}</td><td>Revaluation</td><td>{r.narration ?? `${r.currency ?? ''} @ ${r.rate ?? ''}`}</td><td className="right money">{fmtMoney(r.total ?? r.amount ?? 0, s.currency)}</td><td><Badge status={r.status ?? 'Posted'} /></td></tr>)}
        {fxJournals.map((j) => <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => nav.go(`accounting/journals/${j.id}`)}><td className="identifier link">{j.number}</td><td>{fmtDate(j.date)}</td><td>{j.sourceType}</td><td>{j.narration}</td><td className="right money">{fmtMoney(j.totalDr, s.currency)}</td><td><Badge status={j.status} /></td></tr>)}
        {revals.length + fxJournals.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-4)' }}>No revaluation runs or FX journals in this range — run one under Accounting › FX revaluation.</td></tr>}
      </tbody></table></div>
    </ReportFrame>
  );
}

export function RateAuditReport() {
  const s = useSession();
  const rates = useCollection<ExchangeRate>(C.exchangeRates);
  const rows = useMemo(() => rateAudit(), [rates]);
  const cols: Column<ExchangeRate>[] = [
    { key: 'effectiveAt', label: 'Effective', render: (r) => fmtDateTime(r.effectiveAt), sortable: true },
    { key: 'pair', label: 'Pair', render: (r) => <span className="identifier">{r.base}/{r.quote}</span> },
    { key: 'rate', label: 'Rate', align: 'right', render: (r) => <span className="money">{r.rate}</span> },
    { key: 'type', label: 'Type', render: (r) => <Badge status="Draft">{r.type}</Badge> },
    { key: 'source', label: 'Source' },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Pending' ? 'Submitted' : r.status} >{r.status}</Badge> },
    { key: 'approvedBy', label: 'Approved by', render: (r) => r.approvedBy ?? <Pill tone="warning">Awaiting approval</Pill> },
    { key: 'reason', label: 'Reason / note', render: (r) => r.reason ?? '—' },
  ];
  return (
    <ReportFrame id="fx-rates" title="Exchange rate audit" rangeLabel={`${rows.length} rates on file`} exportColumns={cols.filter((c) => c.key !== 'pair').map((c) => ({ key: c.key, label: String(c.label) }))} exportRows={() => rows as any}>
      <DataTable rows={rows} columns={cols} dense onRowClick={() => nav.go('accounting/fx-rates')} emptyTitle="No exchange rates" />
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Resolution hierarchy: Spot → Closing → Manual → Imported → Historical → Average; cross via INR/USD (FR-FX-003). Current USD/INR: {engine.resolveRate('USD', s.currency).rate} ({engine.resolveRate('USD', s.currency).type}).</div>
    </ReportFrame>
  );
}
