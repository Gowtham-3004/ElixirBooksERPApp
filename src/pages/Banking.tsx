import { useState } from 'react';
import { PlusIcon, SearchIcon, FilterIcon, ChevronDownIcon, CheckIcon, MoreVertIcon } from '../components/Icons';

const STATEMENT_LINES = [
  { date: '22 Apr', desc: 'NEFT ARLENE TRADERS', ref: 'NEFT/042208/00412', amt: '1,18,000', type: 'Cr', matched: true, book: 'RCPT/26-27/0210', conf: 'High · 98%' },
  { date: '22 Apr', desc: 'BANK CHARGES APR', ref: 'TXN/042209/00081', amt: '236', type: 'Dr', matched: true, book: 'JV/26-27/0412', conf: 'High · 96%' },
  { date: '20 Apr', desc: 'RTGS METRO DISTRIBUTORS', ref: 'RTGS/042011/09943', amt: '3,22,000', type: 'Cr', matched: true, book: 'RCPT/26-27/0206', conf: 'High · 99%' },
  { date: '18 Apr', desc: 'UPI PAYMENT TO BHARAT AGENCIES', ref: 'UPI/042015/89341', amt: '1,88,000', type: 'Dr', matched: false, book: null, conf: null },
  { date: '15 Apr', desc: 'IMPS RAJESH ENTERPRISES ADV', ref: 'IMPS/041801/23412', amt: '2,45,000', type: 'Cr', matched: false, book: null, conf: null },
  { date: '12 Apr', desc: 'CHEQUE NO 041234 SHREE SUPPLIERS', ref: 'CHQ/041212/00234', amt: '62,000', type: 'Dr', matched: true, book: 'PMT/26-27/0180', conf: 'Medium · 72%' },
];

const ACCOUNTS = [
  { name: 'HDFC Current Account', num: '****1234', branch: 'Mumbai Main', balance: '₹8,92,150.00', status: 'Reconciled' },
  { name: 'ICICI Current Account', num: '****5678', branch: 'Andheri Branch', balance: '₹3,14,800.00', status: 'Pending' },
  { name: 'Petty Cash', num: '—', branch: 'Head Office', balance: '₹45,000.00', status: 'Reconciled' },
];

