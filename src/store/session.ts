// Session: authenticated user + active tenant/company/branch/period context.
// Every business screen must read scope from here (FR-3.1). Switching company
// refreshes permissions, defaults, currency, time zone, period and modules.

import { useSyncExternalStore } from 'react';
import { db } from './db';
import { C } from './collections';
import type { Company, Branch, Period, Role, User, Tenant, Plan } from './types';
import { fiscalYearOf, periodCodeOf, today } from '../lib/format';

export type AuthState = 'login' | 'register' | 'onboarding' | 'mfa' | 'forgot' | 'reset' | 'invite' | 'choose-company' | 'app';

export interface SessionState {
  auth: AuthState;
  userId?: string;
  tenantId?: string;
  companyId?: string;
  branchId?: string;
  fy?: string;
  periodCode?: string;
  pendingUserId?: string;
  inviteToken?: string;
  loginBanner?: string;
}

const KEY = 'elixir-books-session';
let state: SessionState = load();
const listeners = new Set<() => void>();

function load(): SessionState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { auth: 'login' };
}

function set(patch: Partial<SessionState>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function defaultScopeFor(user: User, companyId?: string): Partial<SessionState> {
  const cid = companyId ?? user.companyIds[0];
  const company = db.find<Company>(C.companies, cid);
  const branches = db.where<Branch>(C.branches, (b) => b.companyId === cid && b.status === 'Active');
  const allowed = user.branchIds.length ? branches.filter((b) => user.branchIds.includes(b.id)) : branches;
  const branch = allowed.find((b) => b.isDefault) ?? allowed[0] ?? branches[0];
  const fyStart = company?.fiscalYearStartMonth ?? 4;
  const fy = fiscalYearOf(today(), fyStart);
  const open = db.where<Period>(C.periods, (p) => p.companyId === cid && (p.status === 'Open' || p.status === 'Reopened'));
  const current = open.find((p) => p.code === periodCodeOf(today())) ?? open[0];
  return { companyId: cid, branchId: branch?.id, fy, periodCode: current?.code ?? periodCodeOf(today()) };
}

export const session = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  setAuth(auth: AuthState, extra: Partial<SessionState> = {}) {
    set({ auth, ...extra });
  },
  /** Complete a login for the given user. Applies MFA / company-choice gates. */
  login(userId: string, opts: { skipMfa?: boolean } = {}) {
    const user = db.find<User>(C.users, userId);
    if (!user) throw new Error('User not found');
    if (user.status === 'Suspended' || user.status === 'Deactivated') throw new Error(`Account is ${user.status.toLowerCase()} — contact your administrator`);
    if (user.mfaEnabled && !opts.skipMfa) {
      set({ auth: 'mfa', pendingUserId: userId });
      return;
    }
    db.update<User>(C.users, userId, { lastLoginAt: new Date().toISOString(), status: user.status === 'Invited' ? 'Active' : user.status });
    if (user.companyIds.length > 1) {
      set({ auth: 'choose-company', userId, tenantId: user.tenantId, pendingUserId: undefined });
      return;
    }
    set({ auth: 'app', userId, tenantId: user.tenantId, pendingUserId: undefined, ...defaultScopeFor(user) });
    db.insert(C.audit, {
      at: new Date().toISOString(),
      actor: user.name,
      actorId: user.id,
      tenantId: user.tenantId,
      action: 'auth.login',
      objectType: 'User',
      objectId: user.id,
      result: 'Success',
      correlationId: 'corr_' + Date.now().toString(36),
      channel: 'web',
      companyId: user.companyIds[0],
    });
  },
  completeMfa() {
    if (!state.pendingUserId) return;
    session.login(state.pendingUserId, { skipMfa: true });
  },
  chooseCompany(companyId: string) {
    const user = db.find<User>(C.users, state.userId);
    if (!user) return;
    set({ auth: 'app', ...defaultScopeFor(user, companyId), loginBanner: undefined });
  },
  switchCompany(companyId: string) {
    const user = db.find<User>(C.users, state.userId);
    if (!user) return;
    const company = db.find<Company>(C.companies, companyId);
    const scope = defaultScopeFor(user, companyId);
    const branch = db.find<Branch>(C.branches, scope.branchId);
    set({ ...scope, loginBanner: `Now working in ${company?.tradeName ?? company?.legalName}${branch ? ' · ' + branch.name : ''}` });
    setTimeout(() => set({ loginBanner: undefined }), 4000);
  },
  setBranch(branchId: string) {
    set({ branchId });
  },
  setPeriod(periodCode: string) {
    set({ periodCode });
  },
  logout() {
    const user = db.find<User>(C.users, state.userId);
    if (user) {
      db.insert(C.audit, {
        at: new Date().toISOString(),
        actor: user.name,
        actorId: user.id,
        action: 'auth.logout',
        objectType: 'User',
        objectId: user.id,
        result: 'Success',
        correlationId: 'corr_' + Date.now().toString(36),
        channel: 'web',
        companyId: state.companyId,
      });
    }
    set({ auth: 'login', userId: undefined, tenantId: undefined, companyId: undefined, branchId: undefined, fy: undefined, periodCode: undefined, pendingUserId: undefined });
  },
  dismissBanner() {
    set({ loginBanner: undefined });
  },
};

