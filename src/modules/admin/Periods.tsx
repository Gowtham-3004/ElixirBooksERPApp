// Financial periods (FR-ORG-004/005, FR-ACC-024, E2E-03): per-FY list with soft-close / lock (close checklist with live
// blocker counts) / reopen (reason + approval via 'Period Reopen' workflow) / open future / generate next FY; history drawer.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Period, ApprovalRequest, AuditEvent } from '../../store';
import { fmtDate, fmtDateTime, addDays } from '../../lib/format';
import { PageHeader, Card, Button, Badge, ConfirmDialog, Drawer, Checklist, CheckboxField, Timeline, SelectField, Banner, useToast, ActionMenu, Pill } from '../../components/ui';
import type { ChecklistRow, MenuAction } from '../../components/ui';
import { useCompany } from './shared';
import { buildFyPeriods } from '../auth/provision';

interface Blocker { id: string; label: string; count: number; link: string; blocking: boolean }

function closeChecklist(p: Period): Blocker[] {
  const inP = (d?: string) => !!d && d >= p.start && d <= p.end;
  const cid = p.companyId;
  const draftJournals = db.count(C.journals, (j) => j.companyId === cid && (j.status === 'Draft' || j.status === 'Submitted') && (j.period === p.code || inP(j.date)));
  const draftInv = db.count(C.salesInvoices, (d) => d.companyId === cid && (d.status === 'Draft' || d.status === 'Submitted' || d.status === 'Approved') && inP(d.date));
  const draftVinv = db.count(C.vendorInvoices, (d) => d.companyId === cid && (d.status === 'Draft' || d.status === 'Submitted' || d.status === 'Approved') && inP(d.date));
  const unmatched = db.count(C.statementLines, (l) => (l.companyId === cid || !l.companyId) && inP(l.date) && !(l.status === 'Matched' || l.matched || l.status === 'Reconciled'));
  const pendingApprovals = db.where<ApprovalRequest>(C.approvals, (a) => a.companyId === cid && a.status === 'Pending').filter((a) => { const doc = db.find<any>(a.collection, a.docId); return inP(doc?.date) || (!doc && inP(a.submittedAt.slice(0, 10))); }).length;
  const integ = db.count(C.integrationLogs, (l) => (l.companyId === cid || !l.companyId) && inP(String(l.at).slice(0, 10)) && (l.status === 'Rejected' || l.status === 'Failed' || l.status === 'Timeout'));
  const deadJobs = db.count(C.jobs, (j) => j.companyId === cid && j.status === 'Dead-letter' && inP(String(j.createdAt).slice(0, 10)));
  return [
    { id: 'journals', label: 'Unposted draft / submitted journals', count: draftJournals, link: 'accounting/journals?tab=draft', blocking: true },
    { id: 'invoices', label: 'Unposted sales invoices', count: draftInv, link: 'sales/invoices?tab=draft', blocking: true },
    { id: 'vinv', label: 'Unposted vendor invoices', count: draftVinv, link: 'purchase/vendor-invoices?tab=draft', blocking: true },
    { id: 'bank', label: 'Unmatched bank statement lines', count: unmatched, link: 'banking/reconciliation', blocking: false },
    { id: 'approvals', label: 'Pending approvals dated in the period', count: pendingApprovals, link: 'approvals', blocking: true },
    { id: 'integration', label: 'Integration exceptions (e-Invoice / e-Way bill / bank)', count: integ, link: 'admin/integrations?tab=log', blocking: false },
    { id: 'jobs', label: 'Dead-lettered background jobs', count: deadJobs, link: 'admin/jobs', blocking: false },
  ];
}

