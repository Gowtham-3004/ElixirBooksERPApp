// Salary structures (FR-PAY-001): register, effective-dated form with component grid and CTC preview, version history.
import { useMemo, useState } from 'react';
import { C, db, nav, useSession, useCollection, useRoute, engine } from '../../store';
import type { Employee } from '../../store';
import { RegisterPage, Badge, Button, Drawer, KV, DateField, SelectField, NumberField, MoneyField, Toggle, TextArea, useToast, EntityPicker, useEmployeeOptions, SummaryBlock, DataTable, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtDateTime } from '../../lib/format';
import type { SalaryStructure, SalaryComponent } from './types';
import { ctcPreview, standardComponents, structureAmounts, estimateMonthlyTds } from './calc';
import { payrollSettings } from './actions';
import { useMask } from './Employees';

const EMPTY: Omit<SalaryStructure, keyof import('../../store').BaseRecord> = { employeeId: '', employeeName: '', employeeCode: '', effectiveFrom: '', structureVersion: 1, components: [], pf: true, esi: false, pt: true, taxRegime: 'New', tdsMonthly: 0, monthlyGross: 0, monthlyCtc: 0, annualCtc: 0, status: 'Active' };

export function StructuresPage({ id }: { id?: string }) {
  const s = useSession();
  const route = useRoute();
  const toast = useToast();
  const { money, canView } = useMask();
  const settings = payrollSettings();
  const all = useCollection<SalaryStructure>(C.salaryStructures).filter((x) => !x.companyId || x.companyId === s.state.companyId);
  const empOpts = useEmployeeOptions();
  const [edit, setEdit] = useState<(typeof EMPTY & { id?: string; version?: number }) | null>(null);
  const [view, setView] = useState<SalaryStructure | null>(() => (id ? db.find<SalaryStructure>(C.salaryStructures, id) ?? null : null));
  const canEdit = s.can('payroll.*') || s.can('payroll.structure.edit');
  const rows = useMemo(() => all.filter((x) => !route.params.employee || x.employeeId === route.params.employee).sort((a, b) => a.employeeName.localeCompare(b.employeeName) || b.effectiveFrom.localeCompare(a.effectiveFrom)), [all, route.params.employee]);
  const preview = edit ? ctcPreview(edit.components, { pf: edit.pf, esi: edit.esi, pt: edit.pt, regime: edit.taxRegime }, settings) : null;
  const startNew = (base?: SalaryStructure) => {
    const emp = base ? db.find<Employee>(C.employees, base.employeeId) : undefined;
    setEdit(base ? { ...base, id: undefined, version: undefined, effectiveFrom: '', effectiveTo: undefined, structureVersion: base.structureVersion + 1, revisionOfId: base.id, notes: '', employeeName: emp?.name ?? base.employeeName } : { ...EMPTY, components: standardComponents(600000, settings) });
  };
  const pickEmployee = (empId?: string) => {
    if (!edit) return;
    const emp = db.find<Employee>(C.employees, empId);
    if (!emp) { setEdit({ ...edit, employeeId: '', employeeName: '', employeeCode: '' }); return; }
    setEdit({ ...edit, employeeId: emp.id, employeeName: emp.name, employeeCode: emp.code, pf: emp.pf, esi: emp.esi, components: edit.components.length ? edit.components : standardComponents(emp.ctc, settings) });
  };
  const updComp = (i: number, patch: Partial<SalaryComponent>) => { if (!edit) return; const components = edit.components.map((c, k) => (k === i ? { ...c, ...patch } : c)); setEdit({ ...edit, components }); };
  const save = () => {
    if (!edit) return;
    if (!edit.employeeId) { toast.error('Choose an employee'); return; }
    if (!edit.effectiveFrom) { toast.error('Effective from date is required'); return; }
    if (!edit.components.some((c) => c.code === 'BASIC' && c.value > 0)) { toast.error('Basic salary is required'); return; }
    const a = structureAmounts(edit.components);
    const p = preview!;
    db.transaction(() => {
      // supersede overlapping active structure of the same employee
      all.filter((x) => x.employeeId === edit.employeeId && x.status === 'Active' && (!x.effectiveTo || x.effectiveTo >= edit.effectiveFrom)).forEach((x) => {
        const to = new Date(edit.effectiveFrom + 'T00:00:00'); to.setDate(to.getDate() - 1);
        db.update<SalaryStructure>(C.salaryStructures, x.id, { status: 'Superseded', effectiveTo: to.toISOString().slice(0, 10) });
      });
      const rec = db.insert<SalaryStructure>(C.salaryStructures, { ...edit, monthlyGross: a.gross, monthlyCtc: p.monthlyCtc, annualCtc: p.annualCtc, tdsMonthly: estimateMonthlyTds(a.gross, edit.taxRegime, p.pf * 12), status: 'Active' });
      db.update<Employee>(C.employees, edit.employeeId, { ctc: p.annualCtc, pf: edit.pf, esi: edit.esi });
      engine.audit({ action: 'payroll.structure.saved', objectType: 'Salary Structure', objectId: rec.id, objectNumber: `${edit.employeeCode} v${edit.structureVersion}`, detail: `Effective ${edit.effectiveFrom} · CTC ${p.annualCtc}`, sensitive: true });
    });
    toast.success(`Salary structure v${edit.structureVersion} saved for ${edit.employeeName}`);
    setEdit(null);
  };
  const cols: Column<SalaryStructure>[] = [
    { key: 'employeeName', label: 'Employee', render: (x) => <div><div className="cell-primary">{x.employeeName}</div><div className="cell-secondary identifier">{x.employeeCode} · v{x.structureVersion}</div></div>, sortable: true },
    { key: 'effectiveFrom', label: 'Effective', render: (x) => <span>{fmtDate(x.effectiveFrom)}{x.effectiveTo ? ` → ${fmtDate(x.effectiveTo)}` : ' → open'}</span>, sortable: true },
    { key: 'basic', label: 'Basic', align: 'right', render: (x) => <span className="money">{money(structureAmounts(x.components).basic)}</span> },
    { key: 'monthlyGross', label: 'Monthly gross', align: 'right', render: (x) => <span className="money">{money(x.monthlyGross)}</span>, sortable: true },
    { key: 'monthlyCtc', label: 'Monthly CTC', align: 'right', render: (x) => <span className="money" style={{ fontWeight: 600 }}>{money(x.monthlyCtc)}</span> },
    { key: 'annualCtc', label: 'Annual CTC', align: 'right', render: (x) => <span className="money">{money(x.annualCtc)}</span>, total: (rs) => <span className="money">{money(rs.filter((r) => r.status === 'Active').reduce((a, b) => a + b.annualCtc, 0))}</span> },
    { key: 'flags', label: 'PF · ESI · PT', render: (x) => <span style={{ fontSize: 12 }}>{x.pf ? 'PF' : '—'} · {x.esi ? 'ESI' : '—'} · {x.pt ? 'PT' : '—'} · {x.taxRegime}</span> },
    { key: 'status', label: 'Status', render: (x) => <Badge status={x.status === 'Superseded' ? 'Cancelled' : x.status}>{x.status}</Badge> },
  ];
  const history = view ? all.filter((x) => x.employeeId === view.employeeId).sort((a, b) => b.structureVersion - a.structureVersion) : [];
  return (
    <>
      <RegisterPage<SalaryStructure> title="Salary structures" subtitle={`${all.filter((x) => x.status === 'Active').length} active structures · effective-dated; revising creates a new version and closes the previous one`} rows={rows} columns={cols} entity="salary structures" searchKeys={['employeeName', 'employeeCode']}
        primaryAction={{ label: 'New structure', onClick: () => startNew(), disabled: !canEdit, reason: !canEdit ? 'Requires payroll permission' : undefined }}
        tabs={[{ id: 'active', label: 'Active', filter: (x) => x.status === 'Active' }, { id: 'all', label: 'All versions' }, { id: 'superseded', label: 'Superseded', filter: (x) => x.status === 'Superseded' }]}
        onRowClick={(x) => setView(x)} showTotals
        rowActions={(x) => [{ label: 'View', onClick: () => setView(x) }, { label: 'Revise (new version)', onClick: () => startNew(x), disabled: !canEdit || x.status !== 'Active' }, { label: 'Employee payslips', onClick: () => nav.go(`payroll/payslips?employee=${x.employeeId}`) }]}
        emptyTitle="No salary structures" emptyAction={<Button variant="primary" onClick={() => startNew()}>+ New structure</Button>} />
      <Drawer open={!!view} onClose={() => setView(null)} title={view ? `${view.employeeName} · structure v${view.structureVersion}` : ''} subtitle={view ? `Effective ${fmtDate(view.effectiveFrom)}${view.effectiveTo ? ' → ' + fmtDate(view.effectiveTo) : ''} · ${view.status}` : ''} width={720}
        footer={view && <><Button variant="ghost" onClick={() => setView(null)}>Close</Button><Button variant="primary" onClick={() => { startNew(view); setView(null); }} disabled={!canEdit || view.status !== 'Active'} reason={view.status !== 'Active' ? 'Only the active version can be revised' : undefined}>Revise structure</Button></>}>
        {view && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SummaryBlock items={[{ label: 'Monthly gross', value: money(view.monthlyGross) }, { label: 'Monthly CTC', value: money(view.monthlyCtc) }, { label: 'Annual CTC', value: money(view.annualCtc) }, { label: 'TDS / month', value: money(view.tdsMonthly) }]} />
            <DataTable rows={view.components.map((c) => ({ ...c, id: c.code }))} dense columns={[{ key: 'name', label: 'Component' }, { key: 'type', label: 'Type', render: (c) => <Badge status="Draft">{c.type}</Badge> }, { key: 'basis', label: 'Basis', render: (c) => (c.basis === 'Amount' ? 'Fixed' : c.basis === 'PctOfBasic' ? `${c.value}% of basic` : `${c.value}% of gross`) }, { key: 'amount', label: 'Monthly', align: 'right', render: (c) => { const a = structureAmounts(view.components); return <span className="money">{money(a.earnings[c.code] ?? a.deductions[c.code] ?? a.employer[c.code] ?? 0)}</span>; } }]} />
            <KV items={[{ k: 'PF', v: view.pf ? 'Applicable' : 'No' }, { k: 'ESI', v: view.esi ? 'Applicable' : 'No' }, { k: 'Professional tax', v: view.pt ? 'Applicable' : 'No' }, { k: 'Tax regime', v: view.taxRegime }, { k: 'Notes', v: view.notes ?? '—' }, { k: 'Created', v: `${fmtDateTime(view.createdAt)} · ${view.createdBy}` }]} />
            <div className="section-title">Version history</div>
            <DataTable rows={history} dense columns={[{ key: 'structureVersion', label: 'Version', render: (x) => `v${x.structureVersion}` }, { key: 'effectiveFrom', label: 'Effective', render: (x) => `${fmtDate(x.effectiveFrom)}${x.effectiveTo ? ' → ' + fmtDate(x.effectiveTo) : ''}` }, { key: 'annualCtc', label: 'Annual CTC', align: 'right', render: (x) => <span className="money">{money(x.annualCtc)}</span> }, { key: 'status', label: 'Status', render: (x) => <Badge status={x.status === 'Superseded' ? 'Cancelled' : x.status}>{x.status}</Badge> }]} onRowClick={(x) => setView(x)} />
          </div>
        )}
      </Drawer>
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.revisionOfId ? `Revise structure · v${edit.structureVersion}` : 'New salary structure'} width={860}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Discard</Button><Button variant="primary" onClick={save}>Save structure</Button></>}>
        {edit && preview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="grid-3">
              <EntityPicker label="Employee" required value={edit.employeeId || undefined} onChange={(v) => pickEmployee(v)} options={empOpts} disabled={!!edit.revisionOfId} />
              <DateField label="Effective from" required value={edit.effectiveFrom} onChange={(v) => setEdit({ ...edit, effectiveFrom: v })} />
              <DateField label="Effective to (optional)" value={edit.effectiveTo} onChange={(v) => setEdit({ ...edit, effectiveTo: v || undefined })} />
            </div>
            <div className="card" style={{ overflow: 'hidden' }}>
              <table className="data-table dense"><thead><tr><th>Component</th><th>Type</th><th>Basis</th><th className="right">Value</th><th className="right">Monthly</th></tr></thead><tbody>
                {edit.components.map((c, i) => { const a = structureAmounts(edit.components); const amt = a.earnings[c.code] ?? a.deductions[c.code] ?? a.employer[c.code] ?? 0; return (
                  <tr key={c.code}><td>{c.name}</td><td><Badge status="Draft">{c.type}</Badge></td><td><select className="field-input grid" value={c.basis} onChange={(e) => updComp(i, { basis: e.target.value as any })} disabled={c.type !== 'Earning' || c.code === 'BASIC'}><option value="Amount">Fixed amount</option><option value="PctOfBasic">% of basic</option></select></td><td className="right"><NumberField size="grid" value={c.value} onChange={(v) => updComp(i, { value: v })} decimals={2} disabled={c.type !== 'Earning'} /></td><td className="right money">{fmtMoney(amt, s.currency)}</td></tr>); })}
              </tbody></table>
            </div>
            <div className="grid-4">
              <Toggle on={edit.pf} onChange={(v) => setEdit({ ...edit, pf: v })} label="PF" />
              <Toggle on={edit.esi} onChange={(v) => setEdit({ ...edit, esi: v })} label="ESI (gross ≤ 21,000)" />
              <Toggle on={edit.pt} onChange={(v) => setEdit({ ...edit, pt: v })} label="Professional tax" />
              <SelectField label="Tax regime" value={edit.taxRegime} onChange={(v) => setEdit({ ...edit, taxRegime: v as any })} options={['New', 'Old']} size="sm" />
            </div>
            <div className="summary-block">
              <div className="section-label" style={{ marginBottom: 8 }}>CTC preview (monthly)</div>
              <div className="grid-4" style={{ gap: 10 }}>
                {[['Gross earnings', preview.gross], ['PF (employee)', -preview.pf], ['ESI (employee)', -preview.esi], ['Professional tax', -preview.pt], ['TDS estimate', -preview.tds], ['Net pay', preview.net], ['Employer PF + ESI', preview.employer], ['Monthly CTC', preview.monthlyCtc]].map(([l, v]) => <div key={String(l)}><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{l}</div><div className="money" style={{ fontWeight: 600, color: Number(v) < 0 ? 'var(--danger)' : 'var(--ink)' }}>{fmtMoney(Number(v), s.currency)}</div></div>)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>Annual CTC {fmtMoney(preview.annualCtc, s.currency)} · {!canView && 'amounts visible to payroll users only'}</div>
            </div>
            <MoneyField label="Target annual CTC (rebuild standard split)" value={preview.annualCtc} onChange={(v) => setEdit({ ...edit, components: standardComponents(v, settings) })} help="Basic 50% · HRA 40% of basic · conveyance 1,600 · medical 1,250 · balance special allowance" />
            <TextArea label="Notes" value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} rows={2} />
          </div>
        )}
      </Drawer>
    </>
  );
}
