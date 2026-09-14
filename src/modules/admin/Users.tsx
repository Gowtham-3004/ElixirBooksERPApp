// Users & access (FR-IAM-001..006): register, invite drawer (email · roles · companies · branches → Invited user + token),
// segregation-of-duty warning, copy invite link.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, session, useCollection, useSession } from '../../store';
import type { User, Role, Company, Branch, WorkflowRule, Tenant, Plan } from '../../store';
import { fmtDateTime, validateEmail, uid } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, TextField, IdentifierField, ChipGroup, Avatar, TwoLine, Banner, useToast, Meter } from '../../components/ui';
import type { Column } from '../../components/ui';
import { permissionCovers } from './shared';

/** Creator permission that conflicts with approving the same document type (FRD §22). */
const CREATOR_PERM: Record<string, string> = { 'Sales Invoice': 'sales.invoice.create', 'Purchase Order': 'purchase.order.create', Journal: 'accounting.journal.create', 'Credit Note': 'sales.creditnote.create', 'Payment Batch': 'purchase.batch.create', 'Expense Claim': 'budgets.expenses.create', 'Stock Adjustment': 'inventory.adjustment.create', 'Production Order': 'production.order.create', Timesheet: 'projects.timesheet.create' };

export function sodConflicts(roleIds: string[]): string[] {
  const roles = roleIds.map((id) => db.find<Role>(C.roles, id)).filter(Boolean) as Role[];
  const perms = roles.flatMap((r) => r.permissions);
  const approverFor = new Set<string>();
  db.where<WorkflowRule>(C.workflowRules, (w) => w.status === 'Active').forEach((w) => w.steps.forEach((st) => { if (st.approverType === 'Role' && roleIds.includes(st.approverRef)) approverFor.add(w.docType); }));
  return Array.from(approverFor).filter((dt) => CREATOR_PERM[dt] && permissionCovers(perms, CREATOR_PERM[dt]) && !perms.includes('*'));
}

export function inviteLink(token: string) {
  return `${window.location.origin}${window.location.pathname}#/invite?token=${token}`;
}

