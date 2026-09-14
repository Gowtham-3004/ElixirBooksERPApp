// Companies (admin/companies, FR-ORG-001): tenant-owner list of legal entities with add-within-plan-limit and switch.
import { useState } from 'react';
import { db, C, engine, nav, session, useCollection, useSession } from '../../store';
import type { Company, Tenant, Branch, Plan, User } from '../../store';
import { fmtDate } from '../../lib/format';
import { PageHeader, Card, Button, Badge, Drawer, TextField, SelectField, RadioCards, Meter, Banner, KV, useToast, EmptyState } from '../../components/ui';
import { COUNTRY_OPTIONS, buildFyPeriods, ensureDefaultSeries, profilesForNature } from '../auth/provision';

export default function Companies() {
  const s = useSession();
  const toast = useToast();
  const companies = useCollection<Company>(C.companies).filter((c) => c.tenantId === s.state.tenantId);
  const branches = useCollection<Branch>(C.branches);
  const tenant = s.tenant as Tenant | undefined;
  const plan = s.plan as Plan | undefined;
  const limit = plan?.limits.companies ?? 1;
  const atLimit = companies.length >= limit;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', country: 'IN', nature: 'Trading' as Company['nature'], fyStart: 4 });

  if (!s.isTenantOwner) {
    return <div className="page"><EmptyState icon="🔒" title="Only the tenant owner manages companies" description="Ask the tenant owner to add or switch companies for you (FR-ORG-001)." /></div>;
  }

  const create = () => {
    if (!f.name.trim()) { toast.error('Company name is required'); return; }
    if (atLimit) { toast.error(`Your ${plan?.name} plan allows ${limit} compan${limit === 1 ? 'y' : 'ies'} — upgrade to add more`); return; }
    const c = COUNTRY_OPTIONS.find((x) => x.code === f.country)!;
    const code = f.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase();
    const created = db.transaction(() => {
      const co = db.insert<Company>(C.companies, {
        companyId: undefined, tenantId: s.state.tenantId, code, legalName: f.name.trim(), tradeName: f.name.trim(), country: c.code, baseCurrency: c.currency, permittedCurrencies: [c.currency, 'USD'], timeZone: c.timeZone, locale: c.locale, language: 'en', fiscalYearStartMonth: f.fyStart,
        booksFrom: new Date().toISOString().slice(0, 10), openingBalanceDate: new Date().toISOString().slice(0, 10), nature: f.nature, profiles: profilesForNature(f.nature), profileHistory: [], businessType: 'Private Limited',
        address: { line1: '', city: '', state: '', pin: '', country: c.code }, logoText: f.name.trim().charAt(0).toUpperCase(), brandColor: '#12784E', localizationPack: c.pack, localizationVersion: c.pack === 'IN' ? '1.4' : '1.0', registrations: [],
        defaults: { allowNegativeStock: false, valuationMethod: 'AVCO', matchingMode: '3-way', matchTolerancePct: 2, matchToleranceAmt: 500, creditPolicy: 'Warn', directInvoiceStock: true, paymentTerms: 'Net 30' }, status: 'Active',
        onboarding: { nature: 'Done', legal: 'Pending', address: 'Pending', currency: 'Done', periods: 'Done', users: 'Pending', masters: 'Pending', opening: 'Pending', bank: 'Pending', numbering: 'Done', einvoice: 'Pending' },
      });
      db.insert<Branch>(C.branches, { companyId: co.id, code: 'BR-001', name: 'Head Office', type: 'Office', address: { line1: '', city: '', state: '', pin: '', country: c.code }, status: 'Active', isDefault: true });
      buildFyPeriods(co.id, f.fyStart).forEach((p) => db.insert(C.periods, { ...p, id: `per_${co.id.replace(/^co_/, '')}_${p.code}` }));
      ensureDefaultSeries(co.id, f.fyStart);
      const me = db.find<User>(C.users, s.user?.id);
      if (me) db.update<User>(C.users, me.id, { companyIds: [...me.companyIds, co.id] });
      if (tenant) db.update<Tenant>(C.tenants, tenant.id, { usage: { ...tenant.usage, companies: companies.length + 1 } });
      engine.audit({ action: 'company.created', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: `${co.legalName} · ${c.name} · ${c.currency} · ${f.nature} · pack ${c.pack}` });
      return co;
    });
    toast.success(`${created.legalName} created`, { label: 'Switch', path: 'home' });
    setOpen(false);
    setF({ name: '', country: 'IN', nature: 'Trading', fyStart: 4 });
  };

  return (
    <div className="page">
      <PageHeader title="Companies" subtitle={`${tenant?.name} · ${companies.length} of ${limit} companies on the ${plan?.name} plan`} actions={<Button variant="primary" onClick={() => setOpen(true)} disabled={atLimit} reason={atLimit ? `Plan limit reached (${limit}) — upgrade under Plan & usage` : undefined}>+ Add company</Button>} />
      {atLimit && <Banner tone="warning" action={<Button variant="tinted" onClick={() => nav.go('admin/plan')}>Upgrade plan</Button>}>Your {plan?.name} plan includes {limit} compan{limit === 1 ? 'y' : 'ies'}. Upgrade to add another legal entity — no data is copied between companies.</Banner>}
      <div style={{ maxWidth: 360 }}><div className="section-label" style={{ marginBottom: 4 }}>Company usage</div><Meter value={companies.length} max={limit} /></div>
      <div className="grid-2">
        {companies.map((c) => {
          const br = branches.filter((b) => b.companyId === c.id && b.status === 'Active').length;
          const periods = db.where<any>(C.periods, (p) => p.companyId === c.id);
          const open = periods.filter((p) => p.status === 'Open' || p.status === 'Reopened').length;
          const current = c.id === s.state.companyId;
          return (
            <Card key={c.id} style={{ borderColor: current ? '#325CFF' : undefined }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: c.brandColor ?? '#325CFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>{c.logoText ?? c.legalName[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{c.legalName}</div>
                    <div style={{ display: 'flex', gap: 6 }}>{current && <Badge status="Active">Current</Badge>}<Badge status={c.status} /></div>
                  </div>
                  <div style={{ fontSize: 12, color: '#5F6368', marginBottom: 10 }}>{c.code} · {c.country} · {c.baseCurrency}{c.reportingCurrency ? ` (reports ${c.reportingCurrency})` : ''} · {c.nature}</div>
                  <KV columns={2} items={[{ k: 'Pack', v: `${c.localizationPack} v${c.localizationVersion}` }, { k: 'Profiles', v: c.profiles.join(' + ') }, { k: 'Branches', v: br }, { k: 'Periods', v: `${periods.length} · ${open} open` }, { k: 'FY starts', v: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][c.fiscalYearStartMonth - 1] }, { k: 'Books from', v: fmtDate(c.booksFrom) }]} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    {!current && <Button size="sm" variant="primary" onClick={() => { session.switchCompany(c.id); nav.go('home'); }}>Switch to {c.tradeName}</Button>}
                    {current && <Button size="sm" variant="secondary" onClick={() => nav.go('admin/company')}>Edit profile</Button>}
                    <Button size="sm" variant="ghost" onClick={() => { if (!current) session.switchCompany(c.id); nav.go('admin/periods'); }}>Periods</Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Companies under one tenant may use different countries, currencies and profiles; ledgers, periods, statutory books, banks and number series stay company-specific (FRD §3.5). No transaction can mix companies (FR-ORG-011).</div>

      <Drawer open={open} onClose={() => setOpen(false)} title="Add company" subtitle="Creates the legal entity with its own base currency, localization pack, default branch, fiscal periods and number series." width={560} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Discard</Button><Button variant="primary" onClick={create}>Create company</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <TextField label="Legal name" required value={f.name} onChange={(v) => setF({ ...f, name: v })} autoFocus />
          <SelectField label="Country / localization pack" value={f.country} onChange={(v) => { const c = COUNTRY_OPTIONS.find((x) => x.code === v)!; setF({ ...f, country: v, fyStart: c.fyStart }); }} options={COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: `${c.name} · ${c.currency} · pack ${c.pack}` }))} />
          <SelectField label="Fiscal year starts" value={String(f.fyStart)} onChange={(v) => setF({ ...f, fyStart: Number(v) })} options={[{ value: '1', label: 'January' }, { value: '4', label: 'April' }, { value: '7', label: 'July' }, { value: '10', label: 'October' }]} />
          <RadioCards label="Business nature" value={f.nature} onChange={(v) => setF({ ...f, nature: v as Company['nature'] })} options={[{ value: 'Trading', label: 'Trading', icon: '🏬' }, { value: 'Services', label: 'Services', icon: '💼' }, { value: 'Manufacturing', label: 'Manufacturing', icon: '🏭' }, { value: 'Hybrid', label: 'Hybrid', icon: '⚡' }]} columns={2} />
          <Banner tone="info">The new company starts with an empty chart of accounts scope, its own periods for the current fiscal year and default number series. Finish its setup from the Home checklist after switching.</Banner>
        </div>
      </Drawer>
    </div>
  );
}
