// Sign in (FR-IAM-002, design §6.6): split card — form on the left, live role-dashboard preview on the right.
import { useMemo, useState } from 'react';
import { EyeIcon } from '../../components/Icons';
import { db, C, session } from '../../store';
import type { User, Company, Tenant, Plan } from '../../store';
import { fmtMoneyCompact, fmtMoney, today } from '../../lib/format';
import { Backdrop, BrandMark, GoogleMark, MicrosoftMark, deviceTrust } from './Frame';

interface LoginProps {
  onLogin?: () => void;
  onCreateAccount?: () => void;
}

export default function Login({ onLogin, onCreateAccount }: LoginProps) {
  const [email, setEmail] = useState('rahul@acmepvt.com');
  const [password, setPassword] = useState('••••••••••');
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);
  const banner = session.get().loginBanner;
  const users = db.get<User>(C.users);
  const preview = useMemo(() => {
    const co = db.find<Company>(C.companies, 'co_acme') ?? db.get<Company>(C.companies)[0];
    const tenant = db.find<Tenant>(C.tenants, co?.tenantId);
    const plan = db.find<Plan>(C.plans, tenant?.planId);
    const inv = db.get<any>(C.salesInvoices).filter((i) => i.companyId === co?.id).sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 4);
    const cur = today().slice(0, 7);
    const posted = db.get<any>(C.salesInvoices).filter((i) => i.companyId === co?.id && i.status === 'Posted');
    const revenue = posted.filter((i) => String(i.date).startsWith(cur)).reduce((s, i) => s + (i.totals?.baseTotal ?? i.totals?.total ?? 0), 0);
    const ar = db.get<any>(C.openItems).filter((o) => o.companyId === co?.id && o.partyType === 'Customer' && o.direction === 'Debit').reduce((s, o) => s + (o.baseOutstanding ?? 0), 0);
    const cash = db.get<any>(C.accounts).filter((a) => a.companyId === co?.id && (a.controlType === 'Bank' || a.controlType === 'Cash')).reduce((s, a) => s + (a.openingBalance ?? 0), 0);
    return { co, tenant, plan, inv, revenue, ar, cash, cur };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!agreed) { setError('Please accept the Terms & Conditions to continue.'); return; }
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user) { setError('No account found for that email. Try one of the demo users below.'); return; }
    if (user.status === 'Invited') { setError('This invitation has not been accepted yet — open the invitation link to set a password.'); return; }
    if (user.status === 'Suspended') { setError('This account is suspended — contact your company administrator (AUTH_SUSPENDED).'); return; }
    if (user.status === 'Deactivated') { setError('This account has been deactivated and can no longer sign in (AUTH_DEACTIVATED).'); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      try {
        session.login(user.id, { skipMfa: user.mfaEnabled && deviceTrust.isTrusted(user.id) });
        onLogin?.();
      } catch (err: any) {
        setError(err?.message ?? 'Sign-in failed');
      }
    }, 500);
  };

  const KPI = [
    { label: `REVENUE (${preview.cur.slice(5)}/${preview.cur.slice(2, 4)})`, value: fmtMoneyCompact(preview.revenue || 4218600), delta: '↑ 8.4%', pos: true },
    { label: 'AR OUTSTANDING', value: fmtMoneyCompact(preview.ar || 1845200), delta: '↑ 2.1%', pos: false },
    { label: 'CASH POSITION', value: fmtMoneyCompact(preview.cash || 892150), delta: '↑ 5.3%', pos: true },
  ];
  const rows = preview.inv.length ? preview.inv.map((i) => ({ num: i.number, cust: i.partyName ?? '—', amt: fmtMoney(i.totals?.total ?? 0, i.currency ?? 'INR'), status: i.status })) : [
    { num: 'INV/26-27/0118', cust: 'Arlene Traders', amt: '₹1,18,000.00', status: 'Posted' },
    { num: 'INV/26-27/0117', cust: 'Rajesh Enterprises', amt: '₹2,45,000.00', status: 'Posted' },
    { num: 'INV/26-27/0116', cust: 'Global Tech Solutions', amt: '₹89,500.00', status: 'Submitted' },
    { num: 'INV/26-27/0115', cust: 'Sunrise Industries', amt: '₹1,56,750.00', status: 'Draft' },
  ];
  const badge: Record<string, string> = { Posted: 'badge-posted', Submitted: 'badge-submitted', Draft: 'badge-draft', Approved: 'badge-approved', Settled: 'badge-settled' };
  const th: React.CSSProperties = { padding: '6px 14px', background: 'var(--surface-2)', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)', textAlign: 'left', fontVariantNumeric: 'normal' };

  return (
    <Backdrop>
      <div className="auth-split" style={{ width: '100%', maxWidth: 960, background: '#FFFFFF', borderRadius: 16, boxShadow: '0 8px 48px rgba(0,0,0,0.10)', display: 'flex', overflow: 'hidden', minHeight: 560 }}>
        {/* Left – form */}
        <div className="auth-main" style={{ width: 420, flexShrink: 0, padding: '48px 40px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--hairline)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <BrandMark />
            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Elixir Books</span>
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', marginBottom: 4, lineHeight: 1.3 }}>Welcome back</h1>
          <p style={{ fontSize: 14, color: 'var(--ink-3)', marginBottom: 28 }}>Sign in to {preview.tenant?.name ?? 'your workspace'} · {preview.plan?.name ?? 'Growth'} Edition</p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: 8 }} title="SSO is configured per edition (FR-IAM-007)" onClick={() => setError('Google SSO is not configured for this workspace — sign in with your work email, or ask the tenant owner to enable SSO (FR-IAM-007).')}>
              <GoogleMark /> Google
            </button>
            <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: 8 }} onClick={() => setError('Microsoft SSO is not configured for this workspace — sign in with your work email, or ask the tenant owner to enable SSO (FR-IAM-007).')}>
              <MicrosoftMark /> Microsoft
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ flex: 1, height: 1, background: 'var(--line)' }} /><span style={{ fontSize: 12, color: 'var(--ink-5)' }}>or</span><div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
          </div>

          {banner && <div className="banner success" style={{ marginBottom: 14 }}>{banner}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Work Email</label>
              <input className="field-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="username" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="section-label">Password</label>
                <button type="button" style={{ background: 'none', border: 'none', fontSize: 12, color: 'var(--accent)', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }} onClick={() => session.setAuth('forgot', { loginBanner: undefined })}>Forgot password?</button>
              </div>
              <div style={{ position: 'relative' }}>
                <input className="field-input" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter password" style={{ paddingRight: 44 }} autoComplete="current-password" />
                <button type="button" aria-label={showPw ? 'Hide password' : 'Show password'} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: showPw ? 'var(--accent)' : 'var(--ink-3)', display: 'flex' }} onClick={() => setShowPw(!showPw)}>
                  <EyeIcon size={16} />
                </button>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink-3)' }}>
              <input type="checkbox" className="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 1 }} />
              <span>I agree to the <a href="#/" onClick={(e) => e.preventDefault()} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Terms & Conditions</a> and <a href="#/" onClick={(e) => e.preventDefault()} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</a></span>
            </label>
            {error && <div className="banner danger" role="alert">{error}</div>}
            <button type="submit" className="btn-primary" style={{ justifyContent: 'center', height: 44, marginTop: 4 }} disabled={loading}>
              {loading ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" /><path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" /></path></svg>
              ) : null}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div style={{ marginTop: 16 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Demo users (any password)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {users.filter((u) => u.status === 'Active').slice(0, 12).map((u) => (
                <button key={u.id} type="button" className={`chip ${email === u.email ? 'selected' : ''}`} onClick={() => { setEmail(u.email); setError(null); }} title={`${u.email}${u.mfaEnabled ? ' · MFA' : ''}${u.isPlatformAdmin ? ' · platform' : ''}`}>{u.name}</button>
              ))}
              {users.filter((u) => u.status === 'Suspended').slice(0, 1).map((u) => (
                <button key={u.id} type="button" className="chip" onClick={() => { setEmail(u.email); setError(null); }} title="Suspended account — sign-in is refused">{u.name} (suspended)</button>
              ))}
              {users.filter((u) => u.status === 'Invited' && u.inviteToken).slice(0, 1).map((u) => (
                <button key={u.id} type="button" className="chip" onClick={() => session.setAuth('invite', { inviteToken: u.inviteToken, loginBanner: undefined })}>Open invitation link</button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 16, textAlign: 'center' }}>
            {"Don't have an account? "}
            <button type="button" onClick={onCreateAccount} style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 500, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Start free trial</button>
          </p>
        </div>

        {/* Right – preview */}
        <div className="auth-aside" style={{ flex: 1, background: 'linear-gradient(160deg, var(--accent-tint) 0%, var(--accent-tint) 100%)', padding: 32, display: 'flex', flexDirection: 'column', gap: 16, overflow: 'hidden' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 4 }}>Elixir Books {preview.plan?.name ?? 'Growth'} · {preview.co?.legalName ?? 'Acme Private Limited'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {KPI.map((kpi) => (
              <div key={kpi.label} style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px' }}>
                <div className="section-label" style={{ marginBottom: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: kpi.pos ? 'var(--good)' : 'var(--danger)', marginTop: 2 }}>{kpi.delta}</div>
              </div>
            ))}
          </div>
          <div style={{ background: '#FFFFFF', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>Recent Invoices</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Number</th><th style={th}>Customer</th><th style={{ ...th, textAlign: 'right' }}>Amount</th><th style={th}>Status</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.num} style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <td style={{ padding: '7px 14px', fontSize: 12, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{row.num}</td>
                    <td style={{ padding: '7px 14px', fontSize: 12, color: 'var(--ink)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.cust}</td>
                    <td style={{ padding: '7px 14px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{row.amt}</td>
                    <td style={{ padding: '7px 14px' }}><span className={`badge ${badge[row.status] ?? 'badge-draft'}`}>{row.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)', textAlign: 'center', marginTop: 'auto' }}>{preview.co?.legalName ?? 'Acme Private Limited'} · {preview.co?.address.city ?? 'Mumbai'} · FY {preview.co ? (preview.co.fiscalYearStartMonth === 4 ? '2026–27' : '2026') : '2026–27'} · Sep 2026 ● Open</p>
        </div>
      </div>
    </Backdrop>
  );
}
