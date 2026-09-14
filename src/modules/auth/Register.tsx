// Registration (2 steps) → creates Tenant (Trial), Company, Branch, Periods, Owner user, number series,
// then signs the owner in and opens the onboarding wizard (FR-PLT-003, FR-ORG-001, FR-BIZ-001).
import { useState } from 'react';
import { EyeIcon, ChevronDownIcon, ShoppingCartIcon, BriefcaseIcon, FactoryIcon, ZapIcon } from '../../components/Icons';
import { db, C, session } from '../../store';
import type { User } from '../../store';
import { validateEmail, fiscalYearOf, periodCodeOf, today } from '../../lib/format';
import { Backdrop, BrandMark, GoogleMark, MicrosoftMark, PasswordMeter, passwordStrength } from './Frame';
import { COUNTRY_OPTIONS, createWorkspace } from './provision';

interface Props {
  onCreated?: () => void;
  onSignIn: () => void;
}

const NATURES = [
  { id: 'Trading', label: 'Trading', icon: ShoppingCartIcon, desc: 'Buy, stock, and sell goods', color: '#F97316' },
  { id: 'Services', label: 'Services', icon: BriefcaseIcon, desc: 'Time, projects, subscriptions', color: '#38BDF8' },
  { id: 'Manufacturing', label: 'Manufacturing', icon: FactoryIcon, desc: 'Produce finished goods', color: '#22C55E' },
  { id: 'Hybrid', label: 'Hybrid', icon: ZapIcon, desc: 'Combination of profiles', color: '#A855F7' },
] as const;

