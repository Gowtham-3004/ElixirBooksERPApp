import { useState } from 'react';
import {
  ArrowLeftIcon, PrintIcon, SendIcon, MoreVertIcon, LinkIcon,
  ShieldCheckIcon, ArrowsSwapIcon, CheckCircleIcon, FileTextIcon,
  LockIcon, EditIcon, ChevronDownIcon,
} from '../components/Icons';

const LINE_ITEMS = [
  { num: 1, item: 'Masala Chai 250 g', sku: 'SKU-10021', hsn: '0902', qty: '120.00', uom: 'pcs', rate: '149.00', pricelist: 'Wholesale', disc: '5.00', tax: 'GST 5%', taxAmt: '849.00', amt: '16,986.00' },
  { num: 2, item: 'Premium Assam Tea 500 g', sku: 'SKU-10034', hsn: '0902', qty: '80.00', uom: 'pcs', rate: '380.00', pricelist: 'Wholesale', disc: '3.00', tax: 'GST 5%', taxAmt: '882.60', amt: '29,498.00' },
  { num: 3, item: 'Green Tea Sachets (Box 25)', sku: 'SKU-10019', hsn: '0902', qty: '60.00', uom: 'box', rate: '295.00', pricelist: 'Wholesale', disc: '5.00', tax: 'GST 5%', taxAmt: '504.23', amt: '16,816.50' },
  { num: 4, item: 'Darjeeling First Flush 100 g', sku: 'SKU-10055', hsn: '0902', qty: '40.00', uom: 'pcs', rate: '890.00', pricelist: 'Wholesale', disc: '0.00', tax: 'GST 5%', taxAmt: '1,780.00', amt: '37,380.00' },
];

const ACTIVITY = [
  { type: 'success', icon: '✓', event: 'Posted', pred: 'by Rahul Kumar', time: '10:00, 21 Apr 2026', note: null },
  { type: 'info', icon: '→', event: 'Approved', pred: 'by Priya Sharma · Finance Approver', time: '09:45, 21 Apr 2026', note: 'Approved. Terms verified.' },
  { type: 'info', icon: '↑', event: 'Submitted for approval', pred: 'by Rahul Kumar', time: '09:30, 21 Apr 2026', note: null },
  { type: 'neutral', icon: '📄', event: 'Created', pred: 'by Rahul Kumar · converted from SO/26-27/0092', time: '09:15, 21 Apr 2026', note: null },
];

const JOURNAL = [
  { account: '1100 · Trade Receivables', party: 'Arlene Traders', dr: '1,18,000.00', cr: '—' },
  { account: '4000 · Sales Revenue', party: null, dr: '—', cr: '1,00,000.00' },
  { account: '2300 · Output CGST 9%', party: null, dr: '—', cr: '9,000.00' },
  { account: '2301 · Output SGST 9%', party: null, dr: '—', cr: '9,000.00' },
  { account: '2310 · TDS Payable (194C 2%)', party: null, dr: '—', cr: '2,000.00' },
  { account: '4010 · Round-off', party: null, dr: '—', cr: '0.00' },
];

interface Props {
  onBack: () => void;
}

