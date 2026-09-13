import { useState } from 'react';
import { PlusIcon, SearchIcon, DownloadIcon, MoreVertIcon } from '../components/Icons';

type SubView = 'employees' | 'payroll-run' | 'payslips' | 'statutory';
const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'employees', label: 'Employees' },
  { id: 'payroll-run', label: 'Payroll Runs' },
  { id: 'payslips', label: 'Payslips' },
  { id: 'statutory', label: 'Statutory Summary' },
];

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

const EMPLOYEES = [
  { id: 'EMP-001', name: 'Rahul Kumar', dept: 'Finance', designation: 'Finance Manager', pan: 'ABCPK1234N', doj: '01 Apr 2021', ctc: 1440000, status: 'Active', pf: true, esi: false },
  { id: 'EMP-002', name: 'Priya Mehta', dept: 'Sales', designation: 'Sales Manager', pan: 'BCQPM2345O', doj: '15 Jun 2022', ctc: 1200000, status: 'Active', pf: true, esi: false },
  { id: 'EMP-003', name: 'Vikram Singh', dept: 'Operations', designation: 'Operations Head', pan: 'CDRPS3456P', doj: '01 Jan 2020', ctc: 1800000, status: 'Active', pf: true, esi: false },
  { id: 'EMP-004', name: 'Anita Rao', dept: 'Admin', designation: 'Admin Executive', pan: 'DESQR4567Q', doj: '01 Mar 2023', ctc: 480000, status: 'Active', pf: true, esi: true },
  { id: 'EMP-005', name: 'Suresh Kumar', dept: 'Production', designation: 'Supervisor', pan: 'EFTRS5678R', doj: '01 Jul 2019', ctc: 360000, status: 'Active', pf: true, esi: true },
  { id: 'EMP-006', name: 'Meena Joshi', dept: 'HR', designation: 'HR Executive', pan: 'FGUST6789S', doj: '01 Sep 2022', ctc: 420000, status: 'Active', pf: true, esi: true },
  { id: 'EMP-007', name: 'Anil Patil', dept: 'Accounts', designation: 'Junior Accountant', pan: 'GHVTU7890T', doj: '15 Feb 2024', ctc: 300000, status: 'Probation', pf: true, esi: true },
  { id: 'EMP-008', name: 'Sunita More', dept: 'Sales', designation: 'Sales Executive', pan: 'HIWUV8901U', doj: '01 Dec 2021', ctc: 540000, status: 'Resigned', pf: true, esi: true },
];

