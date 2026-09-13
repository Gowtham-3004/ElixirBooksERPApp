// Seed data for the CRM module: leads and activities (calls, follow-ups, promises to pay).
import type { DB } from '../db';
import { C } from '../collections';
import { IDS, rec } from './core';
import type { Lead, CrmActivity } from '../../modules/crm/types';

const CO = IDS.acme;
const T = (d: string, h = '10:00') => `${d}T${h}:00.000Z`;

export function seedCrm(): Partial<DB> {
  const lead = (id: string, name: string, company: string, stage: Lead['stage'], value: number, ownerId: string, ownerName: string, extra: Partial<Lead> & { created: string }): Lead =>
    rec<Lead>(id, { companyId: CO, name, company, stage, value, probability: { New: 10, Qualified: 30, Proposal: 60, Won: 100, Lost: 0 }[stage], ownerId, ownerName, source: 'Website', createdAt: T(extra.created), updatedAt: T(extra.created, '16:00'), ...extra });
  const leads: Lead[] = [
    lead('lead_01', 'Q3 packaging supply', 'Nashik Agro Foods', 'Proposal', 480000, IDS.uVikram, 'Vikram Singh', { created: '2026-08-12', contactName: 'Rohit Deshmukh', email: 'rohit@nashikagro.in', phone: '+91 98220 11122', city: 'Nashik', stateCode: '27', source: 'Trade show', expectedClose: '2026-09-25', nextStep: 'Send revised quote with 500-crate tier pricing', notes: 'Met at PackEx Mumbai. Needs crates + boxes monthly.' }),
    lead('lead_02', 'Steel plates — fabrication line', 'Omkar Engineering Works', 'Qualified', 1250000, IDS.uPriya, 'Priya Mehta', { created: '2026-08-20', contactName: 'Sandeep Kulkarni', email: 'purchase@omkareng.com', phone: '+91 98900 33445', city: 'Pune', stateCode: '27', source: 'Referral', expectedClose: '2026-10-10', nextStep: 'Plant visit on 18 Sep', notes: 'Referred by Metro Distributors. 4mm HR plates, ~5 MT/month.' }),
    lead('lead_03', 'Hardware for solar mounts', 'SunVolt Renewables', 'New', 320000, IDS.uVikram, 'Vikram Singh', { created: '2026-09-08', contactName: 'Anjali Nair', email: 'anjali@sunvolt.in', phone: '+91 97400 55667', city: 'Bengaluru', stateCode: '29', source: 'Inbound email', expectedClose: '2026-10-30', nextStep: 'Discovery call', notes: 'Bolts M16 + brackets for 2 MW installation.' }),
    lead('lead_04', 'ERP advisory retainer', 'Kiran Tech Pvt Ltd', 'Proposal', 600000, IDS.uPriya, 'Priya Mehta', { created: '2026-07-30', contactName: 'Kiran Rao', email: 'finance@kirantech.com', city: 'Pune', stateCode: '27', source: 'Existing customer', expectedClose: '2026-09-10', nextStep: 'Legal review of MSA', notes: 'Customer master is inactive — reactivate before conversion.', customerId: IDS.cKiran }),
    lead('lead_05', 'Tea range for retail chain', 'FreshMart Stores', 'Won', 275000, IDS.uSuresh, 'Suresh Kumar', { created: '2026-07-05', contactName: 'Meera Iyer', email: 'buying@freshmart.in', phone: '+91 98450 99887', city: 'Bengaluru', stateCode: '29', source: 'Cold call', expectedClose: '2026-08-15', wonAt: T('2026-08-14'), notes: 'Converted; first order placed via Bharat Agencies distribution.', customerId: IDS.cBharat }),
    lead('lead_06', 'Grinding consumables', 'Deccan Auto Components', 'Lost', 180000, IDS.uVikram, 'Vikram Singh', { created: '2026-06-18', contactName: 'Vinay Joshi', email: 'vinay@deccanauto.com', city: 'Hyderabad', stateCode: '36', source: 'Website', expectedClose: '2026-07-31', lostAt: T('2026-08-02'), lostReason: 'Lost on price to a local supplier (12% lower)' }),
    lead('lead_07', 'Export brackets — Gulf', 'Al Noor Trading LLC', 'Qualified', 2100000, IDS.uPriya, 'Priya Mehta', { created: '2026-08-28', contactName: 'Faisal Rahman', email: 'faisal@alnoor.ae', phone: '+971 50 123 4567', city: 'Dubai', source: 'Partner', expectedClose: '2026-11-15', nextStep: 'Share LUT export price list in USD', notes: 'Route via Acme Gulf if incoterms require.' }),
    lead('lead_08', 'Annual maintenance contract', 'Delta Pharma', 'New', 120000, IDS.uSuresh, 'Suresh Kumar', { created: '2026-09-11', contactName: 'Deepak Jain', email: 'ap@deltapharma.in', city: 'Navi Mumbai', stateCode: '27', source: 'Existing customer', expectedClose: '2026-10-05', nextStep: 'Send AMC scope document', customerId: IDS.cDelta }),
  ];

  const act = (id: string, type: CrmActivity['type'], subject: string, ownerId: string, ownerName: string, at: string, extra: Partial<CrmActivity> = {}): CrmActivity =>
    rec<CrmActivity>(id, { companyId: CO, type, subject, ownerId, ownerName, status: 'Open', createdAt: T(at), updatedAt: T(at), ...extra });
  const activities: CrmActivity[] = [
    act('act_01', 'Promise to pay', 'Promised ₹1,18,000 for INV/26-27/0118', IDS.uAnil, 'Anil Patil', '2026-09-08', { customerId: IDS.cArlene, customerName: 'Arlene Traders', invoiceId: 'inv_0118', invoiceNumber: 'INV/26-27/0118', promiseAmount: 118000, promiseDate: '2026-09-20', notes: 'Spoke to Arlene D’Souza — cheque to be couriered after 18 Sep.' }),
    act('act_02', 'Call', 'Chased overdue balance', IDS.uAnil, 'Anil Patil', '2026-09-02', { customerId: IDS.cVimal, customerName: 'Vimal Commodities', status: 'Done', doneAt: T('2026-09-02', '11:20'), outcome: 'Will pay ₹2,00,000 by month end', notes: 'Disputes 0.3 MT short supply on INV/26-27/0111 — credit note CN/0015 already issued for the earlier invoice.' }),
    act('act_03', 'Promise to pay', 'Promised ₹2,00,000 against INV/26-27/0111', IDS.uAnil, 'Anil Patil', '2026-09-02', { customerId: IDS.cVimal, customerName: 'Vimal Commodities', invoiceId: 'inv_0111', invoiceNumber: 'INV/26-27/0111', promiseAmount: 200000, promiseDate: '2026-09-30' }),
    act('act_04', 'Reminder', 'Email reminder · ₹5,57,500 overdue (1 invoice)', IDS.uAnil, 'Anil Patil', '2026-08-25', { customerId: IDS.cSunshine, customerName: 'Sunshine Exports', status: 'Done', doneAt: T('2026-08-25', '09:30'), channel: 'email', notes: 'INV/26-27/0110 due 12 May 2026 · ₹5,57,500.00' }),
    act('act_05', 'Follow-up', 'Confirm payment plan for INV/26-27/0110', IDS.uAnil, 'Anil Patil', '2026-08-25', { customerId: IDS.cSunshine, customerName: 'Sunshine Exports', dueAt: '2026-09-05', notes: 'Buyer says LUT export proceeds delayed at bank.' }),
    act('act_06', 'Meeting', 'Plant visit — fabrication line requirements', IDS.uPriya, 'Priya Mehta', '2026-09-05', { leadId: 'lead_02', leadName: 'Steel plates — fabrication line', dueAt: '2026-09-18', notes: 'Bring 4mm and 6mm samples; discuss batch traceability.' }),
    act('act_07', 'Email', 'Sent revised quotation QT/26-27/0041', IDS.uVikram, 'Vikram Singh', '2026-09-11', { customerId: IDS.cArlene, customerName: 'Arlene Traders', status: 'Done', doneAt: T('2026-09-11', '15:05'), notes: 'Revised tier pricing on bolts; validity 25 Sep.' }),
    act('act_08', 'Call', 'Discovery call', IDS.uVikram, 'Vikram Singh', '2026-09-09', { leadId: 'lead_03', leadName: 'Hardware for solar mounts', dueAt: '2026-09-15', notes: 'Understand quantities and delivery schedule for the 2 MW site.' }),
    act('act_09', 'Note', 'Customer inactive — reactivate before quoting', IDS.uPriya, 'Priya Mehta', '2026-08-30', { leadId: 'lead_04', leadName: 'ERP advisory retainer', customerId: IDS.cKiran, customerName: 'Kiran Tech Pvt Ltd', status: 'Done', doneAt: T('2026-08-30', '12:00') }),
    act('act_10', 'Follow-up', 'Send LUT export price list (USD)', IDS.uPriya, 'Priya Mehta', '2026-09-01', { leadId: 'lead_07', leadName: 'Export brackets — Gulf', dueAt: '2026-09-10', notes: 'Overdue — waiting on FX-adjusted USD rates from finance.' }),
    act('act_11', 'Call', 'Collections call — 4 invoices overdue', IDS.uAnil, 'Anil Patil', '2026-09-10', { customerId: IDS.cRajesh, customerName: 'Rajesh Enterprises', status: 'Done', doneAt: T('2026-09-10', '16:40'), outcome: 'Price dispute on INV/0117 → credit note CN/0008 raised', notes: 'Will settle INV/0108 once CN/0008 is approved.' }),
    act('act_12', 'Follow-up', 'Confirm receipt of AMC scope document', IDS.uSuresh, 'Suresh Kumar', '2026-09-12', { leadId: 'lead_08', leadName: 'Annual maintenance contract', customerId: IDS.cDelta, customerName: 'Delta Pharma', dueAt: '2026-09-16' }),
  ];
  return { [C.leads]: leads as any, [C.crmActivities]: activities as any };
}
