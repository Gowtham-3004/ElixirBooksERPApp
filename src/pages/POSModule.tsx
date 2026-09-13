import { useState } from 'react';
import { PlusIcon, SearchIcon, XIcon } from '../components/Icons';

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

const CATALOG = [
  { sku: 'STL-4MM-HR', name: 'Steel Plates 4mm HR', price: 85000, tax: 18, category: 'Steel', unit: 'MT' },
  { sku: 'PKG-CRATE-L', name: 'Wooden Crates Large', price: 850, tax: 12, category: 'Packaging', unit: 'Nos' },
  { sku: 'PKG-BOX-M', name: 'Corrugated Box Medium', price: 85, tax: 12, category: 'Packaging', unit: 'Nos' },
  { sku: 'HW-BOLT-M16', name: 'Hex Bolt M16 × 60', price: 28, tax: 18, category: 'Hardware', unit: 'Nos' },
  { sku: 'HW-NUT-M16', name: 'Hex Nut M16', price: 18, tax: 18, category: 'Hardware', unit: 'Nos' },
  { sku: 'SVC-CONSULT', name: 'Consultation (per hour)', price: 2500, tax: 18, category: 'Services', unit: 'Hr' },
];

type CartLine = { sku: string; name: string; price: number; tax: number; qty: number; unit: string };

