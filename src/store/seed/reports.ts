// Seed data for the reports module: saved reports (stored as savedViews with module 'reports').
import type { DB } from '../db';
import type { SavedView } from '../types';
import { C } from '../collections';
import { IDS, rec } from './core';

const co = IDS.acme;

export function seedReports(): Partial<DB> {
  const savedViews: SavedView[] = [
    rec<SavedView>('sv_rpt_001', { companyId: co, module: 'reports', register: 'pl', name: 'P&L — QTD vs prior quarter', filters: { preset: 'QTD', compare: 'prior', branchId: '' }, isDefault: true, ownerId: IDS.uRahul, shared: true, createdAt: '2026-07-02T10:00:00.000Z', updatedAt: '2026-07-02T10:00:00.000Z' }),
    rec<SavedView>('sv_rpt_002', { companyId: co, module: 'reports', register: 'ar-ageing', name: 'AR ageing — Head Office, > 60 days', filters: { branchId: IDS.brHO, bucket: 'd6190' }, isDefault: false, ownerId: IDS.uPriya, shared: true, createdAt: '2026-08-14T10:00:00.000Z', updatedAt: '2026-08-14T10:00:00.000Z' }),
    rec<SavedView>('sv_rpt_003', { companyId: co, module: 'reports', register: 'stock-valuation', name: 'Stock valuation — Main WH only', filters: { warehouseId: IDS.whMain }, isDefault: false, ownerId: IDS.uVikram, shared: false, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }),
  ];
  return { [C.savedViews]: savedViews as any };
}
