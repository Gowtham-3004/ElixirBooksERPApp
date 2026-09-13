// Seed data for the payroll module: salary structures, inputs, runs (Apr–Aug posted with journals, Sep draft),
// payslips for Aug, loans. Owned by the payroll module.
import type { DB } from '../db';
import type { Journal, JournalLine } from '../types';
import { C } from '../collections';
import { IDS, rec, SEED_NOW } from './core';
import type { SalaryStructure, PayrollInput, PayrollRun, Payslip, Loan, PayrollLine } from '../../modules/payroll/types';
import { DEFAULT_PAYROLL_SETTINGS, computeLine, daysInPeriod, estimateMonthlyTds, standardComponents, structureAmounts, sumLines, type EmployeeLike } from '../../modules/payroll/calc';
import { departmentDimension, payrollPostingLines, type PostingLine } from '../../modules/payroll/posting';

const co = IDS.acme;

/** Account code/name lookup for seeded journal lines (mirrors core accounts). */
export const ACC_META: Record<string, { code: string; name: string }> = {
  [IDS.accSalaries]: { code: '5100', name: 'Employee Salaries' },
  [IDS.accEmployerPF]: { code: '5110', name: 'Employer PF & ESI Contribution' },
  [IDS.accPFPayable]: { code: '2320', name: 'PF Payable' },
  [IDS.accESIPayable]: { code: '2321', name: 'ESI Payable' },
  [IDS.accPTPayable]: { code: '2322', name: 'Professional Tax Payable' },
  [IDS.accTDSPayable]: { code: '2310', name: 'TDS Payable' },
  [IDS.accSalaryPayable]: { code: '2330', name: 'Salaries Payable' },
  [IDS.accEmpPayable]: { code: '2340', name: 'Employee Reimbursements Payable' },
  [IDS.accCardPayable]: { code: '2350', name: 'Corporate Card Payable' },
  [IDS.accEmpAdvance]: { code: '1600', name: 'Employee Advances & Loans' },
  [IDS.accOtherIncome]: { code: '4100', name: 'Other Income' },
  [IDS.accRoundOff]: { code: '4900', name: 'Round-off' },
  [IDS.accDep]: { code: '5300', name: 'Depreciation & Amortisation' },
  [IDS.accAccDep]: { code: '1510', name: 'Accumulated Depreciation' },
  [IDS.accPPE]: { code: '1500', name: 'Property, Plant & Equipment' },
  [IDS.accIntangible]: { code: '1520', name: 'Intangible Assets' },
  [IDS.accHDFC]: { code: '1310', name: 'HDFC Current Account ****1234' },
  [IDS.accAP]: { code: '2100', name: 'Trade Payables (AP Control)' },
  [IDS.accTravel]: { code: '5500', name: 'Travel & Logistics' },
  [IDS.accIT]: { code: '5520', name: 'IT & Software' },
  [IDS.accGSTInputCGST]: { code: '1400', name: 'Input CGST' },
  [IDS.accGSTInputSGST]: { code: '1401', name: 'Input SGST' },
  'acc_5540': { code: '5540', name: 'Training & Development' },
  'acc_5550': { code: '5550', name: 'Office Supplies' },
  'acc_5560': { code: '5560', name: 'Entertainment' },
  'acc_5810': { code: '5810', name: 'Loss on Disposal of Assets' },
  'acc_4130': { code: '4130', name: 'Gain on Disposal of Assets' },
  [IDS.accGSTOutputCGST]: { code: '2300', name: 'Output CGST Payable' },
  [IDS.accGSTOutputSGST]: { code: '2301', name: 'Output SGST Payable' },
  [IDS.accGSTOutputIGST]: { code: '2302', name: 'Output IGST Payable' },
  [IDS.accGSTInputIGST]: { code: '1402', name: 'Input IGST' },
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build a seeded, posted journal from posting lines (used by payroll/assets/budgets seeds). */
export function seedJournal(id: string, number: string, date: string, sourceType: string, sourceId: string, sourceNumber: string, narration: string, lines: PostingLine[], postedBy = 'Rahul Kumar', type: Journal['type'] = 'Auto'): Journal {
  const jl: JournalLine[] = lines.map((l, i) => ({
    id: `${id}_l${i + 1}`,
    accountId: l.accountId,
    accountCode: ACC_META[l.accountId]?.code ?? l.accountId,
    accountName: ACC_META[l.accountId]?.name ?? l.accountId,
    dr: r2(l.dr ?? 0), cr: r2(l.cr ?? 0), drBase: r2(l.dr ?? 0), crBase: r2(l.cr ?? 0),
    currency: 'INR', partyType: l.partyType, partyId: l.partyId, partyName: l.partyName,
    dimensions: { Branch: IDS.brHO, ...(l.dimensions ?? {}) }, narration: l.narration,
  }));
  const totalDr = r2(jl.reduce((s, l) => s + l.drBase, 0));
  const totalCr = r2(jl.reduce((s, l) => s + l.crBase, 0));
  return rec<Journal>(id, {
    companyId: co, number, date, period: date.slice(0, 7), fy: date < '2026-04-01' ? '2025-26' : '2026-27', branchId: IDS.brHO, currency: 'INR', rate: 1,
    status: 'Posted', type, sourceType, sourceId, sourceNumber, narration, lines: jl, totalDr, totalCr,
    idempotencyKey: `${sourceId}:post`, payloadHash: 'seed', postedAt: `${date}T10:00:00.000Z`, postedBy, correlationId: `corr_${id.toUpperCase()}`,
    createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`,
  });
}

/** Employees as in core seed (kept in sync by id). */
export const SEED_EMPLOYEES: (EmployeeLike & { designation: string; pan: string; ctc: number; pf: boolean; esi: boolean; leaving?: string; uan: string })[] = [
  { id: IDS.eRahul, code: 'EMP-001', name: 'Rahul Kumar', department: 'Finance', designation: 'Finance Manager', pan: 'ABCPK1234N', ctc: 1440000, pf: true, esi: false, branchId: IDS.brHO, costCentreId: IDS.dimCCMumbai, uan: '100100000001', bankDetail: { accountNumber: '50100023456789' } },
  { id: IDS.ePriya, code: 'EMP-002', name: 'Priya Mehta', department: 'Sales', designation: 'Sales Manager', pan: 'BCQPM2345O', ctc: 1200000, pf: true, esi: false, branchId: IDS.brHO, uan: '100100000002', bankDetail: { accountNumber: '001405012345' } },
  { id: IDS.eVikram, code: 'EMP-003', name: 'Vikram Singh', department: 'Operations', designation: 'Operations Head', pan: 'CDRPS3456P', ctc: 1800000, pf: true, esi: false, branchId: IDS.brHO, uan: '100100000003', bankDetail: { accountNumber: '917020045678901' } },
  { id: IDS.eAnita, code: 'EMP-004', name: 'Anita Rao', department: 'Admin', designation: 'Admin Executive', pan: 'DESQR4567Q', ctc: 480000, pf: true, esi: true, branchId: IDS.brHO, uan: '100100000004', bankDetail: { accountNumber: '30012345670' } },
  { id: IDS.eSuresh, code: 'EMP-005', name: 'Suresh Kumar', department: 'Production', designation: 'Supervisor', pan: 'EFTRS5678R', ctc: 360000, pf: true, esi: true, branchId: IDS.brAndheri, uan: '100100000005', bankDetail: { accountNumber: '50100087654321' } },
  { id: IDS.eMeena, code: 'EMP-006', name: 'Meena Joshi', department: 'HR', designation: 'HR Executive', pan: 'FGUST6789S', ctc: 420000, pf: true, esi: true, branchId: IDS.brHO, uan: '100100000006', bankDetail: { accountNumber: '001405098765' } },
  { id: IDS.eAnil, code: 'EMP-007', name: 'Anil Patil', department: 'Accounts', designation: 'Junior Accountant', pan: 'GHVTU7890T', ctc: 300000, pf: true, esi: true, branchId: IDS.brHO, uan: '100100000007', bankDetail: { accountNumber: '1234567890123' } },
  { id: IDS.eSunita, code: 'EMP-008', name: 'Sunita More', department: 'Sales', designation: 'Sales Executive', pan: 'HIWUV8901U', ctc: 540000, pf: true, esi: true, branchId: IDS.brHO, leaving: '2026-06-30', uan: '100100000008', bankDetail: { accountNumber: '50100011122233' } },
];

export function seedPayroll(): Partial<DB> {
  const S = DEFAULT_PAYROLL_SETTINGS;
  const structures: SalaryStructure[] = SEED_EMPLOYEES.map((e, i) => {
    const components = standardComponents(e.ctc, S);
    const a = structureAmounts(components);
    const regime: 'Old' | 'New' = e.ctc >= 1200000 ? 'Old' : 'New';
    const pfAnnual = Math.min(a.basic, S.pfWageCeiling) * 0.12 * 12;
    const tdsMonthly = estimateMonthlyTds(a.gross, regime, pfAnnual);
    const employerPf = e.pf ? r2((Math.min(a.basic, S.pfWageCeiling) * S.pfEmployerPct) / 100) : 0;
    const employerEsi = e.esi && a.gross <= S.esiWageCeiling ? Math.ceil((a.gross * S.esiEmployerPct) / 100) : 0;
    return rec<SalaryStructure>(`ss_${String(i + 1).padStart(3, '0')}`, {
      companyId: co, employeeId: e.id, employeeName: e.name, employeeCode: e.code, effectiveFrom: '2026-04-01', effectiveTo: e.leaving, structureVersion: 1, components,
      pf: e.pf, esi: e.esi, pt: true, taxRegime: regime, tdsMonthly, monthlyGross: a.gross, monthlyCtc: r2(a.gross + employerPf + employerEsi), annualCtc: e.ctc,
      status: 'Active', notes: 'Annual revision effective FY 2026-27', createdAt: '2026-03-28T10:00:00.000Z', updatedAt: '2026-03-28T10:00:00.000Z',
    });
  });

  const structureOf = (empId: string) => structures.find((s) => s.employeeId === empId)!;
  const activeIn = (period: string) => SEED_EMPLOYEES.filter((e) => !e.leaving || e.leaving.slice(0, 7) >= period);

  // ── Loans ────────────────────────────────────────────────────────────────
  const mkSchedule = (start: string, principal: number, emi: number, months: number, recoveredThrough: string) => {
    const rows: Loan['schedule'] = [];
    let bal = principal;
    let [y, m] = start.split('-').map((x) => parseInt(x, 10));
    for (let i = 0; i < months; i++) {
      const period = `${y}-${String(m).padStart(2, '0')}`;
      const p = Math.min(emi, bal);
      bal = r2(bal - p);
      rows.push({ period, emi: p, principal: p, interest: 0, balance: bal, status: period <= recoveredThrough ? 'Recovered' : 'Pending' });
      m++; if (m > 12) { m = 1; y++; }
    }
    return rows;
  };
  const loans: Loan[] = [
    (() => { const sch = mkSchedule('2026-05', 60000, 5000, 12, '2026-08'); return rec<Loan>('loan_001', { companyId: co, number: 'LN-001', employeeId: IDS.eSuresh, employeeName: 'Suresh Kumar', type: 'Loan', principal: 60000, interestPct: 0, emi: 5000, months: 12, startPeriod: '2026-05', balance: 40000, recovered: 20000, status: 'Active', schedule: sch, disbursedOn: '2026-04-20', purpose: 'Medical emergency — family', journalNumber: 'JV/26-27/0088' }); })(),
    (() => { const sch = mkSchedule('2026-07', 30000, 10000, 3, '2026-08'); return rec<Loan>('loan_002', { companyId: co, number: 'ADV-002', employeeId: IDS.eAnita, employeeName: 'Anita Rao', type: 'Advance', principal: 30000, interestPct: 0, emi: 10000, months: 3, startPeriod: '2026-07', balance: 10000, recovered: 20000, status: 'Active', schedule: sch, disbursedOn: '2026-06-25', purpose: 'Festival advance', journalNumber: 'JV/26-27/0164' }); })(),
  ];
  const loanEmiFor = (empId: string, period: string) => loans.filter((l) => l.employeeId === empId).reduce((s, l) => s + (l.schedule.find((r) => r.period === period)?.emi ?? 0), 0);

  // ── Inputs (Apr–Aug locked, Sep approved for calculation) ────────────────
  const inputs: PayrollInput[] = [];
  const periods = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
  periods.forEach((period, pi) => {
    activeIn(period).forEach((e, ei) => {
      const lop = period === '2026-09' && e.id === IDS.eAnil ? 2 : period === '2026-06' && e.id === IDS.eSuresh ? 1 : 0;
      const reimb = period === '2026-09' && e.id === IDS.eVikram ? 8400 : 0;
      inputs.push(rec<PayrollInput>(`pin_${period.replace('-', '')}_${e.code.slice(-3)}`, {
        companyId: co, period, employeeId: e.id, employeeName: e.name, workingDays: 30, lopDays: lop, overtimeHours: period === '2026-09' && e.id === IDS.eSuresh ? 6 : 0, overtimeAmount: period === '2026-09' && e.id === IDS.eSuresh ? 1500 : 0,
        reimbursements: reimb, reimbursementClaimIds: reimb ? ['exp_0022'] : [], bonus: period === '2026-09' && e.id === IDS.ePriya ? 15000 : 0, arrears: 0,
        loanEmi: loanEmiFor(e.id, period), loanId: loans.find((l) => l.employeeId === e.id && l.schedule.some((r) => r.period === period))?.id, otherDeductions: 0,
        status: period === '2026-09' ? 'Approved' : 'Locked', approvedBy: 'Meena Joshi', approvedAt: `${period}-25T09:00:00.000Z`, lockedByRunId: period === '2026-09' ? undefined : `pr_run_${String(pi + 1).padStart(4, '0')}`,
        createdAt: `${period}-20T09:00:00.000Z`, updatedAt: `${period}-25T09:00:00.000Z`,
      }));
      void ei;
    });
  });

  // ── Runs ─────────────────────────────────────────────────────────────────
  const runs: PayrollRun[] = [];
  const journals: Journal[] = [];
  const payslips: Payslip[] = [];
  periods.forEach((period, pi) => {
    const n = pi + 1;
    const id = `pr_run_${String(n).padStart(4, '0')}`;
    const number = `PR-RUN-${String(n).padStart(4, '0')}`;
    const emps = activeIn(period);
    const lines: PayrollLine[] = emps.map((e) => computeLine(e, structureOf(e.id), inputs.find((i) => i.employeeId === e.id && i.period === period), S, departmentDimension(e.department)));
    const totals = sumLines(lines);
    const posted = period !== '2026-09';
    const date = `${period}-${String(daysInPeriod(period)).padStart(2, '0')}`;
    if (posted) {
      const jid = `jv_pay_${period.replace('-', '_')}`;
      const j = seedJournal(jid, `JV/26-27/03${String(50 + n).padStart(2, '0')}`, date, 'Payroll Run', id, number, `Payroll ${period} · ${emps.length} employees`, payrollPostingLines({ lines, totals, period }), 'Meena Joshi');
      journals.push(j);
      lines.forEach((l) => { l.payslipId = `ps_${period.replace('-', '')}_${l.employeeCode.slice(-3)}`; });
      runs.push(rec<PayrollRun>(id, { companyId: co, number, period, fy: '2026-27', type: 'Regular', branchId: IDS.brHO, status: 'Posted', employeeCount: emps.length, lines, totals, journalId: j.id, journalNumber: j.number, calculatedAt: `${period}-26T09:00:00.000Z`, finalizedAt: `${period}-28T09:00:00.000Z`, finalizedBy: 'Meena Joshi', postedAt: `${date}T10:00:00.000Z`, postedBy: 'Rahul Kumar', paymentDate: date, bankFileGeneratedAt: `${date}T10:30:00.000Z`, correlationId: `corr_${id.toUpperCase()}`, createdAt: `${period}-26T09:00:00.000Z`, updatedAt: `${date}T10:30:00.000Z` }));
      emps.forEach((e) => {
        const l = lines.find((x) => x.employeeId === e.id)!;
        payslips.push(rec<Payslip>(l.payslipId!, { companyId: co, number: `PS/${period}/${e.code}`, runId: id, runNumber: number, period, employeeId: e.id, employeeName: e.name, employeeCode: e.code, department: e.department, designation: e.designation, pan: e.pan, uan: e.uan, bankMasked: l.bankMasked, line: l, status: period === '2026-08' ? 'Emailed' : 'Generated', emailedAt: period === '2026-08' ? '2026-09-01T09:00:00.000Z' : undefined, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z` }));
      });
    } else {
      runs.push(rec<PayrollRun>(id, { companyId: co, number, period, fy: '2026-27', type: 'Regular', branchId: IDS.brHO, status: 'Calculated', employeeCount: emps.length, lines, totals, calculatedAt: '2026-09-12T11:00:00.000Z', correlationId: `corr_${id.toUpperCase()}`, createdAt: '2026-09-12T11:00:00.000Z', updatedAt: '2026-09-12T11:00:00.000Z' }));
    }
  });

  return {
    [C.salaryStructures]: structures as any,
    [C.payrollInputs]: inputs as any,
    [C.payrollRuns]: runs as any,
    [C.payslips]: payslips as any,
    [C.loans]: loans as any,
    [C.journals]: journals as any,
  };
}

export { SEED_NOW };
