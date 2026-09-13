// Receipt form (FR-AR-001..003): method, bank/cash account, charges, TDS, allocation grid.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../../store';
import type { Account, Customer, OpenItem } from '../../../store';
import { Drawer, Button, Banner, DateField, TextField, SelectField, MoneyField, NumberField, TextArea, EntityPicker, useCustomerOptions, useToast, Badge, SummaryBlock, Explain } from '../../../components/ui';
import { fmtDate, fmtMoney, round, today, daysBetween } from '../../../lib/format';
import type { Receipt, ReceiptAllocation } from '../types';
import { RECEIPT_METHODS } from '../types';
import { newReceipt, saveReceipt, postReceipt, validateReceipt, customerOpenInvoices, receiptJournalLines } from '../actions';

export default function ReceiptDrawer({ open, onClose, customerId, invoiceId, receiptId, onPosted }: { open: boolean; onClose: () => void; customerId?: string; invoiceId?: string; receiptId?: string; onPosted?: (r: Receipt) => void }) {
  const s = useSession();
  const toast = useToast();
  const custOpts = useCustomerOptions();
  const openItems = useCollection<OpenItem>(C.openItems);
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.status === 'Active' && a.postingAllowed && (a.controlType === 'Bank' || a.controlType === 'Cash'));
  const [r, setR] = useState<Receipt>(() => receiptId && db.find<Receipt>(C.receipts, receiptId) ? db.find<Receipt>(C.receipts, receiptId)! : newReceipt({ partyId: customerId }));
  const [net, setNet] = useState<number>(r.amount - r.charges - r.tds);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<string[]>([]);
  const cust = db.find<Customer>(C.customers, r.partyId);
  const invoices = useMemo(() => (r.partyId ? customerOpenInvoices(r.partyId).filter((o) => o.currency === r.currency) : []), [r.partyId, r.currency, openItems]);
  const allocated = round(r.allocations.reduce((a, x) => a + x.amount, 0));
  const unapplied = round(r.amount - allocated);
  const base = s.currency;

  // customer → currency / rate / initial allocation
  const pickCustomer = (id?: string) => {
    const c = db.find<Customer>(C.customers, id);
    const currency = c?.currency ?? base;
    const fx = currency === base ? { rate: 1, type: 'Same', source: '—' } : engine.resolveRate(currency, base, r.date);
    setR((p) => ({ ...p, partyId: id, partyName: c?.name, partySnapshot: id ? engine.partySnapshotFor('Customer', id) : undefined, currency, rate: fx.rate || 1, rateType: fx.type, rateSource: fx.source, allocations: [] }));
  };
  useEffect(() => { if (!receiptId && customerId) pickCustomer(customerId); }, [customerId]);
  useEffect(() => {
    if (!invoiceId || receiptId) return;
    const oi = db.findBy<OpenItem>(C.openItems, (o) => o.docId === invoiceId && o.direction === 'Debit' && o.outstanding > 0);
    if (oi) { setR((p) => ({ ...p, amount: oi.outstanding, allocations: [{ openItemId: oi.id, docId: oi.docId, docNumber: oi.docNumber, amount: oi.outstanding }] })); setNet(oi.outstanding); }
  }, [invoiceId]);
  useEffect(() => { setR((p) => ({ ...p, amount: round(net + (p.charges || 0) + (p.tds || 0)) })); }, [net, r.charges, r.tds]);

  const setAlloc = (oi: OpenItem, amount: number) => {
    const amt = round(Math.max(0, Math.min(amount, oi.outstanding)));
    setR((p) => ({ ...p, allocations: amt > 0 ? [...p.allocations.filter((a) => a.openItemId !== oi.id), { openItemId: oi.id, docId: oi.docId, docNumber: oi.docNumber, amount: amt }] : p.allocations.filter((a) => a.openItemId !== oi.id) }));
  };
  const autoAllocate = () => {
    let left = r.amount;
    const out: ReceiptAllocation[] = [];
    invoices.slice().sort((a, b) => a.dueDate.localeCompare(b.dueDate)).forEach((oi) => { if (left <= 0) return; const amt = round(Math.min(left, oi.outstanding)); if (amt > 0) { out.push({ openItemId: oi.id, docId: oi.docId, docNumber: oi.docNumber, amount: amt }); left = round(left - amt); } });
    setR((p) => ({ ...p, allocations: out }));
  };
  const clearAlloc = () => setR((p) => ({ ...p, allocations: [] }));

  const save = (post: boolean) => {
    if (busy) return;
    const e = validateReceipt(r);
    setErrs(e);
    if (e.length) return;
    setBusy(true);
    try {
      const saved = saveReceipt(r);
      if (post) {
        const out = postReceipt(saved.id);
        toast.success(`Receipt ${out.number} posted · ${fmtMoney(out.amount, out.currency)}`, { label: 'Open', path: `sales/receipts/${out.id}` });
        onPosted?.(out);
      } else {
        toast.success('Receipt saved as draft');
        onClose();
      }
    } catch (ex: any) { toast.error(ex.message); } finally { setBusy(false); }
  };

  const projected = useMemo(() => { try { return receiptJournalLines({ ...r, unapplied }); } catch { return []; } }, [r, unapplied]);
  const needsRef = ['Cheque', 'NEFT', 'RTGS', 'IMPS', 'UPI', 'Gateway'].includes(r.method);

  return (
    <Drawer open={open} onClose={onClose} title={receiptId ? `Receipt ${r.number}` : 'Record receipt'} subtitle={cust ? `${cust.name} · ${cust.paymentTerms} · exposure ${fmtMoney(engine.partyOutstanding('Customer', cust.id).outstanding)}` : 'Money received from a customer'} width={860}
      footer={<><Button variant="ghost" onClick={onClose}>Discard</Button><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={() => save(false)} disabled={busy}>Save draft</Button><Button variant="primary" onClick={() => save(true)} loading={busy} disabled={!s.can('sales.receipt.post') && !s.can('sales.receipt.*') && !s.can('sales.receipt.create')} reason="Requires sales.receipt.post" data-testid="post-receipt">Post receipt</Button></div></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {errs.length > 0 && <Banner tone="danger"><ul style={{ margin: 0, paddingLeft: 18 }}>{errs.map((x) => <li key={x}>{x}</li>)}</ul></Banner>}
        <div className="grid-3">
          <EntityPicker label="Customer" required value={r.partyId} onChange={(id) => pickCustomer(id)} options={custOpts} recentKey="customers" style={{ gridColumn: 'span 2' }} disabled={!!invoiceId} />
          <DateField label="Receipt date" required value={r.date} onChange={(v) => setR((p) => ({ ...p, date: v, period: v.slice(0, 7) }))} checkPeriod />
          <SelectField label="Method" value={r.method} onChange={(v) => setR((p) => ({ ...p, method: v as any }))} options={RECEIPT_METHODS} />
          <SelectField label="Deposit to" required value={r.bankAccountId} onChange={(v) => setR((p) => ({ ...p, bankAccountId: v }))} options={accounts.filter((a) => (r.method === 'Cash' ? a.controlType === 'Cash' : true)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }))} />
          <TextField label={r.method === 'Cheque' ? 'Cheque number' : 'Reference / UTR'} required={needsRef} value={r.reference ?? ''} onChange={(v) => setR((p) => ({ ...p, reference: v }))} placeholder={r.method === 'UPI' ? 'UPI/…' : r.method === 'Cheque' ? '184512' : 'NEFT/…'} />
          {r.method === 'Cheque' && <><DateField label="Cheque date" value={r.chequeDate} onChange={(v) => setR((p) => ({ ...p, chequeDate: v }))} /><TextField label="Drawn on bank" value={r.chequeBank ?? ''} onChange={(v) => setR((p) => ({ ...p, chequeBank: v }))} /></>}
          {r.currency !== base && <NumberField label={`Rate (1 ${r.currency} = ? ${base})`} value={r.rate} onChange={(v) => setR((p) => ({ ...p, rate: v, rateType: 'Manual' }))} decimals={4} help={<span>{r.rateType} · {r.rateSource} · realized FX gain/loss posts automatically on allocation <Explain title="Realized FX" rows={[{ k: 'Invoice rate', v: invoices[0] ? String(invoices[0].rate) : '—' }, { k: 'Receipt rate', v: String(r.rate) }]} /></span>} />}
        </div>
        <div className="grid-3">
          <MoneyField label="Amount received (net to bank)" required value={net} onChange={setNet} currency={r.currency} baseEquivalent={r.currency !== base ? { amount: round(net * (r.rate || 1)), currency: base, rate: r.rate } : undefined} />
          <MoneyField label="Bank charges" value={r.charges} onChange={(v) => setR((p) => ({ ...p, charges: v }))} currency={r.currency} help="Dr 5400 Bank charges" />
          <MoneyField label="TDS deducted by customer" value={r.tds} onChange={(v) => setR((p) => ({ ...p, tds: v }))} currency={r.currency} help="Dr 1410 TDS receivable" />
        </div>
        <SummaryBlock items={[{ label: 'Gross settled', value: fmtMoney(r.amount, r.currency) }, { label: 'Allocated', value: fmtMoney(allocated, r.currency), tone: 'good' }, { label: 'Unapplied → advance', value: fmtMoney(unapplied, r.currency), tone: unapplied > 0 ? 'warn' : undefined }, { label: 'Open invoices', value: invoices.length }]} />
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Allocation</div>
            <div style={{ display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" onClick={autoAllocate} disabled={!invoices.length || r.amount <= 0}>Auto-allocate oldest first</Button><Button size="sm" variant="ghost" onClick={clearAlloc} disabled={!r.allocations.length}>Clear</Button></div>
          </div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table dense">
              <thead><tr><th>Invoice</th><th>Date</th><th>Due</th><th className="right">Outstanding</th><th className="right" style={{ width: 160 }}>Allocate</th></tr></thead>
              <tbody>
                {invoices.map((oi) => {
                  const a = r.allocations.find((x) => x.openItemId === oi.id);
                  const od = daysBetween(oi.dueDate, today());
                  return (
                    <tr key={oi.id}>
                      <td><span className="link identifier" onClick={() => nav.go(`sales/invoices/${oi.docId}`)}>{oi.docNumber}</span></td>
                      <td>{fmtDate(oi.date)}</td>
                      <td>{fmtDate(oi.dueDate)} {od > 0 && <span className="badge badge-overdue">{od}d</span>}</td>
                      <td className="right money">{fmtMoney(oi.outstanding, oi.currency)}</td>
                      <td className="right"><NumberField size="grid" value={a?.amount ?? 0} onChange={(v) => setAlloc(oi, v)} decimals={2} min={0} max={oi.outstanding} /></td>
                    </tr>
                  );
                })}
                {invoices.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#5F6368', height: 56 }}>{r.partyId ? `No open ${r.currency} invoices — the full amount will be held as an advance` : 'Choose a customer to see open invoices'}</td></tr>}
              </tbody>
              {invoices.length > 0 && <tfoot><tr><td colSpan={3}>Allocated</td><td className="right money">{fmtMoney(invoices.reduce((x, o) => x + o.outstanding, 0), r.currency)}</td><td className="right money" style={{ fontWeight: 600, color: allocated > r.amount + 0.005 ? '#C0393F' : undefined }}>{fmtMoney(allocated, r.currency)}</td></tr></tfoot>}
            </table>
          </div>
          {unapplied > 0.005 && r.partyId && <div style={{ fontSize: 12, color: '#8A4B0F', marginTop: 6 }}>{fmtMoney(unapplied, r.currency)} will be recorded as an advance (Cr 2150 Advances from customers) and can be applied to future invoices.</div>}
        </div>
        <TextArea label="Notes" value={r.notes ?? ''} onChange={(v) => setR((p) => ({ ...p, notes: v }))} rows={2} />
        <div>
          <div className="section-title">Projected journal</div>
          <div className="card" style={{ overflow: 'hidden' }}>
            <table className="data-table dense"><thead><tr><th>Account</th><th className="right">Dr</th><th className="right">Cr</th></tr></thead><tbody>{projected.map((l, i) => { const a = db.find<Account>(C.accounts, l.accountId); return <tr key={i}><td><span className="identifier">{a?.code}</span> · {a?.name}{l.partyName ? <span style={{ color: '#5F6368' }}> · {l.partyName}</span> : null}</td><td className="right money">{l.dr ? fmtMoney(l.dr, r.currency) : '—'}</td><td className="right money">{l.cr ? fmtMoney(l.cr, r.currency) : '—'}</td></tr>; })}</tbody></table>
          </div>
        </div>
        {receiptId && <div><Badge status={r.status} /></div>}
      </div>
    </Drawer>
  );
}
