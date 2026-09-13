// Fixed-asset lifecycle (FR-AST-002..005): capitalize, depreciation run (duplicate-period block, reverse), transfer,
// revaluation / impairment, disposal — every financial event posts through engine.postJournal.
import { db, C, engine, ValidationError, IDS } from '../../store';
import type { DocHeader } from '../../store';
import { round, today, fiscalYearOf } from '../../lib/format';
import type { Asset, AssetCategory, AssetEvent, DepreciationRun, DepreciationLine } from './types';
import { depreciationFor, nbv, accumulated, periodBounds } from './calc';

function event(a: Asset, type: AssetEvent['type'], date: string, detail: string, extra: Partial<AssetEvent> = {}): AssetEvent {
  return db.insert<AssetEvent>(C.assetEvents, { assetId: a.id, assetNumber: a.number, assetName: a.name, type, date, detail, by: engine.ctx().userName, status: 'Posted', ...extra });
}

export interface CapitalizeInput {
  name: string; description?: string; categoryId: string; location: string; branchId?: string; custodianId?: string; acquisitionDate: string; capitalizationDate: string; inServiceDate: string;
  cost: number; residual: number; usefulLifeYears?: number; method?: 'WDV' | 'SLM'; ratePct?: number; dimensions?: Record<string, string>; quantity?: number; serialNo?: string; warrantyUntil?: string; notes?: string;
  /** source */
  sourceType?: 'Vendor Invoice' | 'GRN' | 'Manual'; sourceId?: string; sourceNumber?: string; supplierId?: string; supplierName?: string;
  /** manual: credit account (bank / CWIP / AP) */
  creditAccountId?: string; postJournal: boolean;
}

export function capitalize(input: CapitalizeInput): Asset {
  const cat = db.find<AssetCategory>(C.assetCategories, input.categoryId);
  if (!cat) throw new ValidationError('Choose an asset category', 'VALIDATION', 'categoryId');
  if (input.cost <= 0) throw new ValidationError('Cost must be positive', 'VALIDATION', 'cost');
  if (input.residual < 0 || input.residual >= input.cost) throw new ValidationError('Residual value must be below cost', 'VALIDATION', 'residual');
  if (input.postJournal) engine.assertPostable(input.capitalizationDate);
  return db.transaction(() => {
    const c = engine.ctx();
    const number = engine.allocateNumber('Asset', { date: input.capitalizationDate });
    const custodian = db.find<any>(C.employees, input.custodianId);
    const dims = { CostCentre: IDS.dimCCMumbai, ...(input.dimensions ?? {}) };
    let journal: { id: string; number: string } | undefined;
    if (input.postJournal) {
      const credit = input.creditAccountId ?? (input.sourceType === 'Vendor Invoice' ? IDS.accAP : IDS.accWIP);
      const creditAcc = db.find<any>(C.accounts, credit);
      journal = engine.postJournal({ date: input.capitalizationDate, branchId: input.branchId, sourceType: 'Asset Capitalization', sourceNumber: number, narration: `Capitalize ${number} · ${input.name}${input.sourceNumber ? ' · ' + input.sourceNumber : ''}`, lines: [{ accountId: cat.assetAccountId, dr: input.cost, dimensions: dims, narration: input.name }, { accountId: credit, cr: input.cost, partyType: creditAcc?.controlType === 'AP' ? 'Supplier' : undefined, partyId: creditAcc?.controlType === 'AP' ? input.supplierId : undefined, partyName: creditAcc?.controlType === 'AP' ? input.supplierName : undefined, narration: input.sourceType === 'Vendor Invoice' ? 'Reclassified from purchases' : 'Capitalized' }], idempotencyKey: `asset:${number}:capitalize` });
    }
    const asset = db.insert<Asset>(C.assets, {
      number, name: input.name, description: input.description, categoryId: cat.id, categoryName: cat.name, location: input.location, branchId: input.branchId ?? c.branchId, custodianId: input.custodianId, custodianName: custodian?.name,
      acquisitionDate: input.acquisitionDate, capitalizationDate: input.capitalizationDate, inServiceDate: input.inServiceDate, cost: input.cost, residual: input.residual, usefulLifeYears: input.usefulLifeYears ?? cat.usefulLifeYears, method: input.method ?? cat.method, ratePct: input.ratePct ?? cat.ratePct,
      openingAccumulated: 0, postedDepreciation: 0, revaluation: 0, impairment: 0, assetAccountId: cat.assetAccountId, depreciationAccountId: cat.depreciationAccountId, accumulatedAccountId: cat.accumulatedAccountId, dimensions: dims,
      supplierId: input.supplierId, supplierName: input.supplierName, sourceType: input.sourceType ?? 'Manual', sourceId: input.sourceId, sourceNumber: input.sourceNumber, journalId: journal?.id, journalNumber: journal?.number, status: input.inServiceDate > today() ? 'New' : 'Active', quantity: input.quantity, serialNo: input.serialNo, warrantyUntil: input.warrantyUntil, notes: input.notes, correlationId: `corr_${number}`,
    });
    event(asset, 'Capitalized', input.capitalizationDate, `Capitalized at ${input.cost.toLocaleString('en-IN')} · ${input.sourceType ?? 'Manual'}${input.sourceNumber ? ' · ' + input.sourceNumber : ''}${journal ? ' · ' + journal.number : ' · no journal (already in PPE)'}`, { amount: input.cost, journalId: journal?.id, journalNumber: journal?.number });
    engine.audit({ action: 'asset.capitalized', objectType: 'Asset', objectId: asset.id, objectNumber: number, detail: `${input.name} · ${input.cost}${journal ? ' · ' + journal.number : ''}`, correlationId: asset.correlationId });
    return asset;
  });
}

