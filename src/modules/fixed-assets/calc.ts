// Pure depreciation maths — no store imports so the seed can reuse it (FR-AST-003).
import type { Asset, DepreciationLine } from './types';

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function periodBounds(period: string): { start: string; end: string; days: number } {
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  const days = new Date(y, m, 0).getDate();
  return { start: `${period}-01`, end: `${period}-${String(days).padStart(2, '0')}`, days };
}

export function accumulated(asset: Asset): number {
  return r2(asset.openingAccumulated + asset.postedDepreciation);
}

/** Net book value = cost + revaluation − impairment − accumulated depreciation. */
export function nbv(asset: Asset): number {
  return r2(asset.cost + asset.revaluation - asset.impairment - accumulated(asset));
}

export function depreciableBase(asset: Asset): number {
  return r2(asset.cost + asset.revaluation - asset.impairment - asset.residual);
}

/** Monthly depreciation for an asset in a period; returns null when nothing to post (not in service, disposed, fully depreciated). */
export function depreciationFor(asset: Asset, period: string): DepreciationLine | null {
  if (asset.status === 'Disposed' || asset.status === 'Draft') return null;
  const { start, end, days } = periodBounds(period);
  if (asset.inServiceDate > end) return null;
  if (asset.disposal && asset.disposal.date < start) return null;
  const opening = nbv(asset);
  const floor = asset.residual;
  if (opening <= floor + 0.005) return null;
  const rate = asset.ratePct > 0 ? asset.ratePct : asset.usefulLifeYears > 0 ? 100 / asset.usefulLifeYears : 0;
  let annual = asset.method === 'WDV' ? (opening * rate) / 100 : (depreciableBase(asset) * rate) / 100;
  let monthly = annual / 12;
  // proration for in-service month
  let daysInService = days;
  if (asset.inServiceDate > start) {
    const d = parseInt(asset.inServiceDate.slice(8, 10), 10);
    daysInService = days - d + 1;
    monthly = (monthly * daysInService) / days;
  }
  if (asset.disposal && asset.disposal.date <= end && asset.disposal.date >= start) {
    const d = parseInt(asset.disposal.date.slice(8, 10), 10);
    daysInService = Math.min(daysInService, d);
    monthly = (annual / 12) * (daysInService / days);
  }
  let dep = r2(monthly);
  if (opening - dep < floor) dep = r2(opening - floor);
  if (dep <= 0) return null;
  return {
    assetId: asset.id,
    assetNumber: asset.number,
    assetName: asset.name,
    categoryName: asset.categoryName,
    method: asset.method,
    ratePct: rate,
    openingNbv: opening,
    depreciation: dep,
    closingNbv: r2(opening - dep),
    daysInService,
    daysInPeriod: days,
    dimensions: asset.dimensions ?? {},
    depreciationAccountId: asset.depreciationAccountId,
    accumulatedAccountId: asset.accumulatedAccountId,
    note: daysInService < days ? `Prorated ${daysInService}/${days} days` : opening - dep <= floor + 0.005 ? 'Reaches residual value — asset fully depreciated' : undefined,
  };
}

/** Projected schedule by period from a starting state (does not mutate). */
export function projectSchedule(asset: Asset, fromPeriod: string, months: number): { period: string; openingNbv: number; depreciation: number; closingNbv: number }[] {
  const out: { period: string; openingNbv: number; depreciation: number; closingNbv: number }[] = [];
  let cur: Asset = { ...asset };
  let period = fromPeriod;
  for (let i = 0; i < months; i++) {
    const line = depreciationFor(cur, period);
    if (!line) {
      if (nbv(cur) <= cur.residual + 0.005) break;
      out.push({ period, openingNbv: nbv(cur), depreciation: 0, closingNbv: nbv(cur) });
    } else {
      out.push({ period, openingNbv: line.openingNbv, depreciation: line.depreciation, closingNbv: line.closingNbv });
      cur = { ...cur, postedDepreciation: r2(cur.postedDepreciation + line.depreciation) };
    }
    const [y, m] = period.split('-').map((x) => parseInt(x, 10));
    const d = new Date(y, m, 1);
    period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return out;
}

export function methodLabel(a: { method: string; ratePct: number }): string {
  return `${a.method} ${a.ratePct}%`;
}
