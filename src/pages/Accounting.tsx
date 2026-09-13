import { useState } from 'react';
import { SearchIcon, DownloadIcon, FilterIcon, ChevronDownIcon } from '../components/Icons';

const LEDGER_ENTRIES = [
  { date: '01 Apr 2026', doc: 'OB/26-27/0001', desc: 'Opening Balance', ref: null, dr: '—', cr: '—', balance: '4,82,000.00', type: 'ob' },
  { date: '05 Apr 2026', doc: 'RCPT/26-27/0201', desc: 'Receipt from Arlene Traders', ref: 'INV/26-27/0099', dr: '84,000.00', cr: '—', balance: '5,66,000.00', type: 'normal' },
  { date: '08 Apr 2026', doc: 'PMT/26-27/0180', desc: 'Payment to Shree Suppliers', ref: 'PO/26-27/0085', dr: '—', cr: '62,000.00', balance: '5,04,000.00', type: 'normal' },
  { date: '12 Apr 2026', doc: 'JV/26-27/0390', desc: 'Bank charges — HDFC CA ****1234', ref: null, dr: '—', cr: '236.00', balance: '5,03,764.00', type: 'normal' },
  { date: '15 Apr 2026', doc: 'RCPT/26-27/0206', desc: 'Receipt from Metro Distributors', ref: 'INV/26-27/0104', dr: '3,22,000.00', cr: '—', balance: '8,25,764.00', type: 'normal' },
  { date: '18 Apr 2026', doc: 'PMT/26-27/0188', desc: 'Payment to Bharat Agencies', ref: 'PO/26-27/0088', dr: '—', cr: '1,88,000.00', balance: '6,37,764.00', type: 'normal' },
  { date: '20 Apr 2026', doc: 'RCPT/26-27/0210', desc: 'Advance receipt from Rajesh Enterprises', ref: null, dr: '2,45,000.00', cr: '—', balance: '8,82,764.00', type: 'normal' },
  { date: '22 Apr 2026', doc: 'JV/26-27/0410', desc: 'Interest earned — HDFC FD', ref: null, dr: '9,386.00', cr: '—', balance: '8,92,150.00', type: 'normal' },
];

const TRIAL_BALANCE = [
  { code: '1100', account: 'Trade Receivables (AR Control)', dr: '18,45,200.00', cr: '—' },
  { code: '1200', account: 'Inventory — Finished Goods', dr: '6,82,400.00', cr: '—' },
  { code: '1300', account: 'Cash — Petty Cash', dr: '45,000.00', cr: '—' },
  { code: '1310', account: 'HDFC Current Account ****1234', dr: '8,92,150.00', cr: '—' },
  { code: '2100', account: 'Trade Payables (AP Control)', dr: '—', cr: '12,30,400.00' },
  { code: '2300', account: 'Output CGST Payable', dr: '—', cr: '1,89,000.00' },
  { code: '2301', account: 'Output SGST Payable', dr: '—', cr: '1,89,000.00' },
  { code: '3000', account: 'Share Capital', dr: '—', cr: '25,00,000.00' },
  { code: '3100', account: 'Retained Earnings', dr: '—', cr: '8,42,600.00' },
  { code: '4000', account: 'Sales Revenue', dr: '—', cr: '42,18,600.00' },
  { code: '5000', account: 'Cost of Goods Sold', dr: '28,40,000.00', cr: '—' },
  { code: '5100', account: 'Employee Salaries', dr: '8,62,000.00', cr: '—' },
  { code: '5200', account: 'Rent & Utilities', dr: '1,80,000.00', cr: '—' },
  { code: '5300', account: 'Depreciation', dr: '42,000.00', cr: '—' },
];

