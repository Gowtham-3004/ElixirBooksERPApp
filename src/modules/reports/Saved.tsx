// Saved reports (savedViews with module 'reports') — open, share, set default, delete.
import { C, db, nav, useSession, useCollection, engine } from '../../store';
import type { SavedView } from '../../store';
import { RegisterPage, Badge, useToast, type Column } from '../../components/ui';
import { fmtDateTime } from '../../lib/format';

export const REPORT_LABELS: Record<string, string> = {
  dashboard: 'CFO dashboard', pl: 'Profit & Loss', 'balance-sheet': 'Balance sheet', 'cash-flow': 'Cash flow', 'trial-balance': 'Trial balance', 'journal-register': 'Journal register',
  'ar-ageing': 'AR ageing', 'customer-outstanding': 'Customer outstanding', collections: 'Collections', 'ap-ageing': 'AP ageing', 'supplier-outstanding': 'Supplier outstanding', 'due-schedule': 'Due schedule',
  'stock-ledger': 'Stock ledger', 'stock-onhand': 'Stock on hand', 'stock-valuation': 'Stock valuation', 'stock-movement': 'Stock movement', 'stock-ageing': 'Stock ageing', reorder: 'Reorder', 'count-variance': 'Count variance',
  'sales-analysis': 'Sales analysis', 'purchase-analysis': 'Purchase analysis', margin: 'Gross margin', 'gst-summary': 'GST summary', tds: 'TDS register', 'fx-exposure': 'FX exposure', 'fx-gainloss': 'FX gain / loss', 'fx-rates': 'Rate audit', 'budget-variance': 'Budget variance', profitability: 'Profitability',
};

export function SavedReports() {
  const s = useSession();
  const toast = useToast();
  const views = useCollection<SavedView>(C.savedViews).filter((v) => v.module === 'reports' && (!v.companyId || v.companyId === s.state.companyId) && (v.shared || v.ownerId === s.user?.id));
  const open = (v: SavedView) => nav.go(`reports/${v.register}`, Object.fromEntries(Object.entries(v.filters).map(([k, val]) => [k, String(val ?? '')])));
  const cols: Column<SavedView>[] = [
    { key: 'name', label: 'Report', render: (v) => <div><div className="cell-primary link">{v.name}</div><div className="cell-secondary">{REPORT_LABELS[v.register] ?? v.register}</div></div>, sortable: true },
    { key: 'filters', label: 'Filters', render: (v) => <span className="identifier" style={{ fontSize: 11, color: '#5F6368' }}>{Object.entries(v.filters).filter(([, x]) => x !== '' && x !== undefined).map(([k, x]) => `${k}=${x}`).join(' · ') || 'defaults'}</span> },
    { key: 'ownerId', label: 'Owner', render: (v) => db.find<any>(C.users, v.ownerId)?.name ?? '—' },
    { key: 'shared', label: 'Visibility', render: (v) => <Badge status={v.shared ? 'Active' : 'Draft'}>{v.shared ? 'Shared' : 'Private'}</Badge> },
    { key: 'isDefault', label: 'Default', render: (v) => (v.isDefault ? <Badge status="Posted">Default</Badge> : '—') },
    { key: 'updatedAt', label: 'Updated', render: (v) => fmtDateTime(v.updatedAt), sortable: true },
  ];
  return (
    <RegisterPage<SavedView> title="Saved reports" subtitle={`${views.length} saved views · shared views never widen data scope`} rows={views} columns={cols} entity="saved reports" searchKeys={['name', 'register']}
      tabs={[{ id: 'all', label: 'All' }, { id: 'mine', label: 'Mine', filter: (v) => v.ownerId === s.user?.id }, { id: 'shared', label: 'Shared', filter: (v) => v.shared }]}
      onRowClick={open}
      rowActions={(v) => [
        { label: 'Open report', onClick: () => open(v) },
        { label: v.shared ? 'Make private' : 'Share with company', onClick: () => { db.update<SavedView>(C.savedViews, v.id, { shared: !v.shared }); toast.success(v.shared ? 'Report is now private' : 'Report shared'); }, disabled: v.ownerId !== s.user?.id && !s.isTenantOwner, reason: 'Only the owner can change sharing' },
        { label: v.isDefault ? 'Clear default' : 'Set as my default', onClick: () => db.update<SavedView>(C.savedViews, v.id, { isDefault: !v.isDefault }) },
        { label: 'Delete', danger: true, separator: true, onClick: () => { db.remove(C.savedViews, v.id); engine.audit({ action: 'report.deleted', objectType: 'Saved report', objectNumber: v.name }); toast.success('Saved report deleted'); }, disabled: v.ownerId !== s.user?.id && !s.isTenantOwner, reason: 'Only the owner can delete' },
      ]}
      emptyTitle="No saved reports yet" emptyDescription="Open any report and use “Save as report” to keep its filters here." />
  );
}
