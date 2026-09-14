// Module registry — the single source of truth for navigation, entitlement
// and routing. Each module lives in src/modules/<id>/index.tsx and renders its
// own sub-routes from the Route it receives.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { Route, Scope } from '../store';
import {
  HomeIcon, CheckCircleIcon, UsersIcon, ReceiptIcon, ShoppingCartIcon, PackageIcon, MonitorIcon, BookOpenIcon, BuildingIcon,
  PercentIcon, CreditCardIcon, LayersIcon, BarChartIcon, DatabaseIcon, CogIcon, FileTextIcon, ShieldCheckIcon, FactoryIcon, WalletIcon,
} from '../components/Icons';

export type NavGroup = 'WORKSPACE' | 'OPERATIONS' | 'FINANCE' | 'INSIGHT' | 'SETUP' | 'PLATFORM';

export interface ModuleProps {
  route: Route;
}

export interface ModuleDef {
  id: string;
  label: string;
  group: NavGroup;
  icon: ComponentType<{ size?: number; className?: string; color?: string }>;
  component: LazyExoticComponent<ComponentType<ModuleProps>>;
  /** show only when the company has one of these operating profiles */
  profiles?: string[];
  /** permission prefix required to see the module (e.g. "sales") */
  permission?: string;
  platformOnly?: boolean;
  /** full-bleed (no sidebar/context bar), e.g. POS terminal */
  fullBleed?: boolean;
  description: string;
}

export const MODULES: ModuleDef[] = [
  { id: 'home', label: 'Home', group: 'WORKSPACE', icon: HomeIcon, component: lazy(() => import('./home')), description: 'Role dashboard, onboarding checklist, recent documents' },
  { id: 'approvals', label: 'Approvals & Activity', group: 'WORKSPACE', icon: CheckCircleIcon, component: lazy(() => import('./approvals')), description: 'Approvals inbox, my requests, activity feed' },
  { id: 'crm', label: 'CRM', group: 'OPERATIONS', icon: UsersIcon, component: lazy(() => import('./crm')), permission: 'crm', description: 'Leads, customer 360, collections follow-up' },
  { id: 'sales', label: 'Sales', group: 'OPERATIONS', icon: ReceiptIcon, component: lazy(() => import('./sales')), permission: 'sales', description: 'Quotations, orders, deliveries, invoices, returns, receipts, AR' },
  { id: 'purchase', label: 'Purchase', group: 'OPERATIONS', icon: ShoppingCartIcon, component: lazy(() => import('./purchase')), permission: 'purchase', description: 'Requisitions, RFQ, POs, GRN, vendor invoices, matching, payments, AP' },
  { id: 'inventory', label: 'Inventory', group: 'OPERATIONS', icon: PackageIcon, component: lazy(() => import('./inventory')), permission: 'inventory', profiles: ['Trading', 'Manufacturing'], description: 'Stock, ledger, reservations, adjustments, transfers, counts, replenishment, landed cost' },
  { id: 'pos', label: 'POS', group: 'OPERATIONS', icon: MonitorIcon, component: lazy(() => import('./pos')), permission: 'pos', profiles: ['Trading'], fullBleed: true, description: 'POS terminal, shifts, bills, returns' },
  { id: 'projects', label: 'Projects & Contracts', group: 'OPERATIONS', icon: FileTextIcon, component: lazy(() => import('./projects')), permission: 'projects', profiles: ['Services'], description: 'Services profile: catalog, contracts, projects, timesheets, billing, revenue, profitability' },
  { id: 'production', label: 'Production', group: 'OPERATIONS', icon: FactoryIcon, component: lazy(() => import('./production')), permission: 'production', profiles: ['Manufacturing'], description: 'Manufacturing profile: BOM, routing, work centres, MRP, production orders, QC, subcontracting' },
  { id: 'accounting', label: 'Accounting', group: 'FINANCE', icon: BookOpenIcon, component: lazy(() => import('./accounting')), permission: 'accounting', description: 'COA, dimensions, journals, day book, ledgers, trial balance, opening balances, FX, period close' },
  { id: 'banking', label: 'Banking', group: 'FINANCE', icon: BuildingIcon, component: lazy(() => import('./banking')), permission: 'banking', description: 'Bank accounts, vouchers, payment batches, statement import, reconciliation' },
  { id: 'taxation', label: 'Taxation', group: 'FINANCE', icon: PercentIcon, component: lazy(() => import('./taxation')), permission: 'taxation', description: 'Tax config, GST registers, e-invoice, e-way bill, GSTR, TDS/TCS' },
  { id: 'payroll', label: 'Payroll', group: 'FINANCE', icon: CreditCardIcon, component: lazy(() => import('./payroll')), permission: 'payroll', description: 'Employees, salary structures, inputs, runs, payslips, statutory' },
  { id: 'fixed-assets', label: 'Fixed Assets', group: 'FINANCE', icon: LayersIcon, component: lazy(() => import('./fixed-assets')), permission: 'fixed-assets', description: 'Asset register, capitalization, depreciation, transfers, revaluation, disposal' },
  { id: 'budgets', label: 'Budgets & Expenses', group: 'FINANCE', icon: WalletIcon, component: lazy(() => import('./budgets')), permission: 'budgets', description: 'Budget definition, budget control, expense claims' },
  { id: 'reports', label: 'Reports', group: 'INSIGHT', icon: BarChartIcon, component: lazy(() => import('./reports')), permission: 'reports', description: 'Financial, inventory, sales/purchase, tax, FX, consolidation reports; CFO dashboard' },
  { id: 'masters', label: 'Masters & Imports', group: 'SETUP', icon: DatabaseIcon, component: lazy(() => import('./masters')), permission: 'masters', description: 'All master registers with forms and import wizard' },
  { id: 'admin', label: 'Company Administration', group: 'SETUP', icon: CogIcon, component: lazy(() => import('./admin')), permission: 'admin', description: 'Company, branches, periods, users, roles, numbering, workflows, templates, localization, plan, audit, integrations' },
  { id: 'platform', label: 'Platform Administration', group: 'PLATFORM', icon: ShieldCheckIcon, component: lazy(() => import('./platform')), platformOnly: true, description: 'Plans, tenants, subscriptions, usage' },
  // the All Settings hub — open to every signed-in user; each card link is gated on its own
  { id: 'setup', label: 'All Settings', group: 'SETUP', icon: CogIcon, component: lazy(() => import('./setup')), description: 'Organization, module and developer settings in one place' },
];

export const GROUP_ORDER: NavGroup[] = ['WORKSPACE', 'OPERATIONS', 'FINANCE', 'INSIGHT', 'SETUP', 'PLATFORM'];
/** Groups the app sidebar lists — SETUP and PLATFORM live behind the Setup hub instead. */
export const SIDEBAR_GROUPS: NavGroup[] = ['WORKSPACE', 'OPERATIONS', 'FINANCE', 'INSIGHT'];

/** Modules the signed-in user can see: platform gate, plan entitlement, operating profile, permission. */
export function visibleModuleIds(s: Scope): string[] {
  return MODULES.filter((m) => {
    if (m.platformOnly) return s.isPlatformAdmin;
    if (!s.entitled(m.id)) return false;
    if (m.profiles && s.profiles.length && !m.profiles.some((p) => s.profiles.includes(p))) return false;
    if (m.permission && !s.canModule(m.permission)) return false;
    return true;
  }).map((m) => m.id);
}

export function moduleById(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id);
}
