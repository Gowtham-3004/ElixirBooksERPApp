// Pure payroll calculations — no store imports so seed files can reuse them (FR-PAY-002).
import type { PayrollSettings } from '../../store/types';
import type { PayrollInput, PayrollLine, PayrollTotals, SalaryComponent, SalaryStructure } from './types';

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  pfEmployeePct: 12,
  pfEmployerPct: 12,
  pfWageCeiling: 15000,
  esiEmployeePct: 0.75,
  esiEmployerPct: 3.25,
  esiWageCeiling: 21000,
  ptSlabs: [{ upTo: 7500, amount: 0 }, { upTo: 10000, amount: 175 }, { upTo: Infinity, amount: 200 }],
  payrollDay: 1,
  rounding: 'Nearest',
  workingDaysPerMonth: 30,
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function roundNet(n: number, mode: PayrollSettings['rounding']): number {
  if (mode === 'Nearest') return Math.round(n);
  if (mode === 'Down') return Math.floor(n);
  return r2(n);
}

/** Resolve a structure's components into monthly amounts (before proration). */
export function structureAmounts(components: SalaryComponent[]): { earnings: Record<string, number>; deductions: Record<string, number>; employer: Record<string, number>; basic: number; gross: number } {
  const basicComp = components.find((c) => c.code === 'BASIC');
  const basic = r2(basicComp?.value ?? 0);
  const earnings: Record<string, number> = {};
  let gross = 0;
  components.filter((c) => c.type === 'Earning').forEach((c) => {
    const amt = c.basis === 'PctOfBasic' ? r2((basic * c.value) / 100) : r2(c.value);
    earnings[c.code] = amt;
    gross += amt;
  });
  gross = r2(gross);
  const deductions: Record<string, number> = {};
  const employer: Record<string, number> = {};
  components.filter((c) => c.type !== 'Earning').forEach((c) => {
    const amt = c.basis === 'PctOfBasic' ? r2((basic * c.value) / 100) : c.basis === 'PctOfGross' ? r2((gross * c.value) / 100) : r2(c.value);
    if (c.type === 'Deduction') deductions[c.code] = amt; else employer[c.code] = amt;
  });
  return { earnings, deductions, employer, basic, gross };
}

export function ptFor(gross: number, settings: PayrollSettings): number {
  const slab = settings.ptSlabs.find((s) => gross <= s.upTo) ?? settings.ptSlabs[settings.ptSlabs.length - 1];
  return slab?.amount ?? 0;
}

/** Statutory deductions for a (prorated) gross/basic. */
export function statutory(basic: number, gross: number, opts: { pf: boolean; esi: boolean; pt: boolean }, settings: PayrollSettings) {
  const pfWage = Math.min(basic, settings.pfWageCeiling > 0 ? settings.pfWageCeiling : basic);
  const pf = opts.pf ? r2((pfWage * settings.pfEmployeePct) / 100) : 0;
  const employerPf = opts.pf ? r2((pfWage * settings.pfEmployerPct) / 100) : 0;
  const esiApplies = opts.esi && gross <= settings.esiWageCeiling;
  const esi = esiApplies ? Math.ceil((gross * settings.esiEmployeePct) / 100) : 0;
  const employerEsi = esiApplies ? Math.ceil((gross * settings.esiEmployerPct) / 100) : 0;
  const pt = opts.pt ? ptFor(gross, settings) : 0;
  return { pf, employerPf, esi, employerEsi, pt, esiApplies };
}

