// Supplier payments, payment batches (maker-checker + bank file) and AP ageing.
import { db, C, engine, ValidationError, IDS } from '../../store';
import type { Account, OpenItem, Supplier, TdsSection } from '../../store';
import { round, today, uid, addDays, ageingBucket, daysBetween, toCSV, downloadText } from '../../lib/format';
import type { Payment, PaymentAllocation, PaymentBatch, PaymentBatchLine, PaymentMethod } from './types';
import { supplierOf, tdsFor } from './actions';

const r2 = (n: number) => round(n);

// ── Open items & payments (FR-PMT-001, FR-AP-001) ──────────────────────────

export function supplierOpenItems(supplierId?: string): OpenItem[] {
  if (!supplierId) return [];
  return db.where<OpenItem>(C.openItems, (o) => o.partyType === 'Supplier' && o.partyId === supplierId && o.status !== 'Settled' && o.status !== 'Written Off' && o.outstanding > 0.005).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function bankAccounts(): Account[] {
  const cid = engine.ctx().companyId;
  return db.where<Account>(C.accounts, (a) => a.companyId === cid && a.status === 'Active' && (a.isBank || a.controlType === 'Cash' || a.controlType === 'Bank'));
}

export function newPayment(supplierId?: string, opts: { openItemIds?: string[]; method?: PaymentMethod; bankAccountId?: string } = {}): Payment {
  const c = engine.ctx();
  const sup = supplierOf(supplierId);
  const bank = db.find<Account>(C.accounts, opts.bankAccountId ?? c.company?.defaults.bankAccountId) ?? bankAccounts()[0];
  const base = engine.newDocHeader('Payment', { currency: sup?.currency ?? c.currency });
  const rateInfo = sup && sup.currency !== c.currency ? engine.resolveRate(sup.currency, c.currency, base.date) : undefined;
  const tds = tdsFor(sup?.id);
  const p: Payment = { ...base, docType: 'Payment', status: 'Draft', partyType: 'Supplier', partyId: sup?.id, partyName: sup?.name, partySnapshot: sup ? engine.partySnapshotFor('Supplier', sup.id) : undefined, rate: rateInfo?.rate || 1, rateType: rateInfo?.type, rateSource: rateInfo?.source, method: opts.method ?? 'NEFT', bankAccountId: bank?.id ?? '', bankAccountName: bank?.name ?? '', allocations: [], tdsSectionId: tds.atPayment ? tds.section?.id : undefined, tdsAmount: 0, chargesAmount: 0, chargesAccountId: IDS.accBankCharges, grossAmount: 0, netAmount: 0, unappliedAmount: 0, lines: [], dimensions: {} } as Payment;
  if (opts.openItemIds?.length) {
    p.allocations = supplierOpenItems(sup?.id).filter((o) => opts.openItemIds!.includes(o.id)).map((o) => allocationFor(o, o.outstanding));
  }
  return computePayment(p);
}

export function allocationFor(o: OpenItem, amount: number): PaymentAllocation {
  return { id: uid('al'), openItemId: o.id, docType: o.docType, docId: o.docId, docNumber: o.docNumber, outstanding: o.outstanding, amount: r2(amount), tds: 0 };
}

/** Signed allocation: invoices (+), advances / debit notes applied (−). */
function signedAmount(a: PaymentAllocation): number {
  const o = db.find<OpenItem>(C.openItems, a.openItemId);
  return o?.direction === 'Credit' ? -a.amount : a.amount;
}

export function computePayment(p: Payment): Payment {
  const sec = db.find<TdsSection>(C.tdsSections, p.tdsSectionId);
  const gross = r2(p.allocations.reduce((s, a) => s + signedAmount(a), 0) + (p.unappliedAmount || 0));
  let tds = 0;
  const allocations = p.allocations.map((a) => {
    const o = db.find<OpenItem>(C.openItems, a.openItemId);
    if (!sec || o?.direction !== 'Debit' || a.amount < sec.thresholdPerTxn) return { ...a, tds: 0 };
    const t = r2((a.amount * sec.rate) / 100);
    tds = r2(tds + t);
    return { ...a, tds: t };
  });
  const net = r2(gross - tds + (p.chargesAmount || 0));
  return { ...p, allocations, tdsAmount: tds, grossAmount: gross, netAmount: net, totals: { ...engine.emptyTotals(), subtotal: gross, taxable: gross, tds, charges: p.chargesAmount || 0, total: net, baseTotal: r2(net * p.rate), due: 0 } };
}

export function validatePayment(p: Payment): string[] {
  const errs: string[] = [];
  if (!p.partyId) errs.push('Choose a supplier');
  if (!p.bankAccountId) errs.push('Choose a bank / cash account');
  if (!p.date) errs.push('Date is required');
  if (p.allocations.length === 0 && !(p.unappliedAmount > 0)) errs.push('Allocate at least one open item or enter an advance amount');
  p.allocations.forEach((a) => { const o = db.find<OpenItem>(C.openItems, a.openItemId); if (!o) errs.push(`${a.docNumber}: open item no longer exists`); else if (a.amount <= 0) errs.push(`${a.docNumber}: allocation must be positive`); else if (a.amount > o.outstanding + 0.005) errs.push(`${a.docNumber}: allocation ${a.amount} exceeds outstanding ${o.outstanding}`); });
  if (p.netAmount < 0) errs.push('Net payment cannot be negative — reduce credits applied');
  if (['NEFT', 'RTGS', 'IMPS', 'UPI'].includes(p.method) && !p.utr?.trim() && p.status !== 'Draft') errs.push('UTR / transaction reference is required');
  if (p.method === 'Cheque' && !p.utr?.trim()) errs.push('Cheque number is required');
  const bank = db.find<Account>(C.accounts, p.bankAccountId);
  if (bank?.fixedCurrency && bank.fixedCurrency !== p.currency) errs.push(`${bank.name} is a ${bank.fixedCurrency} account — payment currency is ${p.currency}`);
  if (p.rate <= 0) errs.push('Exchange rate missing');
  return errs;
}

export function savePaymentDraft(input: Payment): Payment {
  const p = computePayment(input);
  const existing = db.find<Payment>(C.payments, p.id);
  if (existing) return db.update<Payment>(C.payments, p.id, { ...p }, { expectedVersion: existing.version });
  return db.insert<Payment>(C.payments, { ...p, number: 'PMT/DRAFT' });
}

export function paymentJournalLines(p: Payment): engine.PostLine[] {
  const c = engine.ctx();
  const ap = c.company?.defaults.payableAccountId ?? IDS.accAP;
  const party = { partyType: 'Supplier' as const, partyId: p.partyId, partyName: p.partyName };
  const lines: engine.PostLine[] = [];
  let apDr = 0; let advanceApplied = 0;
  p.allocations.forEach((a) => {
    const o = db.find<OpenItem>(C.openItems, a.openItemId);
    if (!o) return;
    if (o.direction === 'Debit') apDr = r2(apDr + a.amount);
    else if (o.docType === 'Payment') advanceApplied = r2(advanceApplied + a.amount);
    else apDr = r2(apDr - a.amount); // debit note credit already reduced AP
  });
  if (apDr) lines.push({ accountId: ap, dr: apDr, ...party, narration: p.allocations.map((a) => a.docNumber).join(', ') });
  if (advanceApplied) lines.push({ accountId: IDS.accAdvanceSupplier, cr: advanceApplied, ...party, narration: 'Advance applied' });
  if (p.unappliedAmount) lines.push({ accountId: IDS.accAdvanceSupplier, dr: p.unappliedAmount, ...party, narration: 'Advance to supplier' });
  if (p.chargesAmount) lines.push({ accountId: p.chargesAccountId ?? IDS.accBankCharges, dr: p.chargesAmount, narration: 'Bank charges' });
  if (p.tdsAmount) { const sec = db.find<TdsSection>(C.tdsSections, p.tdsSectionId); lines.push({ accountId: sec?.accountId ?? IDS.accTDSPayable, cr: p.tdsAmount, ...party, narration: sec ? `TDS ${sec.section} at payment` : 'TDS' }); }
  lines.push({ accountId: p.bankAccountId, cr: p.netAmount, narration: `${p.method}${p.utr ? ' ' + p.utr : ''}` });
  return lines;
}

export function postPayment(input: Payment, opts: { batchId?: string; batchNumber?: string } = {}): Payment {
  const p = computePayment({ ...input, status: 'Pending Approval' });
  const errs = validatePayment(p);
  if (errs.length) throw new ValidationError(errs.join(' · '), 'VALIDATION');
  return db.transaction(() => {
    engine.assertPostable(p.date);
    const c = engine.ctx();
    const number = engine.allocateNumber('Payment', { date: p.date, branchId: p.branchId });
    const saved = db.find<Payment>(C.payments, p.id) ? db.update<Payment>(C.payments, p.id, { ...p, number }) : db.insert<Payment>(C.payments, { ...p, number });
    const j = engine.postJournal({ date: p.date, branchId: p.branchId, currency: p.currency, rate: p.rate, sourceType: 'Payment', sourceId: saved.id, sourceNumber: number, narration: `Payment ${number} · ${p.partyName} · ${p.method}${p.utr ? ' ' + p.utr : ''}`, idempotencyKey: `${saved.id}:post`, lines: paymentJournalLines(p) });
    let fx = 0;
    p.allocations.forEach((a) => { const r = engine.settleOpenItem(a.openItemId, { amount: a.amount, docType: 'Payment', docId: saved.id, docNumber: number, date: p.date, rate: p.rate }); fx = r2(fx + r.fxGainLoss); });
    let advanceOpenItemId: string | undefined;
    if (p.unappliedAmount > 0) { const oi = engine.createOpenItem({ partyType: 'Supplier', partyId: p.partyId!, partyName: p.partyName!, docType: 'Payment', docId: saved.id, docNumber: number, date: p.date, dueDate: p.date, currency: p.currency, originalAmount: p.unappliedAmount, baseAmount: r2(p.unappliedAmount * p.rate), rate: p.rate, direction: 'Credit', branchId: p.branchId, companyId: p.companyId }); advanceOpenItemId = oi.id; }
    // paid figure on invoices (display only)
    p.allocations.forEach((a) => { if (a.docType === 'Vendor Invoice') { const v = db.find<any>(C.vendorInvoices, a.docId); if (v) db.patchSilent<any>(C.vendorInvoices, v.id, { totals: { ...v.totals, paid: r2((v.totals.paid ?? 0) + a.amount), due: r2(v.totals.total - (v.totals.paid ?? 0) - a.amount - (v.totals.credited ?? 0)) } }); } });
    const out = db.update<Payment>(C.payments, saved.id, { status: 'Completed', number, journalId: j.id, journalNumber: j.number, advanceOpenItemId, fxGainLoss: fx, batchId: opts.batchId ?? p.batchId, batchNumber: opts.batchNumber ?? p.batchNumber, postedAt: new Date().toISOString(), postedBy: c.userName, period: p.date.slice(0, 7) });
    engine.audit({ action: 'payment.posted', objectType: 'Payment', objectId: out.id, objectNumber: number, detail: `${p.partyName} · net ${p.netAmount} · ${p.method}${fx ? ` · FX ${fx}` : ''}`, correlationId: p.correlationId });
    return out;
  });
}

export function reversePayment(id: string, reason: string): Payment {
  const p = db.find<Payment>(C.payments, id);
  if (!p) throw new ValidationError('Payment not found', 'NOT_FOUND');
  if (p.status !== 'Completed') throw new ValidationError(`Payment is ${p.status}`, 'INVALID_STATE');
  const adv = db.find<OpenItem>(C.openItems, p.advanceOpenItemId);
  if (adv && adv.settlements.length) throw new ValidationError('The advance from this payment has already been applied', 'INVALID_STATE');
  const cleared = db.findBy<any>(C.statementLines, (l) => (l.matchedJournalIds ?? []).includes(p.journalId) && l.status === 'Matched');
  if (cleared) throw new ValidationError('Payment is matched on a bank statement — unmatch it in reconciliation first', 'INVALID_STATE');
  return db.transaction(() => {
    const date = today();
    engine.assertPostable(date);
    if (p.journalId) engine.reverseJournal(p.journalId, { reason, date });
    p.allocations.forEach((a) => engine.unsettleOpenItem(a.openItemId, p.id));
    db.where<any>(C.journals, (j) => j.sourceType === 'FX Settlement' && j.sourceId === p.id && j.status === 'Posted').forEach((j) => engine.reverseJournal(j.id, { reason: `Reversal of ${p.number}`, date }));
    if (adv) db.update<OpenItem>(C.openItems, adv.id, { status: 'Settled', outstanding: 0, baseOutstanding: 0 });
    p.allocations.forEach((a) => { if (a.docType === 'Vendor Invoice') { const v = db.find<any>(C.vendorInvoices, a.docId); if (v) db.patchSilent<any>(C.vendorInvoices, v.id, { totals: { ...v.totals, paid: r2(Math.max(0, (v.totals.paid ?? 0) - a.amount)), due: r2(v.totals.due + a.amount) } }); } });
    if (p.batchId) { const b = db.find<PaymentBatch>(C.paymentBatches, p.batchId); if (b) db.update<PaymentBatch>(C.paymentBatches, b.id, { lines: b.lines.map((l) => (l.paymentId === p.id ? { ...l, status: 'Failed', error: `Reversed: ${reason}` } : l)), status: b.lines.every((l) => l.paymentId === p.id || l.status === 'Failed') ? 'Reversed' : 'Partially Completed' }); }
    const out = db.update<Payment>(C.payments, id, { status: 'Reversed', reversalReason: reason });
    engine.audit({ action: 'payment.reversed', objectType: 'Payment', objectId: id, objectNumber: p.number, detail: reason, correlationId: p.correlationId });
    return out;
  });
}

// ── AP ageing & payment proposal (FR-AP-001) ───────────────────────────────

export interface AgeingRow { supplierId: string; supplier: string; gstin?: string; current: number; d030: number; d3160: number; d6190: number; d90p: number; total: number; overdue: number; credits: number; items: OpenItem[] }

export function apAgeing(asAt = today()): AgeingRow[] {
  const cid = engine.ctx().companyId;
  const items = db.where<OpenItem>(C.openItems, (o) => o.companyId === cid && o.partyType === 'Supplier' && o.status !== 'Settled' && o.status !== 'Written Off' && o.date <= asAt && o.baseOutstanding > 0.005);
  const rows = new Map<string, AgeingRow>();
  items.forEach((o) => {
    const row = rows.get(o.partyId) ?? { supplierId: o.partyId, supplier: o.partyName, gstin: db.find<Supplier>(C.suppliers, o.partyId)?.gstin, current: 0, d030: 0, d3160: 0, d6190: 0, d90p: 0, total: 0, overdue: 0, credits: 0, items: [] };
    row.items.push(o);
    if (o.direction === 'Credit') { row.credits = r2(row.credits + o.baseOutstanding); row.total = r2(row.total - o.baseOutstanding); }
    else { const b = ageingBucket(o.dueDate, asAt); row[b] = r2(row[b] + o.baseOutstanding); row.total = r2(row.total + o.baseOutstanding); if (b !== 'current') row.overdue = r2(row.overdue + o.baseOutstanding); }
    rows.set(o.partyId, row);
  });
  return Array.from(rows.values()).sort((a, b) => b.total - a.total);
}

export function dueSchedule(asAt = today()) {
  const rows = apAgeing(asAt);
  const items = rows.flatMap((r) => r.items.filter((o) => o.direction === 'Debit'));
  const within = (d: number) => r2(items.filter((o) => daysBetween(asAt, o.dueDate) <= d && daysBetween(asAt, o.dueDate) > (d === 7 ? -100000 : d === 14 ? 7 : 14)).reduce((s, o) => s + o.baseOutstanding, 0));
  return { overdue: r2(items.filter((o) => o.dueDate < asAt).reduce((s, o) => s + o.baseOutstanding, 0)), next7: within(7), next14: within(14), next30: within(30), total: r2(items.reduce((s, o) => s + o.baseOutstanding, 0)) };
}

// ── Payment batches (FR-PMT-002/003) ───────────────────────────────────────

export function createPaymentProposal(input: { openItemIds: string[]; bankAccountId: string; method?: PaymentMethod; date?: string; amounts?: Record<string, number> }): PaymentBatch {
  const c = engine.ctx();
  const items = input.openItemIds.map((id) => db.find<OpenItem>(C.openItems, id)).filter((o): o is OpenItem => !!o && o.direction === 'Debit' && o.outstanding > 0.005);
  if (!items.length) throw new ValidationError('Select at least one payable open item', 'VALIDATION');
  const inBatch = db.where<PaymentBatch>(C.paymentBatches, (b) => !['Completed', 'Cancelled', 'Rejected', 'Reversed', 'Failed', 'Partially Completed'].includes(b.status)).flatMap((b) => b.lines.flatMap((l) => l.openItemIds.map((o) => ({ o, n: b.number }))));
  const clash = items.find((o) => inBatch.some((x) => x.o === o.id));
  if (clash) throw new ValidationError(`${clash.docNumber} is already in ${inBatch.find((x) => x.o === clash.id)?.n}`, 'VALIDATION');
  const bank = db.find<Account>(C.accounts, input.bankAccountId);
  if (!bank) throw new ValidationError('Choose a bank account', 'VALIDATION', 'bankAccountId');
  const bySup = new Map<string, OpenItem[]>();
  items.forEach((o) => bySup.set(o.partyId, [...(bySup.get(o.partyId) ?? []), o]));
  const lines: PaymentBatchLine[] = Array.from(bySup.entries()).map(([supId, ois]) => {
    const sup = supplierOf(supId);
    const bd = sup?.bankDetails.find((b) => b.status === 'Approved');
    const amount = r2(ois.reduce((s, o) => s + (input.amounts?.[o.id] ?? o.outstanding), 0));
    const tds = tdsFor(supId);
    const tdsAmt = tds.atPayment && tds.section && amount >= tds.section.thresholdPerTxn ? r2((amount * tds.section.rate) / 100) : 0;
    return { id: uid('bl'), supplierId: supId, supplierName: sup?.name ?? ois[0].partyName, openItemIds: ois.map((o) => o.id), docNumbers: ois.map((o) => o.docNumber), amount, tds: tdsAmt, net: r2(amount - tdsAmt), bankName: bd?.bankName, accountNumber: bd?.accountNumber, ifsc: bd?.ifsc, status: 'Pending', note: !bd ? 'No approved bank details on supplier' : undefined };
  });
  const number = engine.allocateNumber('Payment Batch', { date: input.date ?? today() });
  const b = db.insert<PaymentBatch>(C.paymentBatches, { number, docType: 'Payment Batch', date: input.date ?? today(), branchId: c.branchId, currency: c.currency, bankAccountId: bank.id, bankAccountName: bank.name, method: input.method ?? 'NEFT', status: 'Created', lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)), makerId: c.userId, makerName: c.userName, correlationId: `corr_${uid('pb')}` });
  engine.audit({ action: 'payment_batch.created', objectType: 'Payment Batch', objectId: b.id, objectNumber: number, detail: `${lines.length} supplier(s) · ${b.total}` });
  return b;
}

