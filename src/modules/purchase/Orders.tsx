// Purchase order register (FR-PUR-010/011).
import { C, nav, useCollection, useSession } from '../../store';
import { RegisterPage, Badge, Money, TwoLine, Meter, type Column } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import type { PurchaseOrder } from './types';
import * as A from './actions';

export function OrderRegister() {
  const rows = useCollection<PurchaseOrder>(C.purchaseOrders);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.number.localeCompare(a.number));
  const apOutstanding = A.apAgeing().reduce((x, r) => x + r.total, 0);
  const columns: Column<PurchaseOrder>[] = [
    { key: 'number', label: 'Number', sortable: true, render: (r) => <span className="identifier link">{r.number}{r.revision ? <span style={{ color: '#5F6368', fontWeight: 400 }}> · rev {r.revision}</span> : null}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
    { key: 'partyName', label: 'Supplier', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono /> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status === 'Submitted' ? 'Awaiting Approval' : r.status}>{r.status === 'Submitted' ? 'Awaiting approval' : r.status}</Badge> },
    { key: 'ordered', label: 'Ordered', align: 'right', sortable: true, value: (r) => r.totals.total, render: (r) => <Money value={r.totals.total} currency={r.currency} />, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totals.baseTotal, 0)) },
    { key: 'received', label: 'Received', align: 'right', value: (r) => A.poFulfilment(r).receivedValue, render: (r) => { const f = A.poFulfilment(r); return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}><Money value={f.receivedValue} currency={r.currency} /><div style={{ width: 60 }}><Meter value={f.receivedPct} tone={f.receivedPct >= 100 ? 'good' : undefined} /></div></div>; } },
    { key: 'accepted', label: 'Accepted / rejected', align: 'right', value: (r) => A.poFulfilment(r).accepted, render: (r) => { const f = A.poFulfilment(r); return <span className="money">{f.accepted}{f.rejected ? <span style={{ color: '#C0393F' }}> / {f.rejected}</span> : ''}</span>; } },
    { key: 'invoiced', label: 'Invoiced', align: 'right', value: (r) => A.poFulfilment(r).invoicedValue, render: (r) => <Money value={A.poFulfilment(r).invoicedValue} currency={r.currency} /> },
    { key: 'returned', label: 'Returned', align: 'right', value: (r) => A.poFulfilment(r).returned, render: (r) => { const f = A.poFulfilment(r); return f.returned ? <span className="money" style={{ color: '#8A4B0F' }}>{f.returned}</span> : <span style={{ color: '#B0B5BF' }}>—</span>; } },
    { key: 'pending', label: 'Pending qty', align: 'right', value: (r) => A.poFulfilment(r).pending, render: (r) => { const f = A.poFulfilment(r); return f.pending ? <span className="money">{f.pending}</span> : <span style={{ color: '#B0B5BF' }}>—</span>; } },
    { key: 'expectedDate', label: 'Expected', sortable: true, render: (r) => fmtDate(r.expectedDate) },
  ];
  const canCreate = s.can('purchase.order.create') || s.can('purchase.po.create');
  return (
    <RegisterPage<PurchaseOrder>
      title="Purchase orders" subtitle={<>{mine.length} orders · <span style={{ fontFeatureSettings: '"tnum" 1' }}>{fmtMoney(apOutstanding)}</span> AP outstanding · {s.branch?.name} · FY {s.state.fy}</>} entity="purchase orders" rows={mine} columns={columns} searchKeys={['number', 'partyName', 'reference', 'requisitionNumber']}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' || r.status === 'Returned' }, { id: 'awaiting', label: 'Awaiting approval', filter: (r) => r.status === 'Submitted' }, { id: 'approved', label: 'Approved', filter: (r) => r.status === 'Approved' }, { id: 'partial', label: 'Partially received', filter: (r) => r.status === 'Partially Received' || r.status === 'Received' }, { id: 'closed', label: 'Closed', filter: (r) => r.status === 'Closed' || r.status === 'Short Closed' }, { id: 'cancelled', label: 'Cancelled', filter: (r) => r.status === 'Cancelled' || r.status === 'Rejected' }]}
      filters={[{ key: 'supplier', label: 'Supplier', type: 'select', options: Array.from(new Set(mine.map((r) => r.partyName ?? ''))).filter(Boolean).map((n) => ({ value: n, label: n })) }, { key: 'date', label: 'Date', type: 'date-range' }, { key: 'amount', label: 'Amount', type: 'amount-range' }]}
      applyFilter={(r, v) => (!v.supplier || r.partyName === v.supplier) && (!v.dateFrom || r.date >= v.dateFrom) && (!v.dateTo || r.date <= v.dateTo) && (!v.amountMin || r.totals.total >= Number(v.amountMin)) && (!v.amountMax || r.totals.total <= Number(v.amountMax))}
      primaryAction={{ label: 'New PO', onClick: () => nav.go('purchase/orders/new'), disabled: !canCreate, reason: !canCreate ? 'Requires purchase.order.create' : undefined }}
      onRowClick={(r) => nav.go(`purchase/orders/${r.id}`)}
      rowActions={(r) => [
        { label: 'Open', onClick: () => nav.go(`purchase/orders/${r.id}`) },
        ...(r.status === 'Draft' || r.status === 'Returned' ? [{ label: 'Edit', onClick: () => nav.go(`purchase/orders/${r.id}/edit`) }] : []),
        ...(['Approved', 'Partially Received'].includes(r.status) ? [{ label: 'Receive goods (GRN)', onClick: () => nav.go(`purchase/grn/new?po=${r.id}`) }] : []),
        ...(['Approved', 'Partially Received', 'Received'].includes(r.status) ? [{ label: 'Book vendor invoice', onClick: () => nav.go(`purchase/vendor-invoices/new?po=${r.id}`) }] : []),
      ]}
      bulkActions={(ids, rs) => [{ label: 'Print selected', onClick: () => { rs.forEach((r) => nav.go(`purchase/orders/${r.id}?tab=print`)); }, disabled: ids.size !== 1, reason: ids.size !== 1 ? 'Select one' : undefined }]}
    />
  );
}
