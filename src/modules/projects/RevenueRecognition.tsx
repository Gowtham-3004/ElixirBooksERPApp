// Revenue recognition page (FR-SRV-006): per contract × period billed / recognised /
// unbilled (accrued) / deferred, "Run recognition for period" posting journals with an
// idempotency key, schedule table, waterfall summary and reversal.
import { useMemo, useState } from 'react';
import { C, engine, nav, useCollection, useSession } from '../../store';
import type { Journal } from '../../store';
import { PageHeader, ScopeLine, Card, Button, Badge, Money, DataTable, ConfirmDialog, SelectField, useToast, EmptyState, KpiTile, Tabs, Banner, Pill, CheckboxField } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtMoney, fmtPeriod } from '../../lib/format';
import type { Contract, RevenueSchedule } from './types';
import { ACC } from './types';
import { useRows, companyRows, currentPeriod, periodBounds, contractOf } from './data';
import { PeriodSelect, ContractLink, MethodPill, Muted } from './shared';
import { schedulePreview, recognizedFor, runRecognitionForPeriod, reverseRecognition, nextPeriodToRun, billedFor } from './revenue';

export default function RevenueRecognition({ contractId, period: periodParam }: { contractId?: string; period?: string }) {
  const s = useSession();
  const toast = useToast();
  const contracts = useRows<Contract>(C.contracts).filter((c) => c.status === 'Active' || c.status === 'Completed');
  const schedules = useRows<RevenueSchedule>(C.revenueSchedules, (a, b) => (b.period + b.contractNumber).localeCompare(a.period + a.contractNumber));
  useCollection<Journal>(C.journals); useCollection(C.timesheets); useCollection(C.milestones);
  const [period, setPeriod] = useState(periodParam ?? currentPeriod());
  const [filter, setFilter] = useState(contractId ?? '');
  const [tab, setTab] = useState<'run' | 'schedule'>('run');
  const [confirm, setConfirm] = useState(false);
  const [reverse, setReverse] = useState<RevenueSchedule | null>(null);
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const can = s.can('projects.revenue.run') || s.can('projects.*') || s.can('accounting.journal.create');
  const bounds = periodBounds(period);
  const eligible = useMemo(() => contracts.filter((c) => c.start.slice(0, 7) <= period && (!filter || c.id === filter)), [contracts, period, filter]);
  const sel = selected ?? new Set(eligible.map((c) => c.id));
  const rows = useMemo(() => eligible.map((c) => {
    const posted = schedules.find((r) => r.contractId === c.id && r.period === period && r.status === 'Posted');
    const pos = schedulePreview(c, period).find((p) => p.period === period);
    const next = nextPeriodToRun(c);
    return { contract: c, posted, pos, next, blocked: !posted && next !== period ? `Run ${fmtPeriod(next)} first` : undefined };
  }), [eligible, period, schedules]);
  const toRun = rows.filter((r) => !r.posted && !r.blocked && sel.has(r.contract.id));
  const deferredBal = engine.accountBalance(ACC.deferred).net;
  const unbilledBal = engine.accountBalance(ACC.unbilled).net;
  const periodRecognised = rows.reduce((a, r) => a + (r.posted?.recognized ?? r.pos?.recognized ?? 0), 0);
  const periodBilled = rows.reduce((a, r) => a + (r.posted?.billed ?? r.pos?.billed ?? 0), 0);

  const cols: Column<(typeof rows)[number]>[] = [
    { key: 'contract', label: 'Contract', render: (r) => <div><ContractLink id={r.contract.id} /><div className="cell-secondary">{r.contract.title} · {r.contract.partyName}</div></div> },
    { key: 'method', label: 'Method', render: (r) => <div><MethodPill method={r.contract.billingMethod} /><div><Muted>{r.contract.revenueMethod === 'Auto' ? 'auto' : r.contract.revenueMethod}</Muted></div></div> },
    { key: 'billed', label: 'Billed', align: 'right', render: (r) => <Money value={r.posted?.billed ?? r.pos?.billed ?? 0} currency={s.currency} />, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(periodBilled, s.currency)}</span> },
    { key: 'recognized', label: 'Recognised', align: 'right', render: (r) => <Money value={r.posted?.recognized ?? r.pos?.recognized ?? 0} currency={s.currency} />, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(periodRecognised, s.currency)}</span> },
    { key: 'basis', label: 'Basis', render: (r) => <Muted>{r.pos?.basis ?? '—'}</Muted> },
    { key: 'adjustment', label: 'Cumulative position', align: 'right', render: (r) => { const p = r.posted ?? r.pos; if (!p) return <Muted>—</Muted>; return p.adjustmentType === 'Accrual' ? <span className="money" style={{ color: 'var(--warn)' }}>Accrue {fmtMoney(p.adjustment, s.currency)}</span> : p.adjustmentType === 'Deferral' ? <span className="money" style={{ color: 'var(--info)' }}>Defer {fmtMoney(p.adjustment, s.currency)}</span> : <Muted>Balanced</Muted>; } },
    { key: 'status', label: 'Status', render: (r) => r.posted ? <div><Badge status="Posted" />{r.posted.journalNumber && <div><span className="identifier link" onClick={() => nav.go(`accounting/journals/${r.posted!.journalId}`)}>{r.posted.journalNumber}</span></div>}</div> : r.blocked ? <Pill tone="warning">{r.blocked}</Pill> : <Badge status="Pending">Not run</Badge> },
  ];

  const run = () => {
    const { rows: done, errors } = runRecognitionForPeriod(period, toRun.map((r) => r.contract.id));
    if (done.length) toast.success(`${done.length} contract(s) recognised for ${fmtPeriod(period)} · ${done.filter((d) => d.journalId).length} journal(s) posted`);
    errors.slice(0, 3).forEach((e) => toast.error(`${e.contract.number}: ${e.message}`));
  };

  const schedCols: Column<RevenueSchedule>[] = [
    { key: 'period', label: 'Period', sortable: true, render: (r) => fmtPeriod(r.period) },
    { key: 'contractNumber', label: 'Contract', render: (r) => <div><ContractLink id={r.contractId} number={r.contractNumber} /><div className="cell-secondary">{contractOf(r.contractId)?.partyName}</div></div> },
    { key: 'billed', label: 'Billed', align: 'right', render: (r) => <Money value={r.billed} currency={s.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + x.billed, 0), s.currency)}</span> },
    { key: 'recognized', label: 'Recognised', align: 'right', render: (r) => <Money value={r.recognized} currency={s.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + x.recognized, 0), s.currency)}</span> },
    { key: 'unbilled', label: 'Accrued', align: 'right', render: (r) => r.unbilled ? <Money value={r.unbilled} currency={s.currency} /> : <Muted>—</Muted> },
    { key: 'deferred', label: 'Deferred', align: 'right', render: (r) => r.deferred ? <Money value={r.deferred} currency={s.currency} /> : <Muted>—</Muted> },
    { key: 'reversed', label: 'Prior reversed', align: 'right', render: (r) => r.reversed ? <Money value={r.reversed} currency={s.currency} /> : <Muted>—</Muted> },
    { key: 'journal', label: 'Journals', render: (r) => <div style={{ display: 'flex', flexDirection: 'column' }}>{r.journalNumber && <span className="identifier link" onClick={() => nav.go(`accounting/journals/${r.journalId}`)}>{r.journalNumber}</span>}{r.reversalJournalNumber && <span className="identifier link" style={{ fontSize: 11 }} onClick={() => nav.go(`accounting/journals/${r.reversalJournalId}`)}>{r.reversalJournalNumber} (rev)</span>}{!r.journalNumber && !r.reversalJournalNumber && <Muted>No adjustment</Muted>}</div> },
    { key: 'status', label: 'Status', render: (r) => <div><Badge status={r.status} /><div><Muted>{r.runBy} · {fmtDate(r.runAt)}</Muted></div></div> },
  ];
  const schedActions = (r: RevenueSchedule): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open contract', onClick: () => nav.go(`projects/contracts/${r.contractId}?tab=revenue`) }];
    if (r.journalId) a.push({ label: 'Open journal', onClick: () => nav.go(`accounting/journals/${r.journalId}`) });
    if (r.status === 'Posted') a.push({ label: 'Reverse run', danger: true, separator: true, onClick: () => setReverse(r), disabled: !can, reason: can ? undefined : 'Requires accounting.journal.create' });
    return a;
  };
  const visibleSched = filter ? schedules.filter((r) => r.contractId === filter) : schedules;
  const waterfall = useMemo(() => {
    const list = filter ? [contracts.find((c) => c.id === filter)!].filter(Boolean) : contracts;
    const periods = Array.from(new Set(schedules.map((r) => r.period).concat(period))).sort();
    return periods.map((p) => {
      const posted = schedules.filter((r) => r.period === p && r.status === 'Posted' && (!filter || r.contractId === filter));
      const rec = posted.length ? posted.reduce((a, r) => a + r.recognized, 0) : list.reduce((a, c) => a + (c.start.slice(0, 7) <= p ? recognizedFor(c, p).amount : 0), 0);
      const bill = posted.length ? posted.reduce((a, r) => a + r.billed, 0) : list.reduce((a, c) => a + billedFor(c, p), 0);
      return { period: p, rec, bill, posted: posted.length > 0 };
    });
  }, [schedules, contracts, filter, period]);
  const maxBar = Math.max(1, ...waterfall.map((w) => Math.max(w.rec, w.bill)));

  return (
    <div className="page">
      <PageHeader title="Revenue recognition" subtitle={<ScopeLine extra={`billed vs recognised · accrual 1160 / deferral 2400`} />} actions={<Button variant="secondary" onClick={() => nav.go('accounting/journals')}>Journals</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <KpiTile label={`Recognised ${fmtPeriod(period)}`} value={fmtMoney(periodRecognised, s.currency)} sub={`${rows.filter((r) => r.posted).length} of ${rows.length} contracts run`} />
        <KpiTile label={`Billed ${fmtPeriod(period)}`} value={fmtMoney(periodBilled, s.currency)} sub="posted contract invoices, excl. tax" onClick={() => nav.go('sales/invoices')} />
        <KpiTile label="Unbilled (accrued)" value={fmtMoney(unbilledBal, s.currency)} sub="GL 1160 balance" />
        <KpiTile label="Deferred revenue" value={fmtMoney(deferredBal, s.currency)} sub="GL 2400 balance" />
      </div>
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, alignItems: 'end' }}>
          <PeriodSelect label="Period" value={period} onChange={(v) => { setPeriod(v); setSelected(null); }} size="sm" />
          <SelectField label="Contract" value={filter} onChange={(v) => { setFilter(v); setSelected(null); }} options={contracts.map((c) => ({ value: c.id, label: `${c.number} · ${c.title}` }))} placeholder="All active contracts" size="sm" />
          <CheckboxField checked={toRun.length === rows.filter((r) => !r.posted && !r.blocked).length && toRun.length > 0} onChange={(v) => setSelected(v ? new Set(eligible.map((c) => c.id)) : new Set())} label="Select all eligible" help={`${toRun.length} contract(s) will run`} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => setConfirm(true)} disabled={!toRun.length || !can} reason={!can ? 'Requires accounting.journal.create' : !toRun.length ? 'Nothing to run for this period' : undefined} data-testid="run-recognition">Run recognition for {fmtPeriod(period)}</Button>
          </div>
        </div>
        <Muted>Period {fmtDate(bounds.from)} – {fmtDate(bounds.to)} · each run posts at most one adjustment per contract (idempotency key rev:&lt;contract&gt;:&lt;period&gt;) and auto-reverses the prior period's adjustment on the 1st.</Muted>
      </Card>
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'run', label: 'This period', count: rows.length }, { id: 'schedule', label: 'Schedule', count: visibleSched.length }]} />
      {tab === 'run' ? (
        <>
          {rows.some((r) => r.blocked) && <Banner tone="warning">Some contracts have an earlier unrun period — recognition runs strictly in order.</Banner>}
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table">
              <thead><tr><th style={{ width: 40 }} />{cols.map((c) => <th key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.label}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.contract.id} className={r.posted ? 'muted' : ''}>
                    <td><input type="checkbox" className="checkbox" checked={sel.has(r.contract.id)} disabled={!!r.posted || !!r.blocked} onChange={() => { const n = new Set(sel); if (n.has(r.contract.id)) n.delete(r.contract.id); else n.add(r.contract.id); setSelected(n); }} /></td>
                    {cols.map((c) => <td key={c.key} className={c.align === 'right' ? 'right' : ''}>{c.render!(r, 0)}</td>)}
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8}><EmptyState compact title="No contracts for this period" description="Only active or completed contracts that started on or before the period are recognised." /></td></tr>}
              </tbody>
              <tfoot><tr><td /><td colSpan={2}>Totals for {rows.length} contract(s)</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(periodBilled, s.currency)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(periodRecognised, s.currency)}</td><td colSpan={3} /></tr></tfoot>
            </table>
          </div>
          <Card title="Billed vs recognised by period">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 160, padding: '8px 0', overflowX: 'auto' }}>
              {waterfall.map((w) => (
                <div key={w.period} style={{ minWidth: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 110 }}>
                    <div title={`Billed ${fmtMoney(w.bill, s.currency)}`} style={{ width: 18, height: `${Math.max(2, (w.bill / maxBar) * 110)}px`, background: 'var(--accent)', borderRadius: '3px 3px 0 0' }} />
                    <div title={`Recognised ${fmtMoney(w.rec, s.currency)}`} style={{ width: 18, height: `${Math.max(2, (w.rec / maxBar) * 110)}px`, background: 'var(--good)', borderRadius: '3px 3px 0 0' }} />
                  </div>
                  <div style={{ fontSize: 11, color: w.period === period ? 'var(--ink)' : 'var(--ink-4)', fontWeight: w.period === period ? 600 : 400 }}>{fmtPeriod(w.period).replace(' 20', ' ')}</div>
                  {!w.posted && <Muted>proj.</Muted>}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--ink-3)' }}><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }} />Billed</span><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--good)', borderRadius: 2, marginRight: 4 }} />Recognised</span><span>Recognised &gt; billed → accrual (Dr 1160 · Cr 4010); billed &gt; recognised → deferral (Dr 4010 · Cr 2400).</span></div>
          </Card>
        </>
      ) : (
        <DataTable rows={visibleSched} columns={schedCols} rowActions={schedActions} dense emptyTitle="No recognition posted yet" emptyDescription="Run recognition for a period to build the schedule." />
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Run revenue recognition for ${fmtPeriod(period)}?`}
        statement={`${toRun.length} contract(s) will be recognised. Recognised ${fmtMoney(toRun.reduce((a, r) => a + (r.pos?.recognized ?? 0), 0), s.currency)} against billed ${fmtMoney(toRun.reduce((a, r) => a + (r.pos?.billed ?? 0), 0), s.currency)}.`}
        consequences={[
          { engine: 'Journal', text: `Accruals post Dr 1160 Unbilled revenue · Cr 4010 Service revenue; deferrals post Dr 4010 · Cr 2400 Deferred revenue`, tone: 'warning' },
          { engine: 'Journal', text: `The prior period's adjustment is auto-reversed on ${fmtDate(bounds.from)}` },
          { engine: 'Numbering', text: 'One journal per contract per period · idempotent re-runs do nothing' },
        ]}
        confirmLabel={`Run ${toRun.length} contract(s)`}
        cancelLabel="Not now"
        onConfirm={run}
      />
      <ConfirmDialog open={!!reverse} onClose={() => setReverse(null)} title={`Reverse ${reverse?.contractNumber} · ${reverse ? fmtPeriod(reverse.period) : ''}?`} statement="The adjustment journal is reversed and the prior period's adjustment is reinstated. Only the latest period of a contract can be reversed." reasonRequired danger confirmLabel="Reverse run" cancelLabel="Keep schedule" onConfirm={(r) => { if (!reverse) return; try { reverseRecognition(reverse.id, r); toast.success('Recognition reversed'); } catch (e: any) { toast.error(e.message); } }} />
    </div>
  );
}
