import { useState } from 'react';
import { PlusIcon, DownloadIcon, SearchIcon, FilterIcon, MoreVertIcon, SortIcon, ChevronDownIcon } from '../components/Icons';

const ORDERS = [
  { id: '0093', num: 'PO/26-27/0093', date: '22 Apr 2026', supplier: 'Shree Suppliers Ltd', gstin: '29AABCS5432Q1Z2', status: 'Submitted', amt: '1,24,000.00', recv: '0%' },
  { id: '0092', num: 'PO/26-27/0092', date: '20 Apr 2026', supplier: 'Bharat Agencies', gstin: '29AABCB9012K1Z6', status: 'Approved', amt: '78,400.00', recv: '0%' },
  { id: '0091', num: 'PO/26-27/0091', date: '18 Apr 2026', supplier: 'Global Inputs Pvt Ltd', gstin: '27AABCG8765R1Z3', status: 'Approved', amt: '3,45,800.00', recv: '60%' },
  { id: '0090', num: 'PO/26-27/0090', date: '16 Apr 2026', supplier: 'Vinod Trading Co.', gstin: '24AABCV1234S1Z8', status: 'Posted', amt: '2,12,600.00', recv: '100%' },
  { id: '0089', num: 'PO/26-27/0089', date: '14 Apr 2026', supplier: 'Suresh Commodities', gstin: '29AABCS6789T1Z5', status: 'Posted', amt: '98,200.00', recv: '100%' },
  { id: '0088', num: 'PO/26-27/0088', date: '12 Apr 2026', supplier: 'Nirmala Exports', gstin: '27AABCN3456U1Z1', status: 'Cancelled', amt: '65,000.00', recv: '0%' },
  { id: '0087', num: 'PO/26-27/0087', date: '10 Apr 2026', supplier: 'Shree Suppliers Ltd', gstin: '29AABCS5432Q1Z2', status: 'Posted', amt: '1,88,000.00', recv: '100%' },
];

const STATUS_BADGE: Record<string, string> = {
  'Draft': 'badge-draft',
  'Submitted': 'badge-submitted',
  'Approved': 'badge-approved',
  'Posted': 'badge-posted',
  'Cancelled': 'badge-cancelled',
};

const TABS = [
  { label: 'All', count: 47 },
  { label: 'Draft', count: 2 },
  { label: 'Awaiting Approval', count: 3 },
  { label: 'Approved', count: 8 },
  { label: 'Partially Received', count: 5 },
  { label: 'Closed', count: 29 },
];

export default function PurchaseOrders() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');

  const filtered = ORDERS.filter((o) => {
    if (activeTab === 'Draft') return o.status === 'Draft';
    if (activeTab === 'Awaiting Approval') return o.status === 'Submitted';
    if (activeTab === 'Approved') return o.status === 'Approved';
    if (activeTab === 'Partially Received') return parseFloat(o.recv) > 0 && parseFloat(o.recv) < 100;
    if (activeTab === 'Closed') return o.status === 'Posted' || o.status === 'Cancelled';
    return true;
  }).filter((o) => !search || o.supplier.toLowerCase().includes(search.toLowerCase()) || o.num.includes(search));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 0', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>Purchase orders</h1>
            <p style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              47 orders · <span style={{ fontFeatureSettings: '"tnum" 1' }}>₹12,30,400.00</span> AP outstanding · Mumbai branch · FY 2026–27
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ gap: 6 }}>
              <DownloadIcon size={14} />
              Export
            </button>
            <button className="btn-primary" style={{ gap: 6 }}>
              <PlusIcon size={14} />
              New PO
            </button>
          </div>
        </div>
        <div style={{ display: 'flex' }}>
          {TABS.map((tab) => (
            <button
              key={tab.label}
              className={`filter-tab ${activeTab === tab.label ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.label)}
            >
              {tab.label}
              <span
                style={{
                  background: activeTab === tab.label ? '#ECF1FD' : '#F3F5F5',
                  color: activeTab === tab.label ? '#325CFF' : '#5F6368',
                  borderRadius: 9999,
                  padding: '0 6px',
                  fontSize: 11,
                  fontWeight: 600,
                  lineHeight: '18px',
                  fontFeatureSettings: '"tnum" 1',
                }}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 24px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <div className="search-input" style={{ width: 280 }}>
          <SearchIcon size={14} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Number, supplier, reference…" />
        </div>
        <button className="btn-secondary btn-sm" style={{ gap: 6 }}>
          <FilterIcon size={13} />
          Filters
        </button>
        <button className="btn-secondary btn-sm" style={{ gap: 6, fontFeatureSettings: 'normal' }}>
          Saved view: Mine
          <ChevronDownIcon size={12} />
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn-ghost btn-sm" style={{ gap: 5 }}>
          <SortIcon size={13} />
          Sort
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', background: '#FFFFFF' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ width: 40, paddingLeft: 20 }}>
                <input type="checkbox" className="checkbox" />
              </th>
              <th>Number</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Status</th>
              <th className="right">Amount</th>
              <th>Received</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const recvPct = parseFloat(row.recv);
              return (
                <tr key={row.id} style={{ cursor: 'pointer' }}>
                  <td style={{ width: 40, paddingLeft: 20 }}>
                    <input type="checkbox" className="checkbox" onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td>
                    <span className="identifier" style={{ color: '#325CFF', fontWeight: 500, fontSize: 13 }}>
                      {row.num}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{row.date}</span></td>
                  <td>
                    <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{row.supplier}</div>
                    <div className="cell-secondary identifier">{row.gstin}</div>
                  </td>
                  <td><span className={`badge ${STATUS_BADGE[row.status] || 'badge-draft'}`}>{row.status}</span></td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13 }}>₹{row.amt}</span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 4, background: '#F3F5F5', borderRadius: 9999 }}>
                        <div
                          style={{
                            height: '100%',
                            width: row.recv,
                            background: recvPct === 100 ? '#12784E' : recvPct > 0 ? '#F97316' : '#EAEAEA',
                            borderRadius: 9999,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: '"tnum" 1' }}>{row.recv}</span>
                    </div>
                  </td>
                  <td>
                    <button className="btn-ghost" style={{ padding: '0 6px', height: 28 }} onClick={(e) => e.stopPropagation()}>
                      <MoreVertIcon size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ background: '#F9FBFC', borderTop: '1px solid #EAEAEA', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
          Totals for {filtered.length} filtered rows
          <strong className="money" style={{ marginLeft: 16, color: '#0A0A0A' }}> ₹9,12,000.00</strong>
        </span>
        <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>1–7 of 47 · Page 1 of 7</span>
      </div>
    </div>
  );
}
