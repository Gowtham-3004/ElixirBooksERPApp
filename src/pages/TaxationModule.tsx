import { useState } from 'react';
import { DownloadIcon, SearchIcon, FilterIcon, RefreshIcon, CheckIcon } from '../components/Icons';

type SubView = 'gst-b2b' | 'gst-b2c' | 'einvoice' | 'gstr1' | 'gstr3b' | 'tds';

const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'gst-b2b', label: 'GST B2B Register' },
  { id: 'gst-b2c', label: 'GST B2C Register' },
  { id: 'einvoice', label: 'e-Invoice Status' },
  { id: 'gstr1', label: 'GSTR-1 Draft' },
  { id: 'gstr3b', label: 'GSTR-3B Draft' },
  { id: 'tds', label: 'TDS / TCS' },
];

function fmt(n: number) { return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 }); }

// ── GST B2B Register ──────────────────────────────────────────────────────────
const B2B = [
  { inv: 'INV/26-27/0118', date: '08 Apr 2026', customer: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', pos: '27-Maharashtra', taxable: 120424.58, cgst: 10838.21, sgst: 10838.21, igst: 0, cess: 0, total: 142100, revCharge: false, einv: 'Accepted' },
  { inv: 'INV/26-27/0117', date: '05 Apr 2026', customer: 'Metro Distributors', gstin: '27AABCM2345J1Z8', pos: '27-Maharashtra', taxable: 272881.36, cgst: 24559.32, sgst: 24559.32, igst: 0, cess: 0, total: 322000, revCharge: false, einv: 'Accepted' },
  { inv: 'INV/26-27/0116', date: '03 Apr 2026', customer: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', pos: '29-Karnataka', taxable: 241101.69, cgst: 0, sgst: 0, igst: 43398.31, cess: 0, total: 284500, revCharge: false, einv: 'Accepted' },
  { inv: 'INV/26-27/0115', date: '01 Apr 2026', customer: 'Vimal Commodities', gstin: '24AABCV3210M1Z9', pos: '24-Gujarat', taxable: 433898.31, cgst: 0, sgst: 0, igst: 78101.69, cess: 0, total: 512000, revCharge: false, einv: 'Pending' },
  { inv: 'CN/26-27/0019', date: '10 Sep 2026', customer: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', pos: '27-Maharashtra', taxable: -23600, cgst: -2124, sgst: -2124, igst: 0, cess: 0, total: -27848, revCharge: false, einv: 'Accepted' },
];

function GSTB2B() {
  const totTaxable = B2B.reduce((s, r) => s + r.taxable, 0);
  const totTax = B2B.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>GST B2B Register</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            27AAAPL1234C1Z5 · Acme Pvt Ltd · Apr 2026 · {B2B.length} documents
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export JSON</button>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export Excel</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="Invoice #, GSTIN…" /></div>
        <button className="btn-secondary btn-sm" style={{ gap: 5 }}><FilterIcon size={12} />Apr 2026</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', fontSize: 13 }}>
          <span style={{ color: '#5F6368' }}>Taxable: <strong className="money">{fmt(totTaxable)}</strong></span>
          <span style={{ color: '#5F6368' }}>Tax: <strong className="money">{fmt(totTax)}</strong></span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table dense">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>GSTIN</th>
              <th>POS</th>
              <th className="right">Taxable</th>
              <th className="right">CGST</th>
              <th className="right">SGST</th>
              <th className="right">IGST</th>
              <th className="right">Total</th>
              <th>e-Invoice</th>
            </tr>
          </thead>
          <tbody>
            {B2B.map((r) => (
              <tr key={r.inv} style={{ cursor: 'pointer', color: r.total < 0 ? '#C0393F' : 'inherit' }}>
                <td><span className="identifier" style={{ fontSize: 12, color: r.total < 0 ? '#C0393F' : '#325CFF' }}>{r.inv}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{r.date}</td>
                <td style={{ fontSize: 13 }}>{r.customer}</td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{r.gstin}</span></td>
                <td style={{ fontSize: 11, color: '#5F6368' }}>{r.pos}</td>
                <td className="right"><span className="money" style={{ fontSize: 12 }}>{fmt(r.taxable)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 12, color: '#5F6368' }}>{r.cgst !== 0 ? fmt(r.cgst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 12, color: '#5F6368' }}>{r.sgst !== 0 ? fmt(r.sgst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 12, color: '#5F6368' }}>{r.igst !== 0 ? fmt(r.igst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(r.total)}</span></td>
                <td>
                  <span className={`badge ${r.einv === 'Accepted' ? 'badge-posted' : r.einv === 'Pending' ? 'badge-submitted' : 'badge-rejected'}`}>
                    {r.einv}
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

// ── e-Invoice Status ──────────────────────────────────────────────────────────
const EINV = [
  { inv: 'INV/26-27/0118', date: '08 Apr 2026', customer: 'Arlene Traders', amount: 142100, irn: 'a4e89f12b3c7d1e8f9a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2', ack: '232400001234567', submittedAt: '08 Apr 2026 14:32', status: 'Accepted', cancelWindow: false },
  { inv: 'INV/26-27/0117', date: '05 Apr 2026', customer: 'Metro Distributors', amount: 322000, irn: 'b5f90123c4d8e2f0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5', ack: '232400001234521', submittedAt: '05 Apr 2026 16:18', status: 'Accepted', cancelWindow: false },
  { inv: 'INV/26-27/0116', date: '03 Apr 2026', customer: 'Rajesh Enterprises', amount: 284500, irn: 'c6a01234d5e9f3a1b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6', ack: '232400001234498', submittedAt: '03 Apr 2026 11:45', status: 'Accepted', cancelWindow: false },
  { inv: 'INV/26-27/0115', date: '01 Apr 2026', customer: 'Vimal Commodities', amount: 512000, irn: null, ack: null, submittedAt: null, status: 'Pending', cancelWindow: false },
  { inv: 'INV/26-27/0114', date: '30 Mar 2026', customer: 'Sunrise Industries', amount: 198600, irn: null, ack: null, submittedAt: '30 Mar 2026 10:02', status: 'Failed', cancelWindow: false },
];

function EInvoice() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>e-Invoice Status</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            IRP submission status · GSTIN 27AAAPL1234C1Z5 · Apr 2026
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><RefreshIcon size={14} />Sync from IRP</button>
          <button className="btn-primary">Submit pending</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#F9FBFC' }}>
        {[
          { label: 'Accepted', count: 3, color: '#12784E', bg: '#E0F9EC' },
          { label: 'Pending', count: 1, color: '#3E5BA5', bg: '#EBF7FF' },
          { label: 'Failed', count: 1, color: '#C0393F', bg: '#FFE8EA' },
        ].map((b) => (
          <div key={b.label} style={{ padding: '8px 16px', background: b.bg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 700, color: b.color, fontFeatureSettings: '"tnum" 1' }}>{b.count}</span>
            <span style={{ fontSize: 12, color: b.color, fontWeight: 500 }}>{b.label}</span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="right">Amount</th>
              <th>IRN</th>
              <th>Ack. No.</th>
              <th>Submitted At</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {EINV.map((e) => (
              <tr key={e.inv} style={{ cursor: 'pointer' }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{e.inv}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{e.date}</td>
                <td style={{ fontSize: 13 }}>{e.customer}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(e.amount)}</span></td>
                <td>
                  {e.irn
                    ? <span className="identifier" style={{ fontSize: 10, color: '#6E6E71', maxWidth: 140, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.irn.slice(0, 24)}…</span>
                    : <span style={{ color: '#B0B5BF', fontSize: 12 }}>—</span>}
                </td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{e.ack ?? '—'}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{e.submittedAt ?? '—'}</td>
                <td>
                  <span className={`badge ${e.status === 'Accepted' ? 'badge-posted' : e.status === 'Pending' ? 'badge-submitted' : 'badge-rejected'}`}>
                    {e.status}
                  </span>
                </td>
                <td>
                  {e.status === 'Pending' && <button className="btn-primary btn-sm" style={{ fontSize: 12 }}>Submit</button>}
                  {e.status === 'Failed' && <button className="btn-secondary btn-sm" style={{ fontSize: 12, borderColor: '#C0393F', color: '#C0393F' }}>Retry</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── GSTR-1 Draft ──────────────────────────────────────────────────────────────
function GSTR1() {
  const sections = [
    { code: '4A', desc: 'Supplies to registered persons (B2B)', count: 4, taxable: 1068305.94, tax: 190939.83, status: 'Reconciled' },
    { code: '5A', desc: 'Interstate supplies to unregistered (above 2.5L)', count: 0, taxable: 0, tax: 0, status: 'N/A' },
    { code: '7', desc: 'Supplies to unregistered (B2C Small)', count: 3, taxable: 24576.27, tax: 4423.73, status: 'Reconciled' },
    { code: '9B', desc: 'Credit/debit notes (registered)', count: 2, taxable: -35600, tax: -6408, status: 'Reconciled' },
    { code: '11A', desc: 'Tax liability (advances received)', count: 0, taxable: 0, tax: 0, status: 'N/A' },
    { code: '12', desc: 'HSN-wise summary of outward supplies', count: 7, taxable: 1057282.21, tax: 188929.56, status: 'Pending review' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>GSTR-1 Draft</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Apr 2026 · GSTIN 27AAAPL1234C1Z5 · Due 11 May 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export JSON</button>
          <button className="btn-primary">File on GST Portal</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div
          style={{
            background: '#E0F9EC', border: '1px solid #3FA97A', borderRadius: 10, padding: '12px 16px',
            marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#12784E',
          }}
        >
          <CheckIcon size={16} color="#12784E" />
          <span>All B2B and B2C registers reconcile to trial balance. 1 section requires review before filing.</span>
        </div>
        <table className="data-table">
          <thead><tr>
            <th>Section</th>
            <th>Description</th>
            <th className="right">Records</th>
            <th className="right">Taxable Value</th>
            <th className="right">Tax</th>
            <th>Status</th>
          </tr></thead>
          <tbody>
            {sections.map((s) => (
              <tr key={s.code} style={{ cursor: 'pointer', opacity: s.status === 'N/A' ? 0.4 : 1 }}>
                <td><span style={{ fontWeight: 700, fontSize: 13, color: '#325CFF' }}>{s.code}</span></td>
                <td style={{ fontSize: 13 }}>{s.desc}</td>
                <td className="right" style={{ fontSize: 13 }}>{s.count > 0 ? s.count : '—'}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{s.taxable !== 0 ? fmt(s.taxable) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{s.tax !== 0 ? fmt(s.tax) : '—'}</span></td>
                <td>
                  <span className={`badge ${s.status === 'Reconciled' ? 'badge-posted' : s.status === 'N/A' ? 'badge-cancelled' : 'badge-returned'}`}>
                    {s.status}
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

// ── GSTR-3B Draft ─────────────────────────────────────────────────────────────
function GSTR3B() {
  const rows3b = [
    { section: '3.1(a)', desc: 'Outward taxable supplies (other than zero rated, nil rated, and exempted)', taxable: 1057282.21, cgst: 91780.09, sgst: 91780.09, igst: 23348.95, cess: 0 },
    { section: '3.1(b)', desc: 'Outward taxable supplies (zero rated)', taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0 },
    { section: '4(A)(5)', desc: 'ITC available — All other ITC (domestic purchases)', taxable: null, cgst: -62124, sgst: null, igst: -44739, cess: 0 },
    { section: '4(D)(2)', desc: 'Ineligible ITC (Rule 38, 42, 43)', taxable: null, cgst: 0, sgst: null, igst: 0, cess: 0 },
  ];
  const payable = { cgst: 91780.09 - 62124, igst: 23348.95 - 44739 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>GSTR-3B Draft</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Apr 2026 · Due 20 May 2026 · Tax payable: {fmt(payable.cgst * 2 + Math.max(0, payable.igst))}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary">File on GST Portal</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <table className="data-table">
          <thead><tr>
            <th>Section</th>
            <th>Description</th>
            <th className="right">Taxable/Total</th>
            <th className="right">CGST</th>
            <th className="right">SGST</th>
            <th className="right">IGST</th>
            <th className="right">Cess</th>
          </tr></thead>
          <tbody>
            {rows3b.map((r) => (
              <tr key={r.section} style={{ opacity: r.taxable === 0 && r.cgst === 0 ? 0.5 : 1 }}>
                <td><span style={{ fontSize: 12, fontWeight: 600, color: '#325CFF' }}>{r.section}</span></td>
                <td style={{ fontSize: 12, maxWidth: 280 }}>{r.desc}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{r.taxable !== null ? fmt(r.taxable) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: r.cgst < 0 ? '#12784E' : '#0A0A0A' }}>{r.cgst !== 0 ? fmt(r.cgst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: r.sgst !== null && r.sgst < 0 ? '#12784E' : '#0A0A0A' }}>{r.sgst !== null && r.sgst !== 0 ? fmt(r.sgst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: r.igst < 0 ? '#12784E' : '#0A0A0A' }}>{r.igst !== 0 ? fmt(r.igst) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#B0B5BF' }}>—</span></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC' }}>
              <td colSpan={3}><span style={{ fontSize: 13, fontWeight: 600 }}>Net Tax Payable</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 700, color: payable.cgst > 0 ? '#C0393F' : '#12784E' }}>{fmt(Math.abs(payable.cgst))}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 700, color: payable.cgst > 0 ? '#C0393F' : '#12784E' }}>{fmt(Math.abs(payable.cgst))}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 700, color: payable.igst > 0 ? '#C0393F' : '#12784E' }}>{payable.igst > 0 ? fmt(payable.igst) : '(ITC balance)'}</span></td>
              <td className="right"><span className="money" style={{ fontSize: 13, color: '#B0B5BF' }}>—</span></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── B2C Register ──────────────────────────────────────────────────────────────
function GSTB2C() {
  const b2c = [
    { inv: 'INV/26-27/0113', date: '30 Mar 2026', customer: 'Walk-in Customer', state: 'Maharashtra', taxable: 8474.58, tax: 1525.42, total: 10000, type: 'B2CS' },
    { inv: 'INV/26-27/0110', date: '25 Mar 2026', customer: 'Walk-in Customer', state: 'Maharashtra', taxable: 6779.66, tax: 1220.34, total: 8000, type: 'B2CS' },
    { inv: 'INV/26-27/0107', date: '20 Mar 2026', customer: 'Walk-in Customer', state: 'Maharashtra', taxable: 9322.03, tax: 1677.97, total: 11000, type: 'B2CS' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>GST B2C Register</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Unregistered customers · Apr 2026</p>
        </div>
        <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead><tr>
            <th>Invoice #</th><th>Date</th><th>Customer</th><th>State</th><th className="right">Taxable</th><th className="right">Tax</th><th className="right">Total</th><th>Type</th>
          </tr></thead>
          <tbody>
            {b2c.map((r) => (
              <tr key={r.inv}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{r.inv}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{r.date}</td>
                <td style={{ fontSize: 13 }}>{r.customer}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{r.state}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(r.taxable)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#5F6368' }}>{fmt(r.tax)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(r.total)}</span></td>
                <td><span className="badge badge-draft">{r.type}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── TDS / TCS ─────────────────────────────────────────────────────────────────
const TDS_DATA = [
  { ref: 'PMT/26-27/0180', date: '12 Apr 2026', party: 'Bharat Steel Suppliers', pan: 'AABBS4321G', section: '194C', payment: 219480, threshold: 30000, tds: 2195, rate: '1%', certificate: 'TDS-Q1-001', status: 'Deducted' },
  { ref: 'PMT/26-27/0178', date: '10 Apr 2026', party: 'National Hardware Co', pan: 'AABNC8765F', section: '194C', payment: 47040, threshold: 30000, tds: 470, rate: '1%', certificate: 'TDS-Q1-002', status: 'Deducted' },
  { ref: 'PMT/26-27/0176', date: '08 Apr 2026', party: 'Kiran Agencies', pan: 'AABKA9012J', section: '194C', payment: 115640, threshold: 30000, tds: 0, rate: 'Nil (PAN)', certificate: null, status: 'Exempt' },
  { ref: 'RCPT/26-27/0198', date: '15 Apr 2026', party: 'Rajesh Enterprises', pan: 'AABCR5678D', section: '194H', payment: 245000, threshold: 15000, tds: 12250, rate: '5%', certificate: 'TCS-Q1-001', status: 'Deducted' },
];

function TDS() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>TDS / TCS Register</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Q1 FY 2026–27 · Apr–Jun 2026 · Due 31 Jul 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Form 26Q</button>
          <button className="btn-primary">File Return</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead><tr>
            <th>Reference</th><th>Date</th><th>Deductee / Party</th><th>PAN</th><th>Section</th>
            <th className="right">Payment</th><th className="right">TDS Amount</th><th>Rate</th><th>Certificate</th><th>Status</th>
          </tr></thead>
          <tbody>
            {TDS_DATA.map((t) => (
              <tr key={t.ref} style={{ cursor: 'pointer' }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{t.ref}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{t.date}</td>
                <td style={{ fontSize: 13 }}>{t.party}</td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{t.pan}</span></td>
                <td><span className="badge badge-draft">{t.section}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(t.payment)}</span></td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, fontWeight: 600, color: t.tds > 0 ? '#C0393F' : '#B0B5BF' }}>
                    {t.tds > 0 ? fmt(t.tds) : '—'}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{t.rate}</td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{t.certificate ?? '—'}</span></td>
                <td><span className={`badge ${t.status === 'Deducted' ? 'badge-posted' : 'badge-cancelled'}`}>{t.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export default function TaxationModule() {
  const [sub, setSub] = useState<SubView>('gst-b2b');
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Taxation</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>{item.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'gst-b2b' && <GSTB2B />}
        {sub === 'gst-b2c' && <GSTB2C />}
        {sub === 'einvoice' && <EInvoice />}
        {sub === 'gstr1' && <GSTR1 />}
        {sub === 'gstr3b' && <GSTR3B />}
        {sub === 'tds' && <TDS />}
      </div>
    </div>
  );
}
