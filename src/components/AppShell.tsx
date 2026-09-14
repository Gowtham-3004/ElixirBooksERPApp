import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { db, C, nav, session, useCollection, useSession, useRoute, engine, usePrefs } from '../store';
import type { Notification, Period } from '../store';
import { MODULES, GROUP_ORDER, SIDEBAR_GROUPS, moduleById, visibleModuleIds } from '../modules/registry';
import { activeSubNav, useSubNavs, type SubNavItem } from '../modules/subnav';
import { SETUP_MODULES, rememberSetupReturn, useSetupSections } from '../modules/setup/sections';
import { lixi, useLixi } from '../store/lixi';
import LixiPanel from './lixi/LixiPanel';
import LixiMark from './lixi/LixiMark';
import { BellIcon, SearchIcon, ChevronDownIcon, HelpCircleIcon, CogIcon, LockIcon, XIcon, ArrowLeftIcon, MenuIcon, UsersIcon, PackageIcon, UserIcon, BookOpenIcon, CreditCardIcon, FileTextIcon, PlusIcon, ArrowRightIcon, ArrowsSwapIcon, LogOutIcon } from './Icons';
import type { ComponentType } from 'react';
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
  const [branchOpen, setBranchOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1440);
  const [railPinned, setRailPinned] = useState<boolean | null>(() => { try { const v = localStorage.getItem('eb-sidebar'); return v === null ? null : v === 'expanded'; } catch { return null; } });
  // display density — read by CSS through data-density on the shell root ([data-density="compact"] rules in index.css)
  const { density } = usePrefs();
  const lixiOpen = useLixi().open;
  const isMobile = useIsMobile();
  // below the laptop breakpoint the company/branch/period controls move to a strip under the header
  const compact = useIsTablet();
  const [navOpen, setNavOpen] = useState(false);
  // module sub-pages open as a flyout beside the sidebar item — hover peeks, click pins (phones expand inline)
  const subNavs = useSubNavs();
  const [flyout, setFlyout] = useState<{ id: string; pinned: boolean; anchor: DOMRect } | null>(null);
  const flyoutTimer = useRef<number | undefined>(undefined);
  // on phones the sidebar is an off-canvas drawer and always shows labels
  const collapsed = isMobile ? false : railPinned === null ? narrow : !railPinned;
  const notifications = useCollection<Notification>(C.notifications);
  const myNotifs = notifications.filter((n) => !n.userId || n.userId === s.user?.id).sort((a, b) => b.at.localeCompare(a.at));
  const unread = myNotifs.filter((n) => !n.read).length;
  const pendingApprovals = useCollection(C.approvals).filter((a: any) => a.status === 'Pending' && engine.canActOnApproval(a as any).ok).length;

  const visibleModules = useMemo(() => { const ids = visibleModuleIds(s); return MODULES.filter((m) => ids.includes(m.id)); }, [s]);

  // inside Setup (the hub, company admin, masters, platform) the sidebar shows the settings tree instead of the app nav
  const setupMode = SETUP_MODULES.has(route.module);
  const setupSections = useSetupSections();
  const lastAppPath = useRef(route.path);
  useEffect(() => {
    if (setupMode) rememberSetupReturn(lastAppPath.current); else lastAppPath.current = route.path;
  }, [setupMode, route.path]);

  // one sidebar entry; with sub-pages it opens a flyout (hover peeks, click pins; phones expand inline), without them it navigates
  const sidebarEntry = (key: string, label: string, Icon: ComponentType<{ size?: number }>, o: { items: SubNavItem[]; active: boolean; activeId?: string; go: (id: string) => void; fallback?: () => void; badge?: number }) => {
    const hasSub = o.items.length > 0;
    const open = flyout?.id === key;
    const anchorOf = (e: { currentTarget: HTMLElement }) => e.currentTarget.getBoundingClientRect();
    // hover only for a real mouse — touch fires enter/leave around the tap and would fight the click toggle
    const peek = (e: PointerEvent<HTMLDivElement>) => {
      if (!hasSub || isMobile || e.pointerType !== 'mouse') return;
      window.clearTimeout(flyoutTimer.current);
      const anchor = anchorOf(e);
      setFlyout((f) => (f?.id === key ? f : { id: key, pinned: false, anchor }));
    };
    const unpeek = (e: PointerEvent<HTMLDivElement>) => {
      if (!hasSub || isMobile || e.pointerType !== 'mouse') return;
      window.clearTimeout(flyoutTimer.current);
      flyoutTimer.current = window.setTimeout(() => setFlyout((f) => (f?.id === key && !f.pinned ? null : f)), 150);
    };
    const toggle = (e: { currentTarget: HTMLElement }) => {
      if (!hasSub) { o.fallback?.(); return; }
      const anchor = anchorOf(e);
      setFlyout((f) => (f?.id === key && f.pinned ? null : { id: key, pinned: true, anchor }));
    };
    return (
      <div key={key} data-flyout={key} onPointerEnter={peek} onPointerLeave={unpeek}>
        <button type="button" className={`nav-item ${o.active ? 'active' : ''}`} title={collapsed && !hasSub ? label : undefined} aria-label={label} aria-haspopup={hasSub ? 'menu' : undefined} aria-expanded={hasSub ? open : undefined} style={{ width: '100%', border: 'none', textAlign: 'left', background: o.active ? undefined : 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined, position: 'relative' }} onClick={toggle}>
          <Icon size={16} />
          {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
          {!!o.badge && <span style={{ background: 'var(--accent)', color: '#FFFFFF', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '0 6px', minWidth: 18, textAlign: 'center', lineHeight: '18px', fontVariantNumeric: 'normal', ...(collapsed ? { position: 'absolute' as const, top: 2, right: 4, fontSize: 9, minWidth: 14, lineHeight: '14px', padding: '0 4px' } : {}) }}>{o.badge}</span>}
          {!collapsed && hasSub && <span style={{ display: 'inline-flex', color: 'var(--ink-5)', transform: isMobile ? (open ? 'rotate(180deg)' : undefined) : 'rotate(-90deg)' }}><ChevronDownIcon size={12} /></span>}
        </button>
        {open && flyout && (isMobile
          ? <SubNavList items={o.items} activeId={o.activeId} onPick={o.go} inline />
          : <ModuleFlyout label={label} anchor={flyout.anchor} items={o.items} activeId={o.activeId} onPick={(id) => { setFlyout(null); o.go(id); }} />)}
      </div>
    );
  };

  useEffect(() => {
    const typing = (e: KeyboardEvent) => { const t = e.target as HTMLElement | null; return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable); };
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(true); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') { e.preventDefault(); lixi.toggle(); }
      else if (e.key === '?' && !typing(e) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setHelpOpen((v) => !v); }
      else if (e.key === 'Escape') { setHelpOpen(false); setSearchOpen(false); }
    };
    const r = () => setNarrow(window.innerWidth < 1440);
    document.addEventListener('keydown', h);
    window.addEventListener('resize', r);
    return () => { document.removeEventListener('keydown', h); window.removeEventListener('resize', r); };
  }, []);
  useEffect(() => { setNavOpen(false); setFlyout(null); }, [route.path, isMobile]);
  useEffect(() => () => window.clearTimeout(flyoutTimer.current), []);
  useEffect(() => {
    if (!flyout?.pinned) return;
    const onDown = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest(`[data-flyout="${flyout.id}"]`)) setFlyout(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlyout(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [flyout]);
  useEffect(() => {
    if (!isMobile || !navOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isMobile, navOpen]);
  const toggleRail = () => { const next = collapsed; setRailPinned(next); try { localStorage.setItem('eb-sidebar', next ? 'expanded' : 'collapsed'); } catch { /* ignore */ } };

  const mod = moduleById(route.module);
  const subCrumb = route.sub ? [route.sub.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())] : [];
  const crumbs = setupMode
    ? ['Setup', route.module === 'setup' ? (route.sub === 'preferences' ? 'User preferences' : 'All settings') : (mod?.label ?? route.module), ...(route.module === 'setup' ? [] : subCrumb), ...(route.params.crumb ? [route.params.crumb] : [])]
    : [mod?.group ? mod.group.charAt(0) + mod.group.slice(1).toLowerCase() : 'Workspace', mod?.label ?? route.module, ...subCrumb, ...(route.params.crumb ? [route.params.crumb] : [])];
  const periodTone = s.period?.status === 'Open' ? { bg: 'var(--good-bg)', fg: 'var(--good)' } : s.period?.status === 'Locked' ? { bg: 'var(--neutral-bg)', fg: 'var(--ink-2)' } : { bg: 'var(--warn-bg)', fg: 'var(--warn)' };
  const isWin = typeof navigator !== 'undefined' && /Win/.test(navigator.platform);

  // branch · FY · period — in the header on desktop, in a scrollable strip under it on phones
  const contextControls = (
    <div className="ctx-group">
            {s.branches.length > 1 && (
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <button type="button" className="ctx-item" onClick={() => setBranchOpen(!branchOpen)}>
                  {s.branch?.name ?? 'Branch'} <ChevronDownIcon size={12} />
                </button>
                {branchOpen && (
                  <Dropdown onClose={() => setBranchOpen(false)} sheet={compact}>
                    {s.branches.map((b) => (
                      <button key={b.id} type="button" className="menu-item" style={{ background: b.id === s.branch?.id ? 'var(--accent-soft)' : undefined }} onClick={() => { session.setBranch(b.id); setBranchOpen(false); }}>
                        {b.name} <span style={{ color: 'var(--ink-5)', fontSize: 11, marginLeft: 'auto' }}>{b.type}</span>
                      </button>
                    ))}
                  </Dropdown>
                )}
              </span>
            )}
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <button type="button" className="ctx-item" onClick={() => setFyOpen(!fyOpen)}>FY {s.state.fy ?? '—'} <ChevronDownIcon size={12} /></button>
              {fyOpen && (
                <Dropdown onClose={() => setFyOpen(false)} sheet={compact} width={220}>
                  <div className="section-label" style={{ padding: '6px 10px' }}>Fiscal year</div>
                  {Array.from(new Set(s.periods.map((p: Period) => p.fy))).sort().reverse().map((fy) => {
                    const ps = s.periods.filter((p: Period) => p.fy === fy);
                    const open = ps.filter((p: Period) => p.status === 'Open' || p.status === 'Reopened').length;
                    return (
                      <button key={fy} type="button" className="menu-item" style={{ background: fy === s.state.fy ? 'var(--accent-soft)' : undefined }} onClick={() => { session.setFy(fy); setFyOpen(false); }}>
                        <span style={{ flex: 1 }}>FY {fy}</span>
                        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{open ? `${open} open` : 'closed'}</span>
                      </button>
                    );
                  })}
                </Dropdown>
              )}
            </span>
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <button type="button" className="ctx-item" onClick={() => setPeriodOpen(!periodOpen)}>
                {s.period?.status === 'Locked' ? <LockIcon size={11} /> : <span className="ctx-dot" style={{ background: periodTone.fg }} />}
                {s.period?.label ?? fmtPeriod(s.state.periodCode)} <ChevronDownIcon size={12} />
              </button>
              {periodOpen && (
                <Dropdown onClose={() => setPeriodOpen(false)} sheet={compact}>
                  <div className="section-label" style={{ padding: '6px 10px' }}>Periods · {s.state.fy}</div>
                  <div style={{ maxHeight: 300, overflow: 'auto' }}>
                    {s.periods.map((p: Period) => (
                      <button key={p.id} type="button" className="menu-item" style={{ background: p.code === s.period?.code ? 'var(--accent-soft)' : undefined }} onClick={() => { session.setPeriod(p.code); setPeriodOpen(false); }}>
                        <span style={{ flex: 1 }}>{p.label}</span>
                        <Badge status={p.status} />
                      </button>
                    ))}
                  </div>
                  <div className="menu-sep" />
                  <button type="button" className="menu-item" style={{ color: 'var(--accent)' }} onClick={() => { setPeriodOpen(false); nav.go('admin/periods'); }}>Manage periods →</button>
                </Dropdown>
              )}
            </span>
    </div>
  );

  if (fullBleed) {
    return (
      <div data-density={density} style={{ height: '100%', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    );
  }

  return (
    <div className={`shell ${lixiOpen ? 'lixi-open' : ''}`} data-density={density}>
      {isMobile && navOpen && <div className="sidebar-scrim" onClick={() => setNavOpen(false)} />}
      {/* Sidebar — fixed rail on desktop/tablet, off-canvas drawer on phones */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${navOpen ? 'open' : ''}`} aria-label="Sidebar" aria-hidden={isMobile && !navOpen ? true : undefined}>
        {/* company block — the sidebar's header; opens the full-screen company picker */}
        <button type="button" className="sidebar-company" onClick={() => session.openCompanyPicker()} title={collapsed ? `${s.company?.tradeName ?? s.company?.legalName ?? ''} · ${s.tenant?.name ?? ''} — switch company` : 'Switch company'}>
          <div style={{ width: 28, height: 28, borderRadius: 7, background: `color-mix(in srgb, ${s.company?.brandColor ?? 'var(--accent)'} 14%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: s.company?.brandColor ?? 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
            {s.company?.logoText ?? 'E'}
          </div>
          {!collapsed && (
            <>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="cell-primary" style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{s.company?.tradeName ?? s.company?.legalName ?? '—'}</div>
                <div className="cell-secondary" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{s.tenant?.name ?? ''}</div>
              </div>
              <span style={{ display: 'inline-flex', color: 'var(--ink-5)' }}><ArrowsSwapIcon size={13} /></span>
            </>
          )}
          {isMobile && <span role="button" className="btn-icon" aria-label="Close navigation" style={{ marginLeft: 4 }} onClick={(e) => { e.stopPropagation(); setNavOpen(false); }}><XIcon size={16} /></span>}
        </button>
        <nav className="sidebar-nav" onScroll={() => setFlyout((f) => (f && !isMobile ? null : f))}>
          {setupMode ? (
            <>
              <button type="button" className={`nav-item ${route.path === 'setup' ? 'active' : ''}`} title="All settings" style={{ width: '100%', border: 'none', textAlign: 'left', background: route.path === 'setup' ? undefined : 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined, marginBottom: 4 }} onClick={() => nav.go('setup')}>
                <ArrowLeftIcon size={16} />{!collapsed && <span>All settings</span>}
              </button>
              {setupSections.map((sec) => (
                <div key={sec.id} className="nav-group">
                  {!collapsed && <div className="section-label">{({ organization: 'Organization', modules: 'Modules', developer: 'Extensions & data' } as Record<string, string>)[sec.id] ?? sec.title}</div>}
                  {sec.cards.map((card) => {
                    const here = (id: string) => route.path === id || route.path.startsWith(`${id}/`);
                    const items: SubNavItem[] = card.links.map((l) => ({ id: l.id, label: l.label }));
                    return sidebarEntry(`setup:${card.id}`, card.title, card.icon, { items, active: card.links.some((l) => here(l.id)), activeId: card.links.find((l) => here(l.id))?.id, go: (id) => nav.go(id) });
                  })}
                </div>
              ))}
            </>
          ) : GROUP_ORDER.filter((g) => SIDEBAR_GROUPS.includes(g)).map((g) => {
            const items = visibleModules.filter((m) => m.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="nav-group">
                {!collapsed && <div className="section-label">{g.charAt(0) + g.slice(1).toLowerCase()}</div>}
                {items.map((m) => {
                  const subItems = (subNavs[m.id] ?? []).filter((i) => !i.hidden);
                  return sidebarEntry(m.id, m.label, m.icon, { items: subItems, active: route.module === m.id, activeId: activeSubNav(route, m.id, subItems), go: (id) => nav.go(`${m.id}/${id}`), fallback: () => nav.go(m.id), badge: m.id === 'approvals' ? pendingApprovals : 0 });
                })}
              </div>
            );
          })}
          <div style={{ height: 28 }} />
          <div className="sidebar-fade" />
        </nav>
        <div style={{ borderTop: '1px solid var(--hairline)', padding: '8px 8px' }}>
          <button type="button" className="nav-item" title="Help & Support" style={{ width: '100%', border: 'none', textAlign: 'left', background: 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined }} onClick={() => nav.go('home/help')}>
            <HelpCircleIcon size={16} />{!collapsed && <span>Help & Support</span>}
          </button>
          {!isMobile && <button type="button" className="nav-item" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} style={{ width: '100%', border: 'none', textAlign: 'left', background: 'transparent', justifyContent: collapsed ? 'center' : undefined, padding: collapsed ? 0 : undefined, color: 'var(--ink-3)' }} onClick={toggleRail}>
            <span style={{ display: 'inline-flex', transform: collapsed ? 'rotate(180deg)' : undefined }}><ArrowLeftIcon size={16} /></span>{!collapsed && <span>Collapse</span>}
          </button>}
          <div className="sidebar-user">
            <div role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={userOpen} style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : undefined, gap: 8, padding: collapsed ? '8px 0' : '8px 12px', borderRadius: 8, marginTop: 4, cursor: 'pointer', background: userOpen ? 'var(--hover)' : undefined }} onClick={() => setUserOpen((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setUserOpen((v) => !v); } }} title={s.user?.name}>
              <Avatar name={s.user?.name ?? '?'} tone="neutral" />
              {!collapsed && (
                <>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cell-primary" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user?.name}</div>
                    <div className="cell-secondary" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.roles[0]?.name ?? (s.isPlatformAdmin ? 'Platform Admin' : '')}</div>
                  </div>
                  <span style={{ display: 'inline-flex', transform: userOpen ? 'rotate(180deg)' : undefined, color: 'var(--ink-5)' }}><ChevronDownIcon size={12} /></span>
                </>
              )}
            </div>
            {userOpen && (
              <div onClick={(e) => e.stopPropagation()}>
                <Dropdown onClose={() => setUserOpen(false)} width={236} align="left" placement="up" sheet={isMobile}>
                  <div style={{ padding: '8px 10px 6px' }}><TwoLine primary={s.user?.name ?? ''} secondary={s.user?.email ?? ''} /></div>
                  <div className="menu-sep" />
                  <button type="button" className="menu-item" onClick={() => { setUserOpen(false); nav.go('setup'); }}><CogIcon size={15} /> Setup</button>
                  <button type="button" className="menu-item" onClick={() => { setUserOpen(false); nav.go(`admin/users/${s.user?.id}`); }}><UserIcon size={15} /> Profile & security</button>
                  <div className="menu-sep" />
                  <button type="button" className="menu-item" style={{ color: 'var(--danger)' }} onClick={() => { setUserOpen(false); session.logout(); }}><LogOutIcon size={15} /> Sign out</button>
                </Dropdown>
              </div>
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
                {i > 0 && <span className="crumb-sep" style={{ fontSize: 12, color: 'var(--ink-5)' }}>›</span>}
                <span style={{ fontSize: 13, fontWeight: i === crumbs.length - 1 ? 500 : 400, color: i === crumbs.length - 1 ? 'var(--ink)' : 'var(--ink-3)', fontVariantNumeric: 'normal', cursor: i === 1 || (setupMode && i === 0) ? 'pointer' : undefined }} onClick={() => { if (setupMode && i === 0) nav.go('setup'); else if (i === 1 && mod) nav.go(mod.id); }}>{crumb}</span>
              </span>
            ))}
          </div>
          {!compact && (
            <button type="button" className="btn-secondary btn-sm shell-search" onClick={() => setSearchOpen(true)}>
              <SearchIcon size={13} /> <span style={{ flex: 1, textAlign: 'left' }}>Search</span> <Kbd>{isWin ? 'Ctrl K' : '⌘K'}</Kbd>
            </button>
          )}
          <div className="shell-header-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {!compact && contextControls}
            {compact && (
              <button type="button" className="btn-ghost" style={{ padding: '0 8px' }} aria-label="Search" onClick={() => setSearchOpen(true)}><SearchIcon size={16} /></button>
            )}
            {!compact && (
              <button type="button" className="btn-ghost" style={{ padding: '0 8px' }} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}>
                <HelpCircleIcon size={16} />
              </button>
            )}
            <span style={{ position: 'relative' }}>
              <button type="button" className="btn-ghost" style={{ padding: '0 8px', position: 'relative' }} onClick={() => setNotifOpen(!notifOpen)}>
                <BellIcon size={16} />
                {unread > 0 && <span style={{ position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, padding: '0 4px', background: 'var(--accent)', color: '#fff', borderRadius: 9999, fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid var(--surface)' }}>{unread}</span>}
              </button>
              {notifOpen && (
                <Dropdown onClose={() => setNotifOpen(false)} width={380} sheet={compact}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px' }}>
                    <span className="section-label">Notifications</span>
                    {unread > 0 && <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => myNotifs.filter((n) => !n.read).forEach((n) => db.patchSilent<Notification>(C.notifications, n.id, { read: true }))}>Mark all read</button>}
                  </div>
                  <div style={{ maxHeight: 420, overflow: 'auto' }}>
                    {myNotifs.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>You're all caught up.</div>}
                    {myNotifs.slice(0, 30).map((n) => (
                      <button key={n.id} type="button" className="menu-item" style={{ height: 'auto', padding: '8px 10px', alignItems: 'flex-start', background: n.read ? undefined : 'var(--surface-2)' }} onClick={() => { db.patchSilent<Notification>(C.notifications, n.id, { read: true }); setNotifOpen(false); if (n.link) nav.go(n.link); }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: n.read ? 'transparent' : 'var(--accent)', marginTop: 6, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, whiteSpace: 'normal' }}>{n.title}</div>
                          {n.body && <div style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'normal' }}>{n.body}</div>}
                          <div style={{ fontSize: 11, color: 'var(--ink-5)', marginTop: 2 }}>{n.type} · {fmtDateTime(n.at)}{n.status && n.status !== 'delivered' ? ` · ${n.status}` : ''}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </Dropdown>
              )}
            </span>
            <button type="button" className="btn-ghost" style={{ padding: '0 8px', gap: 6, color: lixiOpen ? 'var(--accent)' : undefined, background: lixiOpen ? 'var(--accent-tint)' : undefined }} aria-pressed={lixiOpen} title={`Lixi (${isWin ? 'Ctrl' : '⌘'} J)`} aria-label="Lixi assistant" onClick={() => lixi.toggle()}>
              <LixiMark size={20} />{!compact && <span style={{ fontWeight: 500 }}>Lixi</span>}
            </button>
          </div>
        </header>
        {compact && <div className="shell-context">{contextControls}</div>}
        {s.state.loginBanner && <Banner tone="success" full onDismiss={() => session.dismissBanner()}>{s.state.loginBanner}</Banner>}
        {s.tenant && (s.tenant.subscriptionState === 'Grace' || s.tenant.subscriptionState === 'Suspended' || s.tenant.subscriptionState === 'Trial') && s.isTenantOwner && (
          <Banner tone={s.tenant.subscriptionState === 'Suspended' ? 'danger' : 'warning'} full action={<Button variant="link" onClick={() => nav.go('admin/plan')}>Plan & usage</Button>}>
            {s.tenant.subscriptionState === 'Trial' ? `Trial ends ${s.tenant.trialEndsAt} — upgrade to keep full access.` : s.tenant.subscriptionState === 'Grace' ? `Payment overdue — grace period ends ${s.tenant.graceUntil}. Some modules will be suspended after that.` : 'Subscription suspended — modules are read-only until payment is received.'}
          </Banner>
        )}
        <main style={{ flex: 1, overflow: 'auto' }}><div key={route.path} className="route-enter">{children}</div></main>
      </div>

      <LixiPanel />
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {helpOpen && (
        <Modal open onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" description="Press ? anywhere to toggle this list." width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[[`${isWin ? 'Ctrl' : '⌘'} K`, 'Global search — documents, parties, items, menu'], [`${isWin ? 'Ctrl' : '⌘'} J`, 'Open / close Lixi'], ['?', 'Show / hide keyboard shortcuts'], ['Esc', 'Close drawer, dialog or menu'], ['↑ ↓ Enter', 'Move and pick in lists and pickers'], ['Tab', 'Next field; in a line grid moves across the row'], ['Enter', 'Confirm the primary action in a form']].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--hairline)' }}><span style={{ color: 'var(--ink-3)' }}>{v}</span><span style={{ display: 'flex', gap: 4 }}>{k.split(' ').map((x, i) => <Kbd key={i}>{x}</Kbd>)}</span></div>
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

function Dropdown({ children, onClose, width = 260, align = 'right', top, sheet, placement = 'down' }: { children: ReactNode; onClose: () => void; width?: number; align?: 'left' | 'right'; top?: number; sheet?: boolean; placement?: 'down' | 'up' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setTimeout(onClose, 0); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  if (sheet) return <div ref={ref} className="menu mobile-sheet" style={{ zIndex: 60 }}>{children}</div>;
  if (placement === 'up') return <div ref={ref} className="menu up" style={{ [align === 'left' ? 'left' : 'right']: align === 'left' ? 8 : 0, width, zIndex: 60 }}>{children}</div>;
  return <div ref={ref} className="menu" style={{ [align === 'left' ? 'left' : 'right']: align === 'left' ? 8 : 0, top: top ?? '100%', marginTop: 4, width, zIndex: 60 }}>{children}</div>;
}

// ── Module sub-nav flyout ─────────────────────────────────────────────────

function SubNavList({ items, activeId, onPick, inline }: { items: SubNavItem[]; activeId?: string; onPick: (id: string) => void; inline?: boolean }) {
  const groups = Array.from(new Set(items.map((i) => i.group ?? '')));
  return (
    <div className={inline ? 'sidebar-sub' : undefined}>
      {groups.map((g) => (
        <div key={g}>
          {g && <div className="section-label group-label">{g.charAt(0) + g.slice(1).toLowerCase()}</div>}
          {items.filter((i) => (i.group ?? '') === g).map((i) => (
            <button key={i.id} type="button" role="menuitem" className={`menu-item ${i.id === activeId ? 'active' : ''}`} onClick={() => onPick(i.id)}>
              <span style={{ flex: 1 }}>{i.label}</span>
              {i.badge !== undefined && i.badge > 0 && <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 600, borderRadius: 9999, padding: '0 6px', minWidth: 18, textAlign: 'center', lineHeight: '18px' }}>{i.badge}</span>}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Floats beside the sidebar item; as tall as its list, shifted up only when it would run off the bottom. */
function ModuleFlyout({ label, anchor, items, activeId, onPick }: { label: string; anchor: DOMRect; items: SubNavItem[]; activeId?: string; onPick: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(anchor.top);
  useLayoutEffect(() => {
    const h = ref.current?.offsetHeight ?? 0;
    setTop(Math.max(8, Math.min(anchor.top, window.innerHeight - h - 8)));
  }, [anchor, items.length]);
  return (
    <div ref={ref} className="menu sidebar-flyout" role="menu" style={{ top, left: anchor.right + 6 }}>
      <div className="flyout-title">{label}</div>
      <SubNavList items={items} activeId={activeId} onPick={onPick} />
    </div>
  );
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

// ── Command palette (Ctrl/⌘ K) ───────────────────────────────────────────────
// Recent destinations when empty; pages (modules and their sub-pages), quick actions, documents, parties,
// items and accounts as you type. Results are grouped, keyboard-driven, and the match is highlighted.

type PaletteRow = { key: string; group: string; primary: string; secondary?: string; path: string; icon: ComponentType<{ size?: number }>; hint?: string; action?: () => void };
const LixiRowIcon = ({ size = 15 }: { size?: number }) => <LixiMark size={size} />;
const askLixiRow = (term: string): PaletteRow => ({ key: 'a:lixi', group: 'Actions', primary: term ? `Ask Lixi: "${term}"` : 'Ask Lixi', secondary: 'AI assistant · preview', path: '', icon: LixiRowIcon, hint: 'Lixi', action: () => lixi.open(term || undefined) });
const RECENT_KEY = 'eb-recent-nav';
const readRecent = (): PaletteRow[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; } };
const pushRecent = (row: PaletteRow) => {
  try {
    const next = [{ ...row, icon: undefined, group: 'Recent' }, ...readRecent().filter((r) => r.path !== row.path)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
};
const GROUP_ORDER_PALETTE = ['Recent', 'Pages', 'Settings', 'Actions', 'Documents', 'Parties', 'Items', 'People', 'Other'];
const groupOf = (label: string) => (label === 'Customer' || label === 'Supplier' ? 'Parties' : label === 'Item' ? 'Items' : label === 'Employee' ? 'People' : label === 'Asset' || label === 'Project' ? 'Other' : 'Documents');
const iconOf = (label: string): ComponentType<{ size?: number }> => (label === 'Page' ? ArrowRightIcon : label === 'Action' ? PlusIcon : label === 'Customer' || label === 'Supplier' ? UsersIcon : label === 'Item' ? PackageIcon : label === 'Employee' ? UserIcon : label === 'Journal' ? BookOpenIcon : label === 'Receipt' || label === 'Payment' ? CreditCardIcon : FileTextIcon);

function Highlight({ text, term }: { text: string; term: string }) {
  if (!term) return <>{text}</>;
  const i = text.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="palette-mark">{text.slice(i, i + term.length)}</mark>{text.slice(i + term.length)}</>;
}

function GlobalSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const s = useSession();
  const subNavs = useSubNavs();
  const settings = useSetupSections();
  const listRef = useRef<HTMLDivElement>(null);
  const isWin = typeof navigator !== 'undefined' && /Win/.test(navigator.platform);

  const rows = useMemo<PaletteRow[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) {
      return [...readRecent().map((r) => ({ ...r, group: 'Recent', icon: iconOf(r.hint ?? '') })), askLixiRow('')];
    }
    const out: PaletteRow[] = [];
    const visible = MODULES.filter((m) => (m.platformOnly ? s.isPlatformAdmin : s.entitled(m.id)) && (!m.permission || s.canModule(m.permission)));
    visible.forEach((m) => {
      if (m.label.toLowerCase().includes(term) || m.id.includes(term)) out.push({ key: `p:${m.id}`, group: 'Pages', primary: m.label, secondary: m.description, path: m.id, icon: m.icon, hint: 'Page' });
      (subNavs[m.id] ?? []).filter((i) => !i.hidden).forEach((i) => {
        if (i.label.toLowerCase().includes(term)) out.push({ key: `p:${m.id}/${i.id}`, group: 'Pages', primary: i.label, secondary: m.label, path: `${m.id}/${i.id}`, icon: m.icon, hint: 'Page' });
      });
    });
    settings.forEach((sec) => sec.cards.forEach((card) => card.links.forEach((l) => {
      if (l.label.toLowerCase().includes(term) || card.title.toLowerCase().includes(term) || (l.keywords ?? '').includes(term)) out.push({ key: `s:${l.id}`, group: 'Settings', primary: l.label, secondary: `All Settings · ${card.title}`, path: l.id, icon: CogIcon, hint: 'Setting' });
    })));
    const actions: { label: string; path: string; perm: string }[] = [
      { label: 'New sales invoice', path: 'sales/invoices/new', perm: 'sales.invoice.create' },
      { label: 'New quotation', path: 'sales/quotations/new', perm: 'sales.quotation.create' },
      { label: 'New purchase order', path: 'purchase/orders/new', perm: 'purchase.order.create' },
      { label: 'New journal', path: 'accounting/journals/new', perm: 'accounting.journal.create' },
      { label: 'New customer', path: 'masters/customers/new', perm: 'masters.customer.create' },
      { label: 'Record receipt', path: 'sales/receipts', perm: 'sales.receipt.create' },
    ];
    actions.forEach((a) => { if (a.label.toLowerCase().includes(term) && s.can(a.perm)) out.push({ key: `a:${a.path}`, group: 'Actions', primary: a.label, path: a.path, icon: PlusIcon, hint: 'Action' }); });
    DOC_SOURCES.forEach((src) => {
      db.get<any>(src.col).forEach((r) => {
        if (r.companyId && r.companyId !== s.state.companyId) return;
        const hay = `${r.number ?? ''} ${r.name ?? ''} ${r.code ?? ''} ${r.partyName ?? ''} ${r.gstin ?? ''} ${r.reference ?? ''}`.toLowerCase();
        if (hay.includes(term)) out.push({ key: `${src.col}:${r.id}`, group: groupOf(src.label), primary: r.number ?? r.name ?? r.code, secondary: [src.label, src.secondary(r)].filter(Boolean).join(' · '), path: src.path(r), icon: iconOf(src.label), hint: src.label });
      });
    });
    out.sort((a, b) => GROUP_ORDER_PALETTE.indexOf(a.group) - GROUP_ORDER_PALETTE.indexOf(b.group));
    return [...out.slice(0, 40), askLixiRow(q.trim())];
  }, [q, s, subNavs, settings]);

  const go = (row: PaletteRow) => { if (row.action) { row.action(); onClose(); return; } pushRecent(row); nav.go(row.path); onClose(); };
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector<HTMLElement>('[data-hi="true"]')?.scrollIntoView({ block: 'nearest' }); }, [hi]);

  let lastGroup = '';
  return (
    <>
      <div className="scrim" onClick={onClose} style={{ zIndex: 101 }} />
      <div className="palette" role="dialog" aria-modal aria-label="Search">
        <div className="palette-input">
          <SearchIcon size={16} />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or jump to…" spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
              if (e.key === 'Enter' && rows[hi]) go(rows[hi]);
              if (e.key === 'Escape') onClose();
            }} />
          <Kbd>esc</Kbd>
        </div>
        <div className="palette-body" ref={listRef}>
          {rows.length === 0 && (
            <div className="palette-empty">
              {q ? <>No matches for <strong>{q}</strong> in {s.company?.tradeName ?? 'this company'}.</> : <>Type to search documents, parties, items and pages. Recent destinations will show up here.</>}
            </div>
          )}
          {rows.map((r, i) => {
            const Icon = r.icon;
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            return (
              <div key={r.key}>
                {header && <div className="palette-group">{header}</div>}
                <button type="button" className={`palette-row ${hi === i ? 'hi' : ''}`} data-hi={hi === i} onMouseEnter={() => setHi(i)} onClick={() => go(r)}>
                  <span className="palette-icon"><Icon size={15} /></span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="palette-primary"><Highlight text={r.primary} term={q.trim()} /></span>
                    {r.secondary && <span className="palette-secondary">{r.secondary}</span>}
                  </span>
                  {hi === i && <Kbd>↵</Kbd>}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
          <span><Kbd>↵</Kbd> open</span>
          <span><Kbd>esc</Kbd> close</span>
          <span style={{ marginLeft: 'auto' }}><Kbd>{isWin ? 'Ctrl' : '⌘'}</Kbd> <Kbd>K</Kbd> anywhere</span>
        </div>
      </div>
    </>
  );
}