/** Posted vendor-invoice lines available to capitalize (not yet linked to an asset). */
export function capitalizableLines(): { doc: DocHeader; line: DocHeader['lines'][number]; capital: boolean }[] {
  const cid = engine.ctx().companyId;
  const linked = new Set(db.get<Asset>(C.assets).map((a) => `${a.sourceId}:${a.notes ?? ''}`));
  const out: { doc: DocHeader; line: DocHeader['lines'][number]; capital: boolean }[] = [];
  db.where<DocHeader>(C.vendorInvoices, (d) => (!d.companyId || d.companyId === cid) && (d.status === 'Posted' || d.status === 'Partially Paid' || d.status === 'Paid' || d.status === 'Settled')).forEach((d) => (d.lines ?? []).forEach((l) => {
    const item = db.find<any>(C.items, l.itemId);
    const capital = item?.type === 'Asset' || l.accountId === IDS.accPPE || l.accountId === IDS.accIntangible || l.accountId === IDS.accWIP || /capital|asset|machine|laptop|vehicle|forklift/i.test(`${l.itemName} ${l.description ?? ''}`);
    if (!db.findBy<Asset>(C.assets, (a) => a.sourceId === d.id && a.notes === `line:${l.id}`)) out.push({ doc: d, line: l, capital });
  }));
  void linked;
  return out.sort((a, b) => (Number(b.capital) - Number(a.capital)) || b.doc.date.localeCompare(a.doc.date));
}

export function computeRun(period: string): DepreciationLine[] {
  const cid = engine.ctx().companyId;
  const lines: DepreciationLine[] = [];
  db.where<Asset>(C.assets, (a) => (!a.companyId || a.companyId === cid)).forEach((a) => { const l = depreciationFor(a, period); if (l) lines.push(l); });
  return lines.sort((a, b) => a.assetNumber.localeCompare(b.assetNumber));
}

export function existingRun(period: string): DepreciationRun | undefined {
  return db.findBy<DepreciationRun>(C.depreciationRuns, (r) => r.period === period && r.status === 'Posted');
}

