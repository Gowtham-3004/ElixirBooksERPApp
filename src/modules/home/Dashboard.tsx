// Role dashboard (FR-ORG-008, FR-RPT-005/006, design §6.8). Every widget is computed from the store
// and carries a meta row: scope · period · currency · updated.
import { useMemo } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Account, ApprovalRequest, Journal, OpenItem, Period, Company } from '../../store';
import { fmtMoney, fmtMoneyCompact, fmtDate, fmtPct, daysBetween, today, addDays } from '../../lib/format';
import { Badge, Button, KpiTile, Pill, Identifier, Money, Checklist, EmptyState, BarChart, IllustratedCard } from '../../components/ui';
import { readinessFor } from '../auth/provision';
import { TrendingUpIcon, TrendingDownIcon, RefreshIcon, PlusIcon } from '../../components/Icons';

const RECENT_SOURCES: { col: string; label: string; path: (r: any) => string }[] = [
  { col: C.salesInvoices, label: 'Invoice', path: (r) => `sales/invoices/${r.id}` },
  { col: C.receipts, label: 'Receipt', path: (r) => `sales/receipts/${r.id}` },
  { col: C.purchaseOrders, label: 'Purchase Order', path: (r) => `purchase/orders/${r.id}` },
  { col: C.grns, label: 'GRN', path: (r) => `purchase/grn/${r.id}` },
];

function prevPeriodCode(code: string): string {
  const [y, m] = code.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(code: string) {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(code.slice(5, 7)) - 1];
}

