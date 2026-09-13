import { useState } from 'react';
import { PlusIcon, SearchIcon, DownloadIcon, MoreVertIcon } from '../components/Icons';

type SubView = 'register' | 'depreciation' | 'disposals';
const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'register', label: 'Asset Register' },
  { id: 'depreciation', label: 'Depreciation' },
  { id: 'disposals', label: 'Disposals' },
];
function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

const ASSETS = [
  { id: 'FA-001', name: 'CNC Milling Machine', category: 'Plant & Machinery', location: 'Main WH', cost: 2500000, accumulated: 1250000, wdv: 1250000, method: 'WDV 25%', residual: 50000, useful: 8, inService: '01 Apr 2022', status: 'Active' },
  { id: 'FA-002', name: 'Office Building — Andheri', category: 'Buildings', location: 'Andheri', cost: 8500000, accumulated: 510000, wdv: 7990000, method: 'SLM 5%', residual: 0, useful: 20, inService: '01 Apr 2023', status: 'Active' },
  { id: 'FA-003', name: 'SAP ERP License', category: 'Intangibles', location: 'Head Office', cost: 1200000, accumulated: 480000, wdv: 720000, method: 'SLM 20%', residual: 0, useful: 5, inService: '01 Apr 2024', status: 'Active' },
  { id: 'FA-004', name: 'Toyota Innova Fleet (3 units)', category: 'Vehicles', location: 'Mumbai', cost: 3600000, accumulated: 2160000, wdv: 1440000, method: 'WDV 30%', residual: 180000, useful: 10, inService: '01 Apr 2021', status: 'Active' },
  { id: 'FA-005', name: 'Laptop Fleet (15 units)', category: 'Computer Equipment', location: 'Head Office', cost: 750000, accumulated: 625000, wdv: 125000, method: 'SLM 33%', residual: 0, useful: 3, inService: '01 Apr 2023', status: 'Active' },
  { id: 'FA-006', name: 'Forklift — Andheri WH', category: 'Plant & Machinery', location: 'Andheri WH', cost: 650000, accumulated: 0, wdv: 650000, method: 'WDV 25%', residual: 20000, useful: 6, inService: '01 Sep 2026', status: 'New' },
  { id: 'FA-007', name: 'Old Generator Set', category: 'Plant & Machinery', location: 'Main WH', cost: 280000, accumulated: 280000, wdv: 0, method: 'WDV 25%', residual: 0, useful: 10, inService: '01 Apr 2014', status: 'Fully Depreciated' },
];

