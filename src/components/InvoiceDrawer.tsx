import { useState, useEffect } from 'react';
import { XIcon, PlusIcon, ChevronDownIcon, SearchIcon } from './Icons';

interface LineItem {
  id: number;
  item: string;
  desc: string;
  qty: string;
  unit: string;
  rate: string;
  tax: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave?: () => void;
}

const CUSTOMERS = [
  'Arlene Traders',
  'Rajesh Enterprises',
  'Global Tech Solutions',
  'Sunrise Industries',
  'Metro Distributors',
  'Vimal Commodities',
];

const ITEMS = [
  { label: 'Steel Plates 4mm', hsn: '72084000', rate: '85000', tax: '18' },
  { label: 'Consultancy Services', hsn: '998311', rate: '25000', tax: '18' },
  { label: 'Transport Charges', hsn: '996511', rate: '5000', tax: '5' },
  { label: 'Packing Material', hsn: '39232990', rate: '1200', tax: '12' },
];

let nextId = 4;

function formatNum(val: string): string {
  const n = parseFloat(val);
  return isNaN(n) ? '0.00' : n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export default function InvoiceDrawer({ open, onClose, onSave }: Props) {
  const [customer, setCustomer] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustDropdown, setShowCustDropdown] = useState(false);
  const [date, setDate] = useState('2026-09-13');
  const [dueDate, setDueDate] = useState('2026-10-13');
  const [terms, setTerms] = useState('Net 30');
  const [ref, setRef] = useState('');
  const [lines, setLines] = useState<LineItem[]>([
    { id: 1, item: '', desc: '', qty: '1', unit: 'Nos', rate: '', tax: '18' },
  ]);
  const [saving, setSaving] = useState(false);

  // Slide-in: reset on open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const filteredCustomers = CUSTOMERS.filter((c) =>
    c.toLowerCase().includes(customerQuery.toLowerCase())
  );

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { id: nextId++, item: '', desc: '', qty: '1', unit: 'Nos', rate: '', tax: '18' },
    ]);
  };

  const removeLine = (id: number) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const updateLine = (id: number, field: keyof LineItem, value: string) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  };

  const setItemFromCatalog = (lineId: number, cat: typeof ITEMS[0]) => {
    setLines((prev) =>
      prev.map((l) =>
        l.id === lineId ? { ...l, item: cat.label, rate: cat.rate, tax: cat.tax, desc: `HSN ${cat.hsn}` } : l
      )
    );
  };

  const subtotal = lines.reduce((sum, l) => {
    const qty = parseFloat(l.qty) || 0;
    const rate = parseFloat(l.rate) || 0;
    return sum + qty * rate;
  }, 0);

  const taxTotal = lines.reduce((sum, l) => {
    const qty = parseFloat(l.qty) || 0;
    const rate = parseFloat(l.rate) || 0;
    const tax = parseFloat(l.tax) || 0;
    return sum + (qty * rate * tax) / 100;
  }, 0);

  const total = subtotal + taxTotal;

  const handleSave = (mode: 'draft' | 'submit' | 'post') => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      if (onSave) onSave();
      onClose();
    }, 800);
  };

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 740,
          maxWidth: '100vw',
          background: '#FFFFFF',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 48px rgba(0,0,0,0.12)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '0 24px',
            height: 56,
            borderBottom: '1px solid #EAEAEA',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              onClick={onClose}
              className="btn-ghost"
              style={{ padding: '0 8px', width: 32, height: 32, borderRadius: 6 }}
            >
              <XIcon size={16} />
            </button>
            <div>
              <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A' }}>New Sales Invoice</h2>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#5F6368', alignSelf: 'center' }}>Draft · INV/26-27/—</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
          {/* Customer + header fields */}
          <div
            style={{
              background: '#F9FBFC',
              border: '1px solid #EAEAEA',
              borderRadius: 10,
              padding: '16px 18px',
              marginBottom: 20,
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              {/* Customer picker */}
              <div style={{ gridColumn: '1 / -1', position: 'relative' }}>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                  Bill To *
                </label>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 44,
                    padding: '0 12px',
                    background: '#FFFFFF',
                    border: `1px solid ${showCustDropdown ? '#325CFF' : '#EAEAEA'}`,
                    borderRadius: 8,
                    cursor: 'text',
                    boxShadow: showCustDropdown ? '0 0 0 3px rgba(50,92,255,0.12)' : 'none',
                    transition: 'border-color 0.12s, box-shadow 0.12s',
                  }}
                  onClick={() => setShowCustDropdown(true)}
                >
                  <SearchIcon size={14} color="#B0B5BF" />
                  <input
                    style={{
                      flex: 1,
                      border: 'none',
                      outline: 'none',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      background: 'none',
                      color: customer ? '#0A0A0A' : '#B0B5BF',
                    }}
                    placeholder="Search customer…"
                    value={customer || customerQuery}
                    onChange={(e) => {
                      setCustomerQuery(e.target.value);
                      setCustomer('');
                      setShowCustDropdown(true);
                    }}
                    onFocus={() => setShowCustDropdown(true)}
                    onBlur={() => setTimeout(() => setShowCustDropdown(false), 150)}
                  />
                  {customer && (
                    <button
                      onMouseDown={(e) => { e.preventDefault(); setCustomer(''); setCustomerQuery(''); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0B5BF', display: 'flex' }}
                    >
                      <XIcon size={14} />
                    </button>
                  )}
                </div>
                {showCustDropdown && filteredCustomers.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: '#FFFFFF',
                      border: '1px solid #EAEAEA',
                      borderRadius: 8,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
                      zIndex: 10,
                      overflow: 'hidden',
                    }}
                  >
                    {filteredCustomers.map((c) => (
                      <div
                        key={c}
                        onMouseDown={() => { setCustomer(c); setCustomerQuery(c); setShowCustDropdown(false); }}
                        style={{
                          padding: '10px 14px',
                          fontSize: 14,
                          color: '#0A0A0A',
                          cursor: 'pointer',
                          borderBottom: '1px solid #F5F5F5',
                        }}
                        onMouseOver={(e) => (e.currentTarget.style.background = '#F2F7FF')}
                        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        {c}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Date */}
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Invoice Date *</label>
                <input
                  type="date"
                  className="field-input"
                  style={{ height: 44 }}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              {/* Due date */}
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Due Date</label>
                <input
                  type="date"
                  className="field-input"
                  style={{ height: 44 }}
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              {/* Payment terms */}
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Payment Terms</label>
                <select
                  className="field-input"
                  style={{ height: 44 }}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                >
                  {['Immediate', 'Net 7', 'Net 15', 'Net 30', 'Net 45', 'Net 60'].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Reference */}
              <div>
                <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>PO / Reference</label>
                <input
                  className="field-input"
                  style={{ height: 44 }}
                  placeholder="Customer PO number"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Line items */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0A0A0A' }}>Line Items</h3>
              <button className="btn-secondary btn-sm" onClick={addLine} style={{ gap: 5 }}>
                <PlusIcon size={12} />
                Add line
              </button>
            </div>

            <div
              style={{
                border: '1px solid #EAEAEA',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              {/* Column headers */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 80px 80px 80px 36px',
                  gap: 0,
                  background: '#F9FBFC',
                  borderBottom: '1px solid #EAEAEA',
                  padding: '0 12px',
                  height: 36,
                  alignItems: 'center',
                }}
              >
                {['Item / Description', 'HSN / SAC', 'Qty', 'Rate (₹)', 'Tax %', ''].map((h) => (
                  <span
                    key={h}
                    className="section-label"
                    style={{ fontSize: 10, paddingRight: 8 }}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {/* Line rows */}
              {lines.map((line, idx) => (
                <div
                  key={line.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 80px 80px 80px 36px',
                    gap: 0,
                    borderBottom: idx < lines.length - 1 ? '1px solid #F5F5F5' : 'none',
                    padding: '8px 12px',
                    alignItems: 'start',
                  }}
                >
                  {/* Item */}
                  <div style={{ paddingRight: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        placeholder="Search item…"
                        style={{
                          width: '100%',
                          height: 36,
                          padding: '0 10px',
                          border: '1px solid #EAEAEA',
                          borderRadius: 6,
                          fontSize: 13,
                          fontFamily: 'inherit',
                          outline: 'none',
                          color: '#0A0A0A',
                          background: '#FFFFFF',
                          boxSizing: 'border-box',
                        }}
                        value={line.item}
                        onChange={(e) => updateLine(line.id, 'item', e.target.value)}
                        onFocus={(e) => (e.target.style.borderColor = '#325CFF')}
                        onBlur={(e) => (e.target.style.borderColor = '#EAEAEA')}
                      />
                      {/* Quick catalog suggestions */}
                      {line.item === '' && (
                        <div
                          style={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            marginTop: 3,
                            background: '#FFFFFF',
                            border: '1px solid #EAEAEA',
                            borderRadius: 6,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                            zIndex: 5,
                            display: 'none',
                          }}
                          className="line-item-dropdown"
                        >
                          {ITEMS.map((cat) => (
                            <div
                              key={cat.label}
                              onMouseDown={() => setItemFromCatalog(line.id, cat)}
                              style={{ padding: '8px 12px', fontSize: 12, cursor: 'pointer', color: '#0A0A0A' }}
                            >
                              {cat.label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      placeholder="Description (optional)"
                      style={{
                        width: '100%',
                        height: 28,
                        padding: '0 10px',
                        border: '1px solid transparent',
                        borderRadius: 4,
                        fontSize: 11,
                        fontFamily: 'inherit',
                        outline: 'none',
                        color: '#5F6368',
                        background: 'none',
                        marginTop: 4,
                        boxSizing: 'border-box',
                      }}
                      value={line.desc}
                      onChange={(e) => updateLine(line.id, 'desc', e.target.value)}
                      onFocus={(e) => {
                        e.target.style.background = '#F9FBFC';
                        e.target.style.borderColor = '#EAEAEA';
                      }}
                      onBlur={(e) => {
                        e.target.style.background = 'none';
                        e.target.style.borderColor = 'transparent';
                      }}
                    />
                  </div>

                  {/* Qty */}
                  <div style={{ paddingRight: 8 }}>
                    <input
                      type="number"
                      min="0"
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 8px',
                        border: '1px solid #EAEAEA',
                        borderRadius: 6,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                        color: '#0A0A0A',
                        textAlign: 'right',
                        fontFeatureSettings: '"tnum" 1',
                        boxSizing: 'border-box',
                      }}
                      value={line.qty}
                      onChange={(e) => updateLine(line.id, 'qty', e.target.value)}
                      onFocus={(e) => (e.target.style.borderColor = '#325CFF')}
                      onBlur={(e) => (e.target.style.borderColor = '#EAEAEA')}
                    />
                  </div>

                  {/* Rate */}
                  <div style={{ paddingRight: 8 }}>
                    <input
                      type="number"
                      min="0"
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 8px',
                        border: '1px solid #EAEAEA',
                        borderRadius: 6,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        outline: 'none',
                        color: '#0A0A0A',
                        textAlign: 'right',
                        fontFeatureSettings: '"tnum" 1',
                        boxSizing: 'border-box',
                      }}
                      placeholder="0"
                      value={line.rate}
                      onChange={(e) => updateLine(line.id, 'rate', e.target.value)}
                      onFocus={(e) => (e.target.style.borderColor = '#325CFF')}
                      onBlur={(e) => (e.target.style.borderColor = '#EAEAEA')}
                    />
                  </div>

                  {/* Tax % */}
                  <div style={{ paddingRight: 8 }}>
                    <select
                      style={{
                        width: '100%',
                        height: 36,
                        padding: '0 6px',
                        border: '1px solid #EAEAEA',
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: 'inherit',
                        outline: 'none',
                        color: '#0A0A0A',
                        background: '#FFFFFF',
                        boxSizing: 'border-box',
                        appearance: 'none',
                      }}
                      value={line.tax}
                      onChange={(e) => updateLine(line.id, 'tax', e.target.value)}
                    >
                      {['0', '3', '5', '12', '18', '28'].map((t) => (
                        <option key={t} value={t}>{t}%</option>
                      ))}
                    </select>
                  </div>

                  {/* Remove */}
                  <div>
                    {lines.length > 1 && (
                      <button
                        onClick={() => removeLine(line.id)}
                        style={{
                          width: 28,
                          height: 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: 'none',
                          border: '1px solid #EAEAEA',
                          borderRadius: 6,
                          cursor: 'pointer',
                          color: '#B0B5BF',
                          marginTop: 4,
                        }}
                        onMouseOver={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = '#FFF5F6';
                          (e.currentTarget as HTMLButtonElement).style.color = '#C0393F';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#F5C2C4';
                        }}
                        onMouseOut={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.background = 'none';
                          (e.currentTarget as HTMLButtonElement).style.color = '#B0B5BF';
                          (e.currentTarget as HTMLButtonElement).style.borderColor = '#EAEAEA';
                        }}
                      >
                        <XIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Add line row */}
              <div
                style={{
                  padding: '10px 12px',
                  borderTop: '1px solid #F5F5F5',
                }}
              >
                <button
                  onClick={addLine}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#325CFF',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: 0,
                  }}
                >
                  <PlusIcon size={12} color="#325CFF" />
                  Add another line
                </button>
              </div>
            </div>
          </div>

          {/* Notes + Totals side-by-side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20 }}>
            {/* Notes */}
            <div>
              <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>Notes for customer</label>
              <textarea
                style={{
                  width: '100%',
                  height: 100,
                  padding: '10px 12px',
                  border: '1px solid #EAEAEA',
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  resize: 'vertical',
                  color: '#0A0A0A',
                  boxSizing: 'border-box',
                }}
                placeholder="Payment details, thank-you note, terms…"
                onFocus={(e) => (e.target.style.borderColor = '#325CFF')}
                onBlur={(e) => (e.target.style.borderColor = '#EAEAEA')}
              />
            </div>

            {/* Totals ladder */}
            <div
              style={{
                background: '#F9FBFC',
                border: '1px solid #EAEAEA',
                borderRadius: 10,
                padding: '14px 16px',
              }}
            >
              <div className="ladder-row" style={{ marginBottom: 6 }}>
                <span className="ladder-label">Subtotal</span>
                <span className="ladder-value" style={{ fontSize: 13 }}>₹{formatNum(subtotal.toString())}</span>
              </div>
              <div className="ladder-row" style={{ marginBottom: 6 }}>
                <span className="ladder-label">GST / Tax</span>
                <span className="ladder-value" style={{ fontSize: 13 }}>₹{formatNum(taxTotal.toString())}</span>
              </div>
              <div
                style={{
                  height: 1,
                  background: '#EAEAEA',
                  margin: '10px 0',
                }}
              />
              <div className="ladder-row">
                <span className="ladder-label" style={{ fontSize: 13, color: '#0A0A0A', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                  Total
                </span>
                <span className="ladder-value large">₹{formatNum(total.toString())}</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: '#5F6368', marginBottom: 4 }}>Tax breakdown</div>
                {[0, 5, 12, 18, 28].map((rate) => {
                  const taxable = lines
                    .filter((l) => parseInt(l.tax) === rate)
                    .reduce((s, l) => s + (parseFloat(l.qty) || 0) * (parseFloat(l.rate) || 0), 0);
                  if (taxable === 0) return null;
                  return (
                    <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#5F6368', marginBottom: 2 }}>
                      <span>GST {rate}%</span>
                      <span className="money">₹{formatNum(((taxable * rate) / 100).toString())}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 24px',
            borderTop: '1px solid #EAEAEA',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#FFFFFF',
            flexShrink: 0,
            gap: 10,
          }}
        >
          <button className="btn-ghost" onClick={onClose}>
            Discard
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-secondary"
              onClick={() => handleSave('draft')}
              disabled={saving}
            >
              Save as Draft
            </button>
            <button
              className="btn-secondary"
              onClick={() => handleSave('submit')}
              disabled={saving}
              style={{ borderColor: '#325CFF', color: '#325CFF' }}
            >
              Submit for Approval
            </button>
            <button
              className="btn-primary"
              onClick={() => handleSave('post')}
              disabled={saving}
            >
              {saving ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3"/>
                  <path d="M12 2a10 10 0 0110 10" stroke="white" strokeWidth="3" strokeLinecap="round">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/>
                  </path>
                </svg>
              ) : null}
              Post Invoice
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
