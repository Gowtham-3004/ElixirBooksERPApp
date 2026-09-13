// Payroll employees register (reads core employees) with payroll-fields drawer (FR-PAY-001): masked bank detail
// with audited reveal, PF/ESI/PT applicability, tax regime, statutory ids.
import { useState } from 'react';
import { C, db, nav, useSession, useCollection, engine } from '../../store';
import type { Employee } from '../../store';
import { RegisterPage, Badge, Button, Drawer, KV, MaskedValue, Avatar, Toggle, SelectField, TextField, IdentifierField, useToast, type Column } from '../../components/ui';
import { fmtMoney, fmtDate } from '../../lib/format';
import type { SalaryStructure } from './types';
import { revealAudit, structureFor } from './actions';

export function useMask() {
  const s = useSession();
  const canView = s.can('payroll.view') || s.can('payroll.*') || s.isTenantOwner;
  return { canView, money: (n: number, currency = s.currency) => (canView ? fmtMoney(n, currency) : '••••••') };
}

export function EmployeesPage() {
  const s = useSession();
  const toast = useToast();
  const { canView, money } = useMask();
  const employees = useCollection<Employee>(C.employees).filter((e) => e.companyId === s.state.companyId);
  const structures = useCollection<SalaryStructure>(C.salaryStructures);
  const [open, setOpen] = useState<Employee | null>(null);
  const [form, setForm] = useState<Partial<Employee> & { regime?: 'Old' | 'New'; pt?: boolean }>({});
  const canEdit = s.can('payroll.*') || s.can('payroll.employee.edit') || s.can('masters.employees.*');
  const totalCtc = employees.filter((e) => e.status === 'Active' || e.status === 'Probation').reduce((x, e) => x + e.ctc, 0);
  const openDrawer = (e: Employee) => { const st = structureFor(e.id, s.state.periodCode ?? '2026-09'); setForm({ pf: e.pf, esi: e.esi, pan: e.pan, uan: e.uan, esiNumber: e.esiNumber, bankDetail: e.bankDetail, regime: st?.taxRegime ?? 'New', pt: st?.pt ?? true }); setOpen(e); };
  const save = () => {
    if (!open) return;
    db.update<Employee>(C.employees, open.id, { pf: form.pf, esi: form.esi, pan: form.pan, uan: form.uan, esiNumber: form.esiNumber, bankDetail: form.bankDetail });
    const st = structureFor(open.id, s.state.periodCode ?? '2026-09');
    if (st && (st.taxRegime !== form.regime || st.pt !== form.pt || st.pf !== form.pf || st.esi !== form.esi)) db.update<SalaryStructure>(C.salaryStructures, st.id, { taxRegime: form.regime, pt: form.pt, pf: !!form.pf, esi: !!form.esi });
    engine.audit({ action: 'payroll.employee.updated', objectType: 'Employee', objectId: open.id, objectNumber: open.code, detail: 'Payroll fields updated', sensitive: true });
    toast.success(`Payroll details saved for ${open.name}`);
    setOpen(null);
  };
  const cols: Column<Employee>[] = [
    { key: 'name', label: 'Employee', render: (e) => <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar name={e.name} /><div><div className="cell-primary">{e.name}</div><div className="cell-secondary identifier">{e.code}</div></div></div>, sortable: true },
    { key: 'department', label: 'Department', sortable: true },
    { key: 'designation', label: 'Designation' },
    { key: 'pan', label: 'PAN', render: (e) => <span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{canView ? e.pan ?? '—' : '••••'}</span> },
    { key: 'dateOfJoining', label: 'Joined', render: (e) => fmtDate(e.dateOfJoining), sortable: true },
    { key: 'ctc', label: 'Annual CTC', align: 'right', render: (e) => <span className="money">{money(e.ctc)}</span>, total: (rows) => <span className="money">{money(rows.reduce((x, e) => x + e.ctc, 0))}</span>, sortable: true },
    { key: 'structure', label: 'Structure', render: (e) => { const st = structures.find((x) => x.employeeId === e.id && x.status === 'Active'); return st ? <span className="link" onClick={(ev) => { ev.stopPropagation(); nav.go(`payroll/structures/${st.id}`); }}>v{st.structureVersion} · {fmtDate(st.effectiveFrom)}</span> : <Badge status="Returned">Missing</Badge>; } },
    { key: 'pf', label: 'PF', render: (e) => <span style={{ color: e.pf ? '#12784E' : '#B0B5BF' }}>{e.pf ? '✓' : '—'}</span> },
    { key: 'esi', label: 'ESI', render: (e) => <span style={{ color: e.esi ? '#12784E' : '#B0B5BF' }}>{e.esi ? '✓' : '—'}</span> },
    { key: 'status', label: 'Status', render: (e) => <Badge status={e.status} /> },
  ];
  return (
    <>
      <RegisterPage<Employee> title="Employees" subtitle={`${employees.length} employees · total CTC ${money(totalCtc)}/yr · master data lives under Masters › Employees`} rows={employees} columns={cols} entity="employees" searchKeys={['name', 'code', 'pan', 'department']}
        actions={<Button variant="secondary" onClick={() => nav.go('masters/employees')}>Open employee master</Button>}
        primaryAction={{ label: 'Add employee', onClick: () => nav.go('masters/employees/new') }}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (e) => e.status === 'Active' || e.status === 'Probation' }, { id: 'left', label: 'Resigned / left', filter: (e) => e.status === 'Resigned' || e.status === 'Terminated' }, { id: 'nostructure', label: 'No structure', filter: (e) => !structures.some((x) => x.employeeId === e.id && x.status === 'Active') }]}
        filters={[{ key: 'department', label: 'Department', type: 'select', options: Array.from(new Set(employees.map((e) => e.department))).map((d) => ({ value: d, label: d })) }]} applyFilter={(e, v) => !v.department || e.department === v.department}
        onRowClick={openDrawer} showTotals
        rowActions={(e) => [{ label: 'Payroll details', onClick: () => openDrawer(e) }, { label: 'Salary structure', onClick: () => nav.go(`payroll/structures?employee=${e.id}`) }, { label: 'Payslips', onClick: () => nav.go(`payroll/payslips?employee=${e.id}`) }, { label: 'Edit master record', onClick: () => nav.go(`masters/employees/${e.id}`) }]}
        emptyTitle="No employees" emptyDescription="Add employees under Masters to run payroll." />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `${open.name} · payroll details` : ''} subtitle={open ? `${open.code} · ${open.department} · ${open.designation}` : ''} width={620}
        footer={<><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button><Button variant="primary" onClick={save} disabled={!canEdit} reason={!canEdit ? 'Requires payroll or HR permission' : undefined}>Save payroll details</Button></>}>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <KV items={[{ k: 'Annual CTC', v: money(open.ctc) }, { k: 'Joined', v: fmtDate(open.dateOfJoining) }, { k: 'Branch', v: db.find<any>(C.branches, open.branchId)?.name ?? '—' }, { k: 'Manager', v: db.find<Employee>(C.employees, open.managerId)?.name ?? '—' }, { k: 'Status', v: <Badge status={open.status} /> }]} />
            <div className="section-title">Bank detail (masked · reveal is audited)</div>
            {form.bankDetail ? <KV items={[{ k: 'Bank', v: form.bankDetail.bankName }, { k: 'Account', v: canView ? <MaskedValue value={form.bankDetail.accountNumber} onReveal={() => revealAudit('bank account', open.id)} /> : '••••' }, { k: 'IFSC', v: <span className="identifier">{form.bankDetail.ifsc}</span> }, { k: 'Verification', v: <Badge status={form.bankDetail.status} /> }]} /> : <div style={{ fontSize: 13, color: '#6E6E71' }}>No bank detail on file — net pay will be held.</div>}
            <div className="grid-2">
              <TextField label="Bank name" value={form.bankDetail?.bankName ?? ''} onChange={(v) => setForm({ ...form, bankDetail: { id: form.bankDetail?.id ?? 'b1', bankName: v, accountNumber: form.bankDetail?.accountNumber ?? '', ifsc: form.bankDetail?.ifsc ?? '', accountName: form.bankDetail?.accountName ?? open.name, status: 'Pending Approval' } })} disabled={!canEdit} />
              <TextField label="Account number" value={form.bankDetail?.accountNumber ?? ''} onChange={(v) => setForm({ ...form, bankDetail: { ...(form.bankDetail ?? { id: 'b1', bankName: '', ifsc: '', accountName: open.name }), accountNumber: v, status: 'Pending Approval' } })} disabled={!canEdit} help="Changes require Treasury verification before the next bank file" />
              <IdentifierField kind="IFSC" value={form.bankDetail?.ifsc ?? ''} onChange={(v) => setForm({ ...form, bankDetail: { ...(form.bankDetail ?? { id: 'b1', bankName: '', accountNumber: '', accountName: open.name }), ifsc: v, status: 'Pending Approval' } })} disabled={!canEdit} />
            </div>
            <div className="section-title">Statutory</div>
            <div className="grid-2">
              <IdentifierField kind="PAN" value={form.pan ?? ''} onChange={(v) => setForm({ ...form, pan: v })} disabled={!canEdit} />
              <TextField label="UAN (PF)" value={form.uan ?? ''} onChange={(v) => setForm({ ...form, uan: v })} disabled={!canEdit} />
              <TextField label="ESI number" value={form.esiNumber ?? ''} onChange={(v) => setForm({ ...form, esiNumber: v })} disabled={!canEdit} />
              <SelectField label="Tax regime (192)" value={form.regime} onChange={(v) => setForm({ ...form, regime: v as any })} options={['New', 'Old']} disabled={!canEdit} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Toggle on={!!form.pf} onChange={(v) => setForm({ ...form, pf: v })} label="Provident Fund applicable" help="12% employee + 12% employer on basic (ceiling ₹15,000)" disabled={!canEdit} />
              <Toggle on={!!form.esi} onChange={(v) => setForm({ ...form, esi: v })} label="ESI applicable" help="0.75% employee + 3.25% employer when gross ≤ ₹21,000" disabled={!canEdit} />
              <Toggle on={!!form.pt} onChange={(v) => setForm({ ...form, pt: v })} label="Professional tax applicable" help="State slab (Maharashtra: ₹200/month above ₹10,000)" disabled={!canEdit} />
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
