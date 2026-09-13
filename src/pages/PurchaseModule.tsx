import { useState } from 'react';
import { PlusIcon, SearchIcon, FilterIcon, DownloadIcon, MoreVertIcon, CheckIcon } from '../components/Icons';

type SubView = 'requisitions' | 'orders' | 'grn' | 'vendor-invoices' | 'payments' | 'ap-ageing';

const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'requisitions', label: 'Requisitions' },
  { id: 'orders', label: 'Purchase Orders' },
  { id: 'grn', label: 'Goods Receipts' },
  { id: 'vendor-invoices', label: 'Vendor Invoices' },
  { id: 'payments', label: 'Payments' },
  { id: 'ap-ageing', label: 'AP Ageing' },
];

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// ── Requisitions ──────────────────────────────────────────────────────────────
const REQS = [
  { id: 'PR/26-27/0081', date: '12 Sep 2026', requester: 'Anita R', dept: 'Operations', items: 4, amount: 85000, needDate: '20 Sep 2026', status: 'Approved', po: 'PO/26-27/0092' },
  { id: 'PR/26-27/0080', date: '10 Sep 2026', requester: 'Suresh K', dept: 'Production', items: 6, amount: 214000, needDate: '18 Sep 2026', status: 'Pending Approval', po: null },
  { id: 'PR/26-27/0079', date: '08 Sep 2026', requester: 'Priya M', dept: 'Admin', items: 2, amount: 18500, needDate: '15 Sep 2026', status: 'Approved', po: 'PO/26-27/0091' },
  { id: 'PR/26-27/0078', date: '05 Sep 2026', requester: 'Vikram S', dept: 'Operations', items: 3, amount: 64000, needDate: '12 Sep 2026', status: 'Converted', po: 'PO/26-27/0089' },
  { id: 'PR/26-27/0077', date: '02 Sep 2026', requester: 'Rahul K', dept: 'Finance', items: 1, amount: 12000, needDate: '09 Sep 2026', status: 'Draft', po: null },
  { id: 'PR/26-27/0076', date: '29 Aug 2026', requester: 'Anita R', dept: 'Production', items: 8, amount: 142000, needDate: '05 Sep 2026', status: 'Rejected', po: null },
];
const PR_BADGE: Record<string, string> = {
  Draft: 'badge-draft', 'Pending Approval': 'badge-submitted', Approved: 'badge-posted',
  Converted: 'badge-matched', Rejected: 'badge-rejected',
};

