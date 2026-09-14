// Auth gate: sign in · register · onboarding · MFA · forgot/reset · invitation · company choice (FR-IAM-001/002/007, design §6.6).
// session.* is the state machine; this module renders each state.
import { useEffect, useMemo, useState } from 'react';
import { db, C, session, useSession, engine, nav } from '../../store';
import type { User, Role, Tenant, Company, AuditEvent } from '../../store';
import Login from './Login';
import Register from './Register';
import Onboarding from './Onboarding';
import { Button, TwoLine, Badge } from '../../components/ui/primitives';
import { TextField, Toggle } from '../../components/ui/fields';
import { Frame, PasswordMeter, passwordStrength, deviceTrust } from './Frame';
import { fmtDateTime } from '../../lib/format';

export default function AuthGate() {
  const s = useSession();
  const auth = s.state.auth;
  // Deep links: #/invite?token=… opens the invitation acceptance screen (FR-IAM-001)
  useEffect(() => {
    const m = window.location.hash.match(/^#\/invite\?token=([^&]+)/);
    if (m) { session.setAuth('invite', { inviteToken: decodeURIComponent(m[1]), loginBanner: undefined }); nav.replace('home'); }
  }, [auth]);
  if (auth === 'register') return <Register onSignIn={() => session.setAuth('login')} />;
  if (auth === 'onboarding') return <Onboarding />;
  if (auth === 'mfa') return <MfaChallenge />;
  if (auth === 'forgot') return <ForgotPassword />;
  if (auth === 'reset') return <SetPassword invite={false} />;
  if (auth === 'invite') return <AcceptInvitation />;
  if (auth === 'choose-company') return <ChooseCompany />;
  return <Login onCreateAccount={() => session.setAuth('register', { loginBanner: undefined })} />;
}

function MfaChallenge() {
  const s = useSession();
  const user = db.find<User>(C.users, s.state.pendingUserId);
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const verify = () => {
    if (code.length !== 6) { setErr('Enter the 6-digit code'); return; }
    if (code === '000000') {
      const n = attempts + 1;
      setAttempts(n);
      engine.audit({ action: 'auth.mfa', objectType: 'User', objectId: user?.id, actor: user?.name, result: 'Failure', detail: `Invalid code (attempt ${n})` });
      setErr(n >= 3 ? 'Too many failed attempts — sign-in cancelled.' : `That code is not valid (attempt ${n} of 3).`);
      if (n >= 3) setTimeout(() => session.setAuth('login', { pendingUserId: undefined, loginBanner: 'MFA failed three times — try again or contact your administrator' }), 800);
      return;
    }
    if (user && remember) deviceTrust.trust(user.id, 30);
    engine.audit({ action: 'auth.mfa', objectType: 'User', objectId: user?.id, actor: user?.name, detail: remember ? 'Verified · device remembered for 30 days' : 'Verified' });
    session.completeMfa();
  };
  return (
    <Frame title="Two-factor verification" subtitle={`Enter the 6-digit code from your authenticator app for ${user?.email ?? ''}.`}>
      <TextField label="Verification code" value={code} onChange={(v) => { setCode(v.replace(/\D/g, '').slice(0, 6)); setErr(null); }} placeholder="123456" autoFocus error={err} inputStyle={{ fontSize: 22, letterSpacing: '0.3em', textAlign: 'center' }} onKeyDown={(e) => { if (e.key === 'Enter') verify(); }} />
      <p style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>Demo: any 6 digits are accepted; 000000 simulates a wrong code.</p>
      <div style={{ marginTop: 16 }}>
        <Toggle on={remember} onChange={setRemember} label="Remember this device for 30 days" help="You will not be asked for a code on this browser until the trust expires or you sign out other sessions." />
      </div>
      <Button variant="primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16, height: 44 }} disabled={code.length !== 6} onClick={verify}>Verify and sign in</Button>
      <Button variant="link" style={{ marginTop: 16 }} onClick={() => session.setAuth('login', { pendingUserId: undefined })}>← Back to sign in</Button>
    </Frame>
  );
}

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const known = db.get<User>(C.users).find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  return (
    <Frame title="Reset your password" subtitle="We'll email a reset link that expires in 30 minutes. For security the response is the same whether or not the address is registered.">
      {sent ? (
        <div>
          <div className="banner success" style={{ marginBottom: 16 }}>If an account exists for {email}, a reset link has been sent.</div>
          <Button variant="primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => session.setAuth('reset', { pendingUserId: known?.id })}>Open reset link (demo)</Button>
        </div>
      ) : (
        <>
          <TextField label="Work email" value={email} onChange={setEmail} type="email" placeholder="you@company.com" autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && email) { setSent(true); } }} />
          <Button variant="primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16, height: 44 }} disabled={!email} onClick={() => {
            engine.audit({ action: 'auth.password_reset_requested', objectType: 'User', objectId: known?.id, detail: email, actor: email, sensitive: true, result: known ? 'Success' : 'Denied' });
            if (known) engine.notify({ type: 'security', title: 'Password reset requested', body: `A reset link was sent to ${email}. It expires in 30 minutes.`, userId: known.id, channel: 'email', status: 'sent' });
            setSent(true);
          }}>Send reset link</Button>
        </>
      )}
      <Button variant="link" style={{ marginTop: 16 }} onClick={() => session.setAuth('login')}>← Back to sign in</Button>
    </Frame>
  );
}

