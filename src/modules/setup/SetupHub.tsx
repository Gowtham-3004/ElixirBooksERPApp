// All Settings — the hub every admin / masters / platform page hangs off. Three titled sections of
// cards, each card a coloured icon header plus a list of links; the search box filters links live.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nav, useRoute, useSession } from '../../store';
import { Button, EmptyState, Kbd } from '../../components/ui';
import { CogIcon, SearchIcon, XIcon } from '../../components/Icons';
import { closeSetup, useSetupSections, type SetupCard, type SetupSection } from './sections';

const typing = (e: KeyboardEvent) => ['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName) || (e.target as HTMLElement)?.isContentEditable;

function highlight(label: string, term: string): ReactNode {
  if (!term) return label;
  const i = label.toLowerCase().indexOf(term);
  if (i < 0) return label;
  return <>{label.slice(0, i)}<mark>{label.slice(i, i + term.length)}</mark>{label.slice(i + term.length)}</>;
}

export default function SetupHub() {
  const s = useSession();
  const route = useRoute();
  const sections = useSetupSections();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const term = q.trim().toLowerCase();

  const filtered = useMemo<SetupSection[]>(() => {
    if (!term) return sections;
    const match = (l: { label: string; keywords?: string }, card: SetupCard) =>
      l.label.toLowerCase().includes(term) || (l.keywords ?? '').toLowerCase().includes(term) || card.title.toLowerCase().includes(term);
    return sections
      .map((sec) => ({ ...sec, cards: sec.cards.map((c) => ({ ...c, links: c.links.filter((l) => match(l, c)) })).filter((c) => c.links.length) }))
      .filter((sec) => sec.cards.length);
  }, [sections, term]);
  const first = filtered[0]?.cards[0]?.links[0];

  // "/" focuses the search from anywhere on the page (the palette owns Ctrl/⌘ K; "?" is the shortcuts modal)
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && !typing(e) && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); input.current?.focus(); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const active = (id: string) => route.path === id || route.path.startsWith(`${id}/`);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg)' }}>
      <div className="setup-head">
        <div className="setup-head-title">
          <span className="icon-tile accent"><CogIcon size={16} /></span>
          <div style={{ minWidth: 0 }}>
            <h1>All Settings</h1>
            <div className="sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.company?.tradeName ?? s.company?.legalName ?? ''}</div>
          </div>
        </div>
        <label className="search-input setup-search" onClick={() => input.current?.focus()}>
          <SearchIcon size={14} />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings ( / )" aria-label="Search settings"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && first) { e.preventDefault(); nav.go(first.id); }
              else if (e.key === 'Escape') { e.preventDefault(); if (q) setQ(''); else closeSetup(); }
            }} />
          {q ? <button type="button" className="btn-icon" style={{ width: 22, height: 22 }} aria-label="Clear" onClick={() => setQ('')}><XIcon size={12} /></button> : <Kbd>/</Kbd>}
        </label>
        <div className="setup-head-actions">
          <Button variant="tinted" size="sm" icon={<XIcon size={13} />} onClick={closeSetup}>Close Settings</Button>
        </div>
      </div>

      <div className="setup-body">
        {filtered.length === 0 && (
          <EmptyState compact icon={<SearchIcon size={20} />} title={`No settings match "${q.trim()}"`} description="Try a page name such as Users, Number series or Tax rates." action={<Button variant="secondary" onClick={() => setQ('')}>Clear search</Button>} />
        )}
        {filtered.map((sec) => (
          <section key={sec.id} className="setup-section" aria-label={sec.title}>
            <h2 className="setup-section-title">{sec.title}</h2>
            <div className="setup-grid">
              {sec.cards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.id} className="setup-card">
                    <div className={`setup-card-head ${card.tone}`}>
                      <span className="icon-tile"><Icon size={15} /></span>
                      <span>{highlight(card.title, term)}</span>
                    </div>
                    <div className="setup-card-links">
                      {card.links.map((l) => (
                        <button key={l.id} type="button" className={`setup-link ${active(l.id) ? 'active' : ''}`} onClick={() => nav.go(l.id)}>{highlight(l.label, term)}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
