import { useState } from 'react';
import { EyeIcon, ChevronDownIcon } from '../components/Icons';

interface Props {
  onCreated: () => void;
  onSignIn: () => void;
}

const COUNTRIES = ['India', 'UAE', 'United Kingdom', 'Singapore', 'United States', 'Other'];

export default function CreateAccount({ onCreated, onSignIn }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [company, setCompany] = useState('');
  const [country, setCountry] = useState('India');
  const [nature, setNature] = useState<'Trading' | 'Services' | 'Manufacturing' | 'Hybrid' | ''>('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const pwStrength = () => {
    if (password.length === 0) return null;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
  };

  const strength = pwStrength();
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength ?? 0];
  const strengthColor = ['', '#C0393F', '#F97316', '#F59E0B', '#12784E'][strength ?? 0];

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setStep(2);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onCreated();
    }, 1000);
  };

  const NATURES = [
    { id: 'Trading', label: 'Trading', icon: '🏬', desc: 'Buy, stock, and sell goods', color: '#F97316' },
    { id: 'Services', label: 'Services', icon: '💼', desc: 'Time, projects, subscriptions', color: '#38BDF8' },
    { id: 'Manufacturing', label: 'Manufacturing', icon: '🏭', desc: 'Produce finished goods', color: '#22C55E' },
    { id: 'Hybrid', label: 'Hybrid', icon: '⚡', desc: 'Combination of profiles', color: '#A855F7' },
  ] as const;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8F2FA 0%, #E0F0FC 50%, #EEE8FF 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFeatureSettings: 'normal',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 980,
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 8px 48px rgba(0,0,0,0.10)',
          display: 'flex',
          overflow: 'hidden',
          minHeight: 580,
        }}
      >
        {/* Left — brand + steps */}
        <div
          style={{
            width: 300,
            flexShrink: 0,
            background: 'linear-gradient(160deg, #1A3BCC 0%, #325CFF 60%, #4F74FF 100%)',
            padding: '40px 32px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255,255,255,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.9" />
                <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
                <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
                <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
              </svg>
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Elixir Books
            </span>
          </div>

          <div style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#FFFFFF', marginBottom: 8, lineHeight: 1.3 }}>
              Start your free trial
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>
              14 days free · No credit card needed · Full Pro access
            </p>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { num: 1, label: 'Your account', sub: 'Name, email & password' },
              { num: 2, label: 'Your company', sub: 'Business details & nature' },
              { num: 3, label: 'Setup wizard', sub: 'Configure in 6 steps' },
            ].map((s, i) => {
              const done = s.num < step;
              const current = s.num === step;
              const upcoming = s.num > step;
              return (
                <div key={s.num} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: done ? 'rgba(255,255,255,0.95)' : current ? '#FFFFFF' : 'rgba(255,255,255,0.2)',
                        color: done ? '#325CFF' : current ? '#325CFF' : 'rgba(255,255,255,0.6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                        boxShadow: current ? '0 0 0 4px rgba(255,255,255,0.2)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      {done ? '✓' : s.num}
                    </div>
                    {i < 2 && (
                      <div
                        style={{
                          width: 1,
                          height: 36,
                          background: done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)',
                          margin: '4px 0',
                        }}
                      />
                    )}
                  </div>
                  <div style={{ paddingTop: 4, paddingBottom: i < 2 ? 36 : 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: current ? 600 : 400,
                        color: upcoming ? 'rgba(255,255,255,0.5)' : '#FFFFFF',
                        marginBottom: 2,
                      }}
                    >
                      {s.label}
                    </div>
                    <div style={{ fontSize: 12, color: upcoming ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.65)' }}>
                      {s.sub}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
              Pro · 14-day trial · All features included
            </div>
          </div>
        </div>

        {/* Right — form */}
        <div style={{ flex: 1, padding: '44px 48px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          {step === 1 ? (
            <>
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontSize: 12, color: '#5F6368', marginBottom: 6 }}>Step 1 of 2</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>
                  Create your account
                </h1>
                <p style={{ fontSize: 14, color: '#5F6368' }}>
                  {"Already have an account? "}
                  <button
                    type="button"
                    onClick={onSignIn}
                    style={{ background: 'none', border: 'none', color: '#325CFF', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit', padding: 0, fontWeight: 500 }}
                  >
                    Sign in
                  </button>
                </p>
              </div>

              {/* SSO */}
              <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
                <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>
                <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078D4">
                    <path d="M11.5 2L2 7.5v9L11.5 22l9.5-5.5v-9L11.5 2z"/>
                  </svg>
                  Continue with Microsoft
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                <div style={{ flex: 1, height: 1, background: '#EAEAEA' }} />
                <span style={{ fontSize: 12, color: '#B0B5BF' }}>or</span>
                <div style={{ flex: 1, height: 1, background: '#EAEAEA' }} />
              </div>

              <form onSubmit={handleStep1} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Full Name *</label>
                  <input
                    className="field-input"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Rahul Kumar"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Work Email *</label>
                  <input
                    className="field-input"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="rahul@acmepvt.com"
                  />
                </div>

                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      className="field-input"
                      type={showPass ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      style={{ paddingRight: 44 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', color: '#5F6368', display: 'flex',
                      }}
                    >
                      <EyeIcon size={16} />
                    </button>
                  </div>
                  {/* Strength bar */}
                  {strength !== null && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                        {[1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            style={{
                              flex: 1, height: 3, borderRadius: 9999,
                              background: i <= (strength ?? 0) ? strengthColor : '#EAEAEA',
                              transition: 'background 0.2s',
                            }}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {[
                            { rule: 'At least 8 characters', ok: password.length >= 8 },
                            { rule: '1 uppercase letter', ok: /[A-Z]/.test(password) },
                            { rule: '1 number', ok: /[0-9]/.test(password) },
                          ].map((r) => (
                            <span key={r.rule} style={{ fontSize: 11, color: r.ok ? '#12784E' : '#B0B5BF' }}>
                              {r.ok ? '✓' : '○'} {r.rule}
                            </span>
                          ))}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: strengthColor }}>{strengthLabel}</span>
                      </div>
                    </div>
                  )}
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13, color: '#5F6368' }}>
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    style={{ marginTop: 1 }}
                  />
                  <span>
                    I agree to the{' '}
                    <a href="#" style={{ color: '#325CFF', textDecoration: 'none' }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="#" style={{ color: '#325CFF', textDecoration: 'none' }}>Privacy Policy</a>
                  </span>
                </label>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ justifyContent: 'center', height: 44, marginTop: 4 }}
                  disabled={!agreed}
                >
                  Continue →
                </button>
              </form>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 32 }}>
                <p style={{ fontSize: 12, color: '#5F6368', marginBottom: 6 }}>Step 2 of 2</p>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 4 }}>
                  Tell us about your company
                </h1>
                <p style={{ fontSize: 14, color: '#5F6368' }}>
                  This sets up your first workspace and guides the onboarding.
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Company / Trade Name *</label>
                  <input
                    className="field-input"
                    required
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Private Limited"
                  />
                </div>

                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Country *</label>
                  <div style={{ position: 'relative' }}>
                    <select
                      className="field-input"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      style={{ appearance: 'none', paddingRight: 36 }}
                    >
                      {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <ChevronDownIcon
                      size={14}
                      color="#5F6368"
                      className=""
                      // @ts-ignore
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>Business Nature *</label>
                  <p style={{ fontSize: 13, color: '#5F6368', marginBottom: 12 }}>
                    Shapes your navigation, modules, and default settings.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {NATURES.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setNature(n.id)}
                        style={{
                          padding: '14px 16px',
                          border: `1.5px solid ${nature === n.id ? n.color : '#EAEAEA'}`,
                          borderRadius: 10,
                          background: nature === n.id ? `${n.color}12` : '#FFFFFF',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'all 0.15s',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 6,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 20 }}>{n.icon}</span>
                          {nature === n.id && (
                            <div
                              style={{
                                width: 16, height: 16, borderRadius: '50%',
                                background: n.color,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}
                            >
                              <span style={{ color: '#fff', fontSize: 10 }}>✓</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>{n.label}</div>
                          <div style={{ fontSize: 11, color: '#5F6368' }}>{n.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ flex: 1, justifyContent: 'center', height: 44 }}
                    onClick={() => setStep(1)}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 2, justifyContent: 'center', height: 44 }}
                    disabled={!nature || loading}
                  >
                    {loading ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                        <path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round">
                          <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                        </path>
                      </svg>
                    ) : null}
                    {loading ? 'Creating your workspace…' : 'Create workspace →'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
