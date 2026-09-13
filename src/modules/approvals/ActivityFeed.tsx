// Activity feed (approvals/activity): recent audit events across the company with actor / type filters (design §7.13).
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import type { AuditEvent } from '../../store';
import { fmtDateTime } from '../../lib/format';
import { Timeline, ChipGroup, PageHeader, ScopeLine, SelectField, Button, EmptyState } from '../../components/ui';
import type { TimelineItem } from '../../components/ui';
import { DOC_ROUTES } from './shared';

const TYPE_GROUPS: { id: string; label: string; test: (a: string) => boolean }[] = [
  { id: 'workflow', label: 'Approvals', test: (a) => a.startsWith('workflow.') },
  { id: 'posting', label: 'Postings', test: (a) => /posted|reversed|settled|allocated/.test(a) },
  { id: 'stock', label: 'Stock', test: (a) => a.startsWith('stock.') || /grn|adjust/.test(a) },
  { id: 'statutory', label: 'Statutory', test: (a) => /einvoice|ewaybill|gstr|tds/.test(a) },
  { id: 'security', label: 'Security', test: (a) => a.startsWith('auth.') || a.startsWith('user.') || a.startsWith('role.') || a.startsWith('credential') },
  { id: 'admin', label: 'Administration', test: (a) => /period|numbering|template|workflow\.rule|localization|plan|profile|onboarding/.test(a) },
  { id: 'data', label: 'Imports & exports', test: (a) => a.startsWith('import') || a.startsWith('export') },
];

const OBJECT_ROUTE: Record<string, (id: string) => string> = {
  'Sales Invoice': (id) => `${DOC_ROUTES.salesInvoices}/${id}`, 'Purchase Order': (id) => `${DOC_ROUTES.purchaseOrders}/${id}`, Journal: (id) => `${DOC_ROUTES.journals}/${id}`, 'Credit Note': (id) => `${DOC_ROUTES.creditNotes}/${id}`,
  Receipt: (id) => `${DOC_ROUTES.receipts}/${id}`, GRN: (id) => `${DOC_ROUTES.grns}/${id}`, 'Payment Batch': (id) => `${DOC_ROUTES.paymentBatches}/${id}`, User: (id) => `admin/users/${id}`, Period: () => 'admin/periods', Role: () => 'admin/roles', WorkflowRule: () => 'admin/workflows', NumberSeries: () => 'admin/numbering', DocumentTemplate: () => 'admin/templates', ProviderCredential: () => 'admin/integrations', Company: () => 'admin/company',
};

export default function ActivityFeed() {
  const s = useSession();
  const events = useCollection<AuditEvent>(C.audit);
  const [types, setTypes] = useState<string[]>([]);
  const [actor, setActor] = useState('');
  const [limit, setLimit] = useState(40);
  const mine = useMemo(() => events.filter((e) => e.companyId === s.state.companyId || (!e.companyId && e.tenantId === s.state.tenantId)).sort((a, b) => b.at.localeCompare(a.at)), [events, s.state.companyId, s.state.tenantId]);
  const actors = Array.from(new Set(mine.map((e) => e.actor))).sort();
  const filtered = mine.filter((e) => (!actor || e.actor === actor) && (!types.length || types.some((t) => TYPE_GROUPS.find((g) => g.id === t)?.test(e.action))));
  const items: TimelineItem[] = filtered.slice(0, limit).map((e) => ({
    type: e.result === 'Failure' || e.result === 'Denied' ? 'warning' : /post|approv|accept|complete|commit/i.test(e.action) ? 'success' : /reject|suspend|revoke|void|fail/i.test(e.action) ? 'warning' : 'info',
    event: e.action.split('.').map((w) => w.replace(/_/g, ' ')).join(' · ').replace(/^\w/, (c) => c.toUpperCase()),
    predicate: `${e.objectType}${e.objectNumber ? ' ' + e.objectNumber : ''} · by ${e.actor} · ${e.channel}${e.sensitive ? ' · sensitive' : ''}`,
    time: e.at,
    note: e.detail,
    meta: (
      <span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
        <span className="identifier">{e.correlationId}</span>
        {e.objectId && OBJECT_ROUTE[e.objectType] && <button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={() => nav.go(OBJECT_ROUTE[e.objectType](e.objectId!))}>Open {e.objectType.toLowerCase()} →</button>}
      </span>
    ),
  }));
  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <PageHeader title="Activity feed" subtitle={<ScopeLine extra={`${filtered.length} events`} />} actions={<Button variant="secondary" onClick={() => nav.go('admin/audit')}>Full audit log</Button>} />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <ChipGroup label="Event type" multiple value={types} onChange={setTypes} options={TYPE_GROUPS.map((g) => ({ value: g.id, label: g.label }))} />
        <SelectField label="Actor" value={actor} onChange={setActor} options={actors} allowEmpty placeholder="Anyone" size="sm" style={{ minWidth: 200 }} />
        {(types.length > 0 || actor) && <Button size="sm" variant="ghost" onClick={() => { setTypes([]); setActor(''); }}>Clear</Button>}
      </div>
      <div className="card" style={{ padding: 20 }}>
        {items.length === 0 ? <EmptyState compact icon="🕘" title="No activity matches" description="Try clearing the filters." /> : <Timeline items={items} />}
        {filtered.length > limit && <Button variant="link" style={{ marginTop: 12 }} onClick={() => setLimit(limit + 40)}>Show more ({filtered.length - limit} older)</Button>}
      </div>
    </div>
  );
}