export function updateBatchLines(id: string, lines: PaymentBatchLine[]): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Created' && b.status !== 'Returned') throw new ValidationError(`Batch is ${b.status} — lines are frozen`, 'INVALID_STATE');
  const fixed = lines.map((l) => { const tds = tdsFor(l.supplierId); const t = tds.atPayment && tds.section && l.amount >= tds.section.thresholdPerTxn ? r2((l.amount * tds.section.rate) / 100) : 0; return { ...l, amount: r2(l.amount), tds: t, net: r2(l.amount - t) }; });
  fixed.forEach((l) => { const max = l.openItemIds.reduce((s, oid) => s + (db.find<OpenItem>(C.openItems, oid)?.outstanding ?? 0), 0); if (l.amount > max + 0.005) throw new ValidationError(`${l.supplierName}: ${l.amount} exceeds outstanding ${r2(max)}`, 'VALIDATION'); if (l.amount <= 0) throw new ValidationError(`${l.supplierName}: amount must be positive`, 'VALIDATION'); });
  return db.update<PaymentBatch>(C.paymentBatches, id, { lines: fixed, total: r2(fixed.reduce((s, l) => s + l.amount, 0)) }, { expectedVersion: b.version });
}

export function submitBatch(id: string): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Created' && b.status !== 'Returned') throw new ValidationError(`Batch is ${b.status}`, 'INVALID_STATE');
  if (!b.lines.length) throw new ValidationError('Batch has no lines', 'VALIDATION');
  return db.transaction(() => {
    const req = engine.submitForApproval({ docType: 'Payment Batch', collection: C.paymentBatches, docId: b.id, docNumber: b.number, amount: b.total, summary: `${b.lines.length} supplier(s) · ${b.bankAccountName}` });
    db.update<PaymentBatch>(C.paymentBatches, id, { status: req ? 'Submitted' : 'Approved', submittedAt: new Date().toISOString(), approvedAt: req ? undefined : new Date().toISOString(), approvalId: req?.id });
    return db.find<PaymentBatch>(C.paymentBatches, id)!;
  });
}