export default function Register({ onCreated, onSignIn }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [company, setCompany] = useState('');
  const [country, setCountry] = useState('IN');
  const [nature, setNature] = useState<'Trading' | 'Services' | 'Manufacturing' | 'Hybrid' | ''>('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const emailErr = validateEmail(email);
    if (emailErr) { setError(emailErr); return; }
    if (db.get<User>(C.users).some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) { setError('An account already exists for this email — sign in instead.'); return; }
    if (passwordStrength(password).score < 3) { setError('Choose a stronger password: 8+ characters with an uppercase letter and a number.'); return; }
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nature) return;
    setLoading(true);
    setError(null);
    setTimeout(() => {
      try {
        const { company: co, user, tenant, branch } = createWorkspace({ fullName: fullName.trim(), email, companyName: company.trim(), country, nature });
        session.setAuth('onboarding', { userId: user.id, tenantId: tenant.id, companyId: co.id, branchId: branch.id, fy: fiscalYearOf(today(), co.fiscalYearStartMonth), periodCode: periodCodeOf(today()), loginBanner: undefined });
        onCreated?.();
      } catch (err: any) {
        setError(err?.message ?? 'Could not create the workspace');
      } finally {
        setLoading(false);
      }
    }, 700);
  };

  return (
    <Backdrop>
      <div className="auth-split" style={{ width: '100%', maxWidth: 980, background: '#FFFFFF', borderRadius: 16, boxShadow: '0 8px 48px rgba(0,0,0,0.10)', display: 'flex', overflow: 'hidden', minHeight: 580 }}>
        {/* Left — brand + steps */}
        <div className="auth-aside" style={{ width: 300, flexShrink: 0, background: 'linear-gradient(160deg, #1A3BCC 0%, var(--accent) 60%, #4F74FF 100%)', padding: '40px 32px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <BrandMark light />
            <span style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Elixir Books</span>
          </div>
          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', marginBottom: 8, lineHeight: 1.3 }}>Start your free trial</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>14 days free · No credit card needed · Full Growth access</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[{ num: 1, label: 'Your account', sub: 'Name, email & password' }, { num: 2, label: 'Your company', sub: 'Business details & nature' }, { num: 3, label: 'Setup wizard', sub: 'Configure in 9 steps' }].map((s, i) => {
              const done = s.num < step;
              const current = s.num === step;
              const upcoming = s.num > step;
              return (
                <div key={s.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: done ? 'rgba(255,255,255,0.95)' : current ? '#FFFFFF' : 'rgba(255,255,255,0.2)', color: done || current ? 'var(--accent)' : 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, boxShadow: current ? '0 0 0 4px rgba(255,255,255,0.2)' : 'none', transition: 'all 0.2s' }}>{done ? '✓' : s.num}</div>
                    {i < 2 && <div style={{ width: 1, height: 36, background: done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)', margin: '4px 0' }} />}
                  </div>
                  <div style={{ paddingTop: 4, paddingBottom: i < 2 ? 36 : 0 }}>
                    <div style={{ fontSize: 14, fontWeight: current ? 600 : 400, color: upcoming ? 'rgba(255,255,255,0.5)' : '#FFFFFF', marginBottom: 2 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: upcoming ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.65)' }}>{s.sub}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 'auto', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Growth · 14-day trial · All non-manufacturing features included</div>
        </div>

        {/* Right — form */}
        <div className="auth-main" style={{ flex: 1, padding: '44px 48px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {step === 1 ? (
            <>
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>Step 1 of 2</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Create your account</h1>
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>
                  {'Already have an account? '}
                  <button type="button" onClick={onSignIn} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0, fontWeight: 500 }}>Sign in</button>
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: 8 }} onClick={() => setError('Google sign-up is available on Enterprise SSO — continue with your work email.')}><GoogleMark /> Continue with Google</button>
                <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: 8 }} onClick={() => setError('Microsoft sign-up is available on Enterprise SSO — continue with your work email.')}><MicrosoftMark /> Continue with Microsoft</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--line)' }} /><span style={{ fontSize: 12, color: 'var(--ink-5)' }}>or</span><div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              </div>
              <form onSubmit={handleStep1} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Full Name *</label>
                  <input className="field-input" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Rahul Kumar" autoFocus />
                </div>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Work Email *</label>
                  <input className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="rahul@acmepvt.com" />
                </div>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input className="field-input" type={showPass ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" style={{ paddingRight: 44 }} />
                    <button type="button" onClick={() => setShowPass(!showPass)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex' }}><EyeIcon size={16} /></button>
                  </div>
                  <PasswordMeter pw={password} />
                </div>
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--ink-3)' }}>
                  <input type="checkbox" className="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={{ marginTop: 1 }} />
                  <span>I agree to the <a href="#/" onClick={(e) => e.preventDefault()} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Terms of Service</a> and <a href="#/" onClick={(e) => e.preventDefault()} style={{ color: 'var(--accent)', textDecoration: 'none' }}>Privacy Policy</a></span>
                </label>
                {error && <div className="banner danger">{error}</div>}
                <button type="submit" className="btn-primary" style={{ justifyContent: 'center', height: 44, marginTop: 4 }} disabled={!agreed}>Continue →</button>
              </form>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 6 }}>Step 2 of 2</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>Tell us about your company</h1>
                <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>This creates your first workspace and guides the onboarding.</p>
              </div>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Company / Trade Name *</label>
                  <input className="field-input" required value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Private Limited" autoFocus />
                </div>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Country *</label>
                  <div style={{ position: 'relative' }}>
                    <select className="field-input" value={country} onChange={(e) => setCountry(e.target.value)} style={{ appearance: 'none', paddingRight: 36 }}>
                      {COUNTRY_OPTIONS.map((c) => <option key={c.code} value={c.code}>{c.name} · {c.currency}</option>)}
                    </select>
                    <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}><ChevronDownIcon size={14} color="var(--ink-3)" /></span>
                  </div>
                  <div className="field-help">Sets the localization pack ({COUNTRY_OPTIONS.find((c) => c.code === country)?.pack}), base currency and fiscal calendar. Base currency locks after the first posting.</div>
                </div>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>Business Nature *</label>
                  <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>Shapes your navigation, modules, and default settings.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {NATURES.map((n) => (
                      <button key={n.id} type="button" onClick={() => setNature(n.id)} style={{ padding: '14px 16px', border: `1.5px solid ${nature === n.id ? n.color : 'var(--line)'}`, borderRadius: 10, background: nature === n.id ? `${n.color}12` : '#FFFFFF', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'inherit' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ display: 'inline-flex', color: n.color }}><n.icon size={20} /></span>
                          {nature === n.id && <div style={{ width: 16, height: 16, borderRadius: '50%', background: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 10 }}>✓</span></div>}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>{n.label}</div>
                          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{n.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                {error && <div className="banner danger">{error}</div>}
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type="button" className="btn-secondary" style={{ flex: 1, justifyContent: 'center', height: 44 }} onClick={() => setStep(1)}>← Back</button>
                  <button type="submit" className="btn-primary" style={{ flex: 2, justifyContent: 'center', height: 44 }} disabled={!nature || !company.trim() || loading}>
                    {loading ? 'Creating your workspace…' : 'Create workspace →'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
