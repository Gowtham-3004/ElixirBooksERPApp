// Platform › Tenants (FR-PLT-003): register with state badges, trial/renewal, usage vs limits; actions
// change plan · extend trial · suspend / reinstate (reason) · cancel — transitions validated.
import { useState } from 'react';
import { db, C, engine, useCollection } from '../../store';
import type { Tenant, Plan, User, SubscriptionState } from '../../store';
import { fmtDate, fmtMoney, addDays, today } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, SelectField, NumberField, TwoLine, Meter, KV, useToast, ConfirmDialog, Banner } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { switchBlockers } from '../../store/plans';

const ALLOWED: Record<SubscriptionState, SubscriptionState[]> = {
  Trial: ['Active', 'Expired', 'Cancelled'],
  Active: ['Grace', 'Suspended', 'Cancelled'],
  Grace: ['Active', 'Suspended', 'Cancelled'],
  Suspended: ['Active', 'Cancelled'],
  Expired: ['Active', 'Cancelled'],
  Cancelled: [],
};

export default function Tenants({ initialId }: { initialId?: string }) {
  const toast = useToast();
  const tenants = useCollection<Tenant>(C.tenants);
  const plans = useCollection<Plan>(C.plans);
  const users = useCollection<User>(C.users);
  const [open, setOpen] = useState<Tenant | null>(initialId ? tenants.find((t) => t.id === initialId) ?? null : null);
  const [act, setAct] = useState<{ t: Tenant; kind: 'suspend' | 'reinstate' | 'cancel' | 'plan' | 'extend' } | null>(null);
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState(14);
  const planOf = (t: Tenant) => plans.find((p) => p.id === t.planId);
  const audit = (action: string, t: Tenant, detail?: string, before?: Record<string, unknown>, after?: Record<string, unknown>) => engine.audit({ action, objectType: 'Tenant', objectId: t.id, objectNumber: t.name, detail, before, after, tenantId: 'tnt_platform', companyId: undefined, sensitive: true });

  const transition = (t: Tenant, to: SubscriptionState, patch: Partial<Tenant>, action: string, reason?: string) => {
    if (!ALLOWED[t.subscriptionState].includes(to)) throw new Error(`${t.subscriptionState} → ${to} is not a valid transition (allowed: ${ALLOWED[t.subscriptionState].join(', ') || 'none'})`);
    db.update<Tenant>(C.tenants, t.id, { subscriptionState: to, ...patch });
    audit(action, t, reason, { state: t.subscriptionState }, { state: to });
    const owner = users.find((u) => u.id === t.ownerUserId);
    engine.notify({ type: 'system', title: `${t.name}: subscription ${to.toLowerCase()}`, body: reason, link: 'admin/plan', userId: owner?.id, companyId: undefined });
    toast.success(`${t.name} is now ${to}`);
  };
  const confirm = (reason: string) => {
    if (!act) return;
    const { t, kind } = act;
    if (kind === 'suspend') transition(t, 'Suspended', {}, 'tenant.suspended', reason);
    if (kind === 'reinstate') transition(t, 'Active', { graceUntil: undefined, renewsAt: addDays(today(), 30) }, 'tenant.reinstated', reason);
    if (kind === 'cancel') transition(t, 'Cancelled', {}, 'tenant.cancelled', reason);
    if (kind === 'extend') { db.update<Tenant>(C.tenants, t.id, { trialEndsAt: addDays(t.trialEndsAt ?? today(), days) }); audit('tenant.trial_extended', t, `${days} days · ${reason}`); toast.success(`Trial extended by ${days} days`); }
    if (kind === 'plan') { const p = plans.find((x) => x.id === planId); if (!p) throw new Error('Choose a plan'); if (p.status !== 'Active') throw new Error('Only Active plan versions can be assigned'); const blockers = switchBlockers(t, p); if (blockers.length) throw new Error(`Cannot switch plan until usage is reduced: ${blockers.join('; ')}`); db.update<Tenant>(C.tenants, t.id, { planId: p.id }); audit('tenant.plan.changed', t, `${planOf(t)?.name} → ${p.name} v${p.planVersion} · ${reason} · no data copied`, { planId: t.planId }, { planId: p.id }); toast.success(`${t.name} moved to ${p.name}`); }
    setAct(null);
    setOpen(db.find<Tenant>(C.tenants, t.id) ?? null);
  };

  const actions = (t: Tenant): MenuAction[] => [
    { label: 'Open', onClick: () => setOpen(t) },
    { label: 'Change plan…', onClick: () => { setPlanId(t.planId); setAct({ t, kind: 'plan' }); }, disabled: t.subscriptionState === 'Cancelled' },
    { label: 'Extend trial…', onClick: () => setAct({ t, kind: 'extend' }), disabled: t.subscriptionState !== 'Trial', reason: t.subscriptionState !== 'Trial' ? 'Only trial tenants' : undefined },
    { label: 'Suspend', onClick: () => setAct({ t, kind: 'suspend' }), disabled: !ALLOWED[t.subscriptionState].includes('Suspended'), reason: !ALLOWED[t.subscriptionState].includes('Suspended') ? `Cannot suspend from ${t.subscriptionState}` : undefined, danger: true, separator: true },
    { label: 'Reinstate', onClick: () => setAct({ t, kind: 'reinstate' }), disabled: !(t.subscriptionState === 'Suspended' || t.subscriptionState === 'Grace' || t.subscriptionState === 'Expired'), reason: 'Only suspended, grace or expired tenants' },
    { label: 'Cancel subscription', onClick: () => setAct({ t, kind: 'cancel' }), disabled: t.subscriptionState === 'Cancelled', danger: true },
  ];

  const columns: Column<Tenant>[] = [
    { key: 'name', label: 'Tenant', sortable: true, render: (t) => <TwoLine primary={t.name} secondary={`${t.id} · ${t.country} · owner ${users.find((u) => u.id === t.ownerUserId)?.name ?? t.ownerUserId}`} /> },
    { key: 'plan', label: 'Plan', render: (t) => { const p = planOf(t); return p ? <TwoLine primary={`${p.name} v${p.planVersion}`} secondary={`${fmtMoney(p.priceMonthly, p.currency)}/mo${p.status !== 'Active' ? ' · ' + p.status.toLowerCase() + ' version' : ''}`} /> : '—'; } },
    { key: 'subscriptionState', label: 'State', sortable: true, render: (t) => <Badge status={t.subscriptionState} /> },
    { key: 'dates', label: 'Trial end / renewal', render: (t) => <span style={{ fontSize: 12, color: '#5F6368' }}>{t.subscriptionState === 'Trial' ? `Trial ends ${fmtDate(t.trialEndsAt)}` : t.subscriptionState === 'Grace' ? `Grace until ${fmtDate(t.graceUntil)}` : t.renewsAt ? `Renews ${fmtDate(t.renewsAt)}` : '—'}</span> },
    { key: 'usage', label: 'Usage vs limits', render: (t) => { const p = planOf(t); return <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 160 }}>{['users', 'invoicesPerMonth'].map((k) => <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}><span style={{ width: 62, color: '#5F6368' }}>{k === 'users' ? 'Users' : 'Invoices'}</span><div style={{ flex: 1 }}><Meter value={t.usage[k] ?? 0} max={p?.limits[k] ?? 1} /></div><span style={{ fontFeatureSettings: '"tnum" 1' }}>{t.usage[k] ?? 0}/{p?.limits[k] ?? '—'}</span></div>)}</div>; } },
  ];
  const openPlan = open ? planOf(open) : undefined;

  return (
    <>
      <RegisterPage<Tenant>
        title="Tenants"
        subtitle={`${tenants.length} tenants · ${tenants.filter((t) => t.subscriptionState === 'Active').length} active · ${tenants.filter((t) => t.subscriptionState === 'Trial').length} on trial`}
        rows={tenants}
        entity="tenants"
        columns={columns}
        searchKeys={['name', 'id', 'country']}
        tabs={[{ id: 'all', label: 'All' }, ...(['Trial', 'Active', 'Grace', 'Suspended', 'Expired', 'Cancelled'] as SubscriptionState[]).map((st) => ({ id: st, label: st, filter: (t: Tenant) => t.subscriptionState === st }))]}
        onRowClick={(t) => setOpen(t)}
        rowActions={actions}
      />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open?.name ?? ''} subtitle={open ? `${open.id} · ${open.country}` : ''} width={620} headerRight={open && <Badge status={open.subscriptionState} />}
        footer={open ? <><div style={{ display: 'flex', gap: 6 }}>{actions(open).filter((a) => a.label !== 'Open').map((a) => <Button key={a.label} size="sm" variant={a.danger ? 'danger' : 'secondary'} onClick={a.onClick} disabled={a.disabled} reason={a.reason}>{a.label.replace('…', '')}</Button>)}</div><span /></> : undefined}>
        {open && openPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <KV columns={2} items={[{ k: 'Plan', v: `${openPlan.name} v${openPlan.planVersion}` }, { k: 'Price', v: `${fmtMoney(openPlan.priceMonthly, openPlan.currency)} / month` }, { k: 'State', v: open.subscriptionState }, { k: 'Allowed next', v: ALLOWED[open.subscriptionState].join(', ') || '—' }, { k: 'Trial ends', v: fmtDate(open.trialEndsAt) }, { k: 'Renews', v: fmtDate(open.renewsAt) }, { k: 'Grace until', v: fmtDate(open.graceUntil) }, { k: 'Owner', v: users.find((u) => u.id === open.ownerUserId)?.email ?? open.ownerUserId }, { k: 'Companies', v: db.count(C.companies, (c) => c.tenantId === open.id) }, { k: 'Users', v: db.count(C.users, (u) => u.tenantId === open.id) }]} />
            <div>
              <div className="section-label" style={{ marginBottom: 6 }}>Usage against plan limits</div>
              {Object.entries(openPlan.limits).map(([k, max]) => <div key={k} style={{ marginBottom: 8 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{k}</span><span style={{ fontFeatureSettings: '"tnum" 1' }}>{(open.usage[k] ?? 0).toLocaleString('en-IN')} / {max.toLocaleString('en-IN')}</span></div><Meter value={open.usage[k] ?? 0} max={max} /></div>)}
            </div>
            <Banner tone="info">Platform actions never read tenant business data; every action is a platform-only audit event (FRD §22, E2E-04).</Banner>
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!act} onClose={() => setAct(null)} title={act ? ({ suspend: `Suspend ${act.t.name}?`, reinstate: `Reinstate ${act.t.name}?`, cancel: `Cancel subscription for ${act.t.name}?`, plan: `Change plan for ${act.t.name}`, extend: `Extend trial for ${act.t.name}` })[act.kind] : ''}
        statement={act ? ({ suspend: 'All modules become read-only for the tenant except Home and Company administration. Owners see a suspension banner.', reinstate: 'Full access returns immediately; renewal is set 30 days out.', cancel: 'The tenant loses access at the end of the period; data export remains available for 30 days. Cancelled is terminal.', plan: 'Entitlements change immediately for every user of the tenant; no data is copied (FR-PLT-005).', extend: 'Moves the trial end date forward.' })[act.kind] : undefined}
        consequences={act?.kind === 'suspend' ? [{ engine: 'Workflow', text: 'API calls for business modules return ENTITLEMENT_DENIED', tone: 'danger' }, { engine: 'Notification', text: 'Tenant owner is notified' }] : act?.kind === 'cancel' ? [{ engine: 'Workflow', text: 'No further state transitions are possible', tone: 'danger' }] : [{ engine: 'Notification', text: 'Tenant owner is notified' }]}
        reasonRequired={act?.kind !== 'extend' && act?.kind !== 'plan' ? true : act?.kind === 'plan'} confirmLabel={act ? ({ suspend: 'Suspend tenant', reinstate: 'Reinstate tenant', cancel: 'Cancel subscription', plan: 'Change plan', extend: 'Extend trial' })[act.kind] : ''} cancelLabel="Keep as is" danger={act?.kind === 'suspend' || act?.kind === 'cancel'} onConfirm={confirm}>
        {act?.kind === 'plan' && <SelectField label="New plan" value={planId} onChange={setPlanId} options={plans.filter((p) => p.status === 'Active').map((p) => ({ value: p.id, label: `${p.name} v${p.planVersion} · ${fmtMoney(p.priceMonthly, p.currency)}/mo` }))} style={{ marginBottom: 12 }} />}
        {act?.kind === 'extend' && <NumberField label="Extend by (days)" value={days} onChange={(v) => setDays(Math.max(1, Math.round(v)))} decimals={0} min={1} max={90} style={{ marginBottom: 12 }} />}
      </ConfirmDialog>
    </>
  );
}
