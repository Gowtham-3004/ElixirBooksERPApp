import type { BaseRecord, ID } from '../../store';

export type LeadStage = 'New' | 'Qualified' | 'Proposal' | 'Won' | 'Lost';
export const LEAD_STAGES: LeadStage[] = ['New', 'Qualified', 'Proposal', 'Won', 'Lost'];
export const LEAD_SOURCES = ['Website', 'Referral', 'Trade show', 'Cold call', 'Partner', 'Inbound email', 'Existing customer'] as const;

export interface Lead extends BaseRecord {
  companyId?: ID;
  name: string;
  company: string;
  contactName?: string;
  email?: string;
  phone?: string;
  city?: string;
  stateCode?: string;
  source: string;
  stage: LeadStage;
  value: number;
  probability: number;
  ownerId?: ID;
  ownerName: string;
  expectedClose?: string;
  nextStep?: string;
  notes?: string;
  customerId?: ID;
  quotationId?: ID;
  quotationNumber?: string;
  lostReason?: string;
  wonAt?: string;
  lostAt?: string;
  tags?: string[];
}

export type ActivityType = 'Call' | 'Meeting' | 'Email' | 'Note' | 'Follow-up' | 'Promise to pay' | 'Reminder';
export const ACTIVITY_TYPES: ActivityType[] = ['Call', 'Meeting', 'Email', 'Note', 'Follow-up', 'Promise to pay', 'Reminder'];

export interface CrmActivity extends BaseRecord {
  companyId?: ID;
  type: ActivityType;
  subject: string;
  notes?: string;
  customerId?: ID;
  customerName?: string;
  leadId?: ID;
  leadName?: string;
  invoiceId?: ID;
  invoiceNumber?: string;
  dueAt?: string;
  doneAt?: string;
  status: 'Open' | 'Done' | 'Cancelled';
  ownerId?: ID;
  ownerName: string;
  outcome?: string;
  promiseAmount?: number;
  promiseDate?: string;
  channel?: 'in-app' | 'email' | 'sms';
}
