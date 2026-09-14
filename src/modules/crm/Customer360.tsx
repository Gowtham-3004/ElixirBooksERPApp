// Customer 360: one customer → exposure, documents, open items, activities.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Customer, OpenItem } from '../../store';
import { Button, Badge, KpiTile, Tabs, DataTable, EntityPicker, useCustomerOptions, Card, KV, Timeline, Meter, PageHeader, EmptyState, Identifier, Money } from '../../components/ui';
import type { Column } from '../../components/ui';
import { fmtDate, fmtMoney, today, daysBetween } from '../../lib/format';
import type { CrmActivity, Lead } from './types';
import { ActivityDrawer } from './Activities';

export default function Customer360({ customerId }: { customerId?: string }) {
  const s = useSession();
  const custOpts = useCustomerOptions();
  const customers = useCollection<Customer>(C.customers);
  const invoices = useCollection<any>(C.salesInvoices);
  const orders = useCollection<any>(C.salesOrders);
  const quotes = useCollection<any>(C.quotations);
  const receipts = useCollection<any>(C.receipts);
  const cns = useCollection<any>(C.creditNotes);
  const openItems = useCollection<OpenItem>(C.openItems);
  const activities = useCollection<CrmActivity>(C.crmActivities);
  const leads = useCollection<Lead>(C.leads);
  const [tab, setTab] = useState<'documents' | 'open' | 'activity' | 'profile'>('documents');
  const [act, setAct] = useState(false);
  const c = customers.find((x) => x.id === customerId);
  const data = useMemo(() => {
    if (!c) return null;
    const my = <T extends { partyId?: string }>(rows: T[]) => rows.filter((r) => r.partyId === c.id);
    const inv = my(invoices), so = my(orders), qt = my(quotes), rc = my(receipts), cn = my(cns);
    const oi = openItems.filter((o) => o.partyType === 'Customer' && o.partyId === c.id && (o.status === 'Open' || o.status === 'Partially Settled'));
    const exposure = engine.partyOutstanding('Customer', c.id);
    const fyStart = `${s.state.fy?.slice(0, 4) ?? '2026'}-04-01`;
    const ytd = inv.filter((i: any) => (i.status === 'Posted' || i.status === 'Settled') && i.date >= fyStart && !i.reversalOfId).reduce((a: number, i: any) => a + (i.totals.baseTotal || i.totals.total), 0);
    const paidInv = inv.filter((i: any) => i.status === 'Settled' && i.openItemId);
    const dso = paidInv.length ? Math.round(paidInv.reduce((a: number, i: any) => { const oi = openItems.find((o) => o.id === i.openItemId); const last = oi?.settlements.slice(-1)[0]?.date; return a + (last ? daysBetween(i.date, last) : 0); }, 0) / paidInv.length) : 0;
    return { inv, so, qt, rc, cn, oi, exposure, ytd, dso, acts: activities.filter((a) => a.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), leads: leads.filter((l) => l.customerId === c.id) };
  }, [c, invoices, orders, quotes, receipts, cns, openItems, activities, leads, s.state.fy]);

  if (!c || !data) {
    return (
      <div className="page">
        <PageHeader title="Customer 360" subtitle="Search a customer to see outstanding, documents and activity in one place." />
        <div style={{ maxWidth: 480 }}><EntityPicker value={undefined} onChange={(id) => id && nav.go(`crm/customers/${id}`)} options={custOpts} placeholder="Search customer by name, GSTIN, code…" autoFocus recentKey="customers" /></div>
        <div className="grid-3">{customers.filter((x) => x.status === 'Active').slice(0, 6).map((x) => { const e = engine.partyOutstanding('Customer', x.id); return <Card key={x.id} padding={14} style={{ cursor: 'pointer' }} title={<span className="link" onClick={() => nav.go(`crm/customers/${x.id}`)}>{x.name}</span>}><KV items={[{ k: 'Outstanding', v: fmtMoney(e.outstanding) }, { k: 'Overdue', v: <span style={{ color: e.overdue ? 'var(--danger)' : undefined }}>{fmtMoney(e.overdue)}</span> }]} /></Card>; })}</div>
      </div>
    );
  }
  const docCols = (kind: string, path: string): Column<any>[] => [
    { key: 'number', label: kind, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`${path}/${r.id}`); }}>{r.number}</Identifier> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), value: (r) => r.date, sortable: true },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
    { key: 'total', label: 'Amount', align: 'right', render: (r) => <Money value={r.totals?.total ?? r.amount ?? 0} currency={r.currency} />, value: (r) => r.totals?.total ?? r.amount },
    ...(kind === 'Invoice' ? [{ key: 'due', label: 'Due', align: 'right' as const, render: (r: any) => (r.status === 'Posted' ? <Money value={r.totals.due} currency={r.currency} /> : '—') }] : []),
  ];
  const limitUse = c.creditLimit ? Math.min(100, Math.round((Math.max(0, data.exposure.outstanding) / c.creditLimit) * 100)) : 0;
  return (
    <div className="page">
      <PageHeader back={{ label: 'Customer 360', path: 'crm/customers' }} title={<span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{c.name} <Badge status={c.status} /></span>} subtitle={`${c.code} · ${c.gstin ?? c.taxTreatment} · ${c.group ?? ''} · ${c.paymentTerms} · ${c.currency}`}
        actions={<><div style={{ width: 240 }}><EntityPicker value={c.id} onChange={(id) => id && nav.go(`crm/customers/${id}`)} options={custOpts} size="sm" allowClear={false} /></div><Button variant="secondary" onClick={() => setAct(true)}>Log activity</Button><Button variant="secondary" onClick={() => nav.go(`sales/statements/${c.id}`)}>Statement</Button><Button variant="secondary" onClick={() => nav.go(`masters/customers/${c.id}`)}>Open master</Button><Button variant="primary" onClick={() => nav.go('sales/quotations/new')}>New quotation</Button></>} />
      <div className="grid-4">
        <KpiTile label="Outstanding" value={fmtMoney(data.exposure.outstanding)} sub={`${data.oi.filter((o) => o.direction === 'Debit').length} open invoices`} onClick={() => setTab('open')} />
        <KpiTile label="Overdue" value={<span style={{ color: data.exposure.overdue ? 'var(--danger)' : undefined }}>{fmtMoney(data.exposure.overdue)}</span>} sub={data.exposure.overdue ? 'Follow up under Collections' : 'Nothing overdue'} onClick={() => nav.go('sales/collections', { customer: c.id })} />
        <KpiTile label="Credit limit" value={c.creditLimit ? fmtMoney(c.creditLimit) : '—'} sub={c.creditLimit ? `${limitUse}% used · policy ${c.creditPolicy === 'Inherit' ? s.company?.defaults.creditPolicy : c.creditPolicy}` : 'No limit set'} meta={c.creditLimit ? <Meter value={limitUse} /> : undefined} />
        <KpiTile label="Sales this FY" value={fmtMoney(data.ytd)} sub={data.dso ? `avg ${data.dso} days to pay` : `${data.inv.length} invoices`} />
      </div>
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'documents', label: 'Documents', count: data.inv.length + data.so.length + data.qt.length + data.rc.length + data.cn.length }, { id: 'open', label: 'Open items', count: data.oi.length }, { id: 'activity', label: 'Activities', count: data.acts.length }, { id: 'profile', label: 'Profile' }]} />
      {tab === 'documents' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section><div className="section-title">Invoices</div><DataTable rows={data.inv.slice(0, 10)} columns={docCols('Invoice', 'sales/invoices')} dense onRowClick={(r) => nav.go(`sales/invoices/${r.id}`)} emptyTitle="No invoices" /></section>
          <div className="grid-2">
            <section><div className="section-title">Sales orders</div><DataTable rows={data.so.slice(0, 6)} columns={docCols('Order', 'sales/orders')} dense onRowClick={(r) => nav.go(`sales/orders/${r.id}`)} emptyTitle="No orders" /></section>
            <section><div className="section-title">Quotations</div><DataTable rows={data.qt.slice(0, 6)} columns={docCols('Quotation', 'sales/quotations')} dense onRowClick={(r) => nav.go(`sales/quotations/${r.id}`)} emptyTitle="No quotations" /></section>
            <section><div className="section-title">Receipts</div><DataTable rows={data.rc.slice(0, 6)} columns={docCols('Receipt', 'sales/receipts')} dense onRowClick={(r) => nav.go(`sales/receipts/${r.id}`)} emptyTitle="No receipts" /></section>
            <section><div className="section-title">Credit notes</div><DataTable rows={data.cn.slice(0, 6)} columns={docCols('Credit note', 'sales/credit-notes')} dense onRowClick={(r) => nav.go(`sales/credit-notes/${r.id}`)} emptyTitle="No credit notes" /></section>
          </div>
        </div>
      )}
      {tab === 'open' && <DataTable rows={data.oi} columns={[{ key: 'docNumber', label: 'Document', render: (o) => <span className="link identifier" onClick={() => nav.go(o.docType === 'Sales Invoice' ? `sales/invoices/${o.docId}` : o.docType === 'Receipt' ? `sales/receipts/${o.docId}` : `sales/credit-notes/${o.docId}`)}>{o.docNumber}</span> }, { key: 'docType', label: 'Type', render: (o) => o.docType }, { key: 'date', label: 'Date', render: (o) => fmtDate(o.date) }, { key: 'dueDate', label: 'Due', render: (o) => { const d = daysBetween(o.dueDate, today()); return <span style={{ color: o.direction === 'Debit' && d > 0 ? 'var(--danger)' : undefined }}>{fmtDate(o.dueDate)}{o.direction === 'Debit' && d > 0 ? ` · ${d}d` : ''}</span>; } }, { key: 'direction', label: '', render: (o) => <Badge status={o.direction === 'Debit' ? 'Open' : 'Approved'}>{o.direction === 'Debit' ? 'Receivable' : 'Credit'}</Badge> }, { key: 'outstanding', label: 'Outstanding', align: 'right', render: (o) => <Money value={o.direction === 'Debit' ? o.outstanding : -o.outstanding} currency={o.currency} tone="auto" />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, o) => a + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0))}</span> }, { key: 'status', label: 'Status', render: (o) => <Badge status={o.status} /> }]} emptyTitle="No open items" />}
      {tab === 'activity' && <Card title="Activity" actions={<Button size="sm" variant="secondary" onClick={() => setAct(true)}>+ Log</Button>}><Timeline items={data.acts.map((a) => ({ type: a.type === 'Promise to pay' ? 'success' : a.type === 'Reminder' ? 'warning' : a.status === 'Done' ? 'neutral' : 'info', event: a.type, predicate: `${a.subject} · ${a.ownerName}`, time: a.createdAt, note: a.notes, meta: a.status === 'Open' && (a.dueAt || a.promiseDate) ? `Due ${fmtDate(a.promiseDate ?? a.dueAt)}` : undefined }))} /></Card>}
      {tab === 'profile' && (
        <div className="grid-2">
          <Card title="Identity"><KV items={[{ k: 'Legal name', v: c.name }, { k: 'GSTIN', v: c.gstin ?? '—' }, { k: 'PAN', v: c.pan ?? '—' }, { k: 'Tax treatment', v: c.taxTreatment }, { k: 'Group', v: c.group ?? '—' }, { k: 'Salesperson', v: db.find<any>(C.salespersons, c.salespersonId)?.name ?? '—' }, { k: 'Price list', v: db.find<any>(C.priceLists, c.priceListId)?.name ?? '—' }, { k: 'Leads', v: data.leads.length ? data.leads.map((l) => <span key={l.id} className="link" style={{ marginRight: 8 }} onClick={() => nav.go(`crm/leads/${l.id}`)}>{l.name}</span>) : '—' }]} /></Card>
          <Card title="Contacts & addresses"><KV items={[...c.contacts.map((x) => ({ k: x.name, v: `${x.designation ?? ''} · ${x.email ?? ''} · ${x.phone ?? ''}` })), ...c.addresses.map((a) => ({ k: a.purpose, v: `${a.address.line1}, ${a.address.city}, ${a.address.state} ${a.address.pin ?? ''}` }))]} /></Card>
        </div>
      )}
      {act && <ActivityDrawer onClose={() => setAct(false)} initial={{ customerId: c.id, customerName: c.name }} />}
    </div>
  );
}

export { EmptyState };
