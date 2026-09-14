// Branches & locations (FR-ORG-003): register + drawer form (type, address, GST registration, default warehouse, default flag, status).
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { Branch, Company, Warehouse } from '../../store';
import { INDIA_STATES, stateNameOf } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, TextField, SelectField, IdentifierField, CheckboxField, Toggle, Identifier, TwoLine, useToast, ConfirmDialog } from '../../components/ui';
import type { Column } from '../../components/ui';
import { useCompany } from './shared';

const TYPES: Branch['type'][] = ['Office', 'Warehouse', 'Store', 'Factory'];

export default function Branches() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const rows = useCollection<Branch>(C.branches).filter((b) => b.companyId === co?.id);
  const warehouses = useCollection<Warehouse>(C.warehouses).filter((w) => w.companyId === co?.id || !w.companyId);
  const [edit, setEdit] = useState<Partial<Branch> | null>(null);
  const [deact, setDeact] = useState<Branch | null>(null);
  const canEdit = s.can('admin.branches.edit') || s.can('admin.branches.create') || s.isTenantOwner;
  const isIN = co?.country === 'IN';
  if (!co) return null;
  const regs = co.registrations.filter((r) => r.status === 'Active');

  const save = () => {
    if (!edit) return;
    if (!edit.name?.trim()) { toast.error('Branch name is required'); return; }
    if (!edit.address?.city?.trim()) { toast.error('City is required'); return; }
    const reg = regs.find((r) => r.id === edit.registrationId);
    const payload: Partial<Branch> = { ...edit, name: edit.name.trim(), gstin: reg?.number, address: { ...edit.address!, country: co.country }, type: edit.type ?? 'Office', status: edit.status ?? 'Active', isDefault: !!edit.isDefault };
    db.transaction(() => {
      let id = edit.id;
      if (id) db.update<Branch>(C.branches, id, payload);
      else {
        const code = `BR-${String(rows.length + 1).padStart(3, '0')}`;
        id = db.insert<Branch>(C.branches, { ...payload, code, companyId: co.id } as any).id;
      }
      if (payload.isDefault) rows.filter((b) => b.id !== id && b.isDefault).forEach((b) => db.update<Branch>(C.branches, b.id, { isDefault: false }));
      if (reg && !reg.branchId) db.update<Company>(C.companies, co.id, { registrations: co.registrations.map((r) => (r.id === reg.id ? { ...r, branchId: id } : r)), onboarding: { ...co.onboarding, address: 'Done' } });
      engine.audit({ action: edit.id ? 'branch.updated' : 'branch.created', objectType: 'Branch', objectId: id, objectNumber: payload.name, detail: `${payload.type} · ${payload.address?.city} · ${reg?.number ?? 'no registration'}` });
    });
    toast.success(edit.id ? 'Branch updated' : 'Branch created');
    setEdit(null);
  };

  const columns: Column<Branch>[] = [
    { key: 'code', label: 'Branch ID', render: (b) => <Identifier link>{b.code}</Identifier>, sortable: true },
    { key: 'name', label: 'Name', sortable: true, render: (b) => <TwoLine primary={<span>{b.name} {b.isDefault && <Badge status="Posted">Default</Badge>}</span>} secondary={b.type} /> },
    { key: 'city', label: 'City', value: (b) => b.address.city, render: (b) => b.address.city || '—' },
    { key: 'state', label: 'State', value: (b) => b.address.state, render: (b) => <span style={{ color: 'var(--ink-3)' }}>{b.address.state || '—'}</span> },
    { key: 'gstin', label: isIN ? 'GSTIN' : 'Registration', render: (b) => (b.gstin ? <Identifier style={{ fontSize: 11 }}>{b.gstin}</Identifier> : <span style={{ color: 'var(--ink-5)' }}>—</span>) },
    { key: 'wh', label: 'Default warehouse', render: (b) => <span style={{ color: 'var(--ink-3)' }}>{warehouses.find((w) => w.id === b.defaultWarehouseId)?.name ?? '—'}</span> },
    { key: 'status', label: 'Status', render: (b) => <Badge status={b.status} /> },
  ];

  return (
    <>
      <RegisterPage<Branch>
        title="Branches & locations"
        subtitle={`${rows.length} locations configured · ${co.legalName}`}
        rows={rows}
        entity="branches"
        columns={columns}
        searchKeys={['name', 'code', 'address.city', 'gstin']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (b) => b.status === 'Active' }, { id: 'inactive', label: 'Inactive', filter: (b) => b.status === 'Inactive' }]}
        primaryAction={{ label: 'Add branch', onClick: () => setEdit({ type: 'Office', status: 'Active', isDefault: rows.length === 0, address: { line1: '', city: '', state: '', pin: '', country: co.country } }), disabled: !canEdit, reason: canEdit ? undefined : 'Requires admin.branches.create' }}
        onRowClick={(b) => setEdit({ ...b })}
        rowClass={(b) => (b.status === 'Inactive' ? 'muted' : undefined)}
        rowActions={(b) => [
          { label: 'Edit', onClick: () => setEdit({ ...b }), disabled: !canEdit },
          { label: 'Set as default', onClick: () => { db.transaction(() => { rows.forEach((x) => db.update<Branch>(C.branches, x.id, { isDefault: x.id === b.id })); }); engine.audit({ action: 'branch.default', objectType: 'Branch', objectId: b.id, objectNumber: b.name }); toast.success(`${b.name} is now the default branch`); }, disabled: b.isDefault || b.status !== 'Active' || !canEdit, reason: b.isDefault ? 'Already default' : b.status !== 'Active' ? 'Inactive branches cannot be default' : undefined },
          { label: b.status === 'Active' ? 'Deactivate' : 'Reactivate', onClick: () => (b.status === 'Active' ? setDeact(b) : (db.update<Branch>(C.branches, b.id, { status: 'Active' }), engine.audit({ action: 'branch.reactivated', objectType: 'Branch', objectId: b.id, objectNumber: b.name }), toast.success('Branch reactivated'))), disabled: !canEdit || (b.isDefault && b.status === 'Active'), reason: b.isDefault && b.status === 'Active' ? 'Default branch cannot be deactivated' : undefined, danger: b.status === 'Active', separator: true },
        ]}
      />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'Add branch'} width={600} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Discard</Button><Button variant="primary" onClick={save} disabled={!canEdit}>Save branch</Button></>}>
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="grid-2">
              <TextField label="Name" required value={edit.name ?? ''} onChange={(v) => setEdit({ ...edit, name: v })} autoFocus />
              <SelectField label="Type" value={edit.type ?? 'Office'} onChange={(v) => setEdit({ ...edit, type: v as Branch['type'] })} options={TYPES} help="Stores and warehouses hold stock; offices and factories may too" />
            </div>
            <TextField label="Address line 1" value={edit.address?.line1 ?? ''} onChange={(v) => setEdit({ ...edit, address: { ...edit.address!, line1: v } })} />
            <div className="grid-3">
              <TextField label="City" required value={edit.address?.city ?? ''} onChange={(v) => setEdit({ ...edit, address: { ...edit.address!, city: v } })} />
              {isIN ? <SelectField label="State" value={edit.address?.stateCode ?? ''} onChange={(code) => setEdit({ ...edit, address: { ...edit.address!, stateCode: code, state: stateNameOf(code) ?? '' } })} options={INDIA_STATES.map((st) => ({ value: st.code, label: st.name }))} placeholder="—" /> : <TextField label="State / region" value={edit.address?.state ?? ''} onChange={(v) => setEdit({ ...edit, address: { ...edit.address!, state: v } })} />}
              {isIN ? <IdentifierField kind="PIN" label="PIN" value={edit.address?.pin ?? ''} onChange={(v) => setEdit({ ...edit, address: { ...edit.address!, pin: v } })} /> : <TextField label="Postal code" value={edit.address?.pin ?? ''} onChange={(v) => setEdit({ ...edit, address: { ...edit.address!, pin: v } })} />}
            </div>
            <div className="grid-2">
              <SelectField label={isIN ? 'GST registration' : 'Tax registration'} value={edit.registrationId ?? ''} onChange={(v) => setEdit({ ...edit, registrationId: v || undefined, gstin: regs.find((r) => r.id === v)?.number })} options={regs.map((r) => ({ value: r.id, label: `${r.number}${r.state ? ' · ' + r.state : ''}${r.isSez ? ' · SEZ' : ''}` }))} allowEmpty placeholder="— None —" help={regs.length === 0 ? 'Add registrations under Company profile first' : edit.address?.stateCode && regs.find((r) => r.id === edit.registrationId)?.stateCode && regs.find((r) => r.id === edit.registrationId)?.stateCode !== edit.address.stateCode ? 'Registration state differs from the branch state' : undefined} />
              <SelectField label="Default warehouse" value={edit.defaultWarehouseId ?? ''} onChange={(v) => setEdit({ ...edit, defaultWarehouseId: v || undefined })} options={warehouses.filter((w) => w.status === 'Active').map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))} allowEmpty placeholder="— None —" />
            </div>
            <CheckboxField checked={!!edit.isDefault} onChange={(v) => setEdit({ ...edit, isDefault: v })} label="Default branch for new documents" help="Users without a branch restriction start here" />
            <Toggle on={(edit.status ?? 'Active') === 'Active'} onChange={(v) => setEdit({ ...edit, status: v ? 'Active' : 'Inactive' })} label="Active" help="Inactive branches are hidden from switchers; their documents remain" />
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!deact} onClose={() => setDeact(null)} title={`Deactivate ${deact?.name}?`} statement="The branch is hidden from switchers and new documents; existing documents and journals are untouched." consequences={[{ engine: 'Workflow', text: 'Users restricted to this branch lose their default scope', tone: 'warning' }, { engine: 'Numbering', text: 'Branch-specific number series pause' }]} reasonRequired confirmLabel="Deactivate branch" cancelLabel="Keep active" danger onConfirm={(reason) => { if (!deact) return; db.update<Branch>(C.branches, deact.id, { status: 'Inactive' }); engine.audit({ action: 'branch.deactivated', objectType: 'Branch', objectId: deact.id, objectNumber: deact.name, detail: reason }); toast.success('Branch deactivated'); }} />
    </>
  );
}