export default function InvoiceDetail({ onBack }: Props) {
  const [activeTab, setActiveTab] = useState<'details' | 'approvals' | 'accounting' | 'activity'>('details');

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Main body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Identity rail */}
        <aside
          style={{
            width: 340,
            flexShrink: 0,
            borderRight: '1px solid #EAEAEA',
            background: '#FFFFFF',
            overflow: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Back + doc number */}
          <div style={{ padding: '16px 20px 0' }}>
            <button
              className="btn-ghost"
              style={{ padding: '0 0', marginBottom: 12, color: '#5F6368', gap: 6 }}
              onClick={onBack}
            >
              <ArrowLeftIcon size={14} />
              Sales invoices
            </button>

            <div style={{ marginBottom: 8 }}>
              <div
                className="identifier"
                style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', lineHeight: 1.3 }}
              >
                INV/26-27/0118
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              <span className="badge badge-posted">Posted</span>
              <span
                className="badge"
                style={{ background: '#EBF7FF', color: '#3E5BA5', gap: 4 }}
              >
                <ShieldCheckIcon size={10} />
                e-Invoice · Accepted
              </span>
            </div>

            {/* Amount block */}
            <div
              style={{
                background: '#F9FBFC',
                borderRadius: 10,
                padding: '16px',
                marginBottom: 16,
                border: '1px solid #EAEAEA',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="section-label">TOTAL</span>
                <span style={{ fontSize: 22, fontWeight: 600, fontFeatureSettings: '"tnum" 1', color: '#0A0A0A' }}>
                  ₹1,18,000.00
                </span>
              </div>
              <div style={{ height: 1, background: '#EAEAEA', marginBottom: 8 }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="section-label">DUE</span>
                <span style={{ fontSize: 16, fontWeight: 600, fontFeatureSettings: '"tnum" 1', color: '#C0393F' }}>
                  ₹1,18,000.00
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>21 May 2026</span>
                <span className="pill pill-critical">Overdue 12 d</span>
              </div>
            </div>
          </div>

          {/* Customer */}
          <div style={{ padding: '0 20px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="section-label">CUSTOMER</span>
              <span className="snapshot-tag">
                <LockIcon size={10} />
                snapshot
              </span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', marginBottom: 2, fontFeatureSettings: 'normal' }}>
              Arlene Traders
            </div>
            <div className="identifier" style={{ fontSize: 12, color: '#6E6E71', marginBottom: 8 }}>
              27AAAPL1234C1Z5
            </div>
            <div style={{ fontSize: 12, color: '#6E6E71', marginBottom: 4, fontFeatureSettings: 'normal' }}>
              B2B · Registered · Maharashtra
            </div>
            <div style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>
              Price list: Wholesale
            </div>

            {/* Address / Contact tabs */}
            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              <button style={{ fontSize: 12, color: '#325CFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontFeatureSettings: 'normal' }}>
                Contact
              </button>
              <button style={{ fontSize: 12, color: '#5F6368', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontFeatureSettings: 'normal' }}>
                Billing address
              </button>
              <button style={{ fontSize: 12, color: '#5F6368', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontFeatureSettings: 'normal' }}>
                Shipping
              </button>
            </div>
          </div>

          <div style={{ height: 1, background: '#F5F5F5', margin: '0 20px' }} />

          {/* Source chain */}
          <div style={{ padding: '14px 20px' }}>
            <div className="section-label" style={{ marginBottom: 8 }}>SOURCE</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: '#325CFF', cursor: 'pointer', fontFeatureSettings: '"tnum" 1', letterSpacing: '0.02em' }}>
                SO/26-27/0092
              </span>
              <ArrowsSwapIcon size={12} color="#B0B5BF" />
              <span style={{ color: '#325CFF', cursor: 'pointer', fontFeatureSettings: '"tnum" 1', letterSpacing: '0.02em' }}>
                DC/26-27/0075
              </span>
            </div>
          </div>

          <div style={{ height: 1, background: '#F5F5F5', margin: '0 20px' }} />

          {/* Statutory */}
          <div style={{ padding: '14px 20px' }}>
            <div className="section-label" style={{ marginBottom: 8 }}>STATUTORY</div>
            <div style={{ fontSize: 12, marginBottom: 2, fontFeatureSettings: 'normal' }}>
              <span style={{ color: '#5F6368' }}>IRN </span>
              <span className="identifier" style={{ color: '#0A0A0A', fontSize: 11 }}>
                ab12ef3456cd789a…f9
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>22 Apr 2026 · IRP Accepted</div>
          </div>

          <div style={{ height: 1, background: '#F5F5F5', margin: '0 20px' }} />

          {/* Attachments */}
          <div style={{ padding: '14px 20px' }}>
            <div className="section-label" style={{ marginBottom: 8 }}>ATTACHMENTS</div>
            {[
              { name: 'Purchase-Order-Arlene.pdf', size: '42 KB' },
              { name: 'e-Invoice-signed.pdf', size: '18 KB', statutory: true },
            ].map((att) => (
              <div
                key={att.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  borderBottom: '1px solid #F5F5F5',
                }}
              >
                <FileTextIcon size={14} color="#5F6368" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: '#325CFF', cursor: 'pointer', fontFeatureSettings: 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#6E6E71', fontFeatureSettings: 'normal' }}>{att.size}</div>
                </div>
                {att.statutory && (
                  <span className="snapshot-tag">
                    <ShieldCheckIcon size={10} />
                    statutory
                  </span>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Detail pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FAFBFC' }}>
          {/* Tab bar */}
          <div
            style={{
              padding: '0 24px',
              background: '#FFFFFF',
              borderBottom: '1px solid #EAEAEA',
              display: 'flex',
              gap: 20,
            }}
          >
            {(['details', 'approvals', 'accounting', 'activity'] as const).map((tab) => (
              <button
                key={tab}
                className={`doc-tab ${activeTab === tab ? 'active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
            {activeTab === 'details' && <DetailsTab />}
            {activeTab === 'approvals' && <ApprovalsTab />}
            {activeTab === 'accounting' && <AccountingTab />}
            {activeTab === 'activity' && <ActivityTab />}
          </div>
        </div>
      </div>

      {/* Pinned footer */}
      <div
        style={{
          height: 64,
          background: '#FFFFFF',
          borderTop: '1px solid #EAEAEA',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 10,
          padding: '0 24px',
          flexShrink: 0,
        }}
      >
        <button className="btn-secondary" style={{ gap: 6 }}>
          <PrintIcon size={14} />
          Download PDF
        </button>
        <button className="btn-secondary" style={{ gap: 6 }}>
          <SendIcon size={14} />
          Send
          <ChevronDownIcon size={12} />
        </button>
        <button className="btn-primary" style={{ gap: 6 }}>
          <CheckCircleIcon size={14} />
          Record receipt
        </button>
        <button className="btn-secondary" style={{ gap: 6 }}>
          Create credit note
        </button>
        <button className="btn-secondary" style={{ gap: 6 }}>
          <MoreVertIcon size={14} />
          <ArrowsSwapIcon size={14} />
          Reverse
        </button>
      </div>
    </div>
  );
}

function DetailsTab() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>
      {/* Header section */}
      <section>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 16 }}>Header</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '16px 24px',
            background: '#FFFFFF',
            border: '1px solid #EAEAEA',
            borderRadius: 10,
            padding: 20,
          }}
        >
          {[
            { label: 'Invoice Date', value: '21 Apr 2026' },
            { label: 'Due Date', value: '21 May 2026' },
            { label: 'Payment Terms', value: 'Net 30' },
            { label: 'Salesperson', value: 'Anita Joshi' },
            { label: 'Reference', value: 'PO-ARLENE-0042' },
            { label: 'Place of Supply', value: '27 · Maharashtra' },
          ].map((field) => (
            <div key={field.label}>
              <div className="section-label" style={{ marginBottom: 4 }}>{field.label}</div>
              <div style={{ fontSize: 14, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{field.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Line items */}
      <section>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>Lines</h3>
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid #EAEAEA',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <table className="data-table dense">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Item / Service</th>
                <th>HSN/SAC</th>
                <th className="right">Qty</th>
                <th>UOM</th>
                <th className="right">Rate</th>
                <th className="right">Disc %</th>
                <th>Tax</th>
                <th className="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {LINE_ITEMS.map((line) => (
                <tr key={line.num}>
                  <td style={{ color: '#6E6E71', fontSize: 12 }}>{line.num}</td>
                  <td>
                    <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{line.item}</div>
                    <div className="cell-secondary identifier">{line.sku}</div>
                  </td>
                  <td>
                    <span className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{line.hsn}</span>
                  </td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13 }}>{line.qty}</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>{line.uom}</span>
                  </td>
                  <td className="right">
                    <div>
                      <div className="money" style={{ fontSize: 13 }}>₹{line.rate}</div>
                      <div style={{ fontSize: 11, color: '#6E6E71', fontFeatureSettings: 'normal' }}>{line.pricelist} ⓘ</div>
                    </div>
                  </td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13 }}>{line.disc}%</span>
                  </td>
                  <td>
                    <span style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>{line.tax} ⓘ</span>
                  </td>
                  <td className="right">
                    <span className="money" style={{ fontSize: 13, fontWeight: 500 }}>₹{line.amt}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Line footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              background: '#F9FBFC',
              borderTop: '2px solid #E0E2E6',
            }}
          >
            <span style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>4 lines</span>
            <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
              Taxable{' '}
              <strong className="money" style={{ color: '#0A0A0A' }}>₹1,00,000.00</strong>
              {' '}· Tax{' '}
              <strong className="money" style={{ color: '#0A0A0A' }}>₹18,000.00</strong>
              {' '}·{' '}
              <strong className="money" style={{ color: '#0A0A0A', fontSize: 14 }}>₹1,18,000.00</strong>
            </span>
          </div>
        </div>
      </section>

      {/* Tax breakup + Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 24, alignItems: 'start' }}>
        {/* Tax breakup */}
        <section>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>Tax Breakup</h3>
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAEAEA',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <table className="data-table dense">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Rate</th>
                  <th>HSN/SAC</th>
                  <th className="right">Taxable</th>
                  <th className="right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { comp: 'CGST', rate: '9%', hsn: '0902', taxable: '1,00,000.00', tax: '9,000.00' },
                  { comp: 'SGST', rate: '9%', hsn: '0902', taxable: '1,00,000.00', tax: '9,000.00' },
                ].map((r) => (
                  <tr key={r.comp}>
                    <td style={{ fontSize: 13, fontFeatureSettings: 'normal' }}>{r.comp}</td>
                    <td className="money" style={{ fontSize: 13 }}>{r.rate}</td>
                    <td className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{r.hsn}</td>
                    <td className="right money" style={{ fontSize: 13 }}>₹{r.taxable}</td>
                    <td className="right money" style={{ fontSize: 13 }}>₹{r.tax}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Totals ladder */}
        <section style={{ minWidth: 280 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 12 }}>Totals</h3>
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #EAEAEA',
              borderRadius: 10,
              padding: '16px 20px',
            }}
          >
            {[
              { label: 'SUBTOTAL', value: '1,20,000.00', special: null },
              { label: 'DISCOUNT (5%)', value: '−6,000.00', special: 'positive' },
              { label: 'TAXABLE VALUE', value: '1,14,000.00', special: null },
              { label: 'CGST 9%', value: '10,260.00', special: null },
              { label: 'SGST 9%', value: '10,260.00', special: null },
              { label: 'TDS (194C · 2%)', value: '−2,280.00', special: 'positive' },
              { label: 'ROUND-OFF', value: '+0.00', special: null },
            ].map((row) => (
              <div key={row.label} className="ladder-row">
                <span className="ladder-label">{row.label}</span>
                <span
                  className={`ladder-value ${row.special === 'positive' ? 'positive' : row.special === 'negative' ? 'negative' : ''}`}
                >
                  ₹{row.value}
                </span>
              </div>
            ))}
            <div style={{ height: 1, background: '#E0E2E6', margin: '10px 0' }} />
            <div className="ladder-row">
              <span className="ladder-label" style={{ fontWeight: 700 }}>TOTAL</span>
              <span className="ladder-value large">₹1,18,000.00</span>
            </div>
            <div className="ladder-row" style={{ marginTop: 8 }}>
              <span className="ladder-label">PAID</span>
              <span className="ladder-value positive">−₹0.00</span>
            </div>
            <div style={{ height: 1, background: '#EAEAEA', margin: '8px 0' }} />
            <div className="ladder-row">
              <span className="ladder-label" style={{ color: '#C0393F' }}>DUE</span>
              <span className="ladder-value" style={{ fontWeight: 700, color: '#C0393F' }}>₹1,18,000.00</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ApprovalsTab() {
  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A' }}>Approval Workflow</h3>
        <span className="badge badge-posted">Completed</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {[
          { step: 1, role: 'Finance Approver', user: 'Priya Sharma', action: 'Approved', time: '09:45, 21 Apr 2026', comment: 'Approved. Terms verified and credit check passed.', status: 'done' },
          { step: 2, role: 'CFO (above ₹5L)', user: 'Not required', action: null, time: null, comment: null, status: 'skip' },
        ].map((step, i) => (
          <div key={step.step} style={{ display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: step.status === 'done' ? '#E0F9EC' : '#F3F5F5',
                  color: step.status === 'done' ? '#12784E' : '#B0B5BF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  flexShrink: 0,
                  fontFeatureSettings: '"tnum" 1',
                }}
              >
                {step.status === 'done' ? '✓' : step.step}
              </div>
              {i < 1 && (
                <div style={{ width: 1, height: 48, background: step.status === 'done' ? '#E0F9EC' : '#F3F5F5', marginTop: 4 }} />
              )}
            </div>
            <div style={{ flex: 1, paddingBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 500, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>{step.role}</span>
                  <span style={{ fontSize: 13, color: '#5F6368', marginLeft: 8, fontFeatureSettings: 'normal' }}>{step.user}</span>
                </div>
                {step.action && (
                  <span className={`badge ${step.action === 'Approved' ? 'badge-approved' : 'badge-rejected'}`}>
                    {step.action}
                  </span>
                )}
              </div>
              {step.time && (
                <div style={{ fontSize: 12, color: '#6E6E71', marginBottom: 6, fontFeatureSettings: 'normal' }}>{step.time}</div>
              )}
              {step.comment && (
                <div
                  style={{
                    background: '#ECF1FD',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#0A0A0A',
                    fontFeatureSettings: 'normal',
                  }}
                >
                  {step.comment}
                </div>
              )}
              {step.status === 'skip' && (
                <div style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>
                  Threshold not met — step skipped
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AccountingTab() {
  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 2 }}>
            Posted Journal
          </h3>
          <p style={{ fontSize: 12, color: '#6E6E71', fontFeatureSettings: 'normal' }}>
            JV/26-27/0412 · 21 Apr 2026 · Mumbai · INR
          </p>
        </div>
        <span className="badge badge-posted">Posted</span>
      </div>

      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #EAEAEA',
          borderRadius: 10,
          overflow: 'hidden',
          marginBottom: 24,
        }}
      >
        <table className="data-table dense">
          <thead>
            <tr>
              <th>Account</th>
              <th>Party / Dimension</th>
              <th className="right">Dr</th>
              <th className="right">Cr</th>
            </tr>
          </thead>
          <tbody>
            {JOURNAL.map((row, i) => (
              <tr key={i}>
                <td>
                  <span style={{ fontSize: 13, fontFeatureSettings: 'normal' }}>{row.account}</span>
                </td>
                <td>
                  <span style={{ fontSize: 13, color: '#5F6368', fontFeatureSettings: 'normal' }}>
                    {row.party || '—'}
                  </span>
                </td>
                <td className="right">
                  <span className={`money ${row.dr !== '—' ? '' : ''}`} style={{ fontSize: 13, color: row.dr !== '—' ? '#0A0A0A' : '#B0B5BF' }}>
                    {row.dr !== '—' ? `₹${row.dr}` : '—'}
                  </span>
                </td>
                <td className="right">
                  <span className={`money`} style={{ fontSize: 13, color: row.cr !== '—' ? '#0A0A0A' : '#B0B5BF' }}>
                    {row.cr !== '—' ? `₹${row.cr}` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#F9FBFC', borderTop: '2px solid #E0E2E6' }}>
              <td colSpan={2}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#5F6368', textTransform: 'uppercase', letterSpacing: '0.04em', fontFeatureSettings: 'normal' }}>TOTAL</span>
              </td>
              <td className="right">
                <strong className="money" style={{ fontSize: 13 }}>₹1,18,000.00</strong>
              </td>
              <td className="right">
                <strong className="money" style={{ fontSize: 13 }}>₹1,18,000.00</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div
        style={{
          background: '#ECF1FD',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 13,
          color: '#0A0A0A',
          fontFeatureSettings: 'normal',
        }}
      >
        ✓ Journal is balanced — Dr ₹1,18,000.00 = Cr ₹1,18,000.00 · INR base currency
      </div>
    </div>
  );
}

function ActivityTab() {
  return (
    <div style={{ maxWidth: 600 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#0A0A0A', marginBottom: 20 }}>
        Activity & Audit Trail
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ACTIVITY.map((item, i) => (
          <div key={i} className="timeline-item">
            <div className={`timeline-icon ${item.type}`}>
              <span style={{ fontSize: 10, fontFeatureSettings: 'normal' }}>{item.icon}</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A', fontFeatureSettings: 'normal' }}>
                    {item.event}
                  </span>
                  <span style={{ fontSize: 13, color: '#5F6368', marginLeft: 6, fontFeatureSettings: 'normal' }}>
                    {item.pred}
                  </span>
                </div>
                <span style={{ fontSize: 12, color: '#6E6E71', flexShrink: 0, marginLeft: 12, fontFeatureSettings: 'normal' }}>
                  {item.time}
                </span>
              </div>
              {item.note && (
                <div
                  style={{
                    background: '#ECF1FD',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#0A0A0A',
                    fontFeatureSettings: 'normal',
                  }}
                >
                  {item.note}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: '10px 14px',
          background: '#F3F5F5',
          borderRadius: 8,
          fontSize: 12,
          color: '#5F6368',
          fontFeatureSettings: 'normal',
        }}
      >
        <span style={{ fontWeight: 500 }}>Correlation ID: </span>
        <span className="identifier" style={{ color: '#0A0A0A' }}>
          corr_01JMNPQ8RSTUVWXYZ1234
        </span>
        {' '}
        <button style={{ background: 'none', border: 'none', color: '#325CFF', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit', padding: 0, fontFeatureSettings: 'normal' }}>
          Copy
        </button>
      </div>
    </div>
  );
}
