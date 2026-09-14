// Payroll inputs (FR-PAY-002): per-period grid of attendance / LOP, overtime, reimbursements (linked expense claims),
// bonus / arrears, loan EMI, one-off deductions; approve locks them for the run.
import { useMemo, useState } from 'react';
import { C, db, nav, useSession, useCollection, engine } from '../../store';
import { Banner, Button, Badge, ConfirmDialog, Modal, CheckboxField, useToast, SummaryBlock, ScopeLine } from '../../components/ui';
import { fmtMoney, fmtDate } from '../../lib/format';
import { PeriodPicker } from '../reports/ReportFrame';
import type { PayrollInput, PayrollRun } from './types';
import { ensureInputs, reimbursableClaims, payrollSettings } from './actions';
import { periodLabel } from './calc';
import { useMask } from './Employees';

export function InputsPage() {
  const s = useSession();
  const toast = useToast();
  const { money } = useMask();
  const [period, setPeriod] = useState(s.state.periodCode ?? '2026-09');
  const inputs = useCollection<PayrollInput>(C.payrollInputs);
  const runs = useCollection<PayrollRun>(C.payrollRuns);
  const claims = useCollection<any>(C.expenseClaims);
  const [approveOpen, setApproveOpen] = useState(false);
  const [claimFor, setClaimFor] = useState<PayrollInput | null>(null);
  const rows = useMemo(() => inputs.filter((i) => i.period === period).sort((a, b) => a.employeeName.localeCompare(b.employeeName)), [inputs, period]);
  const run = runs.find((r) => r.period === period && r.type === 'Regular' && r.status !== 'Reversed');
  const locked = rows.length > 0 && rows.every((r) => r.status === 'Locked');
  const canEdit = (s.can('payroll.*') || s.can('payroll.input.edit')) && !locked;
  const settings = payrollSettings();
  const upd = (i: PayrollInput, patch: Partial<PayrollInput>) => { if (i.status === 'Locked') return; db.update<PayrollInput>(C.payrollInputs, i.id, { ...patch, status: 'Draft' }); };
  const approve = () => {
    db.transaction(() => rows.filter((r) => r.status !== 'Locked').forEach((r) => db.update<PayrollInput>(C.payrollInputs, r.id, { status: 'Approved', approvedBy: s.user?.name, approvedAt: new Date().toISOString() })));
    engine.audit({ action: 'payroll.inputs.approved', objectType: 'Payroll Inputs', objectNumber: period, detail: `${rows.length} employees` });
    toast.success(`Inputs for ${periodLabel(period)} approved — run payroll to calculate`);
  };
  const num = (i: PayrollInput, k: keyof PayrollInput, opts: { min?: number; max?: number; step?: number } = {}) => (
    <input type="number" className="field-input grid num" style={{ width: 90 }} value={(i as any)[k] ?? 0} min={opts.min} max={opts.max} step={opts.step ?? 1} disabled={!canEdit || i.status === 'Locked'} onChange={(e) => upd(i, { [k]: Number(e.target.value) } as any)} />
  );
  const claimsFor = claimFor ? reimbursableClaims(claimFor.employeeId) : [];
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Payroll inputs</h1><div className="page-subtitle"><ScopeLine extra={`${periodLabel(period)} · ${rows.length} employees`} /></div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => { const n = ensureInputs(period); toast.success(`${n.length} input rows ready for ${periodLabel(period)}`); }} disabled={locked}>Prepare rows</Button>
          <Button variant="primary" tone="good" onClick={() => setApproveOpen(true)} disabled={!rows.length || locked || rows.every((r) => r.status === 'Approved')} reason={locked ? 'Locked by finalized run' : undefined}>Approve inputs</Button>
        </div>
      </div>
      <div className="card toolbar" style={{ padding: '10px 14px', gap: 12, alignItems: 'flex-end' }}>
        <PeriodPicker value={period} onChange={setPeriod} />
        <SummaryBlock style={{ background: 'transparent', padding: 0 }} items={[{ label: 'Working days', value: settings.workingDaysPerMonth }, { label: 'LOP days', value: rows.reduce((x, r) => x + r.lopDays, 0) }, { label: 'Reimbursements', value: money(rows.reduce((x, r) => x + r.reimbursements, 0)) }, { label: 'Bonus / arrears', value: money(rows.reduce((x, r) => x + r.bonus + r.arrears, 0)) }, { label: 'Loan EMIs', value: money(rows.reduce((x, r) => x + r.loanEmi, 0)) }]} />
        <div style={{ flex: 1 }} />
        {run && <Button variant="link" onClick={() => nav.go(`payroll/runs/${run.id}`)}>Open run {run.number} ({run.status}) →</Button>}
      </div>
      {locked ? <Banner tone="info">Inputs for {periodLabel(period)} are frozen by finalized run {run?.number}. Reverse the run to change them (FR-PAY-003).</Banner> : rows.some((r) => r.status === 'Draft') ? <Banner tone="warning">{rows.filter((r) => r.status === 'Draft').length} draft row{rows.filter((r) => r.status === 'Draft').length === 1 ? '' : 's'} — approve inputs before calculating the run.</Banner> : rows.length > 0 ? <Banner tone="success">All inputs approved by {rows[0].approvedBy ?? '—'} on {fmtDate(rows[0].approvedAt)}.</Banner> : null}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense">
          <thead><tr><th>Employee</th><th className="right">Working days</th><th className="right">LOP days</th><th className="right">OT hours</th><th className="right">OT amount</th><th className="right">Reimbursements</th><th className="right">Bonus</th><th className="right">Arrears</th><th className="right">Loan EMI</th><th className="right">Other deductions</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td><div className="cell-primary">{i.employeeName}</div><div className="cell-secondary">{db.find<any>(C.employees, i.employeeId)?.code}</div></td>
                <td className="right">{num(i, 'workingDays', { min: 0, max: 31 })}</td>
                <td className="right">{num(i, 'lopDays', { min: 0, max: 31, step: 0.5 })}</td>
                <td className="right">{num(i, 'overtimeHours', { min: 0 })}</td>
                <td className="right">{num(i, 'overtimeAmount', { min: 0 })}</td>
                <td className="right"><div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>{num(i, 'reimbursements', { min: 0 })}<Button size="sm" variant="ghost" title="Link approved expense claims" onClick={() => setClaimFor(i)} disabled={!canEdit || i.status === 'Locked'}>{i.reimbursementClaimIds.length ? `${i.reimbursementClaimIds.length} claim${i.reimbursementClaimIds.length === 1 ? '' : 's'}` : 'Link'}</Button></div></td>
                <td className="right">{num(i, 'bonus', { min: 0 })}</td>
                <td className="right">{num(i, 'arrears', { min: 0 })}</td>
                <td className="right"><span className="money" title={i.loanId ? `Loan ${db.find<any>(C.loans, i.loanId)?.number}` : undefined}>{fmtMoney(i.loanEmi, s.currency)}</span></td>
                <td className="right">{num(i, 'otherDeductions', { min: 0 })}</td>
                <td><Badge status={i.status === 'Locked' ? 'Locked' : i.status} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>No input rows for {periodLabel(period)} — click “Prepare rows” to create one per payroll employee.</td></tr>}
          </tbody>
        </table>
      </div>
      <ConfirmDialog open={approveOpen} onClose={() => setApproveOpen(false)} title={`Approve payroll inputs for ${periodLabel(period)}`} statement="Approved inputs feed the payroll calculation. They are frozen when the run is finalized." confirmLabel="Approve inputs" cancelLabel="Keep editing" consequences={[{ engine: 'Workflow', text: `${rows.filter((r) => r.status !== 'Locked').length} rows marked Approved by ${s.user?.name}`, tone: 'success' }]} onConfirm={approve} />
      <Modal open={!!claimFor} onClose={() => setClaimFor(null)} title={`Link expense claims · ${claimFor?.employeeName ?? ''}`} description="Approved, posted personal claims not yet reimbursed. Linked claims are paid with salary and marked reimbursed when the run is finalized." footer={<Button variant="primary" onClick={() => setClaimFor(null)}>Done</Button>}>
        {claimFor && (claimsFor.length === 0 ? <div style={{ fontSize: 13, color: 'var(--ink-4)' }}>No reimbursable claims for this employee.</div> : claimsFor.map((c) => (
          <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--hairline)' }}>
            <CheckboxField checked={claimFor.reimbursementClaimIds.includes(c.id)} onChange={(v) => { const ids = v ? [...claimFor.reimbursementClaimIds, c.id] : claimFor.reimbursementClaimIds.filter((x) => x !== c.id); const total = ids.reduce((x, id) => x + (db.find<any>(C.expenseClaims, id)?.totals.total ?? 0), 0); const next = { ...claimFor, reimbursementClaimIds: ids, reimbursements: total }; upd(claimFor, { reimbursementClaimIds: ids, reimbursements: total }); setClaimFor(next); }} label={<span><span className="identifier">{c.number}</span> · {c.purpose} · <strong>{fmtMoney(c.totals.total, s.currency)}</strong></span>} />
          </div>
        )))}
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>{claims.length} claims on file</div>
      </Modal>
    </div>
  );
}
