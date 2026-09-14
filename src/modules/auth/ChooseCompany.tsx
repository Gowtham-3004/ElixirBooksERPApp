// Switch company — full-screen picker shown after sign-in (when the user belongs to more than one
// company) and from the sidebar's company block. It shares the sign-in canvas (gradient backdrop,
// split card, illustrated aside) so the hand-off from Login feels like one flow. One card per
// company: who you are there, how big it is, where its books stand, and a way in. Owners can also
// add a company or deactivate one they are not currently in.
import { useState } from 'react';
import { db, C, engine, nav, session, useCollection, useSession } from '../../store';
import type { Branch, Company, Period, User } from '../../store';
import { Avatar, Button, IconButton, Pill, ConfirmDialog } from '../../components/ui';
import { Storyset, StorysetAnimated } from '../../components/ui/storyset';
import { Wordmark } from '../../components/Brand';
import { ArrowLeftIcon, ArrowRightIcon, CalendarIcon, CheckCircleIcon, GitBranchIcon, PlusIcon, TrashIcon, UserIcon, UsersIcon } from '../../components/Icons';
import { fmtPeriod } from '../../lib/format';
import { Backdrop } from './Frame';

const regionNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : undefined;
const countryName = (code: string) => { try { return regionNames?.of(code) ?? code; } catch { return code; } };

const PITCH = [
  'Your role is set per company, so it can differ between them.',
  'Switch any time from the company block at the top of the sidebar.',
  'Group reports consolidate across every company you can see.',
];

