import { useState } from 'react';
import { C, nav, useSession, db } from '../../../store';
import type { OpenItem } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, Money, ConfirmDialog, useToast, DocumentPage, RailSection, KV, Card, ActivityTab, AccountingTab, EmptyState, Button, PartyRail } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, fmtMoney, today } from '../../../lib/format';
import type { Receipt } from '../types';
import { useCompanyDocs, PdfPreviewModal, SourceChain } from '../common';
import { postReceipt, reverseReceipt } from '../actions';
import ReceiptDrawer from './ReceiptDrawer';

const allocStatus = (r: Receipt) => (r.status !== 'Posted' ? r.status : r.unapplied <= 0.005 ? 'Allocated' : r.allocations.length ? 'Partial' : 'Unallocated');

export default function ReceiptRegister({ openNew, newParams }: { openNew?: boolean; newParams?: Record<string, string> }) {
  const rows = useCompanyDocs<Receipt>(C.receipts);
  const s = useSession();
  const toast = useToast();
  const [drawer, setDrawer] = useState<{ customerId?: string; invoiceId?: string; receiptId?: string } | null>(openNew ? { customerId: newParams?.customer, invoiceId: newParams?.invoice } : null);
  const [confirm, setConfirm] = useState<{ kind: 'post' | 'reverse'; r: Receipt } | null>(null);
  const posted = rows.filter((r) => r.status === 'Posted');
  const month = today().slice(0, 7);
  const columns: Column<Receipt>[] = [
    { key: 'number', label: 'Receipt #', sortable: true, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`sales/receipts/${r.id}`); }}>{r.number}</Identifier>, value: (r) => r.number },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: 'partyName', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono />, value: (r) => r.partyName },
    { key: 'method', label: 'Method', render: (r) => <TwoLine primary={r.method} secondary={r.reference} mono /> },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: (r) => <Money value={r.amount} currency={r.currency} code={r.currency !== s.currency} />, value: (r) => r.amount, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.filter((x) => x.status === 'Posted' && x.currency === s.currency).reduce((a, x) => a + x.amount, 0), s.currency)}</span> },
    { key: 'allocated', label: 'Allocated', align: 'right', render: (r) => <Money value={r.allocations.reduce((a, x) => a + x.amount, 0)} currency={r.currency} />, value: (r) => r.allocations.reduce((a, x) => a + x.amount, 0) },
    { key: 'unapplied', label: 'Unapplied', align: 'right', render: (r) => (r.unapplied > 0 ? <Money value={r.unapplied} currency={r.currency} tone="negative" /> : <span style={{ color: 'var(--ink-5)' }}>—</span>), value: (r) => r.unapplied },
    { key: 'status', label: 'Status', render: (r) => <Badge status={allocStatus(r)} />, value: (r) => allocStatus(r) },
  ];
  const rowActions = (r: Receipt): MenuAction[] => [
    { label: 'Open', onClick: () => nav.go(`sales/receipts/${r.id}`) },
    ...(r.status === 'Draft' ? [{ label: 'Edit', onClick: () => setDrawer({ receiptId: r.id }) }, { label: 'Post', onClick: () => setConfirm({ kind: 'post', r }) }] : []),
    ...(r.status === 'Posted' ? [{ label: 'Reverse', danger: true, onClick: () => setConfirm({ kind: 'reverse', r }), disabled: !s.can('sales.receipt.post') && !s.can('sales.receipt.*'), reason: 'Requires sales.receipt.post' }] : []),
  ];
  return (
    <>
      <RegisterPage<Receipt>
        title="Receipts" subtitle={<>{posted.length} posted · <span className="money">{fmtMoney(posted.filter((r) => r.date.startsWith(month) && r.currency === s.currency).reduce((a, r) => a + r.amount, 0), s.currency)}</span> received this month · {s.branch?.name}</>}
        rows={rows} columns={columns} entity="receipts" exportName="receipts" searchKeys={['number', 'partyName', 'reference', 'method']} searchPlaceholder="Receipt, customer, UTR…"
        tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'allocated', label: 'Allocated', filter: (r) => allocStatus(r) === 'Allocated' }, { id: 'partial', label: 'Partial', filter: (r) => allocStatus(r) === 'Partial' }, { id: 'unallocated', label: 'Unallocated', filter: (r) => allocStatus(r) === 'Unallocated' }, { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
        filters={[{ key: 'method', label: 'Method', type: 'select', options: ['Cash', 'Bank', 'Cheque', 'UPI', 'Gateway', 'NEFT', 'RTGS', 'IMPS'].map((m) => ({ value: m, label: m })) }, { key: 'date', label: 'Date', type: 'date-range' }]}
        applyFilter={(r, f) => (!f.method || r.method === f.method) && (!f.dateFrom || r.date >= f.dateFrom) && (!f.dateTo || r.date <= f.dateTo)}
        primaryAction={{ label: 'Record receipt', onClick: () => setDrawer({}), disabled: !s.can('sales.receipt.create') && !s.can('sales.receipt.*'), reason: 'Requires sales.receipt.create' }}
        onRowClick={(r) => nav.go(`sales/receipts/${r.id}`)} rowActions={rowActions}
      />
      {drawer && <ReceiptDrawer open onClose={() => { setDrawer(null); if (openNew) nav.replace('sales/receipts'); }} customerId={drawer.customerId} invoiceId={drawer.invoiceId} receiptId={drawer.receiptId} onPosted={(r) => { setDrawer(null); nav.go(`sales/receipts/${r.id}`); }} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'post' ? `Post receipt for ${confirm.r.partyName}?` : `Reverse receipt ${confirm?.r.number}?`} statement={confirm?.kind === 'post' ? 'Posts the bank journal and settles the allocated invoices.' : 'Allocations are restored to the invoices and a reversal journal is posted.'} confirmLabel={confirm?.kind === 'post' ? 'Post receipt' : 'Reverse receipt'} cancelLabel="Keep receipt" danger={confirm?.kind === 'reverse'} reasonRequired={confirm?.kind === 'reverse'}
        consequences={confirm?.kind === 'reverse' ? [{ engine: 'Open items', text: `${confirm.r.allocations.length} allocation(s) restored` }, { engine: 'Journal', text: `${confirm.r.journalNumber} reversed` }] : []}
        onConfirm={(reason) => { if (!confirm) return; if (confirm.kind === 'post') { const o = postReceipt(confirm.r.id); toast.success(`Receipt ${o.number} posted`); } else { reverseReceipt(confirm.r.id, reason); toast.success('Receipt reversed'); } }} />
    </>
  );
}

