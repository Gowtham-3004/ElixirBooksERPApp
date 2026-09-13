import { TrendingUpIcon, TrendingDownIcon, MoreVertIcon, RefreshIcon } from '../components/Icons';

const revenueData = [28, 35, 42, 31, 48, 52, 42];
const expenseData = [18, 22, 28, 19, 31, 35, 28];
const months = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

interface DashboardProps {
  onNavigate: (view: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const maxVal = 60;

  return (
    <div style={{ padding: 24, maxWidth: 1200 }}>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>
          Good afternoon, Rahul
        </h1>
        <p style={{ fontSize: 14, color: '#5F6368' }}>
          Acme Private Limited · Mumbai · Apr 2026 · Last updated 14:32
        </p>
      </div>

      {/* KPI tiles row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          {
            label: 'REVENUE',
            value: '₹42,18,600',
            sub: 'Apr 2026',
            delta: '↑ 8.4% vs Mar',
            pos: true,
            color: '#325CFF',
          },
          {
            label: 'AR OUTSTANDING',
            value: '₹18,45,200',
            sub: '23 open invoices',
            delta: '↑ 2.1% — 6 overdue',
            pos: false,
            color: '#C0393F',
          },
          {
            label: 'AP OUTSTANDING',
            value: '₹12,30,400',
            sub: '11 open bills',
            delta: '↓ 4.2% vs Mar',
            pos: true,
            color: '#12784E',
          },
          {
            label: 'CASH POSITION',
            value: '₹8,92,150',
            sub: 'All accounts · INR',
            delta: '↑ 5.3% vs Mar',
            pos: true,
            color: '#12784E',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="kpi-tile">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span className="section-label">{kpi.label}</span>
              <button className="btn-ghost" style={{ padding: '0 4px', height: 24 }}>
                <MoreVertIcon size={14} />
              </button>
            </div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: '#0A0A0A',
                fontFeatureSettings: '"tnum" 1',
                lineHeight: 1.3,
                marginBottom: 4,
              }}
            >
              {kpi.value}
            </div>
            <div style={{ fontSize: 12, color: '#6E6E71', marginBottom: 8 }}>{kpi.sub}</div>
            <div
              style={{
                fontSize: 12,
                color: kpi.pos ? '#12784E' : '#C0393F',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              {kpi.pos ? <TrendingUpIcon size={12} /> : <TrendingDownIcon size={12} />}
              {kpi.delta}
            </div>
            {/* Mini progress bar */}
            <div
              style={{
                marginTop: 12,
                height: 3,
                background: '#F3F5F5',
                borderRadius: 9999,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: '62%',
                  background: kpi.color,
                  borderRadius: 9999,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Revenue vs Expenses chart */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>
                Revenue vs Expenses
              </h3>
              <p style={{ fontSize: 12, color: '#6E6E71' }}>
                Acme Private Limited · All branches · INR · Updated 14:32
              </p>
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5F6368' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#325CFF' }} />
                Revenue
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#5F6368' }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: '#F97316' }} />
                Expenses
              </div>
              <button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}>
                <RefreshIcon size={13} />
              </button>
            </div>
          </div>
          {/* SVG Bar chart */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 140 }}>
            {months.map((month, i) => (
              <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 120 }}>
                  <div
                    style={{
                      width: '100%',
                      minWidth: 12,
                      background: i === 6 ? '#325CFF' : '#ECF1FD',
                      borderRadius: '3px 3px 0 0',
                      height: `${(revenueData[i] / maxVal) * 120}px`,
                      transition: 'height 0.3s',
                    }}
                  />
                  <div
                    style={{
                      width: '100%',
                      minWidth: 12,
                      background: i === 6 ? '#F97316' : '#FEF4EC',
                      borderRadius: '3px 3px 0 0',
                      height: `${(expenseData[i] / maxVal) * 120}px`,
                      transition: 'height 0.3s',
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: '#5F6368', fontFeatureSettings: 'normal' }}>{month}</span>
              </div>
            ))}
          </div>
          {/* Y-axis labels */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: '#5F6368' }}>₹0</span>
            <span style={{ fontSize: 11, color: '#5F6368' }}>₹60L</span>
          </div>
        </div>

        {/* Top customers */}
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>
            Top Customers
          </h3>
          <p style={{ fontSize: 12, color: '#6E6E71', marginBottom: 16 }}>
            By revenue · Apr 2026 · INR
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {[
              { name: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', amt: '₹4,80,000', pct: 82 },
              { name: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', amt: '₹3,22,000', pct: 55 },
              { name: 'Metro Distributors', gstin: '27AABCM2345J1Z8', amt: '₹2,56,000', pct: 44 },
              { name: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', amt: '₹1,89,500', pct: 32 },
            ].map((cust, i) => (
              <div key={cust.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{cust.name}</div>
                    <div className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{cust.gstin}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: '#0A0A0A' }}>{cust.amt}</span>
                </div>
                <div style={{ height: 4, background: '#F3F5F5', borderRadius: 9999 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${cust.pct}%`,
                      background: ['#325CFF', '#22C55E', '#F97316', '#38BDF8'][i],
                      borderRadius: 9999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom row: Recent transactions + Pending approvals + Period status */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        {/* Recent transactions */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #EAEAEA',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A' }}>
              Recent Documents
            </h3>
            <button
              className="btn-ghost"
              onClick={() => onNavigate('invoices')}
              style={{ fontSize: 13, color: '#325CFF', padding: '0 8px' }}
            >
              View all →
            </button>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Number</th>
                <th>Type</th>
                <th>Party</th>
                <th className="right">Amount</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {[
                { num: 'INV/26-27/0118', type: 'Invoice', party: 'Arlene Traders', amt: '₹1,18,000.00', status: 'Posted', cls: 'badge-posted', date: '21 Apr 2026' },
                { num: 'RCPT/26-27/0210', type: 'Receipt', party: 'Rajesh Enterprises', amt: '₹2,45,000.00', status: 'Posted', cls: 'badge-posted', date: '20 Apr 2026' },
                { num: 'PO/26-27/0092', type: 'Purchase Order', party: 'Shree Suppliers Ltd', amt: '₹78,400.00', status: 'Approved', cls: 'badge-approved', date: '20 Apr 2026' },
                { num: 'INV/26-27/0117', type: 'Invoice', party: 'Metro Distributors', amt: '₹3,22,000.00', status: 'Posted', cls: 'badge-posted', date: '19 Apr 2026' },
                { num: 'GRN/26-27/0047', type: 'GRN', party: 'Bharat Agencies', amt: '₹52,600.00', status: 'Posted', cls: 'badge-posted', date: '18 Apr 2026' },
                { num: 'INV/26-27/0116', type: 'Invoice', party: 'Global Tech Solutions', amt: '₹89,500.00', status: 'Submitted', cls: 'badge-submitted', date: '18 Apr 2026' },
              ].map((row) => (
                <tr key={row.num} style={{ cursor: 'pointer' }}>
                  <td>
                    <span
                      className="identifier"
                      style={{ color: '#325CFF', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
                      onClick={() => row.type === 'Invoice' && onNavigate('invoice-detail')}
                    >
                      {row.num}
                    </span>
                  </td>
                  <td><span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>{row.type}</span></td>
                  <td>
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>
                      {row.party}
                    </span>
                  </td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13 }}>{row.amt}</span>
                  </td>
                  <td><span className={`badge ${row.cls}`}>{row.status}</span></td>
                  <td><span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>{row.date}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Pending approvals */}
          <div className="card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A' }}>Pending Approvals</h3>
              <span className="badge badge-submitted" style={{ fontFeatureSettings: '"tnum" 1' }}>7</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'INV/26-27/0116', sub: 'Global Tech · ₹89,500', age: '2 d', cls: 'pill-warning' },
                { label: 'PO/26-27/0093', sub: 'Shree Suppliers · ₹1,24,000', age: '1 d', cls: 'pill-neutral' },
                { label: 'JV/26-27/0045', sub: 'Manual Journal · ₹18,240', age: '4 d', cls: 'pill-critical' },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 0',
                    borderBottom: '1px solid #F5F5F5',
                  }}
                >
                  <div>
                    <div className="identifier" style={{ fontSize: 13, fontWeight: 500, color: '#325CFF' }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>{item.sub}</div>
                  </div>
                  <span className={`pill ${item.cls}`}>{item.age}</span>
                </div>
              ))}
            </div>
            <button
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              onClick={() => onNavigate('approvals')}
            >
              View all approvals
            </button>
          </div>

          {/* Period status */}
          <div className="card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 14 }}>
              Period Status
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { period: 'Apr 2026', status: 'Open', cls: 'badge-open' },
                { period: 'Mar 2026', status: 'Locked', cls: 'badge-locked' },
                { period: 'Feb 2026', status: 'Locked', cls: 'badge-locked' },
                { period: 'Jan 2026', status: 'Locked', cls: 'badge-locked' },
              ].map((p) => (
                <div
                  key={p.period}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '6px 0',
                    borderBottom: '1px solid #F5F5F5',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{p.period}</span>
                  <span className={`badge ${p.cls}`}>{p.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
