// Lixi's orb. Static PNG at small sizes; the animated orb (WebP, GIF fallback) where it has room to
// breathe — welcome state, "thinking" avatar. Sources are built by scripts/lixi-assets.py into
// src/assets/lixi and imported here so Vite rewrites the URLs for the deploy `base` (a hard-coded
// `/lixi/…` path 404s once the site is served from a sub-path or CDN prefix).
import { useEffect, useState, type CSSProperties } from 'react';
import logo32 from '../../assets/lixi/logo-32.png';
import logo64 from '../../assets/lixi/logo-64.png';
import logo128 from '../../assets/lixi/logo-128.png';
import logo256 from '../../assets/lixi/logo-256.png';
import orbWebp from '../../assets/lixi/orb.webp';
import orbGif from '../../assets/lixi/orb.gif';

const STATIC: ReadonlyArray<readonly [px: number, url: string]> = [[32, logo32], [64, logo64], [128, logo128], [256, logo256]];
const srcFor = (size: number) => (STATIC.find(([px]) => px >= size * 2) ?? STATIC[STATIC.length - 1])[1];

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!m) return;
    const h = () => setReduced(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return reduced;
}

export default function LixiMark({ size = 20, animated = false, className = '', style }: { size?: number; animated?: boolean; className?: string; style?: CSSProperties }) {
  const reduced = useReducedMotion();
  const box = { width: size, height: size, ...style };
  if (animated && !reduced) {
    return (
      <picture className={`lixi-mark ${className}`} style={box}>
        <source type="image/webp" srcSet={orbWebp} />
        <img src={orbGif} alt="Lixi" width={size} height={size} draggable={false} className="lixi-mark" style={box} />
      </picture>
    );
  }
  return <img src={srcFor(size)} alt="Lixi" width={size} height={size} draggable={false} className={`lixi-mark ${className}`} style={box} />;
}
