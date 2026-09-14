// Platform Administration (FR-PLT-001..005): usage dashboard, plans, tenants, platform-only audit.
import type { ModuleProps } from '../registry';
import { C, nav, useCollection, useSession } from '../../store';
import type { Tenant, Plan, AuditEvent } from '../../store';
import { fmtMoney } from '../../lib/format';
import { ModuleShell, PageHeader, KpiTile, Card, Badge, Timeline, EmptyState, Button, Identifier } from '../../components/ui';
import { PLATFORM_NAV } from '../subnav';
import Plans from './Plans';
import Tenants from './Tenants';

const STATES = ['Trial', 'Active', 'Grace', 'Suspended', 'Expired', 'Cancelled'] as const;

function Usage() {
  const tenants = useCollection<Tenant>(C.tenants);
  const plans = useCollection<Plan>(C.plans);
  const planOf = (t: Tenant) => plans.find((p) => p.id === t.planId);
  const mrr = tenants.filter((t) => t.subscriptionState === 'Active' || t.subscriptionState === 'Grace').reduce((a, t) => a + (planOf(t)?.priceMonthly ?? 0), 0);
  const byState = STATES.map((st) => ({ st, n: tenants.filter((t) => t.subscriptionState === st).length }));
  const byPlan = plans.filter((p) => p.status === 'Active').map((p) => ({ p, n: tenants.filter((t) => t.planId === p.id).length, mrr: tenants.filter((t) => t.planId === p.id && (t.subscriptionState === 'Active' || t.subscriptionState === 'Grace')).length * p.priceMonthly }));
  const updated = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const meta = `Platform · all tenants · INR · Updated ${updated}`;
  const max = Math.max(1, ...byState.map((b) => b.n));
  return (
    <div className="page">
      <PageHeader title="Platform usage" subtitle={meta} />
      <div className="grid-4">
        <KpiTile label="Tenants" value={tenants.length} sub={`${byState.find((b) => b.st === 'Active')?.n ?? 0} active`} meta={meta} onClick={() => nav.go('platform/tenants')} />
        <KpiTile label="MRR" value={fmtMoney(mrr, 'INR')} sub="Active + grace tenants" meta={meta} />
        <KpiTile label="On trial" value={byState.find((b) => b.st === 'Trial')?.n ?? 0} sub={`${tenants.filter((t) => t.subscriptionState === 'Trial' && t.trialEndsAt && t.trialEndsAt < new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).length} ending within 7 days`} meta={meta} onClick={() => nav.go('platform/tenants')} />
        <KpiTile label="At risk" value={(byState.find((b) => b.st === 'Grace')?.n ?? 0) + (byState.find((b) => b.st === 'Suspended')?.n ?? 0)} sub="Grace + suspended" deltaTone="bad" meta={meta} onClick={() => nav.go('platform/tenants')} />
      </div>
      <div className="grid-2">
        <Card title="Tenants by state">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {byState.map((b) => <div key={b.st} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 30px', gap: 10, alignItems: 'center', fontSize: 13 }}><Badge status={b.st} /><div style={{ height: 8, background: 'var(--surface-3)', borderRadius: 9999 }}><div style={{ height: '100%', width: `${(b.n / max) * 100}%`, background: 'var(--ink)', borderRadius: 9999 }} /></div><span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{b.n}</span></div>)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 10 }}>{meta}</div>
        </Card>
        <Card title="MRR by plan">
          <table className="data-table dense"><thead><tr><th>Plan</th><th className="right">Tenants</th><th className="right">MRR</th></tr></thead><tbody>{byPlan.map((b) => <tr key={b.p.id}><td>{b.p.name} <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>v{b.p.planVersion}</span></td><td className="right">{b.n}</td><td className="right money">{fmtMoney(b.mrr, b.p.currency)}</td></tr>)}</tbody></table>
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 10 }}>{meta}</div>
        </Card>
      </div>
    </div>
  );
}

function PlatformAudit() {
  const events = useCollection<AuditEvent>(C.audit).filter((e) => e.tenantId === 'tnt_platform' || e.objectType === 'Plan' || (e.objectType === 'Tenant' && /^tenant\./.test(e.action))).sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="page">
      <PageHeader title="Platform audit" subtitle={`${events.length} platform-only events · plan and tenant changes never include tenant business data (E2E-04)`} />
      <Card>
        {events.length === 0 ? <EmptyState compact icon="🛡️" title="No platform events yet" /> : <Timeline items={events.map((e) => ({ type: /suspend|cancel|retire/.test(e.action) ? 'warning' as const : 'info' as const, event: e.action, predicate: `${e.objectType} ${e.objectNumber ?? ''} · by ${e.actor}`, time: e.at, note: e.detail, meta: <Identifier>{e.correlationId}</Identifier> }))} />}
      </Card>
    </div>
  );
}

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  if (!s.isPlatformAdmin) return <div className="page"><EmptyState icon="🔒" title="Platform administration is restricted" description="Only platform users can open this area (FR-PLT-001)." action={<Button variant="primary" onClick={() => nav.go('home')}>Go home</Button>} /></div>;
  return (
    <ModuleShell module="platform" title="Platform administration" items={PLATFORM_NAV} defaultSub="usage">
      {(sub) => {
        if (sub === 'plans') return <Plans />;
        if (sub === 'tenants') return <Tenants initialId={route.id || undefined} />;
        if (sub === 'audit') return <PlatformAudit />;
        return <Usage />;
      }}
    </ModuleShell>
  );
}

