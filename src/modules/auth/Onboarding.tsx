// Company onboarding wizard — 9 steps (FR-ORG-004/010, FR-BIZ-001..004, design §6.5).
// Persists every step into the Company record; mandatory steps carry no skip link.
import { useMemo, useState } from 'react';
import { CheckIcon, ChevronRightIcon } from '../../components/Icons';
import { db, C, session, useSession, engine, nav } from '../../store';
import type { Company, Registration, Address, Role, User, Tenant, Plan } from '../../store';
import { fiscalYearOf, periodCodeOf, today, uid, stateNameOf } from '../../lib/format';
import { Backdrop, BrandMark } from './Frame';
import { ensureFyPeriods, ensureDefaultSeries, markOnboardingComplete, profilesForNature, saveOnboardingStep, templateForNature } from './provision';
import { StepNature, StepLegal, StepAddress, StepCurrency, StepPeriods, StepUsers, StepMasters, StepOpening, StepReady } from './OnboardingSteps';

export const STEPS = [
  { id: 1, key: 'nature', label: 'Business nature', sub: 'What does your business do?', mandatory: true },
  { id: 2, key: 'legal', label: 'Legal identity & registrations', sub: 'Company, PAN & GSTIN', mandatory: true },
  { id: 3, key: 'address', label: 'Address & branches', sub: 'Registered address', mandatory: true },
  { id: 4, key: 'currency', label: 'Currency & calendar', sub: 'Currency, FY, time zone, locale', mandatory: true },
  { id: 5, key: 'periods', label: 'Financial year & periods', sub: 'Books-from & opening dates', mandatory: true },
  { id: 6, key: 'users', label: 'Users & roles', sub: 'Invite your team', mandatory: false },
  { id: 7, key: 'masters', label: 'Masters', sub: 'Import or start fresh', mandatory: false },
  { id: 8, key: 'opening', label: 'Opening balances', sub: 'Import, enter or skip', mandatory: false },
  { id: 9, key: 'ready', label: 'Ready to go', sub: 'Review & launch', mandatory: true },
] as const;

export interface WizardState {
  nature: Company['nature'] | '';
  characteristics: string[];
  overrides: Record<string, string[]>;
  legalName: string; tradeName: string; businessType: string; pan: string; cin: string;
  registrations: Registration[];
  address: Address; phone: string; email: string; website: string;
  extraBranches: { id: string; name: string; type: 'Office' | 'Warehouse' | 'Store' | 'Factory'; city: string; stateCode?: string }[];
  baseCurrency: string; reportingCurrency: string; permitted: string[]; timeZone: string; locale: string; fyStart: number;
  booksFrom: string; openingBalanceDate: string;
  invites: { id: string; email: string; roleId: string }[];
  mastersChoice: 'import' | 'start' | '';
  openingChoice: 'import' | 'manual' | 'skip' | '';
}

function initialState(co: Company | undefined): WizardState {
  return {
    nature: co?.nature ?? '', characteristics: co?.characteristics ?? [], overrides: {},
    legalName: co?.legalName ?? '', tradeName: co?.tradeName ?? '', businessType: co?.businessType ?? 'Private Limited', pan: co?.pan ?? '', cin: co?.cin ?? '',
    registrations: co?.registrations ?? [],
    address: co?.address ?? { line1: '', city: '', state: '', pin: '', country: co?.country ?? 'IN' }, phone: co?.phone ?? '', email: co?.email ?? '', website: co?.website ?? '',
    extraBranches: [],
    baseCurrency: co?.baseCurrency ?? 'INR', reportingCurrency: co?.reportingCurrency ?? '', permitted: co?.permittedCurrencies ?? ['INR'], timeZone: co?.timeZone ?? 'Asia/Kolkata', locale: co?.locale ?? 'en-IN', fyStart: co?.fiscalYearStartMonth ?? 4,
    booksFrom: co?.booksFrom ?? today(), openingBalanceDate: co?.openingBalanceDate ?? today(),
    invites: [], mastersChoice: '', openingChoice: '',
  };
}