function SetPassword({ invite }: { invite: boolean }) {
  const s = useSession();
  const target = db.find<User>(C.users, s.state.pendingUserId);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const ok = passwordStrength(pw).score >= 3 && pw === pw2;
  return (
    <Frame title={invite ? 'Accept your invitation' : 'Choose a new password'} subtitle={target ? `Resetting the password for ${target.email}. Passwords need 8+ characters, an uppercase letter and a number.` : 'Passwords need 8+ characters, an uppercase letter and a number.'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <TextField label="New password" type="password" value={pw} onChange={setPw} autoFocus />
          <PasswordMeter pw={pw} />
        </div>
        <TextField label="Confirm password" type="password" value={pw2} onChange={setPw2} error={pw2 && pw !== pw2 ? 'Passwords do not match' : null} />
        <Button variant="primary" style={{ width: '100%', justifyContent: 'center', height: 44 }} disabled={!ok} onClick={() => {
          if (target) db.update<User>(C.users, target.id, { passwordSet: true, sessions: (target.sessions ?? []).filter((x) => x.current) });
          engine.audit({ action: 'auth.password_reset', objectType: 'User', objectId: target?.id, actor: target?.name ?? 'user', detail: 'Password updated · other sessions signed out', sensitive: true });
          session.setAuth('login', { pendingUserId: undefined, loginBanner: 'Password updated — sign in with your new password' });
        }}>Update password</Button>
      </div>
    </Frame>
  );
}

function AcceptInvitation() {
  const s = useSession();
  const invited = useMemo(() => db.get<User>(C.users).find((u) => u.inviteToken === s.state.inviteToken && u.status === 'Invited') ?? db.get<User>(C.users).find((u) => u.status === 'Invited' && u.inviteToken), [s.state.inviteToken]);
  const tenant = db.find<Tenant>(C.tenants, invited?.tenantId);
  const roles = (invited?.roleIds ?? []).map((id) => db.find<Role>(C.roles, id)?.name).filter(Boolean);
  const companies = (invited?.companyIds ?? []).map((id) => db.find<Company>(C.companies, id)?.legalName).filter(Boolean);
  const inviteEvent = invited ? db.get<AuditEvent>(C.audit).filter((e) => e.action === 'user.invited' && e.objectId === invited.id).sort((a, b) => b.at.localeCompare(a.at))[0] : undefined;
  const inviter = inviteEvent?.actor ?? db.find<User>(C.users, tenant?.ownerUserId)?.name ?? 'your administrator';
  const expired = invited?.invitedAt ? Date.now() - Date.parse(invited.invitedAt) > 14 * 86400000 : false;
  const [name, setName] = useState(invited?.name ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const ok = !!invited && !expired && name.trim().length > 1 && passwordStrength(pw).score >= 3 && pw === pw2;
  if (!invited) {
    return (
      <Frame title="Invitation not found" subtitle="This invitation link is invalid or has already been used.">
        <Button variant="primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => session.setAuth('login', { inviteToken: undefined })}>Go to sign in</Button>
      </Frame>
    );
  }
  return (
    <Frame title="Accept your invitation" subtitle={<>{inviter} invited you to join <strong>{tenant?.name ?? 'the workspace'}</strong>.</>}>
      <div className="card" style={{ padding: 12, marginBottom: 16, background: 'var(--surface-2)' }}>
        <div className="kv" style={{ gridTemplateColumns: '110px 1fr', fontSize: 12 }}>
          <span className="k">Email</span><span className="v">{invited.email}</span>
          <span className="k">Role{roles.length > 1 ? 's' : ''}</span><span className="v">{roles.join(', ') || '—'}</span>
          <span className="k">Compan{companies.length > 1 ? 'ies' : 'y'}</span><span className="v">{companies.join(', ') || '—'}</span>
          <span className="k">Invited</span><span className="v">{fmtDateTime(invited.invitedAt)} {expired ? <Badge status="Expired" /> : <Badge status="Invited">Valid 14 days</Badge>}</span>
        </div>
      </div>
      {expired && <div className="banner danger" style={{ marginBottom: 14 }}>This invitation has expired — ask {inviter} to resend it from Users & access.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <TextField label="Your name" value={name} onChange={setName} autoFocus />
        <div>
          <TextField label="Choose a password" type="password" value={pw} onChange={setPw} />
          <PasswordMeter pw={pw} />
        </div>
        <TextField label="Confirm password" type="password" value={pw2} onChange={setPw2} error={pw2 && pw !== pw2 ? 'Passwords do not match' : null} />
        <Button variant="primary" style={{ width: '100%', justifyContent: 'center', height: 44 }} disabled={!ok} onClick={() => {
          db.update<User>(C.users, invited.id, { name: name.trim(), status: 'Active', passwordSet: true, inviteToken: undefined, sessions: [{ id: 's1', device: 'This browser', at: new Date().toISOString(), current: true }] });
          db.insert(C.audit, { companyId: invited.companyIds[0], tenantId: invited.tenantId, at: new Date().toISOString(), actor: name.trim(), actorId: invited.id, action: 'auth.invite_accepted', objectType: 'User', objectId: invited.id, result: 'Success', correlationId: 'corr_' + Date.now().toString(36).toUpperCase(), channel: 'web', detail: `Activated · ${roles.join(', ')}`, sensitive: true });
          db.insert(C.notifications, { companyId: invited.companyIds[0], at: new Date().toISOString(), type: 'security', title: `${name.trim()} accepted the invitation`, body: `${invited.email} is now active with ${roles.join(', ')}`, link: `admin/users/${invited.id}`, read: false, status: 'delivered', channel: 'in-app' });
          nav.replace('home');
          session.login(invited.id, { skipMfa: true });
        }}>Activate account</Button>
        <Button variant="link" onClick={() => session.setAuth('login', { inviteToken: undefined })}>← Back to sign in</Button>
      </div>
    </Frame>
  );
}

function ChooseCompany() {
  const s = useSession();
  const [q, setQ] = useState('');
  const list = s.companies.filter((c) => `${c.legalName} ${c.tradeName} ${c.country}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Frame title="Choose a company" subtitle={`${s.user?.name}, you have access to ${s.companies.length} companies. Permissions, defaults, currency and periods follow the company you pick.`}>
      <TextField value={q} onChange={setQ} placeholder="Search companies…" autoFocus />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
        {list.map((c) => (
          <button key={c.id} type="button" className="menu-item" style={{ height: 'auto', padding: '10px 12px', border: '1px solid var(--line)' }} onClick={() => session.chooseCompany(c.id)}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: c.brandColor ?? 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, marginRight: 8 }}>{c.logoText ?? c.legalName[0]}</div>
            <TwoLine primary={c.legalName} secondary={`${c.country} · ${c.baseCurrency} · ${c.nature}`} />
          </button>
        ))}
        {list.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-3)', padding: 8 }}>No company matches "{q}".</div>}
      </div>
      <Button variant="link" style={{ marginTop: 16 }} onClick={() => session.logout()}>Sign out</Button>
    </Frame>
  );
}