export default function Dashboard() {
  const s = useSession();
  const cid = s.state.companyId;
  const cur = s.currency;
  const periodCode = s.period?.code ?? s.state.periodCode ?? today().slice(0, 7);
  const invoices = useCollection<any>(C.salesInvoices);
  const journals = useCollection<Journal>(C.journals);
  const openItems = useCollection<OpenItem>(C.openItems);
  const accounts = useCollection<Account>(C.accounts);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const periods = useCollection<Period>(C.periods);
  useCollection(C.receipts); useCollection(C.purchaseOrders); useCollection(C.grns);
  const company = s.company;
  const updated = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const meta = (extra?: string) => `${company?.tradeName ?? company?.legalName} · ${s.branch?.name ?? 'All branches'} · ${s.period?.label ?? periodCode} · ${cur}${extra ? ' · ' + extra : ''} · Updated ${updated}`;

  const kpis = useMemo(() => {
    const posted = invoices.filter((i) => i.companyId === cid && i.status === 'Posted');
    const inPeriod = (code: string) => posted.filter((i) => String(i.date).slice(0, 7) === code);
    const sum = (rows: any[]) => rows.reduce((a, i) => a + (i.totals?.baseTotal ?? i.totals?.total ?? 0), 0);
    const revenue = sum(inPeriod(periodCode));
    const prev = sum(inPeriod(prevPeriodCode(periodCode)));
    const delta = prev > 0 ? ((revenue - prev) / prev) * 100 : undefined;
    const t = today();
    const ar = openItems.filter((o) => o.companyId === cid && o.partyType === 'Customer' && o.status !== 'Settled' && o.status !== 'Written Off');
    const arOut = ar.reduce((a, o) => a + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0);
    const arOverdue = ar.filter((o) => o.direction === 'Debit' && o.dueDate < t);
    const ap = openItems.filter((o) => o.companyId === cid && o.partyType === 'Supplier' && o.status !== 'Settled' && o.status !== 'Written Off');
    const apOut = ap.reduce((a, o) => a + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0);
    const apDue7 = ap.filter((o) => o.direction === 'Debit' && o.dueDate <= addDays(t, 7));
    const cashAccounts = accounts.filter((a) => a.companyId === cid && a.status === 'Active' && (a.controlType === 'Bank' || a.controlType === 'Cash'));
    const cash = cashAccounts.reduce((a, acc) => a + engine.accountBalance(acc.id, { companyId: cid }).net, 0);
    return { revenue, delta, count: inPeriod(periodCode).length, arOut, arCount: ar.length, arOverdue: arOverdue.length, arOverdueAmt: arOverdue.reduce((a, o) => a + o.baseOutstanding, 0), apOut, apCount: ap.length, apDue7: apDue7.length, cash, cashAccounts: cashAccounts.length };
  }, [invoices, openItems, accounts, cid, periodCode]);

  // 7 month-end snapshots behind each KPI: revenue per month, AR/AP outstanding at month-end, cash book balance
  const trends = useMemo(() => {
    const months: string[] = [];
    let code = periodCode;
    for (let i = 0; i < 7; i++) { months.unshift(code); code = prevPeriodCode(code); }
    const endOf = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`; };
    const posted = invoices.filter((i) => i.companyId === cid && i.status === 'Posted');
    const outstandingAt = (partyType: 'Customer' | 'Supplier', end: string) => openItems
      .filter((o) => o.companyId === cid && o.partyType === partyType && o.status !== 'Written Off' && o.date <= end)
      .reduce((a, o) => {
        const settled = (o.settlements ?? []).filter((st) => st.date <= end).reduce((x, st) => x + (st.baseAmount ?? st.amount), 0);
        const open = Math.max(0, o.baseAmount - settled);
        return a + (o.direction === 'Debit' ? open : -open);
      }, 0);
    const cashAccounts = accounts.filter((a) => a.companyId === cid && a.status === 'Active' && (a.controlType === 'Bank' || a.controlType === 'Cash'));
    return {
      revenue: months.map((m) => posted.filter((i) => String(i.date).slice(0, 7) === m).reduce((a, i) => a + (i.totals?.baseTotal ?? i.totals?.total ?? 0), 0)),
      ar: months.map((m) => outstandingAt('Customer', endOf(m))),
      ap: months.map((m) => outstandingAt('Supplier', endOf(m))),
      cash: months.map((m) => cashAccounts.reduce((a, acc) => a + engine.accountBalance(acc.id, { companyId: cid, to: endOf(m) }).net, 0)),
    };
  }, [invoices, openItems, accounts, cid, periodCode]);

  const chart = useMemo(() => {
    const months: string[] = [];
    let code = periodCode;
    for (let i = 0; i < 7; i++) { months.unshift(code); code = prevPeriodCode(code); }
    const accById = new Map(accounts.map((a) => [a.id, a]));
    const rows = months.map((m) => {
      let revenue = 0, expenses = 0;
      journals.filter((j) => j.companyId === cid && j.status === 'Posted' && j.period === m).forEach((j) => j.lines.forEach((l) => {
        const acc = accById.get(l.accountId);
        if (!acc) return;
        if (acc.type === 'Income') revenue += l.crBase - l.drBase;
        if (acc.type === 'Expense') expenses += l.drBase - l.crBase;
      }));
      return { code: m, revenue: Math.max(0, revenue), expenses: Math.max(0, expenses) };
    });
    const max = Math.max(1, ...rows.flatMap((r) => [r.revenue, r.expenses]));
    return { rows, max };
  }, [journals, accounts, cid, periodCode]);

  const topCustomers = useMemo(() => {
    const m = new Map<string, { name: string; gstin?: string; amt: number; id: string }>();
    invoices.filter((i) => i.companyId === cid && i.status === 'Posted' && String(i.fy ?? '') === String(s.state.fy ?? i.fy)).forEach((i) => {
      const k = i.partyId ?? i.partyName;
      const e = m.get(k) ?? { name: i.partyName ?? '—', gstin: i.partySnapshot?.gstin, amt: 0, id: i.partyId };
      e.amt += i.totals?.baseTotal ?? i.totals?.total ?? 0;
      m.set(k, e);
    });
    const list = Array.from(m.values()).sort((a, b) => b.amt - a.amt).slice(0, 5);
    return { list, max: list[0]?.amt ?? 1 };
  }, [invoices, cid, s.state.fy]);

  const recent = useMemo(() => {
    const out: { id: string; number: string; type: string; party: string; amount: number; currency: string; status: string; date: string; path: string }[] = [];
    RECENT_SOURCES.forEach((src) => db.get<any>(src.col).filter((r) => r.companyId === cid).forEach((r) => out.push({ id: r.id, number: r.number, type: src.label, party: r.partyName ?? r.partySnapshot?.name ?? '—', amount: r.totals?.total ?? r.amount ?? 0, currency: r.currency ?? cur, status: r.status, date: r.postedAt ?? r.updatedAt ?? r.date, path: src.path(r) })));
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 8);
  }, [cid, invoices, journals, cur]);

  const pending = useMemo(() => approvals.filter((a) => a.status === 'Pending' && a.companyId === cid && engine.canActOnApproval(a).ok).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)), [approvals, cid, s.user?.id]);
  const myPeriods = periods.filter((p) => p.companyId === cid).sort((a, b) => b.code.localeCompare(a.code)).slice(0, 5);
  const isAdmin = s.isTenantOwner || s.can('admin.company.view');
  const readiness = company ? readinessFor(company as Company) : [];
  const showChecklist = isAdmin && company && readiness.some((r) => r.status !== 'Done');
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const ageTone = (submittedAt: string, dueAt?: string): 'critical' | 'warning' | 'neutral' => (dueAt && new Date(dueAt) < new Date() ? 'critical' : daysBetween(submittedAt, today()) >= 2 ? 'warning' : 'neutral');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">{greeting}, {s.user?.name.split(' ')[0]}</h1>
          <div className="page-subtitle">{meta()}</div>
        </div>
        <div className="page-actions">
          {s.can('sales.invoice.create') && <Button variant="primary" icon={<PlusIcon size={14} />} onClick={() => nav.go('sales/invoices/new')}>New invoice</Button>}
          <Button variant="tinted" icon={<RefreshIcon size={13} />} onClick={() => engine.notify({ type: 'system', title: 'Dashboard refreshed', body: `As of ${new Date().toLocaleTimeString('en-IN')}`, read: true })}>Refresh</Button>
        </div>
      </div>

      {showChecklist && (
        <IllustratedCard
          kind="setup"
          animated
          artWidth={220}
          title={`Let's finish setting up ${company?.tradeName || company?.legalName || 'your company'}`}
          description={`${readiness.filter((r) => r.status === 'Done').length} of ${readiness.length} setup items done — pending items stay here until they are complete.`}
          actions={<Button size="sm" variant="secondary" onClick={() => nav.go('admin/company')}>Open administration</Button>}
        >
          <Checklist title="Company setup checklist" rows={readiness.map((r) => ({ id: r.key, label: r.label, status: r.status, detail: r.detail, link: r.link }))} />
        </IllustratedCard>
      )}

      <div className="grid-4">
        <KpiTile label="Revenue" amount={kpis.revenue} currency={cur} trend={trends.revenue} sub={`${kpis.count} posted invoice${kpis.count === 1 ? '' : 's'}`} delta={kpis.delta !== undefined ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{kpis.delta >= 0 ? <TrendingUpIcon size={12} /> : <TrendingDownIcon size={12} />}{kpis.delta >= 0 ? '↑' : '↓'} {fmtPct(Math.abs(kpis.delta))} vs {monthLabel(prevPeriodCode(periodCode))}</span> : 'No prior period'} deltaTone={kpis.delta === undefined ? 'neutral' : kpis.delta >= 0 ? 'good' : 'bad'} onClick={() => nav.go('sales/invoices')} />
        <KpiTile label="AR outstanding" amount={kpis.arOut} currency={cur} trend={trends.ar} sub={`${kpis.arCount} open item${kpis.arCount === 1 ? '' : 's'}`} delta={kpis.arOverdue ? `${kpis.arOverdue} overdue · ${fmtMoneyCompact(kpis.arOverdueAmt, cur)}` : 'Nothing overdue'} deltaTone={kpis.arOverdue ? 'bad' : 'good'} meta="As of today" onClick={() => nav.go('sales/receivables')} />
        <KpiTile label="AP outstanding" amount={kpis.apOut} currency={cur} trend={trends.ap} sub={`${kpis.apCount} open bill${kpis.apCount === 1 ? '' : 's'}`} delta={kpis.apDue7 ? `${kpis.apDue7} due within 7 days` : 'Nothing due this week'} deltaTone={kpis.apDue7 ? 'neutral' : 'good'} meta="As of today" onClick={() => nav.go('purchase/payables')} />
        <KpiTile label="Cash position" amount={kpis.cash} currency={cur} trend={trends.cash} sub={`${kpis.cashAccounts} bank & cash account${kpis.cashAccounts === 1 ? '' : 's'}`} delta={trends.cash.length > 1 ? `${trends.cash[trends.cash.length - 1] - trends.cash[trends.cash.length - 2] >= 0 ? '↑' : '↓'} ${fmtMoneyCompact(Math.abs(trends.cash[trends.cash.length - 1] - trends.cash[trends.cash.length - 2]), cur)} vs ${monthLabel(prevPeriodCode(periodCode))}` : undefined} deltaTone={trends.cash[trends.cash.length - 1] - trends.cash[trends.cash.length - 2] >= 0 ? 'good' : 'bad'} meta="Book balance · posted journals + opening" onClick={() => nav.go('banking')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>Revenue vs Expenses</h3>
              <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>{meta('last 7 months · posted journals')}</p>
            </div>
          </div>
          {chart.rows.every((r) => r.revenue === 0 && r.expenses === 0) ? (
            <EmptyState compact illustration="reports" title={`No data for the last 7 months`} description="Posted journals on income and expense accounts will appear here." />
          ) : (
            <BarChart
              categories={chart.rows.map((r) => monthLabel(r.code))}
              series={[{ label: 'Revenue', values: chart.rows.map((r) => r.revenue), emphasizeLast: true }, { label: 'Expenses', values: chart.rows.map((r) => r.expenses), emphasizeLast: true }]}
              height={190}
              format={(v) => fmtMoneyCompact(v, cur).replace(/\.00\b/, '')}
              onSelect={(i) => nav.go('reports/profit-loss', { period: chart.rows[i].code })}
            />
          )}
        </div>

        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>Top customers</h3>
          <p style={{ fontSize: 12, color: 'var(--ink-4)', marginBottom: 16 }}>By posted revenue · FY {s.state.fy} · {cur} · Updated {updated}</p>
          {topCustomers.list.length === 0 && <EmptyState compact icon="👥" title="No posted invoices yet" />}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {topCustomers.list.map((c, i) => (
              <div key={c.id ?? c.name} style={{ cursor: c.id ? 'pointer' : undefined }} onClick={() => c.id && nav.go(`masters/customers/${c.id}`)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--ink)' }}>{c.name}</div>
                    {c.gstin && <div className="identifier" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{c.gstin}</div>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(c.amt, cur)}</span>
                </div>
                <div style={{ height: 4, background: 'var(--surface-3)', borderRadius: 9999 }}><div style={{ height: '100%', width: `${(c.amt / topCustomers.max) * 100}%`, background: 'var(--accent)', borderRadius: 9999 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Recent documents</h3>
              <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{meta('invoices · receipts · POs · GRNs')}</div>
            </div>
            <Button variant="link" onClick={() => nav.go('sales/invoices')}>View all →</Button>
          </div>
          {recent.length === 0 ? <EmptyState compact icon="📄" title="No documents yet" description="Invoices, receipts, purchase orders and GRNs will appear here as they are created." /> : (
            <table className="data-table">
              <thead><tr><th>Number</th><th>Type</th><th>Party</th><th className="right">Amount</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={`${r.type}-${r.id}`} className="clickable" onClick={() => nav.go(r.path)}>
                    <td><Identifier link>{r.number}</Identifier></td>
                    <td style={{ color: 'var(--ink-3)' }}>{r.type}</td>
                    <td style={{ fontWeight: 500 }}>{r.party}</td>
                    <td className="right"><Money value={r.amount} currency={r.currency} code={r.currency !== cur} /></td>
                    <td><Badge status={r.status} /></td>
                    <td style={{ color: 'var(--ink-3)' }}>{fmtDate(r.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Pending approvals</h3>
              <span className="badge badge-submitted">{pending.length}</span>
            </div>
            {pending.length === 0 && <EmptyState compact illustration="all-done" title="Nothing waiting for you" description="Requests routed to you will appear here." />}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {pending.slice(0, 4).map((a) => {
                const step = a.steps.find((x) => x.order === a.currentStep);
                const tone = ageTone(a.submittedAt, step?.dueAt);
                const days = daysBetween(a.submittedAt, today());
                return (
                  <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }} onClick={() => nav.go('approvals', { id: a.id })}>
                    <div style={{ minWidth: 0 }}>
                      <div className="identifier" style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)' }}>{a.docNumber}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.docType} · {fmtMoneyCompact(a.amount, a.currency)}</div>
                    </div>
                    <Pill tone={tone}>{days < 1 ? '< 1 d' : `${days} d`}</Pill>
                  </div>
                );
              })}
            </div>
            <Button variant="secondary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={() => nav.go('approvals')}>View all approvals</Button>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>{meta()}</div>
          </div>

          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 12 }}>Period status</h3>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {myPeriods.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--hairline)', cursor: 'pointer' }} onClick={() => nav.go('admin/periods', { period: p.code })}>
                  <span style={{ fontSize: 13, color: 'var(--ink)' }}>{p.label}{p.code === periodCode ? <span style={{ fontSize: 11, color: 'var(--ink-4)' }}> · current</span> : null}</span>
                  <Badge status={p.status} />
                </div>
              ))}
              {myPeriods.length === 0 && <div style={{ fontSize: 13, color: 'var(--danger)' }}>No accounting periods — postings will be refused until they exist.</div>}
            </div>
            <Button variant="link" style={{ marginTop: 10 }} onClick={() => nav.go('admin/periods')}>Manage periods →</Button>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>{meta()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
