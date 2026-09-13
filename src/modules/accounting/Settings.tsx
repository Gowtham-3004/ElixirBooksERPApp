// Accounting settings: rounding, FX gain/loss (realised + unrealised), retained earnings, opening balance equity,
// default dimensions — stored on company.defaults (additive keys).
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { Company, Dimension } from '../../store';
import { Button, EntityPicker, PageHeader, SelectField, useAccountOptions, useToast } from '../../components/ui';
import { ChangeHistory } from '../masters/shared';
import type { AccountingSettings } from './types';

const DIM_TYPES = ['Department', 'CostCentre', 'ProfitCentre', 'Project', 'ProductLine'];

export function SettingsPage() {
  const s = useSession();
  const toast = useToast();
  const accounts = useAccountOptions();
  const dims = useCollection<Dimension>(C.dimensions).filter((d) => d.companyId === s.state.companyId && d.status === 'Active');
  const co = s.company;
  const d = (co?.defaults ?? {}) as Company['defaults'] & AccountingSettings;
  const [v, setV] = useState<AccountingSettings & { receivableAccountId?: string; payableAccountId?: string; bankAccountId?: string; cashAccountId?: string }>({
    roundOffAccountId: d.roundOffAccountId, fxGainAccountId: d.fxGainAccountId, fxLossAccountId: d.fxLossAccountId, unrealisedFxGainAccountId: d.unrealisedFxGainAccountId ?? 'acc_4920', unrealisedFxLossAccountId: d.unrealisedFxLossAccountId ?? 'acc_5610', retainedEarningsAccountId: d.retainedEarningsAccountId ?? 'acc_3100', openingBalanceEquityAccountId: d.openingBalanceEquityAccountId ?? 'acc_3900', defaultDimensions: { ...(d.defaultDimensions ?? {}) }, receivableAccountId: d.receivableAccountId, payableAccountId: d.payableAccountId, bankAccountId: d.bankAccountId, cashAccountId: d.cashAccountId,
  });
  const canEdit = s.can('accounting.settings.edit') || s.can('accounting.*') || s.can('admin.company.*');
  const set = (k: keyof typeof v, val: any) => setV((x) => ({ ...x, [k]: val }));
  const save = () => {
    if (!co) return;
    const missing = (['roundOffAccountId', 'fxGainAccountId', 'fxLossAccountId', 'unrealisedFxGainAccountId', 'unrealisedFxLossAccountId', 'retainedEarningsAccountId'] as const).filter((k) => !v[k]);
    if (missing.length) { toast.error(`Choose an account for: ${missing.join(', ')}`); return; }
    const before = Object.fromEntries(Object.keys(v).map((k) => [k, (d as any)[k]]));
    db.update<Company>(C.companies, co.id, { defaults: { ...co.defaults, ...v } as Company['defaults'] });
    engine.audit({ action: 'accounting.settings_updated', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: 'Accounting settings changed', before, after: { ...v } });
    toast.success('Accounting settings saved');
  };
  const acc = (label: string, key: keyof typeof v, filter?: (a: any) => boolean, help?: string) => <EntityPicker label={label} value={v[key] as string | undefined} onChange={(x) => set(key, x)} options={filter ? accounts.filter((o) => filter(o.raw)) : accounts} help={help} disabled={!canEdit} />;
  return (
    <div className="page">
      <PageHeader title="Accounting settings" subtitle={`${co?.legalName} · base ${co?.baseCurrency} · FY starts month ${co?.fiscalYearStartMonth} · books from ${co?.booksFrom}`} actions={<Button variant="primary" onClick={save} disabled={!canEdit} reason={canEdit ? undefined : 'Requires accounting settings permission'}>Save settings</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-title">Posting accounts</div>
          {acc('Round-off account', 'roundOffAccountId', undefined, 'Rounding differences within tolerance post here (FR-3.3)')}
          {acc('Realised FX gain', 'fxGainAccountId', (a) => a.type === 'Income', 'Settlement at a better rate (FR-FX-009)')}
          {acc('Realised FX loss', 'fxLossAccountId', (a) => a.type === 'Expense')}
          {acc('Unrealised FX gain', 'unrealisedFxGainAccountId', (a) => a.type === 'Income', 'Period-end revaluation (FR-FX-010)')}
          {acc('Unrealised FX loss', 'unrealisedFxLossAccountId', (a) => a.type === 'Expense')}
        </div>
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-title">Equity & control accounts</div>
          {acc('Retained earnings', 'retainedEarningsAccountId', (a) => a.type === 'Equity', 'Year-end close transfers net profit here')}
          {acc('Opening balance equity', 'openingBalanceEquityAccountId', (a) => a.type === 'Equity', 'Absorbs unreconciled opening differences (FR-ACC-021)')}
          {acc('Receivable control (AR)', 'receivableAccountId', (a) => a.controlType === 'AR')}
          {acc('Payable control (AP)', 'payableAccountId', (a) => a.controlType === 'AP')}
          {acc('Default bank', 'bankAccountId', (a) => a.controlType === 'Bank')}
          {acc('Petty cash', 'cashAccountId', (a) => a.controlType === 'Cash')}
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="section-title">Default dimensions on manual journals</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {DIM_TYPES.map((t) => <SelectField key={t} label={t.replace(/([A-Z])/g, ' $1').trim()} value={v.defaultDimensions?.[t] ?? ''} onChange={(x) => set('defaultDimensions', { ...(v.defaultDimensions ?? {}), ...(x ? { [t]: x } : {}) , ...(x ? {} : Object.fromEntries(Object.entries(v.defaultDimensions ?? {}).filter(([k]) => k !== t))) })} options={dims.filter((x) => x.type === t).map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))} allowEmpty placeholder="— None —" disabled={!canEdit} />)}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 8 }}>Branch is always stamped from the active scope. Required / prohibited dimensions are configured per account under Masters › Chart of accounts.</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div className="section-title">Policies (company administration)</div>
          <div className="kv" style={{ fontSize: 13 }}>
            <span className="k">Credit policy</span><span className="v">{co?.defaults.creditPolicy}</span>
            <span className="k">Negative stock</span><span className="v">{co?.defaults.allowNegativeStock ? 'Allowed' : 'Blocked'}</span>
            <span className="k">Valuation</span><span className="v">{co?.defaults.valuationMethod}</span>
            <span className="k">Matching</span><span className="v">{co?.defaults.matchingMode} · {co?.defaults.matchTolerancePct}% / {co?.defaults.matchToleranceAmt}</span>
            <span className="k">Opening balance date</span><span className="v">{co?.openingBalanceDate}</span>
          </div>
        </div>
      </div>
      <div>
        <div className="section-title">Change history</div>
        {co && <ChangeHistory objectId={co.id} />}
      </div>
    </div>
  );
}
