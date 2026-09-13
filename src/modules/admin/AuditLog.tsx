// Audit log (FR-AUD-001..003): append-only register with filters, timeline detail drawer (before/after diff,
// correlation ID), masked export for non-auditors.
import { useMemo, useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { AuditEvent } from '../../store';
import { fmtDateTime, toCSV, downloadText } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, KV, TwoLine, Identifier, Pill, useToast, Banner } from '../../components/ui';
import type { Column } from '../../components/ui';

function diff(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]));
  return keys.map((k) => ({ k, b: before?.[k], a: after?.[k], changed: JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]) }));
}

export default function AuditLog() {
  const s = useSession();
  const toast = useToast();
  const all = useCollection<AuditEvent>(C.audit);
  const isAuditor = s.can('admin.audit.export') || s.roles.some((r) => r.code === 'AUDITOR') || s.isTenantOwner;
  const rows = useMemo(() => all.filter((e) => e.companyId === s.state.companyId || (!e.companyId && e.tenantId === s.state.tenantId)).sort((a, b) => b.at.localeCompare(a.at)), [all, s.state.companyId, s.state.tenantId]);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const actors = Array.from(new Set(rows.map((r) => r.actor))).sort();
  const actions = Array.from(new Set(rows.map((r) => r.action.split('.')[0]))).sort();
  const objects = Array.from(new Set(rows.map((r) => r.objectType))).sort();

  const masked = (e: AuditEvent): AuditEvent => (e.sensitive && !isAuditor ? { ...e, detail: '[masked — sensitive]', before: undefined, after: undefined } : e);
  const exportMasked = () => {
    const data = rows.map(masked).map((e) => ({ at: e.at, actor: e.actor, action: e.action, objectType: e.objectType, objectNumber: e.objectNumber ?? '', result: e.result, channel: e.channel, detail: e.detail ?? '', correlationId: e.correlationId }));
    downloadText(`audit-${s.company?.code ?? 'company'}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(data));
    engine.audit({ action: 'export', objectType: 'Audit', detail: `${rows.length} events · ${isAuditor ? 'unmasked (auditor)' : 'masked'}`, sensitive: false });
    toast.success(`Exported ${rows.length} events${isAuditor ? '' : ' (sensitive details masked)'}`);
  };

  const columns: Column<AuditEvent>[] = [
    { key: 'at', label: 'When', sortable: true, render: (e) => <span style={{ fontSize: 12, color: '#5F6368', whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</span> },
    { key: 'actor', label: 'Actor', sortable: true, render: (e) => <TwoLine primary={e.actor} secondary={e.channel} /> },
    { key: 'action', label: 'Action', sortable: true, render: (e) => <span className="identifier" style={{ fontSize: 12 }}>{e.action}</span> },
    { key: 'object', label: 'Object', render: (e) => <TwoLine primary={e.objectType} secondary={e.objectNumber ?? e.objectId} mono /> },
    { key: 'detail', label: 'Detail', render: (e) => <span style={{ fontSize: 12, color: '#5F6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360, display: 'block' }}>{masked(e).detail ?? '—'}</span> },
    { key: 'result', label: 'Result', render: (e) => <span style={{ display: 'inline-flex', gap: 4 }}><Badge status={e.result === 'Success' ? 'Success' : e.result === 'Denied' ? 'Denied' : 'Failed'}>{e.result}</Badge>{e.sensitive && <Pill tone="warning" title="Security-sensitive event">sensitive</Pill>}</span> },
  ];

  return (
    <>
      <RegisterPage<AuditEvent>
        title="Audit log"
        subtitle={`${rows.length} events · append-only · ${isAuditor ? 'auditor view (unmasked)' : 'sensitive details masked'}`}
        rows={rows}
        entity="audit events"
        columns={columns}
        pageSize={50}
        searchKeys={['actor', 'action', 'objectType', 'objectNumber', 'detail', 'correlationId']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'sensitive', label: 'Security-sensitive', filter: (e) => !!e.sensitive }, { id: 'failed', label: 'Failures & denials', filter: (e) => e.result !== 'Success' }, { id: 'workflow', label: 'Workflow', filter: (e) => e.action.startsWith('workflow.') }, { id: 'system', label: 'System & workers', filter: (e) => e.channel !== 'web' }]}
        filters={[
          { key: 'actor', label: 'Actor', type: 'select', options: actors.map((a) => ({ value: a, label: a })) },
          { key: 'action', label: 'Action type', type: 'select', options: actions.map((a) => ({ value: a, label: a })) },
          { key: 'objectType', label: 'Object type', type: 'select', options: objects.map((o) => ({ value: o, label: o })) },
          { key: 'result', label: 'Result', type: 'select', options: ['Success', 'Failure', 'Denied'].map((r) => ({ value: r, label: r })) },
          { key: 'at', label: 'Date range', type: 'date-range' },
        ]}
        applyFilter={(e, v) => (!v.actor || e.actor === v.actor) && (!v.action || e.action.startsWith(v.action + '.')) && (!v.objectType || e.objectType === v.objectType) && (!v.result || e.result === v.result) && (!v.atFrom || e.at.slice(0, 10) >= v.atFrom) && (!v.atTo || e.at.slice(0, 10) <= v.atTo)}
        actions={<Button variant="secondary" onClick={exportMasked} disabled={!s.can('admin.audit.view') && !s.isTenantOwner} reason={s.can('admin.audit.view') || s.isTenantOwner ? undefined : 'Requires admin.audit.view'}>Export {isAuditor ? '' : '(masked)'}</Button>}
        onRowClick={(e) => setOpen(e)}
        emptyTitle="No audit events"
      />
      <Drawer open={!!open} onClose={() => setOpen(null)} title={open ? open.action : ''} subtitle={open ? `${fmtDateTime(open.at)} · ${open.actor} · ${open.channel}` : ''} width={620} headerRight={open && <Badge status={open.result === 'Success' ? 'Success' : 'Failed'}>{open.result}</Badge>}>
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {open.sensitive && !isAuditor && <Banner tone="warning">Security-sensitive event — change detail is masked for your role. Auditors and the tenant owner see the full record (FR-AUD-003).</Banner>}
            <KV items={[
              { k: 'Object', v: `${open.objectType}${open.objectNumber ? ' · ' + open.objectNumber : ''}` },
              { k: 'Object ID', v: <Identifier>{open.objectId ?? '—'}</Identifier> },
              { k: 'Detail', v: masked(open).detail ?? '—' },
              { k: 'Tenant / company', v: `${open.tenantId ?? '—'} / ${open.companyId ?? '—'}` },
              { k: 'Correlation ID', v: <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Identifier>{open.correlationId}</Identifier><button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => { navigator.clipboard?.writeText(open.correlationId); toast.info('Correlation ID copied'); }}>Copy</button></span> },
              { k: 'Event ID', v: <Identifier>{open.id}</Identifier> },
            ]} />
            {(open.before || open.after) && (isAuditor || !open.sensitive) && (
              <div>
                <div className="section-label" style={{ marginBottom: 6 }}>Before / after</div>
                <table className="data-table dense">
                  <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                  <tbody>{diff(open.before, open.after).map((d) => <tr key={d.k} style={{ background: d.changed ? '#FFFBEB' : undefined }}><td className="identifier">{d.k}</td><td style={{ fontSize: 12 }}>{d.b === undefined ? '—' : JSON.stringify(d.b)}</td><td style={{ fontSize: 12, fontWeight: d.changed ? 600 : 400 }}>{d.a === undefined ? '—' : JSON.stringify(d.a)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
            <div>
              <div className="section-label" style={{ marginBottom: 6 }}>Same correlation</div>
              {rows.filter((e) => e.correlationId === open.correlationId && e.id !== open.id).length === 0 ? <div style={{ fontSize: 12, color: '#5F6368' }}>No other events share this correlation ID.</div> : rows.filter((e) => e.correlationId === open.correlationId && e.id !== open.id).map((e) => <div key={e.id} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid #F5F5F5', cursor: 'pointer' }} onClick={() => setOpen(e)}>{fmtDateTime(e.at)} · <span className="identifier">{e.action}</span> · {e.actor}</div>)}
            </div>
            <div style={{ fontSize: 11, color: '#6E6E71' }}>Audit records are append-only; there is no edit or delete (FR-AUD-002).</div>
          </div>
        )}
      </Drawer>
    </>
  );
}
