// Purchase order form (FR-PUR-010): create / edit draft, or amend an approved PO with a reason.
import { useEffect, useMemo, useState } from 'react';
import { db, C, nav, useRecord, useSession } from '../../store';
import type { DocLine } from '../../store';
import { Button, Banner, DateField, TextField, TextArea, EntityPicker, SelectField, useSupplierOptions, useDimensionOptions, useWarehouseOptions, LineItemGrid, TotalsLadder, TaxBreakup, AttachmentsPanel, useToast, ReasonField, PeriodBanner, NumberField, Badge, EmptyState, MoneyField } from '../../components/ui';
import { fmtMoney, uid } from '../../lib/format';
import type { PurchaseOrder, PoLine } from './types';
import * as A from './actions';

export function OrderForm({ id }: { id?: string }) {
  const existing = useRecord<PurchaseOrder>(C.purchaseOrders, id);
  if (id && !existing) return <EmptyState title="Purchase order not found" action={<Button onClick={() => nav.go('purchase/orders')}>Back to orders</Button>} />;
  return <OrderFormInner key={id ?? 'new'} existing={existing} />;
}

function OrderFormInner({ existing }: { existing?: PurchaseOrder }) {
  const s = useSession();
  const toast = useToast();
  const amend = !!existing && ['Approved', 'Partially Received'].includes(existing.status);
  const [po, setPo] = useState<PurchaseOrder>(() => (existing ? A.computePo({ ...existing }) : A.newPurchaseOrder()));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const suppliers = useSupplierOptions();
  const depts = useDimensionOptions('Department');
  const projects = useDimensionOptions('Project');
  const whs = useWarehouseOptions();
  const readOnly = !!existing && !amend && existing.status !== 'Draft' && existing.status !== 'Returned';
  const set = (p: Partial<PurchaseOrder>) => setPo((d) => A.computePo({ ...d, ...p }));
  useEffect(() => { if (existing && existing.status !== 'Draft' && existing.status !== 'Returned' && !amend) nav.replace(`purchase/orders/${existing.id}`); }, [existing, amend]);
  const errList = useMemo(() => Object.values(errors), [errors]);
  const validate = () => { const e = A.validatePo(po); setErrors(e); return Object.keys(e).length === 0; };
  const save = (submit: boolean) => {
    if (!validate()) return;
    try {
      const saved = A.savePurchaseOrder(po);
      if (submit) { const out = A.submitPo(saved.id); toast.success(out.status === 'Submitted' ? `${saved.number} submitted for approval` : `${saved.number} approved`); } else toast.success(`${saved.number} saved`);
      nav.go(`purchase/orders/${saved.id}`);
    } catch (e: any) { setErrors({ save: e.message }); }
  };
  const doAmend = () => {
    try { const out = A.amendPo(existing!.id, { lines: po.lines, expectedDate: po.expectedDate, notes: po.notes, terms: po.terms }, reason); toast.success(`${out.number} amended (rev ${out.revision})`); nav.go(`purchase/orders/${out.id}`); } catch (e: any) { setErrors({ save: e.message }); }
  };
  const lineExtra = [
    { key: 'expected', label: 'Expected', width: 130, render: (l: DocLine) => readOnly ? <span style={{ fontSize: 12 }}>{(l as PoLine).expectedDate ?? po.expectedDate ?? '—'}</span> : <input type="date" className="field-input grid" value={(l as PoLine).expectedDate ?? po.expectedDate ?? ''} onChange={(e) => set({ lines: po.lines.map((x) => (x.id === l.id ? { ...x, expectedDate: e.target.value } : x)) })} /> },
    ...(amend ? [{ key: 'done', label: 'Received', width: 90, render: (l: DocLine) => <span className="money" style={{ fontSize: 12, color: 'var(--ink-3)' }}>{(l.acceptedQty ?? 0) + (l.rejectedQty ?? 0)}</span> }] : []),
  ];
  const charges = po.charges ?? [];
  const setCharges = (c: PurchaseOrder['charges']) => set({ charges: c });
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.back('purchase/orders')}>← Purchase orders</button>
          <h1 className="page-title">{amend ? `Amend ${existing!.number}` : existing ? `Edit ${existing.number}` : 'New purchase order'}</h1>
          <div className="page-subtitle">{amend ? `Rev ${(existing!.revision ?? 0) + 1} · only unfulfilled quantity may change · re-approval if total increases` : `${s.company?.tradeName} · ${s.branch?.name} · number allocated on save (${po.number})`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={() => nav.back('purchase/orders')}>Discard changes</Button>
          {amend ? <Button variant="primary" onClick={doAmend} disabled={reason.trim().length < 10} reason={reason.trim().length < 10 ? 'Amendment reason required' : undefined}>Save amendment</Button> : <><Button onClick={() => save(false)}>Save draft</Button><Button variant="primary" onClick={() => save(true)}>Submit for approval</Button></>}
        </div>
      </div>
      <PeriodBanner date={po.date} />
      {errList.length > 0 && <Banner tone="danger" onDismiss={() => setErrors({})}>{errList.length === 1 ? errList[0] : <ul style={{ margin: 0, paddingLeft: 16 }}>{errList.map((e, i) => <li key={i}>{e}</li>)}</ul>}</Banner>}
      {amend && <div className="card" style={{ padding: 16 }}><ReasonField label="Amendment reason" value={reason} onChange={setReason} placeholder="Why is the PO changing? Recorded on the amendment trail and shown to approvers." /></div>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <EntityPicker label="Supplier" required value={po.partyId} onChange={(v) => setPo((d) => A.applySupplierToPo(d, v))} options={suppliers} error={errors.partyId} recentKey="suppliers" disabled={amend || readOnly} style={{ gridColumn: 'span 2' }} help={po.partySnapshot ? `${po.partySnapshot.taxTreatment} · ${po.partySnapshot.state ?? ''} · GSTIN ${po.partySnapshot.gstin ?? '—'} · ${po.partySnapshot.paymentTerms ?? ''}` : 'Tax context, currency and terms come from the supplier'} />
        <DateField label="Order date" required value={po.date} onChange={(v) => set({ date: v })} error={errors.date} disabled={amend} />
        <DateField label="Expected delivery" value={po.expectedDate} onChange={(v) => set({ expectedDate: v, lines: po.lines.map((l) => ({ ...l, expectedDate: l.expectedDate ?? v })) })} min={po.date} />
        <TextField label="Currency" value={po.currency} onChange={() => {}} disabled help={po.currency !== s.currency ? `Rate ${po.rate} (${po.rateType ?? 'Spot'} · ${po.rateSource ?? ''})` : 'Base currency'} />
        {po.currency !== s.currency && <NumberField label="Exchange rate" value={po.rate} onChange={(v) => set({ rate: v, rateType: 'Manual', rateSource: 'User override' })} decimals={4} min={0} error={errors.rate} disabled={amend} />}
        <TextField label="Supplier reference" value={po.reference} onChange={(v) => set({ reference: v })} placeholder="Quote / contract ref" disabled={readOnly} />
        <SelectField label="Payment terms" value={po.paymentTerms} onChange={(v) => set({ paymentTerms: v })} options={db.get<any>(C.paymentTerms).map((t) => t.name)} disabled={amend} />
        <SelectField label="Default warehouse" value={po.warehouseId ?? s.company?.defaults.warehouseId} onChange={(v) => set({ warehouseId: v, lines: po.lines.map((l) => ({ ...l, warehouseId: l.warehouseId ?? v })) })} options={whs.map((w) => ({ value: w.id, label: w.primary }))} disabled={amend} />
        <EntityPicker label="Department" value={po.dimensions?.Department} onChange={(v) => set({ dimensions: { ...po.dimensions, Department: v ?? '' } })} options={depts} disabled={amend} />
        <EntityPicker label="Project" value={po.dimensions?.Project} onChange={(v) => set({ dimensions: { ...po.dimensions, Project: v ?? '' } })} options={projects} disabled={amend} />
        {po.partySnapshot?.billingAddress && <div style={{ gridColumn: 'span 2', fontSize: 12, color: 'var(--ink-3)' }}><div className="field-label">Supplier address</div>{po.partySnapshot.billingAddress.line1}, {po.partySnapshot.billingAddress.city}, {po.partySnapshot.billingAddress.state} {po.partySnapshot.billingAddress.pin}</div>}
      </div>
      <LineItemGrid lines={po.lines} onChange={(lines) => set({ lines: lines as PoLine[] })} readOnly={readOnly} direction="purchase" partyId={po.partyId} currency={po.currency} showWarehouse showDiscount showTax totals={po.totals} extraColumns={lineExtra} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 16 }}>
            <div className="section-title">Charges</div>
            {charges.map((c) => (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 160px 32px', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                <TextField size="sm" label="Charge" value={c.name} onChange={(v) => setCharges(charges.map((x) => (x.id === c.id ? { ...x, name: v } : x)))} disabled={readOnly} />
                <MoneyField size="sm" label="Amount" value={c.amount} onChange={(v) => setCharges(charges.map((x) => (x.id === c.id ? { ...x, amount: v } : x)))} currency={po.currency} disabled={readOnly} />
                <SelectField size="sm" label="Tax" value={c.taxRateId ?? ''} onChange={(v) => setCharges(charges.map((x) => (x.id === c.id ? { ...x, taxRateId: v || undefined } : x)))} options={[{ value: '', label: 'No tax' }, ...db.get<any>(C.taxRates).filter((t) => t.status === 'Active').map((t) => ({ value: t.id, label: t.name }))]} disabled={readOnly} />
                {!readOnly && <button type="button" className="btn-icon" onClick={() => setCharges(charges.filter((x) => x.id !== c.id))}>✕</button>}
              </div>
            ))}
            {!readOnly && <button type="button" className="btn-link" onClick={() => setCharges([...charges, { id: uid('ch'), name: 'Freight', amount: 0 }])}>+ Add charge (freight, packing, insurance…)</button>}
          </div>
          <div className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TextArea label="Terms & conditions" value={po.terms} onChange={(v) => set({ terms: v })} rows={3} disabled={readOnly} />
            <TextArea label="Notes to supplier" value={po.notes} onChange={(v) => set({ notes: v })} rows={3} disabled={readOnly} />
          </div>
          <div className="card" style={{ padding: 16 }}><div className="section-title">Attachments</div><AttachmentsPanel objectType="Purchase Order" objectId={po.id} readOnly={readOnly} /></div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ padding: 16 }}><div className="section-title">Totals</div><TotalsLadder totals={po.totals} currency={po.currency} baseCurrency={s.currency} rate={po.rate} showPaid={false} /></div>
          <div className="card" style={{ padding: 16 }}><div className="section-title">Tax breakup <Badge status="Draft">input tax</Badge></div><TaxBreakup totals={po.totals} currency={po.currency} /></div>
          {existing && existing.amendments.length > 0 && <div className="card" style={{ padding: 16 }}><div className="section-title">Amendment history</div>{existing.amendments.map((a) => <div key={a.revision} style={{ fontSize: 12, marginBottom: 6 }}><strong>Rev {a.revision}</strong> · {a.by} · {a.summary}<div style={{ color: 'var(--ink-3)' }}>{a.reason}</div></div>)}</div>}
          <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Approval: {A.purchaseSettings().matchingMode} matching · PO workflow {db.findBy<any>(C.workflowRules, (w) => w.docType === 'Purchase Order' && w.status === 'Active')?.name ?? 'none'} · total {fmtMoney(po.totals.baseTotal)}</div>
        </div>
      </div>
    </div>
  );
}
