// Project / customer profitability (FR-SRV-007): revenue (recognised), resource cost,
// purchases with the project dimension, employee expenses, allocated overhead, margin —
// with drill-down to the source documents and CSV export.
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import { PageHeader, ScopeLine, Card, Button, DataTable, Money, SelectField, DateField, Segmented, Drawer, KpiTile, Meter, EmptyState, Pill, useToast } from '../../components/ui';
import type { Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtPct, toCSV, downloadText, today } from '../../lib/format';
import type { Project } from './types';
import { useRows, useSettings, currentPeriod, periodBounds, projectOf } from './data';
import { Muted } from './shared';
import { profitability, type ProfitRow } from './revenue';

export default function Profitability({ projectId }: { projectId?: string }) {
  const s = useSession();
  const toast = useToast();
  const settings = useSettings();
  const projects = useRows<Project>(C.projects);
  useCollection(C.timesheets); useCollection(C.salesInvoices); useCollection(C.vendorInvoices); useCollection(C.expenseClaims); useCollection(C.revenueSchedules);
  const fyStart = `${s.state.fy?.slice(0, 4) ?? '2026'}-04-01`;
  const [from, setFrom] = useState(fyStart);
  const [to, setTo] = useState(periodBounds(currentPeriod()).to);
  const [group, setGroup] = useState<'project' | 'customer'>('project');
  const [drill, setDrill] = useState<ProfitRow | null>(null);
  const rows = useMemo(() => profitability(from, to, group), [from, to, group, projects, s.state.companyId]);
  const focus = projectId ? rows.find((r) => r.projectId === projectId) : undefined;
  const totals = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, cost: a.cost + r.cost, margin: a.margin + r.margin, resourceCost: a.resourceCost + r.resourceCost, purchases: a.purchases + r.purchases, expenses: a.expenses + r.expenses, overhead: a.overhead + r.overhead, hours: a.hours + r.hours }), { revenue: 0, cost: 0, margin: 0, resourceCost: 0, purchases: 0, expenses: 0, overhead: 0, hours: 0 });
  const cols: Column<ProfitRow>[] = [
    { key: 'label', label: group === 'project' ? 'Project' : 'Customer', sortable: true, render: (r) => <div><div className="cell-primary">{r.label}</div>{r.sub && group === 'project' && <Muted>{r.sub}</Muted>}</div> },
    { key: 'hours', label: 'Hours', align: 'right', sortable: true, render: (r) => <span className="money">{r.hours} h</span>, total: () => <span className="money" style={{ fontWeight: 600 }}>{totals.hours.toFixed(1)} h</span> },
    { key: 'revenue', label: 'Revenue (recognised)', align: 'right', sortable: true, render: (r) => <Money value={r.revenue} currency={s.currency} />, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(totals.revenue, s.currency)}</span> },
    { key: 'resourceCost', label: 'Resource cost', align: 'right', render: (r) => <Money value={r.resourceCost} currency={s.currency} />, total: () => <span className="money">{fmtMoney(totals.resourceCost, s.currency)}</span> },
    { key: 'purchases', label: 'Purchases', align: 'right', render: (r) => r.purchases ? <Money value={r.purchases} currency={s.currency} /> : <Muted>—</Muted>, total: () => <span className="money">{fmtMoney(totals.purchases, s.currency)}</span> },
    { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => r.expenses ? <Money value={r.expenses} currency={s.currency} /> : <Muted>—</Muted>, total: () => <span className="money">{fmtMoney(totals.expenses, s.currency)}</span> },
    { key: 'overhead', label: `Overhead ${settings.prjOverheadPct}%`, align: 'right', render: (r) => <Money value={r.overhead} currency={s.currency} />, total: () => <span className="money">{fmtMoney(totals.overhead, s.currency)}</span> },
    { key: 'cost', label: 'Total cost', align: 'right', render: (r) => <Money value={r.cost} currency={s.currency} />, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(totals.cost, s.currency)}</span> },
    { key: 'margin', label: 'Margin', align: 'right', sortable: true, render: (r) => <div><Money value={r.margin} currency={s.currency} tone="auto" /><div><Muted>{fmtPct(r.marginPct)}</Muted></div></div>, total: () => <span className="money" style={{ fontWeight: 600, color: totals.margin >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(totals.margin, s.currency)}</span> },
    { key: 'meter', label: 'Margin %', render: (r) => <div style={{ minWidth: 110 }}><Meter value={Math.max(0, r.marginPct)} max={100} tone={r.marginPct >= 30 ? 'good' : r.marginPct >= 10 ? 'warn' : 'danger'} /></div> },
  ];
  const exportCsv = () => {
    downloadText(`project-profitability-${today()}.csv`, toCSV(rows.map((r) => ({ [group]: r.label, customer: r.sub ?? '', hours: r.hours, revenue: r.revenue, resourceCost: r.resourceCost, purchases: r.purchases, expenses: r.expenses, overhead: r.overhead, totalCost: r.cost, margin: r.margin, marginPct: r.marginPct }))));
    toast.success('Exported profitability CSV');
  };
  return (
    <div className="page">
      <PageHeader title="Profitability" subtitle={<ScopeLine extra={`${fmtDate(from)} – ${fmtDate(to)} · overhead ${settings.prjOverheadPct}% of resource cost`} />} actions={<><Button variant="secondary" onClick={() => nav.go('projects/settings')}>Overhead settings</Button><Button variant="secondary" onClick={exportCsv}>Export CSV</Button></>} />
      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14, alignItems: 'end' }}>
          <DateField label="From" value={from} onChange={setFrom} size="sm" />
          <DateField label="To" value={to} onChange={setTo} size="sm" />
          <div><label className="field-label">Group by</label><Segmented value={group} onChange={setGroup} options={[{ value: 'project', label: 'Project' }, { value: 'customer', label: 'Customer' }]} /></div>
          <SelectField label="Jump to project" value={projectId ?? ''} onChange={(v) => nav.go('projects/profitability', v ? { project: v } : undefined)} options={projects.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))} placeholder="All projects" size="sm" />
        </div>
      </Card>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
        <KpiTile label="Revenue (recognised)" value={fmtMoney(totals.revenue, s.currency)} sub={`${rows.length} ${group}(s)`} />
        <KpiTile label="Total cost" value={fmtMoney(totals.cost, s.currency)} sub={`${totals.hours.toFixed(0)} h delivered`} />
        <KpiTile label="Margin" value={fmtMoney(totals.margin, s.currency)} delta={fmtPct(totals.revenue ? (totals.margin / totals.revenue) * 100 : 0)} deltaTone={totals.margin >= 0 ? 'good' : 'bad'} sub="revenue − cost − overhead" />
        <KpiTile label="Cost mix" value={fmtPct(totals.cost ? (totals.resourceCost / totals.cost) * 100 : 0)} sub="resource share of cost" meta={`Purchases ${fmtMoney(totals.purchases, s.currency)} · expenses ${fmtMoney(totals.expenses, s.currency)}`} />
      </div>
      {focus && (
        <Card title={`Focus · ${focus.label}`} actions={<Button size="sm" variant="secondary" onClick={() => nav.go(`projects/projects/${focus.projectId}`)}>Open project</Button>}>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            {[['Revenue', focus.revenue], ['Billed', focus.billed], ['Resource cost', focus.resourceCost], ['Purchases', focus.purchases], ['Expenses', focus.expenses], ['Overhead', focus.overhead], ['Margin', focus.margin]].map(([k, v]) => (
              <div key={String(k)}><div className="section-label">{k}</div><div className="money" style={{ fontSize: 15, fontWeight: 600, color: k === 'Margin' ? ((v as number) >= 0 ? 'var(--good)' : 'var(--danger)') : undefined }}>{fmtMoney(v as number, s.currency)}</div></div>
            ))}
          </div>
        </Card>
      )}
      {rows.length === 0 ? <EmptyState title="No activity in this window" description="Approve timesheets, post invoices or run revenue recognition to see profitability." action={<Button variant="primary" onClick={() => nav.go('projects/timesheets')}>Open timesheets</Button>} /> : (
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.key} dense onRowClick={(r) => setDrill(r)} showTotals />
      )}
      <Muted>Revenue is the recognised amount per period (posted schedule where it exists, otherwise the computed amount). Resource cost = approved hours × cost rate. Purchases are vendor-invoice lines carrying the project dimension; employee expenses are approved claim lines on the project. Overhead is {settings.prjOverheadPct}% of resource cost (Settings).</Muted>
      <Drawer open={!!drill} onClose={() => setDrill(null)} title={drill?.label ?? ''} subtitle={`${fmtDate(from)} – ${fmtDate(to)} · margin ${drill ? fmtMoney(drill.margin, s.currency) : ''} (${drill ? fmtPct(drill.marginPct) : ''})`} width={720}
        footer={<><Button variant="ghost" onClick={() => setDrill(null)}>Close</Button>{drill?.projectId && <Button variant="primary" onClick={() => nav.go(`projects/projects/${drill.projectId}?tab=profit`)}>Open project</Button>}</>}>
        {drill && (
          <>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
              {[['Revenue', drill.revenue], ['Cost', drill.cost], ['Margin', drill.margin]].map(([k, v]) => <div key={String(k)}><div className="section-label">{k}</div><div className="money" style={{ fontSize: 16, fontWeight: 600 }}>{fmtMoney(v as number, s.currency)}</div></div>)}
            </div>
            <table className="data-table dense">
              <thead><tr><th>Type</th><th>Source</th><th className="right">Amount</th></tr></thead>
              <tbody>
                {drill.sources.map((x, i) => (
                  <tr key={i} className={x.link ? 'clickable' : ''} onClick={() => x.link && nav.go(x.link)}>
                    <td><Pill tone={x.type === 'Revenue' || x.type === 'Invoice' ? 'good' : x.type === 'Overhead' ? 'neutral' : 'warning'}>{x.type}</Pill></td>
                    <td>{x.label}</td>
                    <td className="right money">{fmtMoney(x.amount, s.currency)}</td>
                  </tr>
                ))}
                {!drill.sources.length && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 16 }}>No source documents in this window</td></tr>}
              </tbody>
            </table>
          </>
        )}
      </Drawer>
    </div>
  );
}