/** Simple monthly TDS estimate (section 192, new regime slabs on annual taxable = gross×12 − 75k std deduction). */
export function estimateMonthlyTds(monthlyGross: number, regime: 'Old' | 'New', pfAnnual = 0): number {
  const annual = monthlyGross * 12;
  const taxable = Math.max(0, regime === 'New' ? annual - 75000 : annual - 50000 - Math.min(150000, pfAnnual));
  const slabs = regime === 'New'
    ? [[300000, 0], [700000, 5], [1000000, 10], [1200000, 15], [1500000, 20], [Infinity, 30]]
    : [[250000, 0], [500000, 5], [1000000, 20], [Infinity, 30]];
  let tax = 0, prev = 0;
  for (const [upTo, pct] of slabs) {
    if (taxable > prev) tax += (Math.min(taxable, upTo) - prev) * (pct / 100);
    prev = upTo;
    if (taxable <= upTo) break;
  }
  if (regime === 'New' && taxable <= 700000) tax = 0;
  if (regime === 'Old' && taxable <= 500000) tax = 0;
  tax = tax * 1.04; // cess
  return Math.round(tax / 12);
}

export interface EmployeeLike { id: string; name: string; code: string; department: string; branchId?: string; costCentreId?: string; bankDetail?: { accountNumber: string } }

/** Compute one employee's payroll line from structure + approved input (prorates LOP). */
export function computeLine(emp: EmployeeLike, structure: SalaryStructure, input: PayrollInput | undefined, settings: PayrollSettings, departmentDimId?: string): PayrollLine {
  const base = structureAmounts(structure.components);
  const workingDays = input?.workingDays ?? settings.workingDaysPerMonth;
  const lopDays = input?.lopDays ?? 0;
  const paidDays = Math.max(0, workingDays - lopDays);
  const factor = workingDays > 0 ? paidDays / workingDays : 1;
  const earnings: Record<string, number> = {};
  Object.entries(base.earnings).forEach(([k, v]) => { earnings[k] = r2(v * factor); });
  const basic = earnings.BASIC ?? 0;
  const hra = earnings.HRA ?? 0;
  const special = earnings.SPECIAL ?? 0;
  const otherEarnings = r2(Object.entries(earnings).filter(([k]) => !['BASIC', 'HRA', 'SPECIAL'].includes(k)).reduce((s, [, v]) => s + v, 0));
  const overtime = r2(input?.overtimeAmount ?? 0);
  const reimbursements = r2(input?.reimbursements ?? 0);
  const bonus = r2(input?.bonus ?? 0);
  const arrears = r2(input?.arrears ?? 0);
  const structGross = r2(basic + hra + special + otherEarnings);
  const gross = r2(structGross + overtime + bonus + arrears + reimbursements);
  const st = statutory(basic, structGross + overtime + bonus + arrears, { pf: structure.pf, esi: structure.esi, pt: structure.pt }, settings);
  const tds = r2((structure.tdsMonthly ?? 0) * (factor < 1 ? factor : 1));
  const loan = r2(input?.loanEmi ?? 0);
  const otherDeductions = r2(input?.otherDeductions ?? 0);
  const deductions = r2(st.pf + st.esi + st.pt + tds + loan + otherDeductions);
  const net = roundNet(gross - deductions, settings.rounding);
  return {
    employeeId: emp.id,
    employeeName: emp.name,
    employeeCode: emp.code,
    department: emp.department,
    departmentDimId,
    costCentreId: emp.costCentreId,
    branchId: emp.branchId,
    structureId: structure.id,
    workingDays,
    paidDays,
    lopDays,
    earnings,
    basic, hra, special, otherEarnings, overtime, reimbursements, bonus, arrears, gross,
    pf: st.pf, esi: st.esi, pt: st.pt, tds, loan, otherDeductions, deductions, net,
    employerPf: st.employerPf, employerEsi: st.employerEsi,
    bankMasked: emp.bankDetail?.accountNumber ? '•••• ' + emp.bankDetail.accountNumber.slice(-4) : undefined,
    note: !st.esiApplies && structure.esi ? 'ESI not applicable — gross above ceiling' : undefined,
  };
}

