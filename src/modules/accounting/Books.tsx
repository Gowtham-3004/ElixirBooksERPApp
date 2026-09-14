// Day book (FR-RPT-002), account ledger (FR-ACC-020/023) and trial balance (FR-ACC-022).
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRoute, useSession } from '../../store';
import type { Account, Branch, Journal, Period } from '../../store';
import { Badge, Button, DateField, EntityPicker, KpiTile, Money, PageHeader, ScopeLine, SelectField, Segmented, useAccountOptions } from '../../components/ui';
import { downloadText, fmtDate, fmtMoney, fmtPeriod, toCSV, today } from '../../lib/format';
import { accountLedger, isLedger, journalLink, periodsOf, sourceLink, trialBalance } from './lib';

function usePeriodRange() {
  const s = useSession();
  const periods = periodsOf(s.state.companyId);
  const cur = s.period ?? periods.find((p) => p.status === 'Open') ?? periods[periods.length - 1];
  const fyPeriods = periods.filter((p) => p.fy === cur?.fy);
  const [mode, setMode] = useState<'MTD' | 'FYTD' | 'Custom'>('MTD');
  const [periodCode, setPeriodCode] = useState(cur?.code ?? '');
  const [from, setFrom] = useState(fyPeriods[0]?.start ?? today());
  const [to, setTo] = useState(today());
  const p = periods.find((x) => x.code === periodCode) ?? cur;
  const range = mode === 'MTD' ? { from: p?.start ?? from, to: p?.end ?? to } : mode === 'FYTD' ? { from: fyPeriods[0]?.start ?? from, to: p?.end ?? to } : { from, to };
  const label = mode === 'MTD' ? fmtPeriod(p?.code) : mode === 'FYTD' ? `FY ${cur?.fy} to ${fmtPeriod(p?.code)}` : `${fmtDate(from)} → ${fmtDate(to)}`;
  const control = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <Segmented value={mode} onChange={setMode} options={[{ value: 'MTD', label: 'Period' }, { value: 'FYTD', label: 'FY to date' }, { value: 'Custom', label: 'Custom' }]} />
      {mode !== 'Custom' && <SelectField value={periodCode} onChange={setPeriodCode} options={periods.map((x) => ({ value: x.code, label: `${x.label} · ${x.status}` }))} size="sm" style={{ width: 200 }} />}
      {mode === 'Custom' && <><DateField value={from} onChange={setFrom} size="sm" /><DateField value={to} onChange={setTo} size="sm" /></>}
    </div>
  );
  return { range, label, control, period: p as Period | undefined };
}

// ── Day book ───────────────────────────────────────────────────────────────