function Requisitions() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Purchase Requisitions</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>6 requisitions · Apr–Sep 2026</p>
        </div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New requisition</button>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="PR number, requester…" /></div>
        <button className="btn-secondary btn-sm" style={{ gap: 5 }}><FilterIcon size={12} />Filter</button>
        <button className="btn-secondary btn-sm" style={{ borderColor: '#325CFF', color: '#325CFF' }}>Pending Approval (1)</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>PR #</th>
              <th>Date</th>
              <th>Requester</th>
              <th>Department</th>
              <th>Items</th>
              <th className="right">Est. Amount</th>
              <th>Need By</th>
              <th>Status</th>
              <th>PO Created</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {REQS.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{r.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{r.date}</td>
                <td style={{ fontSize: 13 }}>{r.requester}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{r.dept}</td>
                <td style={{ fontSize: 13 }}>{r.items}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(r.amount)}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{r.needDate}</td>
                <td><span className={`badge ${PR_BADGE[r.status]}`}>{r.status}</span></td>
                <td>{r.po ? <span className="identifier" style={{ fontSize: 12, color: '#325CFF' }}>{r.po}</span> : <span style={{ color: '#B0B5BF', fontSize: 12 }}>—</span>}</td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── GRN ───────────────────────────────────────────────────────────────────────
const GRNS = [
  { id: 'GRN/26-27/0062', date: '11 Sep 2026', po: 'PO/26-27/0092', supplier: 'Bharat Steel Suppliers', lines: 3, qty: 2000, accepted: 2000, rejected: 0, wh: 'Main WH', status: 'Accepted' },
  { id: 'GRN/26-27/0061', date: '09 Sep 2026', po: 'PO/26-27/0091', supplier: 'National Hardware Co', lines: 2, qty: 500, accepted: 480, rejected: 20, wh: 'Main WH', status: 'Partial Accept' },
  { id: 'GRN/26-27/0060', date: '07 Sep 2026', po: 'PO/26-27/0090', supplier: 'Kiran Agencies', lines: 4, qty: 1200, accepted: 1200, rejected: 0, wh: 'Andheri WH', status: 'Accepted' },
  { id: 'GRN/26-27/0059', date: '04 Sep 2026', po: 'PO/26-27/0089', supplier: 'Sunrise Traders', lines: 1, qty: 100, accepted: 0, rejected: 100, wh: 'Main WH', status: 'Rejected' },
  { id: 'GRN/26-27/0058', date: '01 Sep 2026', po: 'PO/26-27/0088', supplier: 'Global Packaging Ltd', lines: 2, qty: 800, accepted: 800, rejected: 0, wh: 'Andheri WH', status: 'Accepted' },
];
const GRN_BADGE: Record<string, string> = {
  Accepted: 'badge-posted', 'Partial Accept': 'badge-partial', Rejected: 'badge-rejected', Draft: 'badge-draft',
};

function GRN() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Goods Receipt Notes</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>5 GRNs · Apr–Sep 2026</p>
        </div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New GRN</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>GRN #</th>
              <th>Date</th>
              <th>Source PO</th>
              <th>Supplier</th>
              <th>Lines</th>
              <th className="right">Received Qty</th>
              <th className="right">Accepted</th>
              <th className="right">Rejected</th>
              <th>Warehouse</th>
              <th>QC Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {GRNS.map((g) => (
              <tr key={g.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{g.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{g.date}</td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{g.po}</span></td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{g.supplier}</span></td>
                <td style={{ fontSize: 13 }}>{g.lines}</td>
                <td className="right" style={{ fontSize: 13 }}>{g.qty.toLocaleString('en-IN')}</td>
                <td className="right" style={{ fontSize: 13, color: '#12784E' }}>{g.accepted.toLocaleString('en-IN')}</td>
                <td className="right" style={{ fontSize: 13, color: g.rejected > 0 ? '#C0393F' : '#B0B5BF' }}>
                  {g.rejected > 0 ? g.rejected.toLocaleString('en-IN') : '—'}
                </td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{g.wh}</td>
                <td><span className={`badge ${GRN_BADGE[g.status]}`}>{g.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Vendor Invoices ───────────────────────────────────────────────────────────
const VENDOR_INV = [
  { id: 'VINV/26-27/0038', date: '10 Sep 2026', supplier: 'Bharat Steel Suppliers', gstin: '27AABBS4321G1Z8', po: 'PO/26-27/0092', grn: 'GRN/26-27/0062', amount: 186000, tax: 33480, total: 219480, due: '10 Oct 2026', status: 'Posted', match: 'Matched' },
  { id: 'VINV/26-27/0037', date: '08 Sep 2026', supplier: 'National Hardware Co', gstin: '29AABNC8765F1Z2', po: 'PO/26-27/0091', grn: 'GRN/26-27/0061', amount: 42000, tax: 5040, total: 47040, due: '08 Oct 2026', status: 'Posted', match: 'Exception' },
  { id: 'VINV/26-27/0036', date: '05 Sep 2026', supplier: 'Kiran Agencies', gstin: '24AABKA9012J1Z5', po: 'PO/26-27/0090', grn: 'GRN/26-27/0060', amount: 98000, tax: 17640, total: 115640, due: '05 Oct 2026', status: 'Posted', match: 'Matched' },
  { id: 'VINV/26-27/0035', date: '01 Sep 2026', supplier: 'Global Packaging Ltd', gstin: '27AABGP1234K1Z3', po: 'PO/26-27/0088', grn: 'GRN/26-27/0058', amount: 34000, tax: 4080, total: 38080, due: '01 Oct 2026', status: 'Draft', match: 'Pending' },
  { id: 'VINV/26-27/0034', date: '28 Aug 2026', supplier: 'Bharat Steel Suppliers', gstin: '27AABBS4321G1Z8', po: '—', grn: '—', amount: 52000, tax: 9360, total: 61360, due: '27 Sep 2026', status: 'Posted', match: 'Matched' },
];
const VINV_MATCH: Record<string, string> = { Matched: 'badge-posted', Exception: 'badge-returned', Pending: 'badge-draft' };

function VendorInvoices() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Vendor Invoices</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>5 invoices · {fmt(481600)} total payable · Apr–Sep 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New vendor invoice</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="Invoice #, supplier…" /></div>
        <button className="btn-secondary btn-sm" style={{ borderColor: '#F97316', color: '#F97316' }}>Exception (1)</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Invoice #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Source PO</th>
              <th>Source GRN</th>
              <th className="right">Taxable</th>
              <th className="right">Tax</th>
              <th className="right">Total</th>
              <th>Due</th>
              <th>3-way Match</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {VENDOR_INV.map((v) => (
              <tr key={v.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{v.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{v.date}</td>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{v.supplier}</div>
                  <div className="cell-secondary identifier">{v.gstin}</div>
                </td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{v.po}</span></td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{v.grn}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(v.amount)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#5F6368' }}>{fmt(v.tax)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(v.total)}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{v.due}</td>
                <td><span className={`badge ${VINV_MATCH[v.match]}`}>{v.match}</span></td>
                <td><span className={`badge ${v.status === 'Posted' ? 'badge-posted' : 'badge-draft'}`}>{v.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Payments ──────────────────────────────────────────────────────────────────
const PAYMENTS = [
  { id: 'PMT/26-27/0180', date: '12 Apr 2026', supplier: 'Bharat Steel Suppliers', method: 'NEFT', ref: 'UTR/041210/00881', invoices: 2, amount: 219480, tds: 2195, net: 217285, status: 'Completed' },
  { id: 'PMT/26-27/0178', date: '10 Apr 2026', supplier: 'National Hardware Co', method: 'NEFT', ref: 'UTR/041012/00621', invoices: 1, amount: 47040, tds: 470, net: 46570, status: 'Completed' },
  { id: 'PMT/26-27/0176', date: '08 Apr 2026', supplier: 'Kiran Agencies', method: 'RTGS', ref: 'UTR/040820/00142', invoices: 1, amount: 115640, tds: 0, net: 115640, status: 'Completed' },
  { id: 'PMT/26-27/0174', date: '05 Apr 2026', supplier: 'Global Packaging Ltd', method: 'Cheque', ref: 'CHQ 041234', invoices: 1, amount: 38080, tds: 0, net: 38080, status: 'Pending Approval' },
  { id: 'PMT/26-27/0172', date: '02 Apr 2026', supplier: 'Bharat Steel Suppliers', method: 'NEFT', ref: '—', invoices: 1, amount: 61360, tds: 614, net: 60746, status: 'Draft' },
];
const PMT_BADGE: Record<string, string> = {
  Draft: 'badge-draft', 'Pending Approval': 'badge-submitted', Completed: 'badge-posted', Failed: 'badge-rejected',
};

function Payments() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Supplier Payments</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>5 payments · {fmt(477821)} total paid · Apr 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}>Create batch</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New payment</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Payment #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Method</th>
              <th>UTR / Ref</th>
              <th>Invoices</th>
              <th className="right">Gross</th>
              <th className="right">TDS</th>
              <th className="right">Net Paid</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {PAYMENTS.map((p) => (
              <tr key={p.id} style={{ cursor: 'pointer', background: selected.has(p.id) ? '#F2F7FF' : '' }}>
                <td><input type="checkbox" className="checkbox" checked={selected.has(p.id)} onChange={() => {
                  const next = new Set(selected);
                  if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                  setSelected(next);
                }} /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{p.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{p.date}</td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{p.supplier}</span></td>
                <td><span style={{ fontSize: 12, color: '#5F6368' }}>{p.method}</span></td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{p.ref}</span></td>
                <td style={{ fontSize: 13 }}>{p.invoices}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(p.amount)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#C0393F' }}>{p.tds > 0 ? fmt(p.tds) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(p.net)}</span></td>
                <td><span className={`badge ${PMT_BADGE[p.status]}`}>{p.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected.size > 0 && (
        <div style={{ padding: '12px 24px', borderTop: '1px solid #EAEAEA', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: '#5F6368' }}>{selected.size} payments selected</span>
          <div style={{ flex: 1 }} />
          <button className="btn-secondary" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="btn-primary" style={{ gap: 6 }}><CheckIcon size={14} />Process batch</button>
        </div>
      )}
    </div>
  );
}

// ── AP Ageing ─────────────────────────────────────────────────────────────────
const AP_AGEING = [
  { supplier: 'Bharat Steel Suppliers', gstin: '27AABBS4321G1Z8', current: 219480, d030: 61360, d3060: 0, d6090: 0, d90p: 0, total: 280840, overdue: 61360 },
  { supplier: 'National Hardware Co', gstin: '29AABNC8765F1Z2', current: 47040, d030: 0, d3060: 0, d6090: 0, d90p: 0, total: 47040, overdue: 0 },
  { supplier: 'Kiran Agencies', gstin: '24AABKA9012J1Z5', current: 115640, d030: 0, d3060: 0, d6090: 0, d90p: 0, total: 115640, overdue: 0 },
  { supplier: 'Global Packaging Ltd', gstin: '27AABGP1234K1Z3', current: 38080, d030: 0, d3060: 0, d6090: 0, d90p: 0, total: 38080, overdue: 0 },
  { supplier: 'Sunrise Traders', gstin: '24AABST5678H1Z1', current: 0, d030: 142000, d3060: 88000, d6090: 0, d90p: 0, total: 230000, overdue: 230000 },
];
const totAP = (key: keyof typeof AP_AGEING[0]) => AP_AGEING.reduce((s, r) => s + (r[key] as number), 0);

function APAgeing() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>AP Ageing</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>As at 13 Sep 2026 · {fmt(totAP('total'))} total payable</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary">Create payment proposal</button>
        </div>
      </div>
      {/* Buckets */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 24px', borderBottom: '1px solid #EAEAEA', background: '#F9FBFC' }}>
        {[
          { label: 'Current', val: totAP('current'), color: '#12784E' },
          { label: '1–30 days', val: totAP('d030'), color: '#F97316' },
          { label: '31–60 days', val: totAP('d3060'), color: '#E07014' },
          { label: '61–90 days', val: totAP('d6090'), color: '#C0393F' },
          { label: '>90 days', val: totAP('d90p'), color: '#9B1B21' },
          { label: 'Total', val: totAP('total'), color: '#0A0A0A' },
        ].map((b) => (
          <div key={b.label} style={{ flex: 1, padding: '10px 14px', background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: 8 }}>
            <div className="section-label" style={{ marginBottom: 4 }}>{b.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: b.color, fontFeatureSettings: '"tnum" 1' }}>{fmt(b.val)}</div>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Supplier</th>
              <th className="right">Current</th>
              <th className="right">1–30 days</th>
              <th className="right">31–60 days</th>
              <th className="right">61–90 days</th>
              <th className="right">{'>'}90 days</th>
              <th className="right">Total</th>
              <th className="right">Overdue</th>
            </tr>
          </thead>
          <tbody>
            {AP_AGEING.map((a) => (
              <tr key={a.supplier} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{a.supplier}</div>
                  <div className="cell-secondary identifier">{a.gstin}</div>
                </td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.current > 0 ? '#12784E' : '#B0B5BF' }}>{a.current > 0 ? fmt(a.current) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d030 > 0 ? '#F97316' : '#B0B5BF' }}>{a.d030 > 0 ? fmt(a.d030) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d3060 > 0 ? '#E07014' : '#B0B5BF' }}>{a.d3060 > 0 ? fmt(a.d3060) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d6090 > 0 ? '#C0393F' : '#B0B5BF' }}>{a.d6090 > 0 ? fmt(a.d6090) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d90p > 0 ? '#9B1B21' : '#B0B5BF' }}>{a.d90p > 0 ? fmt(a.d90p) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(a.total)}</span></td>
                <td className="right">
                  {a.overdue > 0
                    ? <span className="money" style={{ fontSize: 13, color: '#C0393F', fontWeight: 600 }}>{fmt(a.overdue)}</span>
                    : <span style={{ color: '#12784E', fontSize: 13 }}>✓ Current</span>}
                </td>
              </tr>
            ))}
            <tr style={{ background: '#F9FBFC', fontWeight: 600 }}>
              <td><span style={{ fontSize: 13, fontWeight: 600 }}>Total</span></td>
              {(['current','d030','d3060','d6090','d90p','total'] as const).map((k) => (
                <td key={k} className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(totAP(k))}</span></td>
              ))}
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600, color: '#C0393F' }}>{fmt(totAP('overdue'))}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Module Shell ──────────────────────────────────────────────────────────────
interface Props { initialView?: SubView }

export default function PurchaseModule({ initialView = 'orders' }: Props) {
  const [sub, setSub] = useState<SubView>(initialView);
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 180, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Purchase</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'requisitions' && <Requisitions />}
        {sub === 'orders' && <PurchaseOrdersView />}
        {sub === 'grn' && <GRN />}
        {sub === 'vendor-invoices' && <VendorInvoices />}
        {sub === 'payments' && <Payments />}
        {sub === 'ap-ageing' && <APAgeing />}
      </div>
    </div>
  );
}

// ── Inline PO view (reuses data from existing PurchaseOrders.tsx concept) ─────
const POS_DATA = [
  { id: 'PO/26-27/0092', date: '10 Sep 2026', supplier: 'Bharat Steel Suppliers', gstin: '27AABBS4321G1Z8', ordered: 219480, received: 219480, invoiced: 219480, status: 'Closed' },
  { id: 'PO/26-27/0091', date: '08 Sep 2026', supplier: 'National Hardware Co', gstin: '29AABNC8765F1Z2', ordered: 47040, received: 44988, invoiced: 47040, status: 'Partial GRN' },
  { id: 'PO/26-27/0090', date: '05 Sep 2026', supplier: 'Kiran Agencies', gstin: '24AABKA9012J1Z5', ordered: 115640, received: 115640, invoiced: 115640, status: 'Closed' },
  { id: 'PO/26-27/0089', date: '01 Sep 2026', supplier: 'Sunrise Traders', gstin: '24AABST5678H1Z1', ordered: 64000, received: 0, invoiced: 0, status: 'Approved' },
  { id: 'PO/26-27/0088', date: '28 Aug 2026', supplier: 'Global Packaging Ltd', gstin: '27AABGP1234K1Z3', ordered: 38080, received: 38080, invoiced: 38080, status: 'Closed' },
  { id: 'PO/26-27/0087', date: '24 Aug 2026', supplier: 'Bharat Steel Suppliers', gstin: '27AABBS4321G1Z8', ordered: 88000, received: 0, invoiced: 0, status: 'Draft' },
];
const PO_BADGE: Record<string, string> = {
  Draft: 'badge-draft', Approved: 'badge-submitted', 'Partial GRN': 'badge-partial', Closed: 'badge-posted', Cancelled: 'badge-cancelled',
};

function PurchaseOrdersView() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Purchase Orders</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>6 orders · Apr–Sep 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New PO</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>PO #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th className="right">Ordered</th>
              <th className="right">Received</th>
              <th className="right">Invoiced</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {POS_DATA.map((p) => {
              const pct = p.ordered > 0 ? (p.received / p.ordered) * 100 : 0;
              return (
                <tr key={p.id} style={{ cursor: 'pointer' }}>
                  <td><input type="checkbox" className="checkbox" /></td>
                  <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{p.id}</span></td>
                  <td style={{ fontSize: 13, color: '#5F6368' }}>{p.date}</td>
                  <td>
                    <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{p.supplier}</div>
                    <div className="cell-secondary identifier">{p.gstin}</div>
                  </td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(p.ordered)}</span></td>
                  <td className="right">
                    <div>
                      <span className="money" style={{ fontSize: 13 }}>{fmt(p.received)}</span>
                      <div style={{ marginTop: 3, height: 2, background: '#EAEAEA', borderRadius: 9999, width: 60 }}>
                        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 9999, background: pct === 100 ? '#12784E' : pct === 0 ? '#B0B5BF' : '#F97316', transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  </td>
                  <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(p.invoiced)}</span></td>
                  <td><span className={`badge ${PO_BADGE[p.status]}`}>{p.status}</span></td>
                  <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
