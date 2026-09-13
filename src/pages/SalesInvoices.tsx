import { useState } from 'react';
import {
  PlusIcon, DownloadIcon, UploadIcon, SearchIcon, FilterIcon,
  SortIcon, ColumnsIcon, MoreVertIcon, ChevronDownIcon,
} from '../components/Icons';

const INVOICES = [
  { id: '0118', num: 'INV/26-27/0118', date: '21 Apr 2026', party: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', status: 'Posted', amt: '1,18,000.00', due: '21 May 2026', overdue: '12d', ovr: true },
  { id: '0117', num: 'INV/26-27/0117', date: '19 Apr 2026', party: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', status: 'Posted', amt: '2,45,000.00', due: '19 May 2026', overdue: null, ovr: false },
  { id: '0116', num: 'INV/26-27/0116', date: '18 Apr 2026', party: 'Global Tech Solutions', gstin: '27AABCG3456F1Z5', status: 'Submitted', amt: '89,500.00', due: '18 May 2026', overdue: null, ovr: false },
  { id: '0115', num: 'INV/26-27/0115', date: '17 Apr 2026', party: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', status: 'Draft', amt: '1,56,750.00', due: '—', overdue: null, ovr: false },
  { id: '0114', num: 'INV/26-27/0114', date: '16 Apr 2026', party: 'Metro Distributors', gstin: '27AABCM2345J1Z8', status: 'Posted', amt: '3,22,000.00', due: '16 May 2026', overdue: null, ovr: false },
  { id: '0113', num: 'INV/26-27/0113', date: '15 Apr 2026', party: 'Bharat Agencies', gstin: '29AABCB9012K1Z6', status: 'Posted', amt: '72,800.00', due: '15 May 2026', overdue: null, ovr: false },
  { id: '0112', num: 'INV/26-27/0112', date: '14 Apr 2026', party: 'Kiran Tech Pvt Ltd', gstin: '27AABCK7654L1Z2', status: 'Returned', amt: '44,500.00', due: '—', overdue: null, ovr: false },
  { id: '0111', num: 'INV/26-27/0111', date: '13 Apr 2026', party: 'Vimal Commodities', gstin: '24AABCV3210M1Z9', status: 'Posted', amt: '8,90,500.00', due: '13 May 2026', overdue: null, ovr: false },
  { id: '0110', num: 'INV/26-27/0110', date: '12 Apr 2026', party: 'Sunshine Exports', gstin: '29AABCS6543N1Z4', status: 'Posted', amt: '5,64,200.00', due: '12 May 2026', overdue: null, ovr: false },
  { id: '0109', num: 'INV/26-27/0109', date: '11 Apr 2026', party: 'Delta Pharma', gstin: '27AABCD1234P1Z7', status: 'Cancelled', amt: '1,25,000.00', due: '—', overdue: null, ovr: false },
];

const STATUS_BADGE: Record<string, string> = {
  'Posted': 'badge-posted',
  'Approved': 'badge-approved',
  'Draft': 'badge-draft',
  'Submitted': 'badge-submitted',
  'Returned': 'badge-returned',
  'Cancelled': 'badge-cancelled',
  'Reversed': 'badge-reversed',
  'Rejected': 'badge-rejected',
};

const TABS = [
  { label: 'All', count: 131 },
  { label: 'Draft', count: 4 },
  { label: 'Awaiting Approval', count: 2 },
  { label: 'Posted', count: 118 },
  { label: 'Overdue', count: 6 },
  { label: 'Cancelled', count: 1 },
];

interface Props {
  onViewDetail: () => void;
  onNewInvoice?: () => void;
}

export default function SalesInvoices({ onViewDetail, onNewInvoice }: Props) {
  const [activeTab, setActiveTab] = useState('All');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const filteredInvoices = INVOICES.filter((inv) => {
    if (activeTab === 'Draft') return inv.status === 'Draft';
    if (activeTab === 'Awaiting Approval') return inv.status === 'Submitted';
    if (activeTab === 'Posted') return inv.status === 'Posted';
    if (activeTab === 'Overdue') return inv.ovr;
    if (activeTab === 'Cancelled') return inv.status === 'Cancelled';
    return true;
  }).filter((inv) =>
    !search || inv.party.toLowerCase().includes(search.toLowerCase()) || inv.num.includes(search)
  );

  const totalAmt = filteredInvoices
    .filter((inv) => inv.status === 'Posted')
    .reduce((sum, inv) => sum + parseFloat(inv.amt.replace(/,/g, '')), 0);

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      setAllSelected(false);
    } else {
      setSelected(new Set(filteredInvoices.map((inv) => inv.id)));
      setAllSelected(true);
    }
  };

  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
    setAllSelected(next.size === filteredInvoices.length);
  };

  const formatIndian = (n: number) => {
    const s = n.toFixed(2);
    const [int, dec] = s.split('.');
    const lastThree = int.slice(-3);
    const rest = int.slice(0, -3);
    const withCommas = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree : lastThree;
    return '₹' + withCommas + '.' + dec;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Page header */}
      <div
        style={{
          padding: '20px 24px 0',
          background: '#FFFFFF',
          borderBottom: '1px solid #EAEAEA',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>
              Sales invoices
            </h1>
            <p style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              118 posted · <span style={{ fontFeatureSettings: '"tnum" 1' }}>₹1,42,08,400.00</span> outstanding · Mumbai branch · FY 2026–27
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary" style={{ gap: 6 }}>
              <UploadIcon size={14} />
              Import
            </button>
            <button className="btn-secondary" style={{ gap: 6 }}>
              <DownloadIcon size={14} />
              Export
              <ChevronDownIcon size={12} />
            </button>
            <button className="btn-primary" style={{ gap: 6 }} onClick={onNewInvoice}>
              <PlusIcon size={14} />
              New invoice
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 0 }}>
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 24px',
          background: '#FFFFFF',
          borderBottom: '1px solid #EAEAEA',
          flexShrink: 0,
        }}
      >
        {selected.size > 0 ? (
          /* Bulk action bar */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: '#F3F5F7',
              borderRadius: 8,
              padding: '6px 12px',
              flex: 1,
              fontFeatureSettings: 'normal',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A' }}>
              {selected.size} selected
            </span>
            <span style={{ color: '#EAEAEA' }}>·</span>
            <button className="btn-ghost btn-sm">Submit</button>
            <button className="btn-ghost btn-sm">Export</button>
            <button
              className="btn-ghost btn-sm"
              style={{ color: '#C0393F' }}
            >
              Cancel
            </button>
            <button
              className="btn-ghost btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => { setSelected(new Set()); setAllSelected(false); }}
            >
              Clear
            </button>
          </div>
        ) : (
          <>
            {/* Search */}
            <div className="search-input" style={{ width: 280 }}>
              <SearchIcon size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Number, party, reference…"
              />
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
              <ColumnsIcon size={13} />
              Columns
            </button>
            <button className="btn-ghost btn-sm" style={{ gap: 5 }}>
              <SortIcon size={13} />
              Sort
            </button>
          </>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', background: '#FFFFFF' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th style={{ width: 40, paddingLeft: 20 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  Number
                  <SortIcon size={11} />
                </span>
              </th>
              <th>Date</th>
              <th>Customer</th>
              <th>Status</th>
              <th className="right">
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  Amount
                  <SortIcon size={11} />
                </span>
              </th>
              <th>Due Date</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.map((inv) => (
              <tr
                key={inv.id}
                style={{
                  cursor: 'pointer',
                  opacity: inv.status === 'Cancelled' || inv.status === 'Reversed' ? 0.65 : 1,
                }}
                onClick={() => onViewDetail()}
              >
                <td
                  style={{ width: 40, paddingLeft: 20 }}
                  onClick={(e) => { e.stopPropagation(); toggleRow(inv.id); }}
                >
                  <input
                    type="checkbox"
                    className="checkbox"
                    checked={selected.has(inv.id)}
                    onChange={() => toggleRow(inv.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <span
                    className="identifier"
                    style={{ color: '#325CFF', fontWeight: 500, fontSize: 13 }}
                  >
                    {inv.num}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{inv.date}</span>
                </td>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{inv.party}</div>
                  <div className="cell-secondary identifier">{inv.gstin}</div>
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[inv.status] || 'badge-draft'}`}>
                    {inv.status}
                  </span>
                </td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13 }}>₹{inv.amt}</span>
                </td>
                <td>
                  {inv.due === '—' ? (
                    <span style={{ color: '#B0B5BF' }}>—</span>
                  ) : (
                    <div>
                      <div style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{inv.due}</div>
                      {inv.overdue && (
                        <span className="badge badge-overdue" style={{ marginTop: 2 }}>
                          Overdue {inv.overdue}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}>
                    <MoreVertIcon size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals + pagination */}
      <div
        style={{
          background: '#F9FBFC',
          borderTop: '1px solid #EAEAEA',
          padding: '10px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
          Totals for {filteredInvoices.length} filtered rows
          <span className="money" style={{ marginLeft: 16, fontWeight: 600, color: '#0A0A0A' }}>
            {' '}{formatIndian(totalAmt)}
          </span>
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            Show
            <select
              style={{
                margin: '0 6px',
                border: '1px solid #EAEAEA',
                borderRadius: 6,
                padding: '2px 6px',
                fontSize: 13,
                background: '#FFFFFF',
                color: '#0A0A0A',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            per page · 1–10 of 118
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, '…', 5].map((p, i) => (
              <button
                key={i}
                style={{
                  width: 28,
                  height: 28,
                  border: '1px solid',
                  borderColor: p === 1 ? '#325CFF' : '#EAEAEA',
                  borderRadius: 6,
                  background: p === 1 ? '#ECF1FD' : '#FFFFFF',
                  color: p === 1 ? '#325CFF' : '#5F6368',
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontWeight: p === 1 ? 600 : 400,
                  fontFeatureSettings: '"tnum" 1',
                }}
                onClick={() => typeof p === 'number' && setPage(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
