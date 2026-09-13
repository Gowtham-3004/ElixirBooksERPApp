// POS back office: shifts (close with variance, report), bills (reprint), returns, admin.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Company, DocLine, ReasonCode } from '../../store';
import { RegisterPage, Badge, TwoLine, Identifier, Money, Button, Modal, MoneyField, TextArea, TextField, SelectField, NumberField, Toggle, useToast, DocumentPage, RailSection, ActivityTab, AccountingTab, EmptyState, PrintSheet, SummaryBlock, Card, KV, PageHeader, ConfirmDialog, Drawer, CheckboxField, EntityPicker, useCustomerOptions, useWarehouseOptions, useAccountOptions, DataTable, Banner } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, uid } from '../../lib/format';
import type { PosBill, PosReturn, PosShift, PosTerminal, Tender, TenderType, PosSettings } from './types';
import { posSettingsOf } from './types';
import { shiftSummary, closeShift, approveShiftVariance, settings, openShiftFor, postReturn, validateReturn, returnNeedsApproval, returnableOnBill, computeCart, postApprovedReturn, cartLine } from './actions';

function useCompanyRows<T extends { companyId?: string }>(col: string): T[] { const rows = useCollection<any>(col); const s = useSession(); return useMemo(() => rows.filter((r: any) => !r.companyId || r.companyId === s.state.companyId), [rows, s.state.companyId]); }

// ── Shifts ─────────────────────────────────────────────────────────────────

export function ShiftsRegister() {
  const rows = useCompanyRows<PosShift>(C.posShifts).slice().sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  const s = useSession();
  const [closing, setClosing] = useState<PosShift | null>(null);
  const columns: Column<PosShift>[] = [
    { key: 'number', label: 'Shift', render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`pos/shifts/${r.id}`); }}>{r.number}</Identifier> },
    { key: 'terminalName', label: 'Terminal', render: (r) => r.terminalName },
    { key: 'cashierName', label: 'Cashier', render: (r) => r.cashierName },
    { key: 'openedAt', label: 'Opened', sortable: true, render: (r) => fmtDateTime(r.openedAt), value: (r) => r.openedAt },
    { key: 'closedAt', label: 'Closed', render: (r) => (r.closedAt ? fmtDateTime(r.closedAt) : '—') },
    { key: 'bills', label: 'Bills', align: 'right', render: (r) => r.bills ?? 0 },
    { key: 'sales', label: 'Sales', align: 'right', render: (r) => <Money value={r.sales ?? 0} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + (x.sales ?? 0), 0))}</span> },
    { key: 'variance', label: 'Variance', align: 'right', render: (r) => (r.varianceTotal !== undefined ? <Money value={r.varianceTotal} tone="auto" /> : '—') },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Pending Approval' ? 'Submitted' : r.status === 'Closed' ? 'Closed' : 'Open'}>{r.status}</Badge> },
  ];
  return (
    <>
      <RegisterPage<PosShift> title="POS shifts" subtitle={`${rows.filter((r) => r.status === 'Open').length} open · ${rows.length} total · ${s.branch?.name}`} rows={rows} columns={columns} entity="shifts" searchKeys={['number', 'terminalName', 'cashierName']} tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open', filter: (r) => r.status === 'Open' }, { id: 'pending', label: 'Pending approval', filter: (r) => r.status === 'Pending Approval' }, { id: 'closed', label: 'Closed', filter: (r) => r.status === 'Closed' }]}
        primaryAction={{ label: 'Open terminal', onClick: () => nav.go('pos') }} onRowClick={(r) => nav.go(`pos/shifts/${r.id}`)} rowActions={(r): MenuAction[] => [{ label: 'Open', onClick: () => nav.go(`pos/shifts/${r.id}`) }, ...(r.status === 'Open' ? [{ label: 'Close shift', onClick: () => setClosing(r) }] : [])]} />
      {closing && <ShiftCloseDialog shift={closing} onClose={() => setClosing(null)} onClosed={() => setClosing(null)} />}
    </>
  );
}

