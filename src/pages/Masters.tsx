import { PlusIcon, UploadIcon, SearchIcon, MoreVertIcon } from '../components/Icons';

const CUSTOMERS = [
  { name: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', type: 'B2B · Registered', state: 'Maharashtra', terms: 'Net 30', credit: '₹5,00,000', outstanding: '₹1,18,000', status: 'Active' },
  { name: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', type: 'B2B · Registered', state: 'Karnataka', terms: 'Net 30', credit: '₹10,00,000', outstanding: '₹2,45,000', status: 'Active' },
  { name: 'Global Tech Solutions', gstin: '27AABCG3456F1Z5', type: 'B2B · Registered', state: 'Maharashtra', terms: 'Net 45', credit: '₹8,00,000', outstanding: '₹89,500', status: 'Active' },
  { name: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', type: 'B2B · Registered', state: 'Gujarat', terms: 'Net 30', credit: '₹6,00,000', outstanding: '₹0', status: 'Active' },
  { name: 'Metro Distributors', gstin: '27AABCM2345J1Z8', type: 'B2B · Registered', state: 'Maharashtra', terms: 'Net 15', credit: '₹15,00,000', outstanding: '₹3,22,000', status: 'Active' },
  { name: 'Walk-in Customer', gstin: null, type: 'B2C · Unregistered', state: 'Maharashtra', terms: 'Immediate', credit: '₹0', outstanding: '₹0', status: 'Active' },
  { name: 'Vimal Commodities', gstin: '24AABCV3210M1Z9', type: 'B2B · Registered', state: 'Gujarat', terms: 'Net 30', credit: '₹20,00,000', outstanding: '₹8,90,500', status: 'Active' },
  { name: 'Kiran Tech Pvt Ltd', gstin: '27AABCK7654L1Z2', type: 'B2B · Registered', state: 'Maharashtra', terms: 'Net 60', credit: '₹4,00,000', outstanding: '₹44,500', status: 'Inactive' },
];

const MASTER_SECTIONS = [
  { label: 'Party', items: ['Customers', 'Suppliers', 'Employees'] },
  { label: 'Inventory', items: ['Items & Services', 'Warehouses', 'Price Lists', 'HSN / SAC Codes'] },
  { label: 'Finance', items: ['Chart of Accounts', 'Tax Rates', 'Payment Terms', 'Currencies & Rates'] },
  { label: 'Operations', items: ['Salespersons', 'Cost Centres', 'Projects', 'Number Series'] },
];

export default function Masters() {
  return (
    <div style={{ padding: 24, display: 'flex', gap: 24, height: '100%', boxSizing: 'border-box' }}>
      {/* Left nav */}
      <div style={{ width: 200, flexShrink: 0 }}>
        {MASTER_SECTIONS.map((sec) => (
          <div key={sec.label} style={{ marginBottom: 16 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>{sec.label}</div>
            {sec.items.map((item, i) => (
              <button
                key={item}
                className={`nav-item ${i === 0 && sec.label === 'Party' ? 'active' : ''}`}
                style={{ width: '100%', border: 'none', textAlign: 'left', fontFeatureSettings: 'normal' }}
              >
                {item}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: 12, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>Customers</h2>
            <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>8 records · Mumbai · FY 2026–27</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-secondary btn-sm" style={{ gap: 6 }}>
              <UploadIcon size={13} />
              Import
            </button>
            <button className="btn-primary btn-sm" style={{ gap: 6 }}>
              <PlusIcon size={13} />
              New customer
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
          <div className="search-input" style={{ width: 260 }}>
            <SearchIcon size={13} />
            <input placeholder="Name, GSTIN, email…" />
          </div>
          <button className="btn-secondary btn-sm">All states</button>
          <button className="btn-secondary btn-sm">Active</button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="data-table">
            <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th style={{ width: 36, paddingLeft: 16 }}>
                  <input type="checkbox" className="checkbox" />
                </th>
                <th>Customer</th>
                <th>Type</th>
                <th>State</th>
                <th>Terms</th>
                <th className="right">Credit Limit</th>
                <th className="right">Outstanding</th>
                <th>Status</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {CUSTOMERS.map((c) => (
                <tr key={c.name} style={{ cursor: 'pointer', opacity: c.status === 'Inactive' ? 0.6 : 1 }}>
                  <td style={{ width: 36, paddingLeft: 16 }}>
                    <input type="checkbox" className="checkbox" onClick={(e) => e.stopPropagation()} />
                  </td>
                  <td>
                    <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{c.name}</div>
                    {c.gstin && <div className="cell-secondary identifier">{c.gstin}</div>}
                  </td>
                  <td><span style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>{c.type}</span></td>
                  <td><span style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{c.state}</span></td>
                  <td><span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>{c.terms}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{c.credit}</span></td>
                  <td className="right">
                    <span
                      className="money"
                      style={{
                        fontSize: 13,
                        color: parseFloat(c.outstanding.replace(/[₹,]/g, '')) > 0 ? '#C0393F' : '#5F6368',
                      }}
                    >
                      {c.outstanding}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${c.status === 'Active' ? 'badge-active' : 'badge-cancelled'}`}>{c.status}</span>
                  </td>
                  <td>
                    <button className="btn-ghost" style={{ padding: '0 6px', height: 28 }} onClick={(e) => e.stopPropagation()}>
                      <MoreVertIcon size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