export function sumLines(lines: PayrollLine[]): PayrollTotals {
  const t: PayrollTotals = { basic: 0, hra: 0, special: 0, otherEarnings: 0, overtime: 0, reimbursements: 0, bonus: 0, arrears: 0, gross: 0, pf: 0, esi: 0, pt: 0, tds: 0, loan: 0, otherDeductions: 0, deductions: 0, net: 0, employerPf: 0, employerEsi: 0, employerTotal: 0 };
  lines.forEach((l) => {
    (Object.keys(t) as (keyof PayrollTotals)[]).forEach((k) => { if (k !== 'employerTotal') t[k] = r2(t[k] + ((l as any)[k] ?? 0)); });
  });
  t.employerTotal = r2(t.employerPf + t.employerEsi);
  return t;
}

/** Build a standard structure for an annual CTC: Basic 50% · HRA 20% · Special 30% (less employer PF) — used by seed and the structure form. */
export function standardComponents(annualCtc: number, settings: PayrollSettings): SalaryComponent[] {
  const monthly = annualCtc / 12;
  const basic = Math.round(monthly * 0.5);
  const hra = Math.round(basic * 0.4);
  const conveyance = 1600;
  const medical = 1250;
  const employerPf = Math.round((Math.min(basic, settings.pfWageCeiling) * settings.pfEmployerPct) / 100);
  const special = Math.max(0, Math.round(monthly - basic - hra - conveyance - medical - employerPf));
  return [
    { code: 'BASIC', name: 'Basic Salary', type: 'Earning', basis: 'Amount', value: basic, taxable: true },
    { code: 'HRA', name: 'House Rent Allowance', type: 'Earning', basis: 'PctOfBasic', value: 40, taxable: true },
    { code: 'CONV', name: 'Conveyance Allowance', type: 'Earning', basis: 'Amount', value: conveyance, taxable: false },
    { code: 'MEDICAL', name: 'Medical Allowance', type: 'Earning', basis: 'Amount', value: medical, taxable: true },
    { code: 'SPECIAL', name: 'Special Allowance', type: 'Earning', basis: 'Amount', value: special, taxable: true },
    { code: 'PF_EE', name: 'Provident Fund (Employee)', type: 'Deduction', basis: 'PctOfBasic', value: settings.pfEmployeePct },
    { code: 'ESI_EE', name: 'ESI (Employee)', type: 'Deduction', basis: 'PctOfGross', value: settings.esiEmployeePct },
    { code: 'PF_ER', name: 'Provident Fund (Employer)', type: 'EmployerContribution', basis: 'PctOfBasic', value: settings.pfEmployerPct },
    { code: 'ESI_ER', name: 'ESI (Employer)', type: 'EmployerContribution', basis: 'PctOfGross', value: settings.esiEmployerPct },
  ];
}

/** CTC preview for a structure. */
export function ctcPreview(components: SalaryComponent[], opts: { pf: boolean; esi: boolean; pt: boolean; regime: 'Old' | 'New' }, settings: PayrollSettings) {
  const a = structureAmounts(components);
  const st = statutory(a.basic, a.gross, opts, settings);
  const tds = estimateMonthlyTds(a.gross, opts.regime, st.pf * 12);
  const deductions = r2(st.pf + st.esi + st.pt + tds);
  const employer = r2(st.employerPf + st.employerEsi);
  return { ...a, ...st, tds, deductions, net: roundNet(a.gross - deductions, settings.rounding), employer, monthlyCtc: r2(a.gross + employer), annualCtc: r2((a.gross + employer) * 12) };
}

export const QUARTER_OF = (period: string): string => {
  const m = parseInt(period.slice(5, 7), 10);
  return m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 && m <= 12 ? 'Q3' : 'Q4';
};

export function periodLabel(code: string): string {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = code.split('-');
  return `${M[parseInt(m, 10) - 1]} ${y}`;
}

export function nextPeriod(code: string): string {
  const [y, m] = code.split('-').map((x) => parseInt(x, 10));
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function daysInPeriod(code: string): number {
  const [y, m] = code.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m, 0).getDate();
}
