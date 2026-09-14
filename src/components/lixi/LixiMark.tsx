// Lixi's orb. Static PNG at small sizes; the animated orb (WebP, GIF fallback) where it has room to
// breathe — welcome state, "thinking" avatar. Sources are built by scripts/lixi-assets.py into public/lixi.
import { useEffect, useState, type CSSProperties } from 'react';

const STATIC = [32, 64, 128, 256] as const;
const srcFor = (size: number) => `/lixi/logo-${STATIC.find((s) => s >= size * 2) ?? 256}.png`;

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
        <source type="image/webp" srcSet="/lixi/orb.webp" />
        <img src="/lixi/orb.gif" alt="Lixi" width={size} height={size} draggable={false} className="lixi-mark" style={box} />
      </picture>
    );
  }
  return <img src={srcFor(size)} alt="Lixi" width={size} height={size} draggable={false} className={`lixi-mark ${className}`} style={box} />;
}
