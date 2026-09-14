// Services overview: KPIs, unbilled ageing, upcoming milestones, timesheets awaiting approval.
import { useMemo } from 'react';
import { C, engine, nav, useCollection, useSession } from '../../store';
import type { DocHeader } from '../../store';
import { KpiTile, PageHeader, ScopeLine, Card, DataTable, Badge, Money, Button, EmptyState } from '../../components/ui';
import type { Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPct, fmtPeriod, addDays, today, daysBetween } from '../../lib/format';
import type { Contract, Milestone, Timesheet } from './types';
import { ACC } from './types';
import { companyRows, periodBounds, unbilledWork, utilisation, currentPeriod } from './data';
import { ContractLink, ProjectLink, Muted } from './shared';

export default function Overview() {
  const s = useSession();
  const contracts = useCollection<Contract>(C.contracts);
  const timesheets = useCollection<Timesheet>(C.timesheets);
  const milestones = useCollection<Milestone>(C.milestones);
  const invoices = useCollection<DocHeader>(C.salesInvoices);
  const period = currentPeriod();
  const { from, to } = periodBounds(period);
  const data = useMemo(() => {
    const active = companyRows<Contract>(C.contracts).filter((c) => c.status === 'Active');
    const uw = unbilledWork();
    const billed = companyRows<DocHeader>(C.salesInvoices).filter((i) => i.sourceType === 'Contract' && (i.status === 'Posted' || i.status === 'Settled') && i.date >= from && i.date <= to).reduce((sum, i) => sum + (i.totals?.taxable ?? 0) * (i.rate || 1), 0);
    const drafts = companyRows<DocHeader>(C.salesInvoices).filter((i) => i.sourceType === 'Contract' && i.status === 'Draft');
    const deferred = engine.accountBalance(ACC.deferred).net;
    const unbilledGl = engine.accountBalance(ACC.unbilled).net;
    const util = utilisation(addDays(today(), -27), today());
    // ageing of unbilled by age of the hour entry
    const buckets = { '0–7 d': 0, '8–14 d': 0, '15–30 d': 0, '> 30 d': 0 } as Record<string, number>;
    uw.entries.forEach((e) => {
      const age = daysBetween(e.date, today());
      const key = age <= 7 ? '0–7 d' : age <= 14 ? '8–14 d' : age <= 30 ? '15–30 d' : '> 30 d';
      buckets[key] += e.hours;
    });
    const upcoming = companyRows<Milestone>(C.milestones).filter((m) => m.status !== 'Invoiced').sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
    const awaiting = companyRows<Timesheet>(C.timesheets).filter((t) => t.status === 'Submitted').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''));
    const byMethod = active.reduce<Record<string, number>>((acc, c) => { acc[c.billingMethod] = (acc[c.billingMethod] ?? 0) + 1; return acc; }, {});
    return { active, uw, billed, drafts, deferred, unbilledGl, util, buckets, upcoming, awaiting, byMethod };
  }, [contracts, timesheets, milestones, invoices, s.state.companyId, from, to]);

  const msCols: Column<Milestone>[] = [
    { key: 'name', label: 'Milestone', render: (m) => <div><div className="cell-primary">{m.name}</div><Muted><ContractLink id={m.contractId} /> · <ProjectLink id={m.projectId} /></Muted></div> },
    { key: 'due', label: 'Due', render: (m) => <span style={{ color: m.status === 'Pending' && m.due < today() ? 'var(--danger)' : undefined }}>{fmtDate(m.due)}{m.status === 'Pending' && m.due < today() ? ` · ${daysBetween(m.due, today())} d late` : ''}</span> },
    { key: 'status', label: 'Status', render: (m) => <Badge status={m.status === 'Achieved' ? 'Ready' : m.status}>{m.status === 'Achieved' ? 'Ready to bill' : m.status}</Badge> },
    { key: 'amount', label: 'Amount', align: 'right', render: (m) => <Money value={m.amount} currency={(companyRows<Contract>(C.contracts).find((c) => c.id === m.contractId)?.currency) ?? s.currency} code /> },
  ];
  const tsCols: Column<Timesheet>[] = [
    { key: 'number', label: 'Timesheet', render: (t) => <div><span className="identifier link" onClick={() => nav.go(`projects/timesheets/${t.id}`)}>{t.number}</span><div><Muted>{t.employeeName} · week of {fmtDate(t.weekStart)}</Muted></div></div> },
    { key: 'hours', label: 'Hours', align: 'right', render: (t) => <span className="money">{t.totalHours} h</span> },
    { key: 'billable', label: 'Billable', align: 'right', render: (t) => <span className="money">{t.billableHours} h</span> },
    { key: 'waiting', label: 'Waiting', render: (t) => <Muted>{t.submittedAt ? `${daysBetween(t.submittedAt.slice(0, 10), today())} d` : '—'}</Muted> },
  ];

  return (
    <div className="page">
      <PageHeader title="Services overview" subtitle={<ScopeLine extra={`${data.active.length} active contracts`} />} actions={<><Button variant="secondary" onClick={() => nav.go('projects/timesheets/new')}>Log time</Button><Button variant="primary" onClick={() => nav.go('projects/billing')}>Run billing</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12 }}>
        <KpiTile label="Active contracts" value={data.active.length} sub={Object.entries(data.byMethod).map(([k, v]) => `${v} ${k}`).join(' · ') || 'None yet'} meta={`${s.company?.tradeName} · all branches`} onClick={() => nav.go('projects/contracts?tab=active')} />
        <KpiTile label="Unbilled hours" value={`${data.uw.hours} h`} sub={<>{fmtMoney(data.uw.value, s.currency)} at bill rates</>} meta="Approved, billable, not yet invoiced" onClick={() => nav.go('projects/timesheets?tab=unbilled')} />
        <KpiTile label={`Billed ${fmtPeriod(period)}`} amount={data.billed} currency={s.currency} sub={data.drafts.length ? `${data.drafts.length} draft invoice(s) awaiting posting` : 'All generated invoices posted'} deltaTone="neutral" meta="Posted contract invoices · excl. tax" onClick={() => nav.go('sales/invoices')} />
        <KpiTile label="Deferred revenue" amount={data.deferred} currency={s.currency} sub={<>Unbilled (accrued) {fmtMoney(data.unbilledGl, s.currency)}</>} meta={`GL 2400 / 1160 balances · ${fmtDate(today())}`} onClick={() => nav.go('projects/revenue')} />
        <KpiTile label="Utilisation (4 wk)" value={fmtPct(data.util.pct)} sub={`${data.util.logged} / ${data.util.capacity} h · ${fmtPct(data.util.billablePct)} billable`} deltaTone={data.util.pct >= 70 ? 'good' : 'bad'} meta="Logged vs resource capacity" onClick={() => nav.go('projects/resources?tab=capacity')} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card title="Unbilled ageing" actions={<Button variant="link" onClick={() => nav.go('projects/billing')}>Bill now →</Button>}>
          {data.uw.hours === 0 && data.uw.expenses.length === 0 ? <EmptyState compact icon="✓" title="Nothing unbilled" description="Every approved billable hour has been invoiced." /> : (
            <table className="data-table dense">
              <thead><tr><th>Age</th><th className="right">Hours</th><th className="right">Share</th></tr></thead>
              <tbody>
                {Object.entries(data.buckets).map(([k, v]) => (
                  <tr key={k}><td>{k}</td><td className="right money">{v.toFixed(1)} h</td><td className="right"><div className="meter" style={{ width: 120, display: 'inline-block' }}><div style={{ width: `${data.uw.hours ? (v / data.uw.hours) * 100 : 0}%` }} /></div></td></tr>
                ))}
                <tr><td style={{ fontWeight: 600 }}>Total</td><td className="right money" style={{ fontWeight: 600 }}>{data.uw.hours} h</td><td className="right"><Muted>{fmtMoney(data.uw.value, s.currency)}{data.uw.expenses.length ? ` incl. ${data.uw.expenses.length} expense(s)` : ''}</Muted></td></tr>
              </tbody>
            </table>
          )}
        </Card>
        <Card title="Timesheets awaiting approval" actions={<Button variant="link" onClick={() => nav.go('projects/timesheets?tab=submitted')}>All →</Button>}>
          <DataTable rows={data.awaiting.slice(0, 6)} columns={tsCols} dense onRowClick={(t) => nav.go(`projects/timesheets/${t.id}`)} emptyTitle="Inbox zero" emptyDescription="No submitted timesheets are waiting." />
        </Card>
      </div>
      <Card title="Upcoming & ready-to-bill milestones" actions={<Button variant="link" onClick={() => nav.go('projects/milestones')}>Milestone board →</Button>}>
        <DataTable rows={data.upcoming} columns={msCols} dense onRowClick={(m) => nav.go(`projects/milestones?contract=${m.contractId}`)} emptyTitle="No open milestones" />
      </Card>
      <Muted>Period {fmtPeriod(period)} ({fmtDate(from)} – {fmtDate(to)}) · figures in {s.currency} · computed live from timesheets, invoices and the general ledger</Muted>
    </div>
  );
}
