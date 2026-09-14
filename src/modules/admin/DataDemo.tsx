// Data & demo: reset demo data (ConfirmDialog → db.reset() → session.logout()), export all data as JSON, storage stats.
import { useState } from 'react';
import { db, C, engine, session, useDb, useSession } from '../../store';
import { downloadText } from '../../lib/format';
import { PageHeader, Card, Button, KV, ConfirmDialog, Banner, useToast } from '../../components/ui';

export default function DataDemo() {
  const s = useSession();
  const toast = useToast();
  const snapshot = useDb();
  const [reset, setReset] = useState(false);
  const collections = Object.entries(snapshot).map(([k, rows]) => ({ k, n: rows.length })).sort((a, b) => b.n - a.n);
  const total = collections.reduce((a, c) => a + c.n, 0);
  const bytes = (() => { try { return new Blob([JSON.stringify(snapshot)]).size; } catch { return 0; } })();
  const canManage = s.isTenantOwner || s.can('admin.data.edit') || s.can('admin.data.*');

  const exportAll = () => {
    const mine: Record<string, unknown[]> = {};
    Object.entries(snapshot).forEach(([k, rows]) => { mine[k] = rows.filter((r: any) => !r.companyId || r.companyId === s.state.companyId || r.tenantId === s.state.tenantId); });
    downloadText(`elixir-books-${s.company?.code ?? 'export'}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), company: s.company?.legalName, scope: 'company + tenant records', collections: mine }, null, 1), 'application/json');
    engine.audit({ action: 'export', objectType: 'Company data', detail: `Full JSON export · ${Object.values(mine).reduce((a, r) => a + r.length, 0)} records`, sensitive: true });
    toast.success('Data export downloaded');
  };

  return (
    <div className="page">
      <PageHeader title="Data & demo" subtitle={`${total.toLocaleString('en-IN')} records in ${collections.length} collections · ${(bytes / 1024).toFixed(0)} KB in browser storage`} />
      <div className="grid-2">
        <Card title="Export">
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>Download every record visible to {s.company?.tradeName} as JSON — masters, documents, journals, audit. Exports respect company scope and are audited (FR-EXPORT-001).</p>
          <Button variant="primary" onClick={exportAll} disabled={!canManage} reason={canManage ? undefined : 'Requires admin.data permission'}>Export all data (JSON)</Button>
        </Card>
        <Card title="Reset demo data">
          <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 12 }}>Clears everything you changed and reseeds the demo dataset (Acme Group, two companies, {db.get(C.users).length} users). You will be signed out.</p>
          <Button variant="danger" onClick={() => setReset(true)} disabled={!canManage} reason={canManage ? undefined : 'Requires admin.data permission'}>Reset demo data</Button>
        </Card>
      </div>
      <Card title="Collections">
        <div style={{ columns: 3, fontSize: 12 }}>
          {collections.map((c) => <div key={c.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 12px 3px 0', breakInside: 'avoid' }}><span className="identifier">{c.k}</span><span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)' }}>{c.n}</span></div>)}
        </div>
      </Card>
      <Card title="About this environment">
        <KV items={[{ k: 'Storage', v: 'In-memory store persisted to localStorage (elixir-books-db)' }, { k: 'Seed version', v: 'v1' }, { k: 'Tenant', v: s.tenant?.name }, { k: 'Signed in as', v: `${s.user?.name} · ${s.user?.email}` }]} />
        <Banner tone="info" style={{ marginTop: 12 }}>This is a prototype without a backend: every module posts through the shared engine so journals, stock, approvals and audit behave identically.</Banner>
      </Card>
      <ConfirmDialog open={reset} onClose={() => setReset(false)} title="Reset all demo data?" statement="Every change made in this browser is discarded and the seed dataset is restored. This cannot be undone." consequences={[{ engine: 'Journal', text: 'All posted documents, journals and stock movements are replaced by the seed', tone: 'danger' }, { engine: 'Workflow', text: 'Pending approvals, users you invited and settings you changed are lost', tone: 'danger' }, { engine: 'Notification', text: 'You are signed out and return to the sign-in page' }]} reasonRequired confirmLabel="Reset demo data" cancelLabel="Keep my data" danger onConfirm={() => { db.reset(); session.logout(); }} />
    </div>
  );
}
