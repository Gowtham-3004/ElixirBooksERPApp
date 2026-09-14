// User detail (admin/users/<id>, FR-IAM-002..006): profile, roles, company/branch mapping, MFA, sessions,
// suspend / reactivate / deactivate with reason, resend invite, reset password. Sensitive changes audit with sensitive: true.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { User, Role, Company, Branch } from '../../store';
import { fmtDateTime, uid } from '../../lib/format';
import { PageHeader, Card, Button, Badge, Avatar, ChipGroup, TextField, Toggle, ConfirmDialog, KV, Banner, useToast, ActivityTab, EmptyState } from '../../components/ui';
import { sodConflicts, inviteLink } from './Users';
import { deviceTrust } from '../auth/Frame';

export default function UserDetail({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const u = useRecord<User>(C.users, id);
  const roles = useCollection<Role>(C.roles);
  const companies = useCollection<Company>(C.companies).filter((c) => c.tenantId === s.state.tenantId);
  const branches = useCollection<Branch>(C.branches).filter((b) => (u?.companyIds ?? []).includes(b.companyId ?? '') && b.status === 'Active');
  const [confirm, setConfirm] = useState<'suspend' | 'reactivate' | 'deactivate' | 'mfaOn' | 'mfaOff' | 'reset' | 'signout' | null>(null);
  const [name, setName] = useState(u?.name ?? '');
  const [phone, setPhone] = useState(u?.phone ?? '');
  const conflicts = useMemo(() => sodConflicts(u?.roleIds ?? []), [u?.roleIds]);
  if (!u) return <div className="page"><EmptyState illustration="not-found" title="User not found" description="The link may be stale, or you may not have access to this user." action={<Button variant="secondary" onClick={() => nav.go('admin/users')}>Back to users</Button>} /></div>;
  const isSelf = u.id === s.user?.id;
  const canEdit = s.can('admin.users.edit') || s.can('admin.users.*') || s.isTenantOwner;
  const canSecurity = canEdit || isSelf;
  const audit = (action: string, detail?: string, extra: Record<string, unknown> = {}) => engine.audit({ action, objectType: 'User', objectId: u.id, objectNumber: u.email, detail, sensitive: true, ...extra });

  const saveRoles = (roleIds: string[]) => { const before = u.roleIds; db.update<User>(C.users, u.id, { roleIds }); audit('user.roles.changed', `${before.map((r) => roles.find((x) => x.id === r)?.name).join(', ') || '—'} → ${roleIds.map((r) => roles.find((x) => x.id === r)?.name).join(', ') || '—'}`, { before: { roleIds: before }, after: { roleIds } }); };
  const saveCompanies = (companyIds: string[]) => { if (!companyIds.length) { toast.error('A user needs at least one company'); return; } db.update<User>(C.users, u.id, { companyIds, branchIds: u.branchIds.filter((b) => companyIds.includes(db.find<Branch>(C.branches, b)?.companyId ?? '')) }); audit('user.companies.changed', companyIds.map((c) => companies.find((x) => x.id === c)?.tradeName).join(', ')); };
  const saveBranches = (branchIds: string[]) => { db.update<User>(C.users, u.id, { branchIds }); audit('user.branches.changed', branchIds.length ? branchIds.map((b) => db.find<Branch>(C.branches, b)?.name).join(', ') : 'All branches'); };
  const saveProfile = () => { db.update<User>(C.users, u.id, { name: name.trim() || u.name, phone: phone || undefined }); engine.audit({ action: 'user.profile.updated', objectType: 'User', objectId: u.id, objectNumber: u.email }); toast.success('Profile saved'); };
  const resendInvite = () => { const token = uid('inv'); db.update<User>(C.users, u.id, { inviteToken: token, invitedAt: new Date().toISOString() }); audit('user.invite.resent', u.email); engine.notify({ type: 'security', title: `Invitation resent to ${u.email}`, body: 'Valid for 14 days', link: `admin/users/${u.id}`, channel: 'email', status: 'sent' }); toast.success('Invitation resent', { label: 'Copy link', path: `admin/users/${u.id}` }); };

  const run = (reason: string) => {
    const now = new Date().toISOString();
    if (confirm === 'suspend') { db.update<User>(C.users, u.id, { status: 'Suspended', sessions: [] }); audit('user.suspended', reason); engine.notify({ type: 'security', title: `${u.name} suspended`, body: reason, link: `admin/users/${u.id}` }); }
    if (confirm === 'reactivate') { db.update<User>(C.users, u.id, { status: 'Active' }); audit('user.reactivated', reason); }
    if (confirm === 'deactivate') { db.update<User>(C.users, u.id, { status: 'Deactivated', sessions: [], inviteToken: undefined }); audit('user.deactivated', reason); engine.notify({ type: 'security', title: `${u.name} deactivated`, body: reason, link: `admin/users/${u.id}` }); }
    if (confirm === 'mfaOn') { db.update<User>(C.users, u.id, { mfaEnabled: true }); audit('user.mfa.enabled', reason); }
    if (confirm === 'mfaOff') { db.update<User>(C.users, u.id, { mfaEnabled: false }); deviceTrust.forget(u.id); audit('user.mfa.disabled', reason); }
    if (confirm === 'reset') { audit('auth.password_reset_requested', `Reset link issued by ${s.user?.name} · ${reason}`); engine.notify({ type: 'security', title: 'Password reset link sent', body: `${u.email} · expires in 30 minutes`, userId: u.id, channel: 'email', status: 'sent' }); }
    if (confirm === 'signout') { db.update<User>(C.users, u.id, { sessions: (u.sessions ?? []).filter((x) => x.current && isSelf) }); deviceTrust.forget(u.id); audit('user.sessions.revoked', `Other sessions signed out at ${now}`); }
    toast.success('Done');
    setConfirm(null);
  };
  const dialog: Record<NonNullable<typeof confirm>, { title: string; statement: string; label: string; danger?: boolean; reason: boolean }> = {
    suspend: { title: `Suspend ${u.name}?`, statement: 'Sign-in is refused and all sessions end immediately. Their documents and audit trail remain.', label: 'Suspend user', danger: true, reason: true },
    reactivate: { title: `Reactivate ${u.name}?`, statement: 'The user can sign in again with their existing roles.', label: 'Reactivate user', reason: true },
    deactivate: { title: `Deactivate ${u.name}?`, statement: 'Permanent: the account can no longer sign in and cannot be reactivated. Their name stays on historical records.', label: 'Deactivate user', danger: true, reason: true },
    mfaOn: { title: 'Enable two-factor authentication?', statement: 'The user will be asked for an authenticator code at every new sign-in.', label: 'Enable MFA', reason: false },
    mfaOff: { title: 'Disable two-factor authentication?', statement: 'Reduces account security. Remembered devices are forgotten.', label: 'Disable MFA', danger: true, reason: true },
    reset: { title: `Send a password reset to ${u.email}?`, statement: 'A reset link valid for 30 minutes is emailed. The current password keeps working until it is used.', label: 'Send reset link', reason: false },
    signout: { title: 'Sign out other sessions?', statement: 'All sessions except the current one are ended and remembered devices are forgotten.', label: 'Sign out other sessions', danger: true, reason: false },
  };

  return (
    <div className="page">
      <PageHeader back={{ label: 'Users & access', path: 'admin/users' }} title={<span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}><Avatar name={u.name} size={36} />{u.name}</span>} subtitle={`${u.email} · ${u.isTenantOwner ? 'Tenant owner · ' : ''}last login ${u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'never'}`}
        actions={<>
          <Badge status={u.status} />
          {u.status === 'Invited' && <><Button variant="secondary" onClick={resendInvite} disabled={!canEdit}>Resend invite</Button><Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(inviteLink(u.inviteToken!)); toast.success('Invite link copied'); }} disabled={!u.inviteToken}>Copy invite link</Button></>}
          {u.status === 'Active' && !isSelf && !u.isTenantOwner && <Button variant="secondary" onClick={() => setConfirm('suspend')} disabled={!canEdit} reason={canEdit ? undefined : 'Requires admin.users.edit'}>Suspend</Button>}
          {u.status === 'Suspended' && <Button variant="primary" onClick={() => setConfirm('reactivate')} disabled={!canEdit}>Reactivate</Button>}
          {u.status !== 'Deactivated' && !isSelf && !u.isTenantOwner && <Button variant="tinted" tone="danger" onClick={() => setConfirm('deactivate')} disabled={!canEdit} reason={canEdit ? undefined : 'Requires admin.users.edit'}>Deactivate</Button>}
        </>} />
      {u.status === 'Deactivated' && <Banner tone="danger">This account is deactivated and cannot be reactivated. Historical records keep the name.</Banner>}
      {u.isTenantOwner && <Banner tone="info">Tenant owner — cannot be suspended or deactivated from here. Ownership transfer is a platform operation.</Banner>}
      {conflicts.length > 0 && <Banner tone="warning">Segregation of duties: this user can both create and approve <strong>{conflicts.join(', ')}</strong> (FRD §22). Self-approval is still blocked by the workflow engine.</Banner>}
      <div className="grid-2">
        <Card title="Profile" actions={<Button size="sm" variant="secondary" onClick={saveProfile} disabled={!canSecurity || (name === u.name && phone === (u.phone ?? ''))}>Save</Button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Name" value={name} onChange={setName} disabled={!canSecurity} />
            <TextField label="Email" value={u.email} onChange={() => {}} disabled help="Email is the verified contact channel and cannot be changed here" />
            <TextField label="Phone" value={phone} onChange={setPhone} disabled={!canSecurity} />
            <KV items={[{ k: 'Status', v: <Badge status={u.status} /> }, { k: 'Password', v: u.passwordSet ? 'Set' : 'Not set (invited)' }, { k: 'Created', v: fmtDateTime(u.createdAt) }, { k: 'Invited', v: u.invitedAt ? fmtDateTime(u.invitedAt) : '—' }]} />
          </div>
        </Card>
        <Card title="Security">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Toggle on={u.mfaEnabled} onChange={(v) => setConfirm(v ? 'mfaOn' : 'mfaOff')} label="Two-factor authentication (MFA)" help={u.mfaEnabled ? 'Authenticator code required at sign-in' : 'Recommended for finance and admin roles'} disabled={!canSecurity} />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button size="sm" variant="secondary" onClick={() => setConfirm('reset')} disabled={!canSecurity || u.status === 'Deactivated'}>Send password reset</Button>
              <Button size="sm" variant="secondary" onClick={() => setConfirm('signout')} disabled={!canSecurity || !(u.sessions ?? []).length}>Sign out other sessions</Button>
            </div>
            <div>
              <div className="section-label" style={{ marginBottom: 6 }}>Active sessions</div>
              {(u.sessions ?? []).length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No active sessions.</div>}
              {(u.sessions ?? []).map((ss) => (
                <div key={ss.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--hairline)', fontSize: 13 }}>
                  <span>{ss.device}{ss.current ? <Badge status="Active" style={{ marginLeft: 6 }}>this device</Badge> : null}</span>
                  <span style={{ color: 'var(--ink-3)' }}>{fmtDateTime(ss.at)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card title="Roles">
          <ChipGroup multiple value={u.roleIds} onChange={(v: string[]) => canEdit && saveRoles(v)} options={roles.filter((r) => r.code !== 'OWNER' || u.isTenantOwner).map((r) => ({ value: r.id, label: r.name }))} />
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>
            {u.roleIds.map((id) => roles.find((r) => r.id === id)).filter(Boolean).map((r) => <div key={r!.id}><strong>{r!.name}</strong> · {r!.dataScope} scope · {r!.description} <Button variant="link" size="sm" onClick={() => nav.go(`admin/roles/${r!.id}`)}>Permissions</Button></div>)}
            {!u.roleIds.length && 'No roles — the user can sign in but sees nothing.'}
          </div>
        </Card>
        <Card title="Companies & branches">
          <ChipGroup label="Companies" multiple value={u.companyIds} onChange={(v: string[]) => canEdit && saveCompanies(v)} options={companies.map((c) => ({ value: c.id, label: `${c.tradeName} · ${c.country}` }))} />
          <div style={{ height: 12 }} />
          <ChipGroup label="Branches (none = all branches of each company)" multiple value={u.branchIds} onChange={(v: string[]) => canEdit && saveBranches(v)} options={branches.map((b) => ({ value: b.id, label: `${b.name} · ${companies.find((c) => c.id === b.companyId)?.tradeName ?? ''}` }))} />
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>Removing a company revokes access to its records on the next request (FR-IAM-004).</div>
        </Card>
      </div>
      <Card title="Activity">
        <ActivityTab objectId={u.id} />
      </Card>
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? dialog[confirm].title : ''} statement={confirm ? dialog[confirm].statement : ''} consequences={[{ engine: 'Workflow', text: 'Recorded as a security-sensitive audit event (FR-IAM-006)' }]} reasonRequired={confirm ? dialog[confirm].reason : false} confirmLabel={confirm ? dialog[confirm].label : ''} cancelLabel="Keep as is" danger={confirm ? dialog[confirm].danger : false} onConfirm={run} />
    </div>
  );
}
