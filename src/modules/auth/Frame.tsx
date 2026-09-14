// Shared auth surfaces: gradient backdrop, brand mark and the compact card (design §6.6).
import type { ReactNode } from 'react';

export const AUTH_BG = 'radial-gradient(1200px 600px at 20% -10%, var(--surface) 0%, var(--bg) 60%)';

export function BrandMark({ size = 36, light }: { size?: number; light?: boolean }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.28, background: light ? 'rgba(255,255,255,0.2)' : 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 18 18" fill="none">
        <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.9" />
        <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
        <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
        <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
      </svg>
    </div>
  );
}

export function Backdrop({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: AUTH_BG, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontVariantNumeric: 'normal' }}>
      {children}
    </div>
  );
}

/** Compact single-column auth card (MFA, reset, invitation, company choice). */
export function Frame({ title, subtitle, children, width = 440 }: { title: string; subtitle?: ReactNode; children: ReactNode; width?: number }) {
  return (
    <Backdrop>
      <div style={{ width, maxWidth: '100%', background: 'var(--surface)', borderRadius: 16, boxShadow: '0 8px 48px rgba(0,0,0,0.10)', padding: '40px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <BrandMark size={32} />
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Elixir Books</span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, color: 'var(--ink)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 24, lineHeight: 1.5 }}>{subtitle}</p>}
        {children}
      </div>
    </Backdrop>
  );
}

export function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export function MicrosoftMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078D4"><path d="M11.5 2L2 7.5v9L11.5 22l9.5-5.5v-9L11.5 2z" /></svg>
  );
}

export function passwordStrength(pw: string): { score: number; label: string; color: string; rules: { rule: string; ok: boolean }[] } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return {
    score,
    label: ['', 'Weak', 'Fair', 'Good', 'Strong'][score],
    color: ['', 'var(--danger)', '#F97316', '#F59E0B', 'var(--good)'][score],
    rules: [
      { rule: 'At least 8 characters', ok: pw.length >= 8 },
      { rule: '1 uppercase letter', ok: /[A-Z]/.test(pw) },
      { rule: '1 number', ok: /[0-9]/.test(pw) },
    ],
  };
}

export function PasswordMeter({ pw }: { pw: string }) {
  if (!pw) return null;
  const s = passwordStrength(pw);
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {[1, 2, 3, 4].map((i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 9999, background: i <= s.score ? s.color : 'var(--line)', transition: 'background 0.2s' }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {s.rules.map((r) => <span key={r.rule} style={{ fontSize: 11, color: r.ok ? 'var(--good)' : 'var(--ink-5)' }}>{r.ok ? '✓' : '○'} {r.rule}</span>)}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
      </div>
    </div>
  );
}

/** MFA "remember this device" trust — 30 days, per user, per browser. */
export const deviceTrust = {
  key: (userId: string) => `eb-mfa-trust:${userId}`,
  isTrusted(userId: string): boolean {
    try {
      const v = localStorage.getItem(deviceTrust.key(userId));
      return !!v && Date.parse(v) > Date.now();
    } catch { return false; }
  },
  trust(userId: string, days = 30) {
    try { localStorage.setItem(deviceTrust.key(userId), new Date(Date.now() + days * 86400000).toISOString()); } catch { /* ignore */ }
  },
  forget(userId: string) {
    try { localStorage.removeItem(deviceTrust.key(userId)); } catch { /* ignore */ }
  },
};
