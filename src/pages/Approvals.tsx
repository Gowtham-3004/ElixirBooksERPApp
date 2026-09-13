import { CheckIcon, XIcon, MoreVertIcon } from '../components/Icons';

const APPROVALS = [
  { type: 'Invoice', icon: '📄', num: 'INV/26-27/0116', requester: 'Rahul Kumar · Sales', amt: '₹89,500.00', branch: 'Mumbai', submitted: '18 Apr 2026', age: '2 d', urgency: 'warning' },
  { type: 'Purchase Order', icon: '🛒', num: 'PO/26-27/0093', requester: 'Suresh Menon · Purchase', amt: '₹1,24,000.00', branch: 'Mumbai', submitted: '22 Apr 2026', age: '1 d', urgency: 'neutral' },
  { type: 'Manual Journal', icon: '📒', num: 'JV/26-27/0045', requester: 'Priya Sharma · Finance', amt: '₹18,240.00', branch: 'Mumbai', submitted: '16 Apr 2026', age: '4 d', urgency: 'critical' },
  { type: 'Payment Batch', icon: '💳', num: 'PMT-BATCH/0022', requester: 'Anita Joshi · Treasury', amt: '₹6,42,000.00', branch: 'All branches', submitted: '21 Apr 2026', age: '1 d', urgency: 'neutral' },
  { type: 'Credit Note', icon: '📋', num: 'CN/26-27/0008', requester: 'Rahul Kumar · Sales', amt: '₹12,500.00', branch: 'Mumbai', submitted: '20 Apr 2026', age: '2 d', urgency: 'warning' },
  { type: 'Purchase Order', icon: '🛒', num: 'PO/26-27/0094', requester: 'Suresh Menon · Purchase', amt: '₹78,000.00', branch: 'Pune', submitted: '22 Apr 2026', age: '1 d', urgency: 'neutral' },
  { type: 'Expense Claim', icon: '🧾', num: 'EXP/26-27/0041', requester: 'Kiran Patil · Ops', amt: '₹8,450.00', branch: 'Mumbai', submitted: '22 Apr 2026', age: '< 1 d', urgency: 'neutral' },
];

export default function Approvals() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>Approvals & Activity</h1>
            <p style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              7 pending for you · Mumbai branch · FY 2026–27
            </p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['All Types', 'Invoices', 'Purchase Orders', 'Journals', 'Payments'].map((f, i) => (
              <button
                key={f}
                className={`btn-secondary btn-sm ${i === 0 ? 'btn-primary' : ''}`}
                style={i === 0 ? { background: '#325CFF', color: '#FFFFFF', border: 'none' } : {}}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', background: '#FFFFFF' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Document</th>
              <th>Requester</th>
              <th className="right">Amount</th>
              <th>Branch</th>
              <th>Submitted</th>
              <th>Ageing</th>
              <th style={{ textAlign: 'right', paddingRight: 20 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {APPROVALS.map((item) => (
              <tr key={item.num}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: '#F3F5F5',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {item.icon}
                    </div>
                    <div>
                      <div className="identifier" style={{ fontSize: 13, fontWeight: 500, color: '#325CFF' }}>{item.num}</div>
                      <div style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>{item.type}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{item.requester}</span>
                </td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, fontWeight: 500 }}>{item.amt}</span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>{item.branch}</span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>{item.submitted}</span>
                </td>
                <td>
                  <span
                    className={`pill ${
                      item.urgency === 'critical' ? 'pill-critical' : item.urgency === 'warning' ? 'pill-warning' : 'pill-neutral'
                    }`}
                  >
                    {item.age}
                  </span>
                </td>
                <td style={{ textAlign: 'right', paddingRight: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button className="btn-secondary btn-sm" style={{ gap: 4 }}>
                      <XIcon size={12} color="#C0393F" />
                      Reject
                    </button>
                    <button className="btn-primary btn-sm" style={{ gap: 4 }}>
                      <CheckIcon size={12} />
                      Approve
                    </button>
                    <button className="btn-ghost btn-sm" style={{ padding: '0 6px' }}>
                      <MoreVertIcon size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
