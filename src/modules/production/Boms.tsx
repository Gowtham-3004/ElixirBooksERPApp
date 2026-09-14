// Bills of material — register, editor drawer with cost roll-up, where-used, version compare (FR-MFG-002).
import { useEffect, useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { Item } from '../../store';
import { RegisterPage, Drawer, Button, Badge, TextField, NumberField, PercentField, SelectField, DateField, CheckboxField, EntityPicker, useItemOptions, ChipGroup, KV, SummaryBlock, useToast, Modal, EmptyState, Segmented, type Column, type MenuAction } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, today } from '../../lib/format';
import type { Bom, BomByProduct, BomComponent, Routing } from './types';
import { bomsFor, rollupBom } from './core';
import { activateBom, createBom, deleteDraftBom, newByProduct, newComponent, saveBom, updateItemStandardCost, whereUsed, type BomInput } from './masterActions';
import { useConfirm, ItemLink, SectionCard } from './shared';

export function BomsPage({ id, params }: { id?: string; params: Record<string, string> }) {
  const s = useSession();
  const cid = s.state.companyId;
  const boms = useCollection<Bom>(C.boms).filter((b) => b.companyId === cid);
  const routings = useCollection<Routing>(C.routings);
  useCollection(C.items);
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ bom?: Bom; itemId?: string } | null>(id === 'new' ? { itemId: params.item } : null);
  const [compare, setCompare] = useState<Bom | null>(null);
  const [whereItem, setWhereItem] = useState<string | undefined>(params.whereUsed);
  const view = id && id !== 'new' ? boms.find((b) => b.id === id) : undefined;
  useEffect(() => { if (view && !editing) setEditing({ bom: view }); }, [view?.id]);
  const rows = useMemo(() => boms.map((b) => ({ ...b, routingCode: routings.find((r) => r.id === b.routingId)?.code ?? '—', roll: rollupBom(b, routings.find((r) => r.id === b.routingId)).perUnit, itemStd: db.find<Item>(C.items, b.itemId)?.standardCost })).sort((a, b) => a.code.localeCompare(b.code) || b.version - a.version), [boms, routings]);
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'code', label: 'BOM', sortable: true, render: (b) => <span className="identifier link" style={{ fontWeight: 500 }}>{b.code} <span style={{ color: 'var(--ink-3)' }}>v{b.version}</span></span> },
    { key: 'itemName', label: 'Output item', sortable: true, render: (b) => <div><div>{b.itemName}</div><div className="cell-secondary identifier">{b.itemCode} · {b.outputQty} {b.uom} · {b.mode}</div></div> },
    { key: 'status', label: 'Status', sortable: true, render: (b) => <Badge status={b.status} /> },
    { key: 'effectiveFrom', label: 'Effective', sortable: true, render: (b) => <span style={{ fontSize: 12 }}>{fmtDate(b.effectiveFrom)}{b.effectiveTo ? ` → ${fmtDate(b.effectiveTo)}` : ' →'}</span> },
    { key: 'components', label: 'Components', align: 'right', render: (b) => <span className="money">{b.components.length}{b.byProducts.length ? <span style={{ color: 'var(--ink-3)' }}> +{b.byProducts.length} by-prod</span> : null}</span>, value: (b) => b.components.length },
    { key: 'routingCode', label: 'Routing', render: (b) => <span className="identifier">{b.routingCode}</span> },
    { key: 'roll', label: 'Rolled-up cost / unit', align: 'right', sortable: true, render: (b) => <span className="money">{fmtMoney(b.roll, s.currency)}{b.itemStd !== undefined && Math.abs(b.itemStd - b.roll) > 0.5 && <span title={`Item standard cost ${fmtMoney(b.itemStd, s.currency)}`} style={{ marginLeft: 4, color: 'var(--warn)' }}>≠</span>}</span>, value: (b) => b.roll },
  ];
  const rowActions = (b: Bom): MenuAction[] => [
    { label: b.status === 'Draft' ? 'Edit' : b.status === 'Active' ? 'Revise (new version)' : 'View', onClick: () => setEditing({ bom: b }) },
    { label: 'Compare versions', onClick: () => setCompare(b), disabled: bomsFor(b.itemId).length < 2, reason: bomsFor(b.itemId).length < 2 ? 'Only one version' : undefined },
    { label: 'Activate', onClick: () => confirm.open({ title: `Activate ${b.code} v${b.version}?`, statement: `Effective ${fmtDate(b.effectiveFrom)}. Any other active version for ${b.itemName} is superseded.`, consequences: [{ engine: 'Workflow', text: 'New production orders default to this version' }], confirmLabel: 'Activate BOM', onConfirm: () => { activateBom(b.id); toast.success(`${b.code} v${b.version} is now active`); } }), disabled: b.status !== 'Draft', reason: b.status !== 'Draft' ? `Already ${b.status}` : undefined },
    { label: 'Update item standard cost', onClick: () => confirm.open({ title: `Update standard cost of ${b.itemName}?`, statement: `Item master standard cost becomes ${fmtMoney(rollupBom(b).perUnit, s.currency)} (currently ${db.find<Item>(C.items, b.itemId)?.standardCost ?? '—'}). Future orders and MRP values use the new figure; posted documents are untouched.`, confirmLabel: 'Update standard cost', onConfirm: () => { const r = updateItemStandardCost(b.id); toast.success(`${r.item.name}: standard cost ${r.from ?? '—'} → ${r.to}`); } }) },
    { label: 'New production order', onClick: () => nav.go('production/orders/new', { item: b.itemId, bom: b.id }), disabled: b.status !== 'Active', reason: b.status !== 'Active' ? 'BOM not active' : undefined },
    { label: 'Delete draft', danger: true, onClick: () => confirm.open({ title: `Delete ${b.code} v${b.version}?`, confirmLabel: 'Delete draft', danger: true, reasonRequired: true, onConfirm: () => { deleteDraftBom(b.id); toast.success('Draft deleted'); } }), disabled: b.status !== 'Draft', reason: b.status !== 'Draft' ? 'Only drafts can be deleted' : undefined },
  ];
  return (
    <>
      <RegisterPage title="Bills of material" subtitle={`${boms.filter((b) => b.status === 'Active').length} active · ${boms.filter((b) => b.status === 'Draft').length} draft · ${new Set(boms.map((b) => b.itemId)).size} items`} rows={rows} columns={columns} entity="BOMs" searchKeys={['code', 'itemName', 'itemCode']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (b) => b.status === 'Active' }, { id: 'draft', label: 'Draft', filter: (b) => b.status === 'Draft' }, { id: 'superseded', label: 'Superseded', filter: (b) => b.status === 'Superseded' }]}
        filters={[{ key: 'mode', label: 'Mode', type: 'select', options: [{ value: 'discrete', label: 'Discrete' }, { value: 'process', label: 'Process' }] }]} applyFilter={(b, v) => !v.mode || b.mode === v.mode}
        primaryAction={{ label: 'New BOM', onClick: () => setEditing({}) }} actions={<Button onClick={() => setWhereItem(whereItem ? undefined : '')}>Where-used</Button>}
        onRowClick={(b) => setEditing({ bom: b })} rowActions={rowActions} />
      {whereItem !== undefined && <WhereUsedPanel itemId={whereItem} onChange={setWhereItem} onClose={() => setWhereItem(undefined)} />}
      {editing && <BomEditor bom={editing.bom} itemId={editing.itemId} onClose={() => { setEditing(null); if (id) nav.go('production/boms'); }} />}
      {compare && <CompareModal bom={compare} onClose={() => setCompare(null)} />}
      {confirm.dialog}
    </>
  );
}