export function ShiftDetail({ id }: { id: string }) {
  const shift = useRecord<PosShift>(C.posShifts, id);
  useCollection(C.posBills); useCollection(C.posReturns);
  const s = useSession();
  const toast = useToast();
  const [closing, setClosing] = useState(false);
  const [report, setReport] = useState(false);
  const [approve, setApprove] = useState(false);
  if (!shift) return <EmptyState title="Shift not found" action={<Button variant="primary" onClick={() => nav.go('pos/shifts')}>Back</Button>} />;
  const sum = shiftSummary(shift);
  const tol = settings().posVarianceTolerance;
  const tenderRows = (['Cash', 'Card', 'UPI', 'Credit'] as const).map((t) => ({ tender: t, expected: sum.expected[t] ?? 0, counted: shift.counted?.[t], variance: shift.variance?.[t] }));
  return (
    <>
      <DocumentPage backLabel="POS shifts" onBack={() => nav.go('pos/shifts')} number={shift.number} badges={<Badge status={shift.status === 'Pending Approval' ? 'Submitted' : shift.status === 'Closed' ? 'Closed' : 'Open'}>{shift.status}</Badge>} amount={{ label: 'Net sales', value: sum.net, currency: s.currency }}
        rail={<><RailSection label="Terminal"><div style={{ fontSize: 13 }}>{shift.terminalName}<div style={{ fontSize: 12, color: '#5F6368' }}>{db.find<any>(C.branches, shift.branchId)?.name}</div></div></RailSection><RailSection label="Cashier"><div style={{ fontSize: 13 }}>{shift.cashierName}</div></RailSection><RailSection label="Timing"><div style={{ fontSize: 12, color: '#5F6368' }}>Opened {fmtDateTime(shift.openedAt)}{shift.closedAt ? <><br />Closed {fmtDateTime(shift.closedAt)} by {shift.closedBy}</> : null}</div></RailSection><RailSection label="Float"><div className="money">{fmtMoney(shift.openingFloat)}</div></RailSection>{shift.journalNumber && <RailSection label="Cash journal"><span className="link identifier" onClick={() => nav.go(`accounting/journals/${shift.journalId}`)}>{shift.journalNumber}</span></RailSection>}</>}
        banner={shift.status === 'Pending Approval' ? <Banner tone="warning" full>Variance {fmtMoney(shift.varianceTotal ?? 0)} exceeds the {fmtMoney(tol)} tolerance — awaiting manager approval.</Banner> : undefined}
        tabs={[
          { id: 'summary', label: 'Summary', content: <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
            <SummaryBlock items={[{ label: 'Bills', value: sum.bills.length }, { label: 'Items sold', value: fmtQty(sum.items) }, { label: 'Gross sales', value: fmtMoney(sum.sales) }, { label: 'Refunds', value: fmtMoney(sum.refunds), tone: sum.refunds ? 'warn' : undefined }, { label: 'Tax collected', value: fmtMoney(sum.tax) }, { label: 'Variance', value: fmtMoney(shift.varianceTotal ?? 0), tone: shift.varianceTotal ? (Math.abs(shift.varianceTotal) > tol ? 'danger' : 'warn') : undefined }]} />
            <Card padding={0} title={undefined}><table className="data-table dense"><thead><tr><th>Tender</th><th className="right">Expected</th><th className="right">Counted</th><th className="right">Variance</th></tr></thead><tbody>{tenderRows.map((r) => <tr key={r.tender}><td>{r.tender}{r.tender === 'Cash' ? <span style={{ color: '#6E6E71', fontSize: 11 }}> (incl. float)</span> : null}</td><td className="right money">{fmtMoney(r.expected)}</td><td className="right money">{r.counted !== undefined ? fmtMoney(r.counted) : '—'}</td><td className="right money">{r.variance !== undefined ? <Money value={r.variance} tone="auto" /> : '—'}</td></tr>)}</tbody></table></Card>
            {shift.closeNotes && <Card padding={14}><KV items={[{ k: 'Close notes', v: shift.closeNotes }]} /></Card>}
          </div> },
          { id: 'bills', label: `Bills (${sum.bills.length})`, content: <DataTable rows={sum.bills} columns={[{ key: 'number', label: 'Bill', render: (b: PosBill) => <Identifier link onClick={() => nav.go(`pos/bills/${b.id}`)}>{b.number}</Identifier> }, { key: 'time', label: 'Time', render: (b: PosBill) => fmtDateTime(b.postedAt) }, { key: 'cust', label: 'Customer', render: (b: PosBill) => b.partyName }, { key: 'items', label: 'Items', align: 'right', render: (b: PosBill) => b.lines.length }, { key: 'tender', label: 'Tender', render: (b: PosBill) => b.tenders.map((t) => t.type).join(' + ') }, { key: 'total', label: 'Total', align: 'right', render: (b: PosBill) => <Money value={b.totals.total} />, total: (rs: PosBill[]) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + x.totals.total, 0))}</span> }]} onRowClick={(b) => nav.go(`pos/bills/${b.id}`)} dense emptyTitle="No bills on this shift" /> },
          { id: 'returns', label: `Returns (${sum.returns.length})`, content: <DataTable rows={sum.returns} columns={[{ key: 'number', label: 'Return', render: (r: PosReturn) => <Identifier link onClick={() => nav.go(`pos/returns/${r.id}`)}>{r.number}</Identifier> }, { key: 'bill', label: 'Against', render: (r: PosReturn) => r.billNumber ?? 'No receipt' }, { key: 'reason', label: 'Reason', render: (r: PosReturn) => r.reasonText ?? r.reasonCode }, { key: 'refund', label: 'Refund', render: (r: PosReturn) => r.refund.type }, { key: 'total', label: 'Amount', align: 'right', render: (r: PosReturn) => <Money value={r.totals.total} /> }]} onRowClick={(r) => nav.go(`pos/returns/${r.id}`)} dense emptyTitle="No returns on this shift" /> },
          { id: 'accounting', label: 'Accounting', content: shift.journalId ? <AccountingTab journalId={shift.journalId} /> : <EmptyState compact title="No cash-drawer journal" description="A journal posts only when the counted cash differs from expected." /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={shift.id} /> },
        ]}
        footer={<><Button variant="secondary" onClick={() => setReport(true)}>Print shift report</Button>{shift.status === 'Open' && shift.cashierId === s.user?.id && <Button variant="secondary" onClick={() => nav.go('pos')}>Open terminal</Button>}{shift.status === 'Open' && <Button variant="primary" onClick={() => setClosing(true)} data-testid="close-shift">Close shift</Button>}{shift.status === 'Pending Approval' && <Button variant="primary" onClick={() => setApprove(true)} disabled={!s.can('pos.shift.approve') && !s.can('pos.*') && !s.isTenantOwner} reason="Requires pos.shift.approve">Approve variance</Button>}</>} />
      {closing && <ShiftCloseDialog shift={shift} onClose={() => setClosing(false)} onClosed={() => setClosing(false)} />}
      <Modal open={report} onClose={() => setReport(false)} title={`Shift report · ${shift.number}`} width={700} footer={<><Button variant="secondary" onClick={() => setReport(false)}>Close</Button><Button variant="primary" onClick={() => window.print()}>Print</Button></>}>
        <div className="print-sheet" style={{ width: 'auto', padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.company?.legalName} · Shift report</div>
          <div>{shift.number} · {shift.terminalName} · {shift.cashierName}</div>
          <div>Opened {fmtDateTime(shift.openedAt)}{shift.closedAt ? ` · Closed ${fmtDateTime(shift.closedAt)}` : ''}</div>
          <table style={{ marginTop: 12 }}><thead><tr><th>Tender</th><th style={{ textAlign: 'right' }}>Expected</th><th style={{ textAlign: 'right' }}>Counted</th><th style={{ textAlign: 'right' }}>Variance</th></tr></thead><tbody>{tenderRows.map((r) => <tr key={r.tender}><td>{r.tender}</td><td style={{ textAlign: 'right' }}>{fmtMoney(r.expected)}</td><td style={{ textAlign: 'right' }}>{r.counted !== undefined ? fmtMoney(r.counted) : '—'}</td><td style={{ textAlign: 'right' }}>{r.variance !== undefined ? fmtMoney(r.variance) : '—'}</td></tr>)}</tbody></table>
          <div style={{ marginTop: 12 }}>Bills {sum.bills.length} · Gross {fmtMoney(sum.sales)} · Refunds {fmtMoney(sum.refunds)} · Tax {fmtMoney(sum.tax)} · Net {fmtMoney(sum.net)}</div>
        </div>
      </Modal>
      <ConfirmDialog open={approve} onClose={() => setApprove(false)} title={`Approve variance of ${fmtMoney(shift.varianceTotal ?? 0)}?`} statement="The shift closes and the cash over/short journal stands." confirmLabel="Approve & close shift" cancelLabel="Keep pending" reasonRequired onConfirm={(c) => { approveShiftVariance(shift.id, c); toast.success('Shift closed'); }} />
    </>
  );
}

