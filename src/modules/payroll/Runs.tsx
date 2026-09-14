// Payroll runs (FR-PAY-002..005): runs list + run page (legacy look) — create, recalculate, finalize, post, bank file,
// reverse, off-cycle; statutory panel with ledger mapping; employee breakdown with payslip drill; confidentiality masking.
import { useMemo, useState } from 'react';
import { C, db, nav, useSession, useCollection } from '../../store';
import type { Employee } from '../../store';
import { Badge, Banner, Button, ConfirmDialog, Modal, TextField, DateField, AccountingTab, ActivityTab, Tabs, useToast, EmptyState, Pill, KV } from '../../components/ui';
import { PlusIcon, DownloadIcon } from '../../components/Icons';
import { fmtMoney, fmtDate, fmtDateTime, today } from '../../lib/format';
import { PeriodPicker } from '../reports/ReportFrame';
import type { PayrollRun, PayrollLine } from './types';
import { calculateRun, createRun, finalizeRun, postRun, reverseRun, bankFile, payrollEmployees, revealAudit } from './actions';
import { LEDGER_MAP, payrollPostingLines } from './posting';
import { periodLabel, nextPeriod, sumLines } from './calc';
import { useMask } from './Employees';
import { accountName } from '../taxation/derive';

export function RunsPage({ id }: { id?: string }) {
  const s = useSession();
  const toast = useToast();
  const { canView } = useMask();
  const runs = useCollection<PayrollRun>(C.payrollRuns).filter((r) => !r.companyId || r.companyId === s.state.companyId).slice().sort((a, b) => b.period.localeCompare(a.period) || b.number.localeCompare(a.number));
  const selected = runs.find((r) => r.id === id) ?? runs[0];
  const [createOpen, setCreateOpen] = useState(false);
  const [offOpen, setOffOpen] = useState(false);
  const [confirm, setConfirm] = useState<'finalize' | 'post' | 'reverse' | null>(null);
  const [payDate, setPayDate] = useState(today());
  const [newPeriod, setNewPeriod] = useState(() => { const last = runs.filter((r) => r.type === 'Regular' && r.status !== 'Reversed').sort((a, b) => b.period.localeCompare(a.period))[0]; return last ? nextPeriod(last.period) : s.state.periodCode ?? '2026-09'; });
  const [off, setOff] = useState<{ period: string; label: string; amounts: Record<string, { bonus: number; arrears: number; note: string }> }>({ period: s.state.periodCode ?? '2026-09', label: 'Diwali bonus', amounts: {} });
  const [tab, setTab] = useState<'summary' | 'employees' | 'accounting' | 'activity'>('summary');
  const [revealed, setRevealed] = useState(false);
  const canRun = s.can('payroll.*') || s.can('payroll.run.create');
  const canPost = s.can('payroll.*') || s.can('payroll.run.post') || s.can('accounting.*');
  const select = (r: PayrollRun) => nav.go(`payroll/runs/${r.id}`);
  const act = (fn: () => void, msg?: string) => { try { fn(); if (msg) toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const create = () => act(() => { const r = createRun(newPeriod, 'Regular'); setCreateOpen(false); nav.go(`payroll/runs/${r.id}`); }, `Payroll run created for ${periodLabel(newPeriod)}`);
  const createOff = () => act(() => {
    const emps = payrollEmployees(off.period).filter((e) => off.amounts[e.id] && (off.amounts[e.id].bonus > 0 || off.amounts[e.id].arrears > 0));
    if (!emps.length) throw new Error('Enter a bonus or arrears amount for at least one employee');
    const run = createRun(off.period, 'Off-cycle', off.label);
    const lines: PayrollLine[] = emps.map((e) => ({ employeeId: e.id, employeeName: e.name, employeeCode: e.code, department: e.department, branchId: e.branchId, workingDays: 0, paidDays: 0, lopDays: 0, earnings: {}, basic: 0, hra: 0, special: 0, otherEarnings: 0, overtime: 0, reimbursements: 0, bonus: off.amounts[e.id].bonus, arrears: off.amounts[e.id].arrears, gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, loan: 0, otherDeductions: 0, deductions: 0, net: 0, employerPf: 0, employerEsi: 0, note: off.amounts[e.id].note }));
    db.update<PayrollRun>(C.payrollRuns, run.id, { lines, totals: sumLines(lines), employeeCount: lines.length });
    const calc = calculateRun({ ...run, lines }, { employeeIds: emps.map((e) => e.id) });
    setOffOpen(false); nav.go(`payroll/runs/${calc.id}`);
  }, 'Off-cycle run created');
  const totals = selected?.totals;
  const summaryRows = totals ? [
    { label: 'Basic salary', amount: totals.basic, type: 'earning' }, { label: 'HRA', amount: totals.hra, type: 'earning' }, { label: 'Special & other allowances', amount: totals.special + totals.otherEarnings, type: 'earning' },
    ...(totals.overtime ? [{ label: 'Overtime', amount: totals.overtime, type: 'earning' }] : []), ...(totals.bonus + totals.arrears ? [{ label: 'Bonus / arrears', amount: totals.bonus + totals.arrears, type: 'earning' }] : []), ...(totals.reimbursements ? [{ label: 'Reimbursements', amount: totals.reimbursements, type: 'earning' }] : []),
    { label: 'Gross earnings', amount: totals.gross, type: 'total-earning' },
    { label: "Employee's PF", amount: totals.pf, type: 'deduction' }, { label: 'ESI (employee)', amount: totals.esi, type: 'deduction' }, { label: 'Professional tax', amount: totals.pt, type: 'deduction' }, { label: 'Income tax (TDS 192)', amount: totals.tds, type: 'deduction' }, ...(totals.loan ? [{ label: 'Loan / advance recovery', amount: totals.loan, type: 'deduction' }] : []), ...(totals.otherDeductions ? [{ label: 'Other deductions', amount: totals.otherDeductions, type: 'deduction' }] : []),
    { label: 'Total deductions', amount: totals.deductions, type: 'total-deduction' }, { label: 'Net payable', amount: totals.net, type: 'net' }, { label: "Employer's PF + ESI (cost)", amount: totals.employerTotal, type: 'employer' },
  ] : [];
  const statutory = totals ? [
    { label: 'Employer PF (12%)', amount: totals.employerPf, ledger: accountName(LEDGER_MAP[2].accountId) }, { label: 'Employee PF (12%)', amount: totals.pf, ledger: accountName(LEDGER_MAP[3].accountId) }, { label: 'ESI (3.25% + 0.75%)', amount: totals.esi + totals.employerEsi, ledger: accountName(LEDGER_MAP[4].accountId) }, { label: 'Professional tax', amount: totals.pt, ledger: accountName(LEDGER_MAP[5].accountId) }, { label: 'Income tax (TDS)', amount: totals.tds, ledger: accountName(LEDGER_MAP[6].accountId) },
  ] : [];
  const projected = useMemo(() => (selected && selected.status !== 'Posted' && selected.status !== 'Reversed' && selected.lines.length ? payrollPostingLines(selected) : undefined), [selected]);
  const mask = !canView && !revealed;
  const m = (n: number) => (mask ? '••••••' : fmtMoney(n, s.currency));
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 290, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: '#FFF' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Payroll runs</span>
          <div style={{ display: 'flex', gap: 4 }}><Button size="sm" variant="secondary" onClick={() => setOffOpen(true)} disabled={!canRun}>Off-cycle</Button><Button size="sm" variant="primary" icon={<PlusIcon size={12} />} onClick={() => setCreateOpen(true)} disabled={!canRun} reason={!canRun ? 'Requires payroll permission' : undefined}>Run</Button></div>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {runs.map((r) => (
            <div key={r.id} onClick={() => select(r)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer', background: selected?.id === r.id ? 'var(--accent-tint)' : '#FFF', borderLeft: selected?.id === r.id ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{periodLabel(r.period)}{r.type === 'Off-cycle' ? ' · off-cycle' : ''}</span><Badge status={r.status === 'Calculated' ? 'Ready' : r.status === 'Finalized' ? 'Approved' : r.status} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)' }}><span className="identifier">{r.number} · {r.employeeCount} emp</span><span className="money">{m(r.totals.net)}</span></div>
            </div>
          ))}
          {runs.length === 0 && <div style={{ padding: 24 }}><EmptyState compact title="No payroll runs" description="Create the first run for the open period." action={<Button variant="primary" onClick={() => setCreateOpen(true)}>Run payroll</Button>} /></div>}
        </div>
      </div>
      {selected ? (
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{periodLabel(selected.period)} payroll{selected.type === 'Off-cycle' ? ` · off-cycle${selected.label ? ' (' + selected.label + ')' : ''}` : ''}</h2>
              <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>{selected.number} · {selected.employeeCount} employees · <Badge status={selected.status === 'Calculated' ? 'Ready' : selected.status === 'Finalized' ? 'Approved' : selected.status} />{selected.journalNumber && <> · journal <span className="identifier link" onClick={() => nav.go(`accounting/journals/${selected.journalId}`)}>{selected.journalNumber}</span></>}{selected.reversalOfId && <> · reversal of {runs.find((r) => r.id === selected.reversalOfId)?.number}</>}{selected.reversedById && <> · reversed by {runs.find((r) => r.id === selected.reversedById)?.number}</>}</p>
              {selected.notes && <div style={{ fontSize: 12, color: 'var(--warn)', marginTop: 4 }}>{selected.notes}</div>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {!canView && <Button variant="secondary" size="sm" onClick={() => { setRevealed(!revealed); if (!revealed) revealAudit('payroll run amounts', selected.id); }}>{revealed ? 'Hide amounts' : 'Reveal amounts (audited)'}</Button>}
              {(selected.status === 'Draft' || selected.status === 'Calculated') && <><Button variant="secondary" onClick={() => act(() => calculateRun(selected), 'Run recalculated from structures and approved inputs')} disabled={!canRun}>Recalculate</Button><Button variant="primary" onClick={() => setConfirm('finalize')} disabled={!canRun || selected.status !== 'Calculated'} reason={selected.status !== 'Calculated' ? 'Calculate first' : undefined}>Finalize</Button></>}
              {selected.status === 'Finalized' && <><Button variant="secondary" onClick={() => setConfirm('reverse')} disabled={!canRun}>Reverse</Button><Button variant="primary" onClick={() => setConfirm('post')} disabled={!canPost} reason={!canPost ? 'Requires posting permission' : undefined}>Post to ledger</Button></>}
              {selected.status === 'Posted' && <><Button variant="secondary" icon={<DownloadIcon size={14} />} onClick={() => nav.go(`payroll/payslips?run=${selected.id}`)}>Payslips</Button><Button variant="secondary" onClick={() => act(() => bankFile(selected, !canView), `Bank file downloaded (${canView ? 'full' : 'masked'} account numbers)`)}>Bank file</Button>{!selected.reversalOfId && !selected.reversedById && <Button variant="danger" onClick={() => setConfirm('reverse')} disabled={!canPost}>Reverse run</Button>}</>}
            </div>
          </div>
          {mask && <Banner tone="info">Amounts are masked — you lack the payroll.view permission (FR-PAY-004). Use “Reveal amounts” to view; every reveal is audited.</Banner>}
          {selected.status === 'Reversed' && <Banner tone="warning">This run was reversed{selected.reversalReason ? `: ${selected.reversalReason}` : ''}. Original lines and history are preserved (FR-PAY-005).</Banner>}
          <Tabs value={tab} onChange={setTab} tabs={[{ id: 'summary', label: 'Summary' }, { id: 'employees', label: 'Employee breakdown', count: selected.lines.length }, { id: 'accounting', label: 'Accounting' }, { id: 'activity', label: 'Activity' }]} />
          {tab === 'summary' && (
            <div className="grid-2">
              <div className="card" style={{ padding: '16px 20px' }}>
                <div className="section-label" style={{ marginBottom: 8 }}>Summary</div>
                {summaryRows.map((c) => { const total = c.type.startsWith('total') || c.type === 'net' || c.type === 'employer'; return (
                  <div key={c.label} className="ladder-row" style={{ borderTop: total ? '1px solid var(--line)' : 'none', paddingTop: total ? 8 : 4, marginTop: total ? 4 : 0 }}>
                    <span className="ladder-label" style={{ fontSize: c.type === 'net' ? 14 : 11, color: c.type === 'net' ? 'var(--ink)' : 'var(--ink-3)', fontWeight: c.type === 'net' ? 600 : 500 }}>{c.label}</span>
                    <span className="ladder-value" style={{ fontSize: c.type === 'net' ? 18 : 13, fontWeight: c.type === 'net' ? 700 : 500, color: c.type === 'deduction' || c.type === 'total-deduction' ? 'var(--danger)' : 'var(--ink)' }}>{c.type === 'deduction' && !mask ? fmtMoney(-Math.abs(c.amount), s.currency, { parens: true }) : m(c.amount)}</span>
                  </div>); })}
              </div>
              <div className="card" style={{ padding: '16px 20px' }}>
                <div className="section-label" style={{ marginBottom: 12 }}>Statutory contributions · ledger mapping</div>
                {statutory.map((x) => <div key={x.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--hairline)', fontSize: 13 }}><div><div style={{ fontWeight: 500 }}>{x.label}</div><div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{x.ledger}</div></div><span className="money" style={{ fontWeight: 600, color: 'var(--danger)' }}>{m(x.amount)}</span></div>)}
                <div style={{ marginTop: 12 }}><div className="section-label" style={{ marginBottom: 6 }}>Posting map</div>{LEDGER_MAP.map((l) => <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)', padding: '3px 0' }}><span>{l.side} · {l.label}</span><span className="identifier">{accountName(l.accountId)}{l.dims ? ` · ${l.dims}` : ''}</span></div>)}</div>
                <KV items={[{ k: 'Payment date', v: selected.paymentDate ? fmtDate(selected.paymentDate) : '—' }, { k: 'Finalized', v: selected.finalizedAt ? `${fmtDateTime(selected.finalizedAt)} · ${selected.finalizedBy}` : '—' }, { k: 'Posted', v: selected.postedAt ? `${fmtDateTime(selected.postedAt)} · ${selected.postedBy}` : '—' }, { k: 'Bank file', v: selected.bankFileGeneratedAt ? fmtDateTime(selected.bankFileGeneratedAt) : 'Not generated' }]} />
              </div>
            </div>
          )}
          {tab === 'employees' && (
            <div className="card" style={{ overflow: 'auto' }}>
              <table className="data-table dense">
                <thead><tr><th>Employee</th><th className="right">Days</th><th className="right">Basic</th><th className="right">HRA</th><th className="right">Special</th><th className="right">Other</th><th className="right">Gross</th><th className="right">PF</th><th className="right">ESI</th><th className="right">PT</th><th className="right">TDS</th><th className="right">Loan</th><th className="right">Net</th><th>Payslip</th></tr></thead>
                <tbody>{selected.lines.map((l) => (
                  <tr key={l.employeeId} style={{ cursor: l.payslipId ? 'pointer' : undefined }} onClick={() => l.payslipId && nav.go(`payroll/payslips/${l.payslipId}`)}>
                    <td><div className="cell-primary">{l.employeeName}</div><div className="cell-secondary">{l.employeeCode} · {l.department}{l.note ? ` · ${l.note}` : ''}</div></td>
                    <td className="right">{l.paidDays}/{l.workingDays}{l.lopDays ? <Pill tone="warning">LOP {l.lopDays}</Pill> : null}</td>
                    <td className="right money">{m(l.basic)}</td><td className="right money">{m(l.hra)}</td><td className="right money">{m(l.special)}</td><td className="right money">{m(l.otherEarnings + l.overtime + l.bonus + l.arrears + l.reimbursements)}</td>
                    <td className="right money" style={{ fontWeight: 600 }}>{m(l.gross)}</td>
                    <td className="right money" style={{ color: 'var(--danger)' }}>{m(l.pf)}</td><td className="right money" style={{ color: 'var(--danger)' }}>{m(l.esi)}</td><td className="right money" style={{ color: 'var(--danger)' }}>{m(l.pt)}</td><td className="right money" style={{ color: 'var(--danger)' }}>{m(l.tds)}</td><td className="right money" style={{ color: 'var(--danger)' }}>{l.loan ? m(l.loan) : '—'}</td>
                    <td className="right money" style={{ fontWeight: 700 }}>{m(l.net)}</td>
                    <td>{l.payslipId ? <Badge status={db.find<any>(C.payslips, l.payslipId)?.status === 'Void' ? 'Cancelled' : 'Generated'} /> : <span style={{ color: 'var(--ink-5)', fontSize: 12 }}>on finalize</span>}</td>
                  </tr>))}</tbody>
                <tfoot><tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}><td colSpan={2}>Totals for {selected.lines.length} employees</td><td className="right money">{m(totals!.basic)}</td><td className="right money">{m(totals!.hra)}</td><td className="right money">{m(totals!.special)}</td><td className="right money">{m(totals!.otherEarnings + totals!.overtime + totals!.bonus + totals!.arrears + totals!.reimbursements)}</td><td className="right money">{m(totals!.gross)}</td><td className="right money">{m(totals!.pf)}</td><td className="right money">{m(totals!.esi)}</td><td className="right money">{m(totals!.pt)}</td><td className="right money">{m(totals!.tds)}</td><td className="right money">{m(totals!.loan)}</td><td className="right money">{m(totals!.net)}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
          {tab === 'accounting' && (mask ? <Banner tone="info">Journal lines are masked without payroll.view permission.</Banner> : <AccountingTab journalId={selected.journalId} projected={projected} currency={s.currency} title={selected.journalId ? undefined : 'Projected journal (posts on “Post to ledger”)'} />)}
          {tab === 'activity' && <ActivityTab objectId={selected.id} correlationId={selected.correlationId} />}
        </div>
      ) : <div style={{ flex: 1 }} />}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create payroll run" description="Calculates every payroll employee from their effective salary structure and the approved inputs for the period." footer={<><Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button><Button variant="primary" onClick={create}>Create & calculate</Button></>}>
        <PeriodPicker value={newPeriod} onChange={setNewPeriod} size="md" />
        {runs.some((r) => r.period === newPeriod && r.type === 'Regular' && r.status !== 'Reversed') && <Banner tone="danger">A regular run already exists for {periodLabel(newPeriod)} — duplicate runs are blocked.</Banner>}
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 10 }}>{payrollEmployees(newPeriod).length} employees in scope · inputs {db.count(C.payrollInputs, (i) => i.period === newPeriod && i.status !== 'Draft')}/{db.count(C.payrollInputs, (i) => i.period === newPeriod)} approved</div>
      </Modal>
      <Modal open={offOpen} onClose={() => setOffOpen(false)} title="Off-cycle run (bonus / arrears / F&F)" description="Pays one-off amounts outside the regular cycle; the original regular run is untouched (FR-PAY-005)." width={680} footer={<><Button variant="secondary" onClick={() => setOffOpen(false)}>Cancel</Button><Button variant="primary" onClick={createOff}>Create off-cycle run</Button></>}>
        <div className="grid-2"><PeriodPicker value={off.period} onChange={(v) => setOff({ ...off, period: v })} size="md" /><TextField label="Label" value={off.label} onChange={(v) => setOff({ ...off, label: v })} placeholder="Diwali bonus · Full & final — Sunita More" /></div>
        <div className="card" style={{ marginTop: 12, overflow: 'auto', maxHeight: 320 }}><table className="data-table dense"><thead><tr><th>Employee</th><th className="right">Bonus</th><th className="right">Arrears</th><th>Note</th></tr></thead><tbody>
          {payrollEmployees(off.period).map((e: Employee) => { const a = off.amounts[e.id] ?? { bonus: 0, arrears: 0, note: '' }; const set = (p: Partial<typeof a>) => setOff({ ...off, amounts: { ...off.amounts, [e.id]: { ...a, ...p } } }); return <tr key={e.id}><td>{e.name}<div className="cell-secondary">{e.code}</div></td><td className="right"><input type="number" className="field-input grid num" style={{ width: 100 }} value={a.bonus} onChange={(ev) => set({ bonus: Number(ev.target.value) })} /></td><td className="right"><input type="number" className="field-input grid num" style={{ width: 100 }} value={a.arrears} onChange={(ev) => set({ arrears: Number(ev.target.value) })} /></td><td><input className="field-input grid" value={a.note} onChange={(ev) => set({ note: ev.target.value })} placeholder="e.g. Q2 performance" /></td></tr>; })}
        </tbody></table></div>
      </Modal>
      <ConfirmDialog open={confirm === 'finalize'} onClose={() => setConfirm(null)} title={`Finalize ${selected?.number}`} statement="Freezes inputs, generates payslips and statutory summaries. Post to the ledger as a separate step." confirmLabel="Finalize run" cancelLabel="Keep calculating" consequences={[{ engine: 'Workflow', text: `Inputs for ${selected ? periodLabel(selected.period) : ''} locked`, tone: 'warning' }, { engine: 'Statutory', text: `${selected?.lines.length ?? 0} payslips generated · PF/ESI/PT/TDS summaries available`, tone: 'success' }, { engine: 'Open items', text: 'Loan EMIs marked recovered · linked expense claims marked reimbursed', tone: 'info' }]} onConfirm={() => { if (selected) { finalizeRun(selected); toast.success('Run finalized — payslips generated'); } }} />
      <ConfirmDialog open={confirm === 'post'} onClose={() => setConfirm(null)} title={`Post ${selected?.number} to ledger`} statement="Creates the salary journal by department dimension and per-employee liabilities." confirmLabel="Post payroll" cancelLabel="Not now" consequences={[{ engine: 'Journal', text: `Dr salary expense by department · Dr employer PF/ESI · Cr PF/ESI/PT/TDS payable · Cr salaries payable per employee — total ${selected ? fmtMoney(selected.totals.gross + selected.totals.employerTotal, s.currency) : ''}`, tone: 'info' }, { engine: 'Open items', text: `${selected?.lines.filter((l) => l.net > 0).length ?? 0} employee open items for net pay`, tone: 'info' }, { engine: 'Notification', text: 'Finance notified; bank file can be generated', tone: 'info' }]} onConfirm={() => { if (!selected) return; const r = postRun(selected, payDate); toast.success(`Payroll posted · ${r.journalNumber}`, { label: 'Open journal', path: `accounting/journals/${r.journalId}` }); }}>
        <DateField label="Posting / payment date" value={payDate} onChange={setPayDate} checkPeriod required />
      </ConfirmDialog>
      <ConfirmDialog open={confirm === 'reverse'} onClose={() => setConfirm(null)} title={`Reverse ${selected?.number}`} statement="Creates a linked reversal journal, voids the payslips and unlocks inputs. The original run and its history are preserved." confirmLabel="Reverse run" cancelLabel="Keep run" danger reasonRequired consequences={[{ engine: 'Journal', text: selected?.journalNumber ? `Reversal of ${selected.journalNumber} posted today` : 'No journal to reverse (not posted)', tone: 'danger' }, { engine: 'Statutory', text: 'Payslips voided · loan recoveries rolled back', tone: 'warning' }, { engine: 'Workflow', text: 'Inputs return to Approved for a corrected run', tone: 'info' }]} onConfirm={(reason) => { if (selected) { reverseRun(selected, reason); toast.success('Run reversed'); } }} />
    </div>
  );
}
