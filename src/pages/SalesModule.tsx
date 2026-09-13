import { useState } from 'react';
import {
  PlusIcon, SearchIcon, FilterIcon, DownloadIcon, MoreVertIcon,
  ChevronDownIcon, CheckIcon, ArrowLeftIcon, EyeIcon, EditIcon,
} from '../components/Icons';

type SubView = 'quotations' | 'orders' | 'deliveries' | 'credit-notes' | 'receipts' | 'ar-ageing';

const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'quotations', label: 'Quotations' },
  { id: 'orders', label: 'Sales Orders' },
  { id: 'deliveries', label: 'Deliveries' },
  { id: 'credit-notes', label: 'Returns & Credits' },
  { id: 'receipts', label: 'Receipts' },
  { id: 'ar-ageing', label: 'AR Ageing' },
];

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
}

// ── Quotations ────────────────────────────────────────────────────────────────
const QUOTES = [
  { id: 'QT/26-27/0041', date: '11 Sep 2026', valid: '25 Sep 2026', customer: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', items: 3, amount: 142080, status: 'Sent', salesperson: 'Vikram S' },
  { id: 'QT/26-27/0040', date: '09 Sep 2026', valid: '23 Sep 2026', customer: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', items: 5, amount: 284500, status: 'Draft', salesperson: 'Priya M' },
  { id: 'QT/26-27/0039', date: '07 Sep 2026', valid: '21 Sep 2026', customer: 'Metro Distributors', gstin: '27AABCM2345J1Z8', items: 2, amount: 98400, status: 'Accepted', salesperson: 'Vikram S' },
  { id: 'QT/26-27/0038', date: '05 Sep 2026', valid: '19 Sep 2026', customer: 'Vimal Commodities', gstin: '24AABCV3210M1Z9', items: 7, amount: 512000, status: 'Converted', salesperson: 'Suresh K' },
  { id: 'QT/26-27/0037', date: '02 Sep 2026', valid: '16 Sep 2026', customer: 'Global Tech Solutions', gstin: '27AABCG3456F1Z5', items: 1, amount: 25000, status: 'Expired', salesperson: 'Priya M' },
  { id: 'QT/26-27/0036', date: '29 Aug 2026', valid: '12 Sep 2026', customer: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', items: 4, amount: 198600, status: 'Sent', salesperson: 'Suresh K' },
];

const Q_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Sent: 'badge-submitted',
  Accepted: 'badge-posted',
  Converted: 'badge-matched',
  Expired: 'badge-expired',
  Declined: 'badge-cancelled',
};

function Quotations() {
  const [tab, setTab] = useState('All');
  const TABS = ['All', 'Draft', 'Sent', 'Accepted', 'Converted', 'Expired'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Quotations</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            {QUOTES.length} records · Apr–Sep 2026
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New quotation</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF', alignItems: 'center' }}>
        <div className="search-input" style={{ width: 240 }}>
          <SearchIcon size={13} /><input placeholder="QT number, customer…" />
        </div>
        <button className="btn-secondary btn-sm" style={{ gap: 5 }}><FilterIcon size={12} />Filter</button>
        <div style={{ flex: 1 }} />
        {TABS.map((t) => (
          <button key={t} className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Quotation #</th>
              <th>Date</th>
              <th>Valid Until</th>
              <th>Customer</th>
              <th>Items</th>
              <th className="right">Amount</th>
              <th>Status</th>
              <th>Salesperson</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {QUOTES.filter(q => tab === 'All' || q.status === tab).map((q) => (
              <tr key={q.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{q.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{q.date}</td>
                <td style={{ fontSize: 13, color: new Date(q.valid.split(' ').reverse().join('-')) < new Date() ? '#C0393F' : '#5F6368' }}>
                  {q.valid}
                </td>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{q.customer}</div>
                  <div className="cell-secondary identifier">{q.gstin}</div>
                </td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{q.items} items</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(q.amount)}</span></td>
                <td><span className={`badge ${Q_BADGE[q.status]}`}>{q.status}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{q.salesperson}</td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sales Orders ──────────────────────────────────────────────────────────────
const ORDERS = [
  { id: 'SO/26-27/0128', date: '10 Sep 2026', customer: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', ordered: 142080, delivered: 94720, invoiced: 94720, pending: 47360, status: 'Partially Delivered', wh: 'Main WH' },
  { id: 'SO/26-27/0127', date: '08 Sep 2026', customer: 'Metro Distributors', gstin: '27AABCM2345J1Z8', ordered: 322000, delivered: 322000, invoiced: 322000, pending: 0, status: 'Closed', wh: 'Main WH' },
  { id: 'SO/26-27/0126', date: '06 Sep 2026', customer: 'Vimal Commodities', gstin: '24AABCV3210M1Z9', ordered: 512000, delivered: 0, invoiced: 0, pending: 512000, status: 'Confirmed', wh: 'Andheri WH' },
  { id: 'SO/26-27/0125', date: '04 Sep 2026', customer: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', ordered: 284500, delivered: 142250, invoiced: 142250, pending: 142250, status: 'Partially Delivered', wh: 'Main WH' },
  { id: 'SO/26-27/0124', date: '01 Sep 2026', customer: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', ordered: 198600, delivered: 198600, invoiced: 0, pending: 0, status: 'Delivered', wh: 'Andheri WH' },
  { id: 'SO/26-27/0123', date: '29 Aug 2026', customer: 'Global Tech Solutions', gstin: '27AABCG3456F1Z5', ordered: 89500, delivered: 0, invoiced: 0, pending: 89500, status: 'Draft', wh: 'Main WH' },
];
const SO_BADGE: Record<string, string> = {
  Draft: 'badge-draft', Confirmed: 'badge-submitted', 'Partially Delivered': 'badge-partial',
  Delivered: 'badge-returned', Closed: 'badge-posted', Cancelled: 'badge-cancelled',
};

function SalesOrders() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Sales Orders</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>6 orders · ₹15,48,680.00 total · Apr–Sep 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New order</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="SO number, customer…" /></div>
        <button className="btn-secondary btn-sm" style={{ gap: 5 }}><FilterIcon size={12} />Filter</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Order #</th>
              <th>Date</th>
              <th>Customer</th>
              <th className="right">Ordered</th>
              <th className="right">Delivered</th>
              <th className="right">Invoiced</th>
              <th className="right">Pending</th>
              <th>Warehouse</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {ORDERS.map((o) => (
              <tr key={o.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{o.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{o.date}</td>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{o.customer}</div>
                  <div className="cell-secondary identifier">{o.gstin}</div>
                </td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(o.ordered)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: o.delivered === 0 ? '#B0B5BF' : '#0A0A0A' }}>{fmt(o.delivered)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: o.invoiced === 0 ? '#B0B5BF' : '#0A0A0A' }}>{fmt(o.invoiced)}</span></td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, color: o.pending > 0 ? '#F97316' : '#12784E' }}>
                    {fmt(o.pending)}
                  </span>
                </td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{o.wh}</td>
                <td><span className={`badge ${SO_BADGE[o.status]}`}>{o.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Deliveries ────────────────────────────────────────────────────────────────
const DELIVERIES = [
  { id: 'DC/26-27/0098', date: '11 Sep 2026', so: 'SO/26-27/0128', customer: 'Arlene Traders', wh: 'Main WH', lines: 2, qty: 450, status: 'Posted', invoiced: true },
  { id: 'DC/26-27/0097', date: '09 Sep 2026', so: 'SO/26-27/0127', customer: 'Metro Distributors', wh: 'Main WH', lines: 3, qty: 1200, status: 'Posted', invoiced: true },
  { id: 'DC/26-27/0096', date: '07 Sep 2026', so: 'SO/26-27/0125', customer: 'Rajesh Enterprises', wh: 'Main WH', lines: 2, qty: 600, status: 'Posted', invoiced: false },
  { id: 'DC/26-27/0095', date: '05 Sep 2026', so: 'SO/26-27/0124', customer: 'Sunrise Industries', wh: 'Andheri WH', lines: 4, qty: 800, status: 'Posted', invoiced: false },
  { id: 'DC/26-27/0094', date: '03 Sep 2026', so: 'SO/26-27/0127', customer: 'Metro Distributors', wh: 'Main WH', lines: 1, qty: 200, status: 'Posted', invoiced: true },
  { id: 'DC/26-27/0093', date: '01 Sep 2026', so: '—', customer: 'Global Tech Solutions', wh: 'Main WH', lines: 1, qty: 50, status: 'Draft', invoiced: false },
];

function Deliveries() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Deliveries</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>Delivery challans (DC) · Apr–Sep 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New delivery</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="DC number, customer…" /></div>
        <button className="btn-secondary btn-sm">All</button>
        <button className="btn-secondary btn-sm">Posted</button>
        <button className="btn-secondary btn-sm" style={{ color: '#F97316', borderColor: '#F97316' }}>Not Invoiced</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>DC #</th>
              <th>Date</th>
              <th>Source SO</th>
              <th>Customer</th>
              <th>Warehouse</th>
              <th>Lines</th>
              <th>Qty</th>
              <th>Status</th>
              <th>Invoiced</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {DELIVERIES.map((d) => (
              <tr key={d.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{d.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{d.date}</td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{d.so}</span></td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{d.customer}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{d.wh}</td>
                <td style={{ fontSize: 13 }}>{d.lines}</td>
                <td style={{ fontSize: 13 }}>{d.qty.toLocaleString('en-IN')}</td>
                <td><span className={`badge ${d.status === 'Posted' ? 'badge-posted' : 'badge-draft'}`}>{d.status}</span></td>
                <td>
                  {d.invoiced
                    ? <span className="badge badge-posted">Yes</span>
                    : <span className="badge badge-returned">Pending</span>}
                </td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Credit Notes & Returns ─────────────────────────────────────────────────────
const CREDITS = [
  { id: 'CN/26-27/0019', date: '10 Sep 2026', inv: 'INV/26-27/0118', customer: 'Arlene Traders', reason: 'Goods returned – damaged in transit', amount: 23600, tax: 4248, total: 27848, status: 'Posted' },
  { id: 'CN/26-27/0018', date: '06 Sep 2026', inv: 'INV/26-27/0112', customer: 'Metro Distributors', reason: 'Price correction', amount: 12000, tax: 2160, total: 14160, status: 'Posted' },
  { id: 'CN/26-27/0017', date: '02 Sep 2026', inv: 'INV/26-27/0108', customer: 'Rajesh Enterprises', reason: 'Quality rejection', amount: 45000, tax: 8100, total: 53100, status: 'Draft' },
  { id: 'CN/26-27/0016', date: '28 Aug 2026', inv: 'INV/26-27/0102', customer: 'Sunrise Industries', reason: 'Discount adjustment', amount: 8000, tax: 1440, total: 9440, status: 'Posted' },
  { id: 'CN/26-27/0015', date: '22 Aug 2026', inv: 'INV/26-27/0098', customer: 'Vimal Commodities', reason: 'Short supply', amount: 62000, tax: 11160, total: 73160, status: 'Posted' },
];

function CreditNotes() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Returns & Credit Notes</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>5 credit notes · Apr–Sep 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New credit note</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>CN #</th>
              <th>Date</th>
              <th>Against Invoice</th>
              <th>Customer</th>
              <th>Reason</th>
              <th className="right">Taxable</th>
              <th className="right">GST</th>
              <th className="right">Total</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {CREDITS.map((c) => (
              <tr key={c.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{c.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{c.date}</td>
                <td><span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{c.inv}</span></td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{c.customer}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368', maxWidth: 200 }}>{c.reason}</td>
                <td className="right"><span className="money" style={{ fontSize: 13 }}>{fmt(c.amount)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#5F6368' }}>{fmt(c.tax)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(c.total)}</span></td>
                <td><span className={`badge ${c.status === 'Posted' ? 'badge-posted' : 'badge-draft'}`}>{c.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Receipts ──────────────────────────────────────────────────────────────────
const RECEIPTS = [
  { id: 'RCPT/26-27/0210', date: '22 Apr 2026', customer: 'Arlene Traders', method: 'NEFT', ref: 'NEFT/042208/00412', amount: 118000, allocated: 118000, unapplied: 0, status: 'Allocated' },
  { id: 'RCPT/26-27/0206', date: '20 Apr 2026', customer: 'Metro Distributors', method: 'RTGS', ref: 'RTGS/042011/09943', amount: 322000, allocated: 322000, unapplied: 0, status: 'Allocated' },
  { id: 'RCPT/26-27/0198', date: '15 Apr 2026', customer: 'Rajesh Enterprises', method: 'IMPS', ref: 'IMPS/041801/23412', amount: 245000, allocated: 200000, unapplied: 45000, status: 'Partial' },
  { id: 'RCPT/26-27/0192', date: '12 Apr 2026', customer: 'Vimal Commodities', method: 'Cheque', ref: 'CHQ 184512', amount: 500000, allocated: 500000, unapplied: 0, status: 'Allocated' },
  { id: 'RCPT/26-27/0188', date: '10 Apr 2026', customer: 'Sunrise Industries', method: 'UPI', ref: 'UPI/041012/88341', amount: 74200, allocated: 0, unapplied: 74200, status: 'Unallocated' },
  { id: 'RCPT/26-27/0182', date: '07 Apr 2026', customer: 'Global Tech Solutions', method: 'NEFT', ref: 'NEFT/040701/00214', amount: 89500, allocated: 89500, unapplied: 0, status: 'Allocated' },
];

const RCPT_BADGE: Record<string, string> = { Allocated: 'badge-posted', Partial: 'badge-partial', Unallocated: 'badge-returned' };

function Receipts() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>Customer Receipts</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            6 receipts · {fmt(1348700)} total collected · Apr 2026
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New receipt</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th><input type="checkbox" className="checkbox" /></th>
              <th>Receipt #</th>
              <th>Date</th>
              <th>Customer</th>
              <th>Method</th>
              <th>Reference</th>
              <th className="right">Amount</th>
              <th className="right">Allocated</th>
              <th className="right">Unapplied</th>
              <th>Status</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {RECEIPTS.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 13 }}>{r.id}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{r.date}</td>
                <td><span className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{r.customer}</span></td>
                <td><span className="badge badge-neutral" style={{ background: '#F3F5F5', color: '#5F6368', fontSize: 11 }}>{r.method}</span></td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{r.ref}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(r.amount)}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: '#12784E' }}>{fmt(r.allocated)}</span></td>
                <td className="right">
                  <span className="money" style={{ fontSize: 13, color: r.unapplied > 0 ? '#C0393F' : '#B0B5BF' }}>
                    {r.unapplied > 0 ? fmt(r.unapplied) : '—'}
                  </span>
                </td>
                <td><span className={`badge ${RCPT_BADGE[r.status]}`}>{r.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── AR Ageing ─────────────────────────────────────────────────────────────────
const AGEING = [
  { customer: 'Arlene Traders', gstin: '27AAAPL1234C1Z5', current: 142080, d030: 118000, d3060: 0, d6090: 0, d90p: 0, total: 260080, overdue: 118000 },
  { customer: 'Metro Distributors', gstin: '27AABCM2345J1Z8', current: 0, d030: 0, d3060: 84000, d6090: 78000, d90p: 160000, total: 322000, overdue: 322000 },
  { customer: 'Rajesh Enterprises', gstin: '29AABCR5678D1Z3', current: 142250, d030: 45000, d3060: 58000, d6090: 0, d90p: 0, total: 245250, overdue: 103000 },
  { customer: 'Vimal Commodities', gstin: '24AABCV3210M1Z9', current: 0, d030: 245000, d3060: 468000, d6090: 177500, d90p: 0, total: 890500, overdue: 645500 },
  { customer: 'Sunrise Industries', gstin: '24AABCS7890H1Z1', current: 198600, d030: 0, d3060: 0, d6090: 0, d90p: 0, total: 198600, overdue: 0 },
  { customer: 'Global Tech Solutions', gstin: '27AABCG3456F1Z5', current: 89500, d030: 0, d3060: 0, d6090: 0, d90p: 0, total: 89500, overdue: 0 },
];

const totAgeing = (key: keyof typeof AGEING[0]) =>
  AGEING.reduce((s, r) => s + (r[key] as number), 0);

function ARAgeing() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A' }}>AR Ageing</h1>
          <p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>
            As at 13 Sep 2026 · {fmt(totAgeing('total'))} total outstanding
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary" style={{ gap: 5 }}><DownloadIcon size={14} />Export</button>
        </div>
      </div>

      {/* Ageing buckets summary */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 24px', borderBottom: '1px solid #EAEAEA', background: '#F9FBFC' }}>
        {[
          { label: 'Current', val: totAgeing('current'), color: '#12784E' },
          { label: '1–30 days', val: totAgeing('d030'), color: '#F97316' },
          { label: '31–60 days', val: totAgeing('d3060'), color: '#EF8C1E' },
          { label: '61–90 days', val: totAgeing('d6090'), color: '#E07014' },
          { label: '>90 days', val: totAgeing('d90p'), color: '#C0393F' },
          { label: 'Total', val: totAgeing('total'), color: '#0A0A0A' },
        ].map((b) => (
          <div key={b.label} style={{ flex: 1, padding: '10px 14px', background: '#FFFFFF', border: '1px solid #EAEAEA', borderRadius: 8 }}>
            <div className="section-label" style={{ marginBottom: 4 }}>{b.label}</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: b.color, fontFeatureSettings: '"tnum" 1' }}>
              {fmt(b.val)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Customer</th>
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
            {AGEING.map((a) => (
              <tr key={a.customer} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{a.customer}</div>
                  <div className="cell-secondary identifier">{a.gstin}</div>
                </td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.current > 0 ? '#12784E' : '#B0B5BF' }}>{a.current > 0 ? fmt(a.current) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d030 > 0 ? '#F97316' : '#B0B5BF' }}>{a.d030 > 0 ? fmt(a.d030) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d3060 > 0 ? '#EF8C1E' : '#B0B5BF' }}>{a.d3060 > 0 ? fmt(a.d3060) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d6090 > 0 ? '#E07014' : '#B0B5BF' }}>{a.d6090 > 0 ? fmt(a.d6090) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 13, color: a.d90p > 0 ? '#C0393F' : '#B0B5BF' }}>{a.d90p > 0 ? fmt(a.d90p) : '—'}</span></td>
                <td className="right"><span className="money" style={{ fontSize: 14, fontWeight: 600 }}>{fmt(a.total)}</span></td>
                <td className="right">
                  {a.overdue > 0
                    ? <span className="money" style={{ fontSize: 13, color: '#C0393F', fontWeight: 600 }}>{fmt(a.overdue)}</span>
                    : <span style={{ color: '#12784E', fontSize: 13 }}>✓ Current</span>}
                </td>
              </tr>
            ))}
            {/* Totals */}
            <tr style={{ background: '#F9FBFC', fontWeight: 600 }}>
              <td><span style={{ fontSize: 13, fontWeight: 600 }}>Total</span></td>
              {(['current','d030','d3060','d6090','d90p','total'] as const).map((k) => (
                <td key={k} className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600 }}>{fmt(totAgeing(k))}</span></td>
              ))}
              <td className="right"><span className="money" style={{ fontSize: 13, fontWeight: 600, color: '#C0393F' }}>{fmt(totAgeing('overdue'))}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Module shell ──────────────────────────────────────────────────────────────
interface Props {
  initialView?: SubView;
}

export default function SalesModule({ initialView = 'quotations' }: Props) {
  const [sub, setSub] = useState<SubView>(initialView);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sub-nav */}
      <div
        style={{
          width: 180,
          flexShrink: 0,
          borderRight: '1px solid #EAEAEA',
          background: '#FFFFFF',
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Sales</div>
        {SUB_NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'quotations' && <Quotations />}
        {sub === 'orders' && <SalesOrders />}
        {sub === 'deliveries' && <Deliveries />}
        {sub === 'credit-notes' && <CreditNotes />}
        {sub === 'receipts' && <Receipts />}
        {sub === 'ar-ageing' && <ARAgeing />}
      </div>
    </div>
  );
}
