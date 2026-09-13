// Seed data for the fixed-assets module: categories, 7 legacy assets (+2 disposed), 5 posted depreciation runs
// with journals, disposal events and the asset event timeline. Owned by the fixed-assets module.
import type { DB } from '../db';
import type { Journal } from '../types';
import { C } from '../collections';
import { IDS, rec } from './core';
import type { Asset, AssetCategory, AssetEvent, DepreciationRun, DepreciationLine } from '../../modules/fixed-assets/types';
import { depreciationFor } from '../../modules/fixed-assets/calc';
import { seedJournal } from './payroll';
import type { PostingLine } from '../../modules/payroll/posting';

const co = IDS.acme;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function seedAssets(): Partial<DB> {
  const cat = (id: string, code: string, name: string, method: 'WDV' | 'SLM', ratePct: number, life: number, assetAccountId: string = IDS.accPPE): AssetCategory =>
    rec<AssetCategory>(id, { companyId: co, code, name, method, ratePct, usefulLifeYears: life, assetAccountId, depreciationAccountId: IDS.accDep, accumulatedAccountId: IDS.accAccDep, status: 'Active' });
  const categories: AssetCategory[] = [
    cat('acat_pm', 'PM', 'Plant & Machinery', 'WDV', 25, 8),
    cat('acat_bld', 'BLD', 'Buildings', 'SLM', 5, 20),
    cat('acat_int', 'INT', 'Intangibles', 'SLM', 20, 5, IDS.accIntangible),
    cat('acat_veh', 'VEH', 'Vehicles', 'WDV', 30, 10),
    cat('acat_comp', 'COMP', 'Computer Equipment', 'SLM', 33, 3),
    cat('acat_furn', 'FURN', 'Furniture & Fixtures', 'WDV', 10, 10),
  ];
  const catById = (id: string) => categories.find((c) => c.id === id)!;

  const asset = (id: string, number: string, name: string, categoryId: string, location: string, branchId: string, cost: number, openingAccumulated: number, residual: number, inService: string, status: Asset['status'], extra: Partial<Asset> = {}): Asset => {
    const c = catById(categoryId);
    return rec<Asset>(id, {
      companyId: co, number, name, categoryId, categoryName: c.name, location, branchId, acquisitionDate: extra.acquisitionDate ?? inService, capitalizationDate: extra.capitalizationDate ?? inService, inServiceDate: inService,
      cost, residual, usefulLifeYears: c.usefulLifeYears, method: c.method, ratePct: c.ratePct, openingAccumulated, postedDepreciation: 0, revaluation: 0, impairment: 0,
      assetAccountId: c.assetAccountId, depreciationAccountId: c.depreciationAccountId, accumulatedAccountId: c.accumulatedAccountId, dimensions: { CostCentre: branchId === IDS.brAndheri ? 'dim_cc_and' : IDS.dimCCMumbai }, status,
      correlationId: `corr_${id.toUpperCase()}`, createdAt: `${inService}T09:00:00.000Z`, updatedAt: `${inService}T09:00:00.000Z`, ...extra,
    });
  };
  const assets: Asset[] = [
    asset('fa_001', 'FA-001', 'CNC Milling Machine', 'acat_pm', 'Main WH', IDS.brHO, 2500000, 1250000, 50000, '2022-04-01', 'Active', { custodianId: IDS.eSuresh, custodianName: 'Suresh Kumar', supplierId: IDS.sBharatSteel, supplierName: 'Bharat Steel Suppliers', sourceType: 'Vendor Invoice', sourceNumber: 'VINV/22-23/0007', serialNo: 'CNC-MX-22-0417', warrantyUntil: '2025-03-31' }),
    asset('fa_002', 'FA-002', 'Office Building — Andheri', 'acat_bld', 'Andheri', IDS.brAndheri, 8500000, 510000, 0, '2023-04-01', 'Active', { custodianId: IDS.eVikram, custodianName: 'Vikram Singh', sourceType: 'Manual capitalization', sourceNumber: 'Sale deed 2023/114' }),
    asset('fa_003', 'FA-003', 'SAP ERP License', 'acat_int', 'Head Office', IDS.brHO, 1200000, 480000, 0, '2024-04-01', 'Active', { custodianId: IDS.eRahul, custodianName: 'Rahul Kumar', supplierName: 'SAP India Pvt Ltd', sourceType: 'Vendor Invoice', sourceNumber: 'VINV/24-25/0003' }),
    asset('fa_004', 'FA-004', 'Toyota Innova Fleet (3 units)', 'acat_veh', 'Mumbai', IDS.brHO, 3600000, 2160000, 180000, '2021-04-01', 'Active', { custodianId: IDS.eAnita, custodianName: 'Anita Rao', supplierName: 'Toyota Lakozy Motors', sourceType: 'Vendor Invoice', sourceNumber: 'VINV/21-22/0012', quantity: 3 }),
    asset('fa_005', 'FA-005', 'Laptop Fleet (15 units)', 'acat_comp', 'Head Office', IDS.brHO, 750000, 625000, 0, '2023-04-01', 'Active', { custodianId: IDS.eMeena, custodianName: 'Meena Joshi', supplierName: 'Ingram Micro', sourceType: 'Vendor Invoice', sourceNumber: 'VINV/23-24/0019', quantity: 15 }),
    asset('fa_006', 'FA-006', 'Forklift — Andheri WH', 'acat_pm', 'Andheri WH', IDS.brAndheri, 650000, 0, 20000, '2026-09-01', 'New', { custodianId: IDS.eSuresh, custodianName: 'Suresh Kumar', supplierId: IDS.sNational, supplierName: 'National Hardware Co', sourceType: 'Vendor Invoice', sourceNumber: 'VINV/26-27/0036', acquisitionDate: '2026-08-28', capitalizationDate: '2026-09-01', journalNumber: 'JV/26-27/0349', serialNo: 'FL-2026-8891', warrantyUntil: '2028-08-31' }),
    asset('fa_007', 'FA-007', 'Old Generator Set', 'acat_pm', 'Main WH', IDS.brHO, 280000, 280000, 0, '2014-04-01', 'Fully Depreciated', { custodianId: IDS.eSuresh, custodianName: 'Suresh Kumar', sourceType: 'Opening balance' }),
    asset('fa_ex_001', 'FA-EX-001', 'Old Diesel Generator 62 kVA', 'acat_pm', 'Main WH', IDS.brHO, 280000, 280000, 0, '2012-04-01', 'Disposed', { sourceType: 'Opening balance', disposal: { date: '2026-03-31', proceeds: 15000, buyer: 'Scrap dealer — M/s Patel Traders', reason: 'Beyond economic repair; replaced by FA-007', nbvAtDisposal: 0, accumulatedAtDisposal: 280000, gainLoss: 15000, journalNumber: 'JV/25-26/0388' } }),
    asset('fa_ex_002', 'FA-EX-002', 'Old Laptops (5 units)', 'acat_comp', 'Head Office', IDS.brHO, 125000, 112500, 0, '2022-10-01', 'Disposed', { sourceType: 'Opening balance', quantity: 5, disposal: { date: '2025-09-30', proceeds: 8000, buyer: 'Employees (buy-back scheme)', reason: 'End of life — 3-year refresh cycle', nbvAtDisposal: 12500, accumulatedAtDisposal: 112500, gainLoss: -4500, journalNumber: 'JV/25-26/0201' } }),
  ];

  // ── Depreciation runs Apr–Aug (DEP-RUN-002..006), lines computed by the shared calc ─────
  const runs: DepreciationRun[] = [];
  const journals: Journal[] = [];
  const events: AssetEvent[] = [];
  const state = new Map(assets.map((a) => [a.id, { ...a }]));
  ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'].forEach((period, i) => {
    const n = i + 2;
    const id = `dep_run_${String(n).padStart(3, '0')}`;
    const number = `DEP-RUN-${String(n).padStart(3, '0')}`;
    const lines: DepreciationLine[] = [];
    state.forEach((a) => { const l = depreciationFor(a, period); if (l) lines.push(l); });
    const total = r2(lines.reduce((s, l) => s + l.depreciation, 0));
    const [y, m] = period.split('-').map((x) => parseInt(x, 10));
    const date = `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    const postLines: PostingLine[] = [];
    lines.forEach((l) => postLines.push({ accountId: l.depreciationAccountId, dr: l.depreciation, dimensions: l.dimensions, narration: `${l.assetNumber} · ${l.assetName}` }));
    postLines.push({ accountId: IDS.accAccDep, cr: total, narration: `Accumulated depreciation ${period}` });
    const j = seedJournal(`jv_dep_${period.replace('-', '_')}`, `JV/26-27/03${String(60 + n).padStart(2, '0')}`, date, 'Depreciation Run', id, number, `Depreciation ${period} · ${lines.length} assets`, postLines, 'Anil Patil');
    journals.push(j);
    runs.push(rec<DepreciationRun>(id, { companyId: co, number, period, fy: '2026-27', status: 'Posted', lines, total, assetCount: lines.length, journalId: j.id, journalNumber: j.number, postedAt: `${date}T10:00:00.000Z`, postedBy: 'Anil Patil', branchId: IDS.brHO, correlationId: `corr_${id.toUpperCase()}`, createdAt: `${date}T09:30:00.000Z`, updatedAt: `${date}T10:00:00.000Z` }));
    lines.forEach((l) => {
      const a = state.get(l.assetId)!;
      a.postedDepreciation = r2(a.postedDepreciation + l.depreciation);
      events.push(rec<AssetEvent>(`aev_${l.assetId}_${period}`, { companyId: co, assetId: l.assetId, assetNumber: l.assetNumber, assetName: l.assetName, type: 'Depreciated', date, detail: `${number} · ${l.method} ${l.ratePct}% · NBV ${l.openingNbv.toLocaleString('en-IN')} → ${l.closingNbv.toLocaleString('en-IN')}`, amount: l.depreciation, journalId: j.id, journalNumber: j.number, by: 'Anil Patil', status: 'Posted', createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z` }));
    });
  });
  const finalAssets = assets.map((a) => {
    const s = state.get(a.id)!;
    const acc = r2(s.openingAccumulated + s.postedDepreciation);
    const status = s.status === 'Active' && a.cost - acc <= a.residual + 0.005 ? 'Fully Depreciated' : s.status;
    return { ...s, status } as Asset;
  });

  // ── Lifecycle events ───────────────────────────────────────────────────────
  const ev = (id: string, a: Asset, type: AssetEvent['type'], date: string, detail: string, extra: Partial<AssetEvent> = {}): AssetEvent =>
    rec<AssetEvent>(id, { companyId: co, assetId: a.id, assetNumber: a.number, assetName: a.name, type, date, detail, by: 'Rahul Kumar', status: 'Posted', createdAt: `${date}T09:00:00.000Z`, updatedAt: `${date}T09:00:00.000Z`, ...extra });
  assets.forEach((a) => events.unshift(ev(`aev_cap_${a.id}`, a, 'Capitalized', a.capitalizationDate, `Capitalized at ${a.cost.toLocaleString('en-IN')} · ${a.sourceType ?? 'Manual'}${a.sourceNumber ? ' · ' + a.sourceNumber : ''}`, { amount: a.cost, journalNumber: a.journalNumber })));
  events.push(ev('aev_trf_fa004', assets[3], 'Transferred', '2026-06-15', 'Custodian changed: Vikram Singh → Anita Rao (fleet handed to Admin)', { from: 'Vikram Singh', to: 'Anita Rao', reason: 'Fleet management moved to Admin department', by: 'Vikram Singh' }));
  events.push(ev('aev_trf_fa005', assets[4], 'Transferred', '2026-07-01', 'Location changed: Andheri → Head Office', { from: 'Andheri', to: 'Head Office', reason: 'Consolidated IT assets at HO', by: 'Meena Joshi' }));
  events.push(ev('aev_disp_ex001', assets[7], 'Disposed', '2026-03-31', 'Sold for scrap · proceeds 15,000 · gain 15,000', { amount: 15000, reason: 'Beyond economic repair', journalNumber: 'JV/25-26/0388', by: 'Anil Patil' }));
  events.push(ev('aev_disp_ex002', assets[8], 'Disposed', '2025-09-30', 'Employee buy-back · proceeds 8,000 · loss 4,500', { amount: -4500, reason: 'End of life', journalNumber: 'JV/25-26/0201', by: 'Anil Patil' }));

  return {
    [C.assetCategories]: categories as any,
    [C.assets]: finalAssets as any,
    [C.depreciationRuns]: runs as any,
    [C.assetEvents]: events as any,
    [C.journals]: journals as any,
  };
}