function WhereUsedPanel({ itemId, onChange, onClose }: { itemId: string; onChange: (id: string) => void; onClose: () => void }) {
  const items = useItemOptions((i) => i.isStock);
  const used = itemId ? whereUsed(itemId) : [];
  return (
    <Drawer open onClose={onClose} title="Where-used lookup" subtitle="BOMs containing the item as a component or substitute" width={640}>
      <EntityPicker label="Component item" value={itemId || undefined} onChange={(v) => onChange(v ?? '')} options={items} placeholder="Search components…" autoFocus />
      <div style={{ marginTop: 16 }}>
        {!itemId ? <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Pick an item to see the BOMs that use it.</div> : used.length === 0 ? <EmptyState compact title="Not used in any BOM" /> : (
          <table className="data-table dense"><thead><tr><th>BOM</th><th>Output</th><th>Status</th><th className="right">Qty per</th><th>Role</th></tr></thead><tbody>
            {used.map((b) => { const c = b.components.find((x) => x.itemId === itemId); const sub = b.components.find((x) => x.substitutes.includes(itemId)); return <tr key={b.id} className="clickable" onClick={() => nav.go(`production/boms/${b.id}`)}><td className="identifier link">{b.code} v{b.version}</td><td>{b.itemName}</td><td><Badge status={b.status} /></td><td className="right money">{c ? `${fmtQty(c.qty, c.uom, 4)} / ${b.outputQty} ${b.uom}` : '—'}</td><td>{c ? 'Component' : sub ? `Substitute for ${sub.itemName}` : '—'}</td></tr>; })}
          </tbody></table>
        )}
      </div>
    </Drawer>
  );
}

