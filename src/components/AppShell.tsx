import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { db, C, nav, session, useCollection, useSession, useRoute, engine } from '../store';
import type { Notification, Period } from '../store';
import { MODULES, GROUP_ORDER, moduleById } from '../modules/registry';
import { BellIcon, SearchIcon, ChevronDownIcon, HelpCircleIcon, CogIcon, LockIcon, XIcon, ArrowLeftIcon, MenuIcon } from './Icons';
import { useIsMobile, useIsTablet } from '../lib/useMedia';
import { Avatar, Badge, Button, Banner, Kbd, TwoLine } from './ui/primitives';
import { Modal } from './ui/overlays';
import { fmtDateTime, fmtMoney, fmtPeriod } from '../lib/format';

interface AppShellProps {
  children: ReactNode;
  fullBleed?: boolean;
}

export default function AppShell({ children, fullBleed }: AppShellProps) {
  const s = useSession();
  const route = useRoute();
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [sidebarCompanyOpen, setSidebarCompanyOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1440);
  const [railPinned, setRailPinned] = useState<boolean | null>(() => { try { const v = localStorage.getItem('eb-sidebar'); return v === null ? null : v === 'expanded'; } catch { return null; } });
  const isMobile = useIsMobile();
  // below the laptop breakpoint the company/branch/period controls move to a strip under the header
  const compact = useIsTablet();
  const [navOpen, setNavOpen] = useState(false);
  // on phones the sidebar is an off-canvas drawer and always shows labels
  const collapsed = isMobile ? false : railPinned === null ? narrow : !railPinned;
  const notifications = useCollection<Notification>(C.notifications);
  const myNotifs = notifications.filter((n) => !n.userId || n.userId === s.user?.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = myNotifs.filter((n) => !n.read).length;
  const pendingApprovals = useCollection(C.approvals).filter((a: any) => a.status === 'Pending' && engine.canActOnApproval(a as any).ok).length;

  const visibleModules = useMemo(() => MODULES.filter((m) => {
    if (m.platformOnly) return s.isPlatformAdmin;
    if (!s.entitled(m.id)) return false;
    if (m.profiles && s.profiles.length && !m.profiles.some((p) => s.profiles.includes(p))) return false;
    if (m.permission && !s.canModule(m.permission)) return false;
    return true;
  }), [s]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      else if (e.key === '?' && !typing(e) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setHelpOpen((v) => !v); }
      else if (e.key === 'Escape') { setHelpOpen(false); setSearchOpen(false); }
    };
    const r = () => setNarrow(window.innerWidth < 1440);
    document.addEventListener('keydown', h);
    window.addEventListener('resize', r);
    return () => { document.removeEventListener('keydown', h); window.removeEventListener('resize', r); };
  }, []);
  useEffect(() => { setNavOpen(false); }, [route.path, isMobile]);
  useEffect(() => {
    if (!isMobile || !navOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isMobile, navOpen]);
  const toggleRail = () => { const next = collapsed; setRailPinned(next); try { localStorage.setItem('eb-sidebar', next ? 'expanded' : 'collapsed'); } catch { /* ignore */ } };

  const mod = moduleById(route.module);
  const crumbs = [mod?.group ? mod.group.charAt(0) + mod.group.slice(1).toLowerCase() : 'Workspace', mod?.label ?? route.module, ...(route.sub ? [route.sub.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())] : []), ...(route.params.crumb ? [route.params.crumb] : [])];
  const periodTone = s.period?.status === 'Open' ? { bg: '#E0F9EC', fg: '#12784E' } : s.period?.status === 'Locked' ? { bg: '#E7E9EB', fg: '#3C4043' } : { bg: '#FEF4EC', fg: '#8A4B0F' };
  const isWin = typeof navigator !== 'undefined' && /Win/.test(navigator.platform);

  // company · branch · FY · period — in the header on desktop, in a scrollable strip under it on phones
  const contextControls = (
    <>
            {s.companies.length > 0 && (
              <span style={{ position: 'relative' }}>
                <button type="button" className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }} onClick={() => setCompanyOpen(!companyOpen)}>
                  <span style={{ maxWidth: compact ? 150 : undefined, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.company?.legalName ?? 'Select company'}</span> <ChevronDownIcon size={12} />
                </button>
                {companyOpen && (
                  <Dropdown onClose={() => setCompanyOpen(false)} sheet={compact}>
                    <div className="section-label" style={{ padding: '6px 10px' }}>Switch company</div>
                    {s.companies.map((c) => (
                      <button key={c.id} type="button" className="menu-item" style={{ height: 'auto', padding: '6px 10px', background: c.id === s.company?.id ? '#F2F5FF' : undefined }} onClick={() => { session.switchCompany(c.id); setCompanyOpen(false); nav.go('home'); }}>
                        <TwoLine primary={c.legalName} secondary={`${c.country} · ${c.baseCurrency} · ${c.nature}`} />
                      </button>
                    ))}
                    {s.isTenantOwner && (<><div className="menu-sep" /><button type="button" className="menu-item" style={{ color: '#325CFF' }} onClick={() => { setCompanyOpen(false); nav.go('admin/companies'); }}>+ Add company</button></>)}
                  </Dropdown>
                )}
              </span>
            )}
            {s.branches.length > 1 && (
              <span style={{ position: 'relative' }}>
                <button type="button" className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }} onClick={() => setBranchOpen(!branchOpen)}>
                  {s.branch?.name ?? 'Branch'} <ChevronDownIcon size={12} />
                </button>
                {branchOpen && (
                  <Dropdown onClose={() => setBranchOpen(false)} sheet={compact}>
                    {s.branches.map((b) => (
                      <button key={b.id} type="button" className="menu-item" style={{ background: b.id === s.branch?.id ? '#F2F5FF' : undefined }} onClick={() => { session.setBranch(b.id); setBranchOpen(false); }}>
                        {b.name} <span style={{ color: '#B0B5BF', fontSize: 11, marginLeft: 'auto' }}>{b.type}</span>
                      </button>
                    ))}
                  </Dropdown>
                )}
              </span>
            )}
            <span style={{ padding: '2px 8px', background: '#F3F5F5', borderRadius: 9999, fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>FY {s.state.fy ?? '—'}</span>
            <span style={{ position: 'relative' }}>
              <button type="button" onClick={() => setPeriodOpen(!periodOpen)} style={{ padding: '2px 8px', background: periodTone.bg, borderRadius: 9999, fontSize: 12, color: periodTone.fg, display: 'flex', alignItems: 'center', gap: 5, fontFeatureSettings: 'normal', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                {s.period?.status === 'Locked' ? <LockIcon size={10} /> : <span style={{ width: 6, height: 6, borderRadius: '50%', background: periodTone.fg, display: 'inline-block' }} />}
                {s.period?.label ?? fmtPeriod(s.state.periodCode)}
              </button>
              {periodOpen && (
                <Dropdown onClose={() => setPeriodOpen(false)} sheet={compact}>
                  <div className="section-label" style={{ padding: '6px 10px' }}>Periods · {s.state.fy}</div>
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {s.periods.map((p: Period) => (
                      <button key={p.id} type="button" className="menu-item" style={{ background: p.code === s.period?.code ? '#F2F5FF' : undefined }} onClick={() => { session.setPeriod(p.code); setPeriodOpen(false); }}>
                        <span style={{ flex: 1 }}>{p.label}</span>
                        <Badge status={p.status} />
                      </button>
                    ))}
                  </div>
                  <div className="menu-sep" />
                  <button type="button" className="menu-item" style={{ color: '#325CFF' }} onClick={() => { setPeriodOpen(false); nav.go('admin/periods'); }}>Manage periods →</button>
                </Dropdown>
              )}
            </span>
    </>
  );

  if (fullBleed) {
    return (
      <div style={{ height: '100%', background: '#F7F7F7', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    );
  }

  return (
    <div className="shell">
      {isMobile && navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
      {/* Sidebar — fixed rail on desktop/tablet, off-canvas drawer on phones */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${navOpen ? 'open' : ''}`} aria-label="Sidebar" aria-hidden={isMobile && !navOpen ? true : undefined}>
        <div style={{ padding: collapsed ? '14px 0 12px' : '14px 16px 12px', borderBottom: '1px solid #EFEFEF', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : undefined, gap: 10, cursor: 'pointer', position: 'relative' }} onClick={() => setSidebarCompanyOpen(!sidebarCompanyOpen)} title={collapsed ? `${s.tenant?.name ?? ''} · ${s.company?.legalName ?? ''} — switch company` : 'Switch company'}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: s.company?.brandColor ?? '#325CFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#fff', fontWeight: 700 }}>
            {s.company?.logoText ?? 'E'}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="cell-secondary" style={{ marginBottom: 1 }}>{s.tenant?.name ?? 'Elixir Books'}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="cell-primary" style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.company?.legalName ?? '—'}</span>
                <ChevronDownIcon size={12} />
              </div>
            </div>
          )}
          {isMobile && <button type="button" className="btn-icon" aria-label="Close navigation" onClick={(e) => { e.stopPropagation(); setNavOpen(false); }}><XIcon size={16} /></button>}
          {sidebarCompanyOpen && (
            <div onClick={(e) => e.stopPropagation()}>
              <Dropdown onClose={() => setSidebarCompanyOpen(false)} width={260} align="left" top={collapsed ? 56 : undefined} sheet={isMobile}>
                <div className="section-label" style={{ padding: '6px 10px' }}>Switch company</div>
                {s.companies.map((c) => (
                  <button key={c.id} type="button" className="menu-item" style={{ height: 'auto', padding: '6px 10px', background: c.id === s.company?.id ? '#F2F5FF' : undefined }} onClick={() => { setSidebarCompanyOpen(false); if (c.id !== s.company?.id) { session.switchCompany(c.id); nav.go('home'); } }}>
                    <TwoLine primary={c.legalName} secondary={`${c.country} · ${c.baseCurrency} · ${c.nature}`} />
                  </button>
                ))}
                {s.companies.length === 0 && <div style={{ padding: '8px 10px', fontSize: 12, color: '#5F6368' }}>No companies</div>}
                {s.isTenantOwner && (<><div className="menu-sep" /><button type="button" className="menu-item" style={{ color: '#325CFF' }} onClick={() => { setSidebarCompanyOpen(false); nav.go('admin/companies'); }}>+ Add company</button></>)}
              </Dropdown>
            </div>
          )}
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px' }}>
          {GROUP_ORDER.map((g) => {
            const items = visibleModules.filter((m) => m.group === g);
            if (!items.length) return null;
            return (
              <div key={g} style={{ marginBottom: 4 }}>
                {collapsed ? <div style={{ height: 1, background: '#F3F3F5', margin: '6px 8px' }} /> : <div className="section-label" style={{ padding: '8px 12px 4px', display: 'block' }}>{g}</div>}
                {items.map((m) => (
                  <button key={m.id} type="button" className={`nav-item ${route.module === m.id ? 'active' : ''}`} title={collapsed ? m.label : undefined} aria-label={m.label} style={{ width: '100%', border: 'none', textAlign: 'left', background: route.module === m.id ? undefined : 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined, position: 'relative' }} onClick={() => nav.go(m.id)}>
                    <m.icon size={16} />
                    {!collapsed && <span style={{ flex: 1 }}>{m.label}</span>}
                    {m.id === 'approvals' && pendingApprovals > 0 && <span style={{ background: '#325CFF', color: '#FFFFFF', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '0 6px', minWidth: 18, textAlign: 'center', lineHeight: '18px', fontFeatureSettings: 'normal', ...(collapsed ? { position: 'absolute' as const, top: 2, right: 4, fontSize: 9, minWidth: 14, lineHeight: '14px', padding: '0 4px' } : {}) }}>{pendingApprovals}</span>}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div style={{ borderTop: '1px solid #EFEFEF', padding: '8px 8px' }}>
          <button type="button" className="nav-item" title="Help & Support" style={{ width: '100%', border: 'none', textAlign: 'left', background: 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined }} onClick={() => nav.go('home/help')}>
            <HelpCircleIcon size={16} />{!collapsed && <span>Help & Support</span>}
          </button>
          <button type="button" className="nav-item" title="Settings" style={{ width: '100%', border: 'none', textAlign: 'left', background: 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined }} onClick={() => nav.go('admin')}>
            <CogIcon size={16} />{!collapsed && <span>Settings</span>}
          </button>
          {!isMobile && <button type="button" className="nav-item" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{ width: '100%', border: 'none', textAlign: 'left', background: 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined, color: '#5F6368' }} onClick={toggleRail}>
            <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(180deg)' : undefined }}><ArrowLeftIcon size={16} /></span>{!collapsed && <span>Collapse</span>}
          </button>}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : undefined, gap: 8, padding: collapsed ? '8px 0' : '8px 12px', borderRadius: 8, marginTop: 4, cursor: 'pointer' }} onClick={() => setUserOpen(true)} title={s.user?.name}>
            <Avatar name={s.user?.name ?? '?'} />
            {!collapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cell-primary" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user?.name}</div>
                  <div className="cell-secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.roles[0]?.name ?? (s.isPlatformAdmin ? 'Platform Admin' : '')}</div>
                </div>
                <ChevronDownIcon size={12} />
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="shell-main">
        <header className="shell-header">
          <button type="button" className="btn-ghost hamburger" style={{ padding: '0 8px' }} aria-label="Open navigation" onClick={() => setNavOpen(true)}><MenuIcon size={18} /></button>
          <div className="crumbs">
            {crumbs.map((crumb, i) => (
              <span key={i} className="crumb" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <span className="crumb-sep" style={{ fontSize: 12, color: '#B0B5BF' }}>›</span>}
                <span style={{ fontSize: 13, fontWeight: i === crumbs.length - 1 ? 500 : 400, color: i === crumbs.length - 1 ? '#0A0A0A' : '#5F6368', fontFeatureSettings: 'normal', cursor: i === 1 ? 'pointer' : undefined }} onClick={() => i === 1 && mod && nav.go(mod.id)}>{crumb}</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {!compact && contextControls}
            {compact ? (
              <button type="button" className="btn-ghost" style={{ padding: '0 8px' }} aria-label="Search" onClick={() => setSearchOpen(true)}><SearchIcon size={16} /></button>
            ) : (
              <button type="button" className="btn-secondary btn-sm" style={{ gap: 6, color: '#5F6368', fontFeatureSettings: 'normal', fontWeight: 400 }} onClick={() => setSearchOpen(true)}>
                <SearchIcon size={13} /> Search <Kbd>{isWin ? 'Ctrl K' : '⌘K'}</Kbd>
              </button>
            )}
            {!compact && (
              <button type="button" className="btn-ghost" style={{ padding: '0 8px' }} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}>
                <HelpCircleIcon size={16} />
              </button>
            )}
            <span style={{ position: 'relative' }}>
              <button type="button" className="btn-ghost" style={{ padding: '0 8px', position: 'relative' }} onClick={() => setNotifOpen(!notifOpen)}>
                <BellIcon size={16} />
                {unread > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', background: '#325CFF', color: '#fff', borderRadius: 9999, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid #F9FBFC' }}>{unread}</span>}
              </button>
              {notifOpen && (
                <Dropdown onClose={() => setNotifOpen(false)} width={380} sheet={compact}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px' }}>
                    <span className="section-label">Notifications</span>
                    {unread > 0 && <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => myNotifs.filter((n) => !n.read).forEach((n) => db.patchSilent<Notification>(C.notifications, n.id, { read: true }))}>Mark all read</button>}
                  </div>
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    {myNotifs.length === 0 && <div style={{ padding: 16, fontSize: 13, color: '#5F6368' }}>You're all caught up.</div>}
                    {myNotifs.slice(0, 30).map((n) => (
                      <button key={n.id} type="button" className="menu-item" style={{ height: 'auto', padding: '8px 10px', alignItems: 'flex-start', background: n.read ? undefined : '#F9FBFC' }} onClick={() => { db.patchSilent<Notification>(C.notifications, n.id, { read: true }); setNotifOpen(false); if (n.link) nav.go(n.link); }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'transparent' : '#325CFF', marginTop: 6, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, whiteSpace: 'normal' }}>{n.title}</div>
                          {n.body && <div style={{ fontSize: 12, color: '#5F6368', whiteSpace: 'normal' }}>{n.body}</div>}
                          <div style={{ fontSize: 11, color: '#B0B5BF', marginTop: 2 }}>{n.type} · {fmtDateTime(n.at)}{n.status && n.status !== 'delivered' ? ` · ${n.status}` : ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </Dropdown>
              )}
            </span>
            <span onClick={() => setUserOpen(true)} style={{ cursor: 'pointer' }}><Avatar name={s.user?.name ?? '?'} /></span>
          </div>
        </header>
        {compact && <div className="shell-context">{contextControls}</div>}
        {s.state.loginBanner && <Banner tone="success" full onDismiss={() => session.dismissBanner()}>{s.state.loginBanner}</Banner>}
        {s.tenant && (s.tenant.subscriptionState === 'Grace' || s.tenant.subscriptionState === 'Suspended' || s.tenant.subscriptionState === 'Trial') && s.isTenantOwner && (
          <Banner tone={s.tenant.subscriptionState === 'Suspended' ? 'danger' : 'warning'} full action={<Button variant="link" onClick={() => nav.go('admin/plan')}>Plan & usage</Button>}>
            {s.tenant.subscriptionState === 'Trial' ? `Trial ends ${s.tenant.trialEndsAt} — upgrade to keep full access.` : s.tenant.subscriptionState === 'Grace' ? `Payment overdue — grace period ends ${s.tenant.graceUntil}. Some modules will be suspended after that.` : 'Subscription suspended — modules are read-only until payment is received.'}
          </Banner>
        )}
        <main style={{ flex: 1, overflow: 'auto' }}>{children}</main>
      </div>

      {userOpen && (
        <Modal open onClose={() => setUserOpen(false)} title={s.user?.name ?? ''} description={s.user?.email} width={420}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
            <div className="kv">
              <span className="k">Roles</span><span className="v">{s.roles.map((r) => r.name).join(', ') || (s.isPlatformAdmin ? 'Platform Admin' : '—')}</span>
              <span className="k">Companies</span><span className="v">{s.companies.map((c) => c.tradeName).join(', ')}</span>
              <span className="k">MFA</span><span className="v">{s.user?.mfaEnabled ? 'Enabled' : 'Not enabled'}</span>
              {s.isTenantOwner && s.plan && <><span className="k">Plan</span><span className="v">{s.plan.name} · {s.tenant?.subscriptionState}{s.tenant?.renewsAt ? ` · renews ${s.tenant.renewsAt}` : ''}</span></>}
            </div>
            <div>
              <div className="section-label" style={{ marginBottom: 6 }}>Active sessions</div>
              {(s.user?.sessions ?? []).map((ss) => (
                <div key={ss.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <span>{ss.device}{ss.current ? ' · this device' : ''}</span>
                  <span style={{ color: '#5F6368' }}>{fmtDateTime(ss.at)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => { setUserOpen(false); nav.go(`admin/users/${s.user?.id}`); }}>Profile & security</Button>
              <Button variant="danger" onClick={() => { setUserOpen(false); session.logout(); }}>Sign out</Button>
            </div>
          </div>
        </Modal>
      )}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {helpOpen && (
        <Modal open onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" description="Press ? anywhere to toggle this list." width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[[`${isWin ? 'Ctrl' : '⌘'} K`, 'Global search — documents, parties, items, menu'], ['?', 'Show / hide keyboard shortcuts'], ['Esc', 'Close drawer, dialog or menu'], ['↑ ↓ Enter', 'Move and pick in lists and pickers'], ['Tab', 'Next field; in a line grid moves across the row'], ['Enter', 'Confirm the primary action in a form']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #F5F5F5' }}><span style={{ color: '#5F6368' }}>{v}</span><span style={{ display: 'flex', gap: 4 }}>{k.split(' ').map((x, i) => <Kbd key={i}>{x}</Kbd>)}</span></div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
              <Button variant="secondary" onClick={() => { setHelpOpen(false); nav.go('home/help'); }}>Help & Support</Button>
              <Button variant="primary" onClick={() => setHelpOpen(false)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Dropdown({ children, onClose, width = 260, align = 'right', top, sheet }: { children: ReactNode; onClose: () => void; width?: number; align?: 'left' | 'right'; top?: number; sheet?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setTimeout(onClose, 0); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  if (sheet) return <div ref={ref} className="menu mobile-sheet" style={{ zIndex: 60 }}>{children}</div>;
  return <div ref={ref} className="menu" style={{ [align === 'left' ? 'left' : 'right']: align === 'left' ? 8 : 0, top: top ?? '100%', marginTop: 4, width, zIndex: 60 }}>{children}</div>;
}

// ── Global search (⌘K) ────────────────────────────────────────────────────

const DOC_SOURCES: { col: string; label: string; path: (r: any) => string; secondary: (r: any) => string }[] = [
  { col: C.salesInvoices, label: 'Sales invoice', path: (r) => `sales/invoices/${r.id}`, secondary: (r) => `${r.partyName ?? ''} · ${fmtMoney(r.totals?.total ?? 0, r.currency)}` },
  { col: C.quotations, label: 'Quotation', path: (r) => `sales/quotations/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.salesOrders, label: 'Sales order', path: (r) => `sales/orders/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.deliveries, label: 'Delivery', path: (r) => `sales/deliveries/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.creditNotes, label: 'Credit note', path: (r) => `sales/credit-notes/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.receipts, label: 'Receipt', path: (r) => `sales/receipts/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.purchaseOrders, label: 'Purchase order', path: (r) => `purchase/orders/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.grns, label: 'GRN', path: (r) => `purchase/grn/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.vendorInvoices, label: 'Vendor invoice', path: (r) => `purchase/vendor-invoices/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.payments, label: 'Payment', path: (r) => `purchase/payments/${r.id}`, secondary: (r) => r.partyName ?? '' },
  { col: C.journals, label: 'Journal', path: (r) => `accounting/journals/${r.id}`, secondary: (r) => r.narration ?? '' },
  { col: C.customers, label: 'Customer', path: (r) => `masters/customers/${r.id}`, secondary: (r) => r.gstin ?? r.code },
  { col: C.suppliers, label: 'Supplier', path: (r) => `masters/suppliers/${r.id}`, secondary: (r) => r.gstin ?? r.code },
  { col: C.items, label: 'Item', path: (r) => `masters/items/${r.id}`, secondary: (r) => r.code },
  { col: C.employees, label: 'Employee', path: (r) => `payroll/employees/${r.id}`, secondary: (r) => r.code },
  { col: C.assets, label: 'Asset', path: (r) => `fixed-assets/register/${r.id}`, secondary: (r) => r.code ?? '' },
  { col: C.projects, label: 'Project', path: (r) => `projects/projects/${r.id}`, secondary: (r) => r.code ?? '' },
  { col: C.productionOrders, label: 'Production order', path: (r) => `production/orders/${r.id}`, secondary: (r) => r.itemName ?? '' },
];

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const s = useSession();
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [] as { label: string; primary: string; secondary: string; path: string }[];
    const out: { label: string; primary: string; secondary: string; path: string }[] = [];
    MODULES.forEach((m) => { if (m.label.toLowerCase().includes(term) && s.entitled(m.id)) out.push({ label: 'Menu', primary: m.label, secondary: m.description, path: m.id }); });
    DOC_SOURCES.forEach((src) => {
      db.get<any>(src.col).forEach((r) => {
        if (r.companyId && r.companyId !== s.state.companyId) return;
        const hay = `${r.number ?? ''} ${r.name ?? ''} ${r.code ?? ''} ${r.partyName ?? ''} ${r.gstin ?? ''} ${r.reference ?? ''}`.toLowerCase();
        if (hay.includes(term)) out.push({ label: src.label, primary: r.number ?? r.name ?? r.code, secondary: src.secondary(r), path: src.path(r) });
      });
    });
    return out.slice(0, 25);
  }, [q, s]);
  const [hi, setHi] = useState(0);
  return (
    <Modal open onClose={onClose} title="Search" width={640}>
      <div className="search-input" style={{ height: 44 }}>
        <SearchIcon size={16} />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Documents, parties, items, menu…" style={{ fontSize: 15 }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setHi((h) => Math.min(results.length - 1, h + 1));
            if (e.key === 'ArrowUp') setHi((h) => Math.max(0, h - 1));
            if (e.key === 'Enter' && results[hi]) { nav.go(results[hi].path); onClose(); }
          }} />
        <button type="button" className="btn-icon" onClick={onClose}><XIcon size={14} /></button>
      </div>
      <div style={{ marginTop: 8, maxHeight: 400, overflow: 'auto' }}>
        {!q && <div style={{ fontSize: 12, color: '#5F6368', padding: 12 }}>Searches documents, parties, items and menu items within {s.company?.tradeName}. Use ↑↓ and Enter.</div>}
        {q && results.length === 0 && <div style={{ fontSize: 13, color: '#5F6368', padding: 12 }}>No results for "{q}"</div>}
        {results.map((r, i) => (
          <button key={i} type="button" className="menu-item" style={{ height: 'auto', padding: '8px 10px', background: hi === i ? '#F3F5F7' : undefined }} onMouseEnter={() => setHi(i)} onClick={() => { nav.go(r.path); onClose(); }}>
            <span style={{ fontSize: 11, color: '#5F6368', width: 110, flexShrink: 0 }}>{r.label}</span>
            <TwoLine primary={r.primary} secondary={r.secondary} />
          </button>
        ))}
      </div>
    </Modal>
  );
}
