import { RefreshIcon, DownloadIcon, TrendingUpIcon, TrendingDownIcon } from '../components/Icons';

const KPI_DATA = [
  { label: 'REVENUE', value: '₹42,18,600', delta: '↑ 8.4%', pos: true, sub: 'vs Mar 2026' },
  { label: 'GROSS MARGIN', value: '32.7%', delta: '↑ 1.2 pp', pos: true, sub: 'on ₹42.2L revenue' },
  { label: 'OPERATING EXPENSE', value: '₹10,84,000', delta: '↑ 3.1%', pos: false, sub: 'vs Mar 2026' },
  { label: 'NET PROFIT', value: '₹3,02,550', delta: '↑ 14.2%', pos: true, sub: 'before tax' },
  { label: 'AR OUTSTANDING', value: '₹18,45,200', delta: '6 overdue', pos: false, sub: 'DSO 32 days' },
  { label: 'AP OUTSTANDING', value: '₹12,30,400', delta: '↓ 4.2%', pos: true, sub: 'DPO 28 days' },
  { label: 'CASH POSITION', value: '₹12,51,950', delta: '↑ 5.3%', pos: true, sub: 'All accounts' },
  { label: 'WORKING CAPITAL', value: '₹14,67,350', delta: '↑ 2.1%', pos: true, sub: 'Current ratio 1.8' },
];

const BRANCH_DATA = [
  { branch: 'Mumbai', revenue: '₹24,18,600', margin: '34.2%', pct: 57 },
  { branch: 'Pune', revenue: '₹12,44,000', margin: '31.8%', pct: 29 },
  { branch: 'Nashik', revenue: '₹5,56,000', margin: '28.4%', pct: 14 },
];

const barData = [18, 22, 31, 24, 38, 42];
const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr'];

export default function Reports() {
  const maxVal = 50;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', marginBottom: 4 }}>CFO Dashboard</h1>
          <p style={{ fontSize: 13, color: '#6E6E71', fontFeatureSettings: 'normal' }}>
            Acme Private Limited · All branches · Apr 2026 · INR · Updated 14:32
            <span className="pill pill-neutral" style={{ marginLeft: 8 }}>Stale 6 min</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 6 }}>
            <RefreshIcon size={14} />
            Refresh
          </button>
          <button className="btn-secondary" style={{ gap: 6 }}>
            <DownloadIcon size={14} />
            Export
          </button>
        </div>
      </div>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {KPI_DATA.map((kpi) => (
          <div key={kpi.label} className="kpi-tile">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <span className="section-label">{kpi.label}</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#0A0A0A', fontFeatureSettings: '"tnum" 1', lineHeight: 1.3, marginBottom: 4 }}>
              {kpi.value}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: kpi.pos ? '#12784E' : '#C0393F', display: 'flex', alignItems: 'center', gap: 3 }}>
                {kpi.pos ? <TrendingUpIcon size={11} /> : <TrendingDownIcon size={11} />}
                {kpi.delta}
              </span>
              <span style={{ fontSize: 11, color: '#6E6E71', fontFeatureSettings: 'normal' }}>{kpi.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Revenue trend */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>Revenue Trend</h3>
            <p style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>
              All branches · INR · 6-month view
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
            {months.map((month, i) => (
              <div key={month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: '100%',
                    background: i === 5 ? '#325CFF' : '#ECF1FD',
                    borderRadius: '4px 4px 0 0',
                    height: `${(barData[i] / maxVal) * 110}px`,
                    transition: 'height 0.3s',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'center',
                    paddingTop: 4,
                  }}
                >
                  {i === 5 && (
                    <span style={{ fontSize: 10, color: '#FFFFFF', fontWeight: 600, fontFeatureSettings: '"tnum" 1' }}>
                      42L
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, color: '#5F6368', fontFeatureSettings: 'normal' }}>{month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Branch performance */}
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>Branch Performance</h3>
            <p style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>Revenue by branch · Apr 2026 · INR</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {BRANCH_DATA.map((b, i) => (
              <div key={b.branch}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{b.branch}</span>
                    <span style={{ fontSize: 12, color: '#6E6E71', marginLeft: 8, fontFeatureSettings: 'normal' }}>GM {b.margin}</span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFeatureSettings: '"tnum" 1', color: '#0A0A0A' }}>{b.revenue}</span>
                </div>
                <div style={{ height: 6, background: '#F3F5F5', borderRadius: 9999 }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${b.pct}%`,
                      background: ['#325CFF', '#22C55E', '#F97316'][i],
                      borderRadius: 9999,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom reports table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A' }}>Quick Reports</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {[
            { cat: 'Financial Statements', items: ['Trial Balance', 'Profit & Loss', 'Balance Sheet', 'Cash Flow Statement'] },
            { cat: 'AR / AP', items: ['Customer Outstanding', 'AR Ageing', 'Supplier Outstanding', 'AP Ageing'] },
            { cat: 'Tax & Compliance', items: ['GST Tax Register', 'GSTR-1 Summary', 'TDS Register', 'Advance Tax Summary'] },
          ].map((group, gi) => (
            <div
              key={group.cat}
              style={{
                padding: '16px 20px',
                borderRight: gi < 2 ? '1px solid #EAEAEA' : 'none',
              }}
            >
              <div className="section-label" style={{ marginBottom: 10 }}>{group.cat}</div>
              {group.items.map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 0',
                    borderBottom: '1px solid #F5F5F5',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 13, color: '#325CFF', fontFeatureSettings: 'normal' }}>{item}</span>
                  <DownloadIcon size={13} color="#5F6368" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