export function ShiftCloseDialog({ shift, onClose, onClosed }: { shift: PosShift; onClose: () => void; onClosed: () => void }) {
  const toast = useToast();
  const sum = shiftSummary(shift);
  const tol = settings().posVarianceTolerance;
  const [counted, setCounted] = useState<Record<string, number>>({ Cash: sum.expected.Cash ?? 0, Card: sum.expected.Card ?? 0, UPI: sum.expected.UPI ?? 0 });
  const [notes, setNotes] = useState('');
  const variance = (['Cash', 'Card', 'UPI'] as const).map((t) => ({ t, expected: sum.expected[t] ?? 0, counted: counted[t] ?? 0, variance: (counted[t] ?? 0) - (sum.expected[t] ?? 0) }));
  const total = variance.reduce((a, v) => a + v.variance, 0);
  const beyond = Math.abs(total) > tol;
  return (
    <Modal open onClose={onClose} title={`Close shift ${shift.number}?`} description={`${sum.bills.length} bills · ${fmtMoney(sum.sales)} sales · ${sum.returns.length} returns. Count each tender; variance beyond ${fmtMoney(tol)} routes to approval.`} width={640}
      footer={<><Button variant="secondary" onClick={onClose}>Keep shift open</Button><Button variant="primary" onClick={() => { try { const out = closeShift(shift.id, counted, notes); toast.success(out.status === 'Closed' ? 'Shift closed' : 'Shift closed pending variance approval'); onClosed(); } catch (e: any) { toast.error(e.message); } }} data-testid="confirm-close-shift">{beyond ? 'Close shift & submit variance' : 'Close shift'}</Button></>}>
      <table className="data-table dense" style={{ border: '1px solid #EFEFEF', borderRadius: 8 }}>
        <thead><tr><th>Tender</th><th className="right">Expected</th><th className="right" style={{ width: 160 }}>Counted</th><th className="right">Variance</th></tr></thead>
        <tbody>{variance.map((v) => <tr key={v.t}><td>{v.t}{v.t === 'Cash' ? <span style={{ fontSize: 11, color: '#6E6E71' }}> (incl. float {fmtMoney(shift.openingFloat)})</span> : null}</td><td className="right money">{fmtMoney(v.expected)}</td><td className="right"><NumberField size="grid" value={v.counted} onChange={(x) => setCounted((c) => ({ ...c, [v.t]: x }))} decimals={2} min={0} /></td><td className="right money" style={{ color: Math.abs(v.variance) > 0.005 ? (v.variance < 0 ? '#C0393F' : '#8A4B0F') : '#12784E' }}>{fmtMoney(v.variance)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={3}>Total variance</td><td className="right money" style={{ fontWeight: 600, color: beyond ? '#C0393F' : undefined }}>{fmtMoney(total)}</td></tr></tfoot>
      </table>
      {beyond && <Banner tone="warning" style={{ marginTop: 12 }}>Variance {fmtMoney(total)} is beyond the {fmtMoney(tol)} tolerance — a manager must approve the close. A cash over/short journal is posted for the cash difference.</Banner>}
      <div style={{ marginTop: 12 }}><TextArea label="Notes" value={notes} onChange={setNotes} rows={2} placeholder="Explain any difference" /></div>
    </Modal>
  );
}

// ── Bills ──────────────────────────────────────────────────────────────────

export function BillsRegister() {
  const rows = useCompanyRows<PosBill>(C.posBills).slice().sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''));
  const s = useSession();
  const [print, setPrint] = useState<PosBill | null>(null);
  const columns: Column<PosBill>[] = [
    { key: 'number', label: 'Bill', sortable: true, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`pos/bills/${r.id}`); }}>{r.number}</Identifier>, value: (r) => r.number },
    { key: 'postedAt', label: 'Time', sortable: true, render: (r) => fmtDateTime(r.postedAt), value: (r) => r.postedAt },
    { key: 'terminal', label: 'Terminal · cashier', render: (r) => <TwoLine primary={db.find<PosTerminal>(C.posTerminals, r.terminalId)?.name ?? '—'} secondary={r.cashierName} /> },
    { key: 'partyName', label: 'Customer', render: (r) => r.partyName ?? 'Walk-in' },
    { key: 'items', label: 'Items', align: 'right', render: (r) => fmtQty(r.lines.reduce((a, l) => a + l.qty, 0)) },
    { key: 'tender', label: 'Tender', render: (r) => r.tenders.map((t) => `${t.type}${t.last4 ? ' ****' + t.last4 : ''}`).join(' + ') },
    { key: 'total', label: 'Total', align: 'right', sortable: true, render: (r) => <Money value={r.totals.total} />, value: (r) => r.totals.total, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + x.totals.total, 0))}</span> },
    { key: 'status', label: 'Status', render: (r) => <div style={{ display: 'flex', gap: 4 }}><Badge status={r.status} />{r.returnedTotal ? <Badge status="Returned">Returned {fmtMoney(r.returnedTotal)}</Badge> : null}{r.onCredit && <Badge status="Submitted">Credit</Badge>}</div> },
  ];
  const t = new Date().toISOString().slice(0, 10);
  return (
    <>
      <RegisterPage<PosBill> title="POS bills" subtitle={<>{rows.filter((r) => r.date === t).length} today · <span className="money">{fmtMoney(rows.filter((r) => r.date === t).reduce((a, r) => a + r.totals.total, 0))}</span> · {s.branch?.name}</>} rows={rows} columns={columns} entity="POS bills" searchKeys={['number', 'partyName', 'cashierName']} tabs={[{ id: 'all', label: 'All' }, { id: 'today', label: 'Today', filter: (r) => r.date === t }, { id: 'credit', label: 'On credit', filter: (r) => !!r.onCredit }, { id: 'returned', label: 'With returns', filter: (r) => !!r.returnedTotal }]}
        filters={[{ key: 'tender', label: 'Tender', type: 'select', options: ['Cash', 'Card', 'UPI', 'Credit'].map((x) => ({ value: x, label: x })) }, { key: 'date', label: 'Date', type: 'date-range' }]} applyFilter={(r, f) => (!f.tender || r.tenders.some((x) => x.type === f.tender)) && (!f.dateFrom || r.date >= f.dateFrom) && (!f.dateTo || r.date <= f.dateTo)}
        primaryAction={{ label: 'Open terminal', onClick: () => nav.go('pos') }} onRowClick={(r) => nav.go(`pos/bills/${r.id}`)} rowActions={(r): MenuAction[] => [{ label: 'Open', onClick: () => nav.go(`pos/bills/${r.id}`) }, { label: 'Reprint', onClick: () => setPrint(r) }, { label: 'Return items', onClick: () => nav.go('pos/returns/new', { bill: r.id }), disabled: r.lines.every((l) => returnableOnBill(r, l.id) <= 0), reason: 'Fully returned' }]} />
      {print && <ReprintModal bill={print} onClose={() => setPrint(null)} />}
    </>
  );
}

