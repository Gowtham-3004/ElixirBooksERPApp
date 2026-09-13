// Warehouses & bins (FR-WHS-001).
import { useMemo, useState } from 'react';
import { C, engine, nav, useCollection, useSession } from '../../store';
import type { Branch, Warehouse } from '../../store';
import { Badge, Button, Drawer, RegisterPage, SelectField, TextField, TwoLine, useToast } from '../../components/ui';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, nextCode, saveMaster, statusTabs, useForm } from './shared';
import { AddressFields, emptyAddress } from './partyShared';

const TYPES: Warehouse['type'][] = ['Standard', 'Transit', 'Quarantine', 'Scrap', 'WIP'];

export function WarehouseRegister() {
  const s = useSession();
  const rows = useCollection<Warehouse>(C.warehouses).filter((w) => w.companyId === s.state.companyId);
  const branches = useCollection<Branch>(C.branches);
  const moves = useCollection<any>(C.stockMovements);
  const [editing, setEditing] = useState<Warehouse | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const canEdit = s.can('masters.warehouses.edit') || s.can('masters.warehouses.create');
  const skus = (id: string) => new Set(moves.filter((m) => m.warehouseId === id).map((m) => m.itemId)).size;
  const value = (id: string) => { const items = Array.from(new Set(moves.filter((m) => m.warehouseId === id).map((m) => m.itemId as string))); return items.reduce((sum, it) => sum + engine.stockPosition(it, id).value, 0); };
  return (
    <>
      <RegisterPage<Warehouse>
        title="Warehouses & bins"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${rows.reduce((a, r) => a + r.bins.length, 0)} bins · ${s.company?.tradeName}`}
        entity="warehouses"
        rows={rows}
        searchKeys={['name', 'code', 'type']}
        tabs={statusTabs<Warehouse>()}
        filters={[{ key: 'type', label: 'Type', type: 'select', options: TYPES.map((t) => ({ value: t, label: t })) }, { key: 'branchId', label: 'Branch', type: 'select', options: branches.map((b) => ({ value: b.id, label: b.name })) }]}
        applyFilter={(r, f) => (!f.type || r.type === f.type) && (!f.branchId || r.branchId === f.branchId)}
        primaryAction={{ label: 'New warehouse', onClick: () => setEditing('new'), disabled: !s.can('masters.warehouses.create'), reason: s.can('masters.warehouses.create') ? undefined : 'Requires warehouse create permission' }}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => masterRowActions({ collection: C.warehouses, objectType: 'Warehouse', row: r, canEdit, onEdit: () => setEditing(r), extra: [{ label: 'Stock on hand', onClick: () => nav.go(`inventory/stock?warehouse=${r.id}`) }] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.warehouses, 'Warehouse', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Warehouse', sortable: true, render: (r) => <TwoLine primary={r.name} secondary={r.code} mono /> },
          { key: 'type', label: 'Type', render: (r) => (r.type === 'Standard' ? 'Standard' : <span className="pill pill-neutral">{r.type}</span>) },
          { key: 'branch', label: 'Branch', render: (r) => branches.find((b) => b.id === r.branchId)?.name ?? '—' },
          { key: 'bins', label: 'Bins', render: (r) => (r.bins.length ? <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{r.bins.slice(0, 5).map((b) => <span key={b} className="pill pill-neutral">{b}</span>)}{r.bins.length > 5 && <span style={{ fontSize: 12, color: '#5F6368' }}>+{r.bins.length - 5}</span>}</span> : '—'), value: (r) => r.bins.length },
          { key: 'skus', label: 'SKUs', align: 'right', render: (r) => skus(r.id) || '—' },
          { key: 'value', label: 'Stock value', align: 'right', render: (r) => { const v = value(r.id); return v ? <span className="money">{v.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> : '—'; } },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <WarehouseForm warehouse={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="warehouses" entityLabel="Warehouses" candidateFields={['code', 'name']} />
    </>
  );
}

function WarehouseForm({ warehouse, onClose }: { warehouse?: Warehouse; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<Warehouse>(C.warehouses).filter((w) => w.companyId === s.state.companyId);
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId);
  const f = useForm<any>(warehouse ? { ...warehouse, bins: [...warehouse.bins], address: warehouse.address ?? emptyAddress(), hasAddress: !!warehouse.address } : { code: nextCode(rows, 'WH-'), name: '', branchId: s.state.branchId, bins: [], type: 'Standard', status: 'Active', address: emptyAddress(), hasAddress: false });
  const [bin, setBin] = useState('');
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const dups = useMemo(() => findDuplicates('warehouses', rows, f.v, warehouse?.id), [rows, f.v.code, f.v.name]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const addBin = () => { const b = bin.trim().toUpperCase(); if (!b) return; if (f.v.bins.includes(b)) { f.setErrors({ bins: `Bin ${b} already exists` }); return; } f.set('bins', [...f.v.bins, b]); setBin(''); };
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.code.trim()) e.code = 'Code is required';
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (!f.v.branchId) e.branchId = 'Warehouse must map to a branch';
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const { hasAddress, address, ...rest } = f.v;
      const saved = saveMaster<Warehouse>(C.warehouses, 'Warehouse', { ...rest, code: rest.code.toUpperCase(), address: hasAddress ? address : undefined }, warehouse?.id, { expectedVersion: warehouse?.version });
      toast.success(warehouse ? `${saved.name} updated` : `Warehouse ${saved.code} created`);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? 'Could not save'); setSaving(false); }
  };
  return (
    <Drawer open onClose={onClose} title={warehouse ? `Edit ${warehouse.name}` : 'New warehouse'} subtitle="Warehouse master · FR-WHS-001" width={640}
      headerRight={warehouse && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={warehouse ? 'Save warehouse' : 'Create warehouse'} disabled={blocked} reason={blocked ? 'Duplicate blocked' : undefined} /> : undefined}>
      {tab === 'history' && warehouse ? <ChangeHistory objectId={warehouse.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} />
            <TextField label="Name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
            <SelectField label="Branch" required value={f.v.branchId ?? ''} onChange={(v) => f.set('branchId', v)} options={branches.map((b) => ({ value: b.id, label: `${b.name} (${b.code})` }))} error={f.errors.branchId} />
            <SelectField label="Type" value={f.v.type} onChange={(v) => f.set('type', v)} options={TYPES} help={f.v.type === 'Transit' ? 'Stock in transfer sits here between warehouses' : f.v.type === 'Quarantine' ? 'QC-hold stock; not available for sale' : f.v.type === 'WIP' ? 'Work-in-progress for production' : undefined} />
            <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive']} />
          </div>
          <div>
            <label className="field-label">Bins / locations</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {f.v.bins.map((b: string) => <span key={b} className="chip selected" onClick={() => f.set('bins', f.v.bins.filter((x: string) => x !== b))}>{b} <span className="x">✕</span></span>)}
              {!f.v.bins.length && <span style={{ fontSize: 12, color: '#5F6368' }}>No bins — stock is tracked at warehouse level</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <TextField value={bin} onChange={setBin} placeholder="A-01" size="sm" style={{ width: 200 }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBin(); } }} error={f.errors.bins} />
              <Button size="sm" variant="secondary" onClick={addBin}>Add bin</Button>
            </div>
          </div>
          <div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}><input type="checkbox" className="checkbox" checked={f.v.hasAddress} onChange={(e) => f.set('hasAddress', e.target.checked)} /> Address differs from branch</label>
            {f.v.hasAddress && <div style={{ marginTop: 10 }}><AddressFields value={f.v.address} onChange={(a) => f.set('address', a)} /></div>}
          </div>
        </div>
      )}
    </Drawer>
  );
}