export default function Onboarding({ onComplete }: { onComplete?: () => void }) {
  const sess = useSession();
  const company = sess.company;
  const [step, setStep] = useState(1);
  const [s, setS] = useState<WizardState>(() => initialState(company));
  const [err, setErr] = useState<string | null>(null);
  const set = (patch: Partial<WizardState>) => setS((prev) => ({ ...prev, ...patch }));
  const template = useMemo(() => (s.nature ? templateForNature(s.nature) : undefined), [s.nature]);
  const totalSteps = STEPS.length;
  const hasPostedJournal = !!company && db.count(C.journals, (j) => j.companyId === company.id && j.status === 'Posted') > 0;

  if (!company) {
    return (
      <Backdrop>
        <div style={{ width: 440, maxWidth: '100%', background: '#fff', borderRadius: 16, padding: 40, boxShadow: '0 8px 48px rgba(0,0,0,0.10)' }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>No workspace to set up</h1>
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>Create a workspace first, or sign in to an existing company.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={() => session.setAuth('register')}>Start free trial</button>
            <button type="button" className="btn-secondary" onClick={() => session.setAuth('login')}>Sign in</button>
          </div>
        </div>
      </Backdrop>
    );
  }

  const canProceed = (): string | null => {
    if (step === 1) return s.nature ? null : 'Choose a business nature';
    if (step === 2) {
      if (!s.legalName.trim()) return 'Legal name is required';
      if (company.localizationPack === 'IN' && s.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s.pan)) return 'PAN format is invalid';
      const bad = s.registrations.find((r) => r.type === 'GSTIN' && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(r.number));
      return bad ? `GSTIN ${bad.number || '(empty)'} is invalid` : null;
    }
    if (step === 3) return s.address.line1.trim() && s.address.city.trim() && s.address.state ? null : 'Address line, city and state are required';
    if (step === 4) return s.baseCurrency ? null : 'Base currency is required';
    if (step === 5) return s.booksFrom && s.openingBalanceDate ? (s.openingBalanceDate < s.booksFrom ? 'Opening-balance date cannot be before the books-from date' : null) : 'Both dates are required';
    if (step === 6) { const bad = s.invites.find((i) => i.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.email)); return bad ? `"${bad.email}" is not a valid email` : null; }
    return null;
  };

  /** Persist the current step, then advance. */
  const persist = (): boolean => {
    const cid = company.id;
    try {
      if (step === 1 && s.nature) {
        const prev = company.profiles;
        const next = profilesForNature(s.nature);
        saveOnboardingStep(cid, { nature: s.nature, profiles: next, characteristics: s.characteristics, profileHistory: JSON.stringify(prev) === JSON.stringify(next) ? company.profileHistory : [...company.profileHistory, { at: new Date().toISOString(), by: sess.user?.name ?? 'owner', from: prev, to: next, reason: 'Onboarding wizard' }] }, { nature: 'Done' });
        engine.audit({ action: 'onboarding.nature', objectType: 'Company', objectId: cid, detail: `${s.nature} · ${s.characteristics.join(', ') || 'no secondary characteristics'}${Object.keys(s.overrides).length ? ' · overrides: ' + Object.keys(s.overrides).join(', ') : ''}` });
      }
      if (step === 2) saveOnboardingStep(cid, { legalName: s.legalName.trim(), tradeName: s.tradeName.trim() || s.legalName.trim(), businessType: s.businessType, pan: s.pan || undefined, cin: s.cin || undefined, registrations: s.registrations, logoText: (s.tradeName || s.legalName).trim().charAt(0).toUpperCase() }, { legal: 'Done' });
      if (step === 3) {
        saveOnboardingStep(cid, { address: s.address, phone: s.phone || undefined, email: s.email || undefined, website: s.website || undefined }, { address: 'Done' });
        db.transaction(() => {
          const ho = db.findBy<any>(C.branches, (b) => b.companyId === cid && b.isDefault);
          if (ho) db.update<any>(C.branches, ho.id, { address: s.address, gstin: s.registrations.find((r) => r.branchId === ho.id || !r.branchId)?.number, registrationId: s.registrations.find((r) => r.branchId === ho.id || !r.branchId)?.id });
          s.extraBranches.forEach((b, i) => {
            if (!b.name.trim() || db.findBy<any>(C.branches, (x) => x.companyId === cid && x.name === b.name)) return;
            db.insert(C.branches, { companyId: cid, code: `BR-${String(i + 2).padStart(3, '0')}`, name: b.name.trim(), type: b.type, address: { line1: '', city: b.city, state: stateNameOf(b.stateCode ?? '') ?? '', stateCode: b.stateCode, pin: '', country: s.address.country }, status: 'Active', isDefault: false });
          });
        });
      }
      if (step === 4) saveOnboardingStep(cid, { baseCurrency: hasPostedJournal ? company.baseCurrency : s.baseCurrency, reportingCurrency: s.reportingCurrency || undefined, permittedCurrencies: Array.from(new Set([s.baseCurrency, ...s.permitted])), timeZone: s.timeZone, locale: s.locale, fiscalYearStartMonth: s.fyStart }, { currency: 'Done' });
      if (step === 5) {
        saveOnboardingStep(cid, { booksFrom: s.booksFrom, openingBalanceDate: s.openingBalanceDate }, { periods: 'Done' });
        ensureFyPeriods(cid, s.fyStart, s.booksFrom, { openFrom: s.booksFrom });
        ensureFyPeriods(cid, s.fyStart, today());
        ensureDefaultSeries(cid, s.fyStart);
        const p = engine.periodFor(s.openingBalanceDate, cid);
        if (p?.status === 'Locked') saveOnboardingStep(cid, {}, { opening: 'Blocked' });
        engine.audit({ action: 'onboarding.periods', objectType: 'Company', objectId: cid, detail: `Books from ${s.booksFrom} · opening balances ${s.openingBalanceDate} · FY starts month ${s.fyStart}` });
      }
      if (step === 6) {
        const tenant = db.find<Tenant>(C.tenants, company.tenantId);
        const plan = db.find<Plan>(C.plans, tenant?.planId);
        const limit = plan?.limits.users ?? 999;
        const current = db.count(C.users, (u) => u.tenantId === company.tenantId);
        const valid = s.invites.filter((i) => i.email.trim() && i.roleId);
        if (current + valid.length > limit) throw new Error(`Your ${plan?.name} plan allows ${limit} users — remove ${current + valid.length - limit} invite(s) or upgrade the plan.`);
        db.transaction(() => {
          valid.forEach((i) => {
            const email = i.email.trim().toLowerCase();
            if (db.findBy<User>(C.users, (u) => u.email.toLowerCase() === email)) return;
            const token = uid('inv');
            const u = db.insert<User>(C.users, { companyId: cid, tenantId: company.tenantId, name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), email, roleIds: [i.roleId], companyIds: [cid], branchIds: [], status: 'Invited', mfaEnabled: false, passwordSet: false, invitedAt: new Date().toISOString(), inviteToken: token });
            engine.audit({ action: 'user.invited', objectType: 'User', objectId: u.id, detail: `${email} · ${db.find<Role>(C.roles, i.roleId)?.name}`, sensitive: true });
            engine.notify({ type: 'system', title: `Invitation sent to ${email}`, body: `Role ${db.find<Role>(C.roles, i.roleId)?.name} · expires in 14 days`, link: `admin/users/${u.id}` });
          });
        });
        saveOnboardingStep(cid, {}, { users: 'Done' });
        if (tenant) db.update<Tenant>(C.tenants, tenant.id, { usage: { ...tenant.usage, users: current + valid.length } });
      }
      if (step === 7) saveOnboardingStep(cid, {}, { masters: s.mastersChoice === 'start' ? 'Done' : 'Pending' });
      if (step === 8) saveOnboardingStep(cid, {}, { opening: s.openingChoice === 'skip' ? 'Done' : company.onboarding.opening === 'Blocked' ? 'Blocked' : 'Pending' });
      setErr(null);
      return true;
    } catch (e: any) {
      setErr(e?.message ?? 'Could not save this step');
      return false;
    }
  };

  const next = () => { const v = canProceed(); if (v) { setErr(v); return; } if (persist()) setStep((x) => Math.min(totalSteps, x + 1)); };
  const skip = () => { setErr(null); setStep((x) => Math.min(totalSteps, x + 1)); };
  const finish = () => {
    markOnboardingComplete(company.id);
    const uid_ = sess.user?.id ?? sess.state.userId;
    if (uid_) {
      session.login(uid_, { skipMfa: true });
      if (session.get().auth !== 'app') session.chooseCompany(company.id);
      else if (session.get().companyId !== company.id) session.switchCompany(company.id);
      session.setAuth('app', { fy: fiscalYearOf(today(), s.fyStart), periodCode: periodCodeOf(today()), loginBanner: `Welcome to ${company.tradeName || company.legalName} — setup complete` });
    } else session.setAuth('login');
    onComplete?.();
    nav.go(s.mastersChoice === 'import' ? 'masters' : 'home');
  };

  const cur = STEPS[step - 1];
  const stepProps = { s, set, company, template, hasPostedJournal };
  return (
    <Backdrop>
      <div className="auth-split" style={{ width: '100%', maxWidth: 1160, background: '#FFFFFF', borderRadius: 20, boxShadow: '0 12px 64px rgba(0,0,0,0.12)', display: 'flex', overflow: 'hidden', minHeight: 660, maxHeight: 'calc(100vh - 48px)' }}>
        {/* Left — explainer rail with vertical stepper */}
        <div className="auth-aside" style={{ width: 280, flexShrink: 0, background: 'var(--ink)', padding: '36px 28px', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
            <BrandMark size={34} />
            <span style={{ fontSize: 16, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.02em' }}>Elixir Books</span>
          </div>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Setup wizard</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>{company.tradeName || company.legalName}. About 5 minutes — optional steps can be set up later.</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
            {STEPS.map((st, i) => {
              const done = st.id < step;
              const current = st.id === step;
              return (
                <div key={st.id} style={{ display: 'flex', gap: 12, cursor: done ? 'pointer' : 'default' }} onClick={() => done && setStep(st.id)}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 22 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? 'var(--accent)' : current ? '#FFFFFF' : 'transparent', border: done || current ? 'none' : '1.5px solid rgba(255,255,255,0.2)', fontSize: 11, fontWeight: 700, color: done ? '#FFFFFF' : current ? 'var(--ink)' : 'rgba(255,255,255,0.3)', transition: 'all 0.2s' }}>
                      {done ? <CheckIcon size={11} color="#FFFFFF" /> : st.id}
                    </div>
                    {i < STEPS.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 18, background: done ? 'var(--accent)' : 'rgba(255,255,255,0.1)', margin: '3px 0' }} />}
                  </div>
                  <div style={{ paddingBottom: i < STEPS.length - 1 ? 14 : 0, paddingTop: 2, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: current ? 600 : 400, color: st.id > step ? 'rgba(255,255,255,0.35)' : current ? '#FFFFFF' : 'rgba(255,255,255,0.65)' }}>
                      {st.label}{!st.mandatory && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginLeft: 6 }}>optional</span>}
                    </div>
                    {current && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{st.sub}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 20, padding: '10px 14px', background: 'rgba(255,255,255,0.06)', borderRadius: 8, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
            Step {step} of {totalSteps}
            <div style={{ marginTop: 8, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${((step - 1) / (totalSteps - 1)) * 100}%`, background: 'var(--accent)', borderRadius: 9999, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>

        {/* Right — step content */}
        <div className="auth-main" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div className="auth-main-head" style={{ padding: '14px 44px', borderBottom: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <span>Step {step} of {totalSteps}: <strong style={{ color: 'var(--ink)' }}>{cur.label}</strong></span>
            <span>{company.legalName} · {company.country} · {company.baseCurrency}</span>
          </div>
          <div className="auth-main-body" style={{ flex: 1, padding: '32px 44px', overflow: 'auto' }}>
            {step === 1 && <StepNature {...stepProps} />}
            {step === 2 && <StepLegal {...stepProps} />}
            {step === 3 && <StepAddress {...stepProps} />}
            {step === 4 && <StepCurrency {...stepProps} />}
            {step === 5 && <StepPeriods {...stepProps} />}
            {step === 6 && <StepUsers {...stepProps} />}
            {step === 7 && <StepMasters {...stepProps} />}
            {step === 8 && <StepOpening {...stepProps} />}
            {step === 9 && <StepReady {...stepProps} />}
            {err && <div className="banner danger" style={{ marginTop: 20 }}>{err}</div>}
          </div>
          <div style={{ padding: '14px 44px', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#FFFFFF' }}>
            <div>{step > 1 && <button type="button" className="btn-secondary" onClick={() => { setErr(null); setStep((x) => Math.max(1, x - 1)); }}>← Back</button>}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {!cur.mandatory && <button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={skip}>Set this up later</button>}
              {step < totalSteps ? (
                <button type="button" className="btn-primary" style={{ gap: 6 }} onClick={next}>Continue <ChevronRightIcon size={14} color="currentColor" /></button>
              ) : (
                <button type="button" className="btn-primary" style={{ gap: 6, padding: '0 24px' }} onClick={finish}>Go to dashboard →</button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Backdrop>
  );
}
