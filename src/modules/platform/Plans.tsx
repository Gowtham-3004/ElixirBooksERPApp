// Platform › Plans (FR-PLT-001/002): register + editor (code, name, tier, version, status, module entitlements,
// numeric limits, price); "New version" clones + bumps planVersion and retires the old one.
import { useState } from 'react';
import { db, C, engine, useCollection } from '../../store';
import type { Plan, Tenant } from '../../store';
import { fmtMoney } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, TextField, SelectField, NumberField, MoneyField, ChipGroup, TwoLine, useToast, ConfirmDialog, Banner } from '../../components/ui';
import type { Column } from '../../components/ui';
import { MODULES } from '../registry';
import { PLAN_TIERS } from '../../store/plans';

const LIMITS = [{ key: 'users', label: 'Users' }, { key: 'companies', label: 'Companies' }, { key: 'invoicesPerMonth', label: 'Invoices / month' }, { key: 'storageMb', label: 'Storage (MB)' }];
const MODULE_OPTIONS = [{ value: '*', label: 'All modules (*)' }, ...MODULES.filter((m) => !m.platformOnly).map((m) => ({ value: m.id, label: m.label }))];

export default function Plans() {
  const toast = useToast();
  const plans = useCollection<Plan>(C.plans);
  const tenants = useCollection<Tenant>(C.tenants);
  const [edit, setEdit] = useState<Plan | null>(null);
  const [retire, setRetire] = useState<Plan | null>(null);
  const [newVersion, setNewVersion] = useState<Plan | null>(null);
  const tenantsOn = (p: Plan) => tenants.filter((t) => t.planId === p.id).length;
  const audit = (action: string, p: Plan, detail?: string) => engine.audit({ action, objectType: 'Plan', objectId: p.id, objectNumber: `${p.code} v${p.planVersion}`, detail, tenantId: 'tnt_platform', companyId: undefined });

  const save = () => {
    if (!edit) return;
    if (!edit.code.trim() || !edit.name.trim()) { toast.error('Code and name are required'); return; }
    if (!edit.modules.length) { toast.error('Entitle at least one module'); return; }
    if (edit.id) { db.update<Plan>(C.plans, edit.id, { ...edit }); audit('plan.updated', edit, `${edit.modules.includes('*') ? 'all' : edit.modules.length} modules · ${fmtMoney(edit.priceMonthly, edit.currency)}`); toast.success('Plan saved'); }
    else { const { id, createdAt, updatedAt, version, ...rest } = edit; const p = db.insert<Plan>(C.plans, { ...rest, companyId: undefined }); audit('plan.created', p); toast.success(`${p.name} created as Draft`); }
    setEdit(null);
  };
  const setStatus = (p: Plan, status: Plan['status'], reason?: string) => { db.update<Plan>(C.plans, p.id, { status }); audit(status === 'Active' ? 'plan.activated' : 'plan.retired', p, reason); toast.success(`${p.name} ${status.toLowerCase()}`); };
  const cloneVersion = () => {
    if (!newVersion) return;
    const { id, createdAt, updatedAt, version, ...rest } = newVersion;
    const p = db.transaction(() => {
      const next = db.insert<Plan>(C.plans, { ...rest, companyId: undefined, planVersion: newVersion.planVersion + 1, status: 'Draft', name: newVersion.name.replace(/ \(v\d+.*\)$/, '') });
      db.update<Plan>(C.plans, newVersion.id, { status: 'Retired', name: `${newVersion.name.replace(/ \(v\d+.*\)$/, '')} (v${newVersion.planVersion}, retired)` });
      return next;
    });
    audit('plan.versioned', p, `v${newVersion.planVersion} retired → v${p.planVersion} draft · ${tenantsOn(newVersion)} tenant(s) stay on v${newVersion.planVersion} until moved`);
    toast.success(`${p.name} v${p.planVersion} created as Draft`);
    setNewVersion(null);
    setEdit({ ...p });
  };

  const columns: Column<Plan>[] = [
    { key: 'name', label: 'Plan', sortable: true, render: (p) => <TwoLine primary={p.name} secondary={`${p.code} · v${p.planVersion} · ${p.tier}`} /> },
    { key: 'modules', label: 'Modules', render: (p) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{p.modules.includes('*') ? 'All modules' : `${p.modules.length}: ${p.modules.slice(0, 5).join(', ')}${p.modules.length > 5 ? '…' : ''}`}</span> },
    { key: 'limits', label: 'Limits', render: (p) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{LIMITS.map((l) => `${l.label} ${p.limits[l.key]?.toLocaleString('en-IN') ?? '—'}`).join(' · ')}</span> },
    { key: 'priceMonthly', label: 'Price / month', align: 'right', sortable: true, render: (p) => <span className="money">{fmtMoney(p.priceMonthly, p.currency)}</span> },
    { key: 'tenants', label: 'Tenants', align: 'right', render: (p) => tenantsOn(p) },
    { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
  ];

  return (
    <>
      <RegisterPage<Plan>
        title="Subscription plans"
        subtitle={`${plans.length} plan versions · ${plans.filter((p) => p.status === 'Active').length} active · entitlements enforced identically in API and UI (FR-PLT-004)`}
        rows={plans}
        entity="plans"
        columns={columns}
        searchKeys={['code', 'name', 'tier']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (p) => p.status === 'Active' }, { id: 'draft', label: 'Draft', filter: (p) => p.status === 'Draft' }, { id: 'retired', label: 'Retired', filter: (p) => p.status === 'Retired' }]}
        primaryAction={{ label: 'New plan', onClick: () => setEdit({ id: '', createdAt: '', updatedAt: '', version: 0, code: '', name: '', tier: 'Growth', planVersion: 1, status: 'Draft', modules: ['home', 'approvals', 'sales', 'reports', 'masters', 'admin'], limits: { users: 5, companies: 1, invoicesPerMonth: 500, storageMb: 1000 }, priceMonthly: 1999, currency: 'INR' }) }}
        onRowClick={(p) => setEdit({ ...p, modules: [...p.modules], limits: { ...p.limits } })}
        rowActions={(p) => [
          { label: 'Edit', onClick: () => setEdit({ ...p }) },
          { label: 'New version', onClick: () => setNewVersion(p), disabled: p.status === 'Retired' },
          { label: 'Activate', onClick: () => setStatus(p, 'Active'), disabled: p.status !== 'Draft' },
          { label: 'Retire', onClick: () => setRetire(p), disabled: p.status === 'Retired', danger: true, separator: true },
        ]}
      />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${edit.name} · v${edit.planVersion}` : 'New plan'} width={640} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Discard</Button><Button variant="primary" onClick={save}>Save plan</Button></>}>
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {edit.status === 'Active' && edit.id && <Banner tone="warning">This version is live for {tenantsOn(edit)} tenant(s). Entitlement changes apply to them immediately — prefer "New version" for material changes.</Banner>}
            <div className="grid-3">
              <TextField label="Code" required value={edit.code} onChange={(v) => setEdit({ ...edit, code: v })} uppercase disabled={!!edit.id} />
              <TextField label="Name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
              <SelectField label="Tier" value={edit.tier} onChange={(v) => setEdit({ ...edit, tier: v as Plan['tier'] })} options={[...PLAN_TIERS]} />
            </div>
            <div className="grid-3">
              <NumberField label="Version" value={edit.planVersion} onChange={() => {}} decimals={0} disabled help="Bumped by New version" />
              <MoneyField label="Price / month" value={edit.priceMonthly} onChange={(v) => setEdit({ ...edit, priceMonthly: v })} currency={edit.currency} />
              <SelectField label="Currency" value={edit.currency} onChange={(v) => setEdit({ ...edit, currency: v })} options={['INR', 'USD', 'AED', 'GBP']} />
            </div>
            <ChipGroup label="Module entitlements" multiple value={edit.modules} onChange={(v: string[]) => setEdit({ ...edit, modules: v.includes('*') && !edit.modules.includes('*') ? ['*'] : v.filter((x) => x !== '*' || v.length === 1) })} options={MODULE_OPTIONS} />
            <div className="section-label">Numeric limits</div>
            <div className="grid-4">
              {LIMITS.map((l) => <NumberField key={l.key} label={l.label} value={edit.limits[l.key] ?? 0} onChange={(v) => setEdit({ ...edit, limits: { ...edit.limits, [l.key]: Math.max(0, Math.round(v)) } })} decimals={0} min={0} size="sm" />)}
            </div>
            <SelectField label="Status" value={edit.status} onChange={(v) => setEdit({ ...edit, status: v as Plan['status'] })} options={['Draft', 'Active', 'Retired']} />
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!newVersion} onClose={() => setNewVersion(null)} title={`Create ${newVersion?.name} v${(newVersion?.planVersion ?? 0) + 1}?`} statement={`The current v${newVersion?.planVersion} is retired; tenants on it keep their entitlements until moved to the new version.`} consequences={[{ engine: 'Workflow', text: 'New version starts as Draft with the same modules, limits and price', tone: 'info' }, { engine: 'Workflow', text: `${newVersion ? tenantsOn(newVersion) : 0} tenant(s) remain on the retired version`, tone: 'warning' }]} confirmLabel="Create new version" cancelLabel="Keep current version" onConfirm={cloneVersion} />
      <ConfirmDialog open={!!retire} onClose={() => setRetire(null)} title={`Retire ${retire?.name} v${retire?.planVersion}?`} statement="Retired plans cannot be selected for new tenants; existing tenants keep their entitlements." consequences={[{ engine: 'Workflow', text: `${retire ? tenantsOn(retire) : 0} tenant(s) stay entitled until moved`, tone: 'warning' }]} reasonRequired confirmLabel="Retire plan" cancelLabel="Keep plan" danger onConfirm={(reason) => { if (retire) setStatus(retire, 'Retired', reason); }} />
    </>
  );
}