export default function POSModule() {
  const [shiftOpen, setShiftOpen] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [tender, setTender] = useState<'cash' | 'card' | 'upi'>('cash');
  const [paid, setPaid] = useState(false);

  const filtered = CATALOG.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.sku.toLowerCase().includes(search.toLowerCase())
  );

  const addItem = (item: typeof CATALOG[0]) => {
    setCart((prev) => {
      const exists = prev.find((l) => l.sku === item.sku);
      if (exists) return prev.map((l) => l.sku === item.sku ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const updateQty = (sku: string, qty: number) => {
    if (qty <= 0) { setCart((prev) => prev.filter((l) => l.sku !== sku)); return; }
    setCart((prev) => prev.map((l) => l.sku === sku ? { ...l, qty } : l));
  };

  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const taxTotal = cart.reduce((s, l) => s + (l.price * l.qty * l.tax) / 100, 0);
  const total = subtotal + taxTotal;

  if (!shiftOpen) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: '#F9FBFC' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#325CFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🖥️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0A0A0A', margin: 0 }}>POS Terminal</h2>
        <p style={{ fontSize: 14, color: '#5F6368', textAlign: 'center', margin: 0, maxWidth: 320, fontFeatureSettings: 'normal' }}>
          Terminal is closed. Open a cashier shift to start billing.
        </p>
        <div style={{ background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: 12, padding: '20px 24px', minWidth: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-label">Shift Details</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#5F6368' }}>Terminal</span><span style={{ fontWeight: 500 }}>POS-01 · Main Counter</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <span style={{ color: '#5F6368' }}>Cashier</span><span style={{ fontWeight: 500 }}>Suresh Kumar</span>
          </div>
          <div>
            <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Opening Float (₹)</label>
            <input className="field-input" defaultValue="5000" style={{ height: 40 }} />
          </div>
          <button className="btn-primary" style={{ justifyContent: 'center', height: 44 }} onClick={() => setShiftOpen(true)}>
            Open Shift
          </button>
        </div>
      </div>
    );
  }

  if (paid) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, background: '#F0FFF8' }}>
        <div style={{ fontSize: 64 }}>✅</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: '#12784E', margin: 0 }}>Payment Received</h2>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#0A0A0A', fontFeatureSettings: '"tnum" 1' }}>{fmt(total)}</div>
        <p style={{ fontSize: 14, color: '#5F6368', margin: 0 }}>Invoice POS/26-27/0041 · {tender.toUpperCase()}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn-secondary" style={{ height: 44 }}>Print receipt</button>
          <button className="btn-primary" style={{ height: 44, padding: '0 32px' }} onClick={() => { setCart([]); setPaid(false); setCustomerName(''); }}>
            New Bill
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#F7F7F7' }}>
      {/* Catalog */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* POS Header */}
        <div style={{ padding: '12px 16px', background: '#0A0A0A', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>POS-01 · Main Counter</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#FFFFFF' }}>Suresh Kumar · Shift open since 09:00</div>
          </div>
          <button
            onClick={() => setShiftOpen(false)}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFFFFF', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}
          >
            Close Shift
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
          <div className="search-input" style={{ width: '100%' }}>
            <SearchIcon size={14} />
            <input placeholder="Scan barcode or search item…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
          </div>
        </div>

        {/* Category filters */}
        <div style={{ display: 'flex', gap: 8, padding: '8px 16px', background: '#FFFFFF', borderBottom: '1px solid #EAEAEA' }}>
          {['All', 'Steel', 'Packaging', 'Hardware', 'Services'].map((cat) => (
            <button key={cat} className="filter-tab active" style={{ height: 32, padding: '0 12px', fontSize: 12 }}>{cat}</button>
          ))}
        </div>

        {/* Catalog grid */}
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {filtered.map((item) => (
              <button
                key={item.sku}
                onClick={() => addItem(item)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #EAEAEA',
                  borderRadius: 10,
                  padding: '14px 14px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontFamily: 'inherit',
                }}
                onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#325CFF'; (e.currentTarget as HTMLElement).style.background = '#F2F7FF'; }}
                onMouseOut={(e) => { (e.currentTarget as HTMLElement).style.borderColor = '#EAEAEA'; (e.currentTarget as HTMLElement).style.background = '#FFFFFF'; }}
              >
                <div style={{ fontSize: 11, color: '#5F6368', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.category}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A', lineHeight: 1.4, fontFeatureSettings: 'normal' }}>{item.name}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 15, fontWeight: 700, fontFeatureSettings: '"tnum" 1' }}>{fmt(item.price)}</span>
                  <span style={{ fontSize: 11, color: '#5F6368' }}>{item.unit} · GST {item.tax}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bill panel */}
      <div
        style={{
          width: 360,
          flexShrink: 0,
          background: '#FFFFFF',
          borderLeft: '1px solid #EAEAEA',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Customer */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #EAEAEA' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>POS/26-27/0041</span>
            <span style={{ fontSize: 11, color: '#5F6368' }}>13 Sep 2026 10:42</span>
          </div>
          <input
            className="field-input"
            style={{ height: 36, fontSize: 13 }}
            placeholder="Customer name (optional)"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
          />
        </div>

        {/* Cart */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {cart.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#B0B5BF', fontSize: 14 }}>
              Add items from the catalog
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.sku} style={{ padding: '10px 16px', borderBottom: '1px solid #F5F5F5', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, fontFeatureSettings: 'normal', marginBottom: 2 }}>{line.name}</div>
                  <div style={{ fontSize: 11, color: '#5F6368' }}>{fmt(line.price)} × {line.qty} + {line.tax}% GST</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={() => updateQty(line.sku, line.qty - 1)} style={{ width: 24, height: 24, border: '1px solid #EAEAEA', borderRadius: 4, background: '#FAFAFA', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 600, width: 28, textAlign: 'center', fontFeatureSettings: '"tnum" 1' }}>{line.qty}</span>
                  <button onClick={() => updateQty(line.sku, line.qty + 1)} style={{ width: 24, height: 24, border: '1px solid #EAEAEA', borderRadius: 4, background: '#FAFAFA', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                </div>
                <div style={{ width: 80, textAlign: 'right' }}>
                  <span className="money" style={{ fontSize: 13, fontWeight: 600 }}>
                    {fmt(line.price * line.qty * (1 + line.tax / 100))}
                  </span>
                </div>
                <button onClick={() => updateQty(line.sku, 0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0B5BF', display: 'flex' }}>
                  <XIcon size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Totals + Tender */}
        <div style={{ borderTop: '1px solid #EAEAEA', padding: '12px 16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5F6368' }}>
              <span>Subtotal</span><span className="money">{fmt(subtotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#5F6368' }}>
              <span>GST</span><span className="money">{fmt(taxTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#0A0A0A', paddingTop: 8, borderTop: '1px solid #EAEAEA' }}>
              <span>Total</span><span className="money">{fmt(total)}</span>
            </div>
          </div>

          {/* Tender */}
          <div className="section-label" style={{ marginBottom: 8 }}>Tender</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['cash', 'card', 'upi'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTender(t)}
                style={{
                  flex: 1, height: 40, border: `1.5px solid ${tender === t ? '#325CFF' : '#EAEAEA'}`,
                  borderRadius: 8, background: tender === t ? '#325CFF' : '#FAFAFA',
                  color: tender === t ? '#FFFFFF' : '#0A0A0A', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit', textTransform: 'uppercase',
                  transition: 'all 0.12s',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          <button
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center', height: 48, fontSize: 15, fontWeight: 700 }}
            disabled={cart.length === 0}
            onClick={() => setPaid(true)}
          >
            Collect {fmt(total)}
          </button>
          <button className="btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 6, color: '#5F6368' }} onClick={() => setCart([])}>
            Clear bill
          </button>
        </div>
      </div>
    </div>
  );
}
