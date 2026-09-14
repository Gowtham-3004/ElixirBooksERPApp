// Product identity: the logomark (a ledger glyph — three ruled lines, the middle one indented like a
// posting) and the set wordmark. Company branding (logoText / brandColor) is a different thing and lives
// in the sidebar company switcher.
export function Logomark({ size = 24, light }: { size?: number; /** white-on-translucent for dark or coloured panels */ light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="24" height="24" rx="6.5" fill={light ? 'rgba(255,255,255,.18)' : 'var(--accent)'} />
      <path d="M7 8h10M9 12h8M7 16h10" stroke={light ? '#fff' : '#fff'} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="6.4" cy="12" r="1.1" fill="#fff" opacity=".85" />
    </svg>
  );
}

export function Wordmark({ size = 22, light, collapsed }: { size?: number; light?: boolean; /** mark only */ collapsed?: boolean }) {
  const fs = Math.round(size * 0.68);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.36), color: light ? '#fff' : 'var(--ink)', lineHeight: 1, whiteSpace: 'nowrap' }}>
      <Logomark size={size} light={light} />
      {!collapsed && (
        <span style={{ fontSize: fs, fontWeight: 600, letterSpacing: '-0.02em', fontVariantNumeric: 'normal' }}>
          Elixir<span style={{ fontWeight: 400, opacity: light ? .8 : undefined, color: light ? undefined : 'var(--ink-3)' }}> Books</span>
        </span>
      )}
    </span>
  );
}
