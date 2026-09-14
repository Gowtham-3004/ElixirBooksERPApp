// Service catalog register + drawer form (FR-SRV-001). Creates/updates Items of type Service.
import { useEffect, useState } from 'react';
import { C, nav, useSession } from '../../store';
import { RegisterPage, Drawer, Button, TextField, NumberField, SelectField, TextArea, CheckboxField, Badge, Money, useToast, useTaxRateOptions, useAccountOptions, EntityPicker, TwoLine, Identifier } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtMoney } from '../../lib/format';
import type { Service, ServiceUnit } from './types';
import { useRows } from './data';
import { saveService } from './actions';

const UNITS: ServiceUnit[] = ['Hr', 'Day', 'Month', 'Fixed'];

export default function Catalog({ editId }: { editId?: string }) {
  const rows = useRows<Service>(C.services, (a, b) => a.name.localeCompare(b.name));
  const s = useSession();
  const [open, setOpen] = useState<Partial<Service> | null>(null);
  useEffect(() => { if (editId) { const r = rows.find((x) => x.id === editId); if (r) setOpen(r); } }, [editId, rows]);
  const can = s.can('projects.catalog.edit') || s.can('projects.*');
  const taxOpts = useTaxRateOptions();
  const columns: Column<Service>[] = [
    { key: 'code', label: 'Code', sortable: true, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.code}</Identifier> },
    { key: 'name', label: 'Service', sortable: true, render: (r) => <TwoLine primary={r.name} secondary={r.description} /> },
    { key: 'sac', label: 'SAC', render: (r) => <span className="identifier">{r.sac ?? '—'}</span> },
    { key: 'unit', label: 'Unit', sortable: true },
    { key: 'defaultRate', label: 'Default rate', align: 'right', sortable: true, render: (r) => <Money value={r.defaultRate} currency={s.currency} />, value: (r) => r.defaultRate },
    { key: 'tax', label: 'Tax', render: (r) => taxOpts.find((o) => o.value === r.taxRateId)?.label ?? '—' },
    { key: 'billableDefault', label: 'Billable', render: (r) => <Badge status={r.billableDefault ? 'Active' : 'Inactive'}>{r.billableDefault ? 'Billable' : 'Non-billable'}</Badge> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  const rowActions = (r: Service): MenuAction[] => [
    { label: 'Edit', onClick: () => setOpen(r), disabled: !can, reason: can ? undefined : 'Requires projects.catalog.edit' },
    { label: 'Open item master', onClick: () => nav.go(`masters/items/${r.itemId}`) },
    { label: 'New contract using this service', onClick: () => nav.go('projects/contracts/new') },
    { label: r.status === 'Active' ? 'Deactivate' : 'Reactivate', danger: r.status === 'Active', separator: true, onClick: () => saveService({ ...r, status: r.status === 'Active' ? 'Inactive' : 'Active' }) },
  ];
  return (
    <>
      <RegisterPage<Service>
        title="Service catalog"
        subtitle={<>{rows.filter((r) => r.status === 'Active').length} active services · linked to item master (type Service, non-stock) · {s.company?.tradeName}</>}
        rows={rows}
        columns={columns}
        entity="services"
        searchKeys={['code', 'name', 'sac']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (r) => r.status === 'Active' }, { id: 'inactive', label: 'Inactive', filter: (r) => r.status === 'Inactive' }]}
        filters={[{ key: 'unit', label: 'Unit', type: 'select', options: UNITS.map((u) => ({ value: u, label: u })) }]}
        applyFilter={(r, f) => !f.unit || r.unit === f.unit}
        primaryAction={{ label: 'New service', onClick: () => setOpen({ unit: 'Hr', defaultRate: 0, billableDefault: true, status: 'Active', taxRateId: s.company?.defaults.taxRateId, revenueAccountId: 'acc_4010' }), disabled: !can, reason: can ? undefined : 'Requires projects.catalog.edit' }}
        onRowClick={(r) => setOpen(r)}
        rowActions={rowActions}
      />
      {open && <ServiceDrawer value={open} onClose={() => { setOpen(null); if (editId) nav.replace('projects/catalog'); }} />}
    </>
  );
}

function ServiceDrawer({ value, onClose }: { value: Partial<Service>; onClose: () => void }) {
  const [f, setF] = useState<Partial<Service>>(value);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const taxOpts = useTaxRateOptions();
  const accOpts = useAccountOptions((a) => a.type === 'Income');
  const set = (p: Partial<Service>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    try {
      const out = saveService({ ...f, name: f.name ?? '', unit: f.unit ?? 'Hr', defaultRate: f.defaultRate ?? 0 });
      toast.success(`Service ${out.code} saved`);
      onClose();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Drawer open onClose={onClose} title={value.id ? `Edit ${value.code}` : 'New service'} subtitle="Saved to the item master as a non-stock Service item" width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Discard changes</Button><Button variant="primary" onClick={save}>Save service</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <TextField label="Service name" required value={f.name} onChange={(v) => set({ name: v })} autoFocus style={{ gridColumn: '1 / -1' }} />
        <TextField label="Code" value={f.code} onChange={(v) => set({ code: v })} help="Blank = generated from the name" uppercase />
        <TextField label="SAC" value={f.sac} onChange={(v) => set({ sac: v })} placeholder="998311" help="Services accounting code for GST" />
        <SelectField label="Unit" value={f.unit} onChange={(v) => set({ unit: v as ServiceUnit })} options={UNITS} />
        <NumberField label="Default rate" value={f.defaultRate} onChange={(v) => set({ defaultRate: v })} prefix="₹" help={f.unit === 'Fixed' ? 'Per deliverable; contracts set the actual value' : `Per ${f.unit?.toLowerCase()}`} />
        <SelectField label="Tax rate" value={f.taxRateId} onChange={(v) => set({ taxRateId: v })} options={taxOpts} allowEmpty />
        <EntityPicker label="Revenue account" value={f.revenueAccountId} onChange={(id) => set({ revenueAccountId: id })} options={accOpts} placeholder="4010 · Service Revenue" />
        <TextArea label="Description" value={f.description} onChange={(v) => set({ description: v })} style={{ gridColumn: '1 / -1' }} rows={2} />
        <CheckboxField checked={f.billableDefault ?? true} onChange={(v) => set({ billableDefault: v })} label="Billable by default" help="Timesheet rows using this service start as billable" />
        <SelectField label="Status" value={f.status ?? 'Active'} onChange={(v) => set({ status: v as Service['status'] })} options={['Active', 'Inactive']} />
      </div>
      {value.id && <div style={{ marginTop: 16, fontSize: 12, color: 'var(--ink-3)' }}>Default rate {fmtMoney(value.defaultRate ?? 0)} · rate cards and contract rates override this when billing.</div>}
    </Drawer>
  );
}
