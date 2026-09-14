// Supplier payments (FR-PMT-001, FR-AP-001): register, form with open-item allocation / TDS / FX / advance, detail.
import { useEffect, useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { Account, OpenItem } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, TextField, TextArea, EntityPicker, SelectField, useSupplierOptions, NumberField, MoneyField, AccountingTab, ActivityTab, AttachmentsPanel, RailSection, useToast, Banner, EmptyState, PeriodBanner, SummaryBlock, ActionMenu, Money, PrintSheet, Pill } from '../../components/ui';
import { fmtDate, fmtMoney, daysBetween, today } from '../../lib/format';
import type { Payment, PaymentMethod } from './types';
import * as A from './actions';
import { useConfirm, StandardRail, DocLink } from './shared';

const METHODS: PaymentMethod[] = ['NEFT', 'RTGS', 'IMPS', 'Cheque', 'UPI', 'Cash'];

export function PaymentRegister() {
  const rows = useCollection<Payment>(C.payments);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const paid = mine.filter((r) => r.status === 'Completed').reduce((x, r) => x + r.netAmount * r.rate, 0);
  return (
    <RegisterPage<Payment> title="Supplier payments" subtitle={<>{mine.length} payments · <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(paid)}</span> paid · {s.company?.tradeName} · FY {s.state.fy}</>} entity="payments" rows={mine} searchKeys={['number', 'partyName', 'utr', 'batchNumber']}
      columns={[
        { key: 'number', label: 'Payment #', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link">{r.number}</span>} secondary={r.batchNumber ? `Batch ${r.batchNumber}` : undefined} /> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'partyName', label: 'Supplier', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.bankAccountName} /> },
        { key: 'method', label: 'Method', render: (r) => <span style={{ fontSize: 12 }}>{r.method}</span> },
        { key: 'utr', label: 'UTR / Ref', render: (r) => <span className="identifier" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{r.utr ?? '—'}</span> },
        { key: 'invoices', label: 'Invoices', align: 'right', value: (r) => r.allocations.length, render: (r) => r.allocations.length || (r.unappliedAmount ? 'Advance' : '—') },
        { key: 'gross', label: 'Gross', align: 'right', value: (r) => r.grossAmount, render: (r) => <Money value={r.grossAmount} currency={r.currency} /> },
        { key: 'tds', label: 'TDS', align: 'right', value: (r) => r.tdsAmount, render: (r) => r.tdsAmount ? <span className="money" style={{ color: 'var(--danger)' }}>{fmtMoney(r.tdsAmount, r.currency)}</span> : <span style={{ color: 'var(--ink-5)' }}>—</span> },
        { key: 'net', label: 'Net paid', align: 'right', sortable: true, value: (r) => r.netAmount, render: (r) => <Money value={r.netAmount} currency={r.currency} style={{ fontWeight: 600 }} />, total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.netAmount * r.rate, 0)) },
        { key: 'status', label: 'Status', sortable: true, render: (r) => <Badge status={r.status} /> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'completed', label: 'Completed', filter: (r) => r.status === 'Completed' }, { id: 'reversed', label: 'Reversed / failed', filter: (r) => r.status === 'Reversed' || r.status === 'Failed' }]}
      filters={[{ key: 'method', label: 'Method', type: 'select', options: METHODS.map((m) => ({ value: m, label: m })) }, { key: 'date', label: 'Date', type: 'date-range' }]} applyFilter={(r, v) => (!v.method || r.method === v.method) && (!v.dateFrom || r.date >= v.dateFrom) && (!v.dateTo || r.date <= v.dateTo)}
      actions={<Button onClick={() => nav.go('purchase/ageing')}>Create batch from ageing</Button>}
      primaryAction={{ label: 'New payment', onClick: () => nav.go('purchase/payments/new'), disabled: !s.can('purchase.payment.create'), reason: !s.can('purchase.payment.create') ? 'Requires purchase.payment.create' : undefined }} onRowClick={(r) => nav.go(`purchase/payments/${r.id}`)}
      rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/payments/${r.id}`) }, ...(r.status === 'Draft' ? [{ label: 'Continue', onClick: () => nav.go(`purchase/payments/${r.id}`) }] : [])]} />
  );
}

export function PaymentForm({ supplierId, openItemIds, existing }: { supplierId?: string; openItemIds?: string[]; existing?: Payment }) {
  const s = useSession();
  const toast = useToast();
  const [p, setP] = useState<Payment>(() => existing ? A.computePayment(existing) : A.newPayment(supplierId, { openItemIds }));
  const [err, setErr] = useState<string | null>(null);
  const suppliers = useSupplierOptions();
  const banks = A.bankAccounts();
  const items = useCollection<OpenItem>(C.openItems);
  const open = useMemo(() => A.supplierOpenItems(p.partyId), [items, p.partyId]);
  const set = (patch: Partial<Payment>) => setP((d) => A.computePayment({ ...d, ...patch }));
  useEffect(() => { if (!existing && supplierId && !p.partyId) setP(A.computePayment(A.newPayment(supplierId, { openItemIds }))); }, [supplierId]);
  const alloc = (o: OpenItem) => p.allocations.find((a) => a.openItemId === o.id);
  const setAlloc = (o: OpenItem, amount: number | null) => set({ allocations: amount === null || amount <= 0 ? p.allocations.filter((a) => a.openItemId !== o.id) : alloc(o) ? p.allocations.map((a) => (a.openItemId === o.id ? { ...a, amount: Math.min(amount, o.outstanding) } : a)) : [...p.allocations, A.allocationFor(o, Math.min(amount, o.outstanding))] });
  const bank = db.find<Account>(C.accounts, p.bankAccountId);
  const post = () => { try { const out = A.postPayment(p); toast.success(`${out.number} posted · ${fmtMoney(out.netAmount, out.currency)} from ${out.bankAccountName}`); nav.go(`purchase/payments/${out.id}`); } catch (e: any) { setErr(e.message); } };
  const saveDraft = () => { try { const out = A.savePaymentDraft(p); toast.success('Draft saved'); nav.go(`purchase/payments/${out.id}`); } catch (e: any) { setErr(e.message); } };
  const projected = useMemo(() => { try { return p.partyId ? A.paymentJournalLines(p) : []; } catch { return []; } }, [p]);
  const tds = A.tdsFor(p.partyId);
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.back('purchase/payments')}>← Payments</button><h1 className="page-title">{existing ? `Payment ${existing.number}` : 'New supplier payment'}</h1><div className="page-subtitle">Allocate open items, apply advances / debit notes, withhold TDS where the section basis is payment · number allocated on post</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" onClick={() => nav.back('purchase/payments')}>Discard</Button><Button onClick={saveDraft}>Save draft</Button><Button variant="primary" tone="good" onClick={post}>Post payment</Button></div>
      </div>
      <PeriodBanner date={p.date} />
      {err && <Banner tone="danger" onDismiss={() => setErr(null)}>{err}</Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <EntityPicker label="Supplier" required value={p.partyId} onChange={(sid) => setP(A.computePayment(A.newPayment(sid, { method: p.method, bankAccountId: p.bankAccountId })))} options={suppliers} recentKey="suppliers" style={{ gridColumn: 'span 2' }} help={tds.section ? `TDS ${tds.section.section} ${tds.section.rate}% · basis ${tds.section.basis}${tds.atPayment ? ' — withheld here' : ' — already deducted at invoice'}` : undefined} />
        <DateField label="Payment date" required value={p.date} onChange={(v) => set({ date: v })} checkPeriod />
        <SelectField label="Bank / cash account" required value={p.bankAccountId} onChange={(v) => set({ bankAccountId: v, bankAccountName: db.find<Account>(C.accounts, v)?.name ?? '' })} options={banks.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}${b.fixedCurrency ? ' (' + b.fixedCurrency + ')' : ''}` }))} help={bank?.fixedCurrency && bank.fixedCurrency !== p.currency ? `Currency mismatch: ${bank.fixedCurrency} account` : undefined} />
        <SelectField label="Method" required value={p.method} onChange={(v) => set({ method: v as PaymentMethod })} options={METHODS} />
        <TextField label={p.method === 'Cheque' ? 'Cheque number' : p.method === 'Cash' ? 'Voucher ref' : 'UTR / transaction ref'} value={p.utr} onChange={(v) => set({ utr: v })} placeholder={p.method === 'Cheque' ? 'CHQ 000000' : 'UTR/000000/00000'} />
        {p.method === 'Cheque' && <DateField label="Instrument date" value={p.instrumentDate} onChange={(v) => set({ instrumentDate: v })} />}
        <TextField label="Currency" value={p.currency} onChange={() => {}} disabled help={p.currency !== s.currency ? `Settlement rate ${p.rate} (${p.rateType ?? 'Spot'}) — realized FX is posted on settlement` : 'Base currency'} />
        {p.currency !== s.currency && <NumberField label="Settlement rate" value={p.rate} onChange={(v) => set({ rate: v, rateType: 'Manual' })} decimals={4} min={0} />}
        <MoneyField label="Bank charges" value={p.chargesAmount} onChange={(v) => set({ chargesAmount: v })} currency={p.currency} help="Debited to bank charges, added to the bank outflow" />
        <MoneyField label="Advance / unapplied" value={p.unappliedAmount} onChange={(v) => set({ unappliedAmount: v })} currency={p.currency} help="Creates a supplier advance (1450) usable on later invoices" />
        <TextArea label="Notes" value={p.notes} onChange={(v) => set({ notes: v })} rows={1} style={{ gridColumn: 'span 4' }} />
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 13 }}>Open items · {p.partyName ?? 'choose a supplier'}</span><div style={{ display: 'flex', gap: 8 }}><Button size="sm" onClick={() => set({ allocations: open.filter((o) => o.direction === 'Debit').map((o) => A.allocationFor(o, o.outstanding)) })} disabled={!open.length}>Allocate all invoices</Button><Button size="sm" variant="ghost" onClick={() => set({ allocations: [] })}>Clear</Button></div></div>
        {!p.partyId ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>Choose a supplier to see payable invoices, debit notes and advances.</div> : open.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>No open items — enter an advance amount to pay on account.</div> : (
          <table className="data-table dense">
            <thead><tr><th style={{ width: 36 }} /><th>Document</th><th>Type</th><th>Date</th><th>Due</th><th className="right">Original</th><th className="right">Outstanding</th><th className="right" style={{ width: 160 }}>Allocate</th><th className="right">TDS</th></tr></thead>
            <tbody>{open.map((o) => { const a = alloc(o); const od = o.direction === 'Debit' ? daysBetween(o.dueDate, today()) : 0; return (
              <tr key={o.id} className={a ? 'selected' : ''}>
                <td><input type="checkbox" className="checkbox" checked={!!a} onChange={(e) => setAlloc(o, e.target.checked ? o.outstanding : null)} /></td>
                <td><DocLink path={o.docType === 'Vendor Invoice' ? `purchase/vendor-invoices/${o.docId}` : o.docType === 'Debit Note' ? `purchase/debit-notes/${o.docId}` : `purchase/payments/${o.docId}`} number={o.docNumber} /></td>
                <td>{o.direction === 'Debit' ? <span style={{ fontSize: 12 }}>Invoice</span> : <Pill tone="good">{o.docType === 'Payment' ? 'Advance' : 'Debit note'} credit</Pill>}</td>
                <td>{fmtDate(o.date)}</td><td>{o.direction === 'Debit' ? <span style={{ fontSize: 12, color: od > 0 ? 'var(--danger)' : undefined }}>{fmtDate(o.dueDate)}{od > 0 ? ` · ${od} d overdue` : ''}</span> : '—'}</td>
                <td className="right money">{fmtMoney(o.originalAmount, o.currency)}</td><td className="right money">{o.direction === 'Credit' ? '−' : ''}{fmtMoney(o.outstanding, o.currency)}</td>
                <td><NumberField size="grid" value={a?.amount ?? 0} onChange={(v) => setAlloc(o, v)} decimals={2} min={0} max={o.outstanding} /></td>
                <td className="right money" style={{ color: 'var(--danger)' }}>{a?.tds ? fmtMoney(a.tds, p.currency) : '—'}</td>
              </tr>); })}</tbody>
          </table>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 380px', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}><div className="section-title">Projected journal</div><AccountingTab projected={projected} currency={s.currency} title=" " /></div>
        <div className="card" style={{ padding: 16 }}>
          <SummaryBlock style={{ flexDirection: 'column', gap: 10 }} items={[{ label: 'Invoices allocated', value: fmtMoney(p.allocations.filter((a) => db.find<OpenItem>(C.openItems, a.openItemId)?.direction === 'Debit').reduce((x, a) => x + a.amount, 0), p.currency) }, { label: 'Credits applied', value: '−' + fmtMoney(p.allocations.filter((a) => db.find<OpenItem>(C.openItems, a.openItemId)?.direction === 'Credit').reduce((x, a) => x + a.amount, 0), p.currency), tone: 'good' }, { label: 'Advance', value: fmtMoney(p.unappliedAmount, p.currency) }, { label: 'TDS withheld', value: '−' + fmtMoney(p.tdsAmount, p.currency), tone: p.tdsAmount ? 'warn' : undefined }, { label: 'Bank charges', value: '+' + fmtMoney(p.chargesAmount, p.currency) }, { label: 'Net from bank', value: fmtMoney(p.netAmount, p.currency), tone: p.netAmount < 0 ? 'danger' : undefined }]} />
          {p.currency !== s.currency && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 8 }}>≈ {fmtMoney(p.netAmount * p.rate, s.currency)} @ {p.rate}</div>}
        </div>
      </div>
      <div className="card" style={{ padding: 16 }}><div className="section-title">Attachments</div><AttachmentsPanel objectType="Payment" objectId={p.id} /></div>
    </div>
  );
}