export function decideBatch(id: string, action: 'Approve' | 'Reject' | 'Return', comment: string): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Submitted') throw new ValidationError(`Batch is ${b.status}`, 'INVALID_STATE');
  const c = engine.ctx();
  const req = db.findBy<any>(C.approvals, (a) => a.docId === id && a.status === 'Pending');
  if (req) engine.actOnApproval(req.id, action, { comment });
  else {
    if (b.makerId === c.userId) throw new ValidationError('Self-approval is not permitted — the checker must be a different user', 'DENIED');
    db.update<PaymentBatch>(C.paymentBatches, id, { status: action === 'Approve' ? 'Approved' : action === 'Reject' ? 'Rejected' : 'Returned' });
  }
  db.update<PaymentBatch>(C.paymentBatches, id, { checkerName: c.userName, approvedAt: action === 'Approve' ? new Date().toISOString() : undefined });
  engine.audit({ action: `payment_batch.${action.toLowerCase()}`, objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: comment });
  return db.find<PaymentBatch>(C.paymentBatches, id)!;
}

const mask = (n?: string) => (n ? '••••' + n.slice(-4) : '—');

export function bankFileRows(b: PaymentBatch) {
  const bank = db.find<Account>(C.accounts, b.bankAccountId);
  return b.lines.map((l, i) => ({ 'Sr No': i + 1, 'Transaction Type': b.method === 'RTGS' ? 'R' : b.method === 'IMPS' ? 'I' : 'N', 'Beneficiary Code': l.supplierId.replace('sup_', 'BEN').toUpperCase(), 'Beneficiary Account': mask(l.accountNumber), 'IFSC': l.ifsc ?? '', 'Beneficiary Name': l.supplierName, 'Amount': l.net.toFixed(2), 'Debit Account': mask(bank?.bankDetails?.accountNumber), 'Value Date': b.date.split('-').reverse().join('/'), 'Narration': `${b.number} ${l.docNumbers.join(' ')}`.slice(0, 40), 'Email': supplierOf(l.supplierId)?.email ?? '' }));
}

