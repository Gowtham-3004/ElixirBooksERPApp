import { useState } from 'react';
import { DownloadIcon, FilterIcon } from '../components/Icons';

type SubView = 'pl' | 'bs' | 'cf' | 'trial' | 'ar-ageing' | 'ap-ageing' | 'stock-val' | 'gstr1-sum';
const SUB_NAV: { id: SubView; label: string; group: string }[] = [
  { id: 'pl', label: 'P&L Statement', group: 'Financial Statements' },
  { id: 'bs', label: 'Balance Sheet', group: 'Financial Statements' },
  { id: 'cf', label: 'Cash Flow', group: 'Financial Statements' },
  { id: 'trial', label: 'Trial Balance', group: 'Financial Statements' },
  { id: 'ar-ageing', label: 'AR Ageing', group: 'Receivables' },
  { id: 'ap-ageing', label: 'AP Ageing', group: 'Payables' },
  { id: 'stock-val', label: 'Stock Valuation', group: 'Inventory' },
  { id: 'gstr1-sum', label: 'GST Summary', group: 'Tax Reports' },
];

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
function fmtK(n: number) {
  if (Math.abs(n) >= 10000000) return '₹' + (n / 10000000).toFixed(2) + ' Cr';
  if (Math.abs(n) >= 100000) return '₹' + (n / 100000).toFixed(2) + ' L';
  return fmt(n);
}

type PLRow = { label: string; amount: number; indent: number; bold?: boolean; separator?: boolean; kind?: 'income' | 'expense' | 'total' };
const PL_DATA: PLRow[] = [
  { label: 'Revenue from Operations', amount: 0, indent: 0, bold: true, kind: 'income' },
  { label: 'Sales of Goods', amount: 84216000, indent: 1, kind: 'income' },
  { label: 'Sales of Services', amount: 4800000, indent: 1, kind: 'income' },
  { label: 'Other Operating Income', amount: 342000, indent: 1, kind: 'income' },
  { label: 'Total Revenue from Operations', amount: 89358000, indent: 0, bold: true, kind: 'total' },
  { label: '', amount: 0, indent: 0, separator: true },
  { label: 'Cost of Materials Consumed', amount: 50529600, indent: 0, bold: true, kind: 'expense' },
  { label: 'Opening Stock', amount: 12400000, indent: 1, kind: 'expense' },
  { label: 'Add: Purchases', amount: 51265600, indent: 1, kind: 'expense' },
  { label: 'Less: Closing Stock', amount: 13136000, indent: 1, kind: 'expense' },
  { label: 'Gross Profit', amount: 38828400, indent: 0, bold: true, kind: 'total' },
  { label: '', amount: 0, indent: 0, separator: true },
  { label: 'Operating Expenses', amount: 0, indent: 0, bold: true, kind: 'expense' },
  { label: 'Employee Benefits Expense', amount: 12367600, indent: 1, kind: 'expense' },
  { label: 'Finance Costs', amount: 720000, indent: 1, kind: 'expense' },
  { label: 'Depreciation & Amortisation', amount: 8471280, indent: 1, kind: 'expense' },
  { label: 'Rent & Utilities', amount: 2520000, indent: 1, kind: 'expense' },
  { label: 'Marketing & Selling', amount: 1980000, indent: 1, kind: 'expense' },
  { label: 'Travel & Logistics', amount: 1845000, indent: 1, kind: 'expense' },
  { label: 'IT & Software', amount: 1428000, indent: 1, kind: 'expense' },
  { label: 'Professional Fees', amount: 960000, indent: 1, kind: 'expense' },
  { label: 'Miscellaneous', amount: 384000, indent: 1, kind: 'expense' },
  { label: 'Total Operating Expenses', amount: 30675880, indent: 0, bold: true, kind: 'total' },
  { label: '', amount: 0, indent: 0, separator: true },
  { label: 'EBITDA', amount: 17133520, indent: 0, bold: true, kind: 'total' },
  { label: 'Less: Depreciation', amount: 8471280, indent: 1, kind: 'expense' },
  { label: 'EBIT', amount: 8662240, indent: 0, bold: true, kind: 'total' },
  { label: 'Less: Finance Costs', amount: 720000, indent: 1, kind: 'expense' },
  { label: 'Profit Before Tax (PBT)', amount: 7942240, indent: 0, bold: true, kind: 'total' },
  { label: 'Less: Income Tax (25%)', amount: 1985560, indent: 1, kind: 'expense' },
  { label: 'Profit After Tax (PAT)', amount: 5956680, indent: 0, bold: true, kind: 'total' },
];