// Feed the db with the current actor so createdBy/companyId are stamped automatically.
db.setActorGetter(() => {
  const u = db.find<User>(C.users, state.userId);
  return { id: u?.id, name: u?.name ?? 'system', companyId: state.companyId };
});

/** Derived, memo-friendly view of the session for components. */
export interface Scope {
  state: SessionState;
  user?: User;
  tenant?: Tenant;
  plan?: Plan;
  company?: Company;
  branch?: Branch;
  branches: Branch[];
  companies: Company[];
  period?: Period;
  periods: Period[];
  roles: Role[];
  permissions: string[];
  isTenantOwner: boolean;
  isPlatformAdmin: boolean;
  currency: string;
  /** permission check: can('sales.invoice.post') */
  can: (perm: string) => boolean;
  /** any permission within a module — used for nav and route gating */
  canModule: (moduleId: string) => boolean;
  /** entitlement check: entitled('payroll') */
  entitled: (moduleId: string) => boolean;
  /** active operating profiles for the company */
  profiles: string[];
}


/**
 * Permission strings are "<module>.<resource>.<action>"; any segment may be "*"
 * and a granted permission may be shorter than the requested one when it ends in
 * "*" ("sales.*" covers "sales.invoice.post", "*.*.view" covers "sales.invoice.view").
 */
export function permissionMatches(granted: string, requested: string): boolean {
  if (granted === '*' || granted === requested) return true;
  const g = granted.split('.');
  const r = requested.split('.');
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '*') continue;
    if (i >= r.length) return false;
    if (g[i] !== r[i]) return false;
  }
  // a shorter grant only widens when it ends in a wildcard
  return g.length >= r.length || g[g.length - 1] === '*';
}

export function computeScope(): Scope {
  const s = state;
  const user = db.find<User>(C.users, s.userId);
  const tenant = db.find<Tenant>(C.tenants, s.tenantId ?? user?.tenantId);
  const plan = db.find<Plan>(C.plans, tenant?.planId);
  const company = db.find<Company>(C.companies, s.companyId);
  const companies = user ? db.where<Company>(C.companies, (c) => user.companyIds.includes(c.id)) : [];
  const branchesAll = db.where<Branch>(C.branches, (b) => b.companyId === s.companyId && b.status === 'Active');
  const branches = user && user.branchIds.length ? branchesAll.filter((b) => user.branchIds.includes(b.id)) : branchesAll;
  const branch = db.find<Branch>(C.branches, s.branchId) ?? branches[0];
  const periods = db.where<Period>(C.periods, (p) => p.companyId === s.companyId).sort((a, b) => a.code.localeCompare(b.code));
  const period = periods.find((p) => p.code === s.periodCode) ?? periods.find((p) => p.status === 'Open');
  const roles = user ? db.where<Role>(C.roles, (r) => user.roleIds.includes(r.id)) : [];
  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));
  const isTenantOwner = !!user?.isTenantOwner;
  const isPlatformAdmin = !!user?.isPlatformAdmin;
  const can = (perm: string) => {
    if (!user) return false;
    if (isTenantOwner || isPlatformAdmin) return true;
    if (permissions.includes('*')) return true;
    return permissions.some((granted) => permissionMatches(granted, perm));
  };
  /** Does the user hold any permission at all within this module? (nav + route gating) */
  const canModule = (moduleId: string) =>
    can(`${moduleId}.view`) || can(`${moduleId}.*`) || permissions.some((p) => {
      const seg = p.split('.');
      return seg[0] === moduleId || seg[0] === '*';
    });
  const entitled = (moduleId: string) => {
    if (isPlatformAdmin) return true;
    if (!plan) return true;
    if (tenant && (tenant.subscriptionState === 'Suspended' || tenant.subscriptionState === 'Expired')) return ['home', 'admin', 'platform'].includes(moduleId);
    return plan.modules.includes('*') || plan.modules.includes(moduleId);
  };
  return {
    state: s,
    user,
    tenant,
    plan,
    company,
    branch,
    branches,
    companies,
    period,
    periods,
    roles,
    permissions,
    isTenantOwner,
    isPlatformAdmin,
    currency: company?.baseCurrency ?? 'INR',
    can,
    canModule,
    entitled,
    profiles: company?.profiles ?? [],
  };
}

let cachedScope: Scope | null = null;
let cachedKey = '';
function scopeKey() {
  return JSON.stringify(state) + '|' + db.get(C.users).length + '|' + db.get(C.companies).length;
}
function getScope(): Scope {
  const key = scopeKey();
  if (!cachedScope || key !== cachedKey) {
    cachedScope = computeScope();
    cachedKey = key;
  }
  return cachedScope;
}

const subscribeBoth = (l: () => void) => {
  const a = session.subscribe(l);
  const b = db.subscribe(() => {
    cachedScope = null;
    l();
  });
  return () => {
    a();
    b();
  };
};

export function useSession(): Scope {
  return useSyncExternalStore(subscribeBoth, getScope, getScope);
}

/** Non-reactive read for engine code. */
export function currentScope(): Scope {
  return computeScope();
}
