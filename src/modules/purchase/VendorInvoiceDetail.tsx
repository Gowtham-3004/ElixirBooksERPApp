// Vendor invoice detail (FR-PUR-032..034): matching result, exceptions, posting, payments, reversal.
import { useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { OpenItem } from '../../store';
import { DocumentPage, Button, Badge, RailSection, KV, ActivityTab, AccountingTab, AttachmentsPanel, PrintSheet, LineItemGrid, TotalsLadder, TaxBreakup, useToast, ActionMenu, EmptyState, Pill, Banner } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, daysBetween, today } from '../../lib/format';
import type { VendorInvoice, VendorInvoiceLine, MatchException, Payment, DebitNote } from './types';
import * as A from './actions';
import { useConfirm, StandardRail, DocLink } from './shared';

export function VendorInvoiceDetail({ id }: { id: string }) {
  const v = useRecord<VendorInvoice>(C.vendorInvoices, id);
  const exceptions = useCollection<MatchException>(C.matchExceptions).filter((x) => x.invoiceId === id);
  const openItem = useCollection<OpenItem>(C.openItems).find((o) => o.docId === id);
  const payments = useCollection<Payment>(C.payments).filter((p) => p.allocations.some((a) => a.docId === id) && p.status !== 'Draft');
  const debitNotes = useCollection<DebitNote>(C.debitNotes).filter((d) => d.invoiceId === id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState(nav.get().params.tab ?? 'lines');
  if (!v) return <EmptyState title="Vendor invoice not found" action={<Button onClick={() => nav.go('purchase/vendor-invoices')}>Back</Button>} />;
  const block = A.postingBlockReason(v);
  const openEx = exceptions.filter((x) => x.status === 'Open' || x.status === 'Assigned');
  const outstanding = openItem?.outstanding ?? (v.status === 'Posted' ? v.totals.due : 0);
  const overdue = v.status === 'Posted' && outstanding > 0 && v.dueDate ? Math.max(0, daysBetween(v.dueDate, today())) : 0;
  const canPost = s.can('purchase.invoice.post');
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const projected = v.status !== 'Posted' && v.status !== 'Reversed' ? (() => { try { return A.vendorInvoiceJournalLines(v); } catch { return []; } })() : undefined;
  return (
    <>
      <DocumentPage backLabel="Vendor invoices" onBack={() => nav.go('purchase/vendor-invoices')} number={v.number === 'VINV/DRAFT' ? `Draft · ${v.supplierInvoiceNumber}` : v.number} activeTab={tab} onTab={setTab}
        badges={<><Badge status={v.status} /><Badge status={v.matchStatus}>{v.matchMode ?? ''} {v.matchStatus}</Badge>{v.reverseCharge && <Pill tone="warning">RCM</Pill>}{v.totals.tds > 0 && <Pill tone="neutral">TDS {v.totals.tdsSection}</Pill>}</>}
        amount={{ label: 'Invoice total', value: v.totals.total, currency: v.currency, base: v.totals.baseTotal, baseCurrency: s.currency, rate: v.rate }}
        due={v.status === 'Posted' ? { label: 'Outstanding', value: outstanding, currency: v.currency, dueDate: v.dueDate, overdueDays: overdue } : undefined}
        banner={block && v.status !== 'Draft' && v.status !== 'Posted' && v.status !== 'Reversed' && v.status !== 'Cancelled' ? <div className="banner warning full">Posting blocked: {block}{openEx.length > 0 && <> · <button type="button" className="btn-link" onClick={() => nav.go(`purchase/exceptions/${openEx[0].id}`)}>Open exception workbench</button></>}</div> : v.status === 'Approved' ? <div className="banner success full">Matched within tolerance ({v.matchMode}) — ready to post.</div> : undefined}
        rail={<StandardRail doc={v} facts={[{ k: 'Supplier inv.', v: <span className="identifier">{v.supplierInvoiceNumber}</span> }, { k: 'Supplier date', v: fmtDate(v.supplierInvoiceDate) }, { k: 'PO', v: v.poNumber ? <DocLink path={`purchase/orders/${v.poId}`} number={v.poNumber} /> : 'Direct' }, { k: 'GRN', v: v.grnNumbers.length ? <DocLink path={`purchase/grn/${v.grnIds[0]}`} number={v.grnNumbers.join(', ')} /> : '—' }, { k: 'Terms', v: v.paymentTerms ?? '—' }, ...(v.dimensions?.Department ? [{ k: 'Department', v: db.find<any>(C.dimensions, v.dimensions.Department)?.name }] : []), ...(v.dimensions?.Project ? [{ k: 'Project', v: db.find<any>(C.dimensions, v.dimensions.Project)?.name }] : [])]}>
          {v.status === 'Posted' && <RailSection label="Settlement"><KV items={[{ k: 'Paid', v: fmtMoney(v.totals.paid ?? 0, v.currency) }, { k: 'Credited', v: fmtMoney(v.totals.credited ?? 0, v.currency) }, { k: 'Outstanding', v: fmtMoney(outstanding, v.currency) }, { k: 'Open item', v: openItem ? <Badge status={openItem.status} /> : '—' }]} /></RailSection>}
          <RailSection label="Attachments"><AttachmentsPanel objectType="Vendor Invoice" objectId={v.id} readOnly={v.status === 'Posted' || v.status === 'Reversed'} /></RailSection>
        </StandardRail>}
        tabs={[
          { id: 'lines', label: 'Lines', content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <LineItemGrid lines={v.lines} readOnly direction="purchase" currency={v.currency} showWarehouse={!v.poId} showDiscount showTax showAccount totals={v.totals} extraColumns={v.poId ? [{ key: 'po', label: 'PO rate · qty', width: 120, render: (l) => { const x = l as VendorInvoiceLine; return <span style={{ fontSize: 12, color: x.poRate !== undefined && x.rate !== x.poRate ? 'var(--danger)' : 'var(--ink-3)' }}>{fmtMoney(x.poRate ?? 0, v.currency)} · {fmtQty(x.poQty ?? 0)}</span>; } }, { key: 'grn', label: 'GRN qty', width: 80, render: (l) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{(l as VendorInvoiceLine).grnQty ?? '—'}</span> }] : undefined} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                <div className="card" style={{ padding: 16 }}><div className="section-title">Input tax breakup</div><TaxBreakup totals={v.totals} currency={v.currency} />{(v.charges ?? []).length > 0 && <div style={{ marginTop: 12, fontSize: 12 }}><strong>Charges:</strong> {(v.charges ?? []).map((c) => `${c.name} ${fmtMoney(c.amount, v.currency)}`).join(' · ')}</div>}{v.notes && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--ink-3)' }}>{v.notes}</div>}</div>
                <div className="card" style={{ padding: 16 }}><div className="section-title">Totals</div><TotalsLadder totals={v.totals} currency={v.currency} baseCurrency={s.currency} rate={v.rate} /></div>
              </div>
            </div>) },
          { id: 'match', label: `Matching (${exceptions.length})`, content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {v.poId ? <Banner tone={v.matchStatus === 'Exception' ? 'warning' : v.matchStatus === 'Matched' ? 'success' : 'info'}>{v.matchMode ?? A.purchaseSettings().matchingMode} match against {v.poNumber}{v.grnNumbers.length ? ` and ${v.grnNumbers.join(', ')}` : ''} · tolerance {A.purchaseSettings().matchTolerancePct}% / ₹{A.purchaseSettings().matchToleranceAmt} · result <strong>{v.matchStatus}</strong></Banner> : <Banner tone="info">Direct invoice — matching not required.</Banner>}
              {exceptions.length > 0 && <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Type</th><th>Line</th><th className="right">PO</th><th className="right">GRN</th><th className="right">Invoice</th><th className="right">Variance</th><th>Tolerance</th><th>Assigned</th><th>Resolution</th><th>Status</th></tr></thead><tbody>{exceptions.map((x) => <tr key={x.id} className="clickable" onClick={() => nav.go(`purchase/exceptions/${x.id}`)}><td>{x.type}</td><td>{x.itemName ?? 'Charges'}</td><td className="right money">{x.poValue !== undefined ? fmtMoney(x.poValue) : '—'}</td><td className="right money">{x.grnValue !== undefined ? fmtMoney(x.grnValue) : '—'}</td><td className="right money">{fmtMoney(x.invoiceValue)}</td><td className="right money" style={{ color: 'var(--danger)' }}>{fmtMoney(x.variance)} ({x.variancePct}%)</td><td>{x.tolerance}</td><td>{x.assignedToName ?? '—'}</td><td style={{ fontSize: 12 }}>{x.resolution ?? '—'}</td><td><Badge status={x.status} /></td></tr>)}</tbody></table></div>}
            </div>) },
          { id: 'payments', label: `Payments (${payments.length + debitNotes.length})`, content: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {openItem && <div className="card" style={{ overflow: 'hidden' }}><div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontWeight: 600, fontSize: 13 }}>Settlements on {openItem.docNumber}</div>{openItem.settlements.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>No settlements yet.</div> : <table className="data-table dense"><thead><tr><th>Date</th><th>Document</th><th className="right">Amount</th><th className="right">FX gain/loss</th></tr></thead><tbody>{openItem.settlements.map((st) => <tr key={st.id} className="clickable" onClick={() => nav.go(st.docType === 'Payment' ? `purchase/payments/${st.docId}` : `purchase/debit-notes/${st.docId}`)}><td>{fmtDate(st.date)}</td><td className="identifier link">{st.docNumber} <span style={{ color: 'var(--ink-3)' }}>· {st.docType}</span></td><td className="right money">{fmtMoney(st.amount, v.currency)}</td><td className="right money">{st.fxGainLoss ? fmtMoney(st.fxGainLoss) : '—'}</td></tr>)}</tbody></table>}</div>}
              {!openItem && <EmptyState compact title="Not posted" description="Open items and settlements appear after posting." />}
            </div>) },
          { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={v.journalId} projected={projected} currency={s.currency} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={v.id} correlationId={v.correlationId} /> },
          { id: 'print', label: 'Print', content: <div><div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Button variant="primary" onClick={() => window.print()}>Print / Save PDF</Button></div><PrintSheet doc={v} title="Purchase invoice (booking copy)" partyLabel="Supplier" extraHeader={<div>Supplier inv. {v.supplierInvoiceNumber} · {fmtDate(v.supplierInvoiceDate)}</div>} /></div> },
        ]}
        footer={<>
          <div style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>{v.status === 'Posted' ? `Posted ${fmtDate(v.postedAt)} · ${v.journalNumber}` : block ?? ''}</div>
          {(v.status === 'Draft' || v.status === 'Submitted') && <Button onClick={() => nav.go(`purchase/vendor-invoices/${id}/edit`)}>Edit</Button>}
          {v.status === 'Draft' && <Button variant="primary" onClick={() => run(() => { const r = A.submitVendorInvoice(v); if (r.result.status === 'Exception') throw new Error(`${r.result.exceptions.length} exception(s) raised — resolve in the workbench`); }, 'Submitted and matched')}>Submit &amp; match</Button>}
          {v.status === 'Submitted' && <Button onClick={() => run(() => { const r = A.submitVendorInvoice(v); if (r.result.status === 'Exception') throw new Error(`${r.result.exceptions.length} exception(s) still open`); }, 'Re-matched')}>Re-run matching</Button>}
          {(v.status === 'Approved' || (v.status === 'Submitted' && !block)) && <Button variant="primary" tone="good" disabled={!!block || !canPost} reason={block ?? (!canPost ? 'Requires purchase.invoice.post' : undefined)} onClick={() => confirm.open({ title: `Post ${v.supplierInvoiceNumber}?`, statement: `${v.partyName} · ${fmtMoney(v.totals.total, v.currency)} due ${fmtDate(v.dueDate)}`, consequences: [{ engine: 'Numbering', text: 'Vendor invoice number is allocated' }, { engine: 'Journal', text: `Dr ${v.grnIds.length ? 'AP accrual reversal' : 'expense / inventory'} + input tax · Cr AP control (${v.partyName})${v.totals.tds ? ` · Cr TDS payable ${fmtMoney(v.totals.tds, v.currency)}` : ''}` }, { engine: 'Open items', text: `Payable of ${fmtMoney(v.totals.total, v.currency)} opens for ${v.partyName}` }, ...(v.poId ? [{ engine: 'Stock', text: 'PO / GRN invoiced quantities update' }] : []), ...(openEx.length && !A.purchaseSettings().blockOnException ? [{ engine: 'Workflow', text: `${openEx.length} exception(s) remain open (policy: warn)`, tone: 'warning' as const }] : [])], confirmLabel: 'Post invoice', cancelLabel: 'Keep unposted', onConfirm: () => { const out = A.postVendorInvoice(id); toast.success(`${out.number} posted`); } })}>Post invoice</Button>}
          {v.status === 'Posted' && outstanding > 0 && <Button variant="primary" onClick={() => nav.go(`purchase/payments/new?supplier=${v.partyId}&items=${openItem?.id ?? ''}`)}>Record payment</Button>}
          {v.status === 'Posted' && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Create debit note', onClick: () => nav.go(`purchase/debit-notes/new?invoice=${id}`) }, { label: 'Add to payment proposal', onClick: () => nav.go(`purchase/ageing?select=${openItem?.id ?? ''}`), disabled: outstanding <= 0, reason: outstanding <= 0 ? 'Fully settled' : undefined }, { label: 'Print', onClick: () => setTab('print') }, { label: 'Reverse invoice', danger: true, disabled: !!openItem?.settlements.length, reason: openItem?.settlements.length ? 'Has settlements — reverse them first' : undefined, onClick: () => confirm.open({ title: `Reverse ${v.number}?`, statement: 'A linked reversal journal is posted; the payable is closed and PO / GRN invoiced quantities are restored.', consequences: [{ engine: 'Journal', text: `Reversal of ${v.journalNumber}`, tone: 'warning' }, { engine: 'Open items', text: 'Payable closed', tone: 'warning' }], reasonRequired: true, confirmLabel: 'Reverse invoice', cancelLabel: 'Keep invoice', danger: true, onConfirm: (r) => { A.reverseVendorInvoice(id, r); toast.success('Invoice reversed'); } }) }]} />}
          {(v.status === 'Draft' || v.status === 'Submitted' || v.status === 'Approved') && <Button variant="ghost" onClick={() => confirm.open({ title: 'Cancel this invoice?', reasonRequired: true, confirmLabel: 'Cancel invoice', cancelLabel: 'Keep invoice', danger: true, onConfirm: (r) => A.cancelVendorInvoice(id, r) })}>Cancel</Button>}
        </>}
      />
      {confirm.dialog}
    </>
  );
}
