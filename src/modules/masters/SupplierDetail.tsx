// Supplier 360 (FR-PTY-002/005).
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { OpenItem, Supplier } from '../../store';
import { Badge, Button, EmptyState, KV, KpiTile, Money, PageHeader, Tabs } from '../../components/ui';
import { ChangeHistory, UsagePill, setStatus, useReferences } from './shared';
import { AddressCard, ContactCard } from './partyShared';
import { OpenItemsTable, RecentDocsTable, useRecentDocs } from './CustomerDetail';
import { BankDetailsList, SupplierForm, normaliseSupplierStatus, useSyncBankApprovals } from './suppliers';

const DOC_SOURCES = [
  { col: C.vendorInvoices, label: 'Vendor invoice', link: (id: string) => `purchase/vendor-invoices/${id}` },
  { col: C.purchaseOrders, label: 'Purchase order', link: (id: string) => `purchase/orders/${id}` },
  { col: C.grns, label: 'GRN', link: (id: string) => `purchase/grn/${id}` },
  { col: C.debitNotes, label: 'Debit note', link: (id: string) => `purchase/debit-notes/${id}` },
  { col: C.payments, label: 'Payment', link: (id: string) => `purchase/payments/${id}` },
  { col: C.rfqs, label: 'RFQ', link: (id: string) => `purchase/rfqs/${id}` },
];

export default function SupplierDetail({ id }: { id: string }) {
  const s = useSession();
  useSyncBankApprovals();
  const sup = useRecord<Supplier>(C.suppliers, id);
  const openItems = useCollection<OpenItem>(C.openItems);
  const docs = useRecentDocs('Supplier', id, DOC_SOURCES);
  const refs = useReferences(id, C.suppliers);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'items' | 'docs' | 'contacts' | 'history'>('overview');
  if (!sup) return <EmptyState icon="🧭" title="Supplier not found" action={<Button variant="primary" onClick={() => nav.go('masters/suppliers')}>Back to suppliers</Button>} />;
  const out = engine.partyOutstanding('Supplier', id);
  const mine = openItems.filter((o) => o.partyType === 'Supplier' && o.partyId === id && o.status !== 'Settled' && o.status !== 'Written Off');
  const canEdit = s.can('masters.suppliers.edit');
  const acc = db.find<any>(C.accounts, sup.payableAccountId);
  const tds = db.find<any>(C.tdsSections, sup.tdsSectionId);
  const status = normaliseSupplierStatus(sup.status);
  const approvedBank = sup.bankDetails.find((b) => b.status === 'Approved');
  return (
    <div className="page">
      <PageHeader
        back={{ label: 'Suppliers', path: 'masters/suppliers' }}
        title={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{sup.displayName || sup.name} <Badge status={status} /> <Badge status="Draft">{sup.taxTreatment}</Badge>{sup.msmeNumber && <span className="pill pill-good">MSME</span>}</span>}
        subtitle={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="identifier">{sup.code}</span>{sup.gstin && <span className="identifier">{sup.gstin}</span>}{sup.group && <span>{sup.group}</span>}<UsagePill id={id} collection={C.suppliers} /></span>}
        actions={<>
          <Button variant="secondary" onClick={() => nav.go(`accounting/supplier-ledger?party=${id}`)}>Supplier ledger</Button>
          {status === 'Active' ? <Button variant="secondary" disabled={!canEdit} onClick={() => setStatus(C.suppliers, 'Supplier', id, 'Inactive')}>Deactivate</Button> : <Button variant="secondary" disabled={!canEdit} onClick={() => setStatus(C.suppliers, 'Supplier', id, 'Active')}>Activate</Button>}
          <Button variant="primary" onClick={() => setEditing(true)} disabled={!canEdit} reason={canEdit ? undefined : 'Requires supplier edit permission'}>Edit supplier</Button>
        </>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <KpiTile label="Payable" amount={out.outstanding} currency={s.currency} sub={`${mine.length} open item${mine.length === 1 ? '' : 's'}`} onClick={() => setTab('items')} />
        <KpiTile label="Overdue" amount={out.overdue} currency={s.currency} tone={out.overdue > 0 ? 'negative' : 'none'} sub={sup.msmeNumber ? 'MSME · 45-day rule' : 'Per purchase terms'} />
        <KpiTile label="Bank for payments" value={approvedBank ? `${approvedBank.bankName} ••••${approvedBank.accountNumber.slice(-4)}` : 'None approved'} sub={sup.bankDetails.some((b) => b.status === 'Pending Approval') ? 'Change awaiting Treasury approval' : approvedBank ? 'Approved' : 'Payments blocked'} deltaTone={approvedBank ? 'good' : 'bad'} />
        <KpiTile label="Documents" value={docs.length} sub={refs.detail || 'No references yet'} onClick={() => setTab('docs')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'items', label: 'Open items' }, { id: 'docs', label: 'Recent documents' }, { id: 'contacts', label: 'Addresses & contacts' }, { id: 'history', label: 'Change history' }]} />
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="section-title">Identity & tax</div>
            <KV items={[{ k: 'Legal name', v: sup.name }, { k: 'GSTIN', v: sup.gstin ? <span className="identifier">{sup.gstin}</span> : undefined }, { k: 'PAN', v: sup.pan ? <span className="identifier">{sup.pan}</span> : undefined }, { k: 'Tax treatment', v: sup.taxTreatment }, { k: 'MSME / Udyam', v: sup.msmeNumber }, { k: 'Email', v: sup.email }, { k: 'Phone', v: sup.phone }]} />
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div className="section-title">Purchase terms</div>
            <KV items={[{ k: 'Currency', v: sup.currency }, { k: 'Purchase terms', v: sup.purchaseTerms }, { k: 'Payable account', v: acc ? `${acc.code} · ${acc.name}` : undefined }, { k: 'TDS section', v: tds ? `${tds.section} · ${tds.rate}%${!sup.pan ? ` (PAN missing → ${tds.ratePanMissing}%)` : ''}` : undefined }]} />
          </div>
          <div className="card" style={{ padding: 18, gridColumn: '1 / -1' }}>
            <BankDetailsList supplier={sup} canManage={canEdit} />
          </div>
        </div>
      )}
      {tab === 'items' && <OpenItemsTable items={mine} currency={s.currency} />}
      {tab === 'docs' && <RecentDocsTable docs={docs} currency={s.currency} />}
      {tab === 'contacts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><div className="section-title">Addresses</div><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{sup.addresses.length ? sup.addresses.map((a) => <AddressCard key={a.id} a={a} />) : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>No addresses</span>}</div></div>
          <div><div className="section-title">Contacts</div><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{sup.contacts.length ? sup.contacts.map((ct) => <ContactCard key={ct.id} c={ct} />) : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>No contacts</span>}</div></div>
        </div>
      )}
      {tab === 'history' && <ChangeHistory objectId={id} />}
      {editing && <SupplierForm supplier={sup} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
  );
}