export function generateBankFile(id: string): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Approved' && b.status !== 'Sent to bank') throw new ValidationError('Batch must be approved before generating the bank file', 'INVALID_STATE');
  const missing = b.lines.filter((l) => !l.ifsc || !l.accountNumber);
  if (missing.length) throw new ValidationError(`Bank details missing for ${missing.map((l) => l.supplierName).join(', ')} — add approved bank details on the supplier`, 'VALIDATION');
  const rows = bankFileRows(b);
  const fileName = `${(db.find<Account>(C.accounts, b.bankAccountId)?.bankDetails?.bankName ?? 'BANK').split(' ')[0].toUpperCase()}_${b.method}_${b.number.replace(/\//g, '-')}.csv`;
  downloadText(fileName, toCSV(rows));
  const out = db.update<PaymentBatch>(C.paymentBatches, id, { fileGeneratedAt: new Date().toISOString(), fileName });
  engine.audit({ action: 'payment_batch.file_generated', objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: `${fileName} · ${rows.length} rows · accounts masked` });
  return out;
}

export function markBatchSent(id: string): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Approved') throw new ValidationError(`Batch is ${b.status}`, 'INVALID_STATE');
  if (!b.fileGeneratedAt) throw new ValidationError('Generate the bank file first', 'INVALID_STATE');
  const out = db.update<PaymentBatch>(C.paymentBatches, id, { status: 'Sent to bank', sentAt: new Date().toISOString() });
  engine.audit({ action: 'payment_batch.sent', objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: b.fileName });
  db.insert(C.integrationLogs, { provider: 'Bank', action: 'UploadPaymentFile', objectType: 'Payment Batch', objectId: id, objectNumber: b.number, requestFingerprint: `fp_${b.id}`, idempotencyKey: `bankfile:${b.id}`, request: { file: b.fileName, rows: b.lines.length, total: b.total }, response: { status: 'Accepted for processing' }, status: 'Submitted', at: new Date().toISOString(), correlationId: b.correlationId ?? '' });
  return out;
}

