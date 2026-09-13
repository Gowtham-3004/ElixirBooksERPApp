import type { Plan, PlanTier, Tenant } from './types';
import { C } from './collections';
import { db } from './db';
import { today } from '../lib/format';

/** Customer-facing plans, in their commercial order. `Pro` is a legacy tier only. */
export const PLAN_TIERS: readonly Exclude<PlanTier, 'Pro'>[] = ['Lite', 'Growth', 'Enterprise'];

export function tierRank(tier: PlanTier | string): number {
  const rank = PLAN_TIERS.indexOf(tier as Exclude<PlanTier, 'Pro'>);
  return rank === -1 ? 1 : rank;
}

export function usageForPlan(tenant: Tenant): Record<string, number> {
  const month = today().slice(0, 7);
  return {
    users: db.count(C.users, (u) => u.tenantId === tenant.id),
    companies: db.count(C.companies, (c) => c.tenantId === tenant.id),
    invoicesPerMonth: db.count(C.salesInvoices, (i) => i.status === 'Posted' && String(i.date).slice(0, 7) === month) || tenant.usage.invoicesPerMonth || 0,
    storageMb: tenant.usage.storageMb ?? 0,
  };
}

/** A plan change never changes business data. Downgrades are allowed only when current usage fits the new limits. */
export function switchBlockers(tenant: Tenant, target: Plan): string[] {
  const usage = usageForPlan(tenant);
  return Object.entries(target.limits).flatMap(([key, limit]) => usage[key] > limit
    ? [`${key === 'invoicesPerMonth' ? 'monthly invoices' : key} (${usage[key].toLocaleString('en-IN')} used; ${limit.toLocaleString('en-IN')} allowed)`]
    : []);
}
