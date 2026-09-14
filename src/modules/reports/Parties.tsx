// Receivables & payables reports: ageing, outstanding by party, collections / due schedule (FR-RPT-002/010).
import { useMemo } from 'react';
import { C, db, engine, nav, useSession, useCollection } from '../../store';
import type { OpenItem, DocHeader } from '../../store';
import { DataTable, KpiTile, Badge, Pill, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, today, daysBetween, addDays } from '../../lib/format';
import { ReportFrame, useReportFilters, BranchPicker, RangeBar, useRange, rangeLabel } from './ReportFrame';
import { ageing, BUCKETS, CONTROL_ACCOUNTS, type AgeingRow } from './compute';

export function AgeingReport({ partyType }: { partyType: 'Customer' | 'Supplier' }) {
  const s = useSession();
  const [f, set] = useReportFilters({ asOf: today(), branchId: '', currency: '' });
  const items = useCollection<OpenItem>(C.openItems);
  const journals = useCollection(C.journals);
  // The ageing lists the items that sit in the control account itself. Unapplied receipts/payments
  // and retainers are held on their own accounts, so they are reported separately below rather than
  // netted into a bucket that is meant to explain AR/AP control (FR-ACC-022, FR-RPT-009).
  const res = useMemo(() => ageing(partyType, f.asOf, { branchId: f.branchId || undefined, currency: f.currency || undefined }), [partyType, f, items]);
  const advances = useMemo(() => ageing(partyType, f.asOf, { branchId: f.branchId || undefined, currency: f.currency || undefined, scope: 'advance' }), [partyType, f, items]);
  const recon = useMemo(() => {
    const acc = CONTROL_ACCOUNTS[partyType];
    const bal = (ids: readonly string[]) => Math.round(ids.reduce((x, id) => x + (db.find(C.accounts, id) ? engine.accountBalance(id, { to: f.asOf, branchId: f.branchId || undefined }).net : 0), 0) * 100) / 100;
    const control = bal(acc.control);
    const advance = bal(acc.advance);
    return { control, advance, diff: Math.round((control - res.totals.total) * 100) / 100, advanceDiff: Math.round((advance + advances.totals.total) * 100) / 100 };
  }, [partyType, f, journals, items, res.totals.total, advances.totals.total]);
  const currencies = Array.from(new Set(items.filter((i) => i.partyType === partyType).map((i) => i.currency)));
  const cols: Column<AgeingRow>[] = [
    { key: 'partyName', label: partyType, render: (r) => <div><div className="cell-primary">{r.partyName}</div><div className="cell-secondary">{r.items.length} open item{r.items.length === 1 ? '' : 's'}{r.overdueDays > 0 ? ` · oldest overdue ${r.overdueDays} d` : ''}</div></div>, sortable: true },
    ...BUCKETS.map<Column<AgeingRow>>((b) => ({ key: b.key, label: b.label, align: 'right', render: (r) => <span className="money" style={{ color: r[b.key] ? b.color : 'var(--line-strong)' }}>{r[b.key] ? fmtMoney(r[b.key], s.currency) : '—'}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(res.totals[b.key], s.currency)}</span> })),
    { key: 'total', label: 'Total', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.total, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(res.totals.total, s.currency)}</span>, sortable: true },
  ];
  const title = partyType === 'Customer' ? 'AR ageing' : 'AP ageing';
  return (
    <ReportFrame id={partyType === 'Customer' ? 'ar-ageing' : 'ap-ageing'} title={title} rangeLabel={`As at ${fmtDate(f.asOf)}`} filterState={f}
      exportColumns={[{ key: 'partyName', label: partyType }, ...BUCKETS.map((b) => ({ key: b.key, label: b.label })), { key: 'total', label: 'Total' }]} exportRows={() => res.rows as any}
      filters={<><div><label className="field-label">As at</label><input type="date" className="field-input sm" value={f.asOf} onChange={(e) => set({ asOf: e.target.value })} /></div><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /><div><label className="field-label">Currency</label><select className="field-input sm" value={f.currency} onChange={(e) => set({ currency: e.target.value })}><option value="">All (base equivalent)</option>{currencies.map((c) => <option key={c}>{c}</option>)}</select></div></>}>
      <div style={{ display: 'flex', gap: 10 }}>
        {BUCKETS.map((b) => <div key={b.key} className="card" style={{ flex: 1, padding: '10px 14px', borderLeft: `3px solid ${b.color}` }}><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{b.label}</div><div className="money" style={{ fontSize: 16, fontWeight: 700, color: b.color }}>{fmtMoney(res.totals[b.key], s.currency)}</div></div>)}
      </div>
      <DataTable rows={res.rows} rowKey={(r) => r.partyId} columns={cols} showTotals onRowClick={(r) => nav.go(partyType === 'Customer' ? `sales/ar?party=${r.partyId}` : `purchase/ap?party=${r.partyId}`)} emptyTitle={`No open ${partyType.toLowerCase()} items`} emptyDescription="Open items appear here once invoices are posted." />
      <div className="grid-3">
        <KpiTile label={`Sub-ledger total (${partyType === 'Customer' ? 'AR' : 'AP'} ageing)`} amount={res.totals.total} currency={s.currency} sub={`${res.rows.length} ${partyType.toLowerCase()}(s) with open items`} />
        <KpiTile label={`Control account ${partyType === 'Customer' ? '1100' : '2100'}`} amount={recon.control} currency={s.currency} sub={`As at ${fmtDate(f.asOf)}`} onClick={() => nav.go(`accounting/ledger?account=${CONTROL_ACCOUNTS[partyType].control[0]}`)} />
        <KpiTile label="Difference" amount={recon.diff} currency={s.currency} deltaTone={Math.abs(recon.diff) < 1 ? 'good' : 'bad'} delta={Math.abs(recon.diff) < 1 ? 'Reconciled' : 'Sub-ledger ≠ GL'} sub="FR-RPT-009 exception if non-zero" />
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>
        Amounts in {s.currency} base equivalent · foreign items carried at booked rate · click a row to open the party ledger.
        {advances.totals.total !== 0 && <> Unapplied {partyType === 'Customer' ? 'receipts and retainers' : 'advances'} of {fmtMoney(-advances.totals.total, s.currency)} are held on {partyType === 'Customer' ? 'accounts 2150 / 2160' : 'account 1450'} and are not part of this ageing.</>}
      </div>
    </ReportFrame>
  );
}