export function DayBook() {
  const s = useSession();
  const journals = useCollection<Journal>(C.journals);
  const branches = useCollection<Branch>(C.branches);
  const pr = usePeriodRange();
  const [type, setType] = useState('');
  const [source, setSource] = useState('');
  const rows = useMemo(() => journals.filter((j) => j.companyId === s.state.companyId && isLedger(j) && j.date >= pr.range.from && j.date <= pr.range.to && (!type || j.type === type) && (!source || j.sourceType === source)).sort((a, b) => a.date.localeCompare(b.date) || (a.postedAt ?? '').localeCompare(b.postedAt ?? '')), [journals, s.state.companyId, pr.range.from, pr.range.to, type, source]);
  let runDr = 0, runCr = 0;
  const withRun = rows.map((j) => { runDr += j.totalDr; runCr += j.totalCr; return { j, runDr, runCr }; });
  const sources = Array.from(new Set(journals.map((j) => j.sourceType))).sort();
  const byDate = new Map<string, number>();
  withRun.forEach((r) => byDate.set(r.j.date, (byDate.get(r.j.date) ?? 0) + r.j.totalDr));
  const exportCsv = () => downloadText(`day-book-${pr.range.from}-${pr.range.to}.csv`, toCSV(rows.map((j) => ({ date: j.date, number: j.number, type: j.type, source: `${j.sourceType} ${j.sourceNumber ?? ''}`, narration: j.narration, dr: j.totalDr, cr: j.totalCr, status: j.status }))));
  return (
    <div className="page">
      <PageHeader title="Day book" subtitle={<ScopeLine extra={`${rows.length} journals · ${pr.label}`} />} actions={<><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Button variant="primary" onClick={() => nav.go('accounting/journals/new')} disabled={!s.can('accounting.journal.create')}>+ New journal</Button></>} />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {pr.control}
        <SelectField value={type} onChange={setType} options={['Manual', 'Auto', 'Recurring', 'Opening', 'Reversal', 'Revaluation']} allowEmpty placeholder="All types" size="sm" style={{ width: 150 }} />
        <SelectField value={source} onChange={setSource} options={sources} allowEmpty placeholder="All sources" size="sm" style={{ width: 200 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <KpiTile label="Journals" value={rows.length} sub={`${byDate.size} posting days`} />
        <KpiTile label="Debit turnover" value={<Money value={runDr} currency={s.currency} />} />
        <KpiTile label="Credit turnover" value={<Money value={runCr} currency={s.currency} />} sub={Math.abs(runDr - runCr) < 0.01 ? '✓ Dr = Cr' : '⚠ Unbalanced'} deltaTone={Math.abs(runDr - runCr) < 0.01 ? 'good' : 'bad'} />
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense">
          <thead><tr><th>Date</th><th>Journal</th><th>Type</th><th>Source</th><th>Narration</th><th>Branch</th><th className="right">Debit</th><th className="right">Credit</th><th className="right">Running Dr</th><th className="right">Running Cr</th></tr></thead>
          <tbody>
            {withRun.map(({ j, runDr: rd, runCr: rc }, i) => {
              const firstOfDay = i === 0 || withRun[i - 1].j.date !== j.date;
              const src = sourceLink(j);
              return (
                <tr key={j.id} className="clickable" onClick={() => nav.go(journalLink(j.id))} style={firstOfDay ? { boxShadow: 'inset 0 1px 0 var(--line-strong)' } : undefined}>
                  <td style={{ whiteSpace: 'nowrap', fontWeight: firstOfDay ? 600 : 400 }}>{firstOfDay ? fmtDate(j.date) : ''}</td>
                  <td><span className="identifier link">{j.number}</span>{j.status === 'Reversed' && <Badge status="Reversed" style={{ marginLeft: 6 }} />}</td>
                  <td><span className="pill pill-neutral">{j.type}</span></td>
                  <td>{src ? <span className="link" onClick={(e) => { e.stopPropagation(); nav.go(src); }}>{j.sourceType} {j.sourceNumber ?? ''}</span> : `${j.sourceType}${j.sourceNumber ? ' ' + j.sourceNumber : ''}`}</td>
                  <td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.narration}>{j.narration}</td>
                  <td>{branches.find((b) => b.id === j.branchId)?.name ?? '—'}</td>
                  <td className="right money">{fmtMoney(j.totalDr, s.currency)}</td>
                  <td className="right money">{fmtMoney(j.totalCr, s.currency)}</td>
                  <td className="right money" style={{ color: 'var(--ink-3)' }}>{fmtMoney(rd, s.currency)}</td>
                  <td className="right money" style={{ color: 'var(--ink-3)' }}>{fmtMoney(rc, s.currency)}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 32 }}>No posted journals in {pr.label}</td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr><td colSpan={6}>Totals for {rows.length} journals · {pr.label}</td><td className="right money">{fmtMoney(runDr, s.currency)}</td><td className="right money">{fmtMoney(runCr, s.currency)}</td><td colSpan={2} /></tr></tfoot>}
        </table>
      </div>
    </div>
  );
}

// ── Account ledger ─────────────────────────────────────────────────────────

export function LedgerPage() {
  const s = useSession();
  const route = useRoute();
  const journals = useCollection<Journal>(C.journals);
  const accounts = useAccountOptions();
  const allAccounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId).map((a) => ({ id: a.id, primary: `${a.code} · ${a.name}`, secondary: a.type + (a.isControl ? ' · Control' : ''), keywords: a.code, raw: a }));
  const pr = usePeriodRange();
  const [accountId, setAccountId] = useState<string | undefined>(route.params.account || accounts.find((a) => a.raw?.code === '1310')?.id || accounts[0]?.id);
  const [branchId, setBranchId] = useState('');
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId);
  const acc = db.find<Account>(C.accounts, accountId);
  const ledger = useMemo(() => (accountId ? accountLedger(accountId, { from: pr.range.from, to: pr.range.to, branchId: branchId || undefined }) : null), [accountId, pr.range.from, pr.range.to, branchId, journals]);
  const side = acc?.normalBalance ?? 'Dr';
  const balLabel = (v: number) => `${fmtMoney(Math.abs(v), s.currency)} ${v === 0 ? '' : v > 0 ? side : side === 'Dr' ? 'Cr' : 'Dr'}`;
  const exportCsv = () => ledger && downloadText(`ledger-${acc?.code}-${pr.range.from}-${pr.range.to}.csv`, toCSV([{ date: pr.range.from, journal: 'Opening balance', dr: '', cr: '', balance: ledger.opening }, ...ledger.entries.map((e) => ({ date: e.journal.date, journal: e.journal.number, narration: e.line.narration ?? e.journal.narration, source: `${e.journal.sourceType} ${e.journal.sourceNumber ?? ''}`, party: e.line.partyName ?? '', dr: e.dr, cr: e.cr, balance: e.balance }))]));
  return (
    <div className="page">
      <PageHeader title="Account ledger" subtitle={<ScopeLine extra={acc ? `${acc.code} · ${acc.name} · ${pr.label}` : pr.label} />} actions={<><Button variant="secondary" onClick={exportCsv} disabled={!ledger}>Export CSV</Button><Button variant="secondary" onClick={() => nav.go('accounting/trial-balance')}>Trial balance</Button></>} />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <EntityPicker value={accountId} onChange={setAccountId} options={allAccounts} placeholder="Account…" style={{ width: 360 }} recentKey="ledger-account" />
        {pr.control}
        <SelectField value={branchId} onChange={setBranchId} options={branches.map((b) => ({ value: b.id, label: b.name }))} allowEmpty placeholder="All branches" size="sm" style={{ width: 180 }} />
      </div>
      {acc && ledger && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <KpiTile label="Opening" value={balLabel(ledger.opening)} sub={fmtDate(pr.range.from)} />
            <KpiTile label="Debits" value={<Money value={ledger.dr} currency={s.currency} />} sub={`${ledger.entries.filter((e) => e.dr).length} entries`} />
            <KpiTile label="Credits" value={<Money value={ledger.cr} currency={s.currency} />} sub={`${ledger.entries.filter((e) => e.cr).length} entries`} />
            <KpiTile label="Closing" value={balLabel(ledger.closing)} sub={fmtDate(pr.range.to)} meta={acc.isControl ? <span>Control · {acc.controlType} — <span className="link" onClick={() => nav.go(acc.controlType === 'AR' ? 'accounting/customer-ledger' : acc.controlType === 'AP' ? 'accounting/supplier-ledger' : 'accounting/ledger')}>sub-ledger</span></span> : undefined} />
          </div>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th>Date</th><th>Journal</th><th>Description</th><th>Party</th><th>Source</th><th className="right">Dr</th><th className="right">Cr</th><th className="right">Balance</th></tr></thead>
              <tbody>
                <tr style={{ background: 'var(--surface-2)', fontWeight: 600 }}><td>{fmtDate(pr.range.from)}</td><td colSpan={4}>Opening balance</td><td className="right">—</td><td className="right">—</td><td className="right money">{balLabel(ledger.opening)}</td></tr>
                {ledger.entries.map((e) => {
                  const src = sourceLink(e.journal);
                  return (
                    <tr key={e.line.id} className={`clickable ${e.journal.status === 'Reversed' ? 'muted' : ''}`} onClick={() => nav.go(journalLink(e.journal.id))}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.journal.date)}</td>
                      <td><span className="identifier link">{e.journal.number}</span></td>
                      <td style={{ maxWidth: 340, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.line.narration ?? e.journal.narration}>{e.line.narration ?? e.journal.narration}</td>
                      <td>{e.line.partyName ?? '—'}</td>
                      <td>{src ? <span className="link identifier" onClick={(ev) => { ev.stopPropagation(); nav.go(src); }}>{e.journal.sourceNumber ?? e.journal.sourceType}</span> : <span style={{ color: 'var(--ink-3)' }}>{e.journal.sourceNumber ?? e.journal.sourceType}</span>}</td>
                      <td className="right money">{e.dr ? fmtMoney(e.dr, s.currency) : '—'}</td>
                      <td className="right money" style={{ color: e.cr ? 'var(--danger)' : undefined }}>{e.cr ? fmtMoney(e.cr, s.currency) : '—'}</td>
                      <td className="right money" style={{ fontWeight: 600 }}>{balLabel(e.balance)}</td>
                    </tr>
                  );
                })}
                {!ledger.entries.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>No entries in {pr.label}</td></tr>}
              </tbody>
              <tfoot><tr><td colSpan={5}>Closing balance · {pr.label}</td><td className="right money">{fmtMoney(ledger.dr, s.currency)}</td><td className="right money">{fmtMoney(ledger.cr, s.currency)}</td><td className="right money">{balLabel(ledger.closing)}</td></tr></tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Trial balance ──────────────────────────────────────────────────────────

export function TrialBalancePage() {
  const s = useSession();
  const journals = useCollection<Journal>(C.journals);
  const accounts = useCollection<Account>(C.accounts);
  const pr = usePeriodRange();
  const [q, setQ] = useState('');
  const [zero, setZero] = useState(false);
  const tb = useMemo(() => trialBalance({ from: pr.range.from, to: pr.range.to, includeZero: zero }), [pr.range.from, pr.range.to, journals, accounts, zero]);
  const filtered = tb.rows.filter((r) => !q || `${r.account.code} ${r.account.name}`.toLowerCase().includes(q.toLowerCase()));
  const drafts = journals.filter((j) => j.companyId === s.state.companyId && (j.status === 'Draft' || j.status === 'Submitted' || j.status === 'Approved') && j.date >= pr.range.from && j.date <= pr.range.to);
  const groups: { key: string; label: string; rows: typeof filtered }[] = [];
  filtered.forEach((r) => { const key = r.group?.id ?? 'none'; let g = groups.find((x) => x.key === key); if (!g) { g = { key, label: r.group?.name ?? 'Ungrouped', rows: [] }; groups.push(g); } g.rows.push(r); });
  const exportCsv = () => downloadText(`trial-balance-${pr.range.from}-${pr.range.to}.csv`, toCSV(filtered.map((r) => ({ code: r.account.code, account: r.account.name, group: r.group?.name, opening: r.opening, dr: r.dr, cr: r.cr, debit: r.drCol, credit: r.crCol }))));
  return (
    <div className="page">
      <PageHeader title="Trial balance" subtitle={<ScopeLine extra={`${tb.rows.length} accounts · ${pr.label}`} />} actions={<><Button variant="secondary" onClick={exportCsv}>Export CSV</Button><Button variant="secondary" onClick={() => nav.go('reports')}>Financial statements</Button></>} />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {pr.control}
        <div className="search-input" style={{ width: 240 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts…" /></div>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" className="checkbox" checked={zero} onChange={(e) => setZero(e.target.checked)} /> Show zero balances</label>
      </div>
      <div className={`banner ${tb.balanced ? 'success' : 'danger'}`}>
        {tb.balanced ? `✓ Trial balance reconciles — Dr ${fmtMoney(tb.totalDr, s.currency)} = Cr ${fmtMoney(tb.totalCr, s.currency)} (FR-ACC-022)` : `⚠ Trial balance does not balance — Dr ${fmtMoney(tb.totalDr, s.currency)} ≠ Cr ${fmtMoney(tb.totalCr, s.currency)} (difference ${fmtMoney(tb.totalDr - tb.totalCr, s.currency)})`}
        {drafts.length > 0 && <span style={{ marginLeft: 8 }}>· {drafts.length} unposted journal{drafts.length === 1 ? '' : 's'} in this range are excluded: {drafts.slice(0, 5).map((d) => <span key={d.id} className="link identifier" style={{ marginLeft: 4 }} onClick={() => nav.go(journalLink(d.id))}>{d.number}</span>)}{drafts.length > 5 ? ` +${drafts.length - 5}` : ''}</span>}
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 80 }}>Code</th><th>Account</th><th className="right">Opening</th><th className="right">Period Dr</th><th className="right">Period Cr</th><th className="right">Debit</th><th className="right">Credit</th></tr></thead>
          <tbody>
            {groups.map((g) => {
              const gd = g.rows.reduce((x, r) => x + r.drCol, 0), gc = g.rows.reduce((x, r) => x + r.crCol, 0);
              return [
                <tr key={g.key} style={{ background: 'var(--surface-2)' }}><td colSpan={7} style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>{g.label}</td></tr>,
                ...g.rows.map((r) => (
                  <tr key={r.account.id} className="clickable" onClick={() => nav.go(`accounting/ledger?account=${r.account.id}`)}>
                    <td className="identifier" style={{ color: 'var(--ink-3)' }}>{r.account.code}</td>
                    <td><span className="link">{r.account.name}</span>{r.account.isControl && <span className="pill pill-neutral" style={{ marginLeft: 6 }}>{r.account.controlType}</span>}</td>
                    <td className="right money" style={{ color: 'var(--ink-3)' }}>{r.opening ? `${fmtMoney(Math.abs(r.opening), s.currency)} ${r.opening > 0 ? r.account.normalBalance : r.account.normalBalance === 'Dr' ? 'Cr' : 'Dr'}` : '—'}</td>
                    <td className="right money" style={{ color: 'var(--ink-3)' }}>{r.dr ? fmtMoney(r.dr, s.currency) : '—'}</td>
                    <td className="right money" style={{ color: 'var(--ink-3)' }}>{r.cr ? fmtMoney(r.cr, s.currency) : '—'}</td>
                    <td className="right money">{r.drCol ? fmtMoney(r.drCol, s.currency) : <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                    <td className="right money">{r.crCol ? fmtMoney(r.crCol, s.currency) : <span style={{ color: 'var(--ink-5)' }}>—</span>}</td>
                  </tr>
                )),
                <tr key={g.key + '_sub'} style={{ fontWeight: 600 }}><td /><td style={{ fontSize: 12, color: 'var(--ink-3)' }}>Subtotal · {g.label}</td><td colSpan={3} /><td className="right money">{fmtMoney(gd, s.currency)}</td><td className="right money">{fmtMoney(gc, s.currency)}</td></tr>,
              ];
            })}
          </tbody>
          <tfoot><tr><td colSpan={5}><span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)' }}>Total · {pr.label}</span></td><td className="right money" style={{ fontSize: 14 }}>{fmtMoney(tb.totalDr, s.currency)}</td><td className="right money" style={{ fontSize: 14 }}>{fmtMoney(tb.totalCr, s.currency)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}