export function setBatchLineResult(id: string, lineId: string, result: 'Accepted' | 'Failed', ref: string): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Sent to bank' && b.status !== 'Accepted' && b.status !== 'Failed') throw new ValidationError(`Batch is ${b.status}`, 'INVALID_STATE');
  if (result === 'Accepted' && !ref.trim()) throw new ValidationError('UTR is required for accepted lines', 'VALIDATION', 'utr');
  if (result === 'Failed' && !ref.trim()) throw new ValidationError('Bank error text is required for failed lines', 'VALIDATION', 'error');
  const lines = b.lines.map((l) => (l.id === lineId ? { ...l, status: result, utr: result === 'Accepted' ? ref.trim() : undefined, error: result === 'Failed' ? ref.trim() : undefined } : l));
  const anyPending = lines.some((l) => l.status === 'Pending');
  const status: PaymentBatch['status'] = anyPending ? b.status : lines.every((l) => l.status === 'Failed') ? 'Failed' : 'Accepted';
  const out = db.update<PaymentBatch>(C.paymentBatches, id, { lines, status });
  engine.audit({ action: `payment_batch.line_${result.toLowerCase()}`, objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: `${lines.find((l) => l.id === lineId)?.supplierName}: ${result} ${ref}` });
  return out;
}

/** Complete: create + post one payment per accepted line. */
export function completeBatch(id: string): PaymentBatch {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (!['Sent to bank', 'Accepted', 'Failed'].includes(b.status)) throw new ValidationError(`Batch is ${b.status}`, 'INVALID_STATE');
  if (b.lines.some((l) => l.status === 'Pending')) throw new ValidationError('Record Accepted / Failed with UTR for every line first', 'INVALID_STATE');
  return db.transaction(() => {
    const lines = b.lines.map((l) => {
      if (l.status !== 'Accepted') return l;
      let remaining = l.amount;
      const allocs: PaymentAllocation[] = [];
      l.openItemIds.forEach((oid) => { const o = db.find<OpenItem>(C.openItems, oid); if (!o || remaining <= 0.005) return; const amt = Math.min(remaining, o.outstanding); if (amt > 0.005) { allocs.push(allocationFor(o, amt)); remaining = r2(remaining - amt); } });
      const p = newPayment(l.supplierId, { method: b.method, bankAccountId: b.bankAccountId });
      const posted = postPayment({ ...p, date: today() < b.date ? b.date : today(), allocations: allocs, utr: l.utr, batchId: b.id, batchNumber: b.number, notes: `Batch ${b.number}` }, { batchId: b.id, batchNumber: b.number });
      return { ...l, status: 'Completed' as const, paymentId: posted.id, paymentNumber: posted.number };
    });
    const done = lines.filter((l) => l.status === 'Completed').length;
    const status: PaymentBatch['status'] = done === lines.length ? 'Completed' : done === 0 ? 'Failed' : 'Partially Completed';
    const out = db.update<PaymentBatch>(C.paymentBatches, id, { lines, status, completedAt: new Date().toISOString() });
    engine.audit({ action: 'payment_batch.completed', objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: `${done}/${lines.length} payments posted` });
    engine.notify({ type: 'system', title: `Payment batch ${b.number} ${status.toLowerCase()}`, body: `${done} payment(s) posted`, link: `purchase/batches/${id}` });
    return out;
  });
}

