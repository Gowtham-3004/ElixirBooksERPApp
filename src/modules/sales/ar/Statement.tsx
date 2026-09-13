// Customer statement (FR-AR-005): opening, invoices, receipts, credits, running balance, print.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession, engine } from '../../../store';
import type { Customer } from '../../../store';
import { Button, DateField, EmptyState, SummaryBlock, Badge, Modal, useToast, EntityPicker, useCustomerOptions } from '../../../components/ui';
import { fmtDate, fmtMoney, today, addDays, toCSV, downloadText, amountInWords } from '../../../lib/format';
import type { SalesInvoice, Receipt, CreditNote } from '../types';
import { emailDocument } from '../actions';

interface Line { date: string; type: string; number: string; ref?: string; debit: number; credit: number; balance: number; link: string; status?: string }

export function statementLines(customerId: string, from: string, to: string, companyId?: string) {
  const inv = db.where<SalesInvoice>(C.salesInvoices, (i) => i.partyId === customerId && (!i.companyId || i.companyId === companyId) && (i.status === 'Posted' || i.status === 'Settled' || i.status === 'Reversed') && !!i.postedAt);
  const rcpt = db.where<Receipt>(C.receipts, (r) => r.partyId === customerId && (!r.companyId || r.companyId === companyId) && r.status === 'Posted');
  const cn = db.where<CreditNote>(C.creditNotes, (c) => c.partyId === customerId && (!c.companyId || c.companyId === companyId) && c.status === 'Posted');
  const pos = db.where<any>(C.posBills, (b) => b.partyId === customerId && b.status === 'Posted' && b.onCredit);
  const wo = db.where<any>(C.journals, (j) => j.sourceType === 'Write-off' && j.status === 'Posted' && j.lines.some((l: any) => l.partyId === customerId));
  const all: Omit<Line, 'balance'>[] = [
    ...inv.map((i) => ({ date: i.date, type: i.reversalOfId ? 'Invoice reversal' : 'Invoice', number: i.number, ref: i.reference, debit: i.totals.total > 0 ? i.totals.baseTotal || i.totals.total : 0, credit: i.totals.total < 0 ? -(i.totals.baseTotal || i.totals.total) : 0, link: `sales/invoices/${i.id}`, status: i.status })),
    ...rcpt.map((r) => ({ date: r.date, type: 'Receipt', number: r.number, ref: `${r.method}${r.reference ? ' · ' + r.reference : ''}`, debit: 0, credit: r.totals.baseTotal || r.amount, link: `sales/receipts/${r.id}` })),
    ...cn.map((c) => ({ date: c.date, type: 'Credit note', number: c.number, ref: `against ${c.invoiceNumber}`, debit: 0, credit: c.totals.baseTotal || c.totals.total, link: `sales/credit-notes/${c.id}` })),
    ...pos.map((b) => ({ date: b.date, type: 'POS bill (credit)', number: b.number, debit: b.totals.total, credit: 0, link: `pos/bills/${b.id}` })),
    ...wo.map((j) => ({ date: j.date, type: 'Write-off', number: j.number, debit: 0, credit: j.lines.filter((l: any) => l.partyId === customerId).reduce((a: number, l: any) => a + l.crBase, 0), link: `accounting/journals/${j.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
  const opening = all.filter((l) => l.date < from).reduce((s, l) => s + l.debit - l.credit, 0);
  let bal = opening;
  const lines: Line[] = all.filter((l) => l.date >= from && l.date <= to).map((l) => { bal = bal + l.debit - l.credit; return { ...l, balance: bal }; });
  return { opening, lines, closing: bal, debits: lines.reduce((s, l) => s + l.debit, 0), credits: lines.reduce((s, l) => s + l.credit, 0) };
}

export default function CustomerStatement({ customerId }: { customerId?: string }) {
  const s = useSession();
  const toast = useToast();
  const custOpts = useCustomerOptions();
  const [from, setFrom] = useState(addDays(today(), -90));
  const [to, setTo] = useState(today());
  const [print, setPrint] = useState(false);
  useCollection(C.salesInvoices); useCollection(C.receipts); useCollection(C.creditNotes); useCollection(C.openItems);
  const cust = db.find<Customer>(C.customers, customerId);
  const st = useMemo(() => (customerId ? statementLines(customerId, from, to, s.state.companyId) : null), [customerId, from, to, s.state.companyId]);
  const exposure = customerId ? engine.partyOutstanding('Customer', customerId) : null;
  if (!customerId || !cust) return <div className="page"><div className="page-header"><div><h1 className="page-title">Customer statement</h1><div className="page-subtitle">Choose a customer to see their account.</div></div></div><div style={{ maxWidth: 420 }}><EntityPicker value={undefined} onChange={(id) => id && nav.go(`sales/statements/${id}`)} options={custOpts} placeholder="Search customer…" autoFocus /></div></div>;
  const cur = s.currency;
  const email = () => { const to_ = cust.contacts.find((c) => c.isDefault)?.email ?? cust.email; if (!to_) { toast.error('Customer has no email'); return; } emailDocument(C.customers, { id: cust.id, number: `STMT-${cust.code}`, docType: 'Customer Statement', correlationId: 'stmt', companyId: cust.companyId } as any, to_, `Statement of account ${fmtDate(from)} – ${fmtDate(to)}`, `Closing balance ${fmtMoney(st!.closing, cur)}`); toast.success(`Statement emailed to ${to_}`); };
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: '#5F6368', marginBottom: 6 }} onClick={() => nav.go('sales/ageing')}>← AR ageing</button><h1 className="page-title">Statement · {cust.name}</h1><div className="page-subtitle">{cust.code} · {cust.gstin ?? cust.taxTreatment} · {cust.paymentTerms} · credit limit {fmtMoney(cust.creditLimit, cur)} · <span className="link" onClick={() => nav.go(`masters/customers/${cust.id}`)}>Open master</span></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <DateField label="From" value={from} onChange={setFrom} size="sm" /><DateField label="To" value={to} onChange={setTo} size="sm" max={today()} />
          <Button variant="secondary" onClick={() => nav.go('sales/collections', { customer: cust.id })}>Follow-up</Button>
          <Button variant="secondary" onClick={() => downloadText(`statement-${cust.code}-${from}-${to}.csv`, toCSV(st!.lines.map((l) => ({ date: l.date, type: l.type, number: l.number, ref: l.ref, debit: l.debit, credit: l.credit, balance: l.balance }))))}>CSV</Button>
          <Button variant="secondary" onClick={email}>Email</Button>
          <Button variant="primary" onClick={() => setPrint(true)}>Print statement</Button>
        </div>
      </div>
      <SummaryBlock items={[{ label: 'Opening balance', value: fmtMoney(st!.opening, cur) }, { label: 'Invoiced', value: fmtMoney(st!.debits, cur) }, { label: 'Received / credited', value: fmtMoney(st!.credits, cur), tone: 'good' }, { label: 'Closing balance', value: fmtMoney(st!.closing, cur), tone: st!.closing > 0 ? 'warn' : undefined }, { label: 'Overdue now', value: fmtMoney(exposure?.overdue ?? 0, cur), tone: exposure?.overdue ? 'danger' : undefined }, { label: 'Credit available', value: fmtMoney(Math.max(0, cust.creditLimit - (exposure?.outstanding ?? 0)), cur) }]} />
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table dense">
          <thead><tr><th>Date</th><th>Type</th><th>Number</th><th>Reference</th><th className="right">Debit</th><th className="right">Credit</th><th className="right">Balance</th></tr></thead>
          <tbody>
            <tr><td>{fmtDate(from)}</td><td colSpan={3}><em>Opening balance</em></td><td /><td /><td className="right money">{fmtMoney(st!.opening, cur)}</td></tr>
            {st!.lines.map((l, i) => <tr key={i} className="clickable" onClick={() => nav.go(l.link)}><td>{fmtDate(l.date)}</td><td>{l.type}{l.status === 'Reversed' ? <> <Badge status="Reversed" /></> : null}</td><td className="identifier link">{l.number}</td><td style={{ color: '#5F6368' }}>{l.ref ?? '—'}</td><td className="right money">{l.debit ? fmtMoney(l.debit, cur) : '—'}</td><td className="right money">{l.credit ? fmtMoney(l.credit, cur) : '—'}</td><td className="right money" style={{ fontWeight: 500 }}>{fmtMoney(l.balance, cur)}</td></tr>)}
            {st!.lines.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#5F6368', height: 56 }}>No transactions in this period</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={4}>Closing balance {fmtDate(to)}</td><td className="right money">{fmtMoney(st!.debits, cur)}</td><td className="right money">{fmtMoney(st!.credits, cur)}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(st!.closing, cur)}</td></tr></tfoot>
        </table>
      </div>
      <Modal open={print} onClose={() => setPrint(false)} title={`Statement · ${cust.name}`} width={880} footer={<><Button variant="secondary" onClick={() => setPrint(false)}>Close</Button><Button variant="primary" onClick={() => window.print()}>Print / Save as PDF</Button></>}>
        <div style={{ background: '#F3F5F5', padding: 16, maxHeight: '65vh', overflow: 'auto' }}>
          <div className="print-sheet">
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0A0A0A', paddingBottom: 12, marginBottom: 12 }}><div><div style={{ fontSize: 18, fontWeight: 700 }}>{s.company?.legalName}</div><div>{s.company?.address.line1}, {s.company?.address.city}</div></div><div style={{ textAlign: 'right' }}><div style={{ fontSize: 16, fontWeight: 700 }}>STATEMENT OF ACCOUNT</div><div>{fmtDate(from)} – {fmtDate(to)}</div></div></div>
            <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 10 }}>CUSTOMER</div><div>{cust.name}</div>{cust.gstin && <div>GSTIN {cust.gstin}</div>}</div>
            <table><thead><tr><th>Date</th><th>Type</th><th>Number</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead><tbody><tr><td>{fmtDate(from)}</td><td colSpan={2}>Opening balance</td><td /><td /><td style={{ textAlign: 'right' }}>{fmtMoney(st!.opening, cur)}</td></tr>{st!.lines.map((l, i) => <tr key={i}><td>{fmtDate(l.date)}</td><td>{l.type}</td><td>{l.number}</td><td style={{ textAlign: 'right' }}>{l.debit ? fmtMoney(l.debit, cur) : ''}</td><td style={{ textAlign: 'right' }}>{l.credit ? fmtMoney(l.credit, cur) : ''}</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.balance, cur)}</td></tr>)}</tbody></table>
            <div style={{ marginTop: 12, fontWeight: 700 }}>Closing balance: {fmtMoney(st!.closing, cur)} — {amountInWords(Math.abs(st!.closing), cur)}</div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export { EmptyState };
