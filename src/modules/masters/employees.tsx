// Employees master (basic fields; salary structures belong to Payroll).
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Employee, Branch } from '../../store';
import { Badge, Button, CheckboxField, DateField, Drawer, EmptyState, EntityPicker, IdentifierField, KV, MaskedValue, MoneyField, PageHeader, RegisterPage, SelectField, Tabs, TextField, TwoLine, useDimensionOptions, useEmployeeOptions, useToast } from '../../components/ui';
import { fmtDate, validateEmail, validateIFSC, validatePAN, uid } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, UsagePill, findDuplicates, masterRowActions, nextCode, saveMaster, setStatus, useForm } from './shared';

const DEPARTMENTS = ['Finance', 'Accounts', 'Sales', 'Operations', 'Production', 'Admin', 'HR', 'IT', 'Purchase', 'Warehouse'];
const STATUSES: Employee['status'][] = ['Active', 'Probation', 'Resigned', 'Terminated'];

export function EmployeeRegister() {
  const s = useSession();
  const rows = useCollection<Employee>(C.employees).filter((e) => e.companyId === s.state.companyId);
  const branches = useCollection<Branch>(C.branches);
  const [editing, setEditing] = useState<Employee | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const canEdit = s.can('masters.employees.edit') || s.can('masters.employees.create');
  const active = (r: Employee) => r.status === 'Active' || r.status === 'Probation';
  return (
    <>
      <RegisterPage<Employee>
        title="Employees"
        subtitle={`${rows.filter(active).length} on roll · ${s.company?.tradeName} · salary structures are managed in Payroll`}
        entity="employees"
        rows={rows}
        searchKeys={['name', 'code', 'department', 'designation', 'email', 'pan']}
        tabs={[{ id: 'active', label: 'Active', filter: active }, { id: 'inactive', label: 'Left', filter: (r) => !active(r) }, { id: 'all', label: 'All', filter: () => true }]}
        filters={[{ key: 'department', label: 'Department', type: 'select', options: Array.from(new Set(rows.map((r) => r.department))).map((d) => ({ value: d, label: d })) }, { key: 'branchId', label: 'Branch', type: 'select', options: branches.map((b) => ({ value: b.id, label: b.name })) }, { key: 'status', label: 'Status', type: 'select', options: STATUSES.map((x) => ({ value: x, label: x })) }]}
        applyFilter={(r, f) => (!f.department || r.department === f.department) && (!f.branchId || r.branchId === f.branchId) && (!f.status || r.status === f.status)}
        primaryAction={{ label: 'New employee', onClick: () => setEditing('new'), disabled: !s.can('masters.employees.create'), reason: s.can('masters.employees.create') ? undefined : 'Requires employee create permission' }}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        onRowClick={(r) => nav.go(`masters/employees/${r.id}`)}
        rowActions={(r) => masterRowActions({ collection: C.employees, objectType: 'Employee', row: { ...r, status: active(r) ? 'Active' : 'Inactive' }, canEdit, onView: () => nav.go(`masters/employees/${r.id}`), onEdit: () => setEditing(r), extra: [{ label: 'Salary structure (Payroll)', onClick: () => nav.go(`payroll/employees/${r.id}`) }] }).map((a) => (a.label === 'Deactivate' ? { ...a, label: 'Mark resigned', onClick: () => setStatus(C.employees, 'Employee', r.id, 'Resigned') } : a.label === 'Activate' ? { ...a, onClick: () => setStatus(C.employees, 'Employee', r.id, 'Active') } : a))}
        bulkActions={(_ids, sel) => [{ label: 'Set Active', onClick: () => db.transaction(() => sel.forEach((r) => setStatus(C.employees, 'Employee', r.id, 'Active', 'Bulk activate'))), disabled: !canEdit }, { label: 'Mark resigned', onClick: () => db.transaction(() => sel.forEach((r) => setStatus(C.employees, 'Employee', r.id, 'Resigned', 'Bulk update'))), disabled: !canEdit }]}
        columns={[
          { key: 'name', label: 'Employee', sortable: true, render: (r) => <TwoLine primary={r.name} secondary={`${r.code} · ${r.designation}`} />, value: (r) => r.name },
          { key: 'department', label: 'Department', sortable: true },
          { key: 'branch', label: 'Branch', render: (r) => branches.find((b) => b.id === r.branchId)?.name ?? '—' },
          { key: 'manager', label: 'Manager', render: (r) => rows.find((m) => m.id === r.managerId)?.name ?? '—' },
          { key: 'dateOfJoining', label: 'Joined', sortable: true, render: (r) => fmtDate(r.dateOfJoining) },
          { key: 'pan', label: 'PAN', render: (r) => (r.pan ? <span className="identifier">{r.pan}</span> : '—') },
          { key: 'statutory', label: 'PF / ESI', render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{[r.pf ? 'PF' : null, r.esi ? 'ESI' : null].filter(Boolean).join(' · ') || '—'}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (!active(r) ? 'muted' : undefined)}
      />
      {editing && <EmployeeForm employee={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="employees" entityLabel="Employees" candidateFields={['pan', 'code', 'email', 'uan', 'phone']} />
    </>
  );
}

export function EmployeeForm({ employee, onClose, onSaved }: { employee?: Employee; onClose: () => void; onSaved: (e: Employee) => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<Employee>(C.employees).filter((e) => e.companyId === s.state.companyId);
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId && b.status === 'Active');
  const managers = useEmployeeOptions().filter((o) => o.id !== employee?.id);
  const costCentres = useDimensionOptions('CostCentre');
  const f = useForm<any>(employee ? { ...employee, bank: employee.bankDetail ? { ...employee.bankDetail } : { bankName: '', accountNumber: '', ifsc: '', accountName: employee.name } } : { code: nextCode(rows, 'EMP-'), name: '', email: '', phone: '', department: 'Operations', designation: '', branchId: s.state.branchId, managerId: undefined, pan: '', uan: '', esiNumber: '', dateOfJoining: new Date().toISOString().slice(0, 10), ctc: 0, status: 'Probation', pf: true, esi: false, costCentreId: undefined, bank: { bankName: '', accountNumber: '', ifsc: '', accountName: '' } });
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const dups = useMemo(() => findDuplicates('employees', rows, f.v, employee?.id), [rows, f.v.pan, f.v.code, f.v.email, f.v.uan, f.v.phone]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (!f.v.code.trim()) e.code = 'Code is required';
    if (!f.v.designation.trim()) e.designation = 'Designation is required';
    if (f.v.pan && validatePAN(f.v.pan)) e.pan = validatePAN(f.v.pan)!;
    if (f.v.email && validateEmail(f.v.email)) e.email = validateEmail(f.v.email)!;
    if (!f.v.dateOfJoining) e.dateOfJoining = 'Date of joining is required';
    if (f.v.dateOfLeaving && f.v.dateOfLeaving < f.v.dateOfJoining) e.dateOfLeaving = 'Leaving date must be after joining';
    if (f.v.uan && !/^\d{12}$/.test(f.v.uan)) e.uan = 'UAN is 12 digits';
    if (f.v.bank.accountNumber && !/^\d{9,18}$/.test(f.v.bank.accountNumber)) e.bank = 'Bank account number must be 9–18 digits';
    if (f.v.bank.ifsc && validateIFSC(f.v.bank.ifsc)) e.bank = validateIFSC(f.v.bank.ifsc)!;
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const { bank, ...rest } = f.v;
      const bankDetail = bank.accountNumber ? { id: employee?.bankDetail?.id ?? uid('bank'), bankName: bank.bankName, accountNumber: bank.accountNumber, ifsc: bank.ifsc.toUpperCase(), accountName: bank.accountName || f.v.name, status: employee?.bankDetail && employee.bankDetail.accountNumber === bank.accountNumber ? employee.bankDetail.status : ('Approved' as const) } : undefined;
      const saved = saveMaster<Employee>(C.employees, 'Employee', { ...rest, pan: rest.pan || undefined, uan: rest.uan || undefined, esiNumber: rest.esiNumber || undefined, email: rest.email || undefined, bankDetail }, employee?.id, { expectedVersion: employee?.version });
      toast.success(employee ? `${saved.name} updated` : `Employee ${saved.code} created`);
      onSaved(saved);
    } catch (err: any) { toast.error(err?.message ?? 'Could not save'); setSaving(false); }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  return (
    <Drawer open onClose={onClose} title={employee ? `Edit ${employee.name}` : 'New employee'} subtitle="Employee master · payroll structures are set up in Payroll" width={760}
      footer={<DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={employee ? 'Save employee' : 'Create employee'} disabled={blocked} reason={blocked ? 'Duplicate blocked' : undefined} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <ErrorSummary errors={f.errors} />
        <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
        <section>
          <div className="section-title">Identity</div>
          <div style={grid}>
            <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} />
            <TextField label="Full name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
            <TextField label="Work email" value={f.v.email} onChange={(v) => f.set('email', v)} error={f.errors.email} type="email" />
            <TextField label="Phone" value={f.v.phone} onChange={(v) => f.set('phone', v)} />
            <SelectField label="Department" value={f.v.department} onChange={(v) => f.set('department', v)} options={Array.from(new Set([...DEPARTMENTS, ...rows.map((r) => r.department)]))} />
            <TextField label="Designation" required value={f.v.designation} onChange={(v) => f.set('designation', v)} error={f.errors.designation} />
            <SelectField label="Branch" value={f.v.branchId ?? ''} onChange={(v) => f.set('branchId', v || undefined)} options={branches.map((b) => ({ value: b.id, label: b.name }))} allowEmpty />
            <EntityPicker label="Reports to" value={f.v.managerId} onChange={(v) => f.set('managerId', v)} options={managers} placeholder="Search manager…" />
            <EntityPicker label="Cost centre" value={f.v.costCentreId} onChange={(v) => f.set('costCentreId', v)} options={costCentres} placeholder="Search cost centre…" />
            <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={STATUSES} />
            <DateField label="Date of joining" required value={f.v.dateOfJoining} onChange={(v) => f.set('dateOfJoining', v)} error={f.errors.dateOfJoining} />
            <DateField label="Date of leaving" value={f.v.dateOfLeaving} onChange={(v) => f.set('dateOfLeaving', v || undefined)} error={f.errors.dateOfLeaving} />
          </div>
        </section>
        <section>
          <div className="section-title">Statutory</div>
          <div style={grid}>
            <IdentifierField kind="PAN" value={f.v.pan} onChange={(v) => f.set('pan', v)} help={f.errors.pan} />
            <TextField label="UAN (PF)" value={f.v.uan} onChange={(v) => f.set('uan', v.replace(/\D/g, '').slice(0, 12))} error={f.errors.uan} />
            <TextField label="ESI number" value={f.v.esiNumber} onChange={(v) => f.set('esiNumber', v)} />
            <MoneyField label="Annual CTC" value={f.v.ctc} onChange={(v) => f.set('ctc', v)} help="Indicative; the salary structure in Payroll is authoritative" />
            <CheckboxField checked={f.v.pf} onChange={(v) => f.set('pf', v)} label="Covered under PF" />
            <CheckboxField checked={f.v.esi} onChange={(v) => f.set('esi', v)} label="Covered under ESI" help="Gross ≤ ₹21,000/month" />
          </div>
        </section>
        <section>
          <div className="section-title">Bank detail <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· stored masked; reveal is audited</span></div>
          <div style={grid}>
            <TextField label="Bank" value={f.v.bank.bankName} onChange={(v) => f.set('bank', { ...f.v.bank, bankName: v })} />
            <TextField label="Account number" value={f.v.bank.accountNumber} onChange={(v) => f.set('bank', { ...f.v.bank, accountNumber: v.replace(/\D/g, '') })} error={f.errors.bank} />
            <IdentifierField kind="IFSC" value={f.v.bank.ifsc} onChange={(v) => f.set('bank', { ...f.v.bank, ifsc: v })} />
            <TextField label="Account holder" value={f.v.bank.accountName} onChange={(v) => f.set('bank', { ...f.v.bank, accountName: v })} />
          </div>
        </section>
      </div>
    </Drawer>
  );
}

export function EmployeeDetail({ id }: { id: string }) {
  const s = useSession();
  const e = useRecord<Employee>(C.employees, id);
  const employees = useCollection<Employee>(C.employees);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  if (!e) return <EmptyState icon="🧭" title="Employee not found" action={<Button variant="primary" onClick={() => nav.go('masters/employees')}>Back to employees</Button>} />;
  const canEdit = s.can('masters.employees.edit');
  const canReveal = s.can('payroll.*') || s.can('masters.employees.reveal') || s.isTenantOwner;
  const branch = db.find<Branch>(C.branches, e.branchId);
  const cc = db.find<any>(C.dimensions, e.costCentreId);
  const reports = employees.filter((x) => x.managerId === e.id);
  return (
    <div className="page">
      <PageHeader back={{ label: 'Employees', path: 'masters/employees' }} title={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{e.name} <Badge status={e.status} /></span>} subtitle={<span style={{ display: 'inline-flex', gap: 10 }}><span className="identifier">{e.code}</span><span>{e.designation} · {e.department}</span><UsagePill id={id} collection={C.employees} /></span>}
        actions={<><Button variant="secondary" onClick={() => nav.go(`payroll/employees/${id}`)}>Salary structure</Button><Button variant="primary" onClick={() => setEditing(true)} disabled={!canEdit} reason={canEdit ? undefined : 'Requires employee edit permission'}>Edit employee</Button></>} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'history', label: 'Change history' }]} />
      {tab === 'overview' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}><div className="section-title">Employment</div><KV items={[{ k: 'Branch', v: branch?.name }, { k: 'Reports to', v: employees.find((m) => m.id === e.managerId)?.name }, { k: 'Cost centre', v: cc ? `${cc.code} · ${cc.name}` : undefined }, { k: 'Joined', v: fmtDate(e.dateOfJoining) }, { k: 'Left', v: e.dateOfLeaving ? fmtDate(e.dateOfLeaving) : undefined }, { k: 'Direct reports', v: reports.length ? reports.map((r) => r.name).join(', ') : '—' }, { k: 'Email', v: e.email }, { k: 'Phone', v: e.phone }]} /></div>
          <div className="card" style={{ padding: 18 }}><div className="section-title">Statutory & bank</div><KV items={[{ k: 'PAN', v: e.pan ? <span className="identifier">{e.pan}</span> : undefined }, { k: 'UAN', v: e.uan ? <span className="identifier">{e.uan}</span> : undefined }, { k: 'ESI', v: e.esiNumber }, { k: 'PF / ESI', v: [e.pf ? 'PF' : null, e.esi ? 'ESI' : null].filter(Boolean).join(' · ') || 'Not covered' }, { k: 'Bank', v: e.bankDetail ? <span>{e.bankDetail.bankName} · <MaskedValue value={e.bankDetail.accountNumber} canReveal={canReveal} onReveal={() => engine.audit({ action: 'employee.bank_revealed', objectType: 'Employee', objectId: e.id, objectNumber: e.code, sensitive: true, detail: 'Bank account revealed' })} /> · {e.bankDetail.ifsc}</span> : undefined }]} /></div>
        </div>
      ) : <ChangeHistory objectId={id} />}
      {editing && <EmployeeForm employee={e} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
  );
}
