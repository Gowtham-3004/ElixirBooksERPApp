import { useState } from 'react';
import { PlusIcon, SearchIcon, DownloadIcon } from '../components/Icons';

type SubView = 'budget' | 'expenses';
const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'budget', label: 'Budget vs Actuals' },
  { id: 'expenses', label: 'Expense Claims' },
];
function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
function pct(a: number, b: number) { return b === 0 ? 0 : Math.min(100, (a / b) * 100); }

const BUDGET_ROWS = [
  { account: 'Revenue', type: 'income', budget: 12000000, actual: 8421600, committed: 0, variance: 3578400, favorable: true },
  { account: 'Cost of Goods Sold', type: 'expense', budget: 7200000, actual: 5052960, committed: 120000, variance: 2027040, favorable: true },
  { account: 'Gross Profit', type: 'calc', budget: 4800000, actual: 3368640, committed: 0, variance: 1431360, favorable: false },
  { account: 'Employee Costs', type: 'expense', budget: 1500000, actual: 1236760, committed: 453250, variance: -189010, favorable: false },
  { account: 'Rent & Utilities', type: 'expense', budget: 360000, actual: 252000, committed: 0, variance: 108000, favorable: true },
  { account: 'Marketing & Sales', type: 'expense', budget: 480000, actual: 198000, committed: 50000, variance: 232000, favorable: true },
  { account: 'Travel & Logistics', type: 'expense', budget: 240000, actual: 184500, committed: 20000, variance: 35500, favorable: true },
  { account: 'IT & Software', type: 'expense', budget: 180000, actual: 142800, committed: 30000, variance: 7200, favorable: true },
  { account: 'Professional Fees', type: 'expense', budget: 120000, actual: 96000, committed: 0, variance: 24000, favorable: true },
  { account: 'Finance Costs', type: 'expense', budget: 96000, actual: 72000, committed: 0, variance: 24000, favorable: true },
  { account: 'Depreciation', type: 'expense', budget: 1128000, actual: 847128, committed: 0, variance: 280872, favorable: true },
  { account: 'Miscellaneous', type: 'expense', budget: 60000, actual: 38400, committed: 0, variance: 21600, favorable: true },
  { account: 'Total OpEx', type: 'calc', budget: 4164000, actual: 3067588, committed: 553250, variance: 543162, favorable: true },
  { account: 'Operating Profit (EBITDA)', type: 'calc', budget: 636000, actual: 301052, committed: 0, variance: -334948, favorable: false },
];

