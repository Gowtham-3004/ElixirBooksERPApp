import { useState } from 'react';
import { SearchIcon, EyeIcon, CheckIcon } from '../components/Icons';

interface LoginProps {
  onLogin: () => void;
  onCreateAccount?: () => void;
}

export default function Login({ onLogin, onCreateAccount }: LoginProps) {
  const [email, setEmail] = useState('rahul@acmepvt.com');
  const [password, setPassword] = useState('••••••••••');
  const [agreed, setAgreed] = useState(true);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onLogin();
    }, 900);
  };

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
      {/* App frame card */}
      <div
        style={{
          width: '100%',
          maxWidth: 960,
          background: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 8px 48px rgba(0,0,0,0.10)',
          display: 'flex',
          overflow: 'hidden',
          minHeight: 560,
        }}
      >
        {/* Left – form */}
        <div
          style={{
            width: 420,
            flexShrink: 0,
            padding: '48px 40px',
            display: 'flex',
            flexDirection: 'column',
            borderRight: '1px solid #EFEFEF',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: '#325CFF',
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
            <span style={{ fontSize: 18, fontWeight: 700, color: '#0A0A0A', letterSpacing: '-0.02em' }}>
              Elixir Books
            </span>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 600, color: '#0A0A0A', marginBottom: 4, lineHeight: 1.3 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 28 }}>
            Sign in to Acme Group · Pro Edition
          </p>

          {/* SSO buttons */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <button
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center', gap: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button
              className="btn-secondary"
              style={{ flex: 1, justifyContent: 'center', gap: 8 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078D4">
                <path d="M11.5 2L2 7.5v9L11.5 22l9.5-5.5v-9L11.5 2z"/>
              </svg>
              Microsoft
            </button>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div style={{ flex: 1, height: 1, background: '#EAEAEA' }} />
            <span style={{ fontSize: 12, color: '#B0B5BF' }}>or</span>
            <div style={{ flex: 1, height: 1, background: '#EAEAEA' }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                Work Email
              </label>
              <input
                className="field-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label className="section-label">Password</label>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    color: '#325CFF',
                    cursor: 'pointer',
                    padding: 0,
                    fontFamily: 'inherit',
                  }}
                >
                  Forgot password?
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  className="field-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#5F6368',
                    display: 'flex',
                  }}
                >
                  <EyeIcon size={16} />
                </button>
              </div>
            </div>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                cursor: 'pointer',
                fontSize: 13,
                color: '#5F6368',
              }}
            >
              <input
                type="checkbox"
                className="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                style={{ marginTop: 1 }}
              />
              <span>
                I agree to the{' '}
                <a href="#" style={{ color: '#325CFF', textDecoration: 'none' }}>Terms & Conditions</a>
                {' '}and{' '}
                <a href="#" style={{ color: '#325CFF', textDecoration: 'none' }}>Privacy Policy</a>
              </span>
            </label>

            <button
              type="submit"
              className="btn-primary"
              style={{ justifyContent: 'center', height: 44, marginTop: 4 }}
              disabled={loading}
            >
              {loading ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                  <path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite" />
                  </path>
                </svg>
              ) : null}
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p style={{ fontSize: 13, color: '#5F6368', marginTop: 24, textAlign: 'center' }}>
            {"Don't have an account? "}
            <button
              type="button"
              onClick={onCreateAccount}
              style={{
                background: 'none',
                border: 'none',
                color: '#325CFF',
                fontWeight: 500,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
                padding: 0,
              }}
            >
              Start free trial
            </button>
          </p>
        </div>

        {/* Right – preview */}
        <div
          style={{
            flex: 1,
            background: 'linear-gradient(160deg, #F0F4FF 0%, #F5F8FF 100%)',
            padding: 32,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: '#325CFF', marginBottom: 4 }}>
            Elixir Books Pro · Acme Private Limited
          </div>

          {/* Mini KPI tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {[
              { label: 'REVENUE (APR)', value: '₹42.2L', delta: '↑ 8.4%', pos: true },
              { label: 'AR OUTSTANDING', value: '₹18.5L', delta: '↑ 2.1%', pos: false },
              { label: 'CASH POSITION', value: '₹8.9L', delta: '↑ 5.3%', pos: true },
            ].map((kpi) => (
              <div
                key={kpi.label}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #EAEAEA',
                  borderRadius: 10,
                  padding: '12px 14px',
                }}
              >
                <div className="section-label" style={{ marginBottom: 4 }}>{kpi.label}</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A', fontFeatureSettings: '"tnum" 1' }}>{kpi.value}</div>
                <div style={{ fontSize: 11, color: kpi.pos ? '#12784E' : '#C0393F', marginTop: 2 }}>{kpi.delta}</div>
              </div>
            ))}
          </div>

          {/* Mini table */}
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAEAEA',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid #EAEAEA',
                fontSize: 12,
                fontWeight: 600,
                color: '#0A0A0A',
              }}
            >
              Recent Invoices
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 14px', background: '#F9FBFC', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5F6368', textAlign: 'left', fontFeatureSettings: 'normal' }}>Number</th>
                  <th style={{ padding: '6px 14px', background: '#F9FBFC', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5F6368', textAlign: 'left', fontFeatureSettings: 'normal' }}>Customer</th>
                  <th style={{ padding: '6px 14px', background: '#F9FBFC', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5F6368', textAlign: 'right', fontFeatureSettings: 'normal' }}>Amount</th>
                  <th style={{ padding: '6px 14px', background: '#F9FBFC', fontSize: 10, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5F6368', textAlign: 'left', fontFeatureSettings: 'normal' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { num: 'INV/26-27/0118', cust: 'Arlene Traders', amt: '₹1,18,000', status: 'Posted', cls: 'badge-posted' },
                  { num: 'INV/26-27/0117', cust: 'Rajesh Enterprises', amt: '₹2,45,000', status: 'Posted', cls: 'badge-posted' },
                  { num: 'INV/26-27/0116', cust: 'Global Tech Solutions', amt: '₹89,500', status: 'Submitted', cls: 'badge-submitted' },
                  { num: 'INV/26-27/0115', cust: 'Sunrise Industries', amt: '₹1,56,750', status: 'Draft', cls: 'badge-draft' },
                ].map((row) => (
                  <tr key={row.num} style={{ borderBottom: '1px solid #F5F5F5' }}>
                    <td style={{ padding: '7px 14px', fontSize: 12, color: '#325CFF', fontFeatureSettings: '"tnum" 1', letterSpacing: '0.01em' }}>{row.num}</td>
                    <td style={{ padding: '7px 14px', fontSize: 12, color: '#0A0A0A', fontFeatureSettings: 'normal', overflow: 'hidden', maxWidth: 100, textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.cust}</td>
                    <td style={{ padding: '7px 14px', fontSize: 12, color: '#0A0A0A', textAlign: 'right', fontFeatureSettings: '"tnum" 1' }}>{row.amt}</td>
                    <td style={{ padding: '7px 14px' }}>
                      <span className={`badge ${row.cls}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ fontSize: 12, color: '#5F6368', textAlign: 'center', marginTop: 'auto' }}>
            Acme Private Limited · Mumbai · FY 2026–27 · Apr 2026 ● Open
          </p>
        </div>
      </div>
    </div>
  );
}
