// Switch company — full-screen picker shown after sign-in (when the user belongs to more than one
// company) and from the sidebar's company block. One card per company: who you are there, how big
// it is, and a way in. Owners can also add a company or deactivate one they are not currently in.
import { useState } from 'react';
import { db, C, engine, nav, session, useCollection, useSession } from '../../store';
import type { Company, User } from '../../store';
import { Button, IconButton, Pill, ConfirmDialog } from '../../components/ui';
import { ArrowRightIcon, PlusIcon, TrashIcon } from '../../components/Icons';

export default function ChooseCompany() {
  const s = useSession();
  const users = useCollection<User>(C.users);
  const [deactivate, setDeactivate] = useState<Company | null>(null);
  const inApp = !!s.state.companyId;
  const first = s.user?.name.split(' ')[0] ?? '';
  const active = s.companies.filter((c) => c.status === 'Active');
  const owned = s.isTenantOwner ? active.filter((c) => c.tenantId === s.tenant?.id) : [];
  const member = active.filter((c) => !owned.includes(c));
  const role = s.isTenantOwner ? 'Owner' : s.roles[0]?.name ?? 'Member';
  const plan = s.plan?.name?.toUpperCase();
  const usersOf = (c: Company) => users.filter((u) => u.companyIds.includes(c.id) && u.status !== 'Deactivated').length;

  const enter = (c: Company) => {
    session.enterCompany(c.id);
    if (inApp) nav.go('home');
  };
  const create = () => {
    if (inApp) session.closeCompanyPicker();
    else if (owned[0]) session.chooseCompany(owned[0].id);
    nav.go('admin/companies', { new: '1' });
  };

  const Card = ({ c }: { c: Company }) => {
    const n = usersOf(c);
    const current = c.id === s.state.companyId;
    const lock = current ? 'You are working in this company' : active.length === 1 ? 'The last company cannot be deactivated' : undefined;
    return (
      <div className="company-card" role="button" tabIndex={0} onClick={() => enter(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(c); } }}>
        {s.isTenantOwner && (
          <IconButton className="trash" title={lock ?? 'Deactivate company'} style={lock ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
            onClick={(e) => { e.stopPropagation(); if (!lock) setDeactivate(c); }}>
            <TrashIcon size={15} />
          </IconButton>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, background: `color-mix(in srgb, ${c.brandColor ?? 'var(--accent)'} 14%, transparent)`, color: c.brandColor ?? 'var(--accent)' }}>
            {c.logoText ?? c.tradeName[0] ?? c.legalName[0]}
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingRight: s.isTenantOwner ? 28 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.tradeName || c.legalName}</span>
              {plan && <Pill tone="neutral">{plan}</Pill>}
              {current && <Pill tone="good">Current</Pill>}
            </div>
            <span className="btn-link" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 13 }}>Enter workspace <ArrowRightIcon size={13} /></span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 12 }}>{c.address?.city || c.country} · {n} {n === 1 ? 'user' : 'users'}</div>
        <div className="company-card-role">
          <span className="label">Your role</span>
          <span className="chip" style={{ cursor: 'default', height: 24, color: 'var(--ink)' }}>{role}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="company-picker">
      <div className="company-picker-strip" />
      <div className="company-picker-body">
        <h1>Welcome back, {first}</h1>
        <p className="lede">Pick a company to enter. Your role is shown on each — it is set per company, so it can differ between them.</p>

        {owned.length > 0 && (
          <>
            <div className="company-picker-section">Companies you own <span className="count">You own {owned.length}</span></div>
            <div className="company-grid">{owned.map((c) => <Card key={c.id} c={c} />)}</div>
          </>
        )}
        {member.length > 0 && (
          <>
            <div className="company-picker-section">{owned.length ? "Companies you're a member of" : 'Your companies'} <span className="count">{member.length}</span></div>
            <div className="company-grid">{member.map((c) => <Card key={c.id} c={c} />)}</div>
          </>
        )}
        {active.length === 0 && (
          <div className="card" style={{ padding: 20, fontSize: 13, color: 'var(--ink-3)', marginBottom: 28 }}>You have no active companies. Ask your tenant owner to add you to one.</div>
        )}

        {s.isTenantOwner && (
          <button type="button" className="company-card create" style={{ width: '100%', marginBottom: 28 }} onClick={create}>
            <PlusIcon size={16} /> Create a new company
          </button>
        )}

        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          {inApp && <Button variant="link" onClick={() => session.closeCompanyPicker()}>← Back to {s.company?.tradeName ?? s.company?.legalName}</Button>}
          <Button variant="link" style={{ color: 'var(--ink-3)' }} onClick={() => session.logout()}>Sign out</Button>
        </div>
      </div>

      <ConfirmDialog open={!!deactivate} onClose={() => setDeactivate(null)} title={`Deactivate ${deactivate?.tradeName ?? ''}?`} danger reasonRequired confirmLabel="Deactivate company" cancelLabel="Keep company"
        statement="The company disappears from every user's picker and its books become read-only. Nothing is deleted; the tenant owner can reactivate it from Company administration › Companies."
        consequences={[{ engine: 'Access', text: 'Users mapped only to this company can no longer sign in to it', tone: 'danger' }, { engine: 'Audit', text: 'Deactivation and reason are recorded' }]}
        onConfirm={(reason) => {
          if (!deactivate) return;
          db.update<Company>(C.companies, deactivate.id, { status: 'Inactive' });
          engine.audit({ action: 'company.deactivated', objectType: 'Company', objectId: deactivate.id, objectNumber: deactivate.code, detail: reason });
          setDeactivate(null);
        }} />
    </div>
  );
}