function Register() {
  const totalCost = ASSETS.reduce((s, a) => s + a.cost, 0);
  const totalWDV = ASSETS.reduce((s, a) => s + a.wdv, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600 }}>Asset Register</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            {ASSETS.length} assets · Cost: {fmt(totalCost)} · WDV: {fmt(totalWDV)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />Add asset</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="Asset ID, name, category…" /></div>
        <button className="btn-secondary btn-sm">All categories</button>
        <button className="btn-secondary btn-sm">All locations</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Asset ID</th>
              <th>Name</th>
              <th>Category</th>
              <th>Location</th>
              <th className="right">Cost</th>
              <th className="right">Accum. Dep.</th>
              <th className="right">WDV / NBV</th>
              <th>Method</th>
              <th>In Service</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {ASSETS.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer', opacity: a.status === 'Fully Depreciated' ? 0.55 : 1 }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 12 }}>{a.id}</span></td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{a.name}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{a.category}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{a.location}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(a.cost)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#C0393F' }}>{fmt(a.accumulated)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600, color: a.wdv === 0 ? '#B0B5BF' : '#0A0A0A' }}>{fmt(a.wdv)}</span></td>
                <td style={{ fontSize: 11, color: '#5F6368' }}>{a.method}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{a.inService}</td>
                <td>
                  <span className={`badge ${a.status === 'Active' ? 'badge-active' : a.status === 'New' ? 'badge-submitted' : 'badge-cancelled'}`}>
                    {a.status}
                  </span>
                </td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC' }}>
              <td colSpan={4}><span style={{ fontSize: 13, fontWeight: 600 }}>Total</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(totalCost)}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600, color: '#C0393F' }}>{fmt(ASSETS.reduce((s, a) => s + a.accumulated, 0))}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 14, fontWeight: 700 }}>{fmt(totalWDV)}</span></td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Depreciation() {
  const DEP_RUNS = [
    { id: 'DEP-RUN-006', period: 'Aug 2026', assets: 6, amount: 94128, status: 'Posted', postedOn: '01 Sep 2026' },
    { id: 'DEP-RUN-005', period: 'Jul 2026', assets: 6, amount: 94128, status: 'Posted', postedOn: '01 Aug 2026' },
    { id: 'DEP-RUN-004', period: 'Jun 2026', assets: 6, amount: 94128, status: 'Posted', postedOn: '01 Jul 2026' },
    { id: 'DEP-RUN-003', period: 'May 2026', assets: 6, amount: 94128, status: 'Posted', postedOn: '01 Jun 2026' },
    { id: 'DEP-RUN-002', period: 'Apr 2026', assets: 5, amount: 88542, status: 'Posted', postedOn: '01 May 2026' },
  ];

  const DEP_LINES = ASSETS.filter(a => a.status !== 'Fully Depreciated').map(a => ({
    id: a.id, name: a.name, category: a.category, method: a.method,
    openWDV: a.wdv + (a.wdv * (a.method.includes('WDV 25%') ? 0.25 : a.method.includes('WDV 30%') ? 0.30 : a.method.includes('SLM 20%') ? 0.20 : a.method.includes('SLM 5%') ? 0.05 : 0.33) / 12),
    dep: Math.round(a.wdv * (a.method.includes('WDV 25%') ? 0.25 : a.method.includes('WDV 30%') ? 0.30 : a.method.includes('SLM 20%') ? 0.20 : a.method.includes('SLM 5%') ? 0.05 : 0.33) / 12),
    closeWDV: a.wdv,
  }));

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid #EAEAEA', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Depreciation Runs</span>
          <button className="btn-primary btn-sm" style={{ gap: 5 }}>Run Sep</button>
        </div>
        {DEP_RUNS.map((r) => (
          <div key={r.id} style={{ padding: '12px 16px', borderBottom: '1px solid #F5F5F5', cursor: 'pointer' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{r.period}</span>
              <span className="badge badge-posted">{r.status}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#5F6368' }}>
              <span>{r.assets} assets</span>
              <span className="money">{fmt(r.amount)}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #EAEAEA' }}>
          <h3 style={{ fontSize: 14, fontWeight: 600 }}>Aug 2026 — Depreciation Schedule</h3>
        </div>
        <table className="data-table dense">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Asset</th><th>Category</th><th>Method</th>
              <th className="right">Opening WDV</th><th className="right">Depreciation</th><th className="right">Closing WDV</th>
            </tr>
          </thead>
          <tbody>
            {DEP_LINES.map((l) => (
              <tr key={l.id}>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal', fontSize: 13 }}>{l.name}</div>
                  <div className="cell-secondary">{l.id}</div>
                </td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{l.category}</td>
                <td style={{ fontSize: 11, color: '#5F6368' }}>{l.method}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(l.openWDV)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#C0393F' }}>{fmt(l.dep)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(l.closeWDV)}</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC' }}>
              <td colSpan={3}><span style={{ fontSize: 13, fontWeight: 600 }}>Total</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(DEP_LINES.reduce((s, l) => s + l.openWDV, 0))}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 700, color: '#C0393F' }}>{fmt(DEP_LINES.reduce((s, l) => s + l.dep, 0))}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 700 }}>{fmt(DEP_LINES.reduce((s, l) => s + l.closeWDV, 0))}</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Disposals() {
  const disps = [
    { id: 'DISP-001', asset: 'Old Generator Set', assetId: 'FA-007', date: '31 Mar 2024', cost: 280000, wdvAtDisp: 0, saleProceeds: 15000, gain: 15000, status: 'Posted' },
    { id: 'DISP-002', asset: 'Old Laptop (5 units)', assetId: 'FA-EX-002', date: '30 Sep 2024', cost: 125000, wdvAtDisp: 12500, saleProceeds: 8000, gain: -4500, status: 'Posted' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Asset Disposals</h1><p style={{ fontSize: 12, color: '#5F6368' }}>2 disposal records</p></div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />Record disposal</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead><tr>
            <th>Disposal #</th><th>Asset</th><th>Date</th>
            <th className="right">Original Cost</th><th className="right">WDV at Disposal</th>
            <th className="right">Sale Proceeds</th><th className="right">Gain / (Loss)</th><th>Status</th>
          </tr></thead>
          <tbody>
            {disps.map((d) => (
              <tr key={d.id} style={{ cursor: 'pointer' }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{d.id}</span></td>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{d.asset}</div>
                  <div className="cell-secondary">{d.assetId}</div>
                </td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{d.date}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(d.cost)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(d.wdvAtDisp)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(d.saleProceeds)}</span></td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, fontWeight: 700, color: d.gain >= 0 ? '#12784E' : '#C0393F' }}>
                    {d.gain >= 0 ? '+' : ''}{fmt(d.gain)}
                  </span>
                </td>
                <td><span className="badge badge-posted">{d.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FixedAssetsModule() {
  const [sub, setSub] = useState<SubView>('register');
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Fixed Assets</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>{item.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'register' && <Register />}
        {sub === 'depreciation' && <Depreciation />}
        {sub === 'disposals' && <Disposals />}
      </div>
    </div>
  );
}
