// Work centres — register, form and 4-week capacity board (FR-MFG-004).
import { useEffect, useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import { RegisterPage, Drawer, Button, Badge, TextField, NumberField, PercentField, MoneyField, ChipGroup, EntityPicker, useWarehouseOptions, Meter, useToast, Toggle, ScopeLine, type Column, type MenuAction } from '../../components/ui';
import { fmtMoney, fmtPct } from '../../lib/format';
import type { WorkCentre } from './types';
import { whName } from './core';
import { capacityBoard } from './planning';
import { saveWorkCentre } from './masterActions';
import { SectionCard, OrderLink } from './shared';

const DAYS = [{ value: '1', label: 'Mon' }, { value: '2', label: 'Tue' }, { value: '3', label: 'Wed' }, { value: '4', label: 'Thu' }, { value: '5', label: 'Fri' }, { value: '6', label: 'Sat' }, { value: '0', label: 'Sun' }];

export function WorkCentresPage({ id }: { id?: string }) {
  const s = useSession();
  const cid = s.state.companyId;
  const wcs = useCollection<WorkCentre>(C.workCentres).filter((w) => w.companyId === cid);
  useCollection(C.productionOrders);
  const [editing, setEditing] = useState<{ w?: WorkCentre } | null>(id === 'new' ? {} : null);
  const [board, setBoard] = useState(true);
  const view = id && id !== 'new' ? wcs.find((w) => w.id === id) : undefined;
  useEffect(() => { if (view && !editing) setEditing({ w: view }); }, [view?.id]);
  const rows = useMemo(() => wcs.map((w) => { const weeks = capacityBoard(w, 4); const load = weeks.reduce((x, k) => x + k.load, 0); const cap = weeks.reduce((x, k) => x + k.capacity, 0); return { ...w, weeks, load, cap, util: cap ? (load / cap) * 100 : 0 }; }), [wcs]);
  const columns: Column<(typeof rows)[number]>[] = [
    { key: 'code', label: 'Code', sortable: true, render: (w) => <span className="identifier link" style={{ fontWeight: 500 }}>{w.code}</span> },
    { key: 'name', label: 'Work centre', sortable: true, render: (w) => <div><div>{w.name}</div><div className="cell-secondary">{w.permittedOperations.join(' · ')}</div></div> },
    { key: 'calendar', label: 'Calendar', render: (w) => <span style={{ fontSize: 12 }}>{w.workingDays.length} d/wk · {w.hoursPerDay} h/d · cap {w.capacityHrsPerDay} h · eff {w.efficiencyPct}%</span> },
    { key: 'rates', label: 'Rates / h', render: (w) => <span className="money" style={{ fontSize: 12 }}>L {fmtMoney(w.costRateLabour, s.currency)} · M {fmtMoney(w.costRateMachine, s.currency)} · OH {fmtMoney(w.overheadRate, s.currency)}</span> },
    { key: 'warehouseId', label: 'WIP location', render: (w) => whName(w.warehouseId) },
    { key: 'util', label: 'Load · 4 wks', sortable: true, render: (w) => <div style={{ minWidth: 140 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}><span>{w.load.toFixed(0)} / {w.cap.toFixed(0)} h</span><span style={{ color: w.util >= 100 ? '#C0393F' : w.util >= 80 ? '#8A4B0F' : '#5F6368' }}>{fmtPct(w.util, 0)}</span></div><Meter value={w.load} max={w.cap} /></div>, value: (w) => w.util },
    { key: 'status', label: 'Status', render: (w) => <Badge status={w.status} /> },
  ];
  const rowActions = (w: WorkCentre): MenuAction[] => [{ label: 'Edit', onClick: () => setEditing({ w }) }, { label: 'Open orders at this centre', onClick: () => nav.go('production/orders') }];
  return (
    <>
      <RegisterPage title="Work centres" subtitle={<ScopeLine extra={`${wcs.filter((w) => w.status === 'Active').length} active centres`} />} rows={rows} columns={columns} entity="work centres" searchKeys={['code', 'name']}
        primaryAction={{ label: 'New work centre', onClick: () => setEditing({}) }} actions={<Button onClick={() => setBoard(!board)}>{board ? 'Hide capacity board' : 'Capacity board'}</Button>} onRowClick={(w) => setEditing({ w })} rowActions={rowActions}
        headerExtra={board ? <CapacityBoard rows={rows} /> : undefined} />
      {editing && <WorkCentreEditor wc={editing.w} onClose={() => { setEditing(null); if (id) nav.go('production/work-centres'); }} />}
    </>
  );
}

function CapacityBoard({ rows }: { rows: (WorkCentre & { weeks: ReturnType<typeof capacityBoard> })[] }) {
  return (
    <SectionCard title="Capacity board · planned load from open orders vs available hours (next 4 weeks)" padding={0}>
      <table className="data-table dense"><thead><tr><th>Work centre</th>{rows[0]?.weeks.map((k) => <th key={k.weekStart}>Week {k.label}</th>)}</tr></thead><tbody>
        {rows.map((w) => (
          <tr key={w.id}>
            <td><div style={{ fontWeight: 500 }}>{w.name}</div><div className="cell-secondary">{w.capacityHrsPerDay} h/d × {w.workingDays.length} d × {w.efficiencyPct}%</div></td>
            {w.weeks.map((k) => { const pct = k.capacity ? (k.load / k.capacity) * 100 : 0; return (
              <td key={k.weekStart} style={{ minWidth: 160 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}><span className="money">{k.load.toFixed(1)} / {k.capacity.toFixed(0)} h</span><span style={{ color: pct >= 100 ? '#C0393F' : pct >= 80 ? '#8A4B0F' : '#5F6368', fontWeight: 500 }}>{fmtPct(pct, 0)}</span></div>
                <Meter value={k.load} max={k.capacity} />
                {k.orders.length > 0 && <div style={{ fontSize: 11, color: '#6E6E71', marginTop: 3, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{k.orders.slice(0, 3).map((o) => <span key={o.id}><OrderLink id={o.id} number={o.number.replace('PRD/26-27/', '#')} /> {o.hours.toFixed(1)}h</span>)}{k.orders.length > 3 && <span>+{k.orders.length - 3}</span>}</div>}
              </td>); })}
          </tr>))}
        {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: '#5F6368' }}>No work centres yet.</td></tr>}
      </tbody></table>
    </SectionCard>
  );
}

function WorkCentreEditor({ wc, onClose }: { wc?: WorkCentre; onClose: () => void }) {
  const toast = useToast();
  const whs = useWarehouseOptions();
  const [f, setF] = useState<Omit<WorkCentre, 'id' | 'createdAt' | 'updatedAt' | 'version'>>({ code: wc?.code ?? '', name: wc?.name ?? '', workingDays: wc?.workingDays ?? [1, 2, 3, 4, 5, 6], hoursPerDay: wc?.hoursPerDay ?? 8, capacityHrsPerDay: wc?.capacityHrsPerDay ?? 8, efficiencyPct: wc?.efficiencyPct ?? 90, costRateLabour: wc?.costRateLabour ?? 250, costRateMachine: wc?.costRateMachine ?? 0, overheadRate: wc?.overheadRate ?? 100, warehouseId: wc?.warehouseId ?? 'wh_wip', branchId: wc?.branchId, permittedOperations: wc?.permittedOperations ?? [], status: wc?.status ?? 'Active' });
  const [opInput, setOpInput] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const weekly = f.workingDays.length * f.capacityHrsPerDay * (f.efficiencyPct / 100);
  const submit = () => { try { const out = saveWorkCentre(f as any, wc?.id); toast.success(`${out.name} saved`); onClose(); } catch (e: any) { setErr(e.message); } };
  const addOp = () => { const v = opInput.trim(); if (v && !f.permittedOperations.includes(v)) setF({ ...f, permittedOperations: [...f.permittedOperations, v] }); setOpInput(''); };
  return (
    <Drawer open onClose={onClose} width={760} title={wc ? `${wc.code} · ${wc.name}` : 'New work centre'} subtitle="Calendar, capacity, efficiency and cost rates" headerRight={<Toggle on={f.status === 'Active'} onChange={(v) => setF({ ...f, status: v ? 'Active' : 'Inactive' })} label={f.status} />}
      footer={<><div style={{ flex: 1, fontSize: 12, color: '#5F6368' }}>Effective capacity <strong>{weekly.toFixed(1)} h / week</strong></div><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save work centre</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
        <TextField label="Code" required value={f.code} onChange={(v) => setF({ ...f, code: v })} uppercase />
        <TextField label="Name" required value={f.name} onChange={(v) => setF({ ...f, name: v })} />
      </div>
      <div style={{ marginTop: 12 }}><ChipGroup label="Working days" multiple value={f.workingDays.map(String)} onChange={(v: string[]) => setF({ ...f, workingDays: v.map(Number).sort() })} options={DAYS} /></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 12 }}>
        <NumberField label="Hours per day" value={f.hoursPerDay} onChange={(v) => setF({ ...f, hoursPerDay: v })} decimals={1} />
        <NumberField label="Capacity hrs / day" value={f.capacityHrsPerDay} onChange={(v) => setF({ ...f, capacityHrsPerDay: v })} decimals={1} help="Machines × hours (e.g. 2 bays × 8 h = 16)" />
        <PercentField label="Efficiency" value={f.efficiencyPct} onChange={(v) => setF({ ...f, efficiencyPct: v })} />
        <MoneyField label="Labour rate / h" value={f.costRateLabour} onChange={(v) => setF({ ...f, costRateLabour: v })} />
        <MoneyField label="Machine rate / h" value={f.costRateMachine} onChange={(v) => setF({ ...f, costRateMachine: v })} />
        <MoneyField label="Overhead rate / h" value={f.overheadRate} onChange={(v) => setF({ ...f, overheadRate: v })} help="Absorbed into WIP with labour/machine" />
      </div>
      <div style={{ marginTop: 12 }}><EntityPicker label="WIP warehouse (location)" required value={f.warehouseId} onChange={(v) => setF({ ...f, warehouseId: v ?? '' })} options={whs} /></div>
      <div style={{ marginTop: 12 }}>
        <label className="field-label">Permitted operations</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {f.permittedOperations.map((op) => <span key={op} className="chip selected" onClick={() => setF({ ...f, permittedOperations: f.permittedOperations.filter((x) => x !== op) })}>{op} <span className="x">✕</span></span>)}
          <input className="field-input sm" style={{ width: 160 }} value={opInput} placeholder="Add operation…" onChange={(e) => setOpInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOp(); } }} onBlur={addOp} />
        </div>
      </div>
      {wc && <div style={{ marginTop: 20 }}><CapacityBoard rows={[{ ...wc, ...f, id: wc.id, createdAt: wc.createdAt, updatedAt: wc.updatedAt, version: wc.version, weeks: capacityBoard({ ...wc, ...f } as WorkCentre, 4) }]} /></div>}
    </Drawer>
  );
}