export function PaymentDetail({ id }: { id: string }) {
  const p = useRecord<Payment>(C.payments, id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('allocations');
  if (!p) return <EmptyState title="Payment not found" action={<Button onClick={() => nav.go('purchase/payments')}>Back</Button>} />;
  if (p.status === 'Draft') return <PaymentForm existing={p} />;
  const printDoc = { ...p, lines: p.allocations.map((a) => ({ id: a.id, itemName: `${a.docType} ${a.docNumber}`, qty: 1, uom: '', rate: a.amount, discountPct: 0, discountAmt: 0, taxable: a.amount, taxRate: 0, taxAmt: 0, taxComponents: {}, amount: a.amount })), totals: { ...p.totals, subtotal: p.grossAmount, taxable: p.grossAmount, total: p.netAmount, breakup: [] } };
  return (
    <>
      <DocumentPage backLabel="Payments" onBack={() => nav.go('purchase/payments')} number={p.number} activeTab={tab} onTab={setTab} badges={<><Badge status={p.status} /><Pill tone="neutral">{p.method}</Pill>{p.batchNumber && <Badge status="Completed">Batch {p.batchNumber}</Badge>}</>} amount={{ label: 'Net paid', value: p.netAmount, currency: p.currency, base: p.netAmount * p.rate, baseCurrency: s.currency, rate: p.rate }}
        rail={<StandardRail doc={p} facts={[{ k: 'Bank / cash', v: p.bankAccountName }, { k: 'UTR / ref', v: <span className="identifier">{p.utr ?? '—'}</span> }, { k: 'Gross', v: fmtMoney(p.grossAmount, p.currency) }, { k: 'TDS', v: fmtMoney(p.tdsAmount, p.currency) }, { k: 'Charges', v: fmtMoney(p.chargesAmount, p.currency) }, ...(p.unappliedAmount ? [{ k: 'Advance', v: fmtMoney(p.unappliedAmount, p.currency) }] : []), ...(p.fxGainLoss ? [{ k: 'Realized FX', v: fmtMoney(p.fxGainLoss) }] : []), ...(p.batchNumber ? [{ k: 'Batch', v: <DocLink path={`purchase/batches/${p.batchId}`} number={p.batchNumber} /> }] : [])]}><RailSection label="Attachments"><AttachmentsPanel objectType="Payment" objectId={p.id} readOnly /></RailSection></StandardRail>}
        tabs={[
          { id: 'allocations', label: 'Allocations', content: <div className="card" style={{ overflow: 'hidden' }}>{p.allocations.length === 0 ? <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-3)' }}>Advance payment — no invoices allocated.</div> : <table className="data-table dense"><thead><tr><th>Document</th><th>Type</th><th className="right">Outstanding before</th><th className="right">Allocated</th><th className="right">TDS</th></tr></thead><tbody>{p.allocations.map((a) => <tr key={a.id}><td><DocLink path={a.docType === 'Vendor Invoice' ? `purchase/vendor-invoices/${a.docId}` : `purchase/debit-notes/${a.docId}`} number={a.docNumber} /></td><td>{a.docType}</td><td className="right money">{fmtMoney(a.outstanding, p.currency)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(a.amount, p.currency)}</td><td className="right money">{a.tds ? fmtMoney(a.tds, p.currency) : '—'}</td></tr>)}</tbody><tfoot><tr><td colSpan={3}>Total</td><td className="right money">{fmtMoney(p.grossAmount, p.currency)}</td><td className="right money">{fmtMoney(p.tdsAmount, p.currency)}</td></tr></tfoot></table>}</div> },
          { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={p.journalId} currency={s.currency} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={p.id} correlationId={p.correlationId} /> },
          { id: 'print', label: 'Voucher', content: <div><div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Button variant="primary" onClick={() => window.print()}>Print voucher</Button></div><PrintSheet doc={printDoc as any} title="Payment voucher" partyLabel="Paid to" extraHeader={<div>{p.method} {p.utr ?? ''} · {p.bankAccountName}</div>} /></div> },
        ]}
        footer={<><div style={{ flex: 1, fontSize: 12, color: 'var(--ink-3)' }}>{p.status === 'Completed' ? `Posted ${fmtDate(p.postedAt)} · ${p.journalNumber}` : p.reversalReason ?? p.failureReason ?? ''}</div>{p.status === 'Completed' && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Print voucher', onClick: () => setTab('print') }, { label: 'Reverse payment', danger: true, onClick: () => confirm.open({ title: `Reverse ${p.number}?`, statement: 'Allocations are undone, invoices become outstanding again and a reversal journal is posted.', consequences: [{ engine: 'Journal', text: `Reversal of ${p.journalNumber}`, tone: 'warning' }, { engine: 'Open items', text: `${p.allocations.length} settlement(s) unwound` }], reasonRequired: true, confirmLabel: 'Reverse payment', cancelLabel: 'Keep payment', danger: true, onConfirm: (r) => { A.reversePayment(id, r); toast.success('Payment reversed'); } }) }]} />}</>} />
      {confirm.dialog}
    </>
  );
}