function BudgetVsActuals() {
  const [period, setPeriod] = useState('Apr–Sep 2026');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Budget vs Actuals</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>FY 2026–27 · {period} · Acme Pvt Ltd · All branches</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="btn-secondary btn-sm" style={{ height: 32, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }} value={period} onChange={(e) => setPeriod(e.target.value)}>
            {['Apr 2026', 'Apr–May 2026', 'Apr–Jun 2026 (Q1)', 'Apr–Sep 2026 (H1)', 'Full Year'].map(p => <option key={p}>{p}</option>)}
          </select>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Account / Cost Head</th>
              <th className="right">Budget (FY)</th>
              <th className="right">Budget (Period)</th>
              <th className="right">Actual</th>
              <th className="right">Committed</th>
              <th className="right">Variance</th>
              <th style={{ width: 160 }}>Utilization</th>
            </tr>
          </thead>
          <tbody>
            {BUDGET_ROWS.map((r) => {
              const periodBudget = Math.round(r.budget * 0.5);
              const util = pct(r.actual + r.committed, periodBudget);
              const isCalc = r.type === 'calc';
              return (
                <tr key={r.account} style={{
                  background: isCalc ? '#F9FBFC' : '',
                  fontWeight: isCalc ? 600 : 400,
                }}>
                  <td>
                    <span style={{ fontSize: isCalc ? 13 : 13, fontWeight: isCalc ? 600 : 400, fontFeatureSettings: 'normal', paddingLeft: isCalc ? 0 : 8 }}>
                      {r.account}
                    </span>
                  </td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(r.budget)}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(periodBudget)}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(r.actual)}</span></td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13, color: r.committed > 0 ? '#F97316' : '#B0B5BF' }}>
                      {r.committed > 0 ? fmt(r.committed) : '—'}
                    </span>
                  </td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13, fontWeight: 600, color: r.favorable ? '#12784E' : '#C0393F' }}>
                      {r.favorable ? '+' : ''}{fmt(r.variance)}
                    </span>
                  </td>
                  <td>
                    {!isCalc && r.type !== 'income' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: '#EAEAEA', borderRadius: 9999, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%',
                            width: `${util}%`,
                            borderRadius: 9999,
                            background: util > 90 ? '#C0393F' : util > 75 ? '#F97316' : '#12784E',
                            transition: 'width 0.3s',
                          }} />
                        </div>
                        <span style={{ fontSize: 11, color: '#5F6368', width: 36, textAlign: 'right', fontFeatureSettings: '"tnum" 1' }}>
                          {util.toFixed(0)}%
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EXPENSES = [
  { id: 'EXP/26-27/0022', date: '10 Sep 2026', employee: 'Vikram Singh', category: 'Travel', desc: 'Client visit — Pune', amount: 8400, tax: 0, total: 8400, method: 'Corporate card', status: 'Approved', reimbursed: false },
  { id: 'EXP/26-27/0021', date: '08 Sep 2026', employee: 'Priya Mehta', category: 'Entertainment', desc: 'Customer lunch — Q1 review', amount: 3200, tax: 576, total: 3776, method: 'Personal', status: 'Approved', reimbursed: false },
  { id: 'EXP/26-27/0020', date: '05 Sep 2026', employee: 'Anita Rao', category: 'Office Supplies', desc: 'Stationery and printer cartridges', amount: 1850, tax: 333, total: 2183, method: 'Personal', status: 'Pending', reimbursed: false },
  { id: 'EXP/26-27/0019', date: '02 Sep 2026', employee: 'Rahul Kumar', category: 'Travel', desc: 'Flight MUM-DEL for vendor meet', amount: 12000, tax: 720, total: 12720, method: 'Corporate card', status: 'Approved', reimbursed: true },
  { id: 'EXP/26-27/0018', date: '28 Aug 2026', employee: 'Suresh Kumar', category: 'Training', desc: 'Safety certification course', amount: 6500, tax: 0, total: 6500, method: 'Personal', status: 'Approved', reimbursed: true },
  { id: 'EXP/26-27/0017', date: '22 Aug 2026', employee: 'Meena Joshi', category: 'IT', desc: 'Software subscription renewal', amount: 4200, tax: 756, total: 4956, method: 'Personal', status: 'Rejected', reimbursed: false },
];
const EXP_BADGE: Record<string, string> = { Approved: 'badge-posted', Pending: 'badge-submitted', Rejected: 'badge-rejected' };

function ExpenseClaims() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Expense Claims</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>6 claims · {fmt(38535)} total · Pending reimbursement: {fmt(14159)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />Submit claim</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="EXP #, employee…" /></div>
        <button className="btn-secondary btn-sm" style={{ borderColor: '#325CFF', color: '#325CFF' }}>Pending (1)</button>
        <button className="btn-secondary btn-sm" style={{ borderColor: '#F97316', color: '#F97316' }}>Not reimbursed (2)</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Claim #</th>
              <th>Date</th>
              <th>Employee</th>
              <th>Category</th>
              <th>Description</th>
              <th className="right">Amount</th>
              <th className="right">Tax</th>
              <th className="right">Total</th>
              <th>Method</th>
              <th>Status</th>
              <th>Reimbursed</th>
            </tr>
          </thead>
          <tbody>
            {EXPENSES.map((e) => (
              <tr key={e.id} style={{ cursor: 'pointer', opacity: e.status === 'Rejected' ? 0.5 : 1 }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{e.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{e.date}</td>
                <td style={{ fontSize: 13 }}>{e.employee}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{e.category}</td>
                <td style={{ fontSize: 12, color: '#5F6368', maxWidth: 180 }}>{e.desc}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(e.amount)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#5F6368' }}>{e.tax > 0 ? fmt(e.tax) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(e.total)}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{e.method}</td>
                <td><span className={`badge ${EXP_BADGE[e.status]}`}>{e.status}</span></td>
                <td>
                  {e.method === 'Corporate card'
                    ? <span style={{ fontSize: 11, color: '#B0B5BF' }}>N/A</span>
                    : <span className={`badge ${e.reimbursed ? 'badge-posted' : 'badge-returned'}`}>{e.reimbursed ? 'Yes' : 'Pending'}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BudgetsModule() {
  const [sub, setSub] = useState<SubView>('budget');
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Budgets</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>{item.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'budget' && <BudgetVsActuals />}
        {sub === 'expenses' && <ExpenseClaims />}
      </div>
    </div>
  );
}
