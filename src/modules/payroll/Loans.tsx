// Loans & advances: register + form (employee, principal, EMI, start), schedule, recovered via payroll inputs.
import { useState } from 'react';
import { C, db, engine, nav, useSession, useCollection, IDS } from '../../store';
import { RegisterPage, Badge, Button, Drawer, KV, DataTable, EntityPicker, useEmployeeOptions, MoneyField, NumberField, SelectField, TextField, DateField, useToast, Meter, ConfirmDialog } from '../../components/ui';
import { fmtMoney, fmtDate, today, round } from '../../lib/format';
import type { Loan, LoanScheduleRow } from './types';
import { periodLabel, nextPeriod } from './calc';
import { useMask } from './Employees';

export function LoansPage() {
  const s = useSession();
  const toast = useToast();
  const { money } = useMask();
  const loans = useCollection<Loan>(C.loans).filter((l) => !l.companyId || l.companyId === s.state.companyId);
  const empOpts = useEmployeeOptions();
  const [view, setView] = useState<Loan | null>(null);
  const [form, setForm] = useState<{ employeeId?: string; type: 'Loan' | 'Advance'; principal: number; months: number; interestPct: number; startPeriod: string; purpose: string; disbursedOn: string; disburse: boolean } | null>(null);
  const [closeLoan, setCloseLoan] = useState<Loan | null>(null);
  const canEdit = s.can('payroll.*') || s.can('payroll.loan.create');
  const emi = form ? round(form.principal * (1 + form.interestPct / 100) / Math.max(1, form.months)) : 0;
  const save = () => {
    if (!form?.employeeId) { toast.error('Choose an employee'); return; }
    if (form.principal <= 0) { toast.error('Principal must be positive'); return; }
    try {
      const emp = db.find<any>(C.employees, form.employeeId);
      const schedule: LoanScheduleRow[] = [];
      let period = form.startPeriod, bal = round(form.principal * (1 + form.interestPct / 100));
      for (let i = 0; i < form.months; i++) { const p = Math.min(emi, bal); bal = round(bal - p); schedule.push({ period, emi: p, principal: round(p / (1 + form.interestPct / 100)), interest: round(p - p / (1 + form.interestPct / 100)), balance: bal, status: 'Pending' }); period = nextPeriod(period); }
      const number = `${form.type === 'Loan' ? 'LN' : 'ADV'}-${String(loans.length + 1).padStart(3, '0')}`;
      const rec = db.transaction(() => {
        let journal: { id: string; number: string } | undefined;
        if (form.disburse) {
          const j = engine.postJournal({ date: form.disbursedOn, sourceType: 'Employee Loan', sourceNumber: number, narration: `${form.type} disbursed to ${emp.name} · ${form.purpose}`, lines: [{ accountId: IDS.accEmpAdvance, dr: form.principal, partyType: 'Employee', partyId: emp.id, partyName: emp.name }, { accountId: s.company?.defaults.bankAccountId ?? IDS.accHDFC, cr: form.principal, narration: 'Disbursement' }], idempotencyKey: `loan:${number}:disburse` });
          journal = j;
        }
        return db.insert<Loan>(C.loans, { number, employeeId: emp.id, employeeName: emp.name, type: form.type, principal: form.principal, interestPct: form.interestPct, emi, months: form.months, startPeriod: form.startPeriod, balance: round(form.principal * (1 + form.interestPct / 100)), recovered: 0, status: 'Active', schedule, journalId: journal?.id, journalNumber: journal?.number, disbursedOn: form.disbursedOn, purpose: form.purpose });
      });
      engine.audit({ action: 'payroll.loan.created', objectType: 'Loan', objectId: rec.id, objectNumber: number, detail: `${emp.name} · ${fmtMoney(form.principal)} · ${form.months} EMIs of ${fmtMoney(emi)}` });
      toast.success(`${form.type} ${number} recorded — EMIs will flow into payroll inputs from ${periodLabel(form.startPeriod)}`);
      setForm(null);
    } catch (e: any) { toast.error(e.message); }
  };
  const close = (l: Loan, reason: string) => { db.update<Loan>(C.loans, l.id, { status: 'Closed', schedule: l.schedule.map((r) => (r.status === 'Pending' ? { ...r, status: 'Skipped' as const } : r)) }); engine.audit({ action: 'payroll.loan.closed', objectType: 'Loan', objectId: l.id, objectNumber: l.number, detail: reason }); toast.success(`${l.number} closed`); };
  return (
    <>
      <RegisterPage<Loan> title="Loans & advances" subtitle={`${loans.filter((l) => l.status === 'Active').length} active · outstanding ${money(loans.reduce((x, l) => x + (l.status === 'Active' ? l.balance : 0), 0))} · recovered through payroll inputs`} rows={loans} columns={[
        { key: 'number', label: 'Loan', render: (l) => <div><span className="identifier link">{l.number}</span><div className="cell-secondary">{l.type} · {l.purpose}</div></div>, sortable: true },
        { key: 'employeeName', label: 'Employee', sortable: true },
        { key: 'principal', label: 'Principal', align: 'right', render: (l) => <span className="money">{money(l.principal)}</span> },
        { key: 'emi', label: 'EMI', align: 'right', render: (l) => <span className="money">{money(l.emi)} × {l.months}</span> },
        { key: 'startPeriod', label: 'From', render: (l) => periodLabel(l.startPeriod) },
        { key: 'recovered', label: 'Recovered', align: 'right', render: (l) => <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}><div style={{ width: 80 }}><Meter value={l.recovered} max={l.principal} tone="good" /></div><span className="money">{money(l.recovered)}</span></div> },
        { key: 'balance', label: 'Balance', align: 'right', render: (l) => <span className="money" style={{ fontWeight: 600 }}>{money(l.balance)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{money(rs.reduce((x, l) => x + l.balance, 0))}</span> },
        { key: 'status', label: 'Status', render: (l) => <Badge status={l.status === 'Closed' ? 'Closed' : 'Active'} /> },
      ]} entity="loans" searchKeys={['number', 'employeeName']}
        primaryAction={{ label: 'New loan / advance', onClick: () => setForm({ type: 'Loan', principal: 50000, months: 10, interestPct: 0, startPeriod: nextPeriod(s.state.periodCode ?? '2026-09'), purpose: '', disbursedOn: today(), disburse: true }), disabled: !canEdit, reason: !canEdit ? 'Requires payroll permission' : undefined }}
        tabs={[{ id: 'active', label: 'Active', filter: (l) => l.status === 'Active' }, { id: 'all', label: 'All' }, { id: 'closed', label: 'Closed', filter: (l) => l.status === 'Closed' }]}
        onRowClick={setView} showTotals
        rowActions={(l) => [{ label: 'Schedule', onClick: () => setView(l) }, { label: 'Ledger (1600)', onClick: () => nav.go(`accounting/ledger?account=${IDS.accEmpAdvance}`) }, { label: 'Close early', danger: true, onClick: () => setCloseLoan(l), disabled: l.status !== 'Active' }]}
        emptyTitle="No loans or advances" />
      <Drawer open={!!view} onClose={() => setView(null)} title={view ? `${view.number} · ${view.employeeName}` : ''} subtitle={view ? `${view.type} · ${view.purpose ?? ''}` : ''} width={640} footer={<Button variant="ghost" onClick={() => setView(null)}>Close</Button>}>
        {view && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <KV items={[{ k: 'Principal', v: money(view.principal) }, { k: 'Interest', v: `${view.interestPct}%` }, { k: 'EMI', v: `${money(view.emi)} × ${view.months}` }, { k: 'Disbursed', v: view.disbursedOn ? `${fmtDate(view.disbursedOn)}${view.journalNumber ? ' · ' + view.journalNumber : ''}` : '—' }, { k: 'Recovered', v: money(view.recovered) }, { k: 'Balance', v: money(view.balance) }, { k: 'Status', v: <Badge status={view.status === 'Closed' ? 'Closed' : 'Active'} /> }]} />
            <div className="section-title">Recovery schedule</div>
            <DataTable rows={view.schedule.map((r) => ({ ...r, id: r.period }))} dense columns={[{ key: 'period', label: 'Period', render: (r) => periodLabel(r.period) }, { key: 'emi', label: 'EMI', align: 'right', render: (r) => <span className="money">{money(r.emi)}</span> }, { key: 'principal', label: 'Principal', align: 'right', render: (r) => <span className="money">{money(r.principal)}</span> }, { key: 'interest', label: 'Interest', align: 'right', render: (r) => <span className="money">{r.interest ? money(r.interest) : '—'}</span> }, { key: 'balance', label: 'Balance', align: 'right', render: (r) => <span className="money">{money(r.balance)}</span> }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Recovered' ? 'Posted' : r.status === 'Skipped' ? 'Cancelled' : 'Draft'}>{r.status}{r.runId ? ` · ${db.find<any>(C.payrollRuns, r.runId)?.number ?? ''}` : ''}</Badge> }]} />
          </div>
        )}
      </Drawer>
      <Drawer open={!!form} onClose={() => setForm(null)} title="New loan / advance" width={560} footer={<><Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button><Button variant="primary" onClick={save}>Record {form?.type.toLowerCase() ?? 'loan'}</Button></>}>
        {form && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <EntityPicker label="Employee" required value={form.employeeId} onChange={(v) => setForm({ ...form, employeeId: v })} options={empOpts} />
            <div className="grid-2">
              <SelectField label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v as any })} options={['Loan', 'Advance']} />
              <MoneyField label="Principal" value={form.principal} onChange={(v) => setForm({ ...form, principal: v })} required />
              <NumberField label="Number of EMIs" value={form.months} onChange={(v) => setForm({ ...form, months: Math.max(1, Math.round(v)) })} decimals={0} min={1} />
              <NumberField label="Interest %" value={form.interestPct} onChange={(v) => setForm({ ...form, interestPct: v })} decimals={2} min={0} suffix="%" />
              <TextField label="Recovery from (period)" value={form.startPeriod} onChange={(v) => setForm({ ...form, startPeriod: v })} placeholder="2026-10" />
              <DateField label="Disbursement date" value={form.disbursedOn} onChange={(v) => setForm({ ...form, disbursedOn: v })} checkPeriod />
            </div>
            <TextField label="Purpose" value={form.purpose} onChange={(v) => setForm({ ...form, purpose: v })} placeholder="Medical emergency · festival advance · laptop" />
            <SelectField label="Disbursement" value={form.disburse ? 'post' : 'record'} onChange={(v) => setForm({ ...form, disburse: v === 'post' })} options={[{ value: 'post', label: 'Post disbursement journal now (Dr 1600 employee advances · Cr bank)' }, { value: 'record', label: 'Already paid — record only' }]} />
            <div className="summary-block"><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span>EMI</span><strong className="money">{fmtMoney(emi, s.currency)} × {form.months} from {form.startPeriod ? periodLabel(form.startPeriod) : '—'}</strong></div></div>
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!closeLoan} onClose={() => setCloseLoan(null)} title={`Close ${closeLoan?.number} early`} statement={`Balance ${closeLoan ? fmtMoney(closeLoan.balance, s.currency) : ''} will no longer be recovered through payroll — settle it separately.`} confirmLabel="Close loan" cancelLabel="Keep loan" danger reasonRequired consequences={[{ engine: 'Workflow', text: 'Pending EMIs marked skipped; no further payroll deductions', tone: 'warning' }]} onConfirm={(reason) => { if (closeLoan) close(closeLoan, reason); }} />
    </>
  );
}
