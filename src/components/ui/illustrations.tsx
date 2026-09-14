// Duotone empty-state illustrations. Geometric, token-coloured (they follow the theme), 112×80 by default.
export type IllustrationKind = 'no-data' | 'no-access' | 'not-found' | 'all-done' | 'search';

const A = 'var(--accent)', AS = 'var(--accent-soft)', AL = 'var(--accent-line)', L = 'var(--line-strong)', S = 'var(--surface)', S3 = 'var(--surface-3)';

export function Illustration({ kind, width = 112 }: { kind: IllustrationKind; width?: number }) {
  const height = Math.round(width * (80 / 112));
  const common = { width, height, viewBox: '0 0 112 80', fill: 'none', 'aria-hidden': true as const };
  switch (kind) {
    case 'no-access':
      return (
        <svg {...common}>
          <path d="M56 8l28 9v20c0 16-12 28-28 35C40 65 28 53 28 37V17l28-9z" fill={AS} stroke={AL} strokeWidth="1.5" />
          <rect x="44" y="36" width="24" height="18" rx="3.5" fill={S} stroke={A} strokeWidth="1.8" />
          <path d="M49 36v-5a7 7 0 0114 0v5" stroke={A} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="56" cy="45" r="2.2" fill={A} />
        </svg>
      );
    case 'not-found':
      return (
        <svg {...common}>
          <circle cx="56" cy="40" r="28" fill={AS} stroke={AL} strokeWidth="1.5" />
          <circle cx="56" cy="40" r="20" fill={S} stroke={L} strokeWidth="1.5" />
          <path d="M56 22v3M56 55v3M38 40h3M71 40h3" stroke={L} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M66 30L59.5 43.5 46 50l6.5-13.5L66 30z" fill={A} opacity=".9" />
          <path d="M46 50l6.5-13.5L59.5 43.5 46 50z" fill="var(--danger)" opacity=".85" />
          <circle cx="56" cy="40" r="2" fill={S} />
        </svg>
      );
    case 'all-done':
      return (
        <svg {...common}>
          <circle cx="56" cy="42" r="26" fill={AS} stroke={AL} strokeWidth="1.5" />
          <circle cx="56" cy="42" r="17" fill={A} />
          <path d="M47.5 42.5l6 6 11-12" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="22" cy="24" r="2.5" fill="var(--good-line)" />
          <circle cx="90" cy="20" r="2" fill="var(--warn-line)" />
          <circle cx="93" cy="58" r="2.5" fill={AL} />
          <circle cx="18" cy="60" r="1.8" fill="var(--danger-line)" />
          <path d="M84 36l4-4M26 44l-4 4" stroke={AL} strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <rect x="18" y="14" width="60" height="52" rx="6" fill={S} stroke={L} strokeWidth="1.5" />
          <rect x="18" y="14" width="60" height="12" rx="6" fill={S3} />
          <path d="M28 36h30M28 45h38M28 54h22" stroke={L} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="76" cy="50" r="13" fill={AS} stroke={A} strokeWidth="2" />
          <path d="M86 60l9 9" stroke={A} strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="30" y="8" width="58" height="42" rx="6" fill={S3} />
          <rect x="24" y="18" width="58" height="42" rx="6" fill={S} stroke={L} strokeWidth="1.5" />
          <rect x="24" y="18" width="58" height="11" rx="6" fill={AS} />
          <rect x="24" y="24" width="58" height="5" fill={AS} />
          <path d="M34 40h28M34 49h38" stroke={L} strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="74" cy="40" r="2.2" fill={A} />
          <rect x="18" y="60" width="70" height="8" rx="4" fill={S3} />
        </svg>
      );
  }
}