export default function Periods({ initialPeriod }: { initialPeriod?: string }) {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const all = useCollection<Period>(C.periods);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const audit = useCollection<AuditEvent>(C.audit);
  const rows = useMemo(() => all.filter((p) => p.companyId === co?.id).sort((a, b) => a.code.localeCompare(b.code)), [all, co?.id]);
  const fys = Array.from(new Set(rows.map((p) => p.fy))).sort();
  const [fy, setFy] = useState<string>(() => rows.find((p) => p.code === initialPeriod)?.fy ?? s.state.fy ?? fys[fys.length - 1] ?? '');
  const [action, setAction] = useState<{ p: Period; kind: 'soft' | 'lock' | 'reopen' | 'open' } | null>(null);
  const [ack, setAck] = useState(false);
  const [history, setHistory] = useState<Period | null>(null);
  const [genOpen, setGenOpen] = useState(false);
  const canManage = s.can('admin.periods.edit') || s.can('admin.periods.lock') || s.can('admin.periods.*') || s.isTenantOwner;
  const canOverride = s.can('accounting.period.postclosed') || s.isTenantOwner;
  const canReopen = s.can('admin.periods.reopen') || s.can('admin.periods.*') || s.isTenantOwner;
  if (!co) return null;
  const list = rows.filter((p) => !fy || p.fy === fy);
  const pendingReopen = (p: Period) => approvals.find((a) => a.docType === 'Period Reopen' && a.docId === p.id && a.status === 'Pending');
  const blockers = action ? closeChecklist(action.p) : [];
  const blocking = blockers.filter((b) => b.blocking && b.count > 0);
  const lockDisabled = action?.kind === 'lock' && blocking.length > 0 && !ack;

  const menu = (p: Period): MenuAction[] => {
    const out: MenuAction[] = [];
    const reopenPending = pendingReopen(p);
    if (p.status === 'Future') out.push({ label: 'Open period', onClick: () => setAction({ p, kind: 'open' }), disabled: !canManage, reason: canManage ? undefined : 'Requires admin.periods.edit' });
    if (p.status === 'Open' || p.status === 'Reopened') out.push({ label: 'Soft-close', onClick: () => { setAck(false); setAction({ p, kind: 'soft' }); }, disabled: !canManage, reason: canManage ? undefined : 'Requires admin.periods.edit' });
    if (p.status === 'Soft Closed' || p.status === 'Open' || p.status === 'Reopened') out.push({ label: 'Lock', onClick: () => { setAck(false); setAction({ p, kind: 'lock' }); }, disabled: !canManage, reason: canManage ? undefined : 'Requires admin.periods.lock', danger: true });
    if (p.status === 'Locked' || p.status === 'Soft Closed') out.push({ label: reopenPending ? 'Reopen requested…' : 'Reopen', onClick: () => setAction({ p, kind: 'reopen' }), disabled: !canReopen || !!reopenPending, reason: reopenPending ? 'Awaiting approval' : canReopen ? undefined : 'Requires Finance Admin / CFO' });
    out.push({ label: 'History', onClick: () => setHistory(p), separator: true });
    return out;
  };

  const confirm = (reason: string) => {
    if (!action) return;
    const { p, kind } = action;
    const by = s.user?.name ?? 'system';
    const now = new Date().toISOString();
    if (kind === 'open') {
      db.update<Period>(C.periods, p.id, { status: 'Open', history: [...p.history, { at: now, by, action: 'Opened', reason }] });
      engine.audit({ action: 'period.opened', objectType: 'Period', objectId: p.id, objectNumber: p.label, detail: reason });
      toast.success(`${p.label} opened`);
    } else if (kind === 'soft') {
      db.update<Period>(C.periods, p.id, { status: 'Soft Closed', lockedAt: now, lockedBy: by, history: [...p.history, { at: now, by, action: 'Soft closed', reason }] });
      engine.audit({ action: 'period.softclosed', objectType: 'Period', objectId: p.id, objectNumber: p.label, detail: `${reason}${blocking.length ? ` · ${blocking.map((b) => `${b.count} ${b.label.toLowerCase()}`).join(', ')} outstanding` : ''}` });
      engine.notify({ type: 'system', title: `${p.label} soft-closed`, body: 'Only Finance Admin can post into it now', link: 'admin/periods' });
      toast.success(`${p.label} soft-closed`);
    } else if (kind === 'lock') {
      if (blocking.length && !ack) throw new Error('Resolve the blockers or acknowledge them to lock');
      db.update<Period>(C.periods, p.id, { status: 'Locked', lockedAt: now, lockedBy: by, history: [...p.history, { at: now, by, action: 'Locked', reason: blocking.length ? `${reason} · acknowledged ${blocking.length} open blocker(s)` : reason }] });
      engine.audit({ action: 'period.locked', objectType: 'Period', objectId: p.id, objectNumber: p.label, detail: reason, sensitive: blocking.length > 0, before: { status: p.status }, after: { status: 'Locked', blockersAcknowledged: blocking.map((b) => `${b.label}: ${b.count}`) } });
      engine.notify({ type: 'system', title: `${p.label} locked`, body: 'Posting into this period is disabled — reopen requires approval', link: 'admin/periods' });
      toast.success(`${p.label} locked`);
    } else if (kind === 'reopen') {
      const req = engine.submitForApproval({ docType: 'Period Reopen', collection: C.periods, docId: p.id, docNumber: p.label, amount: 0, summary: reason, skipStatusUpdate: true });
      if (req) {
        engine.audit({ action: 'period.reopen_requested', objectType: 'Period', objectId: p.id, objectNumber: p.label, detail: `${reason} · ${req.ruleName}` });
        toast.success(`Reopen of ${p.label} sent for approval (${req.steps[0]?.approverLabel})`, { label: 'Approvals', path: 'approvals' });
      } else {
        db.update<Period>(C.periods, p.id, { status: 'Reopened', lockedAt: undefined, lockedBy: undefined, history: [...p.history, { at: now, by, action: 'Reopened', reason }] });
        engine.audit({ action: 'period.reopened', objectType: 'Period', objectId: p.id, objectNumber: p.label, detail: reason, sensitive: true });
        toast.success(`${p.label} reopened`);
      }
    }
    setAction(null);
  };

  const generateNextFy = () => {
    const last = rows[rows.length - 1];
    const anchor = last ? addDays(last.end, 1) : new Date().toISOString().slice(0, 10);
    const wanted = buildFyPeriods(co.id, co.fiscalYearStartMonth, anchor);
    const created = db.transaction(() => wanted.filter((w) => !rows.some((r) => r.code === w.code)).map((w) => db.insert<Period>(C.periods, { ...w, status: 'Future', id: `per_${co.id.replace(/^co_/, '')}_${w.code}` })));
    engine.audit({ action: 'period.generated', objectType: 'Period', objectNumber: wanted[0]?.fy, detail: `${created.length} periods for FY ${wanted[0]?.fy}` });
    toast.success(`${created.length} periods generated for FY ${wanted[0]?.fy}`);
    setFy(wanted[0]?.fy ?? fy);
    setGenOpen(false);
  };

  const titleFor = () => action ? ({ open: `Open ${action.p.label}?`, soft: `Soft-close ${action.p.label}?`, lock: `Lock ${action.p.label}?`, reopen: `Reopen ${action.p.label}?` })[action.kind] : '';
  const consequences = action ? ({
    open: [{ engine: 'Journal', text: 'Documents dated in this period can be posted' }],
    soft: [{ engine: 'Journal', text: 'Operational users cannot back-post; Finance Admin still can (accounting.period.postclosed)', tone: 'warning' as const }, { engine: 'Notification', text: 'Module operators are notified' }],
    lock: [{ engine: 'Journal', text: 'No posting, reversal or stock movement dated in this period — for anyone', tone: 'danger' as const }, { engine: 'Statutory', text: 'Returns for this period can be filed from a frozen ledger' }, { engine: 'Workflow', text: 'Reopening requires reason and elevated approval (CFO)' }],
    reopen: [{ engine: 'Workflow', text: engine.resolveWorkflow('Period Reopen', { amount: 0 }) ? `Routes to ${engine.resolveWorkflow('Period Reopen', { amount: 0 })?.steps[0]?.approverLabel} for approval before the period reopens` : 'No workflow configured — reopens immediately', tone: 'warning' as const }, { engine: 'Journal', text: 'Posting is allowed again once reopened; the period must be re-closed', tone: 'danger' as const }, { engine: 'Statutory', text: 'Filed returns are never recalculated' }],
  })[action.kind] : [];
  const checklistRows: ChecklistRow[] = blockers.map((b) => ({ id: b.id, label: b.label, count: b.count, status: b.count === 0 ? 'Done' : b.blocking ? 'Blocked' : 'Warning', detail: b.count > 0 ? (b.blocking ? 'Must be resolved (or acknowledged) before lock' : 'Advisory — review before close') : undefined, link: b.count > 0 ? b.link : undefined }));

  return (
    <div className="page">
      <PageHeader title="Financial periods" subtitle={`${co.legalName} · FY ${fy || '—'} · ${list.length} periods · fiscal year starts ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][co.fiscalYearStartMonth - 1]}`}
        actions={<>
          <SelectField value={fy} onChange={setFy} options={fys} size="sm" style={{ width: 140 }} />
          <Button variant="secondary" onClick={() => setGenOpen(true)} disabled={!canManage} reason={canManage ? undefined : 'Requires admin.periods.edit'}>Generate next FY</Button>
        </>} />
      {rows.length === 0 && <Banner tone="danger">No accounting periods exist — every posting will be refused (PERIOD_LOCKED). Generate the fiscal year to begin.</Banner>}
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead><tr><th>Period</th><th>Start</th><th>End</th><th>Status</th><th>Closed at</th><th>Closed by</th><th>Open items</th><th style={{ width: 200 }} /></tr></thead>
          <tbody>
            {list.map((p) => {
              const req = pendingReopen(p);
              const bl = p.status === 'Open' || p.status === 'Reopened' || p.status === 'Soft Closed' ? closeChecklist(p).filter((b) => b.count > 0) : [];
              const primary = p.status === 'Open' || p.status === 'Reopened' ? { label: 'Soft-close', kind: 'soft' as const } : p.status === 'Soft Closed' ? { label: 'Lock', kind: 'lock' as const } : p.status === 'Locked' ? { label: 'Reopen', kind: 'reopen' as const } : { label: 'Open', kind: 'open' as const };
              return (
                <tr key={p.id} style={{ opacity: p.status === 'Future' ? 0.7 : 1, background: p.code === s.period?.code ? '#F9FBFF' : undefined }}>
                  <td><span style={{ fontSize: 14, fontWeight: 600 }}>{p.label}</span>{p.code === s.period?.code && <span style={{ fontSize: 11, color: '#6E6E71', marginLeft: 6 }}>current</span>}</td>
                  <td style={{ color: '#5F6368' }}>{fmtDate(p.start)}</td>
                  <td style={{ color: '#5F6368' }}>{fmtDate(p.end)}</td>
                  <td><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={p.status} />{req && <Pill tone="warning" title={`Awaiting ${req.steps[req.currentStep - 1]?.approverLabel}`}>Reopen requested</Pill>}</span></td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{p.lockedAt ? fmtDateTime(p.lockedAt) : '—'}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{p.lockedBy ?? '—'}</td>
                  <td style={{ fontSize: 12 }}>{bl.length ? <span style={{ color: '#8A4B0F' }}>{bl.reduce((a, b) => a + b.count, 0)} in {bl.length} area{bl.length === 1 ? '' : 's'}</span> : p.status === 'Locked' ? <span style={{ color: '#B0B5BF' }}>—</span> : <span style={{ color: '#12784E' }}>Clear</span>}</td>
                  <td style={{ textAlign: 'right' }}>
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <Button size="sm" variant={primary.kind === 'lock' ? 'danger' : 'secondary'} onClick={() => { setAck(false); setAction({ p, kind: primary.kind }); }} disabled={primary.kind === 'reopen' ? !canReopen || !!req : !canManage} reason={primary.kind === 'reopen' ? (req ? 'Awaiting approval' : canReopen ? undefined : 'Requires Finance Admin / CFO') : canManage ? undefined : 'Requires admin.periods permission'}>{primary.label}</Button>
                      <ActionMenu actions={menu(p)} />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Open → Soft-closed (Finance Admin may still post) → Locked (nobody posts) → Reopened via approval. Every transition records who, when and why (FR-ORG-005).</div>

      <ConfirmDialog open={!!action} onClose={() => setAction(null)} title={titleFor()} statement={action?.kind === 'lock' ? 'Locking freezes the ledger for this period. This is reversible only through the reopen workflow.' : action?.kind === 'reopen' ? 'Reopening a closed period is a controlled exception and is audited.' : action?.kind === 'soft' ? 'Soft-close signals month-end; blockers below should be resolved before locking.' : undefined}
        consequences={consequences} reasonRequired confirmLabel={action ? ({ open: 'Open period', soft: 'Soft-close period', lock: 'Lock period', reopen: engine.resolveWorkflow('Period Reopen', { amount: 0 }) ? 'Request reopen' : 'Reopen period' })[action.kind] : ''} cancelLabel="Keep as is" danger={action?.kind === 'lock' || action?.kind === 'reopen'} disabled={lockDisabled} onConfirm={confirm}>
        {(action?.kind === 'soft' || action?.kind === 'lock') && (
          <div style={{ marginBottom: 14 }}>
            <Checklist title="Close checklist" rows={checklistRows} />
            {action.kind === 'lock' && blocking.length > 0 && (
              <div style={{ marginTop: 10 }}>
                {canOverride ? <CheckboxField checked={ack} onChange={setAck} label={`I acknowledge ${blocking.reduce((a, b) => a + b.count, 0)} unresolved blocker(s) and lock anyway`} help="Recorded as a sensitive audit event with the reason below" /> : <Banner tone="danger">Lock is disabled until the blockers are resolved. Only Finance Admin (accounting.period.postclosed) may acknowledge and override.</Banner>}
              </div>
            )}
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog open={genOpen} onClose={() => setGenOpen(false)} title={`Generate periods for the next fiscal year?`} statement={`Creates 12 monthly periods after ${rows[rows.length - 1]?.label ?? 'today'} in Future state. Existing periods are never changed.`} consequences={[{ engine: 'Numbering', text: 'FY-reset number series start a fresh sequence in the new year' }]} confirmLabel="Generate periods" cancelLabel="Not now" onConfirm={generateNextFy} />

      <Drawer open={!!history} onClose={() => setHistory(null)} title={history ? `${history.label} · history` : ''} subtitle={history ? `${fmtDate(history.start)} – ${fmtDate(history.end)} · ${history.status}` : ''} width={560}>
        {history && (
          <Timeline items={[
            ...history.history.map((h) => ({ type: /lock/i.test(h.action) ? 'warning' as const : /reopen/i.test(h.action) ? 'info' as const : 'success' as const, event: h.action, predicate: `by ${h.by}`, time: h.at, note: h.reason })),
            ...audit.filter((e) => e.objectId === history.id).map((e) => ({ type: 'neutral' as const, event: e.action.replace('period.', '').replace(/_/g, ' '), predicate: `audit · ${e.actor} · ${e.channel}`, time: e.at, note: e.detail, meta: e.correlationId })),
            ...approvals.filter((a) => a.docId === history.id).map((a) => ({ type: 'info' as const, event: `Reopen request ${a.status.toLowerCase()}`, predicate: `by ${a.requesterName}`, time: a.completedAt ?? a.submittedAt, note: a.summary, meta: <button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={() => nav.go('approvals', { id: a.id })}>Open request →</button> })),
          ].sort((a, b) => b.time.localeCompare(a.time))} />
        )}
      </Drawer>
    </div>
  );
}
