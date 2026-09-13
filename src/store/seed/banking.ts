// Seed data for the banking module: vouchers, the HDFC Apr 2026 statement
// (legacy lines), and a confirmed Mar 2026 reconciliation. Statement lines that
// clear documents seeded by other modules carry `matchedDocNumber` and are
// resolved to journals at runtime (see banking/actions.ts).
import type { DB } from '../db';
import type { Journal } from '../types';
import type { BankVoucher, BankStatement, StatementLine, Reconciliation } from '../../modules/banking/types';
import { C } from '../collections';
import { IDS, rec } from './core';
import { jv, mkTotals } from './purchase';

const co = IDS.acme;
const HDFC = IDS.accHDFC; const ICICI = IDS.accICICI; const CASH = IDS.accPettyCash;

export function seedBanking(): Partial<DB> {
  const journals: Journal[] = [];
  const voucher = (id: string, num: string, date: string, type: BankVoucher['voucherType'], bank: string, bankName: string, counter: string, counterName: string, amount: number, narration: string, status: BankVoucher['status'], extra: Partial<BankVoucher> = {}): BankVoucher => ({
    id, companyId: co, createdAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:30:00.000Z`, createdBy: 'seed', version: 1, number: num, docType: 'Bank Voucher', date, branchId: IDS.brHO, status, currency: 'INR', rate: 1,
    voucherType: type, bankAccountId: bank, bankAccountName: bankName, counterAccountId: counter, counterAccountName: counterName, amount, narration, lines: [], totals: { ...mkTotals([]), total: amount, baseTotal: amount },
    fy: '2026-27', period: date.slice(0, 7), correlationId: `corr_${id}`, ...(status === 'Posted' ? { postedAt: `${date}T10:00:00.000Z`, postedBy: 'Anil Patil' } : {}), ...extra,
  });
  const vouchers: BankVoucher[] = [
    voucher('bv_0052', 'BV/26-27/0052', '2026-08-28', 'Transfer', HDFC, 'HDFC Current Account ****1234', ICICI, 'ICICI Current Account ****5678', 200000, 'Fund transfer HDFC → ICICI for September payroll', 'Posted', { method: 'RTGS', instrumentRef: 'RTGS/082811/00311', journalId: 'jv_bv_0052', journalNumber: 'JV/26-27/0360' }),
    voucher('bv_0053', 'BV/26-27/0053', '2026-09-01', 'Contra', HDFC, 'HDFC Current Account ****1234', CASH, 'Cash — Petty Cash', 25000, 'Cash withdrawal for petty cash float', 'Posted', { method: 'Cheque', instrumentRef: 'CHQ 041301', journalId: 'jv_bv_0053', journalNumber: 'JV/26-27/0361' }),
    voucher('bv_0054', 'BV/26-27/0054', '2026-09-05', 'Payment', ICICI, 'ICICI Current Account ****5678', IDS.accRent, 'Rent', 60000, 'Office rent — September 2026', 'Posted', { method: 'NEFT', instrumentRef: 'NEFT/090510/00102', journalId: 'jv_bv_0054', journalNumber: 'JV/26-27/0362' }),
    voucher('bv_0055', 'BV/26-27/0055', '2026-09-10', 'Receipt', HDFC, 'HDFC Current Account ****1234', 'acc_4110', 'Interest Income', 4120, 'Quarterly interest credited on sweep balance', 'Posted', { method: 'Internal', instrumentRef: 'INT/Q2/2026', journalId: 'jv_bv_0055', journalNumber: 'JV/26-27/0363' }),
    voucher('bv_draft1', 'BV/DRAFT', '2026-09-12', 'Withdrawal', HDFC, 'HDFC Current Account ****1234', IDS.accBankCharges, 'Bank Charges', 590, 'NEFT charges — September', 'Draft', { method: 'Internal' }),
  ];
  journals.push(jv('jv_bv_0052', 'JV/26-27/0360', '2026-08-28', 'Bank Voucher', 'bv_0052', 'BV/26-27/0052', 'Transfer HDFC → ICICI · RTGS/082811/00311', [{ acc: ICICI, dr: 200000 }, { acc: HDFC, cr: 200000 }]));
  journals.push(jv('jv_bv_0053', 'JV/26-27/0361', '2026-09-01', 'Bank Voucher', 'bv_0053', 'BV/26-27/0053', 'Contra · petty cash withdrawal CHQ 041301', [{ acc: CASH, dr: 25000 }, { acc: HDFC, cr: 25000 }]));
  journals.push(jv('jv_bv_0054', 'JV/26-27/0362', '2026-09-05', 'Bank Voucher', 'bv_0054', 'BV/26-27/0054', 'Rent September 2026 · NEFT/090510/00102', [{ acc: IDS.accRent, dr: 60000 }, { acc: ICICI, cr: 60000 }]));
  journals.push(jv('jv_bv_0055', 'JV/26-27/0363', '2026-09-10', 'Bank Voucher', 'bv_0055', 'BV/26-27/0055', 'Interest credited · INT/Q2/2026', [{ acc: HDFC, dr: 4120 }, { acc: 'acc_4110', cr: 4120 }]));

  // HDFC statement — April 2026 (legacy lines). Opening = GL opening balance.
  const stmId = 'stm_hdfc_apr26';
  const lineSpecs: { id: string; date: string; description: string; reference: string; debit: number; credit: number; matchedDocNumber?: string; conf?: number; reason?: string }[] = [
    { id: 'sl_apr_01', date: '2026-04-12', description: 'CHEQUE NO 041234 SHREE SUPPLIERS', reference: 'CHQ/041212/00234', debit: 62000, credit: 0, matchedDocNumber: 'PMT/26-27/0151', conf: 72, reason: 'Amount equal · cheque number in reference · 0 d apart' },
    { id: 'sl_apr_02', date: '2026-04-15', description: 'IMPS RAJESH ENTERPRISES ADV', reference: 'IMPS/041801/23412', debit: 0, credit: 245000 },
    { id: 'sl_apr_03', date: '2026-04-18', description: 'UPI PAYMENT TO BHARAT AGENCIES', reference: 'UPI/042015/89341', debit: 188000, credit: 0 },
    { id: 'sl_apr_04', date: '2026-04-20', description: 'RTGS METRO DISTRIBUTORS', reference: 'RTGS/042011/09943', debit: 0, credit: 322000, matchedDocNumber: 'RCPT/26-27/0206', conf: 99, reason: 'Amount equal · party name matches · 0 d apart' },
    { id: 'sl_apr_05', date: '2026-04-22', description: 'BANK CHARGES APR', reference: 'TXN/042209/00081', debit: 236, credit: 0, matchedDocNumber: 'JV/26-27/0412', conf: 96, reason: 'Amount equal · bank charges pattern · 0 d apart' },
    { id: 'sl_apr_06', date: '2026-04-22', description: 'NEFT ARLENE TRADERS', reference: 'NEFT/042208/00412', debit: 0, credit: 118000, matchedDocNumber: 'RCPT/26-27/0210', conf: 98, reason: 'Amount equal · party name matches · 0 d apart' },
  ];
  let bal = 482000;
  const statementLines: StatementLine[] = lineSpecs.map((l) => {
    bal = Math.round((bal + l.credit - l.debit) * 100) / 100;
    return rec<StatementLine>(l.id, { companyId: co, statementId: stmId, bankAccountId: HDFC, date: l.date, description: l.description, reference: l.reference, debit: l.debit, credit: l.credit, balance: bal, fingerprint: `fp_${l.date}_${l.reference}_${l.debit || l.credit}`, status: l.matchedDocNumber ? 'Matched' : 'Unmatched', matchedDocNumber: l.matchedDocNumber, matchedJournalIds: l.matchedDocNumber === 'PMT/26-27/0151' ? ['jv_pmt_0151'] : undefined, matchGroupId: l.matchedDocNumber ? `mg_${l.id}` : undefined, matchedAt: l.matchedDocNumber ? '2026-05-02T10:00:00.000Z' : undefined, matchedBy: l.matchedDocNumber ? 'Anil Patil' : undefined, matchConfidence: l.conf, matchReason: l.reason });
  });
  const statements: BankStatement[] = [
    rec<BankStatement>(stmId, { companyId: co, bankAccountId: HDFC, bankAccountName: 'HDFC Current Account ****1234', fileName: 'HDFC_50100012341234_Apr2026.csv', fingerprint: 'fp_hdfc_apr26_7a3c91', periodFrom: '2026-04-01', periodTo: '2026-04-30', currency: 'INR', openingBalance: 482000, closingBalance: bal, lineCount: statementLines.length, totalDebit: lineSpecs.reduce((s, l) => s + l.debit, 0), totalCredit: lineSpecs.reduce((s, l) => s + l.credit, 0), status: 'Partially Reconciled', importedBy: 'Anil Patil', importedAt: '2026-05-02T09:30:00.000Z', format: { name: 'HDFC NetBanking CSV', dateCol: 'Date', descCol: 'Narration', refCol: 'Chq./Ref.No.', debitCol: 'Withdrawal Amt.', creditCol: 'Deposit Amt.', balanceCol: 'Closing Balance', dateFormat: 'DD/MM/YYYY' } }),
  ];
  const reconciliations: Reconciliation[] = [
    rec<Reconciliation>('rec_hdfc_mar26', { companyId: co, number: 'BRS/2025-26/12', bankAccountId: HDFC, bankAccountName: 'HDFC Current Account ****1234', periodFrom: '2026-03-01', periodTo: '2026-03-31', statementBalance: 482000, bookBalance: 482000, clearedCount: 41, clearedAmount: 2214560, unmatchedStatement: [], unmatchedBook: [], adjustments: [], difference: 0, status: 'Confirmed', confirmedBy: 'Rahul Kumar', confirmedAt: '2026-04-03T11:20:00.000Z', notes: 'Year-end reconciliation — no timing differences' }),
  ];

  return { [C.bankVouchers]: vouchers as any, [C.bankStatements]: statements as any, [C.statementLines]: statementLines as any, [C.reconciliations]: reconciliations as any, [C.journals]: journals as any };
}
