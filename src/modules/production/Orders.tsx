// Production order register — tabs by status, late pill, state-valid row actions (FR-MFG-007/008).
import { useMemo } from 'react';
import { C, nav, useCollection, useSession, useRoute } from '../../store';
import { RegisterPage, Badge, ScopeLine, useToast, type Column, type MenuAction } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import type { ProductionOrder } from './types';
import { isLate } from './core';
import * as A from './actions';
import { useConfirm, StatusBadge, Progress, VarianceCell } from './shared';

export function OrderRegister() {
  const s = useSession();
  const route = useRoute();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid);
  const toast = useToast();
  const confirm = useConfirm();
  const rows = useMemo(() => orders.slice().sort((a, b) => b.number.localeCompare(a.number)), [orders]);
  const active = rows.filter((o) => ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const columns: Column<ProductionOrder>[] = [
    { key: 'number', label: 'Order', sortable: true, render: (o) => <div><span className="identifier link" style={{ fontWeight: 500 }}>{o.number}</span><div className="cell-secondary">{fmtDate(o.date)}{o.sourceDemand ? ` · ${o.sourceDemand.number}` : ''}</div></div> },
    { key: 'itemName', label: 'Item', sortable: true, render: (o) => <div><div>{o.itemName}</div><div className="cell-secondary identifier">{o.itemCode} · BOM {o.bomCode} v{o.bomVersion}</div></div> },
    { key: 'qty', label: 'Qty', align: 'right', sortable: true, render: (o) => <span className="money">{o.qty} {o.uom}</span> },
    { key: 'status', label: 'Status', sortable: true, render: (o) => <StatusBadge order={o} /> },
    { key: 'plannedStart', label: 'Planned', sortable: true, render: (o) => <span style={{ fontSize: 12 }}>{fmtDate(o.plannedStart)} → {fmtDate(o.plannedEnd)}</span> },
    { key: 'progress', label: 'Output', render: (o) => ['Draft', 'Planned', 'Submitted', 'Approved', 'Cancelled'].includes(o.status) ? <span style={{ color: 'var(--ink-5)' }}>—</span> : <Progress done={o.receivedQty} total={o.qty} />, value: (o) => o.receivedQty },
    { key: 'totalStd', label: 'Std cost', align: 'right', render: (o) => <span className="money">{fmtMoney(o.costs.totalStd, s.currency)}</span>, value: (o) => o.costs.totalStd, total: (r) => <span className="money">{fmtMoney(r.reduce((a, o) => a + o.costs.totalStd, 0), s.currency)}</span> },
    { key: 'totalActual', label: 'Actual', align: 'right', render: (o) => <span className="money">{o.costs.totalActual ? fmtMoney(o.costs.totalActual, s.currency) : '—'}</span>, value: (o) => o.costs.totalActual, total: (r) => <span className="money">{fmtMoney(r.reduce((a, o) => a + o.costs.totalActual, 0), s.currency)}</span> },
    { key: 'variance', label: 'Variance', align: 'right', render: (o) => o.costs.totalActual ? <VarianceCell std={o.costs.totalStd} actual={o.costs.totalActual} currency={s.currency} /> : <span style={{ color: 'var(--ink-5)' }}>—</span>, value: (o) => o.costs.variance },
  ];
  const run = (fn: () => unknown, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const rowActions = (o: ProductionOrder): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open', onClick: () => nav.go(`production/orders/${o.id}`) }];
    if (o.status === 'Draft') a.push({ label: 'Edit', onClick: () => nav.go(`production/orders/${o.id}/edit`) }, { label: 'Plan', onClick: () => run(() => A.planOrder(o.id), `${o.number} planned`) });
    if (o.status === 'Planned' || o.status === 'Approved') a.push({ label: 'Release', onClick: () => nav.go(`production/orders/${o.id}?action=release`) });
    if (o.status === 'Released') a.push({ label: 'Start', onClick: () => run(() => A.startOrder(o.id), `${o.number} started`) });
    if (['Released', 'In Progress', 'Partially Completed'].includes(o.status)) a.push({ label: 'Issue materials', onClick: () => nav.go(`production/issues/new?order=${o.id}`) }, { label: 'Record output', onClick: () => nav.go(`production/receipts/new?order=${o.id}`) });
    if (o.status === 'Completed') a.push({ label: 'Close', onClick: () => nav.go(`production/orders/${o.id}?action=close`) });
    if (['Draft', 'Planned', 'Released', 'Submitted', 'Approved'].includes(o.status)) a.push({ label: 'Cancel', danger: true, onClick: () => confirm.open({ title: `Cancel ${o.number}?`, reasonRequired: true, confirmLabel: 'Cancel order', cancelLabel: 'Keep order', danger: true, onConfirm: (r) => A.cancelOrder(o.id, r) }) });
    if (o.status === 'Draft') a.push({ label: 'Delete draft', danger: true, onClick: () => confirm.open({ title: `Delete draft ${o.number}?`, statement: 'The number is voided and the draft removed.', confirmLabel: 'Delete draft', danger: true, onConfirm: () => A.deleteDraft(o.id) }) });
    return a;
  };
  const initialStatus = route.params.status;
  return (
    <>
      <RegisterPage title="Production orders" subtitle={<ScopeLine extra={`${active.length} on the floor · ${rows.filter(isLate).length} late · ${fmtMoney(active.reduce((a, o) => a + o.costs.totalStd, 0), s.currency)} planned value`} />} rows={rows} columns={columns} entity="production orders" searchKeys={['number', 'itemName', 'itemCode', 'sourceDemand.number']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (o) => o.status === 'Draft' }, { id: 'planned', label: 'Planned', filter: (o) => o.status === 'Planned' || o.status === 'Submitted' || o.status === 'Approved' }, { id: 'released', label: 'Released', filter: (o) => o.status === 'Released' }, { id: 'progress', label: 'In progress', filter: (o) => o.status === 'In Progress' || o.status === 'Partially Completed' }, { id: 'late', label: 'Late', filter: isLate }, { id: 'completed', label: 'Completed', filter: (o) => o.status === 'Completed' }, { id: 'closed', label: 'Closed', filter: (o) => o.status === 'Closed' }, { id: 'cancelled', label: 'Cancelled', filter: (o) => o.status === 'Cancelled' }]}
        filters={[{ key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Planned', 'Released', 'In Progress', 'Partially Completed', 'Completed', 'Closed', 'Cancelled'].map((x) => ({ value: x, label: x })) }, { key: 'item', label: 'Item', type: 'text' }, { key: 'plannedStart', label: 'Planned start', type: 'date-range' }]}
        applyFilter={(o, v) => (!v.status || o.status === v.status) && (!v.item || `${o.itemName} ${o.itemCode}`.toLowerCase().includes(String(v.item).toLowerCase())) && (!v.plannedStartFrom || o.plannedStart >= v.plannedStartFrom) && (!v.plannedStartTo || o.plannedStart <= v.plannedStartTo)}
        primaryAction={{ label: 'New production order', onClick: () => nav.go('production/orders/new') }} onRowClick={(o) => nav.go(`production/orders/${o.id}`)} rowActions={rowActions}
        headerExtra={initialStatus ? <div className="banner info">Showing status filter from overview: <strong>{initialStatus}</strong> — use the tabs to change.</div> : undefined}
        bulkActions={(ids, sel) => [{ label: 'Release selected', onClick: () => { let n = 0; sel.forEach((o) => { try { A.releaseOrder(o.id, { acknowledgeShortfall: true }); n += 1; } catch (e: any) { toast.error(`${o.number}: ${e.message}`); } }); if (n) toast.success(`${n} order(s) released`); }, disabled: !sel.every((o) => o.status === 'Planned' || o.status === 'Approved'), reason: 'Only Planned orders can be released' }]} />
      {confirm.dialog}
    </>
  );
}
