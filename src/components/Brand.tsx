// Product identity: the Elixir Books chevron mark (built from the source logo by scripts/brand-assets.py)
// and the set wordmark, which stays as text so it follows the theme. Company branding (logoText /
// brandColor) is a different thing and lives in the sidebar company switcher.
import type { CSSProperties } from 'react';
import mark from '../assets/brand/mark.png';

export function Logomark({ size = 24, light, className = '', style }: { size?: number; /** on a white tile — for dark or coloured panels where the bare mark would lose contrast */ light?: boolean; className?: string; style?: CSSProperties }) {
  const img = <img src={mark} alt="" aria-hidden="true" width={size} height={size} draggable={false} style={{ width: size, height: size, display: 'block', flexShrink: 0, objectFit: 'contain' }} />;
  if (!light) return <span className={className} style={{ display: 'inline-flex', flexShrink: 0, ...style }}>{img}</span>;
  const pad = Math.round(size * 0.16);
  return (
    <span className={className} style={{ display: 'inline-flex', flexShrink: 0, boxSizing: 'content-box', padding: pad, borderRadius: Math.round(size * 0.28), background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.12)', ...style }}>
      {img}
    </span>
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
