// Customer 360 (FR-PTY-001, FR-MDM-001/005): outstanding & overdue, open items, recent documents,
// addresses/contacts, change history.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useDb, useRecord, useSession } from '../../store';
import type { Customer, OpenItem } from '../../store';
import { Badge, Button, DataTable, EmptyState, KV, KpiTile, Meter, Money, PageHeader, Tabs, useToast } from '../../components/ui';
import { fmtDate, daysBetween, today } from '../../lib/format';
import { ChangeHistory, UsagePill, setStatus, useReferences } from './shared';
import { AddressCard, ContactCard } from './partyShared';
import { CustomerForm } from './customers';

const DOC_SOURCES: { col: string; label: string; link: (id: string) => string }[] = [
  { col: C.salesInvoices, label: 'Sales invoice', link: (id) => `sales/invoices/${id}` },
  { col: C.salesOrders, label: 'Sales order', link: (id) => `sales/orders/${id}` },
  { col: C.quotations, label: 'Quotation', link: (id) => `sales/quotations/${id}` },
  { col: C.deliveries, label: 'Delivery', link: (id) => `sales/deliveries/${id}` },
  { col: C.creditNotes, label: 'Credit note', link: (id) => `sales/credit-notes/${id}` },
  { col: C.receipts, label: 'Receipt', link: (id) => `sales/receipts/${id}` },
];

export function useRecentDocs(partyType: 'Customer' | 'Supplier', partyId: string, sources: typeof DOC_SOURCES) {
  const snap = useDb();
  return useMemo(() => {
    const out: { id: string; type: string; number: string; date: string; status: string; total: number; currency: string; link: string }[] = [];
    sources.forEach((s) => (snap[s.col] ?? []).filter((d: any) => d.partyId === partyId && (d.partyType ?? partyType) === partyType).forEach((d: any) => out.push({ id: d.id, type: s.label, number: d.number, date: d.date, status: d.status, total: d.totals?.total ?? d.amount ?? 0, currency: d.currency ?? 'INR', link: s.link(d.id) })));
    return out.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? ''))).slice(0, 25);
  }, [snap, partyId, partyType, sources]);
}

export function OpenItemsTable({ items, currency }: { items: OpenItem[]; currency: string }) {
  if (!items.length) return <EmptyState compact title="No open items" description="Posted invoices, credit notes and advances that are not fully settled appear here." />;
  return (
    <DataTable<OpenItem> rows={items} dense onRowClick={(o) => nav.go(o.docType === 'Sales Invoice' ? `sales/invoices/${o.docId}` : o.docType === 'Vendor Invoice' ? `purchase/vendor-invoices/${o.docId}` : `accounting/journals`)} columns={[
      { key: 'docNumber', label: 'Document', render: (o) => <span className="identifier link">{o.docNumber}</span> },
      { key: 'docType', label: 'Type' },
      { key: 'date', label: 'Date', render: (o) => fmtDate(o.date) },
      { key: 'dueDate', label: 'Due', render: (o) => { const d = daysBetween(o.dueDate, today()); return <span>{fmtDate(o.dueDate)} {d > 0 && o.direction === 'Debit' ? <span className="pill pill-critical">Overdue {d} d</span> : null}</span>; } },
      { key: 'originalAmount', label: 'Original', align: 'right', render: (o) => <Money value={o.direction === 'Debit' ? o.originalAmount : -o.originalAmount} currency={o.currency} code={o.currency !== currency} /> },
      { key: 'outstanding', label: 'Outstanding', align: 'right', render: (o) => <Money value={o.direction === 'Debit' ? o.outstanding : -o.outstanding} currency={o.currency} code={o.currency !== currency} base={o.currency !== currency ? o.baseOutstanding : undefined} baseCurrency={currency} rate={o.rate} />, total: (rows) => <Money value={rows.reduce((s, o) => s + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0)} currency={currency} /> },
      { key: 'status', label: 'Status', render: (o) => <Badge status={o.status} /> },
    ]} />
  );
}

export function RecentDocsTable({ docs, currency }: { docs: ReturnType<typeof useRecentDocs>; currency: string }) {
  if (!docs.length) return <EmptyState compact title="No documents yet" description="Quotations, orders, invoices and receipts for this party will be listed here." />;
  return (
    <DataTable rows={docs} dense onRowClick={(d) => nav.go(d.link)} columns={[
      { key: 'number', label: 'Number', render: (d) => <span className="identifier link">{d.number}</span> },
      { key: 'type', label: 'Type' },
      { key: 'date', label: 'Date', render: (d) => fmtDate(d.date) },
      { key: 'status', label: 'Status', render: (d) => <Badge status={d.status} /> },
      { key: 'total', label: 'Amount', align: 'right', render: (d) => <Money value={d.total} currency={d.currency} code={d.currency !== currency} /> },
    ]} />
  );
}