function Employees() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Employees</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>8 employees · Total CTC: {fmt(6540000)}/yr</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />Add employee</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="Name, EMP ID, PAN…" /></div>
        <button className="btn-secondary btn-sm">All departments</button>
        <button className="btn-secondary btn-sm">Active</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Employee</th>
              <th>Department</th>
              <th>Designation</th>
              <th>PAN</th>
              <th>Date of Joining</th>
              <th className="right">Annual CTC</th>
              <th>PF</th>
              <th>ESI</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {EMPLOYEES.map((e) => (
              <tr key={e.id} style={{ cursor: 'pointer', opacity: e.status === 'Resigned' ? 0.55 : 1 }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#325CFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {e.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{e.name}</div>
                      <div className="cell-secondary identifier">{e.id}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{e.dept}</td>
                <td style={{ fontSize: 13 }}>{e.designation}</td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{e.pan}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{e.doj}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(e.ctc)}</span></td>
                <td style={{ fontSize: 12, color: e.pf ? '#12784E' : '#B0B5BF' }}>{e.pf ? '✓' : '—'}</td>
                <td style={{ fontSize: 12, color: e.esi ? '#12784E' : '#B0B5BF' }}>{e.esi ? '✓' : '—'}</td>
                <td>
                  <span className={`badge ${e.status === 'Active' ? 'badge-active' : e.status === 'Probation' ? 'badge-submitted' : 'badge-cancelled'}`}>
                    {e.status}
                  </span>
                </td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAYROLL_RUNS = [
  { id: 'PR-RUN-0006', month: 'Sep 2026', employees: 7, gross: 453250, deductions: 78420, net: 374830, status: 'Draft' },
  { id: 'PR-RUN-0005', month: 'Aug 2026', employees: 7, gross: 453250, deductions: 78420, net: 374830, status: 'Posted' },
  { id: 'PR-RUN-0004', month: 'Jul 2026', employees: 7, gross: 453250, deductions: 78420, net: 374830, status: 'Posted' },
  { id: 'PR-RUN-0003', month: 'Jun 2026', employees: 7, gross: 461750, deductions: 79320, net: 382430, status: 'Posted' },
  { id: 'PR-RUN-0002', month: 'May 2026', employees: 8, gross: 498250, deductions: 86120, net: 412130, status: 'Posted' },
  { id: 'PR-RUN-0001', month: 'Apr 2026', employees: 8, gross: 498250, deductions: 86120, net: 412130, status: 'Posted' },
];

function PayrollRun() {
  const [selected, setSelected] = useState<string | null>('PR-RUN-0006');
  const run = PAYROLL_RUNS.find(r => r.id === selected);

  const COMP = [
    { label: 'Basic Salary', amount: 270750, type: 'earning' },
    { label: 'HRA', amount: 108300, type: 'earning' },
    { label: 'Special Allowance', amount: 74200, type: 'earning' },
    { label: 'Gross Earnings', amount: 453250, type: 'total-earning' },
    { label: "Employer's PF (12%)", amount: 29124, type: 'deduction' },
    { label: "Employee's PF (12%)", amount: 29124, type: 'deduction' },
    { label: 'Professional Tax', amount: 2400, type: 'deduction' },
    { label: 'Income Tax (TDS)', amount: 17772, type: 'deduction' },
    { label: 'Total Deductions', amount: 78420, type: 'total-deduction' },
    { label: 'Net Payable', amount: 374830, type: 'net' },
  ];

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', gap: 0 }}>
      {/* Runs list */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #EAEAEA', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Payroll Runs</span>
          <button className="btn-primary btn-sm" style={{ gap: 5 }}><PlusIcon size={12} />Run</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {PAYROLL_RUNS.map((r) => (
            <div
              key={r.id}
              onClick={() => setSelected(r.id)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #F5F5F5',
                cursor: 'pointer',
                background: selected === r.id ? '#F2F7FF' : '#FFFFFF',
                borderLeft: selected === r.id ? '3px solid #325CFF' : '3px solid transparent',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.month}</span>
                <span className={`badge ${r.status === 'Posted' ? 'badge-posted' : 'badge-draft'}`}>{r.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5F6368' }}>
                <span>{r.employees} employees</span>
                <span className="money">{fmt(r.net)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Run detail */}
      {run && (
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 600 }}>{run.month} Payroll</h2>
              <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>{run.id} · {run.employees} employees</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {run.status === 'Draft' ? (
                <>
                  <button className="btn-secondary">Recalculate</button>
                  <button className="btn-primary">Finalize & Post</button>
                </>
              ) : (
                <>
                  <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Payslips</button>
                  <button className="btn-secondary">Bank file</button>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div className="card" style={{ padding: '16px 20px' }}>
              <div className="section-label" style={{ marginBottom: 8 }}>Summary</div>
              {COMP.map((c) => (
                <div
                  key={c.label}
                  className="ladder-row"
                  style={{
                    borderTop: (c.type === 'total-earning' || c.type === 'total-deduction' || c.type === 'net') ? '1px solid #EAEAEA' : 'none',
                    paddingTop: (c.type === 'total-earning' || c.type === 'total-deduction' || c.type === 'net') ? 8 : 4,
                    marginTop: (c.type === 'total-earning' || c.type === 'total-deduction' || c.type === 'net') ? 4 : 0,
                  }}
                >
                  <span className={c.type === 'net' ? 'ladder-label' : 'ladder-label'} style={{ fontSize: c.type === 'net' ? 14 : 11, color: c.type === 'net' ? '#0A0A0A' : '#5F6368', fontWeight: c.type === 'net' ? 600 : 500 }}>{c.label}</span>
                  <span className="ladder-value" style={{ fontSize: c.type === 'net' ? 18 : 13, fontWeight: c.type === 'net' ? 700 : 500, color: c.type === 'total-deduction' || c.type === 'deduction' ? '#C0393F' : c.type === 'net' ? '#0A0A0A' : '#0A0A0A' }}>
                    {c.type === 'deduction' ? `(${fmt(c.amount)})` : fmt(c.amount)}
                  </span>
                </div>
              ))}
            </div>

            <div className="card" style={{ padding: '16px 20px' }}>
              <div className="section-label" style={{ marginBottom: 12 }}>Statutory Contributions</div>
              {[
                { label: "Employer PF (12%)", amount: 29124, ledger: 'PF Liability A/c' },
                { label: "Employee PF (12%)", amount: 29124, ledger: 'PF Payable A/c' },
                { label: "ESI (3.25% + 0.75%)", amount: 4320, ledger: 'ESI Liability A/c' },
                { label: "Professional Tax", amount: 2400, ledger: 'PT Payable A/c' },
                { label: "Income Tax (TDS)", amount: 17772, ledger: 'TDS Payable A/c' },
              ].map((s) => (
                <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F5F5F5', fontSize: 13 }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: '#6E6E71', fontFeatureSettings: 'normal' }}>{s.ledger}</div>
                  </div>
                  <span className="money" style={{ fontWeight: 600, color: '#C0393F' }}>{fmt(s.amount)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #EAEAEA', fontSize: 13, fontWeight: 600 }}>Employee Breakdown</div>
            <table className="data-table dense">
              <thead><tr>
                <th>Employee</th><th className="right">Basic</th><th className="right">HRA</th><th className="right">Special</th>
                <th className="right">Gross</th><th className="right">PF</th><th className="right">TDS</th><th className="right">Net</th>
              </tr></thead>
              <tbody>
                {EMPLOYEES.filter(e => e.status !== 'Resigned').map((e) => {
                  const monthly = e.ctc / 12;
                  const basic = monthly * 0.5;
                  const hra = monthly * 0.2;
                  const special = monthly * 0.3;
                  const pf = basic * 0.12;
                  const tds = monthly * 0.05;
                  const net = monthly - pf - tds - 400;
                  return (
                    <tr key={e.id}>
                      <td style={{ fontSize: 13 }}>{e.name}</td>
                      <td className="right"><span className="money" style={{ fontSize: 12 }}>{fmt(basic)}</span></td>
                      <td className="right"><span className="money" style={{ fontSize: 12 }}>{fmt(hra)}</span></td>
                      <td className="right"><span className="money" style={{ fontSize: 12 }}>{fmt(special)}</span></td>
                      <td className="right"><span className="money" style={{ fontSize: 12, fontWeight: 600 }}>{fmt(monthly)}</span></td>
                      <td className="right"><span className="money" style={{ fontSize: 12, color: '#C0393F' }}>{fmt(pf)}</span></td>
                      <td className="right"><span className="money" style={{ fontSize: 12, color: '#C0393F' }}>{fmt(tds)}</span></td>
                      <td className="right"><span className="money" style={{ fontSize: 12, fontWeight: 700 }}>{fmt(net)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Payslips() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Payslips</h1><p style={{ fontSize: 12, color: '#5F6368' }}>Aug 2026 · 7 payslips generated</p></div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Download all</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Employee</th><th>Month</th><th className="right">Gross</th><th className="right">Deductions</th><th className="right">Net</th><th>Status</th><th /></tr></thead>
          <tbody>
            {EMPLOYEES.filter(e => e.status !== 'Resigned').map((e) => {
              const monthly = e.ctc / 12;
              const ded = monthly * 0.17;
              return (
                <tr key={e.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{e.name}</div>
                    <div className="cell-secondary">{e.id}</div>
                  </td>
                  <td style={{ fontSize: 13, color: '#5F6368' }}>Aug 2026</td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(monthly)}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13, color: '#C0393F' }}>{fmt(ded)}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(monthly - ded)}</span></td>
                  <td><span className="badge badge-posted">Generated</span></td>
                  <td><button className="btn-ghost" style={{ height: 28 }}>PDF</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Statutory() {
  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Statutory Summary</h1>
      <p style={{ fontSize: 12, color: '#5F6368', marginBottom: 20, fontFeatureSettings: 'normal' }}>Q1 FY 2026–27 · Apr–Jun 2026</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { title: 'Provident Fund (EPF)', ded: 87372, employer: 87372, due: '15 May 2026', filed: true },
          { title: 'ESI', ded: 12960, employer: 44460, due: '15 May 2026', filed: true },
          { title: 'Professional Tax (PT)', ded: 7200, employer: 0, due: '30 Apr 2026', filed: false },
          { title: 'TDS on Salary (26Q)', ded: 53316, employer: 0, due: '31 Jul 2026', filed: false },
        ].map((s) => (
          <div key={s.title} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{s.title}</span>
              <span className={`badge ${s.filed ? 'badge-posted' : 'badge-returned'}`}>{s.filed ? 'Filed' : 'Pending'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#5F6368' }}>Employee deduction</span>
                <span className="money" style={{ fontWeight: 600 }}>{fmt(s.ded)}</span>
              </div>
              {s.employer > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: '#5F6368' }}>Employer contribution</span>
                  <span className="money" style={{ fontWeight: 600 }}>{fmt(s.employer)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5F6368' }}>
                <span>Due date</span>
                <span>{s.due}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PayrollModule() {
  const [sub, setSub] = useState<SubView>('employees');
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Payroll</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>{item.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'employees' && <Employees />}
        {sub === 'payroll-run' && <PayrollRun />}
        {sub === 'payslips' && <Payslips />}
        {sub === 'statutory' && <Statutory />}
      </div>
    </div>
  );
}