export default function Accounting() {
  const [activeView, setActiveView] = useState<'ledger' | 'trial-balance'>('trial-balance');

  const drTotal = '64,88,750.00';
  const crTotal = '91,69,600.00';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>Accounting</h1>
            <p style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              Acme Private Limited · Mumbai · Apr 2026 · INR
            </p>
          </div>
          <button className="btn-secondary" style={{ gap: 6 }}>
            <DownloadIcon size={14} />
            Export
          </button>
        </div>

        {/* Sub-nav */}
        <div style={{ display: 'flex', gap: 0 }}>
          {[
            { id: 'trial-balance' as const, label: 'Trial Balance' },
            { id: 'ledger' as const, label: 'Account Ledger' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`filter-tab ${activeView === tab.id ? 'active' : ''}`}
              onClick={() => setActiveView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'trial-balance' ? (
        <TrialBalance data={TRIAL_BALANCE} drTotal={drTotal} crTotal={crTotal} />
      ) : (
        <LedgerView entries={LEDGER_ENTRIES} />
      )}
    </div>
  );
}

function TrialBalance({ data, drTotal, crTotal }: { data: typeof TRIAL_BALANCE; drTotal: string; crTotal: string }) {
  return (
    <>
      {/* Period controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>Period:</span>
        <button className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }}>
          Apr 2026
          <ChevronDownIcon size={12} />
        </button>
        <button className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }}>
          Cumulative (FY to date)
          <ChevronDownIcon size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <div className="search-input" style={{ width: 220 }}>
          <SearchIcon size={14} />
          <input placeholder="Search accounts…" />
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: '#FFFFFF' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ width: 80 }}>Code</th>
              <th>Account</th>
              <th className="right">Debit (Dr)</th>
              <th className="right">Credit (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.code} style={{ cursor: 'pointer' }}>
                <td>
                  <span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{row.code}</span>
                </td>
                <td>
                  <span style={{ fontSize: 14, color: '#325CFF', cursor: 'pointer', fontFeatureSettings: 'normal' }}>{row.account}</span>
                </td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, color: row.dr !== '—' ? '#0A0A0A' : '#B0B5BF' }}>
                    {row.dr !== '—' ? `₹${row.dr}` : '—'}
                  </span>
                </td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, color: row.cr !== '—' ? '#0A0A0A' : '#B0B5BF' }}>
                    {row.cr !== '—' ? `₹${row.cr}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC', borderTop: '2px solid #E0E2E6' }}>
              <td colSpan={2}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5F6368', fontFeatureSettings: 'normal' }}>
                  TOTAL
                </span>
              </td>
              <td className="right">
                <strong className="money" style={{ fontSize: 14 }}>₹{drTotal}</strong>
              </td>
              <td className="right">
                <strong className="money" style={{ fontSize: 14 }}>₹{crTotal}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Balance check */}
      <div style={{ padding: '10px 24px', background: '#F9FBFC', borderTop: '1px solid #EAEAEA', flexShrink: 0 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            background: '#FEF4EC',
            borderRadius: 9999,
            fontSize: 12,
            color: '#8A4B0F',
            fontFeatureSettings: 'normal',
          }}
        >
          ⚠ Trial balance does not balance — check for unposted journals or missing accounts. Dr ₹{drTotal} ≠ Cr ₹{crTotal}
        </div>
      </div>
    </>
  );
}

function LedgerView({ entries }: { entries: typeof LEDGER_ENTRIES }) {
  return (
    <>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>Account:</span>
        <button className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }}>
          1310 · HDFC Current Account ****1234
          <ChevronDownIcon size={12} />
        </button>
        <button className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }}>
          Apr 2026
          <ChevronDownIcon size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn-secondary btn-sm" style={{ gap: 6 }}>
          <FilterIcon size={13} />
          Filters
        </button>
        <button className="btn-secondary btn-sm" style={{ gap: 6 }}>
          <DownloadIcon size={14} />
          Export
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: '#FFFFFF' }}>
        <table className="data-table dense">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Date</th>
              <th>Document</th>
              <th>Description</th>
              <th>Reference</th>
              <th className="right">Dr</th>
              <th className="right">Cr</th>
              <th className="right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {/* Opening balance row */}
            {entries.map((row, i) => (
              <tr
                key={i}
                style={{
                  background: row.type === 'ob' ? '#F9FBFC' : 'transparent',
                  fontWeight: row.type === 'ob' ? 600 : 400,
                }}
              >
                <td style={{ fontSize: 13, fontFeatureSettings: 'normal' }}>{row.date}</td>
                <td>
                  <span className="identifier" style={{ fontSize: 12, color: '#325CFF', fontWeight: 500 }}>{row.doc}</span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{row.desc}</span>
                </td>
                <td>
                  {row.ref ? (
                    <span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{row.ref}</span>
                  ) : (
                    <span style={{ color: '#B0B5BF' }}>—</span>
                  )}
                </td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, color: row.dr !== '—' ? '#0A0A0A' : '#B0B5BF' }}>
                    {row.dr !== '—' ? `₹${row.dr}` : '—'}
                  </span>
                </td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, color: row.cr !== '—' ? '#C0393F' : '#B0B5BF' }}>
                    {row.cr !== '—' ? `₹${row.cr}` : '—'}
                  </span>
                </td>
                <td className="right">
                  <strong className="money" style={{ fontSize: 13 }}>₹{row.balance}</strong>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Closing balance */}
          <tfoot>
            <tr style={{ background: '#F9FBFC', borderTop: '2px solid #E0E2E6' }}>
              <td colSpan={4}>
                <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#5F6368', fontFeatureSettings: 'normal' }}>
                  CLOSING BALANCE · Apr 2026
                </span>
              </td>
              <td className="right"><strong className="money" style={{ fontSize: 13 }}>₹6,60,386.00</strong></td>
              <td className="right"><strong className="money" style={{ fontSize: 13 }}>₹2,50,236.00</strong></td>
              <td className="right"><strong className="money" style={{ fontSize: 13 }}>₹8,92,150.00 Dr</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