function ReprintModal({ bill, onClose }: { bill: PosBill; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Reprint ${bill.number}`} description={`Reprinted ${bill.reprints ?? 0} time(s) — each reprint is audited.`} width={640} footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="primary" onClick={() => { db.update<PosBill>(C.posBills, bill.id, { reprints: (bill.reprints ?? 0) + 1 }); engine.audit({ action: 'pos.bill_reprinted', objectType: 'POS Bill', objectId: bill.id, objectNumber: bill.number }); window.print(); }}>Print duplicate</Button></>}>
      <div style={{ background: '#F3F5F5', padding: 12, maxHeight: '60vh', overflow: 'auto' }}><div style={{ transform: 'scale(.72)', transformOrigin: 'top left', width: 794 }}><PrintSheet doc={bill} title="Retail invoice (duplicate)" partyLabel="Customer" /></div></div>
    </Modal>
  );
}

export function BillDetail({ id }: { id: string }) {
  const bill = useRecord<PosBill>(C.posBills, id);
  const s = useSession();
  const [print, setPrint] = useState(false);
  if (!bill) return <EmptyState title="Bill not found" action={<Button variant="primary" onClick={() => nav.go('pos/bills')}>Back</Button>} />;
  const returns = db.where<PosReturn>(C.posReturns, (r) => r.billId === bill.id);
  return (
    <>
      <DocumentPage backLabel="POS bills" onBack={() => nav.go('pos/bills')} number={bill.number} badges={<><Badge status={bill.status} />{bill.onCredit && <Badge status="Submitted">Credit sale</Badge>}</>} amount={{ label: 'Total', value: bill.totals.total, currency: bill.currency }} due={bill.onCredit ? { label: 'Due', value: bill.totals.due, currency: bill.currency } : undefined}
        rail={<><RailSection label="Customer"><div style={{ fontSize: 13 }}>{bill.partyName ?? 'Walk-in'}</div></RailSection><RailSection label="Shift"><span className="link identifier" onClick={() => nav.go(`pos/shifts/${bill.shiftId}`)}>{db.find<PosShift>(C.posShifts, bill.shiftId)?.number}</span><div style={{ fontSize: 12, color: '#5F6368' }}>{db.find<PosTerminal>(C.posTerminals, bill.terminalId)?.name} · {bill.cashierName}</div></RailSection><RailSection label="Tender"><div style={{ fontSize: 12 }}>{bill.tenders.map((t, i) => <div key={i}>{t.type} {fmtMoney(t.amount)}{t.last4 ? ` · ****${t.last4}` : ''}{t.reference ? ` · ${t.reference}` : ''}</div>)}{bill.change > 0 && <div>Change {fmtMoney(bill.change)}</div>}</div></RailSection>{returns.length > 0 && <RailSection label="Returns">{returns.map((r) => <div key={r.id} style={{ fontSize: 12 }}><span className="link identifier" onClick={() => nav.go(`pos/returns/${r.id}`)}>{r.number}</span> · {fmtMoney(r.totals.total)}</div>)}</RailSection>}<RailSection label="Posted"><div style={{ fontSize: 12, color: '#5F6368' }}>{fmtDateTime(bill.postedAt)} · <span className="link identifier" onClick={() => nav.go(`accounting/journals/${bill.journalId}`)}>{bill.journalNumber}</span></div></RailSection></>}
        tabs={[{ id: 'details', label: 'Details', content: <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}><Card padding={0}><table className="data-table dense"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Rate</th><th className="right">Disc</th><th>Tax</th><th className="right">Amount</th><th className="right">Returned</th></tr></thead><tbody>{bill.lines.map((l) => <tr key={l.id}><td>{l.itemName}<div className="cell-secondary identifier">{l.itemCode}</div></td><td className="right money">{fmtQty(l.qty)}</td><td className="right money">{fmtMoney(l.rate)}</td><td className="right">{l.discountPct ? `${l.discountPct}%` : '—'}</td><td>GST {l.taxRate}%</td><td className="right money">{fmtMoney(l.amount)}</td><td className="right money">{l.returnedQty ? fmtQty(l.returnedQty) : '—'}</td></tr>)}</tbody></table></Card><SummaryBlock items={[{ label: 'Taxable', value: fmtMoney(bill.totals.taxable) }, ...Object.entries(bill.totals.components).map(([k, v]) => ({ label: k, value: fmtMoney(v) })), { label: 'Round-off', value: fmtMoney(bill.totals.roundOff) }, { label: 'Total', value: fmtMoney(bill.totals.total) }]} /></div> }, { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={bill.journalId} currency={bill.currency} /> }, { id: 'activity', label: 'Activity', content: <ActivityTab objectId={bill.id} correlationId={bill.correlationId} /> }]}
        footer={<><Button variant="secondary" onClick={() => setPrint(true)}>Reprint</Button><Button variant="primary" onClick={() => nav.go('pos/returns/new', { bill: bill.id })} disabled={bill.lines.every((l) => returnableOnBill(bill, l.id) <= 0)} reason="Fully returned">Return items</Button></>} />
      {print && <ReprintModal bill={bill} onClose={() => setPrint(false)} />}
      {s.currency ? null : null}
    </>
  );
}

// ── Returns ────────────────────────────────────────────────────────────────

export function ReturnsRegister() {
  const rows = useCompanyRows<PosReturn>(C.posReturns).slice().sort((a, b) => (b.postedAt ?? b.createdAt).localeCompare(a.postedAt ?? a.createdAt));
  const s = useSession();
  const toast = useToast();
  const columns: Column<PosReturn>[] = [
    { key: 'number', label: 'Return', render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`pos/returns/${r.id}`); }}>{r.number}</Identifier> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: 'bill', label: 'Against bill', render: (r) => (r.billId ? <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`pos/bills/${r.billId}`); }}>{r.billNumber}</Identifier> : <Badge status="Returned">No receipt</Badge>) },
    { key: 'reason', label: 'Reason', render: (r) => r.reasonText ?? r.reasonCode },
    { key: 'refund', label: 'Refund', render: (r) => r.refund.type },
    { key: 'total', label: 'Amount', align: 'right', render: (r) => <Money value={r.totals.total} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + x.totals.total, 0))}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
  ];
  return <RegisterPage<PosReturn> title="POS returns" subtitle={`${rows.length} returns · ${s.branch?.name}`} rows={rows} columns={columns} entity="POS returns" searchKeys={['number', 'billNumber', 'reasonText']} tabs={[{ id: 'all', label: 'All' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'pending', label: 'Awaiting approval', filter: (r) => r.status === 'Submitted' || r.status === 'Approved' }, { id: 'noreceipt', label: 'No receipt', filter: (r) => r.noReceipt }]}
    primaryAction={{ label: 'New return', onClick: () => nav.go('pos/returns/new') }} onRowClick={(r) => nav.go(`pos/returns/${r.id}`)} rowActions={(r): MenuAction[] => [{ label: 'Open', onClick: () => nav.go(`pos/returns/${r.id}`) }, ...(r.status === 'Approved' ? [{ label: 'Post approved return', onClick: () => { try { const o = postApprovedReturn(r.id); toast.success(`Return ${o.number} posted`); } catch (e: any) { toast.error(e.message); } } }] : [])]} />;
}

export function ReturnDetail({ id }: { id: string }) {
  const r = useRecord<PosReturn>(C.posReturns, id);
  if (!r) return <EmptyState title="Return not found" action={<Button variant="primary" onClick={() => nav.go('pos/returns')}>Back</Button>} />;
  return <DocumentPage backLabel="POS returns" onBack={() => nav.go('pos/returns')} number={r.number} badges={<><Badge status={r.status} />{r.noReceipt && <Badge status="Returned">No receipt</Badge>}</>} amount={{ label: 'Refund', value: r.totals.total, currency: r.currency }}
    rail={<><RailSection label="Against">{r.billId ? <span className="link identifier" onClick={() => nav.go(`pos/bills/${r.billId}`)}>{r.billNumber}</span> : <span style={{ fontSize: 12 }}>No receipt</span>}</RailSection><RailSection label="Reason"><div style={{ fontSize: 13 }}>{r.reasonText ?? r.reasonCode}</div></RailSection><RailSection label="Refund"><div style={{ fontSize: 13 }}>{r.refund.type} {fmtMoney(r.refund.amount)}{r.refund.last4 ? ` · ****${r.refund.last4}` : ''}</div></RailSection><RailSection label="Shift"><span className="link identifier" onClick={() => nav.go(`pos/shifts/${r.shiftId}`)}>{db.find<PosShift>(C.posShifts, r.shiftId)?.number}</span><div style={{ fontSize: 12, color: '#5F6368' }}>{r.cashierName}</div></RailSection>{r.journalNumber && <RailSection label="Journal"><span className="link identifier" onClick={() => nav.go(`accounting/journals/${r.journalId}`)}>{r.journalNumber}</span></RailSection>}</>}
    tabs={[{ id: 'details', label: 'Details', content: <Card padding={0}><table className="data-table dense"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right">Rate</th><th>Tax</th><th className="right">Amount</th></tr></thead><tbody>{r.lines.map((l) => <tr key={l.id}><td>{l.itemName}</td><td className="right money">{fmtQty(l.qty)}</td><td className="right money">{fmtMoney(l.rate)}</td><td>GST {l.taxRate}%</td><td className="right money">{fmtMoney(l.amount)}</td></tr>)}</tbody><tfoot><tr><td colSpan={4}>Refund</td><td className="right money">{fmtMoney(r.totals.total)}</td></tr></tfoot></table></Card> }, { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={r.journalId} /> }, { id: 'activity', label: 'Activity', content: <ActivityTab objectId={r.id} correlationId={r.correlationId} /> }]}
    footer={<Button variant="secondary" onClick={() => nav.go('pos/returns')}>Back to returns</Button>} />;
}

export function ReturnForm({ billId }: { billId?: string }) {
  const s = useSession();
  const toast = useToast();
  const custOpts = useCustomerOptions();
  const reasons = useCollection<ReasonCode>(C.reasonCodes).filter((r) => r.status === 'Active' && r.category === 'Return');
  const bills = useCompanyRows<PosBill>(C.posBills);
  const shift = openShiftFor(s.user?.id) ?? openShiftFor();
  const [lookup, setLookup] = useState('');
  const [bill, setBill] = useState<PosBill | undefined>(bills.find((b) => b.id === billId));
  const [noReceipt, setNoReceipt] = useState(false);
  const [lines, setLines] = useState<DocLine[]>([]);
  const [reasonCode, setReasonCode] = useState('');
  const [refund, setRefund] = useState<Tender>({ type: 'Cash', amount: 0 });
  const [customerId, setCustomerId] = useState<string | undefined>(bill?.partyId);
  const [confirm, setConfirm] = useState(false);
  const cfg = settings();
  const { totals } = useMemo(() => computeCart(lines, customerId), [lines, customerId]);
  const input = { shiftId: shift?.id ?? '', billId: bill?.id, lines, reasonCode, reasonText: reasons.find((r) => r.id === reasonCode)?.name, noReceipt, refund: { ...refund, amount: totals.total }, customerId };
  const errs = lines.length ? validateReturn(input) : [];
  const needsApproval = returnNeedsApproval(input, totals.total);
  const find = () => { const b = bills.find((x) => x.number.toLowerCase() === lookup.trim().toLowerCase() || x.number.toLowerCase().endsWith(lookup.trim().toLowerCase())); if (!b) { toast.error('No bill with that number'); return; } setBill(b); setCustomerId(b.partyId); setNoReceipt(false); setLines([]); };
  const toggleLine = (l: DocLine, on: boolean) => setLines((prev) => (on ? [...prev, { ...l, id: uid('ln'), qty: returnableOnBill(bill!, l.id), sourceLineId: l.id, sourceDocId: bill!.id, returnedQty: undefined }] : prev.filter((x) => x.sourceLineId !== l.id)));
  const setQty = (srcId: string, qty: number) => setLines((prev) => prev.map((x) => (x.sourceLineId === srcId ? { ...x, qty } : x)));
  const submit = () => { try { const out = postReturn(input); toast.success(out.status === 'Posted' ? `Return ${out.number} posted · refund ${fmtMoney(out.totals.total)} by ${out.refund.type}` : `Return ${out.number} submitted for approval`); nav.go(`pos/returns/${out.id}`); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <PageHeader back={{ label: 'POS returns', path: 'pos/returns' }} title="New POS return" subtitle={shift ? `Shift ${shift.number} · ${shift.terminalName} · ${shift.cashierName}` : 'No open shift — open the terminal first'} />
      {!shift && <Banner tone="danger" action={<Button variant="link" onClick={() => nav.go('pos')}>Open terminal</Button>}>Returns are processed against an open shift.</Banner>}
      <Card title="Original bill">
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <TextField label="Bill number" value={lookup} onChange={setLookup} placeholder="POS/26-27/0038" style={{ flex: 1 }} onKeyDown={(e) => e.key === 'Enter' && find()} disabled={noReceipt} />
          <Button variant="secondary" onClick={find} disabled={noReceipt}>Look up</Button>
          <div style={{ paddingBottom: 8 }}><CheckboxField checked={noReceipt} onChange={(v) => { setNoReceipt(v); if (v) { setBill(undefined); setLines([]); } }} label="No receipt" help={cfg.posNoReceiptReturns === 'Deny' ? 'Not allowed by policy' : cfg.posNoReceiptReturns === 'Allow' ? 'Allowed' : `Manager approval above ${fmtMoney(cfg.posNoReceiptApprovalThreshold)}`} /></div>
        </div>
        {bill && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}><span className="identifier" style={{ fontWeight: 600 }}>{bill.number}</span> · {fmtDateTime(bill.postedAt)} · {bill.partyName ?? 'Walk-in'} · {fmtMoney(bill.totals.total)} · {bill.tenders.map((t) => t.type).join('+')}</div>
            <table className="data-table dense" style={{ border: '1px solid #EFEFEF', borderRadius: 8 }}><thead><tr><th style={{ width: 36 }} /><th>Item</th><th className="right">Sold</th><th className="right">Returnable</th><th className="right" style={{ width: 120 }}>Return qty</th></tr></thead><tbody>{bill.lines.map((l) => { const max = returnableOnBill(bill, l.id); const sel = lines.find((x) => x.sourceLineId === l.id); return <tr key={l.id}><td><input type="checkbox" className="checkbox" checked={!!sel} disabled={max <= 0} onChange={(e) => toggleLine(l, e.target.checked)} /></td><td>{l.itemName}</td><td className="right money">{fmtQty(l.qty)}</td><td className="right money">{fmtQty(max)}</td><td className="right">{sel && <NumberField size="grid" value={sel.qty} onChange={(v) => setQty(l.id, Math.min(max, Math.max(0, v)))} decimals={0} min={0} max={max} />}</td></tr>; })}</tbody></table>
          </div>
        )}
        {noReceipt && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#5F6368', marginBottom: 6 }}>Add the items being returned at current retail price.</div>
            <NoReceiptLines lines={lines} onChange={setLines} customerId={customerId} />
          </div>
        )}
      </Card>
      <Card title="Refund">
        <div className="grid-3">
          <SelectField label="Reason" required value={reasonCode} onChange={setReasonCode} options={reasons.map((r) => ({ value: r.id, label: r.name }))} placeholder="— Select —" />
          <SelectField label="Refund by" value={refund.type} onChange={(v) => setRefund({ ...refund, type: v as TenderType })} options={[...(['Cash', 'Card', 'UPI'] as TenderType[]), ...(customerId && customerId !== cfg.posDefaultCustomerId ? (['Credit'] as TenderType[]) : [])].map((t) => ({ value: t, label: t === 'Credit' ? 'Store credit (customer ledger)' : t }))} />
          <EntityPicker label="Customer" value={customerId} onChange={(id) => setCustomerId(id)} options={custOpts} placeholder="Walk-in" />
          {refund.type === 'Card' && <TextField label="Card last 4" value={refund.last4 ?? ''} onChange={(v) => setRefund({ ...refund, last4: v.replace(/\D/g, '').slice(0, 4) })} />}
          {refund.type === 'UPI' && <TextField label="UPI reference" value={refund.reference ?? ''} onChange={(v) => setRefund({ ...refund, reference: v })} />}
        </div>
        <SummaryBlock style={{ marginTop: 12 }} items={[{ label: 'Lines', value: lines.length }, { label: 'Refund amount', value: fmtMoney(totals.total) }, { label: 'Tax reversed', value: fmtMoney(totals.tax) }, { label: 'Policy', value: needsApproval ? 'Manager approval required' : 'Auto-approved', tone: needsApproval ? 'warn' : 'good' }]} />
        {errs.length > 0 && <Banner tone="danger" style={{ marginTop: 12 }}>{errs[0]}</Banner>}
      </Card>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button variant="ghost" onClick={() => nav.go('pos/returns')}>Discard</Button><Button variant="primary" onClick={() => setConfirm(true)} disabled={!shift || !lines.length || errs.length > 0} data-testid="post-return">{needsApproval ? 'Submit return for approval' : `Refund ${fmtMoney(totals.total)}`}</Button></div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Refund ${fmtMoney(totals.total)} by ${refund.type}?`} statement="Posts the refund tender, receives the stock and reverses sales and tax for the returned lines." confirmLabel={needsApproval ? 'Submit for approval' : 'Post return'} cancelLabel="Not yet" consequences={[{ engine: 'Journal', text: `Dr Sales ${fmtMoney(totals.taxable)} · Dr Output tax ${fmtMoney(totals.tax)} · Cr ${refund.type === 'Credit' ? 'Advances from customers' : refund.type} ${fmtMoney(totals.total)}` }, { engine: 'Stock', text: `${lines.length} line(s) received into ${db.find<any>(C.warehouses, shift ? db.find<PosTerminal>(C.posTerminals, shift.terminalId)?.warehouseId : undefined)?.name ?? 'the POS warehouse'}` }, ...(needsApproval ? [{ engine: 'Workflow', text: 'No-receipt return above threshold — manager approval', tone: 'warning' as const }] : [])]} onConfirm={submit} />
    </div>
  );
}