export function ReceiptDetail({ id }: { id: string }) {
  const rows = useCompanyDocs<Receipt>(C.receipts);
  const r = rows.find((x) => x.id === id);
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [pdf, setPdf] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!r) return <EmptyState title="Receipt not found" action={<Button variant="primary" onClick={() => nav.go('sales/receipts')}>Back</Button>} />;
  const adv = db.find<OpenItem>(C.openItems, r.advanceOpenItemId);
  const bank = db.find<any>(C.accounts, r.bankAccountId);
  return (
    <>
      <DocumentPage backLabel="Receipts" onBack={() => nav.go('sales/receipts')} number={r.number} badges={<><Badge status={r.status} />{r.status === 'Posted' && <Badge status={allocStatus(r)} />}</>}
        amount={{ label: 'Received', value: r.amount, currency: r.currency, base: r.currency !== s.currency ? r.totals.baseTotal : undefined, baseCurrency: s.currency, rate: r.rate }}
        due={r.unapplied > 0 ? { label: 'Unapplied advance', value: r.unapplied, currency: r.currency } : undefined}
        rail={<>
          <RailSection label="Customer" snapshot={r.status === 'Posted'}><PartyRail snapshot={r.partySnapshot} name={r.partyName} link={r.partyId ? `masters/customers/${r.partyId}` : undefined} /></RailSection>
          <RailSection label="Allocated to"><SourceChain doc={r as any} /><div style={{ marginTop: 6, fontSize: 12 }}>{r.allocations.map((a) => <div key={a.openItemId}><span className="link identifier" onClick={() => nav.go(`sales/invoices/${a.docId}`)}>{a.docNumber}</span> · {fmtMoney(a.amount, r.currency)}</div>)}{!r.allocations.length && <span style={{ color: 'var(--ink-4)' }}>No allocations</span>}</div></RailSection>
          {adv && <RailSection label="Advance"><div style={{ fontSize: 12 }}><Badge status={adv.status} /> · {fmtMoney(adv.outstanding, adv.currency)} available of {fmtMoney(adv.originalAmount, adv.currency)}</div></RailSection>}
          {r.postedAt && <RailSection label="Posted"><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtDate(r.postedAt)} · {r.postedBy} · <span className="link identifier" onClick={() => nav.go(`accounting/journals/${r.journalId}`)}>{r.journalNumber}</span></div></RailSection>}
        </>}
        banner={r.status === 'Reversed' ? <div className="banner warning full">Reversed: {r.reversalReason}</div> : undefined}
        tabs={[
          { id: 'details', label: 'Details', content: <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}><Card padding={20}><KV columns={2} items={[{ k: 'Date', v: fmtDate(r.date) }, { k: 'Method', v: r.method }, { k: 'Deposited to', v: bank ? `${bank.code} · ${bank.name}` : '—' }, { k: 'Reference', v: r.reference ?? '—' }, ...(r.method === 'Cheque' ? [{ k: 'Cheque date', v: fmtDate(r.chequeDate) }, { k: 'Drawn on', v: r.chequeBank ?? '—' }] : []), { k: 'Currency', v: `${r.currency}${r.rate !== 1 ? ` @ ${r.rate}` : ''}` }, { k: 'Branch', v: db.find<any>(C.branches, r.branchId)?.name }]} /></Card>
            <Card padding={0} title={undefined}><table className="data-table dense"><thead><tr><th>Component</th><th className="right">Amount</th></tr></thead><tbody><tr><td>Net to bank</td><td className="right money">{fmtMoney(r.amount - r.charges - r.tds, r.currency)}</td></tr>{r.charges > 0 && <tr><td>Bank charges</td><td className="right money">{fmtMoney(r.charges, r.currency)}</td></tr>}{r.tds > 0 && <tr><td>TDS deducted by customer</td><td className="right money">{fmtMoney(r.tds, r.currency)}</td></tr>}<tr><td><strong>Gross settled</strong></td><td className="right money"><strong>{fmtMoney(r.amount, r.currency)}</strong></td></tr>{r.allocations.map((a) => <tr key={a.openItemId}><td style={{ paddingLeft: 24 }}>→ <span className="link identifier" onClick={() => nav.go(`sales/invoices/${a.docId}`)}>{a.docNumber}</span></td><td className="right money">{fmtMoney(a.amount, r.currency)}</td></tr>)}{r.unapplied > 0 && <tr><td style={{ paddingLeft: 24 }}>→ Unapplied advance</td><td className="right money">{fmtMoney(r.unapplied, r.currency)}</td></tr>}</tbody></table></Card>
            {r.notes && <Card padding={16}><KV items={[{ k: 'Notes', v: r.notes }]} /></Card>}</div> },
          { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={r.journalId} currency={r.currency} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={r.id} correlationId={r.correlationId} /> },
        ]}
        footer={<>
          <Button variant="secondary" onClick={() => setPdf(true)}>Print receipt</Button>
          {r.status === 'Draft' && <><Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button><Button variant="primary" onClick={() => { try { const o = postReceipt(r.id); toast.success(`Receipt ${o.number} posted`); } catch (e: any) { toast.error(e.message); } }}>Post receipt</Button></>}
          {r.status === 'Posted' && <Button variant="danger" onClick={() => setConfirm(true)} disabled={!s.can('sales.receipt.post') && !s.can('sales.receipt.*')} reason="Requires sales.receipt.post">Reverse</Button>}
        </>}
      />
      {edit && <ReceiptDrawer open onClose={() => setEdit(false)} receiptId={r.id} onPosted={() => setEdit(false)} />}
      <PdfPreviewModal open={pdf} onClose={() => setPdf(false)} doc={{ ...(r as any), lines: r.allocations.map((a) => ({ id: a.openItemId, itemName: `Payment against ${a.docNumber}`, qty: 1, uom: '', rate: a.amount, discountPct: 0, discountAmt: 0, taxable: a.amount, taxRate: 0, taxAmt: 0, taxComponents: {}, amount: a.amount })), charges: [], totals: { ...r.totals, breakup: [], components: {} } }} title="Receipt voucher" partyLabel="Received from" />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Reverse receipt ${r.number}?`} statement="Allocations are restored and a reversal journal is posted. Cannot be undone." confirmLabel="Reverse receipt" cancelLabel="Keep receipt" danger reasonRequired consequences={[{ engine: 'Open items', text: `${r.allocations.length} allocation(s) restored${adv ? ' · advance closed' : ''}` }, { engine: 'Journal', text: `${r.journalNumber} reversed` }]} onConfirm={(reason) => { reverseReceipt(r.id, reason); toast.success('Receipt reversed'); }} />
    </>
  );
}
