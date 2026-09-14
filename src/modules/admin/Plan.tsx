// Plan & usage (FR-PLT-003..005, design §7.21): plan card, usage meters, module list with Included / Upgrade,
// upgrade flow (choose plan → confirm → tenant.planId updated, no data copied). Tenant owner only.
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { Plan, Tenant } from '../../store';
import { fmtDate, fmtMoney, addDays, today } from '../../lib/format';
import { PageHeader, Card, Button, Badge, KV, Meter, ConfirmDialog, Banner, useToast, EmptyState, RadioCards } from '../../components/ui';
import { MODULES } from '../registry';
import { switchBlockers, tierRank } from '../../store/plans';

const LIMIT_LABEL: Record<string, string> = { users: 'Users', companies: 'Companies', invoicesPerMonth: 'Invoices / month', storageMb: 'Storage (MB)' };

export default function PlanUsage() {
  const s = useSession();
  const toast = useToast();
  const plans = useCollection<Plan>(C.plans).filter((p) => p.status === 'Active');
  const tenant = s.tenant as Tenant | undefined;
  const plan = s.plan as Plan | undefined;
  const [choose, setChoose] = useState(false);
  const [target, setTarget] = useState<string>('');
  if (!s.isTenantOwner) return <div className="page"><EmptyState icon="🔒" title="Plan & usage is visible to the tenant owner only" description="Unentitled capabilities are shown nowhere else in the product (EP-01)." /></div>;
  if (!tenant || !plan) return null;
  const targetPlan = plans.find((p) => p.id === target);
  const isUpgrade = targetPlan ? tierRank(targetPlan.tier) > tierRank(plan.tier) : false;
  const blockers = targetPlan ? switchBlockers(tenant, targetPlan) : [];
  const entitled = (id: string) => plan.modules.includes('*') || plan.modules.includes(id);
  const stateText: Record<string, string> = {
    Trial: `Trial ends ${fmtDate(tenant.trialEndsAt)} — all Growth capabilities are available until then. Upgrade to keep full access.`,
    Active: `Renews ${fmtDate(tenant.renewsAt)} · billed ${fmtMoney(plan.priceMonthly, plan.currency)} / month.`,
    Grace: `Payment overdue. Grace period ends ${fmtDate(tenant.graceUntil)} — after that modules are suspended (read-only) until payment is received.`,
    Suspended: 'Subscription suspended — all modules are read-only except Home and Company administration. Pay the outstanding invoice or contact support to reinstate.',
    Expired: 'Subscription expired. Data is retained for 90 days; reactivate by choosing a plan.',
    Cancelled: 'Subscription cancelled. Data export remains available for 30 days.',
  };

  const change = () => {
    if (!targetPlan) return;
    if (targetPlan.id === plan.id || blockers.length) return;
    const before = { planId: tenant.planId, state: tenant.subscriptionState };
    db.update<Tenant>(C.tenants, tenant.id, { planId: targetPlan.id, subscriptionState: 'Active', renewsAt: addDays(today(), 30), graceUntil: undefined, trialEndsAt: undefined });
    engine.audit({ action: isUpgrade ? 'plan.upgraded' : 'plan.changed', objectType: 'Tenant', objectId: tenant.id, objectNumber: tenant.name, detail: `${plan.name} v${plan.planVersion} → ${targetPlan.name} v${targetPlan.planVersion} · no data copied (FR-PLT-005)`, before, after: { planId: targetPlan.id, state: 'Active' }, sensitive: true });
    engine.notify({ type: 'system', title: `Plan changed to ${targetPlan.name}`, body: `${targetPlan.modules.includes('*') ? 'All modules' : targetPlan.modules.length + ' modules'} unlocked · renews ${fmtDate(addDays(today(), 30))}`, link: 'admin/plan' });
    toast.success(`You are now on ${targetPlan.name} — entitlements refreshed`);
    setChoose(false); setTarget('');
  };

  const hiddenByTarget = targetPlan ? MODULES.filter((m) => !m.platformOnly && entitled(m.id) && !(targetPlan.modules.includes('*') || targetPlan.modules.includes(m.id))).map((m) => m.label) : [];
  const newCount = targetPlan ? targetPlan.modules.filter((m) => !entitled(m)).length : 0;
  const consequences = targetPlan ? [
    blockers.length
      ? { engine: 'Plan limits', text: `Switch blocked: ${blockers.join('; ')}`, tone: 'danger' as const }
      : isUpgrade
      ? { engine: 'Workflow', text: `${targetPlan.modules.includes('*') ? 'All modules' : newCount + ' new module(s)'} become entitled — nothing is copied or migrated`, tone: 'success' as const }
      : { engine: 'Workflow', text: `${hiddenByTarget.join(', ') || 'No modules'} will be hidden; their data is retained`, tone: 'warning' as const },
    { engine: 'Notification', text: 'Subscription state becomes Active; renewal in 30 days' },
    { engine: 'Workflow', text: 'Audited as a sensitive tenant change' },
  ] : [];

  return (
    <div className="page">
      <PageHeader title="Plan & usage" subtitle={`${tenant.name} · the only place unentitled capabilities are shown`} actions={<Button variant="tinted" onClick={() => { setTarget(plans.find((p) => tierRank(p.tier) === tierRank(plan.tier) + 1)?.id ?? ''); setChoose(true); }}>Upgrade plan</Button>} />
      {(tenant.subscriptionState === 'Grace' || tenant.subscriptionState === 'Suspended' || tenant.subscriptionState === 'Trial') && <Banner tone={tenant.subscriptionState === 'Suspended' ? 'danger' : 'warning'}>{stateText[tenant.subscriptionState]}</Banner>}
      <div className="grid-2">
        <Card title="Plan">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}><span style={{ fontSize: 22, fontWeight: 700 }}>{plan.name}</span><Badge status={tenant.subscriptionState} /><span style={{ fontSize: 12, color: '#6E6E71' }}>v{plan.planVersion}</span></div>
          <KV items={[{ k: 'Tier', v: plan.tier }, { k: 'Price', v: `${fmtMoney(plan.priceMonthly, plan.currency)} / month` }, { k: tenant.subscriptionState === 'Trial' ? 'Trial ends' : 'Renews', v: fmtDate(tenant.subscriptionState === 'Trial' ? tenant.trialEndsAt : tenant.renewsAt) }, { k: 'State', v: stateText[tenant.subscriptionState] }]} />
        </Card>
        <Card title="Usage against limits">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Object.entries(plan.limits).map(([k, max]) => {
              const live = k === 'users' ? db.count(C.users, (u) => u.tenantId === tenant.id) : k === 'companies' ? db.count(C.companies, (c) => c.tenantId === tenant.id) : k === 'invoicesPerMonth' ? db.count(C.salesInvoices, (i) => i.status === 'Posted' && String(i.date).slice(0, 7) === today().slice(0, 7)) || tenant.usage[k] || 0 : tenant.usage[k] ?? 0;
              const pct = max ? (live / max) * 100 : 0;
              return (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}><span>{LIMIT_LABEL[k] ?? k}</span><span style={{ fontFeatureSettings: '"tnum" 1', color: pct >= 100 ? '#C0393F' : pct >= 80 ? '#8A4B0F' : '#5F6368' }}>{live.toLocaleString('en-IN')} / {max.toLocaleString('en-IN')}{pct >= 80 ? ` · ${Math.round(pct)}%` : ''}</span></div>
                  <Meter value={live} max={max} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      <Card title="Modules">
        <table className="data-table dense">
          <thead><tr><th>Module</th><th>Description</th><th>Entitlement</th><th /></tr></thead>
          <tbody>
            {MODULES.filter((m) => !m.platformOnly).map((m) => {
              const ok = entitled(m.id);
              const minPlan = plans.filter((p) => p.modules.includes('*') || p.modules.includes(m.id)).sort((a, b) => tierRank(a.tier) - tierRank(b.tier))[0];
              return (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.label}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{m.description}</td>
                  <td>{ok ? <Badge status="Active">Included</Badge> : <Badge status="Draft">Not in plan</Badge>}</td>
                  <td style={{ textAlign: 'right' }}>{!ok && <Button size="sm" variant="tinted" onClick={() => { setTarget(minPlan?.id ?? ''); setChoose(true); }}>Upgrade{minPlan ? ` to ${minPlan.name}` : ''}</Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div style={{ fontSize: 12, color: '#6E6E71' }}>API and UI enforce the same effective entitlements (FR-PLT-004). Upgrades unlock capabilities in place — no tenant data is copied (FR-PLT-005).</div>

      <ConfirmDialog open={choose} onClose={() => setChoose(false)} title={targetPlan ? `Change plan to ${targetPlan.name}?` : 'Choose a plan'} statement={targetPlan ? `${fmtMoney(targetPlan.priceMonthly, targetPlan.currency)} / month · billed from today · ${blockers.length ? 'this switch is blocked until current usage fits the selected plan' : isUpgrade ? 'capabilities unlock immediately' : 'capabilities above the new plan become unavailable at once'}.` : undefined}
        consequences={consequences} confirmLabel={targetPlan ? (isUpgrade ? `Upgrade to ${targetPlan.name}` : `Switch to ${targetPlan.name}`) : 'Choose plan'} cancelLabel={`Stay on ${plan.name}`} disabled={!targetPlan || targetPlan.id === plan.id || blockers.length > 0} onConfirm={change}>
        <RadioCards value={target} onChange={setTarget} columns={2} options={plans.map((p) => ({ value: p.id, label: `${p.name} · ${fmtMoney(p.priceMonthly, p.currency)}/mo`, description: `${p.modules.includes('*') ? 'All modules' : p.modules.length + ' modules'} · ${p.limits.users} users · ${p.limits.companies} companies`, disabled: p.id === plan.id }))} />
      </ConfirmDialog>
    </div>
  );
}
