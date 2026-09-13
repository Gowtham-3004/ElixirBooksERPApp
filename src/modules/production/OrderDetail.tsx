// Production order detail — rail + Components / Operations / Receipts / Quality / Costing / Activity,
// with a state-driven footer (FR-MFG-007/008/010/011/016).
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { ApprovalRequest, Item } from '../../store';
import { DocumentPage, Button, Badge, Pill, Meter, RailSection, KV, SummaryBlock, ActivityTab, ApprovalsTab, AccountingTab, AttachmentsPanel, EmptyState, ActionMenu, useToast, Modal, NumberField, SelectField, TextField, DataTable, type Column } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, fmtPct, daysBetween, today } from '../../lib/format';
import type { MaterialIssue, ProductionOrder, ProductionReceipt, QualityInspection, SubcontractOrder, WipEntry } from './types';
import { componentUnitCost, isLate, item as findItem, opStdCost, whName, wipBalanceOf } from './core';
import * as A from './actions';
import { reverseIssue } from './issueActions';
import { receiptReversalCheck, reverseReceipt } from './receiptActions';
import { useConfirm, SectionCard, DocLink, OrderLink, ItemLink, JournalLink, VarianceCell, Progress, SCRAP_REASONS } from './shared';

export function OrderDetail({ id }: { id: string }) {
  const s = useSession();
  const o = useRecord<ProductionOrder>(C.productionOrders, id);
  const issues = useCollection<MaterialIssue>(C.materialIssues).filter((x) => x.orderId === id);
  const receipts = useCollection<ProductionReceipt>(C.productionReceipts).filter((x) => x.orderId === id);
  const inspections = useCollection<QualityInspection>(C.qualityInspections).filter((q) => (q.refType === 'Production Order' && q.refId === id) || (q.refType === 'Production Receipt' && receipts.some((r) => r.id === q.refId)));
  const subs = useCollection<SubcontractOrder>(C.subcontractOrders).filter((x) => x.orderId === id);
  const wipRows = useCollection<WipEntry>(C.wipEntries).filter((w) => w.orderId === id);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState(nav.get().params.tab ?? 'components');
  const [opModal, setOpModal] = useState<string | null>(null);
  const action = nav.get().params.action;
  useEffect(() => {
    if (!o || !action) return;
    if (action === 'release') doRelease();
    if (action === 'close') doClose();
    nav.replace(`production/orders/${id}`);
  }, [action, o?.id]);
  const avail = useMemo(() => (o ? A.componentAvailability(o) : []), [o]);
  if (!o) return <EmptyState title="Production order not found" description="It may have been deleted or belongs to another company." action={<Button onClick={() => nav.go('production/orders')}>Back to orders</Button>} />;
  const pending = approvals.find((a) => a.docId === id && a.status === 'Pending');
  const canAct = pending ? engine.canActOnApproval(pending) : { ok: false, reason: 'No pending approval' };
  const run = (fn: () => unknown, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const shortfalls = avail.filter((l) => l.shortfall > 0);
  const wipBalance = wipBalanceOf(o.id);
  const heldReceipts = receipts.filter((r) => r.status === 'Hold');
  const canIssue = ['Released', 'In Progress', 'Partially Completed'].includes(o.status);
  const doRelease = () => confirm.open({
    title: `Release ${o.number} to the shop floor?`,
    statement: `${o.itemName} × ${o.qty} ${o.uom} · start ${fmtDate(o.plannedStart)}${shortfalls.length ? ` · ${shortfalls.length} component(s) short` : ' · all components available'}`,
    consequences: [
      ...(shortfalls.length ? [{ engine: 'Stock', text: `Shortfall: ${shortfalls.map((l) => `${l.itemName} short ${fmtQty(l.shortfall, l.uom, 3)}`).join('; ')} — release anyway acknowledges the shortage`, tone: 'warning' as const }] : [{ engine: 'Stock', text: 'All components are available in ' + whName(o.rmWarehouseId) }]),
      { engine: 'Workflow', text: db.findBy<any>(C.workflowRules, (w) => w.docType === 'Production Order' && w.status === 'Active') ? 'A release approval rule is active — the order is submitted for approval' : 'No active release rule — the order is released directly' },
      { engine: 'Notification', text: 'Shop floor is notified' },
    ],
    confirmLabel: shortfalls.length ? 'Release despite shortfall' : 'Release order', cancelLabel: 'Keep planned',
    onConfirm: () => { const r = A.releaseOrder(o.id, { acknowledgeShortfall: true }); toast.success(r.approval ? `${o.number} submitted for approval` : `${o.number} released`); },
  });
  const doClose = () => confirm.open({
    title: `Close ${o.number}?`,
    statement: `WIP balance for this order is ${fmtMoney(wipBalance, s.currency)}. Closing posts the variance so the order's WIP nets to zero.`,
    consequences: [
      { engine: 'Journal', text: Math.abs(wipBalance) < 0.01 ? 'WIP is already zero — no variance journal' : wipBalance > 0 ? `Dr Production Variances 5710 ${fmtMoney(Math.abs(wipBalance), s.currency)} · Cr WIP 1220 (under-absorbed)` : `Dr WIP 1220 ${fmtMoney(Math.abs(wipBalance), s.currency)} · Cr Production Variances 5710 (over-absorbed)` },
      { engine: 'Workflow', text: 'The order becomes read-only; reopen requires a reason' },
    ],
    confirmLabel: 'Close order', cancelLabel: 'Keep open',
    onConfirm: () => { A.closeOrder(o.id); toast.success(`${o.number} closed`); },
  });
  const footer = (
    <>
      <div style={{ flex: 1, fontSize: 12, color: '#5F6368' }}>
        {pending ? `Awaiting ${pending.steps.find((x) => x.order === pending.currentStep)?.approverLabel}` : heldReceipts.length ? `${heldReceipts.length} receipt(s) on QC hold` : isLate(o) ? `Late by ${daysBetween(o.plannedEnd, today())} day(s)` : o.status === 'Completed' ? 'Completed — close to post the variance' : ''}
      </div>
      {o.status === 'Draft' && <><Button onClick={() => nav.go(`production/orders/${o.id}/edit`)}>Edit</Button><Button variant="primary" onClick={() => run(() => A.planOrder(o.id), `${o.number} planned`)}>Plan order</Button></>}
      {(o.status === 'Planned' || o.status === 'Approved') && <><Button onClick={() => nav.go(`production/orders/${o.id}/edit`)}>Edit</Button><Button variant="primary" onClick={doRelease}>Release order</Button></>}
      {pending && <><Button variant="danger" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Reject ${o.number}?`, reasonRequired: true, confirmLabel: 'Reject release', danger: true, onConfirm: (r) => engine.actOnApproval(pending.id, 'Reject', { comment: r }) })}>Reject</Button><Button variant="primary" disabled={!canAct.ok} reason={canAct.reason} onClick={() => confirm.open({ title: `Approve release of ${o.number}?`, statement: `${o.itemName} × ${o.qty}`, consequences: [{ engine: 'Workflow', text: 'Order becomes Released and materials can be issued' }], confirmLabel: 'Approve release', onConfirm: (r) => { engine.actOnApproval(pending.id, 'Approve', { comment: r }); A.releaseOrder(o.id, { acknowledgeShortfall: true }); } })}>Approve</Button></>}
      {o.status === 'Released' && <Button variant="primary" onClick={() => run(() => A.startOrder(o.id), `${o.number} started`)}>Start production</Button>}
      {canIssue && <Button onClick={() => nav.go(`production/issues/new?order=${o.id}`)}>Issue materials</Button>}
      {canIssue && <Button variant={o.status === 'Released' ? 'secondary' : 'primary'} onClick={() => nav.go(`production/receipts/new?order=${o.id}`)}>Record output</Button>}
      {['In Progress', 'Partially Completed'].includes(o.status) && <Button variant="primary" onClick={() => { const done = o.receivedQty + o.scrapQty >= o.qty - 0.0005; confirm.open({ title: `Complete ${o.number}?`, statement: done ? `${o.receivedQty} good + ${o.scrapQty} scrap = order quantity ${o.qty}.` : `Only ${o.receivedQty + o.scrapQty} of ${o.qty} produced — a short-close reason is required.`, reasonRequired: !done, consequences: [{ engine: 'Workflow', text: 'Pending operations are marked skipped; no further output can be recorded' }, { engine: 'Journal', text: 'Remaining WIP posts as variance when you close the order' }], confirmLabel: 'Complete order', cancelLabel: 'Keep in progress', onConfirm: (r) => A.completeOrder(o.id, r || undefined) }); }}>Complete</Button>}
      {o.status === 'Completed' && <Button variant="primary" onClick={doClose}>Close order</Button>}
      {(o.status === 'Completed' || o.status === 'Closed') && <Button onClick={() => confirm.open({ title: `Reopen ${o.number}?`, statement: o.status === 'Closed' ? 'The variance journal is reversed and the order returns to the floor.' : 'The order returns to In Progress.', reasonRequired: true, consequences: o.status === 'Closed' ? [{ engine: 'Journal', text: 'Close variance journal is reversed' }] : [], confirmLabel: 'Reopen order', cancelLabel: 'Keep closed', onConfirm: (r) => A.reopenOrder(o.id, r) })}>Reopen</Button>}
      <ActionMenu align="right" trigger={<Button>More ▾</Button>} actions={[
        { label: 'Open BOM', onClick: () => nav.go(`production/boms/${o.bomId}`) },
        { label: 'Open routing', onClick: () => nav.go(`production/routings/${o.routingId}`), disabled: !o.routingId, reason: !o.routingId ? 'No routing linked' : undefined },
        { label: 'Genealogy', onClick: () => nav.go('production/genealogy', { q: o.lotNumber ?? receipts[0]?.batch ?? receipts[0]?.serials?.[0] ?? o.number }) },
        { label: 'Create subcontract order', onClick: () => nav.go(`production/subcontracting/new?order=${o.id}`), disabled: !canIssue, reason: !canIssue ? `Order is ${o.status}` : undefined },
        { label: 'Cancel order', danger: true, separator: true, onClick: () => confirm.open({ title: `Cancel ${o.number}?`, statement: 'The number stays allocated and the cancellation is audited.', reasonRequired: true, confirmLabel: 'Cancel order', cancelLabel: 'Keep order', danger: true, onConfirm: (r) => A.cancelOrder(o.id, r) }), disabled: A.hasIssues(o) || A.hasReceipts(o) || ['Completed', 'Closed', 'Cancelled'].includes(o.status), reason: A.hasIssues(o) ? 'Materials issued — return them first' : A.hasReceipts(o) ? 'Output received' : ['Completed', 'Closed', 'Cancelled'].includes(o.status) ? `Already ${o.status}` : undefined },
        { label: 'Delete draft', danger: true, onClick: () => confirm.open({ title: `Delete ${o.number}?`, confirmLabel: 'Delete draft', danger: true, onConfirm: () => { A.deleteDraft(o.id); nav.go('production/orders'); } }), disabled: o.status !== 'Draft', reason: o.status !== 'Draft' ? 'Only drafts can be deleted' : undefined },
      ]} />
    </>
  );
  const c = o.costs;
  return (
    <>
      <DocumentPage backLabel="Production orders" onBack={() => nav.go('production/orders')} number={o.number} activeTab={tab} onTab={setTab}
        badges={<><Badge status={o.status === 'Submitted' ? 'Awaiting Approval' : o.status}>{o.status === 'Submitted' ? 'Awaiting approval' : o.status}</Badge>{isLate(o) && <Pill tone="critical">Late {daysBetween(o.plannedEnd, today())} d</Pill>}{o.priority === 'High' && <Pill tone="warning">High priority</Pill>}{o.autoReleased && <Pill tone="neutral">Auto-released</Pill>}{heldReceipts.length > 0 && <Pill tone="warning">QC hold</Pill>}</>}
        amount={{ label: 'Actual cost', value: c.totalActual, currency: s.currency }}
        rail={
          <>
            <RailSection label="Item">
              <div style={{ fontSize: 14, fontWeight: 600 }}><ItemLink id={o.itemId} name={o.itemName} /></div>
              <div className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{o.itemCode}</div>
              <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2 }}>{o.qty} {o.uom} · tracking {o.tracking}{o.lotNumber ? ` · ${o.lotNumber}` : o.serialPrefix ? ` · ${o.serialPrefix}-…` : ''}</div>
              <div style={{ marginTop: 8 }}><Progress done={o.receivedQty} total={o.qty} label="Output" />{o.scrapQty > 0 && <div style={{ fontSize: 11, color: '#C0393F', marginTop: 3 }}>Scrap {o.scrapQty} {o.uom} ({fmtPct((o.scrapQty / (o.receivedQty + o.scrapQty || 1)) * 100, 1)})</div>}</div>
            </RailSection>
            <RailSection label="Plan">
              <KV items={[{ k: 'BOM', v: <DocLink path={`production/boms/${o.bomId}`} number={`${o.bomCode} v${o.bomVersion}`} /> }, { k: 'Routing', v: o.routingCode ? <DocLink path={`production/routings/${o.routingId}`} number={o.routingCode} /> : '—' }, { k: 'Planned', v: `${fmtDate(o.plannedStart)} → ${fmtDate(o.plannedEnd)}` }, { k: 'Actual', v: o.actualStart ? `${fmtDate(o.actualStart)} → ${o.actualEnd ? fmtDate(o.actualEnd) : '…'}` : 'Not started' }, { k: 'FG warehouse', v: whName(o.warehouseId) }, { k: 'RM warehouse', v: whName(o.rmWarehouseId) }, { k: 'WIP', v: whName(o.wipWarehouseId) }, ...(o.sourceDemand ? [{ k: 'Source demand', v: <span className="link" onClick={() => nav.go(`sales/orders/${o.sourceDemand!.id}`)}>{o.sourceDemand.number}{o.sourceDemand.customerName ? ` · ${o.sourceDemand.customerName}` : ''}</span> }] : []), ...(o.mrpRunId ? [{ k: 'MRP run', v: <DocLink path={`production/mrp/${o.mrpRunId}`} number={db.find<any>(C.mrpRuns, o.mrpRunId)?.number} /> }] : [])]} />
            </RailSection>
            <RailSection label="Cost summary">
              <SummaryBlock style={{ flexDirection: 'column', gap: 8 }} items={[{ label: 'Standard', value: fmtMoney(c.totalStd, s.currency) }, { label: 'Actual', value: fmtMoney(c.totalActual, s.currency) }, { label: 'Variance', value: <VarianceCell std={c.totalStd} actual={c.totalActual} currency={s.currency} />, tone: c.variance > 0 ? 'danger' : 'good' }, { label: 'WIP balance', value: fmtMoney(wipBalance, s.currency), tone: Math.abs(wipBalance) > 0.01 && o.status === 'Closed' ? 'warn' : undefined }]} />
              <div style={{ marginTop: 8, fontSize: 11, color: '#6E6E71' }}>Costing method: {o.costingMethod} · std unit {fmtMoney(o.stdUnitCost, s.currency)}</div>
              <div style={{ marginTop: 6 }}><Button size="sm" variant="link" onClick={() => nav.go('production/genealogy', { q: receipts.find((r) => r.status === 'Posted')?.batch ?? receipts.find((r) => r.status === 'Posted')?.serials?.[0] ?? '' })}>Genealogy →</Button></div>
            </RailSection>
            <RailSection label="Attachments"><AttachmentsPanel objectType="Production Order" objectId={o.id} readOnly={['Closed', 'Cancelled'].includes(o.status)} /></RailSection>
          </>
        }
        tabs={[
          { id: 'components', label: `Components (${o.components.length})`, content: <ComponentsTab order={o} avail={avail} canIssue={canIssue} /> },
          { id: 'operations', label: `Operations (${o.operations.length})`, content: <OperationsTab order={o} subs={subs} onRecord={setOpModal} /> },
          { id: 'receipts', label: `Receipts (${receipts.length})`, content: <ReceiptsTab order={o} receipts={receipts} issues={issues} /> },
          { id: 'quality', label: `Quality (${inspections.length})`, content: <QualityTab order={o} inspections={inspections} /> },
          { id: 'costing', label: 'Costing', content: <CostingTab order={o} wipRows={wipRows} /> },
          { id: 'accounting', label: 'Accounting', content: o.journalIds.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{o.journalIds.map((jid) => <AccountingTab key={jid} journalId={jid} currency={s.currency} />)}</div> : <EmptyState compact title="Nothing posted yet" description="Issue materials or record output to generate journals." /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={o.id} correlationId={o.correlationId} /> },
        ]}
        footer={footer}
        banner={o.status === 'Cancelled' ? <div className="banner danger full">Cancelled: {o.reasonForCancel}</div> : o.status === 'Rejected' ? <div className="banner danger full">Release rejected: {approvals.filter((a) => a.docId === id).slice(-1)[0]?.history.slice(-1)[0]?.comment ?? '—'}</div> : o.shortCloseReason ? <div className="banner warning full">Short-closed: {o.shortCloseReason}</div> : heldReceipts.length ? <div className="banner warning full">{heldReceipts.length} receipt(s) awaiting QC — complete the inspection to release them into stock.</div> : shortfalls.length && canIssue ? <div className="banner warning full">Component shortfall: {shortfalls.map((l) => `${l.itemName} short ${fmtQty(l.shortfall, l.uom, 3)}`).join('; ')}</div> : undefined}
      />
      {opModal && <OperationModal order={o} opId={opModal} onClose={() => setOpModal(null)} />}
      {confirm.dialog}
    </>
  );
}

function ComponentsTab({ order, avail, canIssue }: { order: ProductionOrder; avail: A.AvailabilityLine[]; canIssue: boolean }) {
  const s = useSession();
  const issues = useCollection<MaterialIssue>(C.materialIssues).filter((i) => i.orderId === order.id);
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="primary" disabled={!canIssue} reason={!canIssue ? `Order is ${order.status}` : undefined} onClick={() => nav.go(`production/issues/new?order=${order.id}`)}>Issue materials</Button>
        <Button disabled={!canIssue} reason={!canIssue ? `Order is ${order.status}` : undefined} onClick={() => nav.go(`production/issues/new?order=${order.id}&mode=return`)}>Return materials</Button>
        <Button disabled={!canIssue} reason={!canIssue ? `Order is ${order.status}` : undefined} onClick={() => nav.go(`production/receipts/new?order=${order.id}&backflush=1`)}>Backflush on next receipt</Button>
      </div>
      <SectionCard title="Planned vs issued vs consumed" padding={0}>
        <table className="data-table dense"><thead><tr><th>Component</th><th className="right">Qty / unit</th><th className="right">Scrap %</th><th className="right">Planned</th><th className="right">Issued</th><th className="right">Returned</th><th className="right">Consumed</th><th className="right">Remaining</th><th>Availability</th><th className="right">Std value</th></tr></thead><tbody>
          {order.components.map((c) => {
            const a = avail.find((x) => x.componentId === c.id);
            const remaining = Math.max(0, c.plannedQty - c.issuedQty + c.returnedQty);
            return (
              <tr key={c.id}>
                <td><div><ItemLink id={c.itemId} name={c.itemName} />{c.isPhantom && <Badge status="Draft" style={{ marginLeft: 6 }}>phantom</Badge>}</div><div className="cell-secondary identifier">{c.itemCode} · {c.tracking !== 'None' ? c.tracking : 'untracked'}{c.substitutes.length ? ` · ${c.substitutes.length} substitute(s)` : ''}</div></td>
                <td className="right money">{fmtQty(c.qtyPer, undefined, 4)}</td>
                <td className="right money">{c.scrapPct}%</td>
                <td className="right money">{fmtQty(c.plannedQty, c.uom, 3)}</td>
                <td className="right money">{fmtQty(c.issuedQty, undefined, 3)}</td>
                <td className="right money">{c.returnedQty ? fmtQty(c.returnedQty, undefined, 3) : '—'}</td>
                <td className="right money">{fmtQty(c.consumedQty, undefined, 3)}</td>
                <td className="right money" style={{ color: remaining > 0 ? '#8A4B0F' : '#12784E' }}>{fmtQty(remaining, undefined, 3)}</td>
                <td style={{ fontSize: 12 }}>{a && a.shortfall > 0 ? <Pill tone="critical">Short {fmtQty(a.shortfall, a.uom, 3)}</Pill> : a ? <span style={{ color: '#12784E' }}>{fmtQty(a.available, a.uom, 3)} available</span> : '—'}<div className="cell-secondary">{a?.warehouse}</div></td>
                <td className="right money">{fmtMoney(c.plannedQty * componentUnitCost(findItem(c.itemId)), s.currency)}</td>
              </tr>);
          })}
        </tbody><tfoot><tr><td colSpan={9}>Planned material (standard)</td><td className="right money">{fmtMoney(order.costs.materialStd, s.currency)}</td></tr></tfoot></table>
      </SectionCard>
      <SectionCard title={`Issues & returns (${issues.length})`} padding={0}>
        {issues.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: '#5F6368' }}>Nothing issued yet.</div> : (
          <table className="data-table dense"><thead><tr><th>Document</th><th>Type</th><th>Date</th><th className="right">Lines</th><th className="right">Value</th><th>Journal</th><th>Status</th><th /></tr></thead><tbody>
            {issues.map((i) => (
              <tr key={i.id} className="clickable" onClick={() => nav.go(`production/issues/${i.id}`)}>
                <td className="identifier link">{i.number}</td><td><Badge status={i.type === 'Return' ? 'Returned' : i.type === 'Backflush' ? 'Matched' : 'Posted'}>{i.type}</Badge></td><td>{fmtDate(i.date)}</td>
                <td className="right money">{i.lines.length}</td><td className="right money">{fmtMoney(i.totalValue, s.currency)}</td><td><JournalLink id={i.journalId} /></td><td><Badge status={i.status} /></td>
                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}><ActionMenu actions={[{ label: 'Reverse issue', danger: true, onClick: () => confirm.open({ title: `Reverse ${i.number}?`, statement: 'Stock movements and the journal are reversed with linked entries; nothing is deleted.', reasonRequired: true, consequences: [{ engine: 'Stock', text: 'Material returns to ' + whName(order.rmWarehouseId) }, { engine: 'Journal', text: 'Reversal journal Dr inventory / Cr WIP' }], confirmLabel: 'Reverse issue', danger: true, onConfirm: (r) => { reverseIssue(i.id, r); toast.success(`${i.number} reversed`); } }), disabled: i.status !== 'Posted' || A.hasReceipts(order), reason: i.status !== 'Posted' ? `Already ${i.status}` : A.hasReceipts(order) ? 'Output received — return material instead' : undefined }]} /></td>
              </tr>))}
          </tbody></table>
        )}
      </SectionCard>
    </div>
  );
}

function OperationsTab({ order, subs, onRecord }: { order: ProductionOrder; subs: SubcontractOrder[]; onRecord: (id: string) => void }) {
  const s = useSession();
  const toast = useToast();
  const editable = ['Released', 'In Progress', 'Partially Completed'].includes(order.status);
  const run = (fn: () => unknown, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SectionCard title="Operations" padding={0}>
        <table className="data-table dense"><thead><tr><th style={{ width: 50 }}>Seq</th><th>Operation</th><th>Work centre</th><th>Status</th><th className="right">Std min</th><th className="right">Actual min</th><th className="right">Done</th><th className="right">Scrap</th><th className="right">Labour</th><th className="right">Machine</th><th className="right">Overhead</th><th className="right">Subcontract</th><th /></tr></thead><tbody>
          {order.operations.slice().sort((a, b) => a.seq - b.seq).map((op) => {
            const std = opStdCost(op, order.qty);
            const sub = subs.find((x) => x.id === op.subcontractOrderId);
            return (
              <tr key={op.id}>
                <td className="money">{op.seq}</td>
                <td><div>{op.name}{op.parallel && <Pill tone="neutral">parallel</Pill>}{op.isRework && <Badge status="Returned" style={{ marginLeft: 4 }}>rework</Badge>}</div>{op.scrapReason && <div className="cell-secondary" style={{ color: '#C0393F' }}>{op.scrapReason}</div>}</td>
                <td>{op.subcontract ? <span>{sub ? <DocLink path={`production/subcontracting/${sub.id}`} number={sub.number} /> : 'Subcontracted'}<div className="cell-secondary">{db.find<any>(C.suppliers, op.supplierId)?.name ?? '—'}</div></span> : op.workCentreName}</td>
                <td><Badge status={op.status === 'Done' ? 'Completed' : op.status === 'In Progress' ? 'In Progress' : op.status === 'Skipped' ? 'Cancelled' : 'Draft'}>{op.status}</Badge></td>
                <td className="right money">{std.minutes.toFixed(0)}</td>
                <td className="right money">{op.actualSetupMin + op.actualRunMin ? (op.actualSetupMin + op.actualRunMin).toFixed(0) : '—'}</td>
                <td className="right money">{op.completedQty || '—'}</td>
                <td className="right money" style={{ color: op.scrapQty ? '#C0393F' : undefined }}>{op.scrapQty || '—'}</td>
                <td className="right money">{fmtMoney(op.labourCost, s.currency)}</td>
                <td className="right money">{fmtMoney(op.machineCost, s.currency)}</td>
                <td className="right money">{fmtMoney(op.overheadCost, s.currency)}</td>
                <td className="right money">{op.subcontract ? fmtMoney(op.subcontractCost, s.currency) : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  <ActionMenu actions={[
                    { label: 'Start operation', onClick: () => run(() => A.startOperation(order.id, op.id), `${op.name} started`), disabled: !editable || op.status !== 'Pending' || op.subcontract, reason: op.subcontract ? 'Subcontract operation' : !editable ? `Order is ${order.status}` : op.status !== 'Pending' ? `Already ${op.status}` : undefined },
                    { label: 'Record time & quantity', onClick: () => onRecord(op.id), disabled: !editable || op.status === 'Done' || op.subcontract, reason: op.subcontract ? 'Driven by the subcontract order' : op.status === 'Done' ? 'Operation is done' : !editable ? `Order is ${order.status}` : undefined },
                    { label: 'Create subcontract order', onClick: () => nav.go(`production/subcontracting/new?order=${order.id}&op=${op.id}`), disabled: !op.subcontract || !!sub || !editable, reason: !op.subcontract ? 'Not a subcontract operation' : sub ? `Linked to ${sub.number}` : undefined },
                    { label: 'In-process inspection', onClick: () => nav.go(`production/quality/new?order=${order.id}&op=${op.id}`), disabled: !editable },
                  ]} />
                </td>
              </tr>);
          })}
          {order.operations.length === 0 && <tr><td colSpan={13} style={{ padding: 16, color: '#5F6368' }}>No routing linked — conversion cost is not tracked per operation.</td></tr>}
        </tbody><tfoot><tr><td colSpan={8}>Conversion cost</td><td className="right money">{fmtMoney(order.costs.labourActual, s.currency)}</td><td className="right money">{fmtMoney(order.costs.machineActual, s.currency)}</td><td className="right money">{fmtMoney(order.costs.overheadActual, s.currency)}</td><td className="right money">{fmtMoney(order.costs.subcontractActual, s.currency)}</td><td /></tr></tfoot></table>
      </SectionCard>
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Completing an operation posts Dr WIP 1220 / Cr Labour absorbed 5730 + Overhead absorbed 5740 for the recorded minutes × work-centre rates.</div>
    </div>
  );
}

function OperationModal({ order, opId, onClose }: { order: ProductionOrder; opId: string; onClose: () => void }) {
  const toast = useToast();
  const op = order.operations.find((x) => x.id === opId)!;
  const [f, setF] = useState({ actualSetupMin: op.actualSetupMin || op.setupMin, actualRunMin: op.actualRunMin || Math.round(op.runMinPerUnit * order.qty), completedQty: op.completedQty || order.qty, scrapQty: op.scrapQty, scrapReason: op.scrapReason ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const hrs = (f.actualSetupMin + f.actualRunMin) / 60;
  const save = (done: boolean) => {
    try {
      if (done) A.completeOperation(order.id, opId, { ...f, scrapReason: f.scrapReason || undefined });
      else A.recordOperation(order.id, opId, { ...f, scrapReason: f.scrapReason || undefined });
      toast.success(done ? `${op.name} completed` : `${op.name} updated`);
      onClose();
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Modal open onClose={onClose} title={`${op.name} · ${op.workCentreName}`} description={`Standard ${op.setupMin} min setup + ${op.runMinPerUnit} min/unit × ${order.qty} = ${(op.setupMin + op.runMinPerUnit * order.qty).toFixed(0)} min`} width={620}
      footer={<><Button onClick={onClose}>Cancel</Button><Button onClick={() => save(false)}>Save progress</Button><Button variant="primary" onClick={() => save(true)}>Complete operation</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <NumberField label="Actual setup minutes" value={f.actualSetupMin} onChange={(v) => setF({ ...f, actualSetupMin: v })} decimals={0} />
        <NumberField label="Actual run minutes" value={f.actualRunMin} onChange={(v) => setF({ ...f, actualRunMin: v })} decimals={0} />
        <NumberField label="Completed qty" value={f.completedQty} onChange={(v) => setF({ ...f, completedQty: v })} decimals={0} suffix={order.uom} />
        <NumberField label="Scrap qty" value={f.scrapQty} onChange={(v) => setF({ ...f, scrapQty: v })} decimals={0} suffix={order.uom} />
      </div>
      {f.scrapQty > 0 && <div style={{ marginTop: 12 }}><SelectField label="Scrap reason" required value={f.scrapReason} onChange={(v) => setF({ ...f, scrapReason: v })} options={SCRAP_REASONS} placeholder="Pick a reason" allowEmpty /></div>}
      <div style={{ marginTop: 14 }}>
        <SummaryBlock items={[{ label: 'Hours', value: hrs.toFixed(2) }, { label: 'Labour', value: fmtMoney(hrs * op.labourRate) }, { label: 'Machine', value: fmtMoney(hrs * op.machineRate) }, { label: 'Overhead', value: fmtMoney(hrs * op.overheadRate) }, { label: 'To WIP', value: fmtMoney(hrs * (op.labourRate + op.machineRate + op.overheadRate)), tone: 'good' }]} />
      </div>
    </Modal>
  );
}

function ReceiptsTab({ order, receipts, issues }: { order: ProductionOrder; receipts: ProductionReceipt[]; issues: MaterialIssue[] }) {
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const canReceive = ['Released', 'In Progress', 'Partially Completed'].includes(order.status);
  const columns: Column<ProductionReceipt>[] = [
    { key: 'number', label: 'Receipt', render: (r) => <span className="identifier link">{r.number}</span> },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
    { key: 'qty', label: 'Good qty', align: 'right', render: (r) => <span className="money">{fmtQty(r.qty, r.uom, 3)}</span>, total: (rs) => <span className="money">{fmtQty(rs.filter((x) => x.status === 'Posted').reduce((a, x) => a + x.qty, 0), order.uom, 3)}</span> },
    { key: 'scrapQty', label: 'Scrap', align: 'right', render: (r) => <span className="money" style={{ color: r.scrapQty ? '#C0393F' : undefined }}>{r.scrapQty || '—'}</span> },
    { key: 'batch', label: 'Lot / serials', render: (r) => <span className="identifier" style={{ fontSize: 12 }}>{r.batch ?? (r.serials?.length ? `${r.serials[0]} … (${r.serials.length})` : '—')}</span> },
    { key: 'unitCost', label: 'Unit cost', align: 'right', render: (r) => <span className="money">{fmtMoney(r.unitCost, s.currency)}<div className="cell-secondary">{r.costBasis}</div></span> },
    { key: 'value', label: 'Value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.value, s.currency)}</span>, total: (rs) => <span className="money">{fmtMoney(rs.filter((x) => x.status === 'Posted').reduce((a, x) => a + x.value, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={r.status} />{r.inspectionNumber && <DocLink path={`production/quality/${r.inspectionId}`} number={r.inspectionNumber} />}{r.backflush && <Pill tone="neutral">backflush</Pill>}</span> },
    { key: 'journal', label: 'Journal', render: (r) => <JournalLink id={r.journalId} /> },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}><Button variant="primary" disabled={!canReceive} reason={!canReceive ? `Order is ${order.status}` : undefined} onClick={() => nav.go(`production/receipts/new?order=${order.id}`)}>Record output</Button></div>
      <DataTable rows={receipts} columns={columns} rowActions={(r) => [{ label: 'Reverse receipt', danger: true, onClick: () => confirm.open({ title: `Reverse ${r.number}?`, statement: `${r.qty} ${r.uom} returns from ${whName(r.warehouseId)} to WIP; the journal is reversed with a linked entry.`, reasonRequired: true, consequences: [{ engine: 'Stock', text: `Output ${r.batch ?? r.serials?.join(', ') ?? ''} removed from stock` }, { engine: 'Journal', text: 'Dr WIP / Cr finished goods reversal' }], confirmLabel: 'Reverse receipt', danger: true, onConfirm: (reason) => { reverseReceipt(r.id, reason); toast.success(`${r.number} reversed`); } }), disabled: !receiptReversalCheck(r).ok, reason: receiptReversalCheck(r).reason }]}
        onRowClick={(r) => nav.go(`production/receipts/${r.id}`)} emptyTitle="No output recorded yet" emptyDescription="Record output as goods come off the line." showTotals />
      {order.byProductsReceived.length > 0 && (
        <SectionCard title="By-products received" padding={0}>
          <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Credit to WIP</th></tr></thead><tbody>
            {order.byProductsReceived.map((b) => <tr key={b.itemId}><td><ItemLink id={b.itemId} name={b.itemName} /></td><td className="right money">{fmtQty(b.qty, undefined, 3)}</td><td className="right money">{fmtMoney(b.value, s.currency)}</td></tr>)}
          </tbody></table>
        </SectionCard>
      )}
      {issues.some((i) => i.type === 'Backflush') && <div style={{ fontSize: 12, color: '#6E6E71' }}>Backflush issues were posted automatically with the receipts above.</div>}
    </div>
  );
}

function QualityTab({ order, inspections }: { order: ProductionOrder; inspections: QualityInspection[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => nav.go(`production/quality/new?order=${order.id}`)}>New in-process inspection</Button></div>
      <DataTable rows={inspections} columns={[
        { key: 'number', label: 'Inspection', render: (q) => <span className="identifier link">{q.number}</span> },
        { key: 'type', label: 'Type' },
        { key: 'refNumber', label: 'Reference', render: (q) => <span style={{ fontSize: 12 }}>{q.refType} {q.refNumber}{q.operationName ? ` · ${q.operationName}` : ''}</span> },
        { key: 'date', label: 'Date', render: (q) => fmtDate(q.date) },
        { key: 'lotQty', label: 'Lot / sample', align: 'right', render: (q) => <span className="money">{q.lotQty} / {q.sampleQty}</span> },
        { key: 'acceptedQty', label: 'Accepted', align: 'right', render: (q) => <span className="money" style={{ color: '#12784E' }}>{q.acceptedQty}</span> },
        { key: 'rejectedQty', label: 'Rejected', align: 'right', render: (q) => <span className="money" style={{ color: q.rejectedQty ? '#C0393F' : undefined }}>{q.rejectedQty}</span> },
        { key: 'disposition', label: 'Disposition', render: (q) => q.disposition ? <Badge status={q.disposition === 'Accept' ? 'Approved' : q.disposition === 'Reject' || q.disposition === 'Scrap' ? 'Rejected' : 'Returned'}>{q.disposition}</Badge> : '—' },
        { key: 'status', label: 'Status', render: (q) => <Badge status={q.status} /> },
      ] as Column<QualityInspection>[]} onRowClick={(q) => nav.go(`production/quality/${q.id}`)} emptyTitle="No inspections for this order" />
    </div>
  );
}

function CostingTab({ order, wipRows }: { order: ProductionOrder; wipRows: WipEntry[] }) {
  const s = useSession();
  const c = order.costs;
  const rows = [
    { label: 'Material', std: c.materialStd, actual: c.materialActual },
    { label: 'Labour', std: c.labourStd, actual: c.labourActual },
    { label: 'Machine', std: c.machineStd, actual: c.machineActual },
    { label: 'Overhead', std: c.overheadStd, actual: c.overheadActual },
    { label: 'Subcontract', std: c.subcontractStd, actual: c.subcontractActual },
    { label: 'Scrap', std: 0, actual: c.scrap },
    { label: 'By-product credit', std: 0, actual: -c.byProductCredit },
  ];
  const balance = wipRows.reduce((a, w) => a + w.amount, 0);
  const perUnit = order.receivedQty ? c.totalActual / order.receivedQty : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SummaryBlock items={[{ label: 'Standard cost', value: fmtMoney(c.totalStd, s.currency) }, { label: 'Actual cost', value: fmtMoney(c.totalActual, s.currency) }, { label: 'Variance', value: <VarianceCell std={c.totalStd} actual={c.totalActual} currency={s.currency} />, tone: c.variance > 0 ? 'danger' : 'good' }, { label: 'Output value', value: fmtMoney(c.outputValue, s.currency) }, { label: 'Actual / unit', value: fmtMoney(perUnit, s.currency) }, { label: 'WIP balance', value: fmtMoney(balance, s.currency), tone: Math.abs(balance) > 0.01 ? 'warn' : 'good' }]} />
      <SectionCard title="Standard vs actual" padding={0}>
        <table className="data-table dense"><thead><tr><th>Cost element</th><th className="right">Standard</th><th className="right">Actual</th><th className="right">Variance</th><th className="right">%</th></tr></thead><tbody>
          {rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="right money">{fmtMoney(r.std, s.currency)}</td><td className="right money">{fmtMoney(r.actual, s.currency)}</td><td className="right"><VarianceCell std={r.std} actual={r.actual} currency={s.currency} /></td><td className="right money">{r.std ? fmtPct(((r.actual - r.std) / r.std) * 100, 1) : '—'}</td></tr>)}
        </tbody><tfoot><tr><td>Total</td><td className="right money">{fmtMoney(c.totalStd, s.currency)}</td><td className="right money">{fmtMoney(c.totalActual, s.currency)}</td><td className="right"><VarianceCell std={c.totalStd} actual={c.totalActual} currency={s.currency} /></td><td className="right money">{fmtPct(c.variancePct, 1)}</td></tr></tfoot></table>
      </SectionCard>
      <SectionCard title="WIP ledger for this order" padding={0}>
        <table className="data-table dense"><thead><tr><th>Date</th><th>Type</th><th>Source</th><th>Description</th><th>Journal</th><th className="right">Into WIP</th><th className="right">Out of WIP</th><th className="right">Running</th></tr></thead><tbody>
          {(() => { let running = 0; return wipRows.slice().sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt)).map((w) => { running += w.amount; return (
            <tr key={w.id}><td>{fmtDate(w.date)}</td><td><Badge status={w.type === 'Variance' ? 'Returned' : w.type === 'Scrap' ? 'Rejected' : w.amount > 0 ? 'In Progress' : 'Posted'}>{w.type}</Badge></td><td className="identifier" style={{ fontSize: 12 }}>{w.sourceNumber}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{w.description ?? '—'}</td><td><JournalLink id={w.journalId} /></td>
            <td className="right money">{w.amount > 0 ? fmtMoney(w.amount, s.currency) : '—'}</td><td className="right money">{w.amount < 0 ? fmtMoney(-w.amount, s.currency) : '—'}</td><td className="right money">{fmtMoney(running, s.currency)}</td></tr>); }); })()}
          {wipRows.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: '#5F6368' }}>Nothing posted to WIP yet.</td></tr>}
        </tbody><tfoot><tr><td colSpan={7}>Balance{order.status === 'Closed' ? ' after close' : ' (posts as variance on close)'}</td><td className="right money" style={{ color: Math.abs(balance) > 0.01 ? '#8A4B0F' : '#12784E' }}>{fmtMoney(balance, s.currency)}</td></tr></tfoot></table>
      </SectionCard>
      {order.closeJournalId && <div style={{ fontSize: 12, color: '#5F6368' }}>Close variance {fmtMoney(order.costs.closeVariance, s.currency)} posted in <JournalLink id={order.closeJournalId} /> on {fmtDateTime(order.closedAt)} by {order.closedBy}.</div>}
    </div>
  );
}
