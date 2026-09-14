// Vendor invoice register (FR-PUR-030..034).
import { C, nav, useCollection, useSession } from '../../store';
import { RegisterPage, Badge, Money, TwoLine, type Column } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import type { VendorInvoice } from './types';
import { DocLink, OverduePill } from './shared';

export function VendorInvoiceRegister() {
  const rows = useCollection<VendorInvoice>(C.vendorInvoices);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const payable = mine.filter((r) => r.status === 'Posted').reduce((x, r) => x + r.totals.due, 0);
  const columns: Column<VendorInvoice>[] = [
    { key: 'number', label: 'Invoice #', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link">{r.number}</span>} secondary={r.supplierInvoiceNumber} mono /> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
    { key: 'partyName', label: 'Supplier', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono /> },
    { key: 'poNumber', label: 'Source PO', render: (r) => <DocLink path={r.poId ? `purchase/orders/${r.poId}` : undefined} number={r.poNumber ?? '—'} /> },
    { key: 'grn', label: 'Source GRN', render: (r) => r.grnNumbers.length ? <DocLink path={`purchase/grn/${r.grnIds[0]}`} number={r.grnNumbers.join(', ')} /> : <span style={{ color: 'var(--ink-5)' }}>—</span> },
    { key: 'taxable', label: 'Taxable', align: 'right', value: (r) => r.totals.taxable, render: (r) => <Money value={r.totals.taxable} currency={r.currency} /> },
    { key: 'tax', label: 'Tax', align: 'right', value: (r) => r.totals.tax, render: (r) => <span className="money" style={{ color: 'var(--ink-3)' }}>{fmtMoney(r.totals.tax, r.currency)}{r.reverseCharge ? ' (RCM)' : ''}</span> },
    { key: 'tds', label: 'TDS', align: 'right', value: (r) => r.totals.tds, render: (r) => r.totals.tds ? <span className="money" style={{ color: 'var(--danger)' }}>{fmtMoney(r.totals.tds, r.currency)}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span> },
    { key: 'total', label: 'Total', align: 'right', sortable: true, value: (r) => r.totals.total, render: (r) => <Money value={r.totals.total} currency={r.currency} style={{ fontWeight: 600 }} />, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totals.baseTotal, 0)) },
    { key: 'due', label: 'Due', render: (r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>{fmtDate(r.dueDate)}{r.status === 'Posted' && <OverduePill dueDate={r.dueDate} outstanding={r.totals.due} />}</span> },
    { key: 'matchStatus', label: `${s.company?.defaults.matchingMode ?? '3-way'} match`, render: (r) => <Badge status={r.matchStatus} /> },
    { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status} /> },
  ];
  return (
    <RegisterPage<VendorInvoice> title="Vendor invoices" subtitle={<>{mine.length} invoices · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(payable)}</span> outstanding · {s.company?.tradeName} · FY {s.state.fy}</>} entity="vendor invoices" rows={mine} columns={columns} searchKeys={['number', 'supplierInvoiceNumber', 'partyName', 'poNumber']}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'exception', label: 'Exception', filter: (r) => r.matchStatus === 'Exception' && r.status !== 'Posted' }, { id: 'ready', label: 'Ready to post', filter: (r) => r.status === 'Approved' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'unpaid', label: 'Unpaid', filter: (r) => r.status === 'Posted' && r.totals.due > 0.005 }, { id: 'reversed', label: 'Reversed / cancelled', filter: (r) => r.status === 'Reversed' || r.status === 'Cancelled' }]}
      filters={[{ key: 'supplier', label: 'Supplier', type: 'select', options: Array.from(new Set(mine.map((r) => r.partyName ?? ''))).filter(Boolean).map((n) => ({ value: n, label: n })) }, { key: 'date', label: 'Date', type: 'date-range' }, { key: 'match', label: 'Match', type: 'select', options: ['Matched', 'Exception', 'Pending', 'Not Required'].map((m) => ({ value: m, label: m })) }]}
      applyFilter={(r, v) => (!v.supplier || r.partyName === v.supplier) && (!v.dateFrom || r.date >= v.dateFrom) && (!v.dateTo || r.date <= v.dateTo) && (!v.match || r.matchStatus === v.match)}
      primaryAction={{ label: 'New vendor invoice', onClick: () => nav.go('purchase/vendor-invoices/new'), disabled: !s.can('purchase.invoice.create'), reason: !s.can('purchase.invoice.create') ? 'Requires purchase.invoice.create' : undefined }} onRowClick={(r) => nav.go(`purchase/vendor-invoices/${r.id}`)}
      rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/vendor-invoices/${r.id}`) }, ...(r.status === 'Draft' || r.status === 'Submitted' ? [{ label: 'Edit', onClick: () => nav.go(`purchase/vendor-invoices/${r.id}/edit`) }] : []), ...(r.status === 'Posted' && r.totals.due > 0 ? [{ label: 'Record payment', onClick: () => nav.go(`purchase/payments/new?supplier=${r.partyId}&items=${r.openItemId ?? ''}`) }] : [])]}
      bulkActions={(ids, rs) => [{ label: 'Create payment proposal', onClick: () => nav.go(`purchase/ageing?select=${rs.filter((r) => r.openItemId).map((r) => r.openItemId).join(',')}`), disabled: !rs.some((r) => r.status === 'Posted' && r.totals.due > 0), reason: 'Select posted unpaid invoices' }, { label: `Print ${ids.size}`, onClick: () => nav.go(`purchase/vendor-invoices/${rs[0].id}?tab=print`) }]} />
  );
}