export function OutstandingReport({ partyType }: { partyType: 'Customer' | 'Supplier' }) {
  const s = useSession();
  const [f, set] = useReportFilters({ branchId: '', status: 'open' });
  const items = useCollection<OpenItem>(C.openItems);
  const rows = useMemo(() => items.filter((o) => o.partyType === partyType && (!o.companyId || o.companyId === s.state.companyId) && (!f.branchId || o.branchId === f.branchId) && (f.status === 'all' || (o.status !== 'Settled' && o.status !== 'Written Off'))).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [items, partyType, f, s.state.companyId]);
  const t = today();
  const cols: Column<OpenItem>[] = [
    { key: 'docNumber', label: 'Document', render: (o) => <div><span className="identifier link">{o.docNumber}</span><div className="cell-secondary">{o.docType}</div></div> },
    { key: 'partyName', label: partyType, sortable: true },
    { key: 'date', label: 'Date', render: (o) => fmtDate(o.date) },
    { key: 'dueDate', label: 'Due', render: (o) => <span>{fmtDate(o.dueDate)}{o.direction === 'Debit' && o.dueDate < t && o.outstanding > 0 && <Pill tone="critical" title="Overdue">{daysBetween(o.dueDate, t)} d</Pill>}</span>, sortable: true },
    { key: 'currency', label: 'Cur', render: (o) => <span className="currency-tag">{o.currency}</span> },
    { key: 'originalAmount', label: 'Original', align: 'right', render: (o) => <span className="money">{fmtMoney(o.originalAmount, o.currency, { code: o.currency !== s.currency })}</span> },
    { key: 'outstanding', label: 'Outstanding', align: 'right', render: (o) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(o.direction === 'Debit' ? o.outstanding : -o.outstanding, o.currency, { code: o.currency !== s.currency })}</span> },
    { key: 'baseOutstanding', label: `Base (${s.currency})`, align: 'right', render: (o) => <span className="money">{fmtMoney(o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding, s.currency)}</span>, total: (r) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(r.reduce((x, o) => x + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (o) => <Badge status={o.status} /> },
  ];
  return (
    <ReportFrame id={partyType === 'Customer' ? 'customer-outstanding' : 'supplier-outstanding'} title={`${partyType} outstanding`} rangeLabel={`${rows.length} items`} filterState={f}
      exportColumns={[{ key: 'docNumber', label: 'Document' }, { key: 'partyName', label: partyType }, { key: 'date', label: 'Date' }, { key: 'dueDate', label: 'Due' }, { key: 'currency', label: 'Currency' }, { key: 'originalAmount', label: 'Original' }, { key: 'outstanding', label: 'Outstanding' }, { key: 'baseOutstanding', label: 'Base' }, { key: 'status', label: 'Status' }]} exportRows={() => rows as any}
      filters={<><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /><div><label className="field-label">Show</label><select className="field-input sm" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="open">Open only</option><option value="all">All incl. settled</option></select></div></>}>
      <div className="grid-3">
        <KpiTile label="Outstanding (base)" amount={rows.reduce((x, o) => x + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0)} currency={s.currency} />
        <KpiTile label="Overdue" amount={rows.filter((o) => o.direction === 'Debit' && o.dueDate < t).reduce((x, o) => x + o.baseOutstanding, 0)} currency={s.currency} deltaTone="bad" />
        <KpiTile label="Parties" value={new Set(rows.map((o) => o.partyId)).size} />
      </div>
      <DataTable rows={rows} columns={cols} dense showTotals onRowClick={(o) => nav.go(o.docType === 'Sales Invoice' ? `sales/invoices/${o.docId}` : o.docType === 'Vendor Invoice' ? `purchase/vendor-invoices/${o.docId}` : o.docType === 'Expense Claim' ? `budgets/expenses/${o.docId}` : `accounting/journals`)} emptyTitle="No open items" />
    </ReportFrame>
  );
}

/** Collections (receipts) or due schedule (payables falling due) for a range. */
export function CollectionsReport({ partyType }: { partyType: 'Customer' | 'Supplier' }) {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'MTD', period: s.state.periodCode ?? '', from: '', to: '', branchId: '' });
  const range = useRange(f);
  const receipts = useCollection<DocHeader>(partyType === 'Customer' ? C.receipts : C.payments);
  const items = useCollection<OpenItem>(C.openItems);
  const collected = useMemo(() => receipts.filter((r) => (!r.companyId || r.companyId === s.state.companyId) && r.status !== 'Draft' && r.status !== 'Cancelled' && r.date >= range.from && r.date <= range.to && (!f.branchId || r.branchId === f.branchId)), [receipts, range, f.branchId, s.state.companyId]);
  const due = useMemo(() => items.filter((o) => o.partyType === partyType && o.status !== 'Settled' && o.status !== 'Written Off' && o.direction === 'Debit').sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [items, partyType]);
  const weeks = [0, 7, 14, 30, 60].map((d, i, arr) => ({ label: i === 0 ? 'Overdue' : `Next ${d} days`, from: i === 0 ? '0000-00-00' : addDays(today(), arr[i - 1]), to: i === 0 ? today() : addDays(today(), d) }));
  const schedule = weeks.map((w) => ({ ...w, amount: due.filter((o) => o.dueDate >= w.from && o.dueDate <= w.to).reduce((x, o) => x + o.baseOutstanding, 0), count: due.filter((o) => o.dueDate >= w.from && o.dueDate <= w.to).length }));
  const cols: Column<DocHeader>[] = [
    { key: 'number', label: partyType === 'Customer' ? 'Receipt' : 'Payment', render: (r) => <span className="identifier link">{r.number}</span> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'partyName', label: partyType, render: (r) => r.partyName ?? r.partySnapshot?.name ?? '—' },
    { key: 'reference', label: 'Mode / reference', render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{(r as any).mode ?? (r as any).method ?? ''} {r.reference ?? ''}</span> },
    { key: 'total', label: 'Amount', align: 'right', render: (r) => <span className="money">{fmtMoney(r.totals?.total ?? (r as any).amount ?? 0, r.currency, { code: r.currency !== s.currency })}</span>, total: (rows) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rows.reduce((x, r) => x + (r.totals?.baseTotal || r.totals?.total || (r as any).amount || 0), 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={String(r.status)} /> },
  ];
  return (
    <ReportFrame id={partyType === 'Customer' ? 'collections' : 'due-schedule'} title={partyType === 'Customer' ? 'Collections & receipts' : 'Payables due schedule'} rangeLabel={rangeLabel(range)} filterState={f}
      exportColumns={[{ key: 'number', label: 'Number' }, { key: 'date', label: 'Date' }, { key: 'partyName', label: partyType }, { key: 'status', label: 'Status' }]} exportRows={() => collected.map((r) => ({ number: r.number, date: r.date, partyName: r.partyName, status: r.status }))}
      filters={<><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /></>}>
      <div className="grid-4">
        {schedule.slice(0, 4).map((w) => <KpiTile key={w.label} label={w.label} amount={w.amount} currency={s.currency} sub={`${w.count} item${w.count === 1 ? '' : 's'}`} deltaTone={w.label === 'Overdue' && w.amount > 0 ? 'bad' : 'neutral'} onClick={() => nav.go(`reports/${partyType === 'Customer' ? 'customer-outstanding' : 'supplier-outstanding'}`)} />)}
      </div>
      <div className="section-title">{partyType === 'Customer' ? 'Receipts recorded in range' : 'Payments recorded in range'}</div>
      <DataTable rows={collected} columns={cols} dense showTotals onRowClick={(r) => nav.go(partyType === 'Customer' ? `sales/receipts/${r.id}` : `purchase/payments/${r.id}`)} emptyTitle={`No ${partyType === 'Customer' ? 'receipts' : 'payments'} in ${rangeLabel(range)}`} emptyDescription="Recorded receipts and payments appear here once posted by Sales / Purchase." />
    </ReportFrame>
  );
}