function NoReceiptLines({ lines, onChange, customerId }: { lines: DocLine[]; onChange: (l: DocLine[]) => void; customerId?: string }) {
  const items = useCollection<any>(C.items).filter((i) => i.status === 'Active' && i.isStock);
  const [sel, setSel] = useState('');
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}><SelectField size="sm" value={sel} onChange={setSel} options={items.map((i) => ({ value: i.id, label: `${i.name} · ${i.code}` }))} placeholder="Add item…" style={{ flex: 1 }} /><Button size="sm" variant="secondary" onClick={() => { if (!sel) return; onChange([...lines, cartLine(sel, 1, customerId)]); setSel(''); }}>Add</Button></div>
      {lines.map((l) => <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 32px', gap: 8, alignItems: 'center', fontSize: 13, padding: '4px 0' }}><span>{l.itemName}</span><NumberField size="grid" value={l.qty} onChange={(v) => onChange(lines.map((x) => (x.id === l.id ? { ...x, qty: v } : x)))} decimals={0} min={1} /><span className="money" style={{ textAlign: 'right' }}>{fmtMoney(l.rate)}</span><button type="button" className="btn-icon" onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>✕</button></div>)}
    </div>
  );
}

// ── Admin ──────────────────────────────────────────────────────────────────

export function PosAdmin() {
  const s = useSession();
  const toast = useToast();
  const terminals = useCompanyRows<PosTerminal>(C.posTerminals);
  const whOpts = useWarehouseOptions();
  const accOpts = useAccountOptions((a) => a.controlType === 'Cash' || a.controlType === 'Bank');
  const custOpts = useCustomerOptions();
  const [cfg, setCfg] = useState<PosSettings>(() => posSettingsOf(s.company?.defaults));
  const [dirty, setDirty] = useState(false);
  const [edit, setEdit] = useState<PosTerminal | 'new' | null>(null);
  const set = (p: Partial<PosSettings>) => { setCfg((c) => ({ ...c, ...p })); setDirty(true); };
  const canAdmin = s.can('pos.admin.edit') || s.can('pos.*') || s.can('admin.company.edit') || s.isTenantOwner;
  const save = () => { if (!s.company) return; db.update<Company>(C.companies, s.company.id, { defaults: { ...s.company.defaults, ...cfg } }); engine.audit({ action: 'pos.settings_updated', objectType: 'Company', objectId: s.company.id, detail: JSON.stringify(cfg) }); setDirty(false); toast.success('POS settings saved'); };
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <PageHeader title="POS administration" subtitle="Terminals, tolerances and policies for this company." actions={<Button variant="primary" onClick={save} disabled={!dirty || !canAdmin} reason={!canAdmin ? 'Requires pos.admin.edit' : undefined}>Save settings</Button>} />
      <Card title="Terminals" actions={<Button size="sm" variant="secondary" onClick={() => setEdit('new')} disabled={!canAdmin}>+ Add terminal</Button>}>
        <DataTable rows={terminals} columns={[{ key: 'code', label: 'Code', render: (t: PosTerminal) => <span className="identifier">{t.code}</span> }, { key: 'name', label: 'Name', render: (t: PosTerminal) => t.name }, { key: 'branch', label: 'Branch', render: (t: PosTerminal) => db.find<any>(C.branches, t.branchId)?.name }, { key: 'wh', label: 'Warehouse', render: (t: PosTerminal) => db.find<any>(C.warehouses, t.warehouseId)?.name }, { key: 'cash', label: 'Cash account', render: (t: PosTerminal) => db.find<any>(C.accounts, t.cashAccountId ?? cfg.posCashAccountId)?.name }, { key: 'status', label: 'Status', render: (t: PosTerminal) => <Badge status={t.status} /> }]} dense rowActions={(t: PosTerminal) => [{ label: 'Edit', onClick: () => setEdit(t) }, { label: t.status === 'Active' ? 'Deactivate' : 'Activate', onClick: () => db.update<PosTerminal>(C.posTerminals, t.id, { status: t.status === 'Active' ? 'Inactive' : 'Active' }), disabled: !canAdmin }]} emptyTitle="No terminals" />
      </Card>
      <Card title="Cash control (FR-POS-006)"><div className="grid-3"><MoneyField label="Variance tolerance" value={cfg.posVarianceTolerance} onChange={(v) => set({ posVarianceTolerance: v })} help="Beyond this the shift close routes to approval" disabled={!canAdmin} /><SelectField label="Cash account" value={cfg.posCashAccountId} onChange={(v) => set({ posCashAccountId: v })} options={accOpts.map((a) => ({ value: a.id, label: a.primary }))} disabled={!canAdmin} /><SelectField label="Card / UPI settlement account" value={cfg.posCardAccountId} onChange={(v) => set({ posCardAccountId: v, posUpiAccountId: v })} options={accOpts.map((a) => ({ value: a.id, label: a.primary }))} disabled={!canAdmin} /></div></Card>
      <Card title="Returns policy (FR-POS-005)"><div className="grid-2"><SelectField label="No-receipt returns" value={cfg.posNoReceiptReturns} onChange={(v) => set({ posNoReceiptReturns: v as any })} options={[{ value: 'Deny', label: 'Deny' }, { value: 'Manager approval', label: 'Allow with manager approval above threshold' }, { value: 'Allow', label: 'Allow' }]} disabled={!canAdmin} /><MoneyField label="Approval threshold" value={cfg.posNoReceiptApprovalThreshold} onChange={(v) => set({ posNoReceiptApprovalThreshold: v })} disabled={!canAdmin || cfg.posNoReceiptReturns !== 'Manager approval'} /></div></Card>
      <Card title="Defaults"><div className="grid-3"><EntityPicker label="Default customer" value={cfg.posDefaultCustomerId} onChange={(id) => set({ posDefaultCustomerId: id })} options={custOpts} disabled={!canAdmin} /><SelectField label="Default warehouse" value={cfg.posDefaultWarehouseId ?? ''} onChange={(v) => set({ posDefaultWarehouseId: v || undefined })} options={whOpts.map((w) => ({ value: w.id, label: w.primary }))} disabled={!canAdmin} /><SelectField label="Price list" value={cfg.posPriceListId ?? ''} onChange={(v) => set({ posPriceListId: v || undefined })} options={db.get<any>(C.priceLists).filter((p) => p.type === 'Sales').map((p) => ({ value: p.id, label: `${p.name}${p.taxInclusive ? ' (incl. tax)' : ''}` }))} disabled={!canAdmin} /><div style={{ gridColumn: 'span 3' }}><Toggle on={cfg.posAllowCredit} onChange={(v) => set({ posAllowCredit: v })} label="Allow credit sales to named customers" help="Posts to the customer ledger (AR) and creates an open item" disabled={!canAdmin} /></div></div></Card>
      {edit && <TerminalDrawer terminal={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TerminalDrawer({ terminal, onClose }: { terminal?: PosTerminal; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const whOpts = useWarehouseOptions();
  const accOpts = useAccountOptions((a) => a.controlType === 'Cash');
  const [t, setT] = useState<Partial<PosTerminal>>(terminal ?? { code: `T-${String(db.count(C.posTerminals) + 1).padStart(2, '0')}`, name: '', branchId: s.branch?.id, warehouseId: s.branch?.defaultWarehouseId ?? s.company?.defaults.warehouseId, status: 'Active' });
  const save = () => { if (!t.code || !t.name || !t.branchId || !t.warehouseId) { toast.error('Code, name, branch and warehouse are required'); return; } if (terminal) db.update<PosTerminal>(C.posTerminals, terminal.id, t); else db.insert<PosTerminal>(C.posTerminals, t as any); engine.audit({ action: terminal ? 'pos.terminal_updated' : 'pos.terminal_created', objectType: 'POS Terminal', objectNumber: t.code }); toast.success('Terminal saved'); onClose(); };
  return (
    <Drawer open onClose={onClose} title={terminal ? `Edit ${terminal.name}` : 'New terminal'} width={480} footer={<><Button variant="ghost" onClick={onClose}>Discard</Button><Button variant="primary" onClick={save}>Save terminal</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid-2"><TextField label="Code" required value={t.code ?? ''} onChange={(v) => setT({ ...t, code: v })} uppercase /><TextField label="Name" required value={t.name ?? ''} onChange={(v) => setT({ ...t, name: v })} placeholder="Main counter" /></div>
        <SelectField label="Branch" required value={t.branchId ?? ''} onChange={(v) => setT({ ...t, branchId: v })} options={s.branches.map((b) => ({ value: b.id, label: b.name }))} />
        <SelectField label="Warehouse" required value={t.warehouseId ?? ''} onChange={(v) => setT({ ...t, warehouseId: v })} options={whOpts.map((w) => ({ value: w.id, label: w.primary }))} />
        <SelectField label="Cash account (override)" value={t.cashAccountId ?? ''} onChange={(v) => setT({ ...t, cashAccountId: v || undefined })} options={accOpts.map((a) => ({ value: a.id, label: a.primary }))} placeholder="Company default" />
        <TextField label="Location" value={t.location ?? ''} onChange={(v) => setT({ ...t, location: v })} />
      </div>
    </Drawer>
  );
}

