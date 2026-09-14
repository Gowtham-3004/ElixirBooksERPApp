// Company defaults (FR-ORG-006): warehouse, accounts, tax, terms, price list, template, stock & matching policy, credit policy.
import { useEffect, useState } from 'react';
import { db, C, engine, useCollection, useSession, ConflictError } from '../../store';
import type { Company, CompanyDefaults, PriceList, PaymentTerm, DocumentTemplate } from '../../store';
import { PageHeader, Card, Button, SelectField, EntityPicker, useAccountOptions, useWarehouseOptions, useTaxRateOptions, NumberField, PercentField, Toggle, RadioCards, Banner, useToast } from '../../components/ui';
import { useCompany } from './shared';
import { layoutLabel } from '../../lib/templates';

export default function Defaults() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const [d, setD] = useState<CompanyDefaults | undefined>(co?.defaults);
  const [base, setBase] = useState(co?.version ?? 0);
  const [conflict, setConflict] = useState(false);
  useEffect(() => { if (co && (!d || base !== co.version) && !conflict) { setD(co.defaults); setBase(co.version); } }, [co?.id]);
  const accounts = useAccountOptions();
  const warehouses = useWarehouseOptions();
  const taxRates = useTaxRateOptions();
  const priceLists = useCollection<PriceList>(C.priceLists).filter((p) => p.status === 'Active');
  const terms = useCollection<PaymentTerm>(C.paymentTerms).filter((t) => t.status === 'Active');
  const templates = useCollection<DocumentTemplate>(C.templates).filter((t) => t.status === 'Active');
  if (!co || !d) return null;
  const canEdit = s.can('admin.company.edit') || s.isTenantOwner;
  const dirty = JSON.stringify(d) !== JSON.stringify(co.defaults);
  const set = (p: Partial<CompanyDefaults>) => setD({ ...d, ...p });
  const acc = (filter: (a: any) => boolean) => accounts.filter((o) => filter(o.raw));

  const save = () => {
    try {
      db.update<Company>(C.companies, co.id, { defaults: d }, { expectedVersion: base });
      engine.audit({ action: 'company.defaults.updated', objectType: 'Company', objectId: co.id, objectNumber: co.code, before: co.defaults as any, after: d as any });
      const fresh = db.find<Company>(C.companies, co.id)!;
      setBase(fresh.version); setConflict(false);
      toast.success('Defaults saved');
    } catch (e: any) { if (e instanceof ConflictError) setConflict(true); else toast.error(e.message); }
  };
  const reload = () => { const fresh = db.find<Company>(C.companies, co.id)!; setD(fresh.defaults); setBase(fresh.version); setConflict(false); };

  return (
    <div className="page">
      <PageHeader title="Defaults" subtitle={`${co.legalName} · applied to new documents; existing documents keep their snapshots`} actions={<>{dirty && <Button variant="ghost" onClick={reload}>Discard</Button>}<Button variant="primary" onClick={save} disabled={!canEdit || !dirty} reason={!canEdit ? 'Requires admin.company.edit' : !dirty ? 'No changes' : undefined}>Save defaults</Button></>} />
      {conflict && <Banner tone="danger" action={<Button variant="link" onClick={reload}>Reload</Button>}>Defaults were changed by someone else (CONFLICT). Reload to continue.</Banner>}
      <div className="grid-2">
        <Card title="Operations">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <EntityPicker label="Default warehouse" value={d.warehouseId} onChange={(id) => set({ warehouseId: id })} options={warehouses} disabled={!canEdit} />
            <SelectField label="Default payment terms" value={d.paymentTerms ?? ''} onChange={(v) => set({ paymentTerms: v })} options={terms.map((t) => ({ value: t.name, label: `${t.name} · ${t.days} days` }))} disabled={!canEdit} allowEmpty />
            <SelectField label="Default sales price list" value={d.priceListId ?? ''} onChange={(v) => set({ priceListId: v || undefined })} options={priceLists.filter((p) => p.type === 'Sales').map((p) => ({ value: p.id, label: `${p.name} · ${p.currency}` }))} disabled={!canEdit} allowEmpty placeholder="— Item master price —" />
            <SelectField label="Default tax rate" value={d.taxRateId ?? ''} onChange={(v) => set({ taxRateId: v || undefined })} options={taxRates} disabled={!canEdit} allowEmpty />
            <SelectField label="Default invoice template" value={d.templateId ?? ''} onChange={(v) => set({ templateId: v || undefined })} options={templates.map((t) => ({ value: t.id, label: `${t.name} · ${layoutLabel(t)} · v${t.templateVersion}` }))} disabled={!canEdit} allowEmpty />
          </div>
        </Card>
        <Card title="Control accounts">
          <div className="grid-2">
            <EntityPicker label="Sales" value={d.salesAccountId} onChange={(id) => set({ salesAccountId: id })} options={acc((a) => a.type === 'Income')} disabled={!canEdit} />
            <EntityPicker label="Purchases" value={d.purchaseAccountId} onChange={(id) => set({ purchaseAccountId: id })} options={acc((a) => a.type === 'Expense')} disabled={!canEdit} />
            <EntityPicker label="Receivable (AR)" value={d.receivableAccountId} onChange={(id) => set({ receivableAccountId: id })} options={acc((a) => a.controlType === 'AR' || a.type === 'Asset')} disabled={!canEdit} />
            <EntityPicker label="Payable (AP)" value={d.payableAccountId} onChange={(id) => set({ payableAccountId: id })} options={acc((a) => a.controlType === 'AP' || a.type === 'Liability')} disabled={!canEdit} />
            <EntityPicker label="Bank" value={d.bankAccountId} onChange={(id) => set({ bankAccountId: id })} options={acc((a) => a.controlType === 'Bank')} disabled={!canEdit} />
            <EntityPicker label="Cash" value={d.cashAccountId} onChange={(id) => set({ cashAccountId: id })} options={acc((a) => a.controlType === 'Cash' || a.controlType === 'Bank')} disabled={!canEdit} />
            <EntityPicker label="Round-off" value={d.roundOffAccountId} onChange={(id) => set({ roundOffAccountId: id })} options={acc((a) => a.type === 'Income' || a.type === 'Expense')} disabled={!canEdit} />
            <EntityPicker label="FX gain" value={d.fxGainAccountId} onChange={(id) => set({ fxGainAccountId: id })} options={acc((a) => a.type === 'Income')} disabled={!canEdit} />
            <EntityPicker label="FX loss" value={d.fxLossAccountId} onChange={(id) => set({ fxLossAccountId: id })} options={acc((a) => a.type === 'Expense')} disabled={!canEdit} />
          </div>
        </Card>
        <Card title="Stock policy">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <RadioCards label="Valuation method" value={d.valuationMethod} onChange={(v) => set({ valuationMethod: v as CompanyDefaults['valuationMethod'] })} options={[{ value: 'AVCO', label: 'Weighted average', description: 'Moving average cost per warehouse' }, { value: 'FIFO', label: 'FIFO', description: 'First-in first-out layers' }, { value: 'Standard', label: 'Standard cost', description: 'Variances post to a variance account' }]} columns={3} />
            <Toggle on={d.allowNegativeStock} onChange={(v) => set({ allowNegativeStock: v })} label="Allow negative stock" help="When off, deliveries and issues are refused when on-hand would go below zero (NEGATIVE_STOCK)" disabled={!canEdit} />
            <Toggle on={d.directInvoiceStock} onChange={(v) => set({ directInvoiceStock: v })} label="Direct invoices move stock" help="Invoices without a delivery challan post the stock movement themselves" disabled={!canEdit} />
          </div>
        </Card>
        <Card title="Matching & credit">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <RadioCards label="Purchase matching" value={d.matchingMode} onChange={(v) => set({ matchingMode: v as CompanyDefaults['matchingMode'] })} options={[{ value: '2-way', label: '2-way', description: 'PO ↔ invoice' }, { value: '3-way', label: '3-way', description: 'PO ↔ GRN ↔ invoice' }, { value: '4-way', label: '4-way', description: '+ quality inspection' }]} columns={3} />
            <div className="grid-2">
              <PercentField label="Tolerance %" value={d.matchTolerancePct} onChange={(v) => set({ matchTolerancePct: v })} disabled={!canEdit} />
              <NumberField label={`Tolerance amount (${co.baseCurrency})`} value={d.matchToleranceAmt} onChange={(v) => set({ matchToleranceAmt: v })} disabled={!canEdit} />
            </div>
            <RadioCards label="Credit policy (company default)" value={d.creditPolicy} onChange={(v) => set({ creditPolicy: v as CompanyDefaults['creditPolicy'] })} options={[{ value: 'Warn', label: 'Warn', description: 'Show exposure, allow' }, { value: 'Block', label: 'Block', description: 'Refuse over-limit documents' }, { value: 'Override', label: 'Override with approval', description: 'Route to Sales Manager' }]} columns={3} />
          </div>
        </Card>
      </div>
    </div>
  );
}
