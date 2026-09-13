// Purchase settings (matching mode / tolerances, over-receipt, exception policy, duplicate scope) — additive keys on company.defaults.
import { useState } from 'react';
import { useSession } from '../../store';
import { Button, SelectField, NumberField, MoneyField, Toggle, useToast, PageHeader, Banner, useAccountOptions } from '../../components/ui';
import * as A from './actions';
import type { PurchaseSettings } from './types';

export function PurchaseSettingsPage() {
  const s = useSession();
  const toast = useToast();
  const [v, setV] = useState<PurchaseSettings>(() => A.purchaseSettings(s.company));
  const accountOptions = useAccountOptions((a) => a.type === 'Liability' && a.postingAllowed);
  const canEdit = s.can('admin.company.edit') || s.can('purchase.settings.edit') || s.isTenantOwner || s.can('purchase.*');
  const save = () => { try { A.savePurchaseSettings(v); toast.success('Purchase settings saved'); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="page">
      <PageHeader title="Purchase settings" subtitle={`${s.company?.tradeName} · applies to new documents; posted documents keep their snapshot`} actions={<Button variant="primary" onClick={save} disabled={!canEdit} reason={!canEdit ? 'Requires company admin' : undefined}>Save settings</Button>} />
      {!canEdit && <Banner tone="info">Read-only — ask a Finance Admin or the tenant owner to change these.</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-title">Invoice matching (FR-PUR-032/033)</div>
          <SelectField label="Matching mode" value={v.matchingMode} onChange={(x) => setV({ ...v, matchingMode: x as PurchaseSettings['matchingMode'] })} options={[{ value: '2-way', label: '2-way · invoice vs PO' }, { value: '3-way', label: '3-way · invoice vs PO vs GRN accepted qty' }, { value: '4-way', label: '4-way · + QC result' }]} disabled={!canEdit} />
          <NumberField label="Price tolerance (%)" value={v.matchTolerancePct} onChange={(x) => setV({ ...v, matchTolerancePct: x })} decimals={2} min={0} max={100} disabled={!canEdit} help="Variance within EITHER the % or the amount tolerance passes" />
          <MoneyField label="Amount tolerance" value={v.matchToleranceAmt} onChange={(x) => setV({ ...v, matchToleranceAmt: x })} disabled={!canEdit} />
          <Toggle on={v.blockOnException} onChange={(x) => setV({ ...v, blockOnException: x })} disabled={!canEdit} label="Block posting while exceptions are unresolved" help="Off = warn only; exceptions still raised and audited" />
        </div>
        <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-title">Receiving & invoicing</div>
          <NumberField label="Over-receipt tolerance (%)" value={v.overReceiptTolerancePct} onChange={(x) => setV({ ...v, overReceiptTolerancePct: x })} decimals={1} min={0} max={100} disabled={!canEdit} help="GRN may exceed the PO remaining quantity by this much" />
          <SelectField label="Duplicate supplier-invoice scope" value={v.duplicateInvoiceScope} onChange={(x) => setV({ ...v, duplicateInvoiceScope: x as PurchaseSettings['duplicateInvoiceScope'] })} options={[{ value: 'Supplier', label: 'Same supplier, any period' }, { value: 'Supplier+FY', label: 'Same supplier within the fiscal year' }, { value: 'Company', label: 'Whole company (any supplier)' }]} disabled={!canEdit} />
          <Toggle on={v.directInvoiceStock} onChange={(x) => setV({ ...v, directInvoiceStock: x })} disabled={!canEdit} label="Direct vendor invoices of stock items receive stock" help="Without a GRN, posting the invoice books the receipt into the line warehouse" />
          <SelectField label="GRNI accrual account (FR-AP-001)" value={v.grniAccountId} onChange={(x) => setV({ ...v, grniAccountId: x })} options={accountOptions.map((o) => ({ value: o.id, label: o.secondary ? o.primary + ' · ' + o.secondary : o.primary }))} disabled={!canEdit} help="GRNs accrue here with no party; the matched vendor invoice clears it and credits AP control" />
        </div>
      </div>
    </div>
  );
}
