import { useState } from 'react';
import { PlusIcon, SearchIcon, MoreVertIcon, CheckIcon, CogIcon } from '../components/Icons';

type SubView = 'company' | 'branches' | 'periods' | 'users' | 'roles' | 'number-series' | 'workflows';
const SUB_NAV: { id: SubView; label: string }[] = [
  { id: 'company', label: 'Company Profile' },
  { id: 'branches', label: 'Branches & Locations' },
  { id: 'periods', label: 'Financial Periods' },
  { id: 'users', label: 'Users & Access' },
  { id: 'roles', label: 'Roles & Permissions' },
  { id: 'number-series', label: 'Number Series' },
  { id: 'workflows', label: 'Workflows' },
];

function CompanyProfile() {
  return (
    <div style={{ padding: 32, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Company Profile</h1>
      <p style={{ fontSize: 12, color: '#5F6368', marginBottom: 24, fontFeatureSettings: 'normal' }}>Legal entity configuration · India pack v1.4</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 900 }}>
        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Legal Identity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Legal Name', value: 'Acme Private Limited' },
              { label: 'Trade Name', value: 'Acme' },
              { label: 'PAN', value: 'AAAPL1234C' },
              { label: 'CIN', value: 'U74999MH2010PTC123456' },
              { label: 'Business Type', value: 'Private Limited' },
              { label: 'Nature', value: 'Trading + Manufacturing (Hybrid)' },
            ].map((f) => (
              <div key={f.label} style={{ display: 'flex', gap: 8 }}>
                <span style={{ width: 140, fontSize: 12, color: '#5F6368', flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-label" style={{ marginBottom: 12 }}>GST Registrations</div>
          {[
            { gstin: '27AAAPL1234C1Z5', state: 'Maharashtra', branch: 'Head Office + Main WH', status: 'Active' },
            { gstin: '24AAAPL1234C2Z3', state: 'Gujarat', branch: 'Andheri WH (SEZ unit)', status: 'Active' },
          ].map((g) => (
            <div key={g.gstin} style={{ padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span className="identifier" style={{ fontSize: 13, fontWeight: 600, color: '#325CFF' }}>{g.gstin}</span>
                <span className="badge badge-active">{g.status}</span>
              </div>
              <div style={{ fontSize: 12, color: '#5F6368' }}>{g.state} · {g.branch}</div>
            </div>
          ))}
          <button className="btn-secondary btn-sm" style={{ marginTop: 10, gap: 5 }}><PlusIcon size={12} />Add GSTIN</button>
        </div>

        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Financial Settings</div>
          {[
            { label: 'Base Currency', value: 'INR — Indian Rupee' },
            { label: 'Fiscal Year', value: 'April to March' },
            { label: 'Current FY', value: 'FY 2026–27 (Apr 2026 – Mar 2027)' },
            { label: 'Books From', value: '01 Apr 2020' },
            { label: 'Valuation Method', value: 'Weighted Average Cost (AVCO)' },
            { label: 'Time Zone', value: 'Asia/Kolkata (IST +05:30)' },
          ].map((f) => (
            <div key={f.label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #F5F5F5' }}>
              <span style={{ width: 150, fontSize: 12, color: '#5F6368', flexShrink: 0 }}>{f.label}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{f.value}</span>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: '20px 24px' }}>
          <div className="section-label" style={{ marginBottom: 12 }}>Registered Address</div>
          {[
            { label: 'Address', value: 'Plot 14, Andheri Industrial Estate' },
            { label: 'City', value: 'Mumbai' },
            { label: 'State', value: 'Maharashtra (27)' },
            { label: 'PIN', value: '400053' },
            { label: 'Country', value: 'India' },
            { label: 'Phone', value: '+91 22 4001 1234' },
            { label: 'Email', value: 'accounts@acmepvt.com' },
          ].map((f) => (
            <div key={f.label} style={{ display: 'flex', gap: 8, padding: '5px 0', borderBottom: '1px solid #F5F5F5' }}>
              <span style={{ width: 80, fontSize: 12, color: '#5F6368', flexShrink: 0 }}>{f.label}</span>
              <span style={{ fontSize: 13 }}>{f.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const BRANCHES = [
  { id: 'BR-001', name: 'Head Office', type: 'Office', city: 'Mumbai', state: 'Maharashtra', gstin: '27AAAPL1234C1Z5', wh: 'Main WH', status: 'Active', default: true },
  { id: 'BR-002', name: 'Andheri Warehouse', type: 'Warehouse', city: 'Mumbai', state: 'Maharashtra', gstin: '27AAAPL1234C1Z5', wh: 'Andheri WH', status: 'Active', default: false },
  { id: 'BR-003', name: 'Surat Sales Office', type: 'Office', city: 'Surat', state: 'Gujarat', gstin: '24AAAPL1234C2Z3', wh: '—', status: 'Active', default: false },
  { id: 'BR-004', name: 'Pune Depot', type: 'Warehouse', city: 'Pune', state: 'Maharashtra', gstin: '27AAAPL1234C1Z5', wh: 'Pune Depot', status: 'Inactive', default: false },
];

function Branches() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Branches & Locations</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>4 locations configured</p></div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />Add branch</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Branch ID</th><th>Name</th><th>Type</th><th>City</th><th>State</th>
              <th>GSTIN</th><th>Default WH</th><th>Status</th><th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {BRANCHES.map((b) => (
              <tr key={b.id} style={{ cursor: 'pointer', opacity: b.status === 'Inactive' ? 0.55 : 1 }}>
                <td><span className="identifier" style={{ color: '#325CFF', fontSize: 12 }}>{b.id}</span></td>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{b.name}</div>
                  {b.default && <span className="badge badge-posted" style={{ fontSize: 10, marginTop: 2 }}>Default</span>}
                </td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{b.type}</td>
                <td style={{ fontSize: 13 }}>{b.city}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{b.state}</td>
                <td><span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{b.gstin}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{b.wh}</td>
                <td><span className={`badge ${b.status === 'Active' ? 'badge-active' : 'badge-cancelled'}`}>{b.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PERIODS = [
  { period: 'Apr 2026', start: '01 Apr 2026', end: '30 Apr 2026', status: 'Soft Closed', lockedAt: '05 May 2026', lockedBy: 'Rahul K' },
  { period: 'May 2026', start: '01 May 2026', end: '31 May 2026', status: 'Soft Closed', lockedAt: '04 Jun 2026', lockedBy: 'Rahul K' },
  { period: 'Jun 2026', start: '01 Jun 2026', end: '30 Jun 2026', status: 'Locked', lockedAt: '08 Jul 2026', lockedBy: 'Rahul K' },
  { period: 'Jul 2026', start: '01 Jul 2026', end: '31 Jul 2026', status: 'Soft Closed', lockedAt: '05 Aug 2026', lockedBy: 'Rahul K' },
  { period: 'Aug 2026', start: '01 Aug 2026', end: '31 Aug 2026', status: 'Soft Closed', lockedAt: '03 Sep 2026', lockedBy: 'Rahul K' },
  { period: 'Sep 2026', start: '01 Sep 2026', end: '30 Sep 2026', status: 'Open', lockedAt: null, lockedBy: null },
  { period: 'Oct 2026', start: '01 Oct 2026', end: '31 Oct 2026', status: 'Future', lockedAt: null, lockedBy: null },
];
const PER_BADGE: Record<string, string> = { Open: 'badge-active', 'Soft Closed': 'badge-returned', Locked: 'badge-locked', Future: 'badge-draft' };

function Periods() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Financial Periods</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>FY 2026–27 · Apr 2026 – Mar 2027</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary">Reopen period</button>
          <button className="btn-primary">Close period</button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th>Period</th><th>Start</th><th>End</th><th>Status</th><th>Locked At</th><th>Locked By</th><th style={{ width: 40 }} /></tr>
          </thead>
          <tbody>
            {PERIODS.map((p) => (
              <tr key={p.period} style={{ opacity: p.status === 'Future' ? 0.45 : 1 }}>
                <td><span style={{ fontSize: 14, fontWeight: 600 }}>{p.period}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{p.start}</td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{p.end}</td>
                <td><span className={`badge ${PER_BADGE[p.status]}`}>{p.status}</span></td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{p.lockedAt ?? '—'}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{p.lockedBy ?? '—'}</td>
                <td>
                  {p.status === 'Open' && <button className="btn-secondary btn-sm">Close</button>}
                  {p.status === 'Soft Closed' && <button className="btn-secondary btn-sm">Lock</button>}
                  {p.status === 'Locked' && <button className="btn-secondary btn-sm" style={{ borderColor: '#F97316', color: '#F97316' }}>Reopen</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const USERS = [
  { id: 'USR-001', name: 'Rahul Kumar', email: 'rahul@acmepvt.com', role: 'Finance Admin', companies: ['Acme Pvt Ltd'], lastLogin: '13 Sep 2026 09:14', mfa: true, status: 'Active' },
  { id: 'USR-002', name: 'Priya Mehta', email: 'priya@acmepvt.com', role: 'Sales User', companies: ['Acme Pvt Ltd'], lastLogin: '13 Sep 2026 08:52', mfa: false, status: 'Active' },
  { id: 'USR-003', name: 'Vikram Singh', email: 'vikram@acmepvt.com', role: 'Operations Manager', companies: ['Acme Pvt Ltd'], lastLogin: '12 Sep 2026 18:30', mfa: true, status: 'Active' },
  { id: 'USR-004', name: 'Anita Rao', email: 'anita@acmepvt.com', role: 'Admin', companies: ['Acme Pvt Ltd'], lastLogin: '11 Sep 2026 16:00', mfa: false, status: 'Active' },
  { id: 'USR-005', name: 'Suresh Kumar', email: 'suresh@acmepvt.com', role: 'Cashier', companies: ['Acme Pvt Ltd'], lastLogin: '13 Sep 2026 09:00', mfa: false, status: 'Active' },
  { id: 'USR-006', name: 'Meena Joshi', email: 'meena@acmepvt.com', role: 'HR Manager', companies: ['Acme Pvt Ltd'], lastLogin: '10 Sep 2026 10:22', mfa: false, status: 'Active' },
  { id: 'USR-007', name: 'Anil Patil', email: 'anil@acmepvt.com', role: 'Accountant', companies: ['Acme Pvt Ltd'], lastLogin: '13 Sep 2026 08:30', mfa: false, status: 'Active' },
  { id: 'USR-008', name: 'External Auditor', email: 'auditor@kpmg.com', role: 'Auditor (Read-only)', companies: ['Acme Pvt Ltd'], lastLogin: '05 Sep 2026 14:15', mfa: true, status: 'Active' },
];

function Users() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Users & Access</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>8 users · 7 active</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-secondary">Import</button>
          <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />Invite user</button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '10px 24px', borderBottom: '1px solid #EAEAEA', background: '#FFFFFF' }}>
        <div className="search-input" style={{ width: 240 }}><SearchIcon size={13} /><input placeholder="Name, email, role…" /></div>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th><input type="checkbox" className="checkbox" /></th><th>User</th><th>Role</th><th>Companies</th><th>Last Login</th><th>MFA</th><th>Status</th><th style={{ width: 40 }} /></tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.id} style={{ cursor: 'pointer' }}>
                <td><input type="checkbox" className="checkbox" /></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#325CFF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
                      {u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{u.name}</div>
                      <div className="cell-secondary">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ fontSize: 13 }}>{u.role}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{u.companies.join(', ')}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{u.lastLogin}</td>
                <td style={{ fontSize: 12, color: u.mfa ? '#12784E' : '#B0B5BF' }}>{u.mfa ? '✓ Enabled' : 'Disabled'}</td>
                <td><span className="badge badge-active">{u.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const NUM_SERIES = [
  { type: 'Sales Invoice', prefix: 'INV/', year: '26-27', next: 'INV/26-27/0119', pad: 4, allocation: 'On post', status: 'Active' },
  { type: 'Credit Note', prefix: 'CN/', year: '26-27', next: 'CN/26-27/0020', pad: 4, allocation: 'On post', status: 'Active' },
  { type: 'Sales Order', prefix: 'SO/', year: '26-27', next: 'SO/26-27/0129', pad: 4, allocation: 'On save', status: 'Active' },
  { type: 'Quotation', prefix: 'QT/', year: '26-27', next: 'QT/26-27/0042', pad: 4, allocation: 'On save', status: 'Active' },
  { type: 'Delivery Challan', prefix: 'DC/', year: '26-27', next: 'DC/26-27/0099', pad: 4, allocation: 'On post', status: 'Active' },
  { type: 'Purchase Order', prefix: 'PO/', year: '26-27', next: 'PO/26-27/0093', pad: 4, allocation: 'On save', status: 'Active' },
  { type: 'GRN', prefix: 'GRN/', year: '26-27', next: 'GRN/26-27/0063', pad: 4, allocation: 'On post', status: 'Active' },
  { type: 'Receipt Voucher', prefix: 'RCPT/', year: '26-27', next: 'RCPT/26-27/0211', pad: 4, allocation: 'On post', status: 'Active' },
  { type: 'Payment Voucher', prefix: 'PMT/', year: '26-27', next: 'PMT/26-27/0181', pad: 4, allocation: 'On post', status: 'Active' },
  { type: 'Journal Voucher', prefix: 'JV/', year: '26-27', next: 'JV/26-27/0413', pad: 4, allocation: 'On post', status: 'Active' },
];

function NumberSeries() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Number Series</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>FY 2026–27 · All branches</p></div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New series</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th>Document Type</th><th>Prefix</th><th>Year Code</th><th>Next Number</th><th>Padding</th><th>Allocation</th><th>Status</th><th style={{ width: 40 }} /></tr>
          </thead>
          <tbody>
            {NUM_SERIES.map((s) => (
              <tr key={s.type}>
                <td style={{ fontSize: 13 }}>{s.type}</td>
                <td><span className="identifier" style={{ fontSize: 12 }}>{s.prefix}</span></td>
                <td><span className="identifier" style={{ fontSize: 12 }}>{s.year}</span></td>
                <td><span className="identifier" style={{ fontSize: 13, fontWeight: 600, color: '#325CFF' }}>{s.next}</span></td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{s.pad} digits</td>
                <td><span className="badge badge-draft" style={{ fontSize: 11 }}>{s.allocation}</span></td>
                <td><span className="badge badge-active">{s.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Workflows() {
  const wfs = [
    { id: 'WF-001', name: 'Sales Invoice Approval', docType: 'Sales Invoice', trigger: 'Amount > ₹50,000', steps: 2, approvers: ['Sales Manager', 'Finance Admin'], status: 'Active' },
    { id: 'WF-002', name: 'Purchase Order Approval', docType: 'Purchase Order', trigger: 'Always', steps: 2, approvers: ['Dept Head', 'Finance Admin'], status: 'Active' },
    { id: 'WF-003', name: 'Expense Claim (>₹5,000)', docType: 'Expense Claim', trigger: 'Amount > ₹5,000', steps: 1, approvers: ['Department Manager'], status: 'Active' },
    { id: 'WF-004', name: 'Credit Note Approval', docType: 'Credit Note', trigger: 'Always', steps: 2, approvers: ['Sales Manager', 'Finance Admin'], status: 'Active' },
    { id: 'WF-005', name: 'Journal Approval (Manual)', docType: 'Journal Voucher', trigger: 'Manual JV only', steps: 1, approvers: ['Finance Admin'], status: 'Active' },
    { id: 'WF-006', name: 'Stock Adjustment (>₹10,000)', docType: 'Stock Adjustment', trigger: 'Value > ₹10,000', steps: 1, approvers: ['Operations Manager'], status: 'Draft' },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EAEAEA', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Workflow Rules</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>6 rules configured</p></div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New rule</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table className="data-table">
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr><th>Rule</th><th>Document Type</th><th>Trigger</th><th>Steps</th><th>Approvers</th><th>Status</th><th style={{ width: 40 }} /></tr>
          </thead>
          <tbody>
            {wfs.map((w) => (
              <tr key={w.id} style={{ cursor: 'pointer' }}>
                <td>
                  <div className="cell-primary" style={{ fontFeatureSettings: 'normal' }}>{w.name}</div>
                  <div className="cell-secondary">{w.id}</div>
                </td>
                <td style={{ fontSize: 13, color: '#5F6368' }}>{w.docType}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{w.trigger}</td>
                <td style={{ fontSize: 13 }}>{w.steps} {w.steps === 1 ? 'step' : 'steps'}</td>
                <td style={{ fontSize: 12, color: '#5F6368' }}>{w.approvers.join(' → ')}</td>
                <td><span className={`badge ${w.status === 'Active' ? 'badge-active' : 'badge-draft'}`}>{w.status}</span></td>
                <td><button className="btn-ghost" style={{ padding: '0 6px', height: 28 }}><MoreVertIcon size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Roles() {
  const roles = [
    { name: 'Tenant Owner', description: 'Full access across all companies and platform settings', users: 1, color: '#C0393F' },
    { name: 'Finance Admin', description: 'All finance operations, period management, GL posting', users: 2, color: '#325CFF' },
    { name: 'Sales Manager', description: 'Sales orders, invoices, approvals, customer management', users: 1, color: '#12784E' },
    { name: 'Sales User', description: 'Create and edit sales documents, view reports', users: 3, color: '#12784E' },
    { name: 'Purchase Manager', description: 'POs, GRN, vendor invoices, payment proposals', users: 1, color: '#F97316' },
    { name: 'Accountant', description: 'Journal entries, reconciliation, reports, masters', users: 2, color: '#325CFF' },
    { name: 'Cashier', description: 'POS terminal, cash handling, shift management', users: 2, color: '#8A4B0F' },
    { name: 'Auditor (Read-only)', description: 'View all records and reports, no create/edit', users: 1, color: '#5F6368' },
  ];
  return (
    <div style={{ padding: 24, overflow: 'auto', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div><h1 style={{ fontSize: 18, fontWeight: 600 }}>Roles & Permissions</h1><p style={{ fontSize: 12, color: '#5F6368', fontFeatureSettings: 'normal' }}>8 roles · Customizable per company</p></div>
        <button className="btn-primary" style={{ gap: 5 }}><PlusIcon size={14} />New role</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {roles.map((r) => (
          <div key={r.name} className="card" style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }}
            onMouseOver={(e) => (e.currentTarget.style.borderColor = r.color)}
            onMouseOut={(e) => (e.currentTarget.style.borderColor = '#EAEAEA')}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: r.color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 16, color: r.color }}>👤</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>
                <span style={{ fontSize: 12, color: '#5F6368' }}>{r.users} user{r.users !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ fontSize: 12, color: '#5F6368', lineHeight: 1.5, fontFeatureSettings: 'normal' }}>{r.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CompanyAdminModule() {
  const [sub, setSub] = useState<SubView>('company');
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 200, flexShrink: 0, borderRight: '1px solid #EAEAEA', background: '#FFFFFF', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div className="section-label" style={{ padding: '4px 12px 8px' }}>Administration</div>
        {SUB_NAV.map((item) => (
          <button key={item.id} className={`nav-item ${sub === item.id ? 'active' : ''}`}
            style={{ width: '100%', border: 'none', textAlign: 'left', fontSize: 13 }}
            onClick={() => setSub(item.id)}>{item.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {sub === 'company' && <CompanyProfile />}
        {sub === 'branches' && <Branches />}
        {sub === 'periods' && <Periods />}
        {sub === 'users' && <Users />}
        {sub === 'roles' && <Roles />}
        {sub === 'number-series' && <NumberSeries />}
        {sub === 'workflows' && <Workflows />}
      </div>
    </div>
  );
}
