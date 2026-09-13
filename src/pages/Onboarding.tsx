import { useState } from 'react';
import { CheckIcon, ChevronRightIcon } from '../components/Icons';

interface Props {
  onComplete: () => void;
}

const STEPS = [
  { id: 1, label: 'Business Nature', sub: 'What does your business do?' },
  { id: 2, label: 'Legal Identity', sub: 'Company, PAN & GSTIN' },
  { id: 3, label: 'Address & Branches', sub: 'Registered address' },
  { id: 4, label: 'Currency & Fiscal Year', sub: 'INR · Apr–Mar' },
  { id: 5, label: 'Opening Balances', sub: 'Import or skip' },
  { id: 6, label: 'Invite Team', sub: 'Optional' },
  { id: 7, label: 'Ready to Go', sub: 'Review & launch' },
];

const NATURES = [
  { id: 'Trading', label: 'Trading', icon: '🏬', desc: 'Buy, stock, and sell physical goods', color: '#F97316' },
  { id: 'Services', label: 'Services', icon: '💼', desc: 'Time, projects, subscriptions & retainers', color: '#38BDF8' },
  { id: 'Manufacturing', label: 'Manufacturing', icon: '🏭', desc: 'Produce and sell finished goods', color: '#22C55E' },
  { id: 'Hybrid', label: 'Hybrid', icon: '⚡', desc: 'Combination of the profiles above', color: '#A855F7' },
];

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [nature, setNature] = useState('');
  const [legalName, setLegalName] = useState('');
  const [pan, setPan] = useState('');
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Maharashtra');
  const [currency, setCurrency] = useState('INR');
  const [fyStart, setFyStart] = useState('April');
  const [openingChoice, setOpeningChoice] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');

  const totalSteps = STEPS.length;
  const canProceed = () => {
    if (step === 1) return !!nature;
    if (step === 2) return !!legalName;
    if (step === 3) return !!address && !!city;
    return true;
  };

  const STATES = ['Andhra Pradesh', 'Delhi', 'Gujarat', 'Karnataka', 'Maharashtra', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal'];

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8F2FA 0%, #E0F0FC 50%, #EEE8FF 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 1040,
          background: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 12px 64px rgba(0,0,0,0.12)',
          display: 'flex',
          overflow: 'hidden',
          minHeight: 620,
        }}
      >
        {/* Left — stepper */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            background: '#0A0A0A',
            padding: '36px 28px',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                background: '#325CFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.9" />
                <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
                <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" opacity="0.6" />
                <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" />
              </svg>
            </div>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>
              Elixir Books
            </span>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
              Setup wizard
            </h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
              Takes about 5 minutes. You can skip optional steps and come back later.
            </p>
          </div>

          {/* Vertical stepper */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {STEPS.map((s, i) => {
              const done = s.id < step;
              const current = s.id === step;
              const upcoming = s.id > step;
              return (
                <div key={s.id} style={{ display: 'flex', gap: 14 }}>
                  {/* Spine */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24 }}>
                    <div
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: done
                          ? '#325CFF'
                          : current
                          ? '#FFFFFF'
                          : 'transparent',
                        border: done
                          ? 'none'
                          : current
                          ? 'none'
                          : '1.5px solid rgba(255,255,255,0.2)',
                        transition: 'all 0.2s',
                        fontSize: 11,
                        fontWeight: 700,
                        color: done ? '#FFFFFF' : current ? '#0A0A0A' : 'rgba(255,255,255,0.3)',
                      }}
                    >
                      {done ? <CheckIcon size={12} color="#FFFFFF" /> : s.id}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div
                        style={{
                          width: 1,
                          flex: 1,
                          minHeight: 28,
                          background: done ? '#325CFF' : 'rgba(255,255,255,0.1)',
                          margin: '3px 0',
                          transition: 'background 0.2s',
                        }}
                      />
                    )}
                  </div>

                  {/* Labels */}
                  <div style={{ paddingBottom: i < STEPS.length - 1 ? 24 : 0, paddingTop: 2, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: current ? 600 : 400,
                        color: upcoming
                          ? 'rgba(255,255,255,0.35)'
                          : current
                          ? '#FFFFFF'
                          : 'rgba(255,255,255,0.65)',
                        marginBottom: 2,
                        transition: 'color 0.2s',
                      }}
                    >
                      {s.label}
                    </div>
                    {current && (
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                        {s.sub}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 24,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 8,
              fontSize: 12,
              color: 'rgba(255,255,255,0.45)',
            }}
          >
            Step {step} of {totalSteps}
            <div
              style={{
                marginTop: 8,
                height: 2,
                background: 'rgba(255,255,255,0.1)',
                borderRadius: 9999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${((step - 1) / (totalSteps - 1)) * 100}%`,
                  background: '#325CFF',
                  borderRadius: 9999,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right — step content */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Step body */}
          <div style={{ flex: 1, padding: '44px 52px', overflow: 'auto' }}>
            {step === 1 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  What does your business do?
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 32, lineHeight: 1.6 }}>
                  This shapes your navigation, default accounts, and document templates. You can refine it later.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  {NATURES.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => setNature(n.id)}
                      style={{
                        padding: '20px 20px',
                        border: `1.5px solid ${nature === n.id ? n.color : '#EAEAEA'}`,
                        borderRadius: 12,
                        background: nature === n.id ? `${n.color}10` : '#FAFAFA',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 28 }}>{n.icon}</span>
                        {nature === n.id && (
                          <div
                            style={{
                              width: 20, height: 20,
                              borderRadius: '50%',
                              background: n.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <CheckIcon size={11} color="#FFFFFF" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>{n.label}</div>
                        <div style={{ fontSize: 12, color: '#6E6E71', lineHeight: 1.5 }}>{n.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  Legal identity
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 32, lineHeight: 1.6 }}>
                  Used on all statutory documents — invoices, challans, and returns.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      Legal / Trade Name *
                    </label>
                    <input
                      className="field-input"
                      value={legalName}
                      onChange={(e) => setLegalName(e.target.value)}
                      placeholder="Acme Private Limited"
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        PAN
                      </label>
                      <input
                        className="field-input"
                        value={pan}
                        onChange={(e) => setPan(e.target.value.toUpperCase())}
                        placeholder="AAAPL1234C"
                        maxLength={10}
                      />
                    </div>
                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        GSTIN (optional)
                      </label>
                      <input
                        className="field-input"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        placeholder="27AAAPL1234C1Z5"
                        maxLength={15}
                      />
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#F2F7FF',
                      border: '1px solid #C7D9FF',
                      borderRadius: 8,
                      padding: '12px 14px',
                      fontSize: 13,
                      color: '#3E5BA5',
                      lineHeight: 1.5,
                    }}
                  >
                    If you have multiple GSTINs (branches in different states), add them under Masters → Company Admin after setup.
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  Registered address
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 32, lineHeight: 1.6 }}>
                  Printed on tax invoices and GST returns.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 480 }}>
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      Address Line *
                    </label>
                    <input
                      className="field-input"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Plot 14, Andheri Industrial Estate"
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        City / District *
                      </label>
                      <input
                        className="field-input"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Mumbai"
                      />
                    </div>
                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        PIN Code
                      </label>
                      <input
                        className="field-input"
                        placeholder="400053"
                        maxLength={6}
                        style={{ fontFeatureSettings: '"tnum" 1' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      State *
                    </label>
                    <select
                      className="field-input"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    >
                      {STATES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  Currency and fiscal year
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 32, lineHeight: 1.6 }}>
                  Currency and fiscal-year settings are locked after the first transaction.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>
                      Functional Currency
                    </label>
                    {[
                      { code: 'INR', label: 'Indian Rupee (₹)', sub: 'Recommended for India-based entities' },
                      { code: 'USD', label: 'US Dollar ($)', sub: '' },
                      { code: 'AED', label: 'UAE Dirham (AED)', sub: '' },
                    ].map((c) => (
                      <label
                        key={c.code}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '12px 14px',
                          border: `1px solid ${currency === c.code ? '#325CFF' : '#EAEAEA'}`,
                          borderRadius: 8,
                          marginBottom: 8,
                          cursor: 'pointer',
                          background: currency === c.code ? '#F2F7FF' : '#FAFAFA',
                          transition: 'all 0.12s',
                        }}
                      >
                        <input
                          type="radio"
                          name="currency"
                          value={c.code}
                          checked={currency === c.code}
                          onChange={() => setCurrency(c.code)}
                          style={{ accentColor: '#325CFF' }}
                        />
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>{c.label}</div>
                          {c.sub && <div style={{ fontSize: 12, color: '#5F6368' }}>{c.sub}</div>}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 8 }}>
                      Fiscal Year Starts
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['January', 'April', 'July', 'October'].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFyStart(m)}
                          style={{
                            flex: 1,
                            height: 40,
                            border: `1px solid ${fyStart === m ? '#325CFF' : '#EAEAEA'}`,
                            borderRadius: 8,
                            background: fyStart === m ? '#325CFF' : '#FAFAFA',
                            color: fyStart === m ? '#FFFFFF' : '#0A0A0A',
                            fontSize: 13,
                            fontWeight: fyStart === m ? 600 : 400,
                            cursor: 'pointer',
                            transition: 'all 0.12s',
                            fontFamily: 'inherit',
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: '#5F6368', marginTop: 8 }}>
                      {fyStart === 'April'
                        ? 'April 2026 – March 2027 (Indian fiscal year)'
                        : `${fyStart} 2026 – ${['January','April','July','October'][((['January','April','July','October'].indexOf(fyStart)+3)%4)]} 2027`}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 5 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  Opening balances
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 32, lineHeight: 1.6 }}>
                  Bring in your trial balance from your previous software, or start fresh and enter manually.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 500 }}>
                  {[
                    {
                      id: 'import',
                      icon: '📥',
                      label: 'Import from Tally / Excel',
                      desc: 'Upload a trial balance CSV or Tally XML to auto-populate balances',
                    },
                    {
                      id: 'manual',
                      icon: '✏️',
                      label: 'Enter manually',
                      desc: 'Type opening balances account by account after setup',
                    },
                    {
                      id: 'skip',
                      icon: '⏭️',
                      label: 'Skip for now',
                      desc: 'Start fresh — useful for new businesses or trial runs',
                    },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setOpeningChoice(opt.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 16,
                        padding: '16px 18px',
                        border: `1.5px solid ${openingChoice === opt.id ? '#325CFF' : '#EAEAEA'}`,
                        borderRadius: 10,
                        background: openingChoice === opt.id ? '#F2F7FF' : '#FAFAFA',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.12s',
                      }}
                    >
                      <span style={{ fontSize: 24, lineHeight: 1 }}>{opt.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', marginBottom: 3 }}>{opt.label}</div>
                        <div style={{ fontSize: 12, color: '#5F6368' }}>{opt.desc}</div>
                      </div>
                      {openingChoice === opt.id && (
                        <div
                          style={{
                            width: 20, height: 20,
                            borderRadius: '50%',
                            background: '#325CFF',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <CheckIcon size={11} color="#FFFFFF" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {step === 6 && (
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  Invite your team
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 32, lineHeight: 1.6 }}>
                  Optional — you can always do this later from Settings → Users.
                </p>
                <div style={{ maxWidth: 480 }}>
                  <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                    Email address
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      className="field-input"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="colleague@company.com"
                      style={{ flex: 1 }}
                    />
                    <button className="btn-secondary" style={{ flexShrink: 0 }}>
                      + Add
                    </button>
                  </div>
                  <div style={{ marginTop: 20 }}>
                    <div className="section-label" style={{ marginBottom: 10 }}>Role</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {['Owner', 'Admin', 'Accountant', 'Sales', 'Viewer'].map((role) => (
                        <button
                          key={role}
                          className="btn-secondary btn-sm"
                          style={{ fontSize: 12, fontFeatureSettings: 'normal' }}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 20,
                      padding: '14px 16px',
                      background: '#F9FBFC',
                      border: '1px solid #EAEAEA',
                      borderRadius: 8,
                      fontSize: 13,
                      color: '#5F6368',
                      lineHeight: 1.6,
                    }}
                  >
                    Invites will be sent with a 14-day acceptance window. Each user gets their own login with the permissions you assign.
                  </div>
                </div>
              </div>
            )}

            {step === 7 && (
              <div>
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: '#E0F9EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 20,
                    fontSize: 32,
                  }}
                >
                  🎉
                </div>
                <h2 style={{ fontSize: 24, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>
                  {`You're all set!`}
                </h2>
                <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 36, lineHeight: 1.7, maxWidth: 420 }}>
                  Your workspace has been configured. Here is a summary of what was set up.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 480 }}>
                  {[
                    { label: 'Business nature', val: nature || 'Trading', icon: '🏬' },
                    { label: 'Company name', val: legalName || 'Acme Private Limited', icon: '🏢' },
                    { label: 'City & state', val: city ? `${city}, ${state}` : `Mumbai, Maharashtra`, icon: '📍' },
                    { label: 'Currency', val: currency === 'INR' ? 'Indian Rupee (₹)' : currency, icon: '💰' },
                    { label: 'Fiscal year starts', val: fyStart, icon: '📅' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '12px 16px',
                        background: '#F9FBFC',
                        border: '1px solid #EAEAEA',
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ fontSize: 18 }}>{item.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: '#5F6368', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, marginBottom: 2 }}>
                          {item.label}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>{item.val}</div>
                      </div>
                      <CheckIcon size={14} color="#12784E" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '16px 52px',
              borderTop: '1px solid #EAEAEA',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#FFFFFF',
            }}
          >
            <div>
              {step > 1 && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setStep((s) => Math.max(1, s - 1) as typeof step)}
                >
                  ← Back
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {/* Skip for optional steps */}
              {(step === 5 || step === 6) && (
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.min(totalSteps, s + 1) as typeof step)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#5F6368',
                    fontSize: 14,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    padding: '0 8px',
                  }}
                >
                  Skip for now
                </button>
              )}

              {step < totalSteps ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ gap: 6 }}
                  disabled={!canProceed()}
                  onClick={() => setStep((s) => Math.min(totalSteps, s + 1) as typeof step)}
                >
                  Continue
                  <ChevronRightIcon size={14} color="currentColor" />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ gap: 6, padding: '0 24px' }}
                  onClick={onComplete}
                >
                  Go to dashboard →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