export default function Banking() {
  const [activeAccount, setActiveAccount] = useState(0);
  const [showReconcile, setShowReconcile] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleRow = (i: number) => {
    const next = new Set(selected);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setSelected(next);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>Banking</h1>
            <p style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              3 accounts · <span style={{ fontFeatureSettings: '"tnum" 1' }}>₹12,51,950.00</span> total balance · Apr 2026
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ gap: 6 }}>
              <PlusIcon size={14} />
              New voucher
            </button>
            <button
              className="btn-primary"
              style={{ gap: 6 }}
              onClick={() => setShowReconcile(!showReconcile)}
            >
              Import statement
            </button>
          </div>
        </div>

        {/* Account cards */}
        <div style={{ display: 'flex', gap: 12 }}>
          {ACCOUNTS.map((acc, i) => (
            <div
              key={i}
              onClick={() => setActiveAccount(i)}
              style={{
                flex: 1,
                padding: '14px 16px',
                border: `1px solid ${activeAccount === i ? '#325CFF' : '#EAEAEA'}`,
                borderRadius: 10,
                background: activeAccount === i ? '#F2F7FF' : '#FFFFFF',
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{acc.name}</span>
                <span className={`badge ${acc.status === 'Reconciled' ? 'badge-posted' : 'badge-returned'}`}>{acc.status}</span>
              </div>
              <div className="identifier" style={{ fontSize: 12, color: '#6E6E71', marginBottom: 8 }}>{acc.num} · {acc.branch}</div>
              <div style={{ fontSize: 18, fontWeight: 600, fontFeatureSettings: '"tnum" 1', color: '#0A0A0A' }}>{acc.balance}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Reconciliation workbench */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Summary strip */}
        <div
          style={{
            background: '#F9FBFC',
            border: '1px solid #EAEAEA',
            borderRadius: 10,
            padding: '12px 20px',
            display: 'flex',
            gap: 32,
            alignItems: 'center',
          }}
        >
          <div>
            <div className="section-label">HDFC CURRENT ****1234 · APR 2026</div>
          </div>
          {[
            { label: 'Statement', val: '₹8,92,964.00' },
            { label: 'Book', val: '₹8,92,150.00' },
            { label: 'Difference', val: '₹814.00', warn: true },
            { label: 'Unmatched', val: '2 items', warn: true },
          ].map((item) => (
            <div key={item.label}>
              <div className="section-label" style={{ marginBottom: 2 }}>{item.label}</div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontFeatureSettings: '"tnum" 1',
                  color: item.warn ? '#8A4B0F' : '#0A0A0A',
                }}
              >
                {item.val}
              </div>
            </div>
          ))}
        </div>

        {/* Statement lines */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>Statement Lines</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <div className="search-input" style={{ width: 200 }}>
                <SearchIcon size={13} />
                <input placeholder="Search…" />
              </div>
              <button className="btn-secondary btn-sm" style={{ gap: 5 }}>
                <FilterIcon size={12} />
                Filter
              </button>
            </div>
          </div>
          <table className="data-table dense">
            <thead>
              <tr>
                <th style={{ width: 36, paddingLeft: 16 }}>
                  <input type="checkbox" className="checkbox" />
                </th>
                <th>Date</th>
                <th>Description</th>
                <th>Reference</th>
                <th className="right">Amount</th>
                <th>Type</th>
                <th>Match Status</th>
                <th>Book Entry</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {STATEMENT_LINES.map((line, i) => (
                <tr
                  key={i}
                  style={{
                    background: selected.has(i) ? '#F2F7FF' : 'transparent',
                  }}
                  onClick={() => toggleRow(i)}
                >
                  <td style={{ width: 36, paddingLeft: 16 }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="checkbox"
                      checked={selected.has(i)}
                      onChange={() => toggleRow(i)}
                    />
                  </td>
                  <td style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>{line.date}</td>
                  <td>
                    <span className="identifier" style={{ fontSize: 12, color: '#0A0A0A' }}>{line.desc}</span>
                  </td>
                  <td>
                    <span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{line.ref}</span>
                  </td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13, color: line.type === 'Dr' ? '#C0393F' : '#12784E' }}>
                      ₹{line.amt}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: line.type === 'Dr' ? '#C0393F' : '#12784E',
                        fontFeatureSettings: 'normal',
                      }}
                    >
                      {line.type}
                    </span>
                  </td>
                  <td>
                    {line.matched ? (
                      <span className="badge badge-matched">Matched</span>
                    ) : (
                      <span className="badge badge-returned" style={{ background: '#FEF4EC', color: '#8A4B0F' }}>Unmatched</span>
                    )}
                  </td>
                  <td>
                    {line.book ? (
                      <span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{line.book}</span>
                    ) : (
                      <button
                        className="btn-secondary btn-sm"
                        style={{ height: 24, padding: '0 8px', fontSize: 12 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        + Create adjustment
                      </button>
                    )}
                  </td>
                  <td>
                    {line.conf ? (
                      <span
                        className={`pill ${
                          line.conf.startsWith('High') ? 'pill-good' : 'pill-warning'
                        }`}
                        style={{ fontSize: 10 }}
                      >
                        {line.conf}
                      </span>
                    ) : (
                      <span style={{ color: '#B0B5BF', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Match bar */}
        {selected.size > 0 && (
          <div
            style={{
              position: 'sticky',
              bottom: 0,
              background: '#FFFFFF',
              border: '1px solid #EAEAEA',
              borderRadius: 10,
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
            }}
          >
            <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              {selected.size} line{selected.size > 1 ? 's' : ''} selected
            </span>
            <span style={{ fontSize: 14, fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: '#0A0A0A' }}>
              ₹{selected.size === 1 ? '1,18,000.00' : '4,40,236.00'}
            </span>
            <div style={{ flex: 1 }} />
            <button className="btn-secondary" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn-primary" style={{ gap: 6 }}>
              <CheckIcon size={14} />
              Match
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