export default function ChooseCompany() {
  const s = useSession();
  const users = useCollection<User>(C.users);
  const branches = useCollection<Branch>(C.branches);
  const periods = useCollection<Period>(C.periods);
  const [deactivate, setDeactivate] = useState<Company | null>(null);
  const inApp = !!s.state.companyId;
  const first = s.user?.name.split(' ')[0] ?? '';
  const active = s.companies.filter((c) => c.status === 'Active');
  const owned = s.isTenantOwner ? active.filter((c) => c.tenantId === s.tenant?.id) : [];
  const member = active.filter((c) => !owned.includes(c));
  const role = s.isTenantOwner ? 'Owner' : s.roles[0]?.name ?? 'Member';
  const usersOf = (c: Company) => users.filter((u) => u.companyIds.includes(c.id) && u.status !== 'Deactivated').length;
  const branchesOf = (c: Company) => branches.filter((b) => b.companyId === c.id && b.status === 'Active').length;
  const openPeriodOf = (c: Company) => periods.filter((p) => p.companyId === c.id && p.status === 'Open').sort((a, b) => b.code.localeCompare(a.code))[0];

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
    const b = branchesOf(c);
    const open = openPeriodOf(c);
    const current = c.id === s.state.companyId;
    const colour = c.brandColor ?? 'var(--accent)';
    const lock = current ? 'You are working in this company' : active.length === 1 ? 'The last company cannot be deactivated' : undefined;
    return (
      <div className={`company-card ${current ? 'current' : ''}`} role="button" tabIndex={0} aria-label={`Enter ${c.tradeName || c.legalName}`} onClick={() => enter(c)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(c); } }}>
        {current && <span className="company-card-corner"><Pill tone="good">Current</Pill></span>}
        {s.isTenantOwner && !current && (
          <IconButton className="trash" title={lock ?? 'Deactivate company'} style={lock ? { opacity: 0.35, cursor: 'not-allowed' } : undefined}
            onClick={(e) => { e.stopPropagation(); if (!lock) setDeactivate(c); }}>
            <TrashIcon size={15} />
          </IconButton>
        )}
        <div className="company-card-head">
          <div className="company-card-mark" style={{ background: `color-mix(in srgb, ${colour} 14%, transparent)`, color: colour }}>
            {c.logoText ?? c.tradeName[0] ?? c.legalName[0]}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="company-card-name" title={c.tradeName || c.legalName}>{c.tradeName || c.legalName}</div>
            <div className="company-card-sub" title={c.legalName}>{c.address?.city ? `${c.address.city}, ` : ''}{countryName(c.country)} · {c.baseCurrency}</div>
          </div>
        </div>
        <div className="company-card-stats">
          <div><UsersIcon size={14} /><b>{n}</b>{n === 1 ? 'user' : 'users'}</div>
          <div><GitBranchIcon size={14} /><b>{b}</b>{b === 1 ? 'branch' : 'branches'}</div>
          <div title={open ? 'Open accounting period' : 'No open period'}><CalendarIcon size={14} /><b>{open ? fmtPeriod(open.code) : '—'}</b>{open ? 'open' : 'no period'}</div>
        </div>
        <div className="company-card-role">
          <span className="chip company-card-chip" title="Your role in this company"><UserIcon size={13} />{role}</span>
          <span className="company-card-enter">{current ? 'Continue' : 'Enter workspace'} <ArrowRightIcon size={14} /></span>
        </div>
      </div>
    );
  };

  const CreateTile = () => (
    <button type="button" className="company-card create" onClick={create}>
      <span className="company-card-mark"><PlusIcon size={18} /></span>
      <span style={{ display: 'block', minWidth: 0, flex: 1 }}>
        <span className="company-card-name" style={{ display: 'block', color: 'var(--accent)' }}>Create a new company</span>
        <span className="company-card-sub" style={{ display: 'block' }}>Another entity under {s.tenant?.name ?? 'your organisation'}</span>
      </span>
    </button>
  );

  const sections = [
    owned.length > 0 && { key: 'owned', title: 'Companies you own', count: owned.length, items: owned },
    member.length > 0 && { key: 'member', title: owned.length ? "Companies you're a member of" : 'Your companies', count: member.length, items: member },
  ].filter(Boolean) as { key: string; title: string; count: number; items: Company[] }[];
  const lastKey = sections[sections.length - 1]?.key;

  return (
    <Backdrop>
      <div className="auth-split company-picker">
        {/* Left — the pick */}
        <div className="auth-main company-picker-main">
          <div className="company-picker-brand">
            <Wordmark size={24} />
            {s.tenant && <span className="company-picker-tenant">{s.tenant.name}{s.plan ? ` · ${s.plan.name} plan` : ''}</span>}
          </div>
          <h1>Welcome back, {first}</h1>
          <p className="lede">{active.length > 1 ? 'Pick the company you want to work in. You can switch again at any time.' : 'Enter your company to start working.'}</p>

          {sections.map((sec) => (
            <div key={sec.key}>
              <div className="company-picker-section">{sec.title} <span className="count">{sec.count}</span></div>
              <div className="company-grid">
                {sec.items.map((c) => <Card key={c.id} c={c} />)}
                {s.isTenantOwner && sec.key === lastKey && <CreateTile />}
              </div>
            </div>
          ))}
          {active.length === 0 && (
            <div className="company-picker-empty">
              <Storyset name="no-access" width={140} bg={false} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>No active companies yet</div>
                <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>{s.isTenantOwner ? 'Create your first company to open its books.' : 'Ask your organisation owner to add you to a company.'}</div>
              </div>
              {s.isTenantOwner && <div className="company-grid" style={{ width: '100%' }}><CreateTile /></div>}
            </div>
          )}

          <div className="company-picker-foot">
            {inApp ? (
              <Button variant="secondary" icon={<ArrowLeftIcon size={14} />} onClick={() => session.closeCompanyPicker()}>Back to {s.company?.tradeName ?? s.company?.legalName}</Button>
            ) : <span />}
            {s.user && (
              <div className="company-picker-me">
                <Avatar name={s.user.name} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div className="name">{s.user.name}</div>
                  <div className="mail">{s.user.email}</div>
                </div>
                <Button variant="link" style={{ color: 'var(--ink-3)', marginLeft: 8 }} onClick={() => session.logout()}>Sign out</Button>
              </div>
            )}
          </div>
        </div>

        {/* Right — illustrated aside */}
        <div className="auth-aside company-picker-aside">
          <div className="company-picker-aside-art">
            <StorysetAnimated name="building" width={280} label="A skyline of office buildings" />
          </div>
          <h2>One sign-in, every entity</h2>
          <ul>
            {PITCH.map((line) => (
              <li key={line}><span className="tick"><CheckCircleIcon size={15} /></span>{line}</li>
            ))}
          </ul>
          <p className="company-picker-aside-foot">
            {active.length} {active.length === 1 ? 'company' : 'companies'}{s.tenant ? ` · ${s.tenant.name}` : ''}{s.plan ? ` · ${s.plan.name}` : ''}
          </p>
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
    </Backdrop>
  );
}