export function cancelBatch(id: string, reason: string) {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) return;
  if (['Completed', 'Partially Completed', 'Sent to bank'].includes(b.status)) throw new ValidationError(`Batch is ${b.status} — cannot cancel`, 'INVALID_STATE');
  db.transaction(() => {
    const req = db.findBy<any>(C.approvals, (a) => a.docId === id && a.status === 'Pending');
    if (req) db.update<any>(C.approvals, req.id, { status: 'Cancelled', completedAt: new Date().toISOString() });
    db.update<PaymentBatch>(C.paymentBatches, id, { status: 'Cancelled', notes: `${b.notes ?? ''}\nCancelled: ${reason}`.trim() });
    engine.audit({ action: 'payment_batch.cancelled', objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: reason });
  });
}

export function reverseBatch(id: string, reason: string) {
  const b = db.find<PaymentBatch>(C.paymentBatches, id);
  if (!b) throw new ValidationError('Batch not found', 'NOT_FOUND');
  if (b.status !== 'Completed' && b.status !== 'Partially Completed') throw new ValidationError(`Batch is ${b.status}`, 'INVALID_STATE');
  db.transaction(() => {
    b.lines.filter((l) => l.paymentId).forEach((l) => { const p = db.find<Payment>(C.payments, l.paymentId); if (p?.status === 'Completed') reversePayment(p.id, `Batch ${b.number} reversed: ${reason}`); });
    db.update<PaymentBatch>(C.paymentBatches, id, { status: 'Reversed', lines: b.lines.map((l) => ({ ...l, status: l.paymentId ? 'Failed' : l.status, error: l.paymentId ? `Reversed: ${reason}` : l.error })) });
    engine.audit({ action: 'payment_batch.reversed', objectType: 'Payment Batch', objectId: id, objectNumber: b.number, detail: reason });
  });
}

export { addDays };
