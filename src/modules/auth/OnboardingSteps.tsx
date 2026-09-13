// Step bodies for the onboarding wizard. Each receives the wizard state + setter and the company.
import { useMemo, useState } from 'react';
import { CheckIcon } from '../../components/Icons';
import { db, C, useCollection, useSession } from '../../store';
import type { Company, OperatingProfileTemplate, Registration, Role, Plan, Tenant } from '../../store';
import { INDIA_STATES, stateNameOf, fmtDate, uid, validateGSTIN } from '../../lib/format';
import { TextField, SelectField, IdentifierField, ChipGroup, CheckboxField, DateField, Segmented } from '../../components/ui/fields';
import { Badge, Button, Checklist, Pill } from '../../components/ui';
import type { WizardState } from './Onboarding';
import { BUSINESS_TYPES, CURRENCIES, LOCALES, TIME_ZONES, buildFyPeriods, readinessFor } from './provision';

interface StepProps { s: WizardState; set: (p: Partial<WizardState>) => void; company: Company; template?: OperatingProfileTemplate; hasPostedJournal: boolean }

const NATURES = [
  { id: 'Trading', label: 'Trading', icon: '🏬', desc: 'Buy, stock, and sell physical goods', color: '#F97316' },
  { id: 'Services', label: 'Services', icon: '💼', desc: 'Time, projects, subscriptions & retainers', color: '#38BDF8' },
  { id: 'Manufacturing', label: 'Manufacturing', icon: '🏭', desc: 'Produce and sell finished goods', color: '#22C55E' },
  { id: 'Hybrid', label: 'Hybrid', icon: '⚡', desc: 'Combination of the profiles above', color: '#A855F7' },
] as const;

function H({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0A0A0A', marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 14, color: '#5F6368', marginBottom: 28, lineHeight: 1.6 }}>{sub}</p>
    </>
  );
}

