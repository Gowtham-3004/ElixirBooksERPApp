import { useState } from 'react';
import { PlusIcon, SearchIcon, FilterIcon, DownloadIcon, MoreVertIcon, RefreshIcon } from '../components/Icons';

type SubView = 'stock' | 'movements' | 'adjustments' | 'transfers' | 'count';

const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'stock', label: 'Stock on Hand' },
  { id: 'movements', label: 'Stock Ledger' },
  { id: 'adjustments', label: 'Adjustments' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'count', label: 'Stock Count' },
];

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

// ── Stock on Hand ─────────────────────────────────────────────────────────────
const STOCK_ITEMS = [
  { sku: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', group: 'Steel', hsn: '72084000', uom: 'MT', onHand: 48.5, reserved: 12.0, available: 36.5, inTransit: 5.0, reorder: 20, rate: 85000, value: 4122500 },
  { sku: 'STL-6MM-CR', name: 'Steel Plates 6mm CR', group: 'Steel', hsn: '72084200', uom: 'MT', onHand: 22.0, reserved: 8.0, available: 14.0, inTransit: 0, reorder: 15, rate: 92000, value: 2024000 },
  { sku: 'PKG-CRATE-L', name: 'Wooden Crates Large', group: 'Packaging', hsn: '44152090', uom: 'Nos', onHand: 340, reserved: 50, available: 290, inTransit: 100, reorder: 200, rate: 850, value: 289000 },
  { sku: 'PKG-BOX-M', name: 'Corrugated Box Medium', group: 'Packaging', hsn: '48191000', uom: 'Nos', onHand: 2400, reserved: 600, available: 1800, inTransit: 0, reorder: 1000, rate: 85, value: 204000 },
  { sku: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', group: 'Hardware', hsn: '73181500', uom: 'Nos', onHand: 8500, reserved: 2000, available: 6500, inTransit: 500, reorder: 3000, rate: 28, value: 238000 },
  { sku: 'HW-NUT-M16', name: 'Hex Nut M16', group: 'Hardware', hsn: '73182100', uom: 'Nos', onHand: 9200, reserved: 2000, available: 7200, inTransit: 500, reorder: 3000, rate: 18, value: 165600 },
  { sku: 'LUB-GRS-2', name: 'Grease EP-2 15 kg', group: 'Consumables', hsn: '27101910', uom: 'Tin', onHand: 12, reserved: 0, available: 12, inTransit: 0, reorder: 6, rate: 2800, value: 33600 },
];

function StockOnHand() {
  const [wh, setWh] = useState('All Warehouses');
  const totalValue = STOCK_ITEMS.reduce((s, i) => s + i.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Stock on Hand</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            {STOCK_ITEMS.length} items · {fmt(totalValue)} inventory value · As at 13 Sep 2026
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-secondary" style={{ gap: 5 }}><RefreshIcon size={14} />Refresh</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF', alignItems: 'center' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="SKU, item name, HSN…" /></div>
        <select className="btn-secondary btn-sm" style={{ height: 32, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' }} value={wh} onChange={(e) => setWh(e.target.value)}>
          {['All Warehouses', 'Main WH', 'Andheri WH'].map(w => <option key={w}>{w}</option>)}
        </select>
        <button className="btn-secondary btn-sm" style={{ gap: 5 }}><FilterIcon size={12} />Group</button>
        <div style={{ flex: 1 }} />
        <span className="pill pill-warning">3 items below reorder level</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th>Group</th>
              <th>UOM</th>
              <th className="right">On Hand</th>
              <th className="right">Reserved</th>
              <th className="right">Available</th>
              <th className="right">In Transit</th>
              <th className="right">Reorder Lvl</th>
              <th className="right">Avg Rate</th>
              <th className="right">Value</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {STOCK_ITEMS.map((item) => {
              const belowReorder = item.available < item.reorder;
              return (
                <tr key={item.sku} style={{ cursor: 'pointer', background: belowReorder ? '#FFF7E8' : '' }}>
                  <td><span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{item.sku}</span></td>
                  <td>
                    <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{item.name}</div>
                    <div className="cell-secondary identifier">HSN {item.hsn}</div>
                  </td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{item.group}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{item.uom}</td>
                  <td className="right"><span style={{ fontSize: 13, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>{item.onHand.toLocaleString('en-IN')}</span></td>
                  <td className="right"><span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: '"tnum" 1' }}>{item.reserved.toLocaleString('en-IN')}</span></td>
                  <td className="right">
                    <span style={{ fontSize: 13, fontWeight: 600, color: belowReorder ? '#C0393F' : '#12784E', fontFeatureSettings: '"tnum" 1' }}>
                      {item.available.toLocaleString('en-IN')}
                    </span>
                    {belowReorder && <span className="pill pill-warning" style={{ marginLeft: 6, fontSize: 10 }}>Low</span>}
                  </td>
                  <td className="right"><span style={{ fontSize: 13, color: item.inTransit > 0 ? '#325CFF' : '#B0B5BF', fontFeatureSettings: '"tnum" 1' }}>{item.inTransit > 0 ? item.inTransit.toLocaleString('en-IN') : '—'}</span></td>
                  <td className="right"><span style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: '"tnum" 1' }}>{item.reorder.toLocaleString('en-IN')}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(item.rate)}</span></td>
                  <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(item.value)}</span></td>
                  <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC', fontWeight: 600 }}>
              <td colSpan={10}><span style={{ fontSize: 13, fontWeight: 600 }}>Total Inventory Value</span></td>
              <td className="right"><span className="money" style={{ fontSize: 14, fontWeight: 700 }}>{fmt(totalValue)}</span></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Stock Movements / Ledger ───────────────────────────────────────────────────
const MOVEMENTS = [
  { date: '11 Sep 2026', type: 'GRN', ref: 'GRN/26-27/0062', item: 'Steel Plates 4mm HR', wh: 'Main WH', in: 20.0, out: 0, balance: 48.5, value: 1700000, source: 'PO/26-27/0092' },
  { date: '10 Sep 2026', type: 'DC', ref: 'DC/26-27/0098', item: 'Steel Plates 4mm HR', wh: 'Main WH', in: 0, out: 12.0, balance: 28.5, value: 1020000, source: 'SO/26-27/0128' },
  { date: '09 Sep 2026', type: 'GRN', ref: 'GRN/26-27/0061', item: 'Hex Bolt M16 × 60', wh: 'Main WH', in: 2000, out: 0, balance: 8500, value: 56000, source: 'PO/26-27/0091' },
  { date: '07 Sep 2026', type: 'ADJ', ref: 'ADJ/26-27/0012', item: 'Corrugated Box Medium', wh: 'Andheri WH', in: 0, out: 80, balance: 1200, value: 6800, source: '—' },
  { date: '05 Sep 2026', type: 'TRF', ref: 'TRF/26-27/0008', item: 'Steel Plates 4mm HR', wh: 'Main WH → Andheri', in: 0, out: 5.0, balance: 40.5, value: 425000, source: '—' },
  { date: '01 Sep 2026', type: 'GRN', ref: 'GRN/26-27/0060', item: 'Wooden Crates Large', wh: 'Andheri WH', in: 200, out: 0, balance: 340, value: 170000, source: 'PO/26-27/0090' },
];

const TYPE_COLOR: Record<string, string> = {
  GRN: '#12784E', DC: '#C0393F', ADJ: '#8A4B0F', TRF: '#3E5BA5',
};

function StockLedger() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Stock Ledger</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>All movements · Sep 2026</p>
        </div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="Item, reference…" /></div>
        <button className="btn-secondary btn-sm">All types</button>
        <button className="btn-secondary btn-sm">All warehouses</button>
        <button className="btn-secondary btn-sm">Sep 2026</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table dense">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Reference</th>
              <th>Item</th>
              <th>Warehouse</th>
              <th className="right">In</th>
              <th className="right">Out</th>
              <th className="right">Balance</th>
              <th className="right">Value</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {MOVEMENTS.map((m, i) => (
              <tr key={i} style={{ cursor: 'pointer' }}>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{m.date}</td>
                <td>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                    background: `${TYPE_COLOR[m.type]}18`, color: TYPE_COLOR[m.type],
                  }}>{m.type}</span>
                </td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{m.ref}</span></td>
                <td style={{ fontSize: 13 }}>{m.item}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{m.wh}</td>
                <td className="right"><span style={{ fontSize: 13, color: m.in > 0 ? '#12784E' : '#B0B5BF', fontFeatureSettings: '"tnum" 1' }}>{m.in > 0 ? m.in.toLocaleString('en-IN') : '—'}</span></td>
                <td className="right"><span style={{ fontSize: 13, color: m.out > 0 ? '#C0393F' : '#B0B5BF', fontFeatureSettings: '"tnum" 1' }}>{m.out > 0 ? m.out.toLocaleString('en-IN') : '—'}</span></td>
                <td className="right"><span style={{ fontSize: 13, fontWeight: 600, fontFeatureSettings: '"tnum" 1' }}>{m.balance.toLocaleString('en-IN')}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(m.value)}</span></td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{m.source}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Adjustments ───────────────────────────────────────────────────────────────
const ADJS = [
  { id: 'ADJ/26-27/0012', date: '07 Sep 2026', item: 'Corrugated Box Medium', wh: 'Andheri WH', type: 'Write-off', qty: -80, reason: 'Damaged in storage', value: 6800, approver: 'Rahul K', status: 'Posted' },
  { id: 'ADJ/26-27/0011', date: '01 Sep 2026', item: 'Grease EP-2 15 kg', wh: 'Main WH', type: 'Count variance', qty: 2, reason: 'Physical count variance', value: 5600, approver: 'Anita R', status: 'Posted' },
  { id: 'ADJ/26-27/0010', date: '25 Aug 2026', item: 'Hex Nut M16', wh: 'Main WH', type: 'Write-off', qty: -200, reason: 'Rusted — unusable', value: 3600, approver: 'Rahul K', status: 'Posted' },
  { id: 'ADJ/26-27/0009', date: '20 Aug 2026', item: 'Steel Plates 6mm CR', wh: 'Andheri WH', type: 'Count variance', qty: 0.5, reason: 'Count reconciliation', value: 46000, approver: null, status: 'Pending Approval' },
];

function Adjustments() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Stock Adjustments</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>4 adjustments · Requires approval for {">"} ₹5,000</p>
        </div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New adjustment</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>ADJ #</th>
              <th>Date</th>
              <th>Item</th>
              <th>Warehouse</th>
              <th>Type</th>
              <th className="right">Qty Change</th>
              <th>Reason</th>
              <th className="right">Value</th>
              <th>Approver</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ADJS.map((a) => (
              <tr key={a.id} style={{ cursor: 'pointer' }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{a.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{a.date}</td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{a.item}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{a.wh}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{a.type}</td>
                <td className="right">
                  <span style={{ fontSize: 13, fontWeight: 600, color: a.qty < 0 ? '#C0393F' : '#12784E', fontFeatureSettings: '"tnum" 1' }}>
                    {a.qty > 0 ? '+' : ''}{a.qty.toLocaleString('en-IN')}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#5F6368', maxWidth: 200 }}>{a.reason}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(a.value)}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{a.approver ?? '—'}</td>
                <td><span className={`badge ${a.status === 'Posted' ? 'badge-posted' : 'badge-submitted'}`}>{a.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Transfers ─────────────────────────────────────────────────────────────────
const TRANSFERS = [
  { id: 'TRF/26-27/0008', date: '05 Sep 2026', from: 'Main WH', to: 'Andheri WH', item: 'Steel Plates 4mm HR', qty: 5.0, uom: 'MT', value: 425000, status: 'Completed', transit: false },
  { id: 'TRF/26-27/0007', date: '02 Sep 2026', from: 'Main WH', to: 'Andheri WH', item: 'Wooden Crates Large', qty: 100, uom: 'Nos', value: 85000, status: 'In Transit', transit: true },
  { id: 'TRF/26-27/0006', date: '28 Aug 2026', from: 'Andheri WH', to: 'Main WH', item: 'Hex Bolt M16 × 60', qty: 1000, uom: 'Nos', value: 28000, status: 'Completed', transit: false },
  { id: 'TRF/26-27/0005', date: '22 Aug 2026', from: 'Main WH', to: 'Andheri WH', item: 'Corrugated Box Medium', qty: 400, uom: 'Nos', value: 34000, status: 'Completed', transit: false },
];

function Transfers() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Stock Transfers</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>4 transfers · 1 in transit</p>
        </div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New transfer</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>TRF #</th>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Item</th>
              <th className="right">Qty</th>
              <th>UOM</th>
              <th className="right">Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {TRANSFERS.map((t) => (
              <tr key={t.id} style={{ cursor: 'pointer', background: t.transit ? '#EBF7FF' : '' }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{t.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{t.date}</td>
                <td style={{ fontSize: 13 }}>{t.from}</td>
                <td style={{ fontSize: 13 }}>{t.to}</td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{t.item}</span></td>
                <td className="right" style={{ fontSize: 13, fontFeatureSettings: '"tnum" 1' }}>{t.qty.toLocaleString('en-IN')}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{t.uom}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(t.value)}</span></td>
                <td>
                  <span className={`badge ${t.transit ? 'badge-submitted' : 'badge-posted'}`}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stock Count ───────────────────────────────────────────────────────────────
const COUNT_LINES = [
  { sku: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', system: 48.5, counted: 48.5, variance: 0, status: 'Matched' },
  { sku: 'STL-6MM-CR', name: 'Steel Plates 6mm CR', system: 22.0, counted: 22.5, variance: 0.5, status: 'Variance' },
  { sku: 'PKG-CRATE-L', name: 'Wooden Crates Large', system: 340, counted: 338, variance: -2, status: 'Variance' },
  { sku: 'PKG-BOX-M', name: 'Corrugated Box Medium', system: 2400, counted: 2400, variance: 0, status: 'Matched' },
  { sku: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', system: 8500, counted: 8500, variance: 0, status: 'Matched' },
  { sku: 'HW-NUT-M16', name: 'Hex Nut M16', system: 9200, counted: null, variance: null, status: 'Pending' },
  { sku: 'LUB-GRS-2', name: 'Grease EP-2 15 kg', system: 12, counted: 14, variance: 2, status: 'Variance' },
];

function StockCount() {
  const [countQtys, setCountQtys] = useState<Record<string, string>>({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Stock Count</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>SC/26-27/0003 · Main WH · 13 Sep 2026 · In Progress</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary">Save progress</button>
          <button className="btn-primary" style={{ gap: 5 }}>Submit for approval</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '10px 24px', background: '#F9FBFC', borderBottom: '1px solid #EAEAEA' }}>
        <span style={{ fontSize: 13, color: '#5F6368' }}>
          <span style={{ color: '#12784E', fontWeight: 600 }}>4</span> matched ·{' '}
          <span style={{ color: '#C0393F', fontWeight: 600 }}>3</span> variances ·{' '}
          <span style={{ color: '#B0B5BF', fontWeight: 600 }}>1</span> pending
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>SKU</th>
              <th>Item</th>
              <th className="right">System Qty</th>
              <th className="right">Counted Qty</th>
              <th className="right">Variance</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {COUNT_LINES.map((l) => (
              <tr key={l.sku} style={{ background: l.status === 'Variance' ? '#FFF7E8' : l.status === 'Pending' ? '#FAFAFA' : '' }}>
                <td><span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{l.sku}</span></td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{l.name}</span></td>
                <td className="right"><span style={{ fontSize: 13, fontFeatureSettings: '"tnum" 1' }}>{l.system.toLocaleString('en-IN')}</span></td>
                <td className="right">
                  {l.status === 'Pending' ? (
                    <input
                      type="number"
                      min="0"
                      value={countQtys[l.sku] ?? ''}
                      onChange={(e) => setCountQtys(prev => ({ ...prev, [l.sku]: e.target.value }))}
                      placeholder="Enter count"
                      style={{ width: 100, height: 32, padding: '0 8px', border: '1px solid #325CFF', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', textAlign: 'right', fontFeatureSettings: '"tnum" 1', outline: 'none' }}
                    />
                  ) : (
                    <span style={{ fontSize: 13, fontFeatureSettings: '"tnum" 1' }}>
                      {l.counted?.toLocaleString('en-IN') ?? '—'}
                    </span>
                  )}
                </td>
                <td className="right">
                  {l.variance !== null ? (
                    <span style={{ fontSize: 13, fontWeight: 600, color: l.variance === 0 ? '#12784E' : '#C0393F', fontFeatureSettings: '"tnum" 1' }}>
                      {l.variance > 0 ? '+' : ''}{l.variance.toLocaleString('en-IN')}
                    </span>
                  ) : <span style={{ color: '#B0B5BF' }}>—</span>}
                </td>
                <td>
                  <span className={`badge ${l.status === 'Matched' ? 'badge-posted' : l.status === 'Variance' ? 'badge-returned' : 'badge-draft'}`}>
                    {l.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Module Shell ──────────────────────────────────────────────────────────────
interface Props { initialView?: SubView }

export default function InventoryModule({ initialView = 'stock' }: Props) {
  const [sub, setSub] = useState<SubView>(initialView);
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Inventory</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'stock' && <StockOnHand />}
        {sub === 'movements' && <StockLedger />}
        {sub === 'adjustments' && <Adjustments />}
        {sub === 'transfers' && <Transfers />}
        {sub === 'count' && <StockCount />}
      </div>
    </div>
  );
}
