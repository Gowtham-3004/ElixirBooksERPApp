// Statutory summaries (FR-PAY-003): PF ECR, ESI, PT, TDS 24Q per period/quarter with due dates, filed status, mark filed / download.
// Settings: PF/ESI/PT rates & slabs, payroll day, rounding (company.defaults.payroll).
import { useMemo, useState } from 'react';
import { C, db, engine, useSession, useCollection } from '../../store';
import { Badge, Button, Card, NumberField, MoneyField, SelectField, useToast, KV, DataTable, ScopeLine } from '../../components/ui';
import { fmtMoney, fmtDate, toCSV, downloadText } from '../../lib/format';
import type { PayrollRun } from './types';
import type { StatutoryReturn } from '../taxation/types';
import { periodLabel } from './calc';
import { payrollSettings, savePayrollSettings } from './actions';
import { useMask } from './Employees';

const DUE: Record<string, (period: string) => string> = {
  PF: (p) => nextMonthDay(p, 15), ESI: (p) => nextMonthDay(p, 15), PT: (p) => nextMonthDay(p, 30), TDS: (p) => nextMonthDay(p, 7),
};
function nextMonthDay(period: string, day: number): string { const [y, m] = period.split('-').map((x) => parseInt(x, 10)); const d = new Date(y, m, 1); const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`; }

export function StatutoryPage() {
  const s = useSession();
  const toast = useToast();
  const { money } = useMask();
  const runs = useCollection<PayrollRun>(C.payrollRuns).filter((r) => r.status === 'Posted' && !r.reversalOfId && (!r.companyId || r.companyId === s.state.companyId));
  const filings = useCollection<StatutoryReturn>(C.gstReturns).filter((r) => ['PF-ECR', 'ESI', 'PT', '24Q'].includes(r.type));
  const fy = s.state.fy ?? '2026-27';
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const byPeriod = new Map<string, PayrollRun[]>();
    runs.forEach((r) => byPeriod.set(r.period, [...(byPeriod.get(r.period) ?? []), r]));
    const out: { id: string; kind: 'PF' | 'ESI' | 'PT' | 'TDS'; type: StatutoryReturn['type']; label: string; period: string; employee: number; employer: number; total: number; due: string; employees: number; filing?: StatutoryReturn }[] = [];
    Array.from(byPeriod.entries()).sort((a, b) => b[0].localeCompare(a[0])).forEach(([period, rs]) => {
      const t = (k: keyof PayrollRun['totals']) => rs.reduce((x, r) => x + (r.totals[k] as number), 0);
      const emps = new Set(rs.flatMap((r) => r.lines.map((l) => l.employeeId))).size;
      const mk = (kind: 'PF' | 'ESI' | 'PT' | 'TDS', type: StatutoryReturn['type'], label: string, employee: number, employer: number) => out.push({ id: `${kind}-${period}`, kind, type, label, period, employee, employer, total: employee + employer, due: DUE[kind](period), employees: emps, filing: filings.find((f) => f.type === type && f.period === period) });
      mk('PF', 'PF-ECR', 'Provident Fund (ECR)', t('pf'), t('employerPf'));
      mk('ESI', 'ESI', 'ESI contribution', t('esi'), t('employerEsi'));
      mk('PT', 'PT', 'Professional tax (MH)', t('pt'), 0);
      mk('TDS', '24Q', 'TDS on salary (192 / 24Q)', t('tds'), 0);
    });
    return out.filter((r) => !q || r.kind === q);
  }, [runs, filings, q]);
  const markFiled = (r: (typeof rows)[number]) => {
    db.insert<StatutoryReturn>(C.gstReturns, { type: r.type, period: r.period, fy, version: 1, status: 'Filed', sections: [], totals: { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, tax: r.total }, generatedAt: new Date().toISOString(), generatedBy: s.user?.name ?? 'system', filedAt: new Date().toISOString(), filedBy: s.user?.name, arn: `${r.type}-${r.period}-${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`, dueDate: r.due });
    engine.audit({ action: 'payroll.statutory.filed', objectType: r.type, objectNumber: r.period, detail: `${r.label} · ${fmtMoney(r.total)}` });
    toast.success(`${r.label} for ${periodLabel(r.period)} marked filed`);
  };
  const download = (r: (typeof rows)[number]) => {
    const lines = runs.filter((x) => x.period === r.period).flatMap((x) => x.lines);
    const data = lines.map((l) => ({ employee: l.employeeName, code: l.employeeCode, uan: db.find<any>(C.employees, l.employeeId)?.uan ?? '', gross: l.gross, employeeContribution: r.kind === 'PF' ? l.pf : r.kind === 'ESI' ? l.esi : r.kind === 'PT' ? l.pt : l.tds, employerContribution: r.kind === 'PF' ? l.employerPf : r.kind === 'ESI' ? l.employerEsi : 0 })).filter((x) => x.employeeContribution + x.employerContribution > 0);
    downloadText(`${r.type}-${r.period}.csv`, toCSV(data));
    engine.audit({ action: 'payroll.statutory.export', objectType: r.type, objectNumber: r.period, detail: `${data.length} employees`, sensitive: true });
  };
  const quarters = [['Q1', 'Apr–Jun'], ['Q2', 'Jul–Sep'], ['Q3', 'Oct–Dec'], ['Q4', 'Jan–Mar']];
  const qtd = (kind: 'PF' | 'ESI' | 'PT' | 'TDS', qq: string) => rows.filter((r) => r.kind === kind && quarterOf(r.period) === qq).reduce((x, r) => x + r.total, 0);
  return (
    <div className="page">
      <div className="page-header"><div><h1 className="page-title">Statutory summary</h1><div className="page-subtitle"><ScopeLine extra={`FY ${fy} · from posted payroll runs`} /></div></div><div><label className="field-label">Kind</label><select className="field-input sm" value={q} onChange={(e) => setQ(e.target.value)}><option value="">All</option><option value="PF">PF</option><option value="ESI">ESI</option><option value="PT">PT</option><option value="TDS">TDS 24Q</option></select></div></div>
      <div className="grid-4">
        {quarters.map(([qq, l]) => <div key={qq} className="kpi-tile"><span className="section-label">{qq} · {l}</span><div style={{ fontSize: 13, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>{(['PF', 'ESI', 'PT', 'TDS'] as const).map((k) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--ink-3)' }}>{k}</span><span className="money" style={{ fontWeight: 600 }}>{money(qtd(k, qq))}</span></div>)}</div></div>)}
      </div>
      <DataTable rows={rows} dense columns={[
        { key: 'label', label: 'Return', render: (r) => <div><div className="cell-primary">{r.label}</div><div className="cell-secondary">{periodLabel(r.period)} · {r.employees} employees</div></div> },
        { key: 'employee', label: 'Employee deduction', align: 'right', render: (r) => <span className="money">{money(r.employee)}</span> },
        { key: 'employer', label: 'Employer contribution', align: 'right', render: (r) => <span className="money">{r.employer ? money(r.employer) : '—'}</span> },
        { key: 'total', label: 'Payable', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{money(r.total)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{money(rs.reduce((x, r) => x + r.total, 0))}</span> },
        { key: 'due', label: 'Due date', render: (r) => <span style={{ color: !r.filing && r.due < new Date().toISOString().slice(0, 10) ? 'var(--danger)' : undefined }}>{fmtDate(r.due)}</span> },
        { key: 'status', label: 'Status', render: (r) => <Badge status={r.filing ? 'Filed' : 'Returned'}>{r.filing ? `Filed ${fmtDate(r.filing.filedAt)}` : 'Pending'}</Badge> },
        { key: 'act', label: '', render: (r) => <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}><Button size="sm" variant="secondary" onClick={() => download(r)}>Download</Button>{!r.filing && <Button size="sm" variant="primary" onClick={() => markFiled(r)}>Mark filed</Button>}</div> },
      ]} showTotals emptyTitle="No posted payroll runs" emptyDescription="Statutory summaries are built from posted runs." />
    </div>
  );
}

function quarterOf(period: string): string { const m = parseInt(period.slice(5, 7), 10); return m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4'; }

export function PayrollSettingsPage() {
  const s = useSession();
  const toast = useToast();
  const [f, setF] = useState(() => payrollSettings());
  const canEdit = s.can('payroll.*') || s.isTenantOwner;
  const save = () => { savePayrollSettings(f); toast.success('Payroll settings saved'); };
  return (
    <div className="page">
      <div className="page-header"><div><h1 className="page-title">Payroll settings</h1><div className="page-subtitle">Statutory rates & slabs · payroll calendar · rounding · apply from the next calculation</div></div><Button variant="primary" onClick={save} disabled={!canEdit} reason={!canEdit ? 'Requires payroll admin' : undefined}>Save settings</Button></div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="Provident Fund">
          <div className="grid-2"><NumberField label="Employee %" value={f.pfEmployeePct} onChange={(v) => setF({ ...f, pfEmployeePct: v })} suffix="%" /><NumberField label="Employer %" value={f.pfEmployerPct} onChange={(v) => setF({ ...f, pfEmployerPct: v })} suffix="%" /><MoneyField label="Wage ceiling (basic)" value={f.pfWageCeiling} onChange={(v) => setF({ ...f, pfWageCeiling: v })} help="0 = no ceiling" /></div>
        </Card>
        <Card title="ESI">
          <div className="grid-2"><NumberField label="Employee %" value={f.esiEmployeePct} onChange={(v) => setF({ ...f, esiEmployeePct: v })} suffix="%" /><NumberField label="Employer %" value={f.esiEmployerPct} onChange={(v) => setF({ ...f, esiEmployerPct: v })} suffix="%" /><MoneyField label="Gross ceiling" value={f.esiWageCeiling} onChange={(v) => setF({ ...f, esiWageCeiling: v })} help="ESI applies when monthly gross ≤ ceiling" /></div>
        </Card>
        <Card title="Professional tax slabs (Maharashtra)">
          <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Gross up to</th><th className="right">PT / month</th><th /></tr></thead><tbody>
            {f.ptSlabs.map((sl, i) => <tr key={i}><td><input type="number" className="field-input grid num" value={isFinite(sl.upTo) ? sl.upTo : ''} placeholder="∞" onChange={(e) => setF({ ...f, ptSlabs: f.ptSlabs.map((x, k) => (k === i ? { ...x, upTo: e.target.value === '' ? Infinity : Number(e.target.value) } : x)) })} /></td><td className="right"><input type="number" className="field-input grid num" value={sl.amount} onChange={(e) => setF({ ...f, ptSlabs: f.ptSlabs.map((x, k) => (k === i ? { ...x, amount: Number(e.target.value) } : x)) })} /></td><td><Button size="sm" variant="ghost" onClick={() => setF({ ...f, ptSlabs: f.ptSlabs.filter((_, k) => k !== i) })}>✕</Button></td></tr>)}
          </tbody></table></div>
          <Button size="sm" variant="secondary" style={{ marginTop: 8 }} onClick={() => setF({ ...f, ptSlabs: [...f.ptSlabs.slice(0, -1), { upTo: 15000, amount: 200 }, f.ptSlabs[f.ptSlabs.length - 1]] })}>+ Add slab</Button>
        </Card>
        <Card title="Calendar & rounding">
          <div className="grid-2"><NumberField label="Payroll day (of following month)" value={f.payrollDay} onChange={(v) => setF({ ...f, payrollDay: v })} decimals={0} min={1} max={28} /><NumberField label="Working days per month" value={f.workingDaysPerMonth} onChange={(v) => setF({ ...f, workingDaysPerMonth: v })} decimals={0} min={20} max={31} /><SelectField label="Net pay rounding" value={f.rounding} onChange={(v) => setF({ ...f, rounding: v as any })} options={[{ value: 'Nearest', label: 'Nearest rupee' }, { value: 'Down', label: 'Round down' }, { value: 'None', label: 'No rounding (paise)' }]} /></div>
          <KV items={[{ k: 'Ledger accounts', v: '5100 salaries (Department dim) · 5110 employer PF/ESI · 2320 PF · 2321 ESI · 2322 PT · 2310 TDS · 2330 salaries payable · 1600 loans' }, { k: 'Confidentiality', v: 'Amounts masked without payroll.view; reveals audited' }]} />
        </Card>
      </div>
    </div>
  );
}