export function postDepreciation(period: string, lines: DepreciationLine[]): DepreciationRun {
  if (existingRun(period)) throw new ValidationError(`Depreciation for ${period} is already posted (${existingRun(period)!.number}) — reverse it before re-running`, 'DUPLICATE_PERIOD');
  if (!lines.length) throw new ValidationError('Nothing to depreciate in this period', 'EMPTY');
  const { end } = periodBounds(period);
  engine.assertPostable(end);
  return db.transaction(() => {
    const c = engine.ctx();
    const number = engine.allocateNumber('Depreciation Run', { date: end });
    const total = round(lines.reduce((s, l) => s + l.depreciation, 0));
    const byAcc = new Map<string, number>();
    lines.forEach((l) => byAcc.set(l.accumulatedAccountId, round((byAcc.get(l.accumulatedAccountId) ?? 0) + l.depreciation)));
    const j = engine.postJournal({ date: end, sourceType: 'Depreciation Run', sourceNumber: number, narration: `Depreciation ${period} · ${lines.length} assets`, lines: [...lines.map((l) => ({ accountId: l.depreciationAccountId, dr: l.depreciation, dimensions: l.dimensions, narration: `${l.assetNumber} · ${l.assetName}` })), ...Array.from(byAcc.entries()).map(([accountId, cr]) => ({ accountId, cr, narration: `Accumulated depreciation ${period}` }))], idempotencyKey: `dep:${period}:${number}` });
    const run = db.insert<DepreciationRun>(C.depreciationRuns, { number, period, fy: fiscalYearOf(end, c.fyStartMonth), status: 'Posted', lines, total, assetCount: lines.length, journalId: j.id, journalNumber: j.number, postedAt: new Date().toISOString(), postedBy: c.userName, branchId: c.branchId, correlationId: j.correlationId });
    lines.forEach((l) => {
      const a = db.find<Asset>(C.assets, l.assetId)!;
      const posted = round(a.postedDepreciation + l.depreciation);
      const fully = round(a.cost + a.revaluation - a.impairment - a.openingAccumulated - posted) <= a.residual + 0.005;
      db.update<Asset>(C.assets, a.id, { postedDepreciation: posted, status: fully ? 'Fully Depreciated' : a.status === 'New' ? 'Active' : a.status });
      event(a, 'Depreciated', end, `${number} · ${l.method} ${l.ratePct}% · NBV ${l.openingNbv.toLocaleString('en-IN')} → ${l.closingNbv.toLocaleString('en-IN')}${l.note ? ' · ' + l.note : ''}`, { amount: l.depreciation, journalId: j.id, journalNumber: j.number });
    });
    engine.audit({ action: 'depreciation.posted', objectType: 'Depreciation Run', objectId: run.id, objectNumber: number, detail: `${period} · ${lines.length} assets · ${total} · ${j.number}`, correlationId: j.correlationId });
    engine.notify({ type: 'system', title: `Depreciation ${period} posted`, body: `${number} · ${total.toLocaleString('en-IN')} · ${j.number}`, link: `fixed-assets/depreciation` });
    return run;
  });
}

export function reverseDepreciation(run: DepreciationRun, reason: string): DepreciationRun {
  if (run.status !== 'Posted' || !run.journalId) throw new ValidationError('Only posted runs can be reversed', 'INVALID_STATE');
  // later runs must be reversed first
  const later = db.findBy<DepreciationRun>(C.depreciationRuns, (r) => r.status === 'Posted' && r.period > run.period);
  if (later) throw new ValidationError(`Reverse ${later.number} (${later.period}) first — runs must be reversed in reverse order`, 'ORDER');
  return db.transaction(() => {
    const rj = engine.reverseJournal(run.journalId!, { reason });
    const rev = db.insert<DepreciationRun>(C.depreciationRuns, { number: `${run.number}-R`, period: run.period, fy: run.fy, status: 'Posted', lines: run.lines.map((l) => ({ ...l, depreciation: -l.depreciation, openingNbv: l.closingNbv, closingNbv: l.openingNbv })), total: -run.total, assetCount: run.assetCount, journalId: rj.id, journalNumber: rj.number, postedAt: new Date().toISOString(), postedBy: engine.ctx().userName, reversalOfId: run.id, reversalReason: reason, branchId: run.branchId, correlationId: run.correlationId });
    run.lines.forEach((l) => { const a = db.find<Asset>(C.assets, l.assetId); if (!a) return; db.update<Asset>(C.assets, a.id, { postedDepreciation: round(a.postedDepreciation - l.depreciation), status: a.status === 'Fully Depreciated' ? 'Active' : a.status }); event(a, 'Reversed', today(), `${run.number} reversed: ${reason}`, { amount: -l.depreciation, journalId: rj.id, journalNumber: rj.number, reason }); });
    const out = db.update<DepreciationRun>(C.depreciationRuns, run.id, { status: 'Reversed', reversedById: rev.id, reversalReason: reason });
    engine.audit({ action: 'depreciation.reversed', objectType: 'Depreciation Run', objectId: run.id, objectNumber: run.number, detail: `${reason} · ${rj.number}`, correlationId: run.correlationId });
    return out;
  });
}

