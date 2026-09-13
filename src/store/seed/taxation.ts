// Seed data for the taxation module: filed GST returns (GSTR-1 Apr/May, GSTR-3B Apr), IRP/EWB integration logs
// (accepted / rejected / cancelled examples) and TDS overlay rows (certificates, challan) mirroring the legacy register.
// GST registers themselves are derived live from posted sales/purchase documents (owned by those modules).
import type { DB } from '../db';
import type { IntegrationLog } from '../types';
import { C } from '../collections';
import { IDS, rec } from './core';
import type { StatutoryReturn, TdsEntry } from '../../modules/taxation/types';

const co = IDS.acme;

export function seedTaxation(): Partial<DB> {
  const sec = (code: string, desc: string, count: number, taxable: number, cgst: number, sgst: number, igst: number, cess = 0) => ({ code, desc, count, taxable, cgst, sgst, igst, cess, tax: cgst + sgst + igst + cess });
  const gstr1Apr = [
    sec('4A', 'B2B supplies to registered persons', 4, 1068305.94, 35397.53, 35397.53, 121500),
    sec('5A', 'B2C Large (inter-state > ₹2.5 L)', 0, 0, 0, 0, 0),
    sec('6A', 'Exports / SEZ (zero-rated)', 0, 0, 0, 0, 0),
    sec('7', 'B2C Small (unregistered)', 3, 24576.27, 2211.87, 2211.86, 0),
    sec('8', 'Nil-rated, exempt and non-GST', 0, 0, 0, 0, 0),
    sec('9B', 'Credit / debit notes (registered)', 1, -23600, -2124, -2124, 0),
    sec('11A', 'Advances received (tax liability)', 0, 0, 0, 0, 0),
    sec('12', 'HSN-wise summary', 7, 1069282.21, 35485.4, 35485.39, 121500),
    sec('13', 'Documents issued', 8, 0, 0, 0, 0),
  ];
  const t1 = { taxable: 1069282.21, cgst: 35485.4, sgst: 35485.39, igst: 121500, cess: 0, tax: 192470.79 };
  const returns: StatutoryReturn[] = [
    rec<StatutoryReturn>('gstr_2026_04_g1', { companyId: co, type: 'GSTR-1', period: '2026-04', fy: '2026-27', registrationId: 'reg_mh', gstin: '27AAAPL1234C1Z5', version: 2, status: 'Filed', sections: gstr1Apr, totals: t1, reconciliation: { registerTax: 192470.79, ledgerTax: 192470.79, difference: 0 }, generatedAt: '2026-05-09T10:00:00.000Z', generatedBy: 'Anil Patil', filedAt: '2026-05-10T15:42:00.000Z', filedBy: 'Rahul Kumar', arn: 'AA270426012345M', dueDate: '2026-05-11', notes: 'v1 regenerated after CN/26-27/0012 was posted late', createdAt: '2026-05-09T10:00:00.000Z', updatedAt: '2026-05-10T15:42:00.000Z' }),
    rec<StatutoryReturn>('gstr_2026_04_g1_v1', { companyId: co, type: 'GSTR-1', period: '2026-04', fy: '2026-27', registrationId: 'reg_mh', gstin: '27AAAPL1234C1Z5', version: 1, status: 'Superseded', sections: gstr1Apr.map((s) => (s.code === '9B' ? { ...s, count: 0, taxable: 0, cgst: 0, sgst: 0, tax: 0 } : s)), totals: { ...t1, taxable: 1092882.21, cgst: 37609.4, sgst: 37609.39, tax: 196718.79 }, reconciliation: { registerTax: 196718.79, ledgerTax: 192470.79, difference: 4248 }, generatedAt: '2026-05-06T10:00:00.000Z', generatedBy: 'Anil Patil', dueDate: '2026-05-11', createdAt: '2026-05-06T10:00:00.000Z', updatedAt: '2026-05-09T10:00:00.000Z' }),
    rec<StatutoryReturn>('gstr_2026_05_g1', { companyId: co, type: 'GSTR-1', period: '2026-05', fy: '2026-27', registrationId: 'reg_mh', gstin: '27AAAPL1234C1Z5', version: 1, status: 'Filed', sections: [
      sec('4A', 'B2B supplies to registered persons', 6, 1412400, 84312, 84312, 46800),
      sec('7', 'B2C Small (unregistered)', 5, 41200, 3708, 3708, 0),
      sec('9B', 'Credit / debit notes (registered)', 0, 0, 0, 0, 0),
      sec('12', 'HSN-wise summary', 9, 1453600, 88020, 88020, 46800),
      sec('13', 'Documents issued', 11, 0, 0, 0, 0),
    ], totals: { taxable: 1453600, cgst: 88020, sgst: 88020, igst: 46800, cess: 0, tax: 222840 }, reconciliation: { registerTax: 222840, ledgerTax: 222840, difference: 0 }, generatedAt: '2026-06-08T10:00:00.000Z', generatedBy: 'Anil Patil', filedAt: '2026-06-10T11:20:00.000Z', filedBy: 'Rahul Kumar', arn: 'AA270526098765N', dueDate: '2026-06-11', createdAt: '2026-06-08T10:00:00.000Z', updatedAt: '2026-06-10T11:20:00.000Z' }),
    rec<StatutoryReturn>('gstr_2026_04_3b', { companyId: co, type: 'GSTR-3B', period: '2026-04', fy: '2026-27', registrationId: 'reg_mh', gstin: '27AAAPL1234C1Z5', version: 1, status: 'Filed', sections: [
      sec('3.1(a)', 'Outward taxable supplies (other than zero/nil/exempt)', 8, 1069282.21, 35485.4, 35485.39, 121500),
      sec('3.1(b)', 'Outward taxable supplies (zero rated)', 0, 0, 0, 0, 0),
      sec('3.1(c)', 'Other outward supplies (nil rated, exempted)', 0, 0, 0, 0, 0),
      sec('4(A)(5)', 'ITC available — all other ITC', 6, 0, 62124, 62124, 44739),
      sec('4(D)(2)', 'Ineligible ITC', 0, 0, 0, 0, 0),
      sec('6.1', 'Payment of tax', 0, 0, 0, 0, 76761),
    ], totals: { taxable: 1069282.21, cgst: 35485.4, sgst: 35485.39, igst: 121500, cess: 0, tax: 192470.79, itc: 168987, netPayable: 76761 }, reconciliation: { registerTax: 192470.79, ledgerTax: 192470.79, difference: 0 }, generatedAt: '2026-05-18T10:00:00.000Z', generatedBy: 'Anil Patil', filedAt: '2026-05-19T16:05:00.000Z', filedBy: 'Rahul Kumar', arn: 'AB270426045678P', dueDate: '2026-05-20', paymentJournalNumber: 'JV/26-27/0102', createdAt: '2026-05-18T10:00:00.000Z', updatedAt: '2026-05-19T16:05:00.000Z' }),
    rec<StatutoryReturn>('tds_2026_q1_26q', { companyId: co, type: '26Q', period: '2026-27 Q1', fy: '2026-27', version: 1, status: 'Filed', sections: [
      sec('194C', 'Payments to contractors', 2, 266520, 0, 0, 0), sec('194H', 'Commission or brokerage', 1, 245000, 0, 0, 0), sec('194J', 'Professional fees', 1, 60000, 0, 0, 0),
    ].map((s) => ({ ...s, tax: s.code === '194C' ? 2665 : s.code === '194H' ? 12250 : 6000 })), totals: { taxable: 571520, cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 20915, tds: 20915 }, generatedAt: '2026-07-28T10:00:00.000Z', generatedBy: 'Anil Patil', filedAt: '2026-07-30T12:00:00.000Z', filedBy: 'Rahul Kumar', arn: 'TDS26Q-2627Q1-00871', dueDate: '2026-07-31', createdAt: '2026-07-28T10:00:00.000Z', updatedAt: '2026-07-30T12:00:00.000Z' }),
  ];

  // ── Integration logs (IRP / EWB) ─────────────────────────────────────────
  const log = (id: string, provider: IntegrationLog['provider'], action: string, objectId: string, objectNumber: string, status: IntegrationLog['status'], at: string, request: Record<string, unknown>, response: Record<string, unknown>, extra: Partial<IntegrationLog> = {}): IntegrationLog =>
    rec<IntegrationLog>(id, { companyId: co, provider, action, objectType: 'Sales Invoice', objectId, objectNumber, requestFingerprint: `fp_${id}`, idempotencyKey: `${provider === 'IRP' ? 'einv' : 'ewb'}:${objectId}`, request, response, status, at, correlationId: `corr_${id.toUpperCase()}`, createdAt: at, updatedAt: at, ...extra });
  const logs: IntegrationLog[] = [
    log('il_irp_0118', 'IRP', 'GenerateIRN', 'inv_0118', 'INV/26-27/0118', 'Accepted', '2026-09-13T07:30:00.000Z', { DocNo: 'INV/26-27/0118', DocDt: '2026-09-12', SellerGstin: '27AAAPL1234C1Z5', BuyerGstin: '27AAAPL1234C1Z5', TotInvVal: 118000 }, { Irn: '4f1c8a2e9b7d3f6a1c5e8b2d4f7a9c1e3b5d7f9a2c4e6b8d1f3a5c7e9b2d4f9a2', AckNo: '232400012345678', AckDt: '2026-09-13T07:30:00.000Z', Status: 'ACT' }, { providerRef: '232400012345678' }),
    log('il_irp_0117', 'IRP', 'GenerateIRN', 'inv_0117', 'INV/26-27/0117', 'Accepted', '2026-09-05T10:48:00.000Z', { DocNo: 'INV/26-27/0117', DocDt: '2026-09-05', SellerGstin: '27AAAPL1234C1Z5', BuyerGstin: '27AABCM2345J1Z8', TotInvVal: 322000 }, { Irn: 'b5f90123c4d8e2f0a1b3c5d7e9f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7', AckNo: '232400001234521', AckDt: '2026-09-05T10:48:00.000Z', Status: 'ACT' }, { providerRef: '232400001234521' }),
    log('il_irp_0116', 'IRP', 'GenerateIRN', 'inv_0116', 'INV/26-27/0116', 'Accepted', '2026-09-03T06:15:00.000Z', { DocNo: 'INV/26-27/0116', DocDt: '2026-09-03', SellerGstin: '27AAAPL1234C1Z5', BuyerGstin: '29AABCR5678D1Z3', TotInvVal: 284500 }, { Irn: 'c6a01234d5e9f3a1b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4f6a8', AckNo: '232400001234498', AckDt: '2026-09-03T06:15:00.000Z', Status: 'ACT' }, { providerRef: '232400001234498' }),
    log('il_irp_0114', 'IRP', 'GenerateIRN', 'inv_0114', 'INV/26-27/0114', 'Rejected', '2026-08-30T04:32:00.000Z', { DocNo: 'INV/26-27/0114', DocDt: '2026-08-30', SellerGstin: '27AAAPL1234C1Z5', BuyerGstin: '24AABCS7890H1Z1', TotInvVal: 198600 }, { ErrorCode: '2172', ErrorMessage: 'Buyer GSTIN is inactive on the GST portal' }, { errorCode: '2172', errorMessage: 'Buyer GSTIN is inactive on the GST portal' }),
    log('il_irp_0114_retry', 'IRP', 'GenerateIRN', 'inv_0114', 'INV/26-27/0114', 'Timeout', '2026-08-30T05:10:00.000Z', { DocNo: 'INV/26-27/0114', DocDt: '2026-08-30', SellerGstin: '27AAAPL1234C1Z5', BuyerGstin: '24AABCS7890H1Z1', TotInvVal: 198600 }, { ErrorCode: 'GW-504', ErrorMessage: 'Gateway timeout — no response from IRP within 30 s' }, { errorCode: 'GW-504', errorMessage: 'Gateway timeout — retry is safe (idempotent reference)' }),
    log('il_irp_cancel_0111', 'IRP', 'CancelIRN', 'inv_0111', 'INV/26-27/0111', 'Cancelled', '2026-08-20T09:12:00.000Z', { Irn: 'a4e89f12b3c7d1e8f9a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4', CnlRsn: '1', CnlRem: 'Duplicate invoice raised for the same delivery' }, { Irn: 'a4e89f12b3c7d1e8f9a0b2c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4a6b8c0d2e4', CancelDate: '2026-08-20T09:12:00.000Z' }),
    log('il_ewb_0117', 'EWB', 'GenerateEWB', 'inv_0117', 'INV/26-27/0117', 'Accepted', '2026-09-05T11:02:00.000Z', { DocNo: 'INV/26-27/0117', VehicleNo: 'MH04KL2233', TransporterId: '27AABCS9876T1Z0', Distance: 42 }, { EwbNo: '341002345678', EwbValidTill: '2026-09-06T11:02:00.000Z' }, { providerRef: '341002345678' }),
  ];

  // ── TDS overlay rows (mirror of the legacy register; live rows are derived from payments/receipts/vendor invoices) ──
  const tds = (id: string, sourceType: string, sourceId: string, sourceNumber: string, date: string, partyType: TdsEntry['partyType'], partyId: string, partyName: string, pan: string, sectionId: string, section: string, kindOfTax: 'TDS' | 'TCS', rate: number, base: number, amount: number, status: TdsEntry['status'], extra: Partial<TdsEntry> = {}): TdsEntry =>
    rec<TdsEntry>(id, { companyId: co, kind: 'Deduction', sourceType, sourceId, sourceNumber, date, partyType, partyId, partyName, pan, sectionId, section, kindOfTax, rate, base, amount, quarter: 'Q1', fy: '2026-27', status, createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z`, ...extra });
  const tdsEntries: TdsEntry[] = [
    tds('tds_0180', 'Payment', 'pmt_0180', 'PMT/26-27/0180', '2026-04-12', 'Supplier', IDS.sBharatSteel, 'Bharat Steel Suppliers', 'AABBS4321G', IDS.tds194C, '194C', 'TDS', 1, 219480, 2195, 'Certified', { certificateNo: 'TDS-Q1-001', certificateIssuedAt: '2026-08-05T10:00:00.000Z', challanNo: 'CIN 0510001-070526-00042', challanDate: '2026-05-07' }),
    tds('tds_0178', 'Payment', 'pmt_0178', 'PMT/26-27/0178', '2026-04-10', 'Supplier', IDS.sNational, 'National Hardware Co', 'AABNC8765F', IDS.tds194C, '194C', 'TDS', 1, 47040, 470, 'Certified', { certificateNo: 'TDS-Q1-002', certificateIssuedAt: '2026-08-05T10:00:00.000Z', challanNo: 'CIN 0510001-070526-00042', challanDate: '2026-05-07' }),
    tds('tds_0176', 'Payment', 'pmt_0176', 'PMT/26-27/0176', '2026-04-08', 'Supplier', IDS.sKiranAg, 'Kiran Agencies', 'AABKA9012J', IDS.tds194C, '194C', 'TDS', 0, 115640, 0, 'Exempt', { note: 'Lower-deduction certificate u/s 197 on file (valid to 31 Mar 2027)' }),
    tds('tds_0198', 'Receipt', 'rcpt_0198', 'RCPT/26-27/0198', '2026-04-15', 'Customer', IDS.cRajesh, 'Rajesh Enterprises', 'AABCR5678D', IDS.tds194H, '194H', 'TDS', 5, 245000, 12250, 'Certified', { certificateNo: 'TCS-Q1-001', certificateIssuedAt: '2026-08-05T10:00:00.000Z', challanNo: 'CIN 0510001-070526-00042', challanDate: '2026-05-07', note: 'TDS deducted by customer on commission — claimable as TDS receivable' }),
    tds('tds_vinv_0031', 'Vendor Invoice', 'vinv_0031', 'VINV/26-27/0031', '2026-06-18', 'Supplier', IDS.sConsult, 'Mehta & Associates (CA)', 'AABCM1111P', IDS.tds194J, '194J', 'TDS', 10, 60000, 6000, 'Deposited', { challanNo: 'CIN 0510001-070726-00118', challanDate: '2026-07-07', quarter: 'Q1' }),
    rec<TdsEntry>('tds_challan_q1', { companyId: co, kind: 'Challan', sourceType: 'Challan', sourceId: 'jv_tds_chal_q1', sourceNumber: 'CIN 0510001-070526-00042', date: '2026-05-07', partyType: 'Supplier', partyName: 'Income Tax Department (CBDT)', section: '194C/194H', kindOfTax: 'TDS', rate: 0, base: 0, amount: 14915, quarter: 'Q1', fy: '2026-27', challanNo: 'CIN 0510001-070526-00042', challanDate: '2026-05-07', bsrCode: '0510001', journalNumber: 'JV/26-27/0071', status: 'Deposited', note: 'April deductions deposited via HDFC net banking', createdAt: '2026-05-07T10:00:00.000Z', updatedAt: '2026-05-07T10:00:00.000Z' }),
  ];

  return {
    [C.gstReturns]: returns as any,
    [C.integrationLogs]: logs as any,
    [C.tdsEntries]: tdsEntries as any,
  };
}