export default function Users() {
  const s = useSession();
  const toast = useToast();
  const users = useCollection<User>(C.users).filter((u) => u.tenantId === s.state.tenantId);
  const roles = useCollection<Role>(C.roles);
  const companies = useCollection<Company>(C.companies).filter((c) => c.tenantId === s.state.tenantId);
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId && b.status === 'Active');
  const tenant = s.tenant as Tenant | undefined;
  const plan = s.plan as Plan | undefined;
  const canInvite = s.can('admin.users.create') || s.can('admin.users.*') || s.isTenantOwner;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', email: '', roleIds: [] as string[], companyIds: [s.state.companyId ?? ''], branchIds: [] as string[] });
  const [created, setCreated] = useState<User | null>(null);
  const conflicts = useMemo(() => sodConflicts(f.roleIds), [f.roleIds]);
  const limit = plan?.limits.users ?? 999;
  const atLimit = users.length >= limit;

  const invite = () => {
    const err = validateEmail(f.email) ?? (!f.email ? 'Email is required' : null);
    if (err) { toast.error(err); return; }
    if (users.some((u) => u.email.toLowerCase() === f.email.trim().toLowerCase())) { toast.error('A user with this email already exists'); return; }
    if (!f.roleIds.length) { toast.error('Choose at least one role'); return; }
    if (!f.companyIds.filter(Boolean).length) { toast.error('Choose at least one company'); return; }
    if (atLimit) { toast.error(`Plan limit of ${limit} users reached — upgrade to invite more`); return; }
    const token = uid('inv');
    const u = db.insert<User>(C.users, { companyId: f.companyIds[0], tenantId: s.state.tenantId, name: f.name.trim() || f.email.split('@')[0], email: f.email.trim().toLowerCase(), roleIds: f.roleIds, companyIds: f.companyIds.filter(Boolean), branchIds: f.branchIds, status: 'Invited', mfaEnabled: false, passwordSet: false, invitedAt: new Date().toISOString(), inviteToken: token });
    engine.audit({ action: 'user.invited', objectType: 'User', objectId: u.id, detail: `${u.email} · ${f.roleIds.map((id) => roles.find((r) => r.id === id)?.name).join(', ')} · ${f.companyIds.length} compan${f.companyIds.length === 1 ? 'y' : 'ies'}${conflicts.length ? ' · SoD warning: ' + conflicts.join(', ') : ''}`, sensitive: true });
    engine.notify({ type: 'security', title: `Invitation sent to ${u.email}`, body: `Expires in 14 days · roles ${f.roleIds.map((id) => roles.find((r) => r.id === id)?.name).join(', ')}`, link: `admin/users/${u.id}`, channel: 'email', status: 'sent' });
    if (tenant) db.update<Tenant>(C.tenants, tenant.id, { usage: { ...tenant.usage, users: users.length + 1 } });
    setCreated(u);
    toast.success(`Invitation created for ${u.email}`);
  };

  const columns: Column<User>[] = [
    { key: 'name', label: 'User', sortable: true, render: (u) => <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={u.name} /><TwoLine primary={<span>{u.name}{u.isTenantOwner && <Badge status="Approved" style={{ marginLeft: 6 }}>Owner</Badge>}</span>} secondary={u.email} /></div> },
    { key: 'roles', label: 'Roles', render: (u) => <span style={{ fontSize: 13 }}>{u.roleIds.map((id) => roles.find((r) => r.id === id)?.name ?? id).join(', ') || (u.isPlatformAdmin ? 'Platform Admin' : '—')}</span> },
    { key: 'companies', label: 'Companies · branches', render: (u) => <TwoLine primary={u.companyIds.map((id) => companies.find((c) => c.id === id)?.tradeName ?? id).join(', ') || '—'} secondary={u.branchIds.length ? u.branchIds.map((id) => db.find<Branch>(C.branches, id)?.name ?? id).join(', ') : 'All branches'} /> },
    { key: 'lastLoginAt', label: 'Last login', sortable: true, render: (u) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : u.status === 'Invited' ? `Invited ${fmtDateTime(u.invitedAt)}` : '—'}</span> },
    { key: 'mfa', label: 'MFA', render: (u) => <span style={{ fontSize: 12, color: u.mfaEnabled ? 'var(--good)' : 'var(--ink-5)' }}>{u.mfaEnabled ? '✓ Enabled' : 'Disabled'}</span> },
    { key: 'status', label: 'Status', render: (u) => <Badge status={u.status} /> },
  ];

  return (
    <>
      <RegisterPage<User>
        title="Users & access"
        subtitle={`${users.length} users · ${users.filter((u) => u.status === 'Active').length} active · ${users.filter((u) => u.status === 'Invited').length} invited · plan limit ${limit}`}
        rows={users}
        entity="users"
        columns={columns}
        searchKeys={['name', 'email']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (u) => u.status === 'Active' }, { id: 'invited', label: 'Invited', filter: (u) => u.status === 'Invited' }, { id: 'suspended', label: 'Suspended / deactivated', filter: (u) => u.status === 'Suspended' || u.status === 'Deactivated' }]}
        filters={[{ key: 'role', label: 'Role', type: 'select', options: roles.map((r) => ({ value: r.id, label: r.name })) }, { key: 'mfa', label: 'MFA', type: 'select', options: [{ value: 'on', label: 'Enabled' }, { value: 'off', label: 'Disabled' }] }]}
        applyFilter={(u, v) => (!v.role || u.roleIds.includes(v.role)) && (!v.mfa || (v.mfa === 'on') === u.mfaEnabled)}
        primaryAction={{ label: 'Invite user', onClick: () => { setCreated(null); setOpen(true); }, disabled: !canInvite || atLimit, reason: !canInvite ? 'Requires admin.users.create' : atLimit ? `Plan limit of ${limit} users reached` : undefined }}
        headerExtra={<div style={{ maxWidth: 320 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}><span>User seats</span><span>{users.length} / {limit}</span></div><Meter value={users.length} max={limit} /></div>}
        onRowClick={(u) => nav.go(`admin/users/${u.id}`)}
        rowActions={(u) => [
          { label: 'Open', onClick: () => nav.go(`admin/users/${u.id}`) },
          { label: 'Copy invite link', onClick: () => { navigator.clipboard?.writeText(inviteLink(u.inviteToken!)); toast.success('Invite link copied'); }, disabled: u.status !== 'Invited' || !u.inviteToken, reason: u.status !== 'Invited' ? 'Only for invited users' : undefined },
          { label: 'Open invitation (demo)', onClick: () => { session.logout(); session.setAuth('invite', { inviteToken: u.inviteToken }); }, disabled: u.status !== 'Invited' || !u.inviteToken, reason: u.status !== 'Invited' ? 'Only for invited users' : undefined },
        ]}
      />
      <Drawer open={open} onClose={() => setOpen(false)} title="Invite user" subtitle="The invitee receives a link valid for 14 days; the account activates when they set a password (FR-IAM-001)." width={600}
        footer={created ? <><Button variant="secondary" onClick={() => { setOpen(false); nav.go(`admin/users/${created.id}`); }}>Open user</Button><Button variant="primary" onClick={() => { setOpen(false); setF({ name: '', email: '', roleIds: [], companyIds: [s.state.companyId ?? ''], branchIds: [] }); }}>Done</Button></> : <><Button variant="secondary" onClick={() => setOpen(false)}>Discard</Button><Button variant="primary" onClick={invite}>Send invitation</Button></>}>
        {created ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Banner tone="success">Invitation created for <strong>{created.email}</strong>. In production the link is emailed; here you can copy it or open it directly.</Banner>
            <TextField label="Invite link" value={inviteLink(created.inviteToken!)} onChange={() => {}} suffix={<button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(inviteLink(created.inviteToken!)); toast.success('Copied'); }}>Copy</button>} />
            <Button variant="secondary" onClick={() => { session.logout(); session.setAuth('invite', { inviteToken: created.inviteToken }); }}>Open invitation now (signs you out)</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="grid-2">
              <TextField label="Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} placeholder="Optional — they can set it on activation" autoFocus />
              <IdentifierField kind="EMAIL" label="Work email" required value={f.email} onChange={(v) => setF({ ...f, email: v })} />
            </div>
            <ChipGroup label="Roles" multiple value={f.roleIds} onChange={(v: string[]) => setF({ ...f, roleIds: v })} options={roles.filter((r) => r.code !== 'OWNER' || s.isTenantOwner).map((r) => ({ value: r.id, label: r.name }))} />
            {conflicts.length > 0 && <Banner tone="warning">Segregation of duties: these roles let the user both create and approve <strong>{conflicts.join(', ')}</strong>. Self-approval stays blocked by the workflow, but consider splitting the roles (FRD §22).</Banner>}
            <ChipGroup label="Companies" multiple value={f.companyIds.filter(Boolean)} onChange={(v: string[]) => setF({ ...f, companyIds: v })} options={companies.map((c) => ({ value: c.id, label: c.tradeName }))} />
            <ChipGroup label={`Branches (${s.company?.tradeName}) — none selected = all`} multiple value={f.branchIds} onChange={(v: string[]) => setF({ ...f, branchIds: v })} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
            <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Data scope comes from the role (company / branch / own). Security-sensitive changes are audited (FR-IAM-006).</div>
          </div>
        )}
      </Drawer>
    </>
  );
}