function CompareModal({ bom, onClose }: { bom: Bom; onClose: () => void }) {
  const versions = bomsFor(bom.itemId);
  const [a, setA] = useState(versions[1]?.id ?? versions[0].id);
  const [b, setB] = useState(bom.id);
  const va = versions.find((v) => v.id === a)!, vb = versions.find((v) => v.id === b)!;
  const itemIds = Array.from(new Set([...va.components.map((c) => c.itemId), ...vb.components.map((c) => c.itemId)]));
  const ra = rollupBom(va), rb = rollupBom(vb);
  return (
    <Modal open onClose={onClose} title={`Compare ${bom.code} versions`} width={760} footer={<Button onClick={onClose}>Close</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <SelectField label="Version A" value={a} onChange={setA} options={versions.map((v) => ({ value: v.id, label: `v${v.version} · ${v.status} · from ${fmtDate(v.effectiveFrom)}` }))} />
        <SelectField label="Version B" value={b} onChange={setB} options={versions.map((v) => ({ value: v.id, label: `v${v.version} · ${v.status} · from ${fmtDate(v.effectiveFrom)}` }))} />
      </div>
      <table className="data-table dense"><thead><tr><th>Component</th><th className="right">A · qty (scrap)</th><th className="right">B · qty (scrap)</th><th>Change</th></tr></thead><tbody>
        {itemIds.map((iid) => { const ca = va.components.find((c) => c.itemId === iid); const cb = vb.components.find((c) => c.itemId === iid); const change = !ca ? 'Added' : !cb ? 'Removed' : ca.qty !== cb.qty || ca.scrapPct !== cb.scrapPct ? 'Changed' : 'Same'; return <tr key={iid}><td>{(ca ?? cb)!.itemName}</td><td className="right money">{ca ? `${ca.qty} (${ca.scrapPct}%)` : '—'}</td><td className="right money">{cb ? `${cb.qty} (${cb.scrapPct}%)` : '—'}</td><td><Badge status={change === 'Same' ? 'Draft' : change === 'Removed' ? 'Rejected' : change === 'Added' ? 'Approved' : 'Returned'}>{change}</Badge></td></tr>; })}
        <tr><td><strong>Rolled-up cost / unit</strong></td><td className="right money"><strong>{fmtMoney(ra.perUnit)}</strong></td><td className="right money"><strong>{fmtMoney(rb.perUnit)}</strong></td><td className={rb.perUnit > ra.perUnit ? 'money-negative' : 'money-positive'}>{fmtMoney(rb.perUnit - ra.perUnit)}</td></tr>
      </tbody></table>
    </Modal>
  );
}

function BomEditor({ bom, itemId, onClose }: { bom?: Bom; itemId?: string; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const items = useItemOptions((i) => i.isStock);
  const routings = useCollection<Routing>(C.routings).filter((r) => r.status === 'Active');
  const readOnly = bom?.status === 'Superseded';
  const revising = bom?.status === 'Active';
  const [f, setF] = useState<BomInput>({ itemId: bom?.itemId ?? itemId ?? '', effectiveFrom: bom?.effectiveFrom ?? today(), effectiveTo: bom?.effectiveTo, mode: bom?.mode ?? 'discrete', outputQty: bom?.outputQty ?? 1, components: bom?.components.map((c) => ({ ...c })) ?? [newComponent()], byProducts: bom?.byProducts.map((b) => ({ ...b })) ?? [], routingId: bom?.routingId, notes: bom?.notes, status: 'Draft' });
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<'components' | 'byproducts' | 'cost'>('components');
  const outputItem = db.find<Item>(C.items, f.itemId);
  const draftBom: Bom = { ...(bom ?? ({} as Bom)), id: bom?.id ?? 'draft', code: bom?.code ?? 'NEW', version: bom?.version ?? 1, itemId: f.itemId, itemCode: outputItem?.code ?? '', itemName: outputItem?.name ?? '', effectiveFrom: f.effectiveFrom, status: bom?.status ?? 'Draft', mode: f.mode, outputQty: f.outputQty, uom: outputItem?.baseUom ?? 'Nos', components: f.components, byProducts: f.byProducts, routingId: f.routingId, createdAt: '', updatedAt: '', version_: 0 } as unknown as Bom;
  const roll = useMemo(() => rollupBom(draftBom, routings.find((r) => r.id === f.routingId)), [f, routings]);
  const setC = (i: number, patch: Partial<BomComponent>) => setF({ ...f, components: f.components.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setB = (i: number, patch: Partial<BomByProduct>) => setF({ ...f, byProducts: f.byProducts.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const submit = (status: 'Draft' | 'Active') => {
    try {
      const out = bom ? saveBom(bom.id, { ...f, status }) : createBom({ ...f, status });
      toast.success(`${out.code} v${out.version} ${status === 'Active' ? 'activated' : 'saved as draft'}`, { label: 'Open', path: `production/boms/${out.id}` });
      onClose();
    } catch (e: any) { setErr(e.message); }
  };
  const routingOps = routings.find((r) => r.id === f.routingId)?.operations ?? [];
  return (
    <Drawer open onClose={onClose} width={960} title={bom ? `${bom.code} v${bom.version} · ${bom.itemName}` : 'New bill of material'} subtitle={readOnly ? 'Superseded version — read-only' : revising ? 'Editing an active BOM creates a new effective-dated version and supersedes this one' : 'Draft'}
      headerRight={bom && <Badge status={bom.status} />}
      footer={<><div style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>Rolled-up cost <strong className="money">{fmtMoney(roll.perUnit, s.currency)}</strong> per {outputItem?.baseUom ?? 'unit'}</div><Button onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</Button>{!readOnly && <Button onClick={() => submit('Draft')}>{revising ? 'Save as new draft version' : 'Save draft'}</Button>}{!readOnly && <Button variant="primary" onClick={() => submit('Active')}>{revising ? 'Save & activate new version' : 'Activate BOM'}</Button>}</>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12 }}>
        <EntityPicker label="Output item" required value={f.itemId || undefined} onChange={(v) => setF({ ...f, itemId: v ?? '' })} options={items.filter((i) => ['Finished Good', 'Semi-Finished', 'Goods'].includes(i.raw?.type))} disabled={!!bom || readOnly} help={outputItem ? `${outputItem.code} · tracking ${outputItem.tracking} · std cost ${outputItem.standardCost ?? '—'}` : 'Finished / semi-finished items'} />
        <NumberField label="Output qty" value={f.outputQty} onChange={(v) => setF({ ...f, outputQty: v })} decimals={3} suffix={outputItem?.baseUom} disabled={readOnly} />
        <DateField label="Effective from" value={f.effectiveFrom} onChange={(v) => setF({ ...f, effectiveFrom: v })} disabled={readOnly} />
        <DateField label="Effective to" value={f.effectiveTo} onChange={(v) => setF({ ...f, effectiveTo: v || undefined })} disabled={readOnly} help="Optional" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 12, marginTop: 12, alignItems: 'end' }}>
        <div><label className="field-label">Mode</label><Segmented value={f.mode} onChange={(v) => setF({ ...f, mode: v })} options={[{ value: 'discrete', label: 'Discrete' }, { value: 'process', label: 'Process' }]} /></div>
        <SelectField label="Routing" value={f.routingId ?? ''} onChange={(v) => setF({ ...f, routingId: v || undefined })} options={[{ value: '', label: '— none —' }, ...routings.map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))]} disabled={readOnly} />
        <TextField label="Notes / change reason" value={f.notes ?? ''} onChange={(v) => setF({ ...f, notes: v })} disabled={readOnly} placeholder={revising ? 'Why is this version changing?' : ''} />
      </div>
      <div style={{ display: 'flex', gap: 20, borderBottom: '1px solid var(--hairline)', margin: '16px 0 12px' }}>
        {(['components', 'byproducts', 'cost'] as const).map((t) => <button key={t} type="button" className={`doc-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'components' ? `Components (${f.components.length})` : t === 'byproducts' ? `By-products (${f.byProducts.length})` : 'Cost roll-up'}</button>)}
      </div>
      {tab === 'components' && (
        <div className="card" style={{ overflow: 'visible' }}>
          <table className="data-table dense"><thead><tr><th style={{ width: 280 }}>Item</th><th className="right" style={{ width: 110 }}>Qty per {f.outputQty} {outputItem?.baseUom ?? ''}</th><th style={{ width: 60 }}>UOM</th><th className="right" style={{ width: 90 }}>Scrap %</th><th>Substitutes</th><th style={{ width: 80 }}>Phantom</th><th className="right" style={{ width: 110 }}>Std cost</th><th style={{ width: 40 }} /></tr></thead><tbody>
            {f.components.map((c, i) => { const line = roll.lines.find((l) => l.itemId === c.itemId); return (
              <tr key={c.id}>
                <td><EntityPicker value={c.itemId || undefined} onChange={(v, o) => setC(i, { itemId: v ?? '', itemName: o?.raw?.name ?? '', itemCode: o?.raw?.code ?? '', uom: o?.raw?.baseUom ?? c.uom })} options={items.filter((x) => x.id !== f.itemId)} size="grid" disabled={readOnly} placeholder="Component…" /></td>
                <td><NumberField value={c.qty} onChange={(v) => setC(i, { qty: v })} decimals={4} size="grid" disabled={readOnly} /></td>
                <td style={{ fontSize: 12 }}>{c.uom}</td>
                <td><NumberField value={c.scrapPct} onChange={(v) => setC(i, { scrapPct: v })} decimals={1} size="grid" disabled={readOnly} /></td>
                <td><ChipGroup value={c.substitutes} multiple onChange={(v: string[]) => setC(i, { substitutes: v })} options={items.filter((x) => x.id !== c.itemId && x.id !== f.itemId && x.raw?.group === db.find<Item>(C.items, c.itemId)?.group).slice(0, 6).map((x) => ({ value: x.id, label: x.raw?.code ?? x.primary }))} /></td>
                <td><CheckboxField checked={c.isPhantom} onChange={(v) => setC(i, { isPhantom: v })} label="" disabled={readOnly} /></td>
                <td className="right money" style={{ fontSize: 12 }}>{line ? fmtMoney(line.extended, s.currency) : '—'}</td>
                <td>{!readOnly && <button type="button" className="btn-icon" onClick={() => setF({ ...f, components: f.components.filter((_, j) => j !== i) })}>✕</button>}</td>
              </tr>); })}
          </tbody></table>
          {!readOnly && <div style={{ padding: 10 }}><Button size="sm" onClick={() => setF({ ...f, components: [...f.components, newComponent()] })}>+ Add component</Button></div>}
        </div>
      )}
      {tab === 'byproducts' && (
        <div className="card" style={{ overflow: 'visible' }}>
          <table className="data-table dense"><thead><tr><th style={{ width: 300 }}>By-product item</th><th className="right" style={{ width: 120 }}>Qty per output</th><th style={{ width: 60 }}>UOM</th><th className="right" style={{ width: 120 }}>Cost share %</th><th className="right">Credit / output</th><th style={{ width: 40 }} /></tr></thead><tbody>
            {f.byProducts.map((b, i) => (
              <tr key={b.id}>
                <td><EntityPicker value={b.itemId || undefined} onChange={(v, o) => setB(i, { itemId: v ?? '', itemName: o?.raw?.name ?? '', uom: o?.raw?.baseUom ?? b.uom })} options={items} size="grid" disabled={readOnly} /></td>
                <td><NumberField value={b.qty} onChange={(v) => setB(i, { qty: v })} decimals={3} size="grid" disabled={readOnly} /></td>
                <td style={{ fontSize: 12 }}>{b.uom}</td>
                <td><PercentField value={b.costSharePct} onChange={(v) => setB(i, { costSharePct: v })} size="grid" disabled={readOnly} /></td>
                <td className="right money" style={{ fontSize: 12 }}>{b.costSharePct > 0 ? `${b.costSharePct}% of material` : fmtMoney(b.qty * (db.find<Item>(C.items, b.itemId)?.standardCost ?? db.find<Item>(C.items, b.itemId)?.purchasePrice ?? 0), s.currency)}</td>
                <td>{!readOnly && <button type="button" className="btn-icon" onClick={() => setF({ ...f, byProducts: f.byProducts.filter((_, j) => j !== i) })}>✕</button>}</td>
              </tr>))}
            {f.byProducts.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-3)', fontSize: 13 }}>No by-products. Offcuts / recovered material credited against the order cost go here.</td></tr>}
          </tbody></table>
          {!readOnly && <div style={{ padding: 10 }}><Button size="sm" onClick={() => setF({ ...f, byProducts: [...f.byProducts, newByProduct()] })}>+ Add by-product</Button></div>}
        </div>
      )}
      {tab === 'cost' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
          <div>
            <SectionCard title="Material" padding={0}>
              <table className="data-table dense"><thead><tr><th>Component</th><th className="right">Qty incl. scrap</th><th className="right">Unit cost</th><th>Source</th><th className="right">Extended</th></tr></thead><tbody>
                {roll.lines.map((l) => <tr key={l.itemId}><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money">{fmtQty(l.qty, undefined, 4)}</td><td className="right money">{fmtMoney(l.unitCost, s.currency)}</td><td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{l.source}</td><td className="right money">{fmtMoney(l.extended, s.currency)}</td></tr>)}
              </tbody><tfoot><tr><td colSpan={4}>Material</td><td className="right money">{fmtMoney(roll.material, s.currency)}</td></tr></tfoot></table>
            </SectionCard>
            <div style={{ height: 12 }} />
            <SectionCard title={`Conversion · ${routingOps.length ? routings.find((r) => r.id === f.routingId)?.code : 'no routing'}`} padding={0}>
              <table className="data-table dense"><thead><tr><th>Operation</th><th className="right">Minutes / output</th><th className="right">Labour</th><th className="right">Machine</th><th className="right">Overhead</th><th className="right">Subcontract</th></tr></thead><tbody>
                {roll.ops.map((o, i) => <tr key={i}><td>{o.name}</td><td className="right money">{o.minutes.toFixed(1)}</td><td className="right money">{fmtMoney(o.labour, s.currency)}</td><td className="right money">{fmtMoney(o.machine, s.currency)}</td><td className="right money">{fmtMoney(o.overhead, s.currency)}</td><td className="right money">{fmtMoney(o.subcontract, s.currency)}</td></tr>)}
                {roll.ops.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-3)', fontSize: 13 }}>Link a routing to include labour, machine and overhead in the standard cost.</td></tr>}
              </tbody></table>
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-4)' }}>Setup time amortised over a standard lot of {Math.max(f.outputQty, outputItem?.reorderQty || 50)} {outputItem?.baseUom ?? ''}.</div>
            </SectionCard>
          </div>
          <div>
            <SummaryBlock style={{ flexDirection: 'column', gap: 10 }} items={[{ label: 'Material', value: fmtMoney(roll.material, s.currency) }, { label: 'Labour', value: fmtMoney(roll.labour, s.currency) }, { label: 'Machine', value: fmtMoney(roll.machine, s.currency) }, { label: 'Overhead', value: fmtMoney(roll.overhead, s.currency) }, { label: 'Subcontract', value: fmtMoney(roll.subcontract, s.currency) }, { label: 'By-product credit', value: `− ${fmtMoney(roll.byProductCredit, s.currency)}`, tone: 'good' }, { label: `Standard cost per ${outputItem?.baseUom ?? 'unit'}`, value: fmtMoney(roll.perUnit, s.currency) }]} />
            <div style={{ marginTop: 12 }}>
              <KV items={[{ k: 'Item std cost', v: outputItem?.standardCost !== undefined ? fmtMoney(outputItem.standardCost, s.currency) : '—' }, { k: 'Difference', v: outputItem?.standardCost !== undefined ? <span className={roll.perUnit > outputItem.standardCost ? 'money-negative' : 'money-positive'}>{fmtMoney(roll.perUnit - outputItem.standardCost, s.currency)}</span> : '—' }, { k: 'Last roll-up', v: bom?.rolledUpAt ? fmtDate(bom.rolledUpAt) : 'Not saved yet' }]} />
              {bom && <Button style={{ marginTop: 12 }} onClick={() => { try { const r = updateItemStandardCost(bom.id); toast.success(`${r.item.name}: standard cost ${r.from ?? '—'} → ${r.to}`); } catch (e: any) { toast.error(e.message); } }}>Update item standard cost</Button>}
            </div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