export default function CustomerDetail({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const c = useRecord<Customer>(C.customers, id);
  const openItems = useCollection<OpenItem>(C.openItems);
  const docs = useRecentDocs('Customer', id, DOC_SOURCES);
  const refs = useReferences(id, C.customers);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'items' | 'docs' | 'contacts' | 'history'>('overview');
  if (!c) return <EmptyState icon="🧭" title="Customer not found" action={<Button variant="primary" onClick={() => nav.go('masters/customers')}>Back to customers</Button>} />;
  const out = engine.partyOutstanding('Customer', id);
  const mine = openItems.filter((o) => o.partyType === 'Customer' && o.partyId === id && o.status !== 'Settled' && o.status !== 'Written Off');
  const credit = engine.checkCredit(id, 0);
  const canEdit = s.can('masters.customers.edit');
  const billing = c.addresses.find((a) => a.purpose !== 'Shipping' && a.isDefault) ?? c.addresses[0];
  const sp = db.find<any>(C.salespersons, c.salespersonId);
  const pl = db.find<any>(C.priceLists, c.priceListId);
  const acc = db.find<any>(C.accounts, c.receivableAccountId);
  const tds = db.find<any>(C.tdsSections, c.tdsSectionId);
  return (
    <div className="page">
      <PageHeader
        back={{ label: 'Customers', path: 'masters/customers' }}
        title={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{c.displayName || c.name} <Badge status={c.status} /> <Badge status="Draft">{c.taxTreatment}</Badge></span>}
        subtitle={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="identifier">{c.code}</span>{c.gstin && <span className="identifier">{c.gstin}</span>}{c.group && <span>{c.group}</span>}<UsagePill id={id} collection={C.customers} /></span>}
        actions={<>
          <Button variant="secondary" onClick={() => nav.go(`accounting/customer-ledger?party=${id}`)}>Customer ledger</Button>
          {c.status === 'Active' ? <Button variant="secondary" disabled={!canEdit} reason={canEdit ? undefined : 'Requires customer edit permission'} onClick={() => { setStatus(C.customers, 'Customer', id, 'Inactive'); toast.info(`${c.name} deactivated — ${refs.count} historical documents keep their reference`); }}>Deactivate</Button> : <Button variant="secondary" disabled={!canEdit} onClick={() => setStatus(C.customers, 'Customer', id, 'Active')}>Activate</Button>}
          <Button variant="primary" onClick={() => setEditing(true)} disabled={!canEdit} reason={canEdit ? undefined : 'Requires customer edit permission'}>Edit customer</Button>
        </>}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
        <KpiTile label="Outstanding" value={<Money value={out.outstanding} currency={s.currency} />} sub={`${mine.length} open item${mine.length === 1 ? '' : 's'}`} onClick={() => setTab('items')} />
        <KpiTile label="Overdue" value={<Money value={out.overdue} currency={s.currency} tone={out.overdue > 0 ? 'negative' : 'none'} />} sub={out.overdue > 0 ? 'Past due date' : 'Nothing overdue'} deltaTone={out.overdue > 0 ? 'bad' : 'good'} />
        <KpiTile label="Credit limit" value={c.creditLimit ? <Money value={c.creditLimit} currency={c.currency} /> : 'No limit'} sub={<span>Policy: {c.creditPolicy === 'Inherit' ? `Inherit (${credit.mode})` : c.creditPolicy}</span>} meta={c.creditLimit ? <Meter value={out.outstanding} max={c.creditLimit} /> : undefined} />
        <KpiTile label="Documents" value={docs.length} sub={refs.detail || 'No references yet'} onClick={() => setTab('docs')} />
      </div>
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'items', label: 'Open items' }, { id: 'docs', label: 'Recent documents' }, { id: 'contacts', label: 'Addresses & contacts' }, { id: 'history', label: 'Change history' }]} />
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card" style={{ padding: 18 }}>
            <div className="section-title">Identity & tax</div>
            <KV items={[{ k: 'Legal name', v: c.name }, { k: 'Display name', v: c.displayName }, { k: 'GSTIN', v: c.gstin ? <span className="identifier">{c.gstin}</span> : undefined }, { k: 'PAN', v: c.pan ? <span className="identifier">{c.pan}</span> : undefined }, { k: 'Tax treatment', v: c.taxTreatment }, { k: 'Place of supply', v: billing ? `${billing.address.state}${billing.address.stateCode ? ` (${billing.address.stateCode})` : ''}` : undefined }, { k: 'Email', v: c.email }, { k: 'Phone', v: c.phone }]} />
          </div>
          <div className="card" style={{ padding: 18 }}>
            <div className="section-title">Commercial terms</div>
            <KV items={[{ k: 'Currency', v: c.currency }, { k: 'Payment terms', v: c.paymentTerms }, { k: 'Price list', v: pl?.name }, { k: 'Salesperson', v: sp?.name }, { k: 'Receivable account', v: acc ? `${acc.code} · ${acc.name}` : undefined }, { k: 'TDS / TCS', v: tds ? `${tds.section} · ${tds.rate}%` : undefined }, { k: 'Credit limit', v: <Money value={c.creditLimit} currency={c.currency} /> }, { k: 'Credit policy', v: c.creditPolicy }]} />
          </div>
          {c.notes && <div className="card" style={{ padding: 18, gridColumn: '1 / -1' }}><div className="section-title">Notes</div><div style={{ fontSize: 13 }}>{c.notes}</div></div>}
        </div>
      )}
      {tab === 'items' && <OpenItemsTable items={mine} currency={s.currency} />}
      {tab === 'docs' && <RecentDocsTable docs={docs} currency={s.currency} />}
      {tab === 'contacts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div><div className="section-title">Addresses</div><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{c.addresses.length ? c.addresses.map((a) => <AddressCard key={a.id} a={a} />) : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>No addresses</span>}</div></div>
          <div><div className="section-title">Contacts</div><div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{c.contacts.length ? c.contacts.map((ct) => <ContactCard key={ct.id} c={ct} />) : <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>No contacts</span>}</div></div>
        </div>
      )}
      {tab === 'history' && <ChangeHistory objectId={id} />}
      {editing && <CustomerForm customer={c} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
    </div>
  );
}