export function transferAsset(a: Asset, input: { location?: string; branchId?: string; custodianId?: string; reason: string; date: string; requireApproval: boolean }): AssetEvent {
  const custodian = db.find<any>(C.employees, input.custodianId);
  const from = [a.location, db.find<any>(C.branches, a.branchId)?.name, a.custodianName].filter(Boolean).join(' / ');
  const to = [input.location ?? a.location, db.find<any>(C.branches, input.branchId ?? a.branchId)?.name, custodian?.name ?? a.custodianName].filter(Boolean).join(' / ');
  if (from === to) throw new ValidationError('Nothing changed — choose a new location, branch or custodian', 'VALIDATION');
  return db.transaction(() => {
    const ev = event(a, 'Transferred', input.date, `${from} → ${to}`, { from, to, reason: input.reason, status: input.requireApproval ? 'Pending' : 'Posted', meta: { location: input.location, branchId: input.branchId, custodianId: input.custodianId } });
    if (input.requireApproval) {
      const req = engine.submitForApproval({ docType: 'Asset Transfer', collection: C.assetEvents, docId: ev.id, docNumber: `${a.number} transfer`, amount: nbv(a), summary: `${a.name}: ${from} → ${to}`, skipStatusUpdate: true });
      if (req) { db.update<AssetEvent>(C.assetEvents, ev.id, { approvalId: req.id, status: 'Pending' }); return db.find<AssetEvent>(C.assetEvents, ev.id)!; }
    }
    applyTransfer(db.find<AssetEvent>(C.assetEvents, ev.id)!);
    return db.find<AssetEvent>(C.assetEvents, ev.id)!;
  });
}

export function applyTransfer(ev: AssetEvent) {
  const a = db.find<Asset>(C.assets, ev.assetId);
  if (!a) return;
  const m = ev.meta ?? {};
  const custodian = db.find<any>(C.employees, m.custodianId as string);
  db.update<Asset>(C.assets, a.id, { location: (m.location as string) || a.location, branchId: (m.branchId as string) || a.branchId, custodianId: (m.custodianId as string) || a.custodianId, custodianName: custodian?.name ?? a.custodianName, dimensions: { ...a.dimensions, ...(m.branchId === IDS.brAndheri ? { CostCentre: 'dim_cc_and' } : {}) } });
  db.update<AssetEvent>(C.assetEvents, ev.id, { status: 'Posted' });
  engine.audit({ action: 'asset.transferred', objectType: 'Asset', objectId: a.id, objectNumber: a.number, detail: `${ev.from} → ${ev.to} · ${ev.reason}` });
}

