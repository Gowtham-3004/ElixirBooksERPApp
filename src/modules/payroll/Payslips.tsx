// Payslips (FR-PAY-003): register by period/employee, printable payslip, download all (CSV), email (notification).
import { useMemo, useState } from 'react';
import { C, db, nav, useSession, useCollection, useRoute, engine } from '../../store';
import { RegisterPage, Badge, Button, Drawer, useToast, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtDateTime, toCSV, downloadText, amountInWords } from '../../lib/format';
import type { Payslip } from './types';
import { periodLabel } from './calc';
import { useMask } from './Employees';

export function PayslipsPage({ id }: { id?: string }) {
  const s = useSession();
  const route = useRoute();
  const toast = useToast();
  const { canView, money } = useMask();
  const all = useCollection<Payslip>(C.payslips).filter((p) => !p.companyId || p.companyId === s.state.companyId);
  const [open, setOpen] = useState<Payslip | null>(() => (id ? db.find<Payslip>(C.payslips, id) ?? null : null));
  const rows = useMemo(() => all.filter((p) => (!route.params.employee || p.employeeId === route.params.employee) && (!route.params.run || p.runId === route.params.run)).sort((a, b) => b.period.localeCompare(a.period) || a.employeeName.localeCompare(b.employeeName)), [all, route.params.employee, route.params.run]);
  const periods = Array.from(new Set(all.map((p) => p.period))).sort().reverse();
  const isOwn = (p: Payslip) => db.find<any>(C.employees, p.employeeId)?.userId === s.user?.id;
  const visible = canView ? rows : rows.filter(isOwn);
  const email = (ps: Payslip[]) => { db.transaction(() => ps.forEach((p) => { db.update<Payslip>(C.payslips, p.id, { status: 'Emailed', emailedAt: new Date().toISOString() }); engine.notify({ type: 'system', title: `Payslip ${periodLabel(p.period)} sent to ${p.employeeName}`, body: `${p.number} · net ${fmtMoney(p.line.net, s.currency)}`, link: `payroll/payslips/${p.id}`, channel: 'email', status: 'sent' }); })); engine.audit({ action: 'payroll.payslip.emailed', objectType: 'Payslip', detail: `${ps.length} payslips emailed`, sensitive: true }); toast.success(`${ps.length} payslip${ps.length === 1 ? '' : 's'} emailed`); };
  const downloadAll = (ps: Payslip[]) => { downloadText(`payslips-${ps[0]?.period ?? 'all'}.csv`, toCSV(ps.map((p) => ({ number: p.number, period: p.period, employee: p.employeeName, code: p.employeeCode, department: p.department, gross: p.line.gross, pf: p.line.pf, esi: p.line.esi, pt: p.line.pt, tds: p.line.tds, loan: p.line.loan, deductions: p.line.deductions, net: p.line.net, status: p.status })))); engine.audit({ action: 'payroll.payslip.export', objectType: 'Payslip', detail: `${ps.length} payslips exported`, sensitive: true }); };
  const cols: Column<Payslip>[] = [
    { key: 'employeeName', label: 'Employee', render: (p) => <div><div className="cell-primary">{p.employeeName}</div><div className="cell-secondary identifier">{p.employeeCode} · {p.department}</div></div>, sortable: true },
    { key: 'period', label: 'Month', render: (p) => <span>{periodLabel(p.period)}<div className="cell-secondary identifier">{p.runNumber}</div></span>, sortable: true },
    { key: 'gross', label: 'Gross', align: 'right', render: (p) => <span className="money">{money(p.line.gross)}</span>, total: (rs) => <span className="money">{money(rs.reduce((x, p) => x + p.line.gross, 0))}</span> },
    { key: 'deductions', label: 'Deductions', align: 'right', render: (p) => <span className="money" style={{ color: '#C0393F' }}>{money(p.line.deductions)}</span> },
    { key: 'net', label: 'Net', align: 'right', render: (p) => <span className="money" style={{ fontWeight: 600 }}>{money(p.line.net)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{money(rs.reduce((x, p) => x + p.line.net, 0))}</span> },
    { key: 'status', label: 'Status', render: (p) => <Badge status={p.status === 'Void' ? 'Cancelled' : p.status === 'Emailed' ? 'Sent' : p.status}>{p.status}</Badge> },
    { key: 'act', label: '', render: (p) => <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpen(p); }}>PDF</Button> },
  ];
  const emp = open ? db.find<any>(C.employees, open.employeeId) : undefined;
  const l = open?.line;
  return (
    <>
      <RegisterPage<Payslip> title="Payslips" subtitle={`${visible.length} payslips${route.params.employee ? ' · filtered by employee' : ''}${!canView ? ' · showing your own payslips only' : ''}`} rows={visible} columns={cols} entity="payslips" searchKeys={['employeeName', 'employeeCode', 'number']}
        actions={<><Button variant="secondary" onClick={() => downloadAll(visible.filter((p) => p.status !== 'Void'))} disabled={!visible.length}>Download all (CSV)</Button><Button variant="secondary" onClick={() => email(visible.filter((p) => p.status === 'Generated'))} disabled={!canView || !visible.some((p) => p.status === 'Generated')} reason={!canView ? 'Requires payroll permission' : undefined}>Email unsent</Button></>}
        tabs={[{ id: 'all', label: 'All' }, ...periods.slice(0, 4).map((p) => ({ id: p, label: periodLabel(p), filter: (x: Payslip) => x.period === p })), { id: 'void', label: 'Void', filter: (x) => x.status === 'Void' }]}
        filters={[{ key: 'employee', label: 'Employee', type: 'select', options: Array.from(new Map(all.map((p) => [p.employeeId, p.employeeName])).entries()).map(([v, l2]) => ({ value: v, label: l2 })) }]} applyFilter={(p, v) => !v.employee || p.employeeId === v.employee}
        onRowClick={setOpen} showTotals
        rowActions={(p) => [{ label: 'View / print', onClick: () => setOpen(p) }, { label: 'Email payslip', onClick: () => email([p]), disabled: p.status === 'Void' }, { label: 'Open run', onClick: () => nav.go(`payroll/runs/${p.runId}`) }]}
        emptyTitle="No payslips yet" emptyDescription="Payslips are generated when a payroll run is finalized." />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? `Payslip · ${periodLabel(open.period)}` : ''} subtitle={open?.number} width={760}
        footer={open && <><Button variant="ghost" onClick={() => setOpen(null)}>Close</Button><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={() => email([open])} disabled={open.status === 'Void'}>Email</Button><Button variant="primary" onClick={() => window.print()}>Print / PDF</Button></div></>}>
        {open && l && (
          <div className="print-sheet" style={{ width: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0A0A0A', paddingBottom: 10, marginBottom: 10 }}>
              <div><div style={{ fontSize: 16, fontWeight: 700 }}>{s.company?.legalName}</div><div>{s.company?.address.line1}, {s.company?.address.city} {s.company?.address.pin}</div></div>
              <div style={{ textAlign: 'right' }}><div style={{ fontSize: 14, fontWeight: 700 }}>PAYSLIP — {periodLabel(open.period).toUpperCase()}</div><div>{open.number}</div>{open.status === 'Void' && <div style={{ color: '#C0393F', fontWeight: 700 }}>VOID — {open.voidReason}</div>}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12, fontSize: 11 }}>
              <div><div><strong>{open.employeeName}</strong> · {open.employeeCode}</div><div>{open.designation} · {open.department}</div><div>PAN {canView ? open.pan ?? '—' : '••••'} · UAN {open.uan ?? '—'}</div><div>Bank {open.bankMasked ?? '—'}{emp?.bankDetail?.bankName ? ' · ' + emp.bankDetail.bankName : ''}</div></div>
              <div style={{ textAlign: 'right' }}><div>Working days {l.workingDays} · paid days {l.paidDays} · LOP {l.lopDays}</div><div>Run {open.runNumber}</div><div>Generated {fmtDateTime(open.createdAt)}</div>{open.emailedAt && <div>Emailed {fmtDateTime(open.emailedAt)}</div>}</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <table><thead><tr><th style={{ textAlign: 'left' }}>Earnings</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>
                {[['Basic salary', l.basic], ['House rent allowance', l.hra], ['Special allowance', l.special], ['Other allowances', l.otherEarnings], ['Overtime', l.overtime], ['Bonus / arrears', l.bonus + l.arrears], ['Reimbursements', l.reimbursements]].filter(([, v]) => Number(v) > 0).map(([k, v]) => <tr key={String(k)}><td>{k}</td><td style={{ textAlign: 'right' }}>{fmtMoney(Number(v), s.currency)}</td></tr>)}
                <tr style={{ fontWeight: 700 }}><td>Gross earnings</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.gross, s.currency)}</td></tr>
              </tbody></table>
              <table><thead><tr><th style={{ textAlign: 'left' }}>Deductions</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead><tbody>
                {[['Provident fund', l.pf], ['ESI', l.esi], ['Professional tax', l.pt], ['Income tax (TDS)', l.tds], ['Loan / advance', l.loan], ['Other deductions', l.otherDeductions]].filter(([, v]) => Number(v) > 0).map(([k, v]) => <tr key={String(k)}><td>{k}</td><td style={{ textAlign: 'right' }}>{fmtMoney(Number(v), s.currency)}</td></tr>)}
                <tr style={{ fontWeight: 700 }}><td>Total deductions</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.deductions, s.currency)}</td></tr>
              </tbody></table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, padding: '8px 10px', background: '#F9FBFC', border: '1px solid #DADCE0', fontWeight: 700, fontSize: 13 }}><span>Net pay</span><span>{fmtMoney(l.net, s.currency)}</span></div>
            <div style={{ fontSize: 10, marginTop: 4 }}>{amountInWords(l.net, s.currency)}</div>
            <div style={{ fontSize: 10, marginTop: 8, color: '#5F6368' }}>Employer contributions (not part of net pay): PF {fmtMoney(l.employerPf, s.currency)} · ESI {fmtMoney(l.employerEsi, s.currency)} · This is a system-generated payslip; no signature required. Period {fmtDate(open.period + '-01')}.</div>
          </div>
        )}
      </Drawer>
    </>
  );
}
