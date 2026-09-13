// Production order form (new / edit Draft or Planned) — FR-MFG-007.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item } from '../../store';
import { PageHeader, Button, Badge, NumberField, DateField, SelectField, TextField, TextArea, EntityPicker, useWarehouseOptions, useDimensionOptions, KV, SummaryBlock, useToast, PeriodBanner, RadioCards } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, today } from '../../lib/format';
import type { Bom, ProductionOrder, Routing } from './types';
import { activeBomFor, bomsFor, itemsWithActiveBom, mfgSettings, rollupBom, scheduleEnd } from './core';
import * as A from './actions';
import { SectionCard } from './shared';

export function OrderForm({ id, params }: { id?: string; params: Record<string, string> }) {
  const s = useSession();
  const toast = useToast();
  const existing = useRecord<ProductionOrder>(C.productionOrders, id);
  const settings = mfgSettings();
  const items = useCollection<Item>(C.items);
  useCollection(C.boms);
  const routings = useCollection<Routing>(C.routings).filter((r) => r.status === 'Active');
  const whs = useWarehouseOptions();
  const projects = useDimensionOptions('Project');
  const costCentres = useDimensionOptions('CostCentre');
  const producible = useMemo(() => itemsWithActiveBom().map((i) => ({ id: i.id, primary: i.name, secondary: `${i.code} · ${i.baseUom} · ${i.tracking}`, raw: i })), [items]);
  const [f, setF] = useState<A.NewOrderInput>({ itemId: existing?.itemId ?? params.item ?? '', bomId: existing?.bomId ?? params.bom, routingId: existing?.routingId, qty: existing?.qty ?? (Number(params.qty ?? 0) || 0), plannedStart: existing?.plannedStart ?? params.start ?? today(), plannedEnd: existing?.plannedEnd, warehouseId: existing?.warehouseId ?? settings.fgWarehouseId, wipWarehouseId: existing?.wipWarehouseId ?? settings.wipWarehouseId, rmWarehouseId: existing?.rmWarehouseId ?? settings.rmWarehouseId, serialPrefix: existing?.serialPrefix, sourceDemand: existing?.sourceDemand, priority: existing?.priority ?? 'Normal', dimensions: existing?.dimensions ?? {}, notes: existing?.notes });
  const [err, setErr] = useState<Record<string, string>>({});
  const item = db.find<Item>(C.items, f.itemId);
  const versions = f.itemId ? bomsFor(f.itemId).filter((b) => b.status !== 'Superseded') : [];
  const bom = db.find<Bom>(C.boms, f.bomId) ?? (f.itemId ? activeBomFor(f.itemId, f.plannedStart) : undefined);
  const routing = db.find<Routing>(C.routings, f.routingId ?? bom?.routingId);
  const sched = scheduleEnd(f.plannedStart, routing, f.qty || 0);
  const roll = bom ? rollupBom(bom, routing) : undefined;
  const stdUnit = bom?.stdCost ?? item?.standardCost ?? roll?.perUnit ?? 0;
  const salesOrders = (db.get<any>(C.salesOrders) ?? []).filter((so: any) => so && so.companyId === s.state.companyId && ['Confirmed', 'Approved', 'Partially Delivered'].includes(so.status) && (so.lines ?? []).some((l: any) => l.itemId === f.itemId));
  const setItem = (itemId?: string) => { const b = itemId ? activeBomFor(itemId, f.plannedStart) : undefined; const it = db.find<Item>(C.items, itemId); setF({ ...f, itemId: itemId ?? '', bomId: b?.id, routingId: undefined, serialPrefix: it?.tracking === 'Serial' ? `SER-${it.code.split('-').pop()}` : undefined, sourceDemand: undefined }); };
  const validate = () => { const e: Record<string, string> = {}; if (!f.itemId) e.itemId = 'Choose an item with an active BOM'; if (!(f.qty > 0)) e.qty = 'Enter a positive quantity'; if (!f.plannedStart) e.plannedStart = 'Required'; if (!bom) e.bomId = 'No BOM version applies on the planned start date'; setErr(e); return Object.keys(e).length === 0; };
  const save = (status: 'Draft' | 'Planned') => {
    if (!validate()) return;
    try {
      const o = existing ? A.updateOrder(existing.id, { ...f, bomId: bom?.id }, existing.version) : A.createOrder({ ...f, bomId: bom?.id, status });
      if (existing && status === 'Planned' && o.status === 'Draft') A.planOrder(o.id);
      toast.success(`${o.number} ${existing ? 'updated' : status === 'Planned' ? 'planned' : 'saved as draft'}`);
      nav.go(`production/orders/${o.id}`);
    } catch (e: any) { toast.error(e.message); if (e.field) setErr({ [e.field]: e.message }); }
  };
  const lotPreview = item?.tracking === 'Batch' ? `LOT-PRD-${existing ? existing.number.slice(-4) : String(db.count(C.productionOrders) + 1).padStart(4, '0')}-1` : item?.tracking === 'Serial' ? `${f.serialPrefix || 'SER'}-0001 … ${f.serialPrefix || 'SER'}-${String(f.qty || 1).padStart(4, '0')}` : 'Not tracked';
  return (
    <div className="page">
      <PageHeader title={existing ? `Edit ${existing.number}` : 'New production order'} subtitle={existing ? `${existing.status} · saving keeps version v${existing.version} in check` : 'Save as draft, or plan it straight away'} back={{ label: existing ? existing.number : 'Production orders', path: existing ? `production/orders/${existing.id}` : 'production/orders' }}
        actions={<><Button onClick={() => nav.go(existing ? `production/orders/${existing.id}` : 'production/orders')}>Cancel</Button><Button onClick={() => save('Draft')}>{existing ? 'Save changes' : 'Save draft'}</Button><Button variant="primary" onClick={() => save('Planned')}>{existing ? 'Save & plan' : 'Save & plan'}</Button></>} />
      <PeriodBanner date={f.plannedStart} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="What to make">
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
              <EntityPicker label="Item" required value={f.itemId || undefined} onChange={(v) => setItem(v)} options={producible} error={err.itemId} help="Only items with an active bill of material" disabled={!!existing && existing.status !== 'Draft'} autoFocus={!existing} />
              <NumberField label="Quantity" required value={f.qty} onChange={(v) => setF({ ...f, qty: v })} decimals={item?.baseUom === 'Nos' ? 0 : 3} suffix={item?.baseUom} error={err.qty} />
              <SelectField label="Priority" value={f.priority ?? 'Normal'} onChange={(v) => setF({ ...f, priority: v as ProductionOrder['priority'] })} options={['Low', 'Normal', 'High']} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <SelectField label="BOM version" value={bom?.id ?? ''} onChange={(v) => setF({ ...f, bomId: v || undefined })} options={versions.map((b) => ({ value: b.id, label: `${b.code} v${b.version} · ${b.status} · from ${fmtDate(b.effectiveFrom)}` }))} error={err.bomId} help={bom ? `${bom.components.length} components · ${bom.byProducts.length} by-product(s)` : 'Latest effective version is used by default'} disabled={!f.itemId} />
              <SelectField label="Routing" value={f.routingId ?? bom?.routingId ?? ''} onChange={(v) => setF({ ...f, routingId: v || undefined })} options={[{ value: '', label: '— none —' }, ...routings.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))]} help={routing ? `${routing.operations.length} operation(s)` : 'Defaults from the BOM'} />
              <TextField label={item?.tracking === 'Serial' ? 'Serial prefix' : 'Lot / serial preview'} value={item?.tracking === 'Serial' ? f.serialPrefix ?? '' : lotPreview} onChange={(v) => setF({ ...f, serialPrefix: v })} disabled={item?.tracking !== 'Serial'} help={item?.tracking === 'Serial' ? lotPreview : `Tracking: ${item?.tracking ?? '—'}`} uppercase />
            </div>
          </SectionCard>
          <SectionCard title="Schedule & locations">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <DateField label="Planned start" required value={f.plannedStart} onChange={(v) => setF({ ...f, plannedStart: v, plannedEnd: undefined })} error={err.plannedStart} checkPeriod />
              <DateField label="Planned end" value={f.plannedEnd ?? sched.end} onChange={(v) => setF({ ...f, plannedEnd: v })} help={routing ? `Scheduled: ${sched.hours} h over ${sched.days} working day(s) from routing ÷ capacity` : 'No routing — set manually'} />
              <div><label className="field-label">Schedule basis</label><div style={{ fontSize: 13, paddingTop: 8 }}>{routing ? routing.operations.map((op) => `${op.name}${op.subcontract ? ' (sub)' : ''}`).join(' → ') : 'No routing operations'}</div></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
              <EntityPicker label="Finished goods warehouse" value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v })} options={whs.filter((w) => w.raw?.type === 'Standard')} />
              <EntityPicker label="Raw material warehouse" value={f.rmWarehouseId} onChange={(v) => setF({ ...f, rmWarehouseId: v })} options={whs.filter((w) => w.raw?.type === 'Standard')} help="Components are issued from here" />
              <EntityPicker label="WIP warehouse" value={f.wipWarehouseId} onChange={(v) => setF({ ...f, wipWarehouseId: v })} options={whs.filter((w) => w.raw?.type === 'WIP')} />
            </div>
          </SectionCard>
          <SectionCard title="Source demand & dimensions">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <SelectField label="Sales order line (link only — no reservation)" value={f.sourceDemand?.id ?? ''} onChange={(v) => { const so = salesOrders.find((x: any) => x.id === v); setF({ ...f, sourceDemand: so ? { type: 'Sales Order', id: so.id, number: so.number, customerName: so.partyName } : undefined }); }} options={[{ value: '', label: '— Make to stock —' }, ...salesOrders.map((so: any) => ({ value: so.id, label: `${so.number} · ${so.partyName} · ${(so.lines ?? []).filter((l: any) => l.itemId === f.itemId).reduce((a: number, l: any) => a + (l.qty ?? 0) - (l.deliveredQty ?? 0), 0)} ${item?.baseUom ?? ''} open` }))]} help={salesOrders.length ? `${salesOrders.length} open sales order(s) for this item` : 'No open sales orders for this item'} />
              <EntityPicker label="Project" value={f.dimensions?.Project} onChange={(v) => setF({ ...f, dimensions: { ...f.dimensions, Project: v ?? '' } })} options={projects} />
              <EntityPicker label="Cost centre" value={f.dimensions?.CostCentre} onChange={(v) => setF({ ...f, dimensions: { ...f.dimensions, CostCentre: v ?? '' } })} options={costCentres} />
            </div>
            <div style={{ marginTop: 12 }}><TextArea label="Notes" value={f.notes ?? ''} onChange={(v) => setF({ ...f, notes: v })} rows={2} /></div>
            <div style={{ marginTop: 12 }}><RadioCards label="Planning mode" value={settings.planning} onChange={() => undefined} options={[{ value: 'MTS', label: 'Make to stock', description: 'Replenish finished-goods stock' }, { value: 'MTO', label: 'Make to order', description: 'Link to a sales order line' }]} columns={2} /></div>
          </SectionCard>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Cost preview (standard)">
            {bom && roll ? (
              <>
                <SummaryBlock style={{ flexDirection: 'column', gap: 8 }} items={[{ label: 'Std cost / unit', value: fmtMoney(stdUnit, s.currency) }, { label: `Material × ${f.qty || 0}`, value: fmtMoney(roll.material * (f.qty || 0) / (bom.outputQty || 1), s.currency) }, { label: 'Conversion', value: fmtMoney((roll.labour + roll.machine + roll.overhead + roll.subcontract) * (f.qty || 0) / (bom.outputQty || 1), s.currency) }, { label: 'Order value (std)', value: fmtMoney(stdUnit * (f.qty || 0), s.currency), tone: 'good' }]} />
                <div style={{ marginTop: 10, fontSize: 12, color: '#5F6368' }}>Workflow: {db.findBy<any>(C.workflowRules, (w) => w.docType === 'Production Order' && w.status === 'Active') ? 'release goes through approval when the rule matches' : 'no active release rule — release posts directly'}</div>
              </>
            ) : <div style={{ fontSize: 13, color: '#5F6368' }}>Pick an item to preview material and conversion cost.</div>}
          </SectionCard>
          {bom && (
            <SectionCard title={`Components · ${bom.code} v${bom.version}`} padding={0}>
              <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Per unit</th><th className="right">Planned</th></tr></thead><tbody>
                {bom.components.map((c) => <tr key={c.id}><td style={{ fontSize: 12 }}>{c.itemName}{c.isPhantom && <Badge status="Draft" style={{ marginLeft: 4 }}>phantom</Badge>}</td><td className="right money" style={{ fontSize: 12 }}>{fmtQty(c.qty / (bom.outputQty || 1), c.uom, 4)}</td><td className="right money" style={{ fontSize: 12 }}>{fmtQty((c.qty / (bom.outputQty || 1)) * (f.qty || 0) * (1 + c.scrapPct / 100), c.uom, 3)}</td></tr>)}
              </tbody></table>
            </SectionCard>
          )}
          <SectionCard title="Defaults"><KV items={[{ k: 'Costing', v: settings.costingMethod }, { k: 'Over-issue tolerance', v: `${settings.overIssueTolerancePct}%` }, { k: 'QC on FG receipt', v: settings.qcRequiredForFG ? 'Required' : 'Optional' }, { k: 'Backflush', v: settings.backflushDefault ? 'Default on' : 'Manual issue' }]} /></SectionCard>
        </div>
      </div>
    </div>
  );
}