export function revalueAsset(a: Asset, input: { kind: 'Revaluation' | 'Impairment'; amount: number; date: string; reason: string }): AssetEvent {
  if (input.amount <= 0) throw new ValidationError('Amount must be positive', 'VALIDATION', 'amount');
  engine.assertPostable(input.date);
  const before = nbv(a);
  return db.transaction(() => {
    const isUp = input.kind === 'Revaluation';
    const j = engine.postJournal({ date: input.date, sourceType: isUp ? 'Asset Revaluation' : 'Asset Impairment', sourceNumber: a.number, narration: `${input.kind} of ${a.number} ${a.name}: ${input.reason}`, lines: isUp
      ? [{ accountId: a.assetAccountId, dr: input.amount, dimensions: a.dimensions, narration: 'Revaluation surplus' }, { accountId: IDS.accRetained, cr: input.amount, narration: 'Revaluation reserve (equity)' }]
      : [{ accountId: 'acc_5810', dr: input.amount, dimensions: a.dimensions, narration: 'Impairment loss' }, { accountId: a.accumulatedAccountId, cr: input.amount, narration: 'Impairment provision' }], idempotencyKey: `asset:${a.id}:${input.kind}:${input.date}:${input.amount}` });
    db.update<Asset>(C.assets, a.id, isUp ? { revaluation: round(a.revaluation + input.amount) } : { impairment: round(a.impairment + input.amount) });
    const after = round(before + (isUp ? input.amount : -input.amount));
    const ev = event(a, isUp ? 'Revalued' : 'Impaired', input.date, `${input.kind} ${input.amount.toLocaleString('en-IN')} · carrying amount ${before.toLocaleString('en-IN')} → ${after.toLocaleString('en-IN')} · ${j.number}`, { amount: isUp ? input.amount : -input.amount, reason: input.reason, journalId: j.id, journalNumber: j.number });
    engine.audit({ action: isUp ? 'asset.revalued' : 'asset.impaired', objectType: 'Asset', objectId: a.id, objectNumber: a.number, detail: `${input.amount} · ${input.reason} · ${j.number}` });
    return ev;
  });
}

export function disposeAsset(a: Asset, input: { date: string; proceeds: number; buyer?: string; reason: string; receiptAccountId: string }): Asset {
  if (a.status === 'Disposed') throw new ValidationError('Asset already disposed', 'INVALID_STATE');
  engine.assertPostable(input.date);
  return db.transaction(() => {
    const carrying = nbv(a);
    const acc = accumulated(a);
    const gain = round(input.proceeds - carrying);
    const lines = [
      ...(input.proceeds > 0 ? [{ accountId: input.receiptAccountId, dr: input.proceeds, narration: `Proceeds${input.buyer ? ' from ' + input.buyer : ''}` }] : []),
      ...(acc > 0 ? [{ accountId: a.accumulatedAccountId, dr: acc, narration: 'Accumulated depreciation written back' }] : []),
      { accountId: a.assetAccountId, cr: round(a.cost + a.revaluation), dimensions: a.dimensions, narration: `Cost of ${a.number} written off` },
      ...(a.impairment > 0 ? [{ accountId: a.accumulatedAccountId, dr: a.impairment, narration: 'Impairment provision written back' }] : []),
      ...(gain > 0 ? [{ accountId: 'acc_4130', cr: gain, narration: 'Gain on disposal' }] : gain < 0 ? [{ accountId: 'acc_5810', dr: -gain, dimensions: a.dimensions, narration: 'Loss on disposal' }] : []),
    ];
    const j = engine.postJournal({ date: input.date, sourceType: 'Asset Disposal', sourceNumber: a.number, narration: `Disposal of ${a.number} ${a.name}: ${input.reason}`, lines, idempotencyKey: `asset:${a.id}:dispose` });
    const out = db.update<Asset>(C.assets, a.id, { status: 'Disposed', disposal: { date: input.date, proceeds: input.proceeds, buyer: input.buyer, reason: input.reason, nbvAtDisposal: carrying, accumulatedAtDisposal: acc, gainLoss: gain, journalId: j.id, journalNumber: j.number, receiptAccountId: input.receiptAccountId } });
    event(a, 'Disposed', input.date, `Disposed${input.buyer ? ' to ' + input.buyer : ''} · proceeds ${input.proceeds.toLocaleString('en-IN')} · ${gain >= 0 ? 'gain' : 'loss'} ${Math.abs(gain).toLocaleString('en-IN')} · ${j.number}`, { amount: gain, reason: input.reason, journalId: j.id, journalNumber: j.number });
    engine.audit({ action: 'asset.disposed', objectType: 'Asset', objectId: a.id, objectNumber: a.number, detail: `Proceeds ${input.proceeds} · gain/loss ${gain} · ${j.number}` });
    engine.notify({ type: 'system', title: `${a.number} disposed`, body: `${a.name} · ${gain >= 0 ? 'gain' : 'loss'} ${Math.abs(gain).toLocaleString('en-IN')}`, link: `fixed-assets/register/${a.id}` });
    return out;
  });
}