function PLStatement() {
  const [period, setPeriod] = useState('H1 FY 2026-27');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Profit & Loss Statement</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Acme Private Limited · {period}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select className="btn-secondary btn-sm" style={{ height: 32, fontFamily: 'inherit', cursor: 'pointer' }}
            value={period} onChange={(e) => setPeriod(e.target.value)}>
            {['Apr 2026 (MTD)', 'Q1 FY 2026-27', 'H1 FY 2026-27', 'FY 2025-26'].map(p => <option key={p}>{p}</option>)}
          </select>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup><col style={{ width: 'auto' }} /><col style={{ width: 200 }} /><col style={{ width: 200 }} /></colgroup>
          <thead>
            <tr style={{ borderBottom: '2px solid #EAEAEA' }}>
              <th style={{ padding: '12px 0', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5F6368', fontWeight: 600 }}>Particulars</th>
              <th style={{ padding: '12px 0', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5F6368', fontWeight: 600 }}>H1 FY 2026-27 (₹)</th>
              <th style={{ padding: '12px 0', textAlign: 'right', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#5F6368', fontWeight: 600 }}>H1 FY 2025-26 (₹)</th>
            </tr>
          </thead>
          <tbody>
            {PL_DATA.map((row, i) => {
              if (row.separator) return <tr key={i}><td colSpan={3} style={{ padding: '8px 0', borderBottom: '1px solid #F5F5F5' }} /></tr>;
              const isTotal = row.kind === 'total';
              const isIncome = row.kind === 'income';
              return (
                <tr key={i} style={{ borderBottom: isTotal ? '2px solid #EAEAEA' : '1px solid #F5F5F5', background: isTotal ? '#F9FBFC' : '' }}>
                  <td style={{ padding: `${isTotal ? 10 : 7}px 0`, paddingLeft: row.indent * 20 }}>
                    <span style={{ fontSize: 13, fontWeight: row.bold ? 600 : 400, fontFeatureSettings: 'normal', color: isTotal ? '#0A0A0A' : (row.amount === 0 && row.bold ? '#5F6368' : '#0A0A0A') }}>{row.label}</span>
                  </td>
                  <td style={{ textAlign: 'right', padding: '7px 0' }}>
                    {row.amount > 0 && (
                      <span style={{ fontFeatureSettings: '"tnum" 1', fontSize: 13, fontWeight: row.bold ? 600 : 400, color: isTotal && isIncome ? '#12784E' : (isTotal ? '#0A0A0A' : '#0A0A0A') }}>
                        {fmtK(row.amount)}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', padding: '7px 0' }}>
                    {row.amount > 0 && (
                      <span style={{ fontFeatureSettings: '"tnum" 1', fontSize: 13, fontWeight: row.bold ? 600 : 400, color: '#B0B5BF' }}>
                        {fmtK(Math.round(row.amount * 0.88))}
                      </span>
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

type BSRow = { label: string; amount: number; indent: number; bold?: boolean; separator?: boolean };
const BS_ASSETS: BSRow[] = [
  { label: 'NON-CURRENT ASSETS', amount: 0, indent: 0, bold: true },
  { label: 'Property, Plant & Equipment (Net)', amount: 46820000, indent: 1 },
  { label: 'Capital Work-in-Progress', amount: 2400000, indent: 1 },
  { label: 'Intangible Assets', amount: 1200000, indent: 1 },
  { label: 'Investments', amount: 5000000, indent: 1 },
  { label: 'Deferred Tax Assets', amount: 840000, indent: 1 },
  { label: 'CURRENT ASSETS', amount: 0, indent: 0, bold: true, separator: true },
  { label: 'Inventories', amount: 13136000, indent: 1 },
  { label: 'Trade Receivables', amount: 28462000, indent: 1 },
  { label: 'Cash & Cash Equivalents', amount: 4280000, indent: 1 },
  { label: 'Short-term Loans', amount: 1200000, indent: 1 },
  { label: 'Other Current Assets', amount: 3260000, indent: 1 },
  { label: 'TOTAL ASSETS', amount: 106598000, indent: 0, bold: true, separator: true },
];
const BS_EQL: BSRow[] = [
  { label: "SHAREHOLDERS' EQUITY", amount: 0, indent: 0, bold: true },
  { label: 'Share Capital', amount: 10000000, indent: 1 },
  { label: 'Reserves & Surplus', amount: 42580000, indent: 1 },
  { label: 'TOTAL EQUITY', amount: 52580000, indent: 0, bold: true, separator: true },
  { label: 'NON-CURRENT LIABILITIES', amount: 0, indent: 0, bold: true },
  { label: 'Term Loans', amount: 18000000, indent: 1 },
  { label: 'Deferred Tax Liabilities', amount: 1200000, indent: 1 },
  { label: 'CURRENT LIABILITIES', amount: 0, indent: 0, bold: true, separator: true },
  { label: 'Trade Payables', amount: 16842000, indent: 1 },
  { label: 'Short-term Borrowings', amount: 8400000, indent: 1 },
  { label: 'Other Current Liabilities', amount: 6280000, indent: 1 },
  { label: 'Provisions', amount: 3296000, indent: 1 },
  { label: 'TOTAL EQUITY & LIABILITIES', amount: 106598000, indent: 0, bold: true, separator: true },
];

function BSRowItem({ row }: { row: BSRow }) {
  if (row.separator && !row.label) return <tr><td colSpan={2} style={{ padding: '4px 0' }} /></tr>;
  return (
    <tr style={{ borderBottom: row.bold && row.amount > 0 ? '2px solid #EAEAEA' : '1px solid #F5F5F5', background: row.bold && row.amount > 0 ? '#F9FBFC' : '' }}>
      <td style={{ padding: `${row.bold && row.amount > 0 ? 10 : 7}px 0`, paddingLeft: row.indent * 20 }}>
        <span style={{ fontSize: 13, fontWeight: row.bold ? 600 : 400, fontFeatureSettings: 'normal', color: row.amount === 0 && row.bold ? '#5F6368' : '#0A0A0A', textTransform: row.amount === 0 && row.bold ? 'uppercase' : 'none', letterSpacing: row.amount === 0 && row.bold ? '0.04em' : 'normal', fontSize: row.amount === 0 && row.bold ? 11 : 13 }}>{row.label}</span>
      </td>
      <td style={{ textAlign: 'right', padding: '7px 0' }}>
        {row.amount > 0 && <span style={{ fontFeatureSettings: '"tnum" 1', fontSize: 13, fontWeight: row.bold ? 600 : 400 }}>{fmtK(row.amount)}</span>}
      </td>
    </tr>
  );
}

function BalanceSheet() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Balance Sheet</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Acme Private Limited · As at 30 Sep 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary btn-sm">Comparative</button>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
        <div>
          <div style={{ padding: '16px 0 8px', fontSize: 13, fontWeight: 700, color: '#325CFF', borderBottom: '2px solid #325CFF20', marginBottom: 4 }}>ASSETS</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{BS_ASSETS.map((r, i) => <BSRowItem key={i} row={r} />)}</tbody>
          </table>
        </div>
        <div>
          <div style={{ padding: '16px 0 8px', fontSize: 13, fontWeight: 700, color: '#12784E', borderBottom: '2px solid #12784E20', marginBottom: 4 }}>EQUITY & LIABILITIES</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>{BS_EQL.map((r, i) => <BSRowItem key={i} row={r} />)}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const TRIAL = [
  { code: '1000', name: 'Share Capital', debit: 0, credit: 10000000, type: 'Equity' },
  { code: '1010', name: 'Reserves & Surplus', debit: 0, credit: 42580000, type: 'Equity' },
  { code: '2000', name: 'Term Loans (SBI)', debit: 0, credit: 18000000, type: 'Liability' },
  { code: '2010', name: 'Trade Payables — Vendors', debit: 0, credit: 16842000, type: 'Liability' },
  { code: '3000', name: 'Fixed Assets — Plant & Machinery', debit: 28400000, credit: 0, type: 'Asset' },
  { code: '3010', name: 'Accumulated Depreciation', debit: 0, credit: 8120000, type: 'Asset' },
  { code: '3100', name: 'Inventory — Finished Goods', debit: 13136000, credit: 0, type: 'Asset' },
  { code: '3200', name: 'Trade Receivables — Domestic', debit: 28462000, credit: 0, type: 'Asset' },
  { code: '3300', name: 'Cash at Bank — HDFC CA', debit: 4280000, credit: 0, type: 'Asset' },
  { code: '4000', name: 'Sales — Domestic B2B', debit: 0, credit: 84216000, type: 'Income' },
  { code: '4100', name: 'Service Revenue', debit: 0, credit: 4800000, type: 'Income' },
  { code: '5000', name: 'Purchase — Raw Materials', debit: 51265600, credit: 0, type: 'Expense' },
  { code: '6000', name: 'Employee Costs — Salaries', debit: 12367600, credit: 0, type: 'Expense' },
  { code: '6100', name: 'Depreciation Expense', debit: 8471280, credit: 0, type: 'Expense' },
  { code: '6200', name: 'Finance Costs', debit: 720000, credit: 0, type: 'Expense' },
];
const TB_COLORS: Record<string, string> = { Equity: '#325CFF', Liability: '#C0393F', Asset: '#12784E', Income: '#8A4B0F', Expense: '#5F6368' };

function TrialBalance() {
  const totalDr = TRIAL.reduce((s, r) => s + r.debit, 0);
  const totalCr = TRIAL.reduce((s, r) => s + r.credit, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Trial Balance</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>As at 30 Sep 2026 · Unaudited · All branches consolidated</p>
        </div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th>Code</th><th>Account Name</th><th>Type</th><th className="right">Debit (₹)</th><th className="right">Credit (₹)</th></tr>
          </thead>
          <tbody>
            {TRIAL.map((r) => (
              <tr key={r.code}>
                <td><span className="identifier" style={{ fontSize: 12 }}>{r.code}</span></td>
                <td style={{ fontSize: 13, fontFeatureSettings: 'normal' }}>{r.name}</td>
                <td><span style={{ fontSize: 11, fontWeight: 600, color: TB_COLORS[r.type] || '#5F6368', fontFeatureSettings: 'normal' }}>{r.type}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: r.debit > 0 ? '#0A0A0A' : '#D0D5DD' }}>{r.debit > 0 ? fmtK(r.debit) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: r.credit > 0 ? '#0A0A0A' : '#D0D5DD' }}>{r.credit > 0 ? fmtK(r.credit) : '—'}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC', fontWeight: 700, borderTop: '2px solid #EAEAEA' }}>
              <td colSpan={3} style={{ padding: '10px 16px', fontSize: 13 }}>Total</td>
              <td className="right" style={{ padding: '10px 16px' }}><span className="money" style={{ fontSize: 14, fontWeight: 700 }}>{fmtK(totalDr)}</span></td>
              <td className="right" style={{ padding: '10px 16px' }}><span className="money" style={{ fontSize: 14, fontWeight: 700, color: totalDr === totalCr ? '#12784E' : '#C0393F' }}>{fmtK(totalCr)}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const AR_CUSTOMERS = [
  { name: 'TechMfg Pvt Ltd', current: 842000, d30: 0, d60: 0, d90: 0, d90p: 0, total: 842000 },
  { name: 'BuildCon Industries', current: 221000, d30: 524000, d60: 0, d90: 0, d90p: 0, total: 745000 },
  { name: 'RapidBuild Pvt Ltd', current: 156000, d30: 289000, d60: 184000, d90: 0, d90p: 0, total: 629000 },
  { name: 'SteelFab Solutions', current: 480000, d30: 0, d60: 0, d90: 0, d90p: 0, total: 480000 },
  { name: 'Infra Projects Ltd', current: 0, d30: 186000, d60: 0, d90: 124000, d90p: 0, total: 310000 },
  { name: 'PackCorp Ltd', current: 112000, d30: 0, d60: 0, d90: 0, d90p: 0, total: 112000 },
  { name: 'MechParts Pvt Ltd', current: 0, d30: 0, d60: 0, d90: 0, d90p: 95000, total: 95000 },
  { name: 'Others', current: 842000, d30: 384000, d60: 220000, d90: 76000, d90p: 11000, total: 1533000 },
];

function ARAgeing() {
  const bkts = [
    { label: 'Current', color: '#12784E', key: 'current' as const },
    { label: '1-30 days', color: '#F59E0B', key: 'd30' as const },
    { label: '31-60 days', color: '#F97316', key: 'd60' as const },
    { label: '61-90 days', color: '#EF4444', key: 'd90' as const },
    { label: '>90 days', color: '#C0393F', key: 'd90p' as const },
  ];
  const totals = bkts.map((b) => AR_CUSTOMERS.reduce((s, c) => s + c[b.key], 0));
  const grand = totals.reduce((a, b) => a + b, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>AR Ageing Report</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>As at 13 Sep 2026 · 8 customers · Outstanding: {fmtK(grand)}</p></div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
      </div>
      <div style={{ padding: '12px 24px', display: 'flex', gap: 10, borderBottom: '1px solid #EAEAEA' }}>
        {bkts.map((b, i) => (
          <div key={b.label} style={{ flex: 1, background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: 8, padding: '10px 14px', borderLeft: `3px solid ${b.color}` }}>
            <div style={{ fontSize: 11, color: '#5F6368', marginBottom: 4 }}>{b.label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFeatureSettings: '"tnum" 1', color: b.color }}>{fmtK(totals[i])}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th>Customer</th>{bkts.map(b => <th key={b.label} className="right">{b.label}</th>)}<th className="right">Total</th></tr>
          </thead>
          <tbody>
            {AR_CUSTOMERS.map((c) => (
              <tr key={c.name}>
                <td style={{ fontSize: 13, fontFeatureSettings: 'normal' }}>{c.name}</td>
                {bkts.map((b) => (
                  <td key={b.key} className="right"><span className="money" style={{ fontSize: 13, color: c[b.key] > 0 ? b.color : '#D0D5DD' }}>{c[b.key] > 0 ? fmtK(c[b.key]) : '—'}</span></td>
                ))}
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmtK(c.total)}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC', fontWeight: 700, borderTop: '2px solid #EAEAEA' }}>
              <td style={{ padding: '10px 16px', fontSize: 13 }}>Total</td>
              {totals.map((t, i) => <td key={i} className="right" style={{ padding: '10px 16px' }}><span className="money" style={{ fontSize: 13, fontWeight: 700 }}>{fmtK(t)}</span></td>)}
              <td className="right" style={{ padding: '10px 16px' }}><span className="money" style={{ fontSize: 14, fontWeight: 700, color: '#0A0A0A' }}>{fmtK(grand)}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

const STOCK_ITEMS = [
  { sku: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', uom: 'MT', qty: 42.5, avgCost: 72000, value: 3060000, wh: 'Main WH', method: 'AVCO' },
  { sku: 'STL-6MM-HR', name: 'Steel Plates 6mm HR', uom: 'MT', qty: 31.0, avgCost: 78500, value: 2433500, wh: 'Main WH', method: 'AVCO' },
  { sku: 'PKG-CRATE-L', name: 'Wooden Crates Large', uom: 'Nos', qty: 820, avgCost: 720, value: 590400, wh: 'Andheri WH', method: 'AVCO' },
  { sku: 'PKG-BOX-M', name: 'Corrugated Box Medium', uom: 'Nos', qty: 4200, avgCost: 72, value: 302400, wh: 'Andheri WH', method: 'AVCO' },
  { sku: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', uom: 'Nos', qty: 12000, avgCost: 24, value: 288000, wh: 'Main WH', method: 'AVCO' },
  { sku: 'HW-NUT-M16', name: 'Hex Nut M16', uom: 'Nos', qty: 12000, avgCost: 15, value: 180000, wh: 'Main WH', method: 'AVCO' },
  { sku: 'GRD-WHL-180', name: 'Grinding Wheel 180mm', uom: 'Nos', qty: 240, avgCost: 380, value: 91200, wh: 'Main WH', method: 'AVCO' },
  { sku: 'ELEC-WLD-200', name: 'Electrode Welding 200A', uom: 'Kg', qty: 120, avgCost: 1850, value: 222000, wh: 'Pune Depot', method: 'AVCO' },
];

function StockValuation() {
  const total = STOCK_ITEMS.reduce((s, r) => s + r.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Stock Valuation Report</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>As at 13 Sep 2026 · AVCO method · Total value: {fmtK(total)}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><FilterIcon size={14} />Warehouse</button>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th>SKU</th><th>Item Name</th><th>UOM</th><th className="right">Qty on Hand</th><th className="right">Avg Cost</th><th className="right">Stock Value</th><th>Warehouse</th><th>Method</th></tr>
          </thead>
          <tbody>
            {STOCK_ITEMS.map((s) => (
              <tr key={s.sku}>
                <td><span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{s.sku}</span></td>
                <td style={{ fontSize: 13, fontFeatureSettings: 'normal' }}>{s.name}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{s.uom}</td>
                <td className="right"><span style={{ fontSize: 13, fontWeight: 600, fontFeatureSettings: '"tnum" 1' }}>{s.qty.toLocaleString('en-IN')}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(s.avgCost)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmtK(s.value)}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{s.wh}</td>
                <td><span className="badge badge-draft" style={{ fontSize: 11 }}>{s.method}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC', fontWeight: 700, borderTop: '2px solid #EAEAEA' }}>
              <td colSpan={5} style={{ padding: '10px 16px', fontSize: 13 }}>Total Stock Value</td>
              <td className="right" style={{ padding: '10px 16px' }}><span className="money" style={{ fontSize: 14, fontWeight: 700, color: '#12784E' }}>{fmtK(total)}</span></td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function GSTSummary() {
  const heads = [
    { label: 'B2B Sales', taxable: 76421000, cgst: 3438945, sgst: 3438945, igst: 0, cess: 0 },
    { label: 'B2C Sales', taxable: 7937000, cgst: 714330, sgst: 714330, igst: 0, cess: 0 },
    { label: 'Exports (zero-rated)', taxable: 1200000, cgst: 0, sgst: 0, igst: 0, cess: 0 },
    { label: 'Nil-rated / Exempt', taxable: 480000, cgst: 0, sgst: 0, igst: 0, cess: 0 },
  ];
  const itc = [
    { label: 'Input Tax Credit — CGST', amount: 2280000 },
    { label: 'Input Tax Credit — SGST', amount: 2280000 },
    { label: 'Input Tax Credit — IGST', amount: 0 },
  ];
  const totTaxable = heads.reduce((s, h) => s + h.taxable, 0);
  const totCGST = heads.reduce((s, h) => s + h.cgst, 0);
  const totSGST = heads.reduce((s, h) => s + h.sgst, 0);
  const netCGST = totCGST - 2280000;
  const netSGST = totSGST - 2280000;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>GST Summary</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Apr–Sep 2026 · GSTIN 27AAAPL1234C1Z5 · Maharashtra</p></div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Outward Supplies (Output Tax)</div>
        <table className="data-table dense" style={{ marginBottom: 24 }}>
          <thead><tr><th>Nature of Supply</th><th className="right">Taxable Value</th><th className="right">CGST</th><th className="right">SGST</th><th className="right">IGST</th><th className="right">Cess</th></tr></thead>
          <tbody>
            {heads.map((h) => (
              <tr key={h.label}>
                <td style={{ fontSize: 13 }}>{h.label}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmtK(h.taxable)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{h.cgst > 0 ? fmtK(h.cgst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{h.sgst > 0 ? fmtK(h.sgst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#B0B5BF' }}>—</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#B0B5BF' }}>—</span></td>
              </tr>
            ))}
            <tr style={{ background: '#F9FBFC', fontWeight: 700, borderTop: '2px solid #EAEAEA' }}>
              <td style={{ padding: '8px 16px', fontSize: 13 }}>Total Output Tax</td>
              <td className="right" style={{ padding: '8px 16px' }}><span className="money" style={{ fontWeight: 700 }}>{fmtK(totTaxable)}</span></td>
              <td className="right" style={{ padding: '8px 16px' }}><span className="money" style={{ fontWeight: 700 }}>{fmtK(totCGST)}</span></td>
              <td className="right" style={{ padding: '8px 16px' }}><span className="money" style={{ fontWeight: 700 }}>{fmtK(totSGST)}</span></td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>

        <div className="section-label" style={{ marginBottom: 10 }}>Input Tax Credit (ITC)</div>
        <table className="data-table dense" style={{ marginBottom: 24 }}>
          <thead><tr><th>Credit Head</th><th className="right">Available ITC</th><th className="right">Reversed</th><th className="right">Net ITC</th></tr></thead>
          <tbody>
            {itc.map((r) => (
              <tr key={r.label}>
                <td style={{ fontSize: 13 }}>{r.label}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{r.amount > 0 ? fmtK(r.amount) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#B0B5BF' }}>—</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600, color: r.amount > 0 ? '#12784E' : '#B0B5BF' }}>{r.amount > 0 ? fmtK(r.amount) : '—'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Net CGST Payable', amount: netCGST, color: '#C0393F' },
            { label: 'Net SGST Payable', amount: netSGST, color: '#C0393F' },
            { label: 'IGST Payable', amount: 0, color: '#B0B5BF' },
            { label: 'Total GST Payable', amount: netCGST + netSGST, color: '#C0393F' },
          ].map((t) => (
            <div key={t.label} style={{ flex: 1, minWidth: 160, background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: 8, padding: '14px 18px', borderBottom: `3px solid ${t.color}` }}>
              <div style={{ fontSize: 11, color: '#5F6368', marginBottom: 6 }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFeatureSettings: '"tnum" 1', color: t.color }}>{t.amount > 0 ? fmtK(t.amount) : '—'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CashFlow() {
  const ops = [
    { label: 'Net Profit Before Tax', amount: 7942240, indent: 0, bold: true },
    { label: 'Add: Depreciation', amount: 8471280, indent: 1 },
    { label: 'Add: Finance Costs', amount: 720000, indent: 1 },
    { label: 'Less: Increase in Trade Receivables', amount: -6421000, indent: 1 },
    { label: 'Less: Increase in Inventories', amount: -736000, indent: 1 },
    { label: 'Add: Increase in Trade Payables', amount: 2842000, indent: 1 },
    { label: 'Net Cash from Operations', amount: 12818520, indent: 0, bold: true },
  ];
  const inv = [
    { label: 'Purchase of Fixed Assets', amount: -4200000, indent: 1 },
    { label: 'Proceeds from Disposal', amount: 280000, indent: 1 },
    { label: 'Net Cash from Investing', amount: -3920000, indent: 0, bold: true },
  ];
  const fin = [
    { label: 'Term Loan Repayments', amount: -2400000, indent: 1 },
    { label: 'Finance Costs Paid', amount: -720000, indent: 1 },
    { label: 'Net Cash from Financing', amount: -3120000, indent: 0, bold: true },
  ];
  const net = 12818520 - 3920000 - 3120000;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Cash Flow Statement</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>H1 FY 2026-27 · Indirect method</p></div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0 24px' }}>
        {[
          { title: 'A. Cash Flow from Operating Activities', rows: ops, color: '#325CFF' },
          { title: 'B. Cash Flow from Investing Activities', rows: inv, color: '#12784E' },
          { title: 'C. Cash Flow from Financing Activities', rows: fin, color: '#F97316' },
        ].map((section) => (
          <div key={section.title} style={{ marginBottom: 24 }}>
            <div style={{ padding: '12px 0 6px', fontSize: 13, fontWeight: 700, color: section.color, borderBottom: `2px solid ${section.color}20` }}>{section.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {section.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: r.bold ? '2px solid #EAEAEA' : '1px solid #F5F5F5', background: r.bold ? '#F9FBFC' : '' }}>
                    <td style={{ padding: `${r.bold ? 10 : 7}px 0`, paddingLeft: r.indent * 20 }}>
                      <span style={{ fontSize: 13, fontWeight: r.bold ? 600 : 400, fontFeatureSettings: 'normal' }}>{r.label}</span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '7px 0', width: 160 }}>
                      <span style={{ fontFeatureSettings: '"tnum" 1', fontSize: 13, fontWeight: r.bold ? 700 : 400, color: r.amount < 0 ? '#C0393F' : '#0A0A0A' }}>
                        {r.amount >= 0 ? fmtK(r.amount) : `(${fmtK(Math.abs(r.amount))})`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ background: '#F9FBFC', border: '2px solid #EAEAEA', borderRadius: 8, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Net Increase / (Decrease) in Cash</span>
          <span style={{ fontSize: 20, fontWeight: 700, fontFeatureSettings: '"tnum" 1', color: net >= 0 ? '#12784E' : '#C0393F' }}>{fmtK(net)}</span>
        </div>
      </div>
    </div>
  );
}

export default function FinancialReports() {
  const [sub, setSub] = useState<SubView>('pl');
  const groups = [...new Set(SUB_NAV.map((n) => n.group))];
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 0, overflowY: 'auto' }}>
        {groups.map((g) => (
          <div key={g} style={{ marginBottom: 8 }}>
            <div className="section-label" style={{ padding: '4px 12px 6px' }}>{g}</div>
            {SUB_NAV.filter((n) => n.group === g).map((item) => (
              <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
                style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
                onClick={() => setSub(item.id)}>{item.label}</button>
            ))}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'pl' && <PLStatement />}
        {sub === 'bs' && <BalanceSheet />}
        {sub === 'cf' && <CashFlow />}
        {sub === 'trial' && <TrialBalance />}
        {sub === 'ar-ageing' && <ARAgeing />}
        {sub === 'ap-ageing' && <ARAgeing />}
        {sub === 'stock-val' && <StockValuation />}
        {sub === 'gstr1-sum' && <GSTSummary />}
      </div>
    </div>
  );
}
