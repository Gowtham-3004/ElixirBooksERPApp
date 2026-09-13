// Routings — register + operations editor with cost-per-unit summary (FR-MFG-003).
import { useEffect, useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import { RegisterPage, Drawer, Button, Badge, TextField, NumberField, SelectField, CheckboxField, EntityPicker, useItemOptions, useSupplierOptions, SummaryBlock, useToast, Toggle, type Column, type MenuAction } from '../../components/ui';
import { fmtMoney } from '../../lib/format';
import type { Routing, RoutingOperation, WorkCentre } from './types';
import { opStdCost, whName } from './core';
import { newOperation, saveRouting } from './masterActions';
import { serviceItems } from './subcontractActions';

export function RoutingsPage({ id }: { id?: string }) {
  const s = useSession();
  const cid = s.state.companyId;
  const routings = useCollection<Routing>(C.routings).filter((r) => r.companyId === cid);
  const wcs = useCollection<WorkCentre>(C.workCentres);
  const [editing, setEditing] = useState<{ r?: Routing } | null>(id === 'new' ? {} : null);
  const view = id && id !== 'new' ? routings.find((r) => r.id === id) : undefined;
  useEffect(() => { if (view && !editing) setEditing({ r: view }); }, [view?.id]);
  const rows = useMemo(() => routings.map((r) => { const std = r.operations.map((op) => opStdCost(op, 100)); const lot = 100; return { ...r, opsCount: r.operations.length, minutesPerUnit: r.operations.reduce((x, op) => x + op.runMinPerUnit, 0), costPerUnit: std.reduce((x, o) => x + o.labour + o.machine + o.overhead + o.subcontract, 0) / lot, hasSub: r.operations.some((o) => o.subcontract), wcNames: Array.from(new Set(r.operations.map((o) => wcs.find((w) => w.id === o.workCentreId)?.name ?? '—'))).join(', ') }; }), [routings, wcs]);
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'code', label: 'Routing', sortable: true, render: (r) => <span className="identifier link" style={{ fontWeight: 500 }}>{r.code}</span> },
    { key: 'name', label: 'Name', sortable: true, render: (r) => <div><div>{r.name}</div><div className="cell-secondary">{r.itemName ?? 'Generic'}</div></div> },
    { key: 'opsCount', label: 'Operations', align: 'right', render: (r) => <span className="money">{r.opsCount}{r.hasSub && <Badge status="Submitted" style={{ marginLeft: 6 }}>subcontract</Badge>}</span> },
    { key: 'wcNames', label: 'Work centres' },
    { key: 'minutesPerUnit', label: 'Run min / unit', align: 'right', render: (r) => <span className="money">{r.minutesPerUnit.toFixed(1)}</span> },
    { key: 'costPerUnit', label: 'Conversion / unit (lot 100)', align: 'right', sortable: true, render: (r) => <span className="money">{fmtMoney(r.costPerUnit, s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  const rowActions = (r: Routing): MenuAction[] => [{ label: 'Edit', onClick: () => setEditing({ r }) }, { label: 'Duplicate', onClick: () => { const c = saveRouting({ ...r, code: undefined, name: `${r.name} (copy)`, operations: r.operations.map((op) => ({ ...op, id: op.id + '_c' })) }); setEditing({ r: c }); } }, { label: 'BOMs using this routing', onClick: () => nav.go('production/boms') }];
  return (
    <>
      <RegisterPage title="Routings" subtitle={`${routings.filter((r) => r.status === 'Active').length} active · operations, work centres, times and rates`} rows={rows} columns={columns} entity="routings" searchKeys={['code', 'name', 'itemName']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (r) => r.status === 'Active' }, { id: 'inactive', label: 'Inactive', filter: (r) => r.status === 'Inactive' }]}
        primaryAction={{ label: 'New routing', onClick: () => setEditing({}) }} onRowClick={(r) => setEditing({ r })} rowActions={rowActions} />
      {editing && <RoutingEditor routing={editing.r} onClose={() => { setEditing(null); if (id) nav.go('production/routings'); }} />}
    </>
  );
}

function RoutingEditor({ routing, onClose }: { routing?: Routing; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const wcs = useCollection<WorkCentre>(C.workCentres).filter((w) => w.status === 'Active');
  const items = useItemOptions((i) => i.isStock);
  const suppliers = useSupplierOptions();
  const services = serviceItems();
  const [f, setF] = useState<{ code?: string; name: string; itemId?: string; status: 'Active' | 'Inactive'; notes?: string; operations: RoutingOperation[] }>({ code: routing?.code, name: routing?.name ?? '', itemId: routing?.itemId, status: routing?.status ?? 'Active', notes: routing?.notes, operations: routing?.operations.map((o) => ({ ...o })) ?? [newOperation(10, wcs[0]?.id)] });
  const [lot, setLot] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const setOp = (i: number, patch: Partial<RoutingOperation>) => setF({ ...f, operations: f.operations.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  const std = f.operations.map((op) => opStdCost(op, lot));
  const totals = std.reduce((a, o) => ({ labour: a.labour + o.labour, machine: a.machine + o.machine, overhead: a.overhead + o.overhead, subcontract: a.subcontract + o.subcontract, minutes: a.minutes + o.minutes }), { labour: 0, machine: 0, overhead: 0, subcontract: 0, minutes: 0 });
  const perUnit = (totals.labour + totals.machine + totals.overhead + totals.subcontract) / lot;
  const submit = () => { try { const out = saveRouting(f, routing?.id); toast.success(`${out.code} saved`); onClose(); } catch (e: any) { setErr(e.message); } };
  return (
    <Drawer open onClose={onClose} width={1040} title={routing ? `${routing.code} · ${routing.name}` : 'New routing'} subtitle="Ordered operations with setup/run times; rates default from the work centre" headerRight={<Toggle on={f.status === 'Active'} onChange={(v) => setF({ ...f, status: v ? 'Active' : 'Inactive' })} label={f.status} />}
      footer={<><div style={{ flex: 1, fontSize: 12, color: '#5F6368' }}>Conversion cost per unit at lot {lot}: <strong className="money">{fmtMoney(perUnit, s.currency)}</strong></div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save routing</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: 12 }}>
        <TextField label="Code" value={f.code ?? ''} onChange={(v) => setF({ ...f, code: v })} placeholder="auto" uppercase />
        <TextField label="Name" required value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <EntityPicker label="Default for item" value={f.itemId} onChange={(v) => setF({ ...f, itemId: v })} options={items} help="Optional — generic routings can be linked from any BOM" />
      </div>
      <div className="card" style={{ marginTop: 16, overflow: 'visible' }}>
        <table className="data-table dense"><thead><tr><th style={{ width: 56 }}>Seq</th><th style={{ width: 150 }}>Operation</th><th style={{ width: 150 }}>Work centre</th><th className="right" style={{ width: 80 }}>Setup min</th><th className="right" style={{ width: 90 }}>Run min/unit</th><th className="right" style={{ width: 90 }}>Labour ₹/h</th><th className="right" style={{ width: 90 }}>Machine ₹/h</th><th className="right" style={{ width: 70 }}>Yield %</th><th style={{ width: 60 }}>Parallel</th><th style={{ width: 240 }}>Subcontract</th><th className="right" style={{ width: 100 }}>Cost / lot</th><th style={{ width: 36 }} /></tr></thead><tbody>
          {f.operations.map((op, i) => (
            <tr key={op.id}>
              <td><NumberField value={op.seq} onChange={(v) => setOp(i, { seq: v })} decimals={0} size="grid" /></td>
              <td><TextField value={op.name} onChange={(v) => setOp(i, { name: v })} size="grid" placeholder="Cut / Weld…" /></td>
              <td><SelectField value={op.workCentreId} onChange={(v) => { const w = wcs.find((x) => x.id === v); setOp(i, { workCentreId: v, labourRate: w?.costRateLabour ?? op.labourRate, machineRate: w?.costRateMachine ?? op.machineRate }); }} options={wcs.map((w) => ({ value: w.id, label: w.name }))} size="grid" placeholder="Pick…" allowEmpty /></td>
              <td><NumberField value={op.setupMin} onChange={(v) => setOp(i, { setupMin: v })} decimals={0} size="grid" /></td>
              <td><NumberField value={op.runMinPerUnit} onChange={(v) => setOp(i, { runMinPerUnit: v })} decimals={2} size="grid" /></td>
              <td><NumberField value={op.labourRate} onChange={(v) => setOp(i, { labourRate: v })} decimals={0} size="grid" disabled={op.subcontract} /></td>
              <td><NumberField value={op.machineRate} onChange={(v) => setOp(i, { machineRate: v })} decimals={0} size="grid" disabled={op.subcontract} /></td>
              <td><NumberField value={op.yieldPct} onChange={(v) => setOp(i, { yieldPct: v })} decimals={0} size="grid" /></td>
              <td><CheckboxField checked={op.parallel} onChange={(v) => setOp(i, { parallel: v })} label="" /></td>
              <td>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <Toggle on={op.subcontract} onChange={(v) => setOp(i, { subcontract: v, supplierId: v ? op.supplierId ?? suppliers[0]?.id : undefined, serviceItemId: v ? op.serviceItemId ?? services[0]?.id : undefined, subcontractRate: v ? op.subcontractRate ?? services[0]?.purchasePrice ?? 0 : undefined })} label={<span style={{ fontSize: 12 }}>{op.subcontract ? 'Subcontracted' : 'In-house'}</span>} />
                  {op.subcontract && (
                    <>
                      <SelectField value={op.supplierId ?? ''} onChange={(v) => setOp(i, { supplierId: v })} options={suppliers.map((x) => ({ value: x.id, label: x.primary }))} size="grid" placeholder="Supplier" allowEmpty />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <SelectField value={op.serviceItemId ?? ''} onChange={(v) => setOp(i, { serviceItemId: v, subcontractRate: services.find((x) => x.id === v)?.purchasePrice ?? op.subcontractRate })} options={services.map((x) => ({ value: x.id, label: x.name }))} size="grid" placeholder="Service item" allowEmpty style={{ flex: 1 }} />
                        <NumberField value={op.subcontractRate ?? 0} onChange={(v) => setOp(i, { subcontractRate: v })} decimals={2} size="grid" prefix="₹" style={{ width: 110 }} />
                      </div>
                    </>
                  )}
                </div>
              </td>
              <td className="right money" style={{ fontSize: 12 }}>{fmtMoney(std[i].labour + std[i].machine + std[i].overhead + std[i].subcontract, s.currency)}</td>
              <td><button type="button" className="btn-icon" onClick={() => setF({ ...f, operations: f.operations.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>))}
        </tbody></table>
        <div style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'center' }}><Button size="sm" onClick={() => setF({ ...f, operations: [...f.operations, newOperation((Math.max(0, ...f.operations.map((o) => o.seq)) || 0) + 10, wcs[0]?.id)] })}>+ Add operation</Button><span style={{ fontSize: 12, color: '#5F6368' }}>Overhead rate comes from the work centre ({wcs.map((w) => `${w.name} ₹${w.overheadRate}/h`).join(' · ')})</span></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 16, marginTop: 16, alignItems: 'start' }}>
        <SummaryBlock items={[{ label: `Minutes / lot`, value: totals.minutes.toFixed(0) }, { label: 'Labour', value: fmtMoney(totals.labour, s.currency) }, { label: 'Machine', value: fmtMoney(totals.machine, s.currency) }, { label: 'Overhead', value: fmtMoney(totals.overhead, s.currency) }, { label: 'Subcontract', value: fmtMoney(totals.subcontract, s.currency) }, { label: 'Per unit', value: fmtMoney(perUnit, s.currency), tone: 'good' }]} />
        <NumberField label="Cost basis lot size" value={lot} onChange={(v) => setLot(Math.max(1, v))} decimals={0} help="Setup amortised over this lot" />
      </div>
      <div style={{ marginTop: 12 }}><TextField label="Notes" value={f.notes ?? ''} onChange={(v) => setF({ ...f, notes: v })} /></div>
      <div style={{ marginTop: 8, fontSize: 12, color: '#6E6E71' }}>WIP location for operations: {Array.from(new Set(f.operations.map((o) => whName(wcs.find((w) => w.id === o.workCentreId)?.warehouseId)))).join(', ') || '—'}</div>
    </Drawer>
  );
}
