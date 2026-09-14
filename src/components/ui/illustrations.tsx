// Illustration kinds → Storyset scenes. Empty states, lock screens and the workspace watermark all pick art by
// kind; module ids are kinds too, so one table gives every register its domain scene (keep the module list in
// sync with src/modules/registry.tsx).
import { Storyset, StorysetAnimated, type StorysetName } from './storyset';

export type IllustrationKind =
  | 'no-data' | 'no-access' | 'not-found' | 'all-done' | 'search'
  | 'upgrade' | 'offline' | 'error' | 'loading' | 'setup' | 'celebration' | 'contact' | 'welcome' | 'team'
  | 'home' | 'approvals' | 'crm' | 'sales' | 'purchase' | 'inventory' | 'pos' | 'projects' | 'production'
  | 'accounting' | 'banking' | 'taxation' | 'payroll' | 'fixed-assets' | 'budgets' | 'reports' | 'masters' | 'admin' | 'platform';

export const KIND_ART: Record<IllustrationKind, StorysetName> = {
  'no-data': 'no-data', 'no-access': 'no-access', 'not-found': 'not-found', 'all-done': 'completed', search: 'search',
  upgrade: 'upgrade', offline: 'no-connection', error: 'error', loading: 'loading', setup: 'setup', celebration: 'celebration', contact: 'contact-us', welcome: 'finance', team: 'add-user',
  home: 'dashboard', approvals: 'checklist', crm: 'crm', sales: 'invoice', purchase: 'order-confirmed', inventory: 'logistics', pos: 'mobile-payments', projects: 'scrum-board', production: 'factory',
  accounting: 'accountant', banking: 'online-banking', taxation: 'tax', payroll: 'wallet', 'fixed-assets': 'building', budgets: 'savings', reports: 'data-report', masters: 'folder', admin: 'settings', platform: 'server',
};

const MODULE_IDS = new Set<string>(['home', 'approvals', 'crm', 'sales', 'purchase', 'inventory', 'pos', 'projects', 'production', 'accounting', 'banking', 'taxation', 'payroll', 'fixed-assets', 'budgets', 'reports', 'masters', 'admin', 'platform']);

const MODULE_ALIASES: Record<string, IllustrationKind> = { setup: 'admin' };

/** The kind for a registry module id — `no-data` for anything unknown. */
export function moduleKind(moduleId: string | undefined): IllustrationKind {
  if (!moduleId) return 'no-data';
  return MODULE_ALIASES[moduleId] ?? (MODULE_IDS.has(moduleId) ? (moduleId as IllustrationKind) : 'no-data');
}

export function Illustration({ kind, width = 160, animated, bg = true, label }: { kind: IllustrationKind; width?: number; animated?: boolean; bg?: boolean; label?: string }) {
  const name = KIND_ART[kind] ?? KIND_ART['no-data'];
  return animated ? <StorysetAnimated name={name} width={width} bg={bg} label={label} /> : <Storyset name={name} width={width} bg={bg} label={label} />;
}