// ── 1. Business nature ──────────────────────────────────────────────────────
export function StepNature({ s, set, template }: StepProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const rows: { key: string; label: string; values: string[]; options: string[] }[] = template ? [
    { key: 'modules', label: 'Modules', values: s.overrides.modules ?? template.modules, options: Array.from(new Set([...template.modules, 'crm', 'sales', 'purchase', 'inventory', 'pos', 'projects', 'production', 'accounting', 'banking', 'taxation', 'payroll', 'fixed-assets', 'budgets', 'reports'])) },
    { key: 'coa', label: 'Chart of accounts', values: [template.coaTemplate], options: [template.coaTemplate, 'Minimal COA', 'Custom (import)'] },
    { key: 'dimensions', label: 'Dimensions', values: s.overrides.dimensions ?? template.dimensions, options: ['Branch', 'Department', 'CostCentre', 'ProfitCentre', 'Project', 'Employee', 'ProductLine'] },
    { key: 'roles', label: 'Roles', values: s.overrides.roles ?? template.roles, options: Array.from(new Set([...template.roles, 'Accountant', 'Finance Admin', 'Sales User', 'Sales Manager', 'Purchase Manager', 'Warehouse User', 'Cashier', 'HR / Payroll', 'Auditor (Read-only)'])) },
    { key: 'workflows', label: 'Workflows', values: s.overrides.workflows ?? template.workflows, options: Array.from(new Set([...template.workflows, 'PO approval', 'Invoice > 50k', 'Credit note', 'Journal approval', 'Payment batch', 'Expense claim'])) },
    { key: 'numbering', label: 'Number series', values: s.overrides.numbering ?? template.numbering, options: template.numbering },
    { key: 'dashboards', label: 'Dashboards & reports', values: [...template.dashboards, ...template.reports], options: [...template.dashboards, ...template.reports] },
  ] : [];
  return (
    <div>
      <H title="What does your business do?" sub="This shapes your navigation, default accounts, roles, workflows and document templates. Recommendations are proposed — review and change anything before it is activated (FR-BIZ-004)." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
        {NATURES.map((n) => (
          <button key={n.id} type="button" onClick={() => set({ nature: n.id, characteristics: [], overrides: {} })} style={{ padding: '16px', border: `1.5px solid ${s.nature === n.id ? n.color : '#EAEAEA'}`, borderRadius: 12, background: s.nature === n.id ? `${n.color}10` : '#FAFAFA', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 26 }}>{n.icon}</span>
              {s.nature === n.id && <div style={{ width: 20, height: 20, borderRadius: '50%', background: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CheckIcon size={11} color="#FFFFFF" /></div>}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>{n.label}</div>
              <div style={{ fontSize: 12, color: '#6E6E71', lineHeight: 1.4 }}>{n.desc}</div>
            </div>
          </button>
        ))}
      </div>
      {template && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <ChipGroup label="Secondary characteristics" multiple value={s.characteristics} onChange={(v: string[]) => set({ characteristics: v })} options={template.secondaryCharacteristics} />
            <div className="field-help" style={{ marginTop: 6 }}>Refines defaults such as batch tracking, POS, milestone billing or subcontracting.</div>
          </div>
          <div className="card" style={{ padding: 16, background: '#F9FBFC' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Recommended setup</div>
              <span style={{ fontSize: 11, color: '#5F6368' }}>{template.name} · template v{template.templateVersion}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rows.map((r) => (
                <div key={r.key} style={{ fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: '#5F6368', width: 120, flexShrink: 0, paddingTop: 2 }}>{r.label}</span>
                    <span style={{ flex: 1, color: '#0A0A0A', lineHeight: 1.5 }}>{r.values.join(', ') || '—'}{s.overrides[r.key] && <Pill tone="warning" title="Overridden from the template">changed</Pill>}</span>
                    {['modules', 'dimensions', 'roles', 'workflows'].includes(r.key) && <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => setEditing(editing === r.key ? null : r.key)}>{editing === r.key ? 'Done' : 'Change'}</button>}
                  </div>
                  {editing === r.key && (
                    <div style={{ margin: '6px 0 4px 128px' }}>
                      <ChipGroup multiple value={r.values} onChange={(v: string[]) => set({ overrides: { ...s.overrides, [r.key]: v } })} options={r.options} />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: '#6E6E71', marginTop: 10 }}>Terminology: {Object.entries(template.terminology).map(([k, v]) => `${k} → ${v}`).join(' · ') || 'standard'}. Overrides are applied within your plan entitlements and localization pack.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 2. Legal identity & registrations ──────────────────────────────────────
export function StepLegal({ s, set, company }: StepProps) {
  const isIN = company.localizationPack === 'IN';
  const regs = s.registrations;
  const setReg = (id: string, patch: Partial<Registration>) => set({ registrations: regs.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const addReg = () => set({ registrations: [...regs, { id: uid('reg'), type: isIN ? 'GSTIN' : 'TRN', number: '', status: 'Active', isSez: false }] });
  return (
    <div>
      <H title="Legal identity" sub="Used on every statutory document — invoices, challans and returns. Identifiers are validated by the localization pack (FR-ORG-007)." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
        <TextField label="Legal name" required value={s.legalName} onChange={(v) => set({ legalName: v })} placeholder="Acme Private Limited" autoFocus />
        <TextField label="Trade name" value={s.tradeName} onChange={(v) => set({ tradeName: v })} placeholder="Acme" help="Shown in the sidebar and on documents when set" />
        <SelectField label="Business type" value={s.businessType} onChange={(v) => set({ businessType: v })} options={BUSINESS_TYPES} />
        {isIN ? <IdentifierField kind="PAN" label="PAN" value={s.pan} onChange={(v) => set({ pan: v })} help="10 characters · used to derive GSTINs" /> : <TextField label="Tax registration / company number" value={s.pan} onChange={(v) => set({ pan: v })} />}
        <TextField label="CIN / registration number" value={s.cin} onChange={(v) => set({ cin: v })} placeholder="U74999MH2010PTC123456" uppercase />
      </div>
      <div style={{ marginTop: 24, maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>{isIN ? 'GST registrations' : 'Tax registrations'}</div>
          <Button size="sm" variant="secondary" onClick={addReg}>+ Add {isIN ? 'GSTIN' : 'registration'}</Button>
        </div>
        {regs.length === 0 && <div className="banner info">Add one registration per state. The state is read from the first two digits of the GSTIN; mark SEZ units so supplies are zero-rated correctly.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {regs.map((r) => {
            const err = r.type === 'GSTIN' ? validateGSTIN(r.number) : null;
            const state = r.type === 'GSTIN' && r.number.length >= 2 ? stateNameOf(r.number.slice(0, 2)) : undefined;
            return (
              <div key={r.id} className="card" style={{ padding: 12, display: 'grid', gridTemplateColumns: '1.4fr 1fr auto auto', gap: 12, alignItems: 'end' }}>
                <IdentifierField kind={r.type === 'GSTIN' ? 'GSTIN' : 'TRN'} label={r.type} value={r.number} onChange={(v) => setReg(r.id, { number: v, state: v.length >= 2 ? stateNameOf(v.slice(0, 2)) : undefined, stateCode: v.length >= 2 ? v.slice(0, 2) : undefined })} size="sm" />
                <div>
                  <label className="field-label">State</label>
                  <div style={{ height: 32, display: 'flex', alignItems: 'center', fontSize: 13 }}>{state ? `${state} (${r.number.slice(0, 2)})` : <span style={{ color: '#B0B5BF' }}>auto from GSTIN</span>}</div>
                </div>
                <CheckboxField checked={!!r.isSez} onChange={(v) => setReg(r.id, { isSez: v })} label="SEZ unit" style={{ paddingBottom: 8 }} />
                <Button size="sm" variant="ghost" onClick={() => set({ registrations: regs.filter((x) => x.id !== r.id) })}>Remove</Button>
                {err && r.number && <div className="field-error" style={{ gridColumn: '1 / -1', marginTop: -4 }}>{err}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── 3. Address & branches ──────────────────────────────────────────────────
export function StepAddress({ s, set, company }: StepProps) {
  const isIN = company.country === 'IN';
  const a = s.address;
  const setA = (p: Partial<WizardState['address']>) => set({ address: { ...a, ...p } });
  return (
    <div>
      <H title="Registered address & branches" sub="Printed on tax invoices and returns. Your head office is created as the default branch; add stores, warehouses or offices now or later under Company administration." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
        <TextField label="Address line 1" required value={a.line1} onChange={(v) => setA({ line1: v })} placeholder="Plot 14, Andheri Industrial Estate" autoFocus style={{ gridColumn: '1 / -1' }} />
        <TextField label="Address line 2" value={a.line2 ?? ''} onChange={(v) => setA({ line2: v })} style={{ gridColumn: '1 / -1' }} />
        <TextField label="City / district" required value={a.city} onChange={(v) => setA({ city: v })} placeholder="Mumbai" />
        {isIN ? (
          <SelectField label="State" required value={a.stateCode ?? ''} onChange={(code) => setA({ stateCode: code, state: stateNameOf(code) ?? '' })} options={INDIA_STATES.map((st) => ({ value: st.code, label: `${st.name} (${st.code})` }))} placeholder="— Select state —" />
        ) : (
          <TextField label="State / emirate / region" required value={a.state} onChange={(v) => setA({ state: v })} />
        )}
        {isIN ? <IdentifierField kind="PIN" label="PIN code" value={a.pin ?? ''} onChange={(v) => setA({ pin: v })} /> : <TextField label="Postal code" value={a.pin ?? ''} onChange={(v) => setA({ pin: v })} />}
        <TextField label="Phone" value={s.phone} onChange={(v) => set({ phone: v })} placeholder="+91 22 4001 1234" />
        <IdentifierField kind="EMAIL" label="Accounts email" value={s.email} onChange={(v) => set({ email: v })} />
        <TextField label="Website" value={s.website} onChange={(v) => set({ website: v })} placeholder="acmepvt.com" />
      </div>
      <div style={{ marginTop: 24, maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Branches & locations</div>
          <Button size="sm" variant="secondary" onClick={() => set({ extraBranches: [...s.extraBranches, { id: uid('br'), name: '', type: 'Warehouse', city: '' }] })}>+ Add branch</Button>
        </div>
        <div className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, marginBottom: 8 }}>
          <Badge status="Active">Default</Badge> <span>Head Office · Office · {a.city || 'city'}{a.state ? `, ${a.state}` : ''}</span>
        </div>
        {s.extraBranches.map((b) => (
          <div key={b.id} className="card" style={{ padding: 12, display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 8 }}>
            <TextField label="Name" value={b.name} onChange={(v) => set({ extraBranches: s.extraBranches.map((x) => (x.id === b.id ? { ...x, name: v } : x)) })} size="sm" placeholder="Pune Depot" />
            <SelectField label="Type" value={b.type} onChange={(v) => set({ extraBranches: s.extraBranches.map((x) => (x.id === b.id ? { ...x, type: v as any } : x)) })} options={['Office', 'Warehouse', 'Store', 'Factory']} size="sm" />
            <TextField label="City" value={b.city} onChange={(v) => set({ extraBranches: s.extraBranches.map((x) => (x.id === b.id ? { ...x, city: v } : x)) })} size="sm" />
            {isIN ? <SelectField label="State" value={b.stateCode ?? ''} onChange={(v) => set({ extraBranches: s.extraBranches.map((x) => (x.id === b.id ? { ...x, stateCode: v } : x)) })} options={INDIA_STATES.map((st) => ({ value: st.code, label: st.name }))} size="sm" placeholder="—" /> : <div />}
            <Button size="sm" variant="ghost" onClick={() => set({ extraBranches: s.extraBranches.filter((x) => x.id !== b.id) })}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 4. Currency, fiscal calendar, time zone, locale ────────────────────────
export function StepCurrency({ s, set, hasPostedJournal }: StepProps) {
  const fyOptions = [{ value: '1', label: 'January' }, { value: '4', label: 'April' }, { value: '7', label: 'July' }, { value: '10', label: 'October' }];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const endMonth = MONTHS[(s.fyStart + 10) % 12];
  return (
    <div>
      <H title="Currency, fiscal calendar and locale" sub="Base currency is locked after the first posted journal (a governed migration is required to change it). Locale changes presentation only — never stored amounts." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 760 }}>
        <div>
          <label className="field-label">Base (functional) currency <span className="req">*</span></label>
          {[{ code: 'INR', label: 'Indian Rupee (₹)', sub: 'Recommended for India-based entities' }, { code: 'USD', label: 'US Dollar ($)' }, { code: 'AED', label: 'UAE Dirham (AED)' }, { code: 'GBP', label: 'Pound Sterling (£)' }, { code: 'EUR', label: 'Euro (€)' }].map((c) => (
            <label key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', border: `1px solid ${s.baseCurrency === c.code ? '#325CFF' : '#EAEAEA'}`, borderRadius: 8, marginBottom: 8, cursor: hasPostedJournal ? 'not-allowed' : 'pointer', background: s.baseCurrency === c.code ? '#F2F7FF' : '#FAFAFA', opacity: hasPostedJournal && s.baseCurrency !== c.code ? 0.5 : 1 }}>
              <input type="radio" name="currency" value={c.code} checked={s.baseCurrency === c.code} disabled={hasPostedJournal} onChange={() => set({ baseCurrency: c.code, permitted: Array.from(new Set([c.code, ...s.permitted])) })} style={{ accentColor: '#325CFF' }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A' }}>{c.label}</div>
                {c.sub && <div style={{ fontSize: 12, color: '#5F6368' }}>{c.sub}</div>}
              </div>
            </label>
          ))}
          {hasPostedJournal && <div className="field-help">Locked — journals have been posted in {s.baseCurrency}.</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SelectField label="Reporting currency (optional)" value={s.reportingCurrency} onChange={(v) => set({ reportingCurrency: v })} options={CURRENCIES.filter((c) => c !== s.baseCurrency)} placeholder="— Same as base —" allowEmpty help="Used for translated management reports and group consolidation" />
          <ChipGroup label="Permitted transaction currencies" multiple value={s.permitted} onChange={(v: string[]) => set({ permitted: Array.from(new Set([s.baseCurrency, ...v])) })} options={CURRENCIES} />
          <SelectField label="Time zone" value={s.timeZone} onChange={(v) => set({ timeZone: v })} options={TIME_ZONES} />
          <SelectField label="Locale / language" value={s.locale} onChange={(v) => set({ locale: v })} options={LOCALES} />
          <div>
            <label className="field-label">Fiscal year starts</label>
            <Segmented value={String(s.fyStart)} onChange={(v) => set({ fyStart: Number(v) })} options={fyOptions} />
            <div className="field-help">{MONTHS[s.fyStart - 1]} – {endMonth}{s.fyStart === 4 ? ' (Indian fiscal year)' : ''} · label shown as FY {s.fyStart === 1 ? 'YYYY' : 'YYYY–YY'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 5. Financial year & periods ────────────────────────────────────────────
export function StepPeriods({ s, set, company }: StepProps) {
  const preview = useMemo(() => buildFyPeriods(company.id, s.fyStart, s.booksFrom || undefined, { openFrom: s.booksFrom }), [company.id, s.fyStart, s.booksFrom]);
  const existing = useCollection<any>(C.periods).filter((p) => p.companyId === company.id);
  return (
    <div>
      <H title="Financial year and periods" sub="Books-from is the first date you will post transactions; the opening-balance date is where balances from your previous system land. The fiscal year is generated as 12 monthly periods (FR-ORG-004)." />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 520, marginBottom: 20 }}>
        <DateField label="Books from" required value={s.booksFrom} onChange={(v) => set({ booksFrom: v, openingBalanceDate: s.openingBalanceDate < v ? v : s.openingBalanceDate })} />
        <DateField label="Opening-balance date" required value={s.openingBalanceDate} onChange={(v) => set({ openingBalanceDate: v })} min={s.booksFrom} />
      </div>
      <div className="section-title">Periods to be generated · FY {preview[0]?.fy}</div>
      <div className="card" style={{ overflow: 'hidden', maxWidth: 720 }}>
        <table className="data-table dense">
          <thead><tr><th>Period</th><th>Start</th><th>End</th><th>Status</th></tr></thead>
          <tbody>
            {preview.map((p) => {
              const ex = existing.find((e) => e.code === p.code);
              return (
                <tr key={p.code}>
                  <td style={{ fontWeight: 500 }}>{p.label}</td><td>{fmtDate(p.start)}</td><td>{fmtDate(p.end)}</td>
                  <td><Badge status={ex?.status ?? p.status} />{ex && <span style={{ fontSize: 11, color: '#6E6E71', marginLeft: 6 }}>exists</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── 6. Users & roles ───────────────────────────────────────────────────────
export function StepUsers({ s, set, company }: StepProps) {
  const roles = useCollection<Role>(C.roles).filter((r) => !r.isSystem || r.code !== 'OWNER');
  const tenant = db.find<Tenant>(C.tenants, company.tenantId);
  const plan = db.find<Plan>(C.plans, tenant?.planId);
  const current = db.count(C.users, (u) => u.tenantId === company.tenantId);
  const limit = plan?.limits.users;
  return (
    <div>
      <H title="Invite your team" sub="Each person gets their own login with the permissions you assign. Invitations expire after 14 days and can be resent from Users & access." />
      <div style={{ maxWidth: 640 }}>
        {s.invites.map((i) => (
          <div key={i.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
            <IdentifierField kind="EMAIL" label="Email" value={i.email} onChange={(v) => set({ invites: s.invites.map((x) => (x.id === i.id ? { ...x, email: v } : x)) })} size="sm" />
            <SelectField label="Role" value={i.roleId} onChange={(v) => set({ invites: s.invites.map((x) => (x.id === i.id ? { ...x, roleId: v } : x)) })} options={roles.map((r) => ({ value: r.id, label: r.name }))} size="sm" placeholder="— Role —" />
            <Button size="sm" variant="ghost" onClick={() => set({ invites: s.invites.filter((x) => x.id !== i.id) })}>Remove</Button>
          </div>
        ))}
        <Button variant="secondary" onClick={() => set({ invites: [...s.invites, { id: uid('inv'), email: '', roleId: roles.find((r) => r.code === 'ACCOUNTANT')?.id ?? roles[0]?.id ?? '' }] })}>+ Add person</Button>
        <div style={{ marginTop: 20, padding: '14px 16px', background: '#F9FBFC', border: '1px solid #EAEAEA', borderRadius: 8, fontSize: 13, color: '#5F6368', lineHeight: 1.6 }}>
          {plan ? <>Your <strong>{plan.name}</strong> plan includes <strong>{limit}</strong> users · {current} in use · {s.invites.filter((i) => i.email).length} to invite.</> : null} Users can belong to several companies and branches; data scope follows the role.
        </div>
      </div>
    </div>
  );
}

// ── 7. Masters ─────────────────────────────────────────────────────────────
export function StepMasters({ s, set, template }: StepProps) {
  const opts = [
    { id: 'import', icon: '📥', label: 'Import from CSV / Tally', desc: 'Customers, suppliers, items and chart of accounts through the import wizard (dry-run, row errors, duplicate blocking)' },
    { id: 'start', icon: '✨', label: 'Start with the recommended masters', desc: `${template?.coaTemplate ?? 'Standard COA'}, ${template?.dimensions.join(', ') ?? 'Branch'} dimensions, common UOMs, tax rates and payment terms` },
  ] as const;
  return (
    <div>
      <H title="Masters" sub="Bring in your existing masters, or start from the recommended set for your profile. Either way, masters stay editable under Masters & imports." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
        {opts.map((o) => <Choice key={o.id} selected={s.mastersChoice === o.id} onClick={() => set({ mastersChoice: o.id })} icon={o.icon} label={o.label} desc={o.desc} />)}
      </div>
      {template && (
        <div style={{ marginTop: 20, maxWidth: 560, fontSize: 12, color: '#5F6368' }}>
          Recommended imports for {template.name}: customers, suppliers, {template.terminology.item?.toLowerCase() ?? 'item'}s, price lists{template.nature === 'Manufacturing' || template.nature === 'Hybrid' ? ', BOMs, work centres' : ''}{template.nature === 'Services' ? ', rate cards, projects' : ''}.
        </div>
      )}
    </div>
  );
}

// ── 8. Opening balances ────────────────────────────────────────────────────
export function StepOpening({ s, set, company }: StepProps) {
  const blocked = company.onboarding.opening === 'Blocked';
  const opts = [
    { id: 'import', icon: '📥', label: 'Import trial balance', desc: 'Upload a trial balance CSV or Tally XML to populate balances as of the opening-balance date' },
    { id: 'manual', icon: '✏️', label: 'Enter manually', desc: 'Type opening balances account by account under Accounting › Opening balances' },
    { id: 'skip', icon: '⏭️', label: 'Start fresh', desc: 'No opening balances — for new businesses or trial runs' },
  ] as const;
  return (
    <div>
      <H title="Opening balances" sub={`Balances land on ${fmtDate(s.openingBalanceDate)} as an opening journal that must balance before it posts.`} />
      {blocked && <div className="banner danger" style={{ marginBottom: 14 }}>The opening-balance date falls in a locked period. Reopen the period or move the date before importing.</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
        {opts.map((o) => <Choice key={o.id} selected={s.openingChoice === o.id} onClick={() => set({ openingChoice: o.id })} icon={o.icon} label={o.label} desc={o.desc} />)}
      </div>
    </div>
  );
}

function Choice({ selected, onClick, icon, label, desc }: { selected: boolean; onClick: () => void; icon: string; label: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', border: `1.5px solid ${selected ? '#325CFF' : '#EAEAEA'}`, borderRadius: 10, background: selected ? '#F2F7FF' : '#FAFAFA', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s', fontFamily: 'inherit' }}>
      <span style={{ fontSize: 24, lineHeight: 1 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', marginBottom: 3 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#5F6368' }}>{desc}</div>
      </div>
      {selected && <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#325CFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><CheckIcon size={11} color="#FFFFFF" /></div>}
    </button>
  );
}

// ── 9. Ready to go ─────────────────────────────────────────────────────────
export function StepReady({ s, company }: StepProps) {
  const sess = useSession();
  const live = db.find<Company>(C.companies, company.id) ?? company;
  const rows = readinessFor(live);
  const done = rows.filter((r) => r.status === 'Done').length;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const items = [
    { label: 'Business nature', val: `${s.nature || live.nature} · ${live.profiles.join(' + ')}`, icon: '🏬' },
    { label: 'Company', val: `${s.legalName || live.legalName}${s.pan ? ` · PAN ${s.pan}` : ''}`, icon: '🏢' },
    { label: 'Registered address', val: s.address.city ? `${s.address.city}, ${s.address.state}${s.address.pin ? ' ' + s.address.pin : ''}` : '—', icon: '📍' },
    { label: 'Currency & locale', val: `${s.baseCurrency}${s.reportingCurrency ? ` (reports in ${s.reportingCurrency})` : ''} · ${s.timeZone} · ${s.locale}`, icon: '💰' },
    { label: 'Fiscal year', val: `Starts ${MONTHS[s.fyStart - 1]} · books from ${fmtDate(s.booksFrom)} · opening ${fmtDate(s.openingBalanceDate)}`, icon: '📅' },
    { label: 'Team', val: `${db.count(C.users, (u) => u.companyIds?.includes(company.id))} user(s) · ${db.count(C.users, (u) => u.companyIds?.includes(company.id) && u.status === 'Invited')} invited`, icon: '👥' },
  ];
  return (
    <div>
      <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E0F9EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, fontSize: 28 }}>🎉</div>
      <H title={done === rows.length ? "You're all set!" : 'Almost there'} sub={`${done} of ${rows.length} setup items complete. Pending items stay on your Home checklist until they are done; blocked items name what clears them.`} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((it) => (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#F9FBFC', border: '1px solid #EAEAEA', borderRadius: 8 }}>
              <span style={{ fontSize: 18 }}>{it.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="section-label" style={{ marginBottom: 2 }}>{it.label}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>{it.val}</div>
              </div>
              <CheckIcon size={14} color="#12784E" />
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#6E6E71' }}>Signed in as {sess.user?.name} · Tenant owner</div>
        </div>
        <Checklist title="Readiness" rows={rows.map((r) => ({ id: r.key, label: r.label, status: r.status, detail: r.detail }))} />
      </div>
    </div>
  );
}
