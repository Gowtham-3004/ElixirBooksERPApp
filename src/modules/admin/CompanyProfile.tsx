// Company profile (FR-ORG-002/007/009/010, design §7.21): editable identity, address, branding,
// financial settings and GST registrations with optimistic concurrency.
import { useEffect, useState } from 'react';
import { db, C, engine, useCollection, useSession, ConflictError } from '../../store';
import type { Company, Registration, Branch } from '../../store';
import { INDIA_STATES, stateNameOf, validateGSTIN, validatePAN } from '../../lib/format';
import { PageHeader, Card, Button, TextField, SelectField, IdentifierField, ChipGroup, Banner, Badge, Drawer, CheckboxField, Toggle, KV, useToast, ActionMenu, Identifier, Explain } from '../../components/ui';
import { useCompany } from './shared';
import { BUSINESS_TYPES, CURRENCIES, LOCALES, TIME_ZONES } from '../auth/provision';

export default function CompanyProfile() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === co?.id);
  const [form, setForm] = useState<Company | undefined>(co);
  const [baseVersion, setBaseVersion] = useState(co?.version ?? 0);
  const [conflict, setConflict] = useState(false);
  const [reg, setReg] = useState<Registration | null>(null);
  useEffect(() => { if (co && (!form || form.id !== co.id)) { setForm(co); setBaseVersion(co.version); } }, [co?.id]);
  if (!co || !form) return null;
  const canEdit = s.can('admin.company.edit') || s.isTenantOwner;
  const hasPosted = db.count(C.journals, (j) => j.companyId === co.id && j.status === 'Posted') > 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(co);
  const set = (p: Partial<Company>) => setForm((f) => (f ? { ...f, ...p } : f));
  const setA = (p: Partial<Company['address']>) => set({ address: { ...form.address, ...p } });
  const panErr = form.pan ? validatePAN(form.pan) : null;

  const save = () => {
    if (panErr) { toast.error(panErr); return; }
    if (!form.legalName.trim()) { toast.error('Legal name is required'); return; }
    try {
      const before = { legalName: co.legalName, tradeName: co.tradeName, pan: co.pan, baseCurrency: co.baseCurrency, timeZone: co.timeZone, fiscalYearStartMonth: co.fiscalYearStartMonth };
      const { id, version, createdAt, updatedAt, onboarding, ...patch } = form;
      db.update<Company>(C.companies, co.id, { ...patch, baseCurrency: hasPosted ? co.baseCurrency : form.baseCurrency, onboarding: { ...co.onboarding, legal: form.pan || form.registrations.length ? 'Done' : co.onboarding.legal, address: form.address.line1 && form.address.city ? 'Done' : co.onboarding.address, currency: 'Done' } }, { expectedVersion: baseVersion });
      engine.audit({ action: 'company.updated', objectType: 'Company', objectId: co.id, objectNumber: co.code, before, after: { legalName: form.legalName, tradeName: form.tradeName, pan: form.pan, baseCurrency: form.baseCurrency, timeZone: form.timeZone, fiscalYearStartMonth: form.fiscalYearStartMonth } });
      const fresh = db.find<Company>(C.companies, co.id)!;
      setForm(fresh); setBaseVersion(fresh.version); setConflict(false);
      toast.success('Company profile saved');
    } catch (e: any) {
      if (e instanceof ConflictError) setConflict(true); else toast.error(e.message);
    }
  };
  const reload = () => { const fresh = db.find<Company>(C.companies, co.id)!; setForm(fresh); setBaseVersion(fresh.version); setConflict(false); };

  const saveReg = () => {
    if (!reg) return;
    const err = reg.type === 'GSTIN' ? validateGSTIN(reg.number) : reg.number ? null : 'Number is required';
    if (err) { toast.error(err); return; }
    const exists = co.registrations.some((r) => r.id !== reg.id && r.number === reg.number);
    if (exists) { toast.error(`${reg.number} is already registered for this company`); return; }
    const list = co.registrations.some((r) => r.id === reg.id) ? co.registrations.map((r) => (r.id === reg.id ? reg : r)) : [...co.registrations, reg];
    db.update<Company>(C.companies, co.id, { registrations: list, onboarding: { ...co.onboarding, legal: 'Done' } });
    if (reg.branchId) db.update<Branch>(C.branches, reg.branchId, { registrationId: reg.id, gstin: reg.number });
    engine.audit({ action: 'company.registration.saved', objectType: 'Company', objectId: co.id, objectNumber: reg.number, detail: `${reg.type} ${reg.number} · ${reg.state ?? ''}${reg.isSez ? ' · SEZ' : ''} · ${reg.status}` });
    setReg(null); reload();
    toast.success('Registration saved');
  };
  const toggleReg = (r: Registration) => {
    const status = r.status === 'Active' ? 'Inactive' : 'Active';
    db.update<Company>(C.companies, co.id, { registrations: co.registrations.map((x) => (x.id === r.id ? { ...x, status } : x)) });
    engine.audit({ action: status === 'Active' ? 'company.registration.activated' : 'company.registration.deactivated', objectType: 'Company', objectId: co.id, objectNumber: r.number, sensitive: true });
    reload();
  };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const isIN = co.localizationPack === 'IN';

  return (
    <div className="page">
      <PageHeader title="Company profile" subtitle={`${co.legalName} · ${co.country} · ${co.localizationPack} pack v${co.localizationVersion} · record v${co.version}`} actions={<>
        {dirty && <Button variant="ghost" onClick={reload}>Discard changes</Button>}
        <Button variant="primary" onClick={save} disabled={!canEdit || !dirty} reason={!canEdit ? 'Requires admin.company.edit' : !dirty ? 'No changes' : undefined}>Save profile</Button>
      </>} />
      {conflict && <Banner tone="danger" action={<Button variant="link" onClick={reload}>Reload their changes</Button>}>Someone else changed this company profile while you were editing (CONFLICT · record is now v{db.find<Company>(C.companies, co.id)?.version}). Reload to see their changes — your unsaved edits will be discarded.</Banner>}
      {!canEdit && <Banner tone="info">You can view the profile. Editing requires the admin.company.edit permission.</Banner>}

      <div className="grid-2">
        <Card title="Legal identity">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Legal name" required value={form.legalName} onChange={(v) => set({ legalName: v })} disabled={!canEdit} />
            <TextField label="Trade name" value={form.tradeName} onChange={(v) => set({ tradeName: v })} disabled={!canEdit} />
            <div className="grid-2">
              {isIN ? <IdentifierField kind="PAN" label="PAN" value={form.pan} onChange={(v) => set({ pan: v })} disabled={!canEdit} /> : <TextField label="Tax number" value={form.pan ?? ''} onChange={(v) => set({ pan: v })} disabled={!canEdit} />}
              <TextField label="CIN / registration no." value={form.cin ?? ''} onChange={(v) => set({ cin: v })} disabled={!canEdit} uppercase />
            </div>
            <div className="grid-2">
              <SelectField label="Business type" value={form.businessType} onChange={(v) => set({ businessType: v })} options={BUSINESS_TYPES} disabled={!canEdit} />
              <div>
                <label className="field-label">Nature & profiles</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 36 }}><Badge status="Active">{co.nature}</Badge><span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{co.profiles.join(' + ')}</span><Button variant="link" size="sm" onClick={() => (window.location.hash = '#/admin/profile')}>Change</Button></div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Registered address & contacts">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Address line 1" required value={form.address.line1} onChange={(v) => setA({ line1: v })} disabled={!canEdit} />
            <TextField label="Address line 2" value={form.address.line2 ?? ''} onChange={(v) => setA({ line2: v })} disabled={!canEdit} />
            <div className="grid-3">
              <TextField label="City" required value={form.address.city} onChange={(v) => setA({ city: v })} disabled={!canEdit} />
              {isIN ? <SelectField label="State" value={form.address.stateCode ?? ''} onChange={(code) => setA({ stateCode: code, state: stateNameOf(code) ?? '' })} options={INDIA_STATES.map((st) => ({ value: st.code, label: `${st.name} (${st.code})` }))} disabled={!canEdit} placeholder="—" /> : <TextField label="State / region" value={form.address.state} onChange={(v) => setA({ state: v })} disabled={!canEdit} />}
              {isIN ? <IdentifierField kind="PIN" label="PIN" value={form.address.pin ?? ''} onChange={(v) => setA({ pin: v })} disabled={!canEdit} /> : <TextField label="Postal code" value={form.address.pin ?? ''} onChange={(v) => setA({ pin: v })} disabled={!canEdit} />}
            </div>
            <div className="grid-3">
              <TextField label="Phone" value={form.phone ?? ''} onChange={(v) => set({ phone: v })} disabled={!canEdit} />
              <IdentifierField kind="EMAIL" label="Email" value={form.email ?? ''} onChange={(v) => set({ email: v })} disabled={!canEdit} />
              <TextField label="Website" value={form.website ?? ''} onChange={(v) => set({ website: v })} disabled={!canEdit} />
            </div>
          </div>
        </Card>

        <Card title="Financial settings">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="grid-2">
              <SelectField label={<span>Base currency <Explain title="Base currency lock" rows={[{ k: 'Rule', v: 'One base currency per company (FRD §3.5)' }, { k: 'State', v: hasPosted ? 'Locked — journals posted' : 'Editable until the first posted journal' }]} note="Changing it after posting requires a governed migration." /></span>} value={form.baseCurrency} onChange={(v) => set({ baseCurrency: v, permittedCurrencies: Array.from(new Set([v, ...form.permittedCurrencies])) })} options={CURRENCIES} disabled={!canEdit || hasPosted} help={hasPosted ? `Locked: ${db.count(C.journals, (j) => j.companyId === co.id && j.status === 'Posted')} journals are posted in ${co.baseCurrency}` : undefined} />
              <SelectField label="Reporting currency" value={form.reportingCurrency ?? ''} onChange={(v) => set({ reportingCurrency: v || undefined })} options={CURRENCIES.filter((c) => c !== form.baseCurrency)} allowEmpty placeholder="— Same as base —" disabled={!canEdit} />
            </div>
            <ChipGroup label="Permitted transaction currencies" multiple value={form.permittedCurrencies} onChange={(v: string[]) => set({ permittedCurrencies: Array.from(new Set([form.baseCurrency, ...v])) })} options={CURRENCIES} />
            <div className="grid-2">
              <SelectField label="Time zone" value={form.timeZone} onChange={(v) => set({ timeZone: v })} options={TIME_ZONES} disabled={!canEdit} />
              <SelectField label="Locale / language" value={form.locale} onChange={(v) => set({ locale: v, language: v.split('-')[0] })} options={LOCALES} disabled={!canEdit} />
            </div>
            <div className="grid-3">
              <SelectField label="Fiscal year starts" value={String(form.fiscalYearStartMonth)} onChange={(v) => set({ fiscalYearStartMonth: Number(v) })} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} disabled={!canEdit || hasPosted} help={hasPosted ? 'Locked after posting' : undefined} />
              <TextField label="Books from" type="date" value={form.booksFrom} onChange={(v) => set({ booksFrom: v })} disabled={!canEdit || hasPosted} />
              <TextField label="Opening-balance date" type="date" value={form.openingBalanceDate} onChange={(v) => set({ openingBalanceDate: v })} disabled={!canEdit} />
            </div>
            <KV items={[{ k: 'Localization pack', v: <span>{co.localizationPack} v{co.localizationVersion} <Button variant="link" size="sm" onClick={() => (window.location.hash = '#/admin/localization')}>Manage</Button></span> }, { k: 'Valuation', v: co.defaults.valuationMethod }]} />
          </div>
        </Card>

        <Card title="Branding">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ width: 72, height: 72, borderRadius: 16, background: form.brandColor ?? 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, flexShrink: 0 }}>{form.logoText || form.legalName.charAt(0)}</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="grid-2">
                <TextField label="Logo text" value={form.logoText ?? ''} onChange={(v) => set({ logoText: v.slice(0, 2).toUpperCase() })} maxLength={2} disabled={!canEdit} help="1–2 characters shown in the sidebar and print header" />
                <div>
                  <label className="field-label">Brand colour</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={form.brandColor ?? '#325CFF'} onChange={(e) => set({ brandColor: e.target.value })} disabled={!canEdit} style={{ width: 36, height: 36, border: '1px solid var(--line-strong)', borderRadius: 8, padding: 2, background: '#fff' }} />
                    <input className="field-input sm" value={form.brandColor ?? ''} onChange={(e) => set({ brandColor: e.target.value })} disabled={!canEdit} style={{ width: 110 }} />
                  </div>
                </div>
              </div>
              <div style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, fontSize: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 22, height: 22, borderRadius: 6, background: form.brandColor ?? 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11 }}>{form.logoText || 'A'}</span><strong>{form.tradeName || form.legalName}</strong><span style={{ color: 'var(--ink-3)' }}>· preview of the print header</span></div>
                <div style={{ marginTop: 6, height: 3, background: form.brandColor ?? 'var(--accent)', borderRadius: 2 }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card title={isIN ? 'GST registrations' : 'Tax registrations'} actions={<Button size="sm" variant="secondary" disabled={!canEdit} reason={!canEdit ? 'Requires admin.company.edit' : undefined} onClick={() => setReg({ id: `reg_${Date.now().toString(36)}`, type: isIN ? 'GSTIN' : 'TRN', number: '', status: 'Active', isSez: false })}>+ Add {isIN ? 'GSTIN' : 'registration'}</Button>}>
        {co.registrations.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No registrations yet. Add one per state; branches map to a registration for place-of-supply and e-invoicing.</div> : (
          <table className="data-table dense">
            <thead><tr><th>Number</th><th>State</th><th>Branches</th><th>SEZ</th><th>Status</th><th /></tr></thead>
            <tbody>
              {co.registrations.map((r) => (
                <tr key={r.id}>
                  <td><Identifier>{r.number}</Identifier> <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.type}</span></td>
                  <td>{r.state ?? '—'}{r.stateCode ? ` (${r.stateCode})` : ''}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{branches.filter((b) => b.registrationId === r.id || b.id === r.branchId).map((b) => b.name).join(', ') || '—'}</td>
                  <td>{r.isSez ? <Badge status="Approved">SEZ</Badge> : '—'}</td>
                  <td><Badge status={r.status} /></td>
                  <td style={{ textAlign: 'right' }}><ActionMenu actions={[{ label: 'Edit', onClick: () => setReg({ ...r }), disabled: !canEdit }, { label: r.status === 'Active' ? 'Deactivate' : 'Reactivate', onClick: () => toggleReg(r), disabled: !canEdit, danger: r.status === 'Active' }]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Drawer open={!!reg} onClose={() => setReg(null)} title={reg && co.registrations.some((r) => r.id === reg.id) ? `Edit ${reg.number}` : `Add ${isIN ? 'GSTIN' : 'registration'}`} width={520} footer={<><Button variant="secondary" onClick={() => setReg(null)}>Discard</Button><Button variant="primary" onClick={saveReg}>Save registration</Button></>}>
        {reg && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SelectField label="Type" value={reg.type} onChange={(v) => setReg({ ...reg, type: v as Registration['type'] })} options={['GSTIN', 'VAT', 'TRN', 'Other']} />
            {reg.type === 'GSTIN' ? <IdentifierField kind="GSTIN" value={reg.number} onChange={(v) => setReg({ ...reg, number: v, stateCode: v.length >= 2 ? v.slice(0, 2) : undefined, state: v.length >= 2 ? stateNameOf(v.slice(0, 2)) : undefined })} help={reg.number.length >= 2 ? `State ${stateNameOf(reg.number.slice(0, 2)) ?? 'unknown'} (${reg.number.slice(0, 2)}) · PAN ${reg.number.slice(2, 12)}${co.pan && reg.number.length >= 12 && reg.number.slice(2, 12) !== co.pan ? ' — does not match company PAN' : ''}` : 'State and PAN are derived from the number'} /> : <TextField label="Number" value={reg.number} onChange={(v) => setReg({ ...reg, number: v })} uppercase />}
            {reg.type !== 'GSTIN' && <TextField label="State / emirate" value={reg.state ?? ''} onChange={(v) => setReg({ ...reg, state: v })} />}
            <SelectField label="Branch mapping" value={reg.branchId ?? ''} onChange={(v) => setReg({ ...reg, branchId: v || undefined })} options={branches.map((b) => ({ value: b.id, label: `${b.name} · ${b.address.state || b.address.city}` }))} allowEmpty placeholder="— Not mapped —" help="Documents from this branch use this registration" />
            <CheckboxField checked={!!reg.isSez} onChange={(v) => setReg({ ...reg, isSez: v })} label="SEZ unit" help="Supplies to and from SEZ units are zero-rated" />
            <Toggle on={reg.status === 'Active'} onChange={(v) => setReg({ ...reg, status: v ? 'Active' : 'Inactive' })} label="Active" />
          </div>
        )}
      </Drawer>
    </div>
  );
}
