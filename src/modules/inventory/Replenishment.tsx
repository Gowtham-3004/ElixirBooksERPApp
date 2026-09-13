// Replenishment suggestions (FR-TRD-002): live computation → requisition / PO drafts grouped by supplier.
import { useMemo, useState } from 'react';
import { C, nav, useCollection } from '../../store';
import { RegisterPage, Button, Badge, TwoLine, Pill, useToast, NumberField, ScopeLine } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty } from '../../lib/format';
import * as A from './actions';
import { SupplierLink } from '../purchase/shared';

export function Replenishment() {
  const moves = useCollection<any>(C.stockMovements);
  const pos = useCollection<any>(C.purchaseOrders);
  const res = useCollection<any>(C.reservations);
  const toast = useToast();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const sugs = useMemo(() => A.replenishmentSuggestions(), [moves, pos, res]);
  const create = (rows: A.Suggestion[], mode: 'requisition' | 'po') => { try { const r = A.createFromSuggestions(rows, mode, qtys); toast.success(`${r.numbers.join(', ')} created`, { label: 'Open', path: mode === 'po' ? `purchase/orders/${r.ids[0]}/edit` : `purchase/requisitions/${r.ids[0]}` }); } catch (e: any) { toast.error(e.message); } };
  return (
    <RegisterPage<A.Suggestion> title="Replenishment" subtitle={<ScopeLine extra={`${sugs.length} suggestion(s) · projected = on hand − reserved + on order + in transit vs max(reorder level, safety stock)`} />} entity="suggestions" rows={sugs} rowKey={(r) => r.item.id} searchKeys={['item.name', 'item.code', 'supplierName']}
      tabs={[{ id: 'all', label: 'All' }, { id: 'out', label: 'Out of stock', filter: (r) => r.trigger === 'Out of stock' }, { id: 'safety', label: 'Below safety stock', filter: (r) => r.trigger === 'Below safety stock' }, { id: 'reorder', label: 'Below reorder level', filter: (r) => r.trigger === 'Below reorder level' }, { id: 'nosup', label: 'No preferred supplier', filter: (r) => !r.supplierId }]}
      columns={[
        { key: 'item', label: 'Item', sortable: true, value: (r) => r.item.name, render: (r) => <TwoLine primary={r.item.name} secondary={`${r.item.code} · ${r.item.group}`} /> },
        { key: 'trigger', label: 'Trigger', render: (r) => <Pill tone={r.trigger === 'Out of stock' ? 'critical' : 'warning'}>{r.trigger}</Pill> },
        { key: 'onHand', label: 'On hand', align: 'right', render: (r) => <span className="money">{fmtQty(r.onHand)}</span> },
        { key: 'reserved', label: 'Reserved', align: 'right', render: (r) => <span className="money" style={{ color: '#5F6368' }}>{fmtQty(r.reserved)}</span> },
        { key: 'committed', label: 'On order', align: 'right', render: (r) => <span className="money" style={{ color: '#325CFF' }}>{fmtQty(r.committed + r.inTransit)}</span> },
        { key: 'projected', label: 'Projected', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 600, color: '#C0393F' }}>{fmtQty(r.projected)}</span> },
        { key: 'reorderLevel', label: 'Reorder / safety', align: 'right', render: (r) => <span className="money" style={{ fontSize: 12, color: '#5F6368' }}>{fmtQty(r.reorderLevel)} / {fmtQty(r.safetyStock)}</span> },
        { key: 'shortfall', label: 'Shortfall', align: 'right', render: (r) => <span className="money">{fmtQty(r.shortfall)}</span> },
        { key: 'suggestedQty', label: 'Order qty', align: 'right', render: (r) => <NumberField size="grid" value={qtys[r.item.id] ?? r.suggestedQty} onChange={(v) => setQtys({ ...qtys, [r.item.id]: v })} decimals={3} min={0} /> },
        { key: 'value', label: 'Est. value', align: 'right', render: (r) => <span className="money">{fmtMoney((qtys[r.item.id] ?? r.suggestedQty) * r.item.purchasePrice)}</span>, total: (rs) => fmtMoney(rs.reduce((x, r) => x + (qtys[r.item.id] ?? r.suggestedQty) * r.item.purchasePrice, 0)) },
        { key: 'supplierName', label: 'Preferred supplier', render: (r) => r.supplierId ? <SupplierLink id={r.supplierId} name={r.supplierName} /> : <Badge status="Returned">None</Badge> },
        { key: 'leadTimeDays', label: 'Lead time', align: 'right', render: (r) => `${r.leadTimeDays} d` },
        { key: 'needBy', label: 'Need by', render: (r) => fmtDate(r.needBy) },
      ]}
      bulkActions={(ids, rows) => [{ label: `Create requisition (${ids.size})`, onClick: () => create(rows, 'requisition') }, { label: `Create PO by supplier (${ids.size})`, onClick: () => create(rows, 'po'), disabled: rows.some((r) => !r.supplierId), reason: rows.some((r) => !r.supplierId) ? 'Some items have no preferred supplier' : undefined }]}
      emptyTitle="Stock levels are healthy" emptyDescription="No item is projected below its reorder level or safety stock."
      actions={<Button onClick={() => nav.go('inventory/stock')}>Stock on hand</Button>} />
  );
}
