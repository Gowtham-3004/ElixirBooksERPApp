// Items & services register + form (FR-ITM-001/002).
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import type { HsnCode, Item, Uom } from '../../store';
import { Badge, Button, CheckboxField, Drawer, EntityPicker, ImportWizard, Money, MoneyField, NumberField, RegisterPage, SelectField, TextField, TwoLine, useAccountOptions, useSupplierOptions, useTaxRateOptions, useToast } from '../../components/ui';
import { fmtQty } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, saveMaster, statusTabs, useForm } from './shared';
import { itemImport } from './importDefs';

const TYPES: Item['type'][] = ['Goods', 'Service', 'Consumable', 'Asset', 'Raw Material', 'Finished Good', 'Semi-Finished'];

export function ItemRegister() {
  const s = useSession();
  const rows = useCollection<Item>(C.items).filter((i) => i.companyId === s.state.companyId);
  const moves = useCollection<any>(C.stockMovements);
  const taxRates = useCollection<any>(C.taxRates);
  const [editing, setEditing] = useState<Item | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const [imp, setImp] = useState(false);
  const canEdit = s.can('masters.items.edit') || s.can('masters.items.create');
  const onHand = (id: string) => moves.filter((m) => m.itemId === id).reduce((sum, m) => sum + (m.baseQty ?? 0), 0);
  const groups = Array.from(new Set(rows.map((r) => r.group).filter(Boolean))) as string[];
  return (
    <>
      <RegisterPage<Item>
        title="Items & services"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${rows.filter((r) => r.type === 'Service').length} services · ${rows.filter((r) => r.isStock).length} stock items`}
        entity="items"
        rows={rows}
        searchKeys={['name', 'code', 'hsn', 'barcode', 'group', 'brand']}
        searchPlaceholder="Name, SKU, HSN, barcode…"
        tabs={statusTabs<Item>([{ id: 'stock', label: 'Stock items', filter: (r) => r.isStock }, { id: 'services', label: 'Services', filter: (r) => r.type === 'Service' }, { id: 'reorder', label: 'Below reorder', filter: (r) => r.isStock && r.reorderLevel > 0 && onHand(r.id) < r.reorderLevel }])}
        filters={[{ key: 'type', label: 'Type', type: 'select', options: TYPES.map((t) => ({ value: t, label: t })) }, { key: 'group', label: 'Group', type: 'select', options: groups.map((g) => ({ value: g, label: g })) }, { key: 'tracking', label: 'Tracking', type: 'select', options: ['None', 'Batch', 'Serial'].map((t) => ({ value: t, label: t })) }]}
        applyFilter={(r, f) => (!f.type || r.type === f.type) && (!f.group || r.group === f.group) && (!f.tracking || r.tracking === f.tracking)}
        primaryAction={{ label: 'New item', onClick: () => setEditing('new'), disabled: !s.can('masters.items.create'), reason: s.can('masters.items.create') ? undefined : 'Requires item create permission' }}
        importAction={() => setImp(true)}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        onRowClick={(r) => nav.go(`masters/items/${r.id}`)}
        rowActions={(r) => masterRowActions({ collection: C.items, objectType: 'Item', row: r, canEdit, onView: () => nav.go(`masters/items/${r.id}`), onEdit: () => setEditing(r), extra: r.isStock ? [{ label: 'Stock ledger', onClick: () => nav.go(`inventory/ledger?item=${r.id}`) }] : [] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.items, 'Item', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Item', sortable: true, render: (r) => <TwoLine primary={r.name} secondary={`${r.code}${r.hsn ? ' · HSN ' + r.hsn : ''}`} mono />, value: (r) => r.name },
          { key: 'type', label: 'Type', render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{r.type}{r.group ? ` · ${r.group}` : ''}</span>, value: (r) => r.type },
          { key: 'baseUom', label: 'UOM', render: (r) => <span>{r.baseUom}{r.altUoms.length ? <span style={{ color: '#5F6368', fontSize: 11 }}> +{r.altUoms.length}</span> : null}</span> },
          { key: 'tax', label: 'Tax', render: (r) => taxRates.find((t) => t.id === r.taxRateId)?.name ?? '—', value: (r) => taxRates.find((t) => t.id === r.taxRateId)?.name },
          { key: 'salesPrice', label: 'Sales price', align: 'right', sortable: true, render: (r) => <Money value={r.salesPrice} currency={s.currency} />, value: (r) => r.salesPrice },
          { key: 'purchasePrice', label: 'Purchase price', align: 'right', render: (r) => (r.purchasePrice ? <Money value={r.purchasePrice} currency={s.currency} /> : '—'), value: (r) => r.purchasePrice },
          { key: 'onHand', label: 'On hand', align: 'right', sortable: true, render: (r) => (r.isStock ? <span className="money" style={{ color: r.reorderLevel > 0 && onHand(r.id) < r.reorderLevel ? '#C0393F' : undefined }}>{fmtQty(onHand(r.id), r.baseUom)}</span> : <span style={{ color: '#B0B5BF' }}>n/a</span>), value: (r) => onHand(r.id) },
          { key: 'tracking', label: 'Tracking', render: (r) => (r.tracking === 'None' ? '—' : <span className="pill pill-neutral">{r.tracking}</span>) },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <ItemForm item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={(i) => { setEditing(null); if (editing === 'new') nav.go(`masters/items/${i.id}`); }} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="items" entityLabel="Items" candidateFields={['code', 'name', 'barcode', 'hsn']} />
      <ImportWizard open={imp} onClose={() => setImp(false)} {...itemImport(rows)} />
    </>
  );
}

function blank(defaults: any) {
  return { code: '', name: '', description: '', type: 'Goods' as Item['type'], group: '', brand: '', baseUom: 'Nos', altUoms: [] as Item['altUoms'], hsn: '', taxRateId: defaults?.taxRateId, salesAccountId: defaults?.salesAccountId, purchaseAccountId: defaults?.purchaseAccountId, inventoryAccountId: 'acc_1200', tracking: 'None' as Item['tracking'], reorderLevel: 0, reorderQty: 0, safetyStock: 0, leadTimeDays: 7, salesPrice: 0, purchasePrice: 0, standardCost: 0, status: 'Active' as Item['status'], isStock: true, barcode: '', minOrderQty: 0, preferredSupplierId: undefined as string | undefined };
}

export function ItemForm({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved: (i: Item) => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<Item>(C.items).filter((i) => i.companyId === s.state.companyId);
  const hsn = useCollection<HsnCode>(C.hsnCodes);
  const uoms = useCollection<Uom>(C.uoms).filter((u) => u.status === 'Active');
  const taxOpts = useTaxRateOptions();
  const suppliers = useSupplierOptions();
  const incomeAcc = useAccountOptions((a) => a.type === 'Income');
  const expenseAcc = useAccountOptions((a) => a.type === 'Expense');
  const invAcc = useAccountOptions((a) => a.controlType === 'Inventory');
  const f = useForm<any>(item ? { ...item, altUoms: item.altUoms.map((u) => ({ ...u })) } : blank(s.company?.defaults));
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const dups = useMemo(() => findDuplicates('items', rows, f.v, item?.id), [rows, f.v.code, f.v.name, f.v.barcode, f.v.hsn]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const isService = f.v.type === 'Service';
  const hsnOptions = hsn.map((h) => ({ id: h.id, primary: `${h.code} · ${h.description}`, secondary: h.type, keywords: h.code, raw: h }));
  const selectedHsn = hsn.find((h) => h.code === f.v.hsn);
  const setType = (t: Item['type']) => {
    const service = t === 'Service';
    f.patch({ type: t, isStock: service ? false : f.v.isStock, tracking: service ? 'None' : f.v.tracking, inventoryAccountId: service ? undefined : f.v.inventoryAccountId ?? 'acc_1200', salesAccountId: service ? 'acc_4010' : f.v.salesAccountId, purchaseAccountId: service ? 'acc_5530' : f.v.purchaseAccountId });
  };
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.code.trim()) e.code = 'SKU / code is required';
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (!f.v.baseUom) e.baseUom = 'Base UOM is required';
    if (!f.v.taxRateId) e.taxRateId = 'Tax rate is required';
    if (!f.v.salesAccountId) e.salesAccountId = 'Sales account is required';
    if (!f.v.purchaseAccountId) e.purchaseAccountId = 'Purchase account is required';
    if (f.v.isStock && !f.v.inventoryAccountId) e.inventoryAccountId = 'Inventory account is required for stock items';
    if (f.v.altUoms.some((u: any) => !u.uom || !(u.factor > 0))) e.altUoms = 'Every alternate UOM needs a name and a positive factor';
    if (f.v.altUoms.some((u: any) => u.uom === f.v.baseUom)) e.altUoms = 'Alternate UOM cannot equal the base UOM';
    if (f.v.salesPrice < 0 || f.v.purchasePrice < 0) e.salesPrice = 'Prices cannot be negative';
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const values = { ...f.v, code: f.v.code.trim().toUpperCase(), name: f.v.name.trim(), hsn: f.v.hsn || undefined, barcode: f.v.barcode || undefined, brand: f.v.brand || undefined, group: f.v.group || undefined, isStock: isService ? false : f.v.isStock, inventoryAccountId: isService ? undefined : f.v.inventoryAccountId };
      const saved = saveMaster<Item>(C.items, 'Item', values, item?.id, { expectedVersion: item?.version });
      toast.success(item ? `${saved.name} updated` : `Item ${saved.code} created`);
      onSaved(saved);
    } catch (err: any) { toast.error(err?.message ?? 'Could not save item'); setSaving(false); }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  return (
    <Drawer open onClose={onClose} title={item ? `Edit ${item.name}` : 'New item'} subtitle={item ? `${item.code} · v${item.version}` : 'Item master · FR-ITM-001'} width={840}
      headerRight={item && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={item ? 'Save item' : 'Create item'} disabled={blocked} reason={blocked ? 'Duplicate blocked' : undefined} /> : undefined}>
      {tab === 'history' && item ? <ChangeHistory objectId={item.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
          <section>
            <div className="section-title">Identity</div>
            <div style={grid}>
              <SelectField label="Type" value={f.v.type} onChange={(v) => setType(v as Item['type'])} options={TYPES} help={isService ? 'Services never move stock (FR-ITM-002)' : undefined} />
              <TextField label="SKU / code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} />
              <TextField label="Name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} style={{ gridColumn: '1 / -1' }} autoFocus />
              <TextField label="Description" value={f.v.description} onChange={(v) => f.set('description', v)} style={{ gridColumn: '1 / -1' }} />
              <TextField label="Group / category" value={f.v.group} onChange={(v) => f.set('group', v)} />
              <TextField label="Brand" value={f.v.brand} onChange={(v) => f.set('brand', v)} />
              <TextField label="Barcode / EAN" value={f.v.barcode} onChange={(v) => f.set('barcode', v)} />
              <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive']} />
            </div>
          </section>
          <section>
            <div className="section-title">Units</div>
            <div style={grid}>
              <SelectField label="Base UOM" required value={f.v.baseUom} onChange={(v) => f.set('baseUom', v)} options={uoms.map((u) => ({ value: u.code, label: `${u.code} — ${u.name}` }))} error={f.errors.baseUom} />
              <div>
                <label className="field-label">Alternate UOMs · factor to base</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {f.v.altUoms.map((u: any, i: number) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <select className="field-input sm" value={u.uom} onChange={(e) => f.set('altUoms', f.v.altUoms.map((x: any, j: number) => (j === i ? { ...x, uom: e.target.value } : x)))} style={{ width: 120 }}>
                        <option value="">UOM</option>
                        {uoms.filter((x) => x.code !== f.v.baseUom).map((x) => <option key={x.code} value={x.code}>{x.code}</option>)}
                      </select>
                      <span style={{ fontSize: 12, color: '#5F6368' }}>=</span>
                      <input className="field-input sm num" type="number" step="any" value={u.factor} onChange={(e) => f.set('altUoms', f.v.altUoms.map((x: any, j: number) => (j === i ? { ...x, factor: Number(e.target.value) } : x)))} style={{ width: 110 }} />
                      <span style={{ fontSize: 12, color: '#5F6368' }}>{f.v.baseUom}</span>
                      <Button size="sm" variant="ghost" onClick={() => f.set('altUoms', f.v.altUoms.filter((_: any, j: number) => j !== i))}>✕</Button>
                    </div>
                  ))}
                  <div><Button size="sm" variant="secondary" onClick={() => f.set('altUoms', [...f.v.altUoms, { uom: '', factor: 1 }])}>+ Add conversion</Button></div>
                  {f.errors.altUoms && <div className="field-error">{f.errors.altUoms}</div>}
                </div>
              </div>
            </div>
          </section>
          <section>
            <div className="section-title">Tax & accounts</div>
            <div style={grid}>
              <EntityPicker label="HSN / SAC" value={selectedHsn?.id} onChange={(id, opt) => { const h = opt?.raw as HsnCode | undefined; f.patch({ hsn: h?.code ?? '', taxRateId: h?.defaultTaxRateId ?? f.v.taxRateId }); }} options={hsnOptions} placeholder="Search code or description…" help={selectedHsn?.defaultTaxRateId ? 'Default tax applied from the HSN master' : f.v.hsn ? `Custom code ${f.v.hsn}` : undefined} />
              <SelectField label="Tax rate" required value={f.v.taxRateId ?? ''} onChange={(v) => f.set('taxRateId', v)} options={taxOpts} error={f.errors.taxRateId} />
              <EntityPicker label="Sales account" required value={f.v.salesAccountId} onChange={(v) => f.set('salesAccountId', v)} options={incomeAcc} error={f.errors.salesAccountId} />
              <EntityPicker label="Purchase / expense account" required value={f.v.purchaseAccountId} onChange={(v) => f.set('purchaseAccountId', v)} options={expenseAcc} error={f.errors.purchaseAccountId} />
              {!isService && <EntityPicker label="Inventory account" value={f.v.inventoryAccountId} onChange={(v) => f.set('inventoryAccountId', v)} options={invAcc} error={f.errors.inventoryAccountId} />}
              {!isService && <SelectField label="Tracking" value={f.v.tracking} onChange={(v) => f.set('tracking', v)} options={['None', 'Batch', 'Serial']} help={f.v.tracking === 'Serial' ? 'Each unit needs a serial on receipt and issue' : f.v.tracking === 'Batch' ? 'Batch and expiry captured on receipt' : undefined} />}
            </div>
          </section>
          <section>
            <div className="section-title">Stock & replenishment</div>
            {!isService && <CheckboxField checked={f.v.isStock} onChange={(v) => f.set('isStock', v)} label="Stock item — receipts and deliveries move inventory" style={{ marginBottom: 10 }} />}
            {isService && <div className="banner info" style={{ marginBottom: 10 }}>Services never produce stock movements (FR-ITM-002).</div>}
            {f.v.isStock && !isService && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <NumberField label="Reorder level" value={f.v.reorderLevel} onChange={(v) => f.set('reorderLevel', v)} suffix={f.v.baseUom} decimals={3} />
                <NumberField label="Reorder qty" value={f.v.reorderQty} onChange={(v) => f.set('reorderQty', v)} suffix={f.v.baseUom} decimals={3} />
                <NumberField label="Safety stock" value={f.v.safetyStock} onChange={(v) => f.set('safetyStock', v)} suffix={f.v.baseUom} decimals={3} />
                <NumberField label="Lead time" value={f.v.leadTimeDays} onChange={(v) => f.set('leadTimeDays', v)} suffix="days" decimals={0} />
              </div>
            )}
          </section>
          <section>
            <div className="section-title">Pricing & sourcing</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              <MoneyField label="Sales price" value={f.v.salesPrice} onChange={(v) => f.set('salesPrice', v)} error={f.errors.salesPrice} help={`per ${f.v.baseUom} · used when no price list applies`} />
              <MoneyField label="Purchase price" value={f.v.purchasePrice} onChange={(v) => f.set('purchasePrice', v)} />
              {!isService && <MoneyField label="Standard cost" value={f.v.standardCost ?? 0} onChange={(v) => f.set('standardCost', v)} />}
              <EntityPicker label="Preferred supplier" value={f.v.preferredSupplierId} onChange={(v) => f.set('preferredSupplierId', v)} options={suppliers} placeholder="Search supplier…" style={{ gridColumn: 'span 2' }} />
              <NumberField label="Min order qty" value={f.v.minOrderQty ?? 0} onChange={(v) => f.set('minOrderQty', v)} decimals={0} />
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

