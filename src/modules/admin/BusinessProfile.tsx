// Business profile (FR-BIZ-005..008, E2E-08): current nature/profiles, "Change profile" wizard with dependency/impact check,
// reason, approval via 'Profile Change' workflow (or immediate), apply + history.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Company, OperatingProfileTemplate, ApprovalRequest } from '../../store';
import { fmtDateTime } from '../../lib/format';
import { PageHeader, Card, Button, Badge, Drawer, ChipGroup, ReasonField, Banner, KV, Checklist, useToast, Pill, Timeline } from '../../components/ui';
import { MODULES } from '../registry';
import { useCompany } from './shared';

const PROFILES = ['Trading', 'Services', 'Manufacturing'] as const;
const MODULE_COLLECTIONS: Record<string, string[]> = { inventory: [C.stockMovements, C.stockAdjustments, C.stockTransfers], pos: [C.posBills, C.posShifts], projects: [C.projects, C.contracts, C.timesheets], production: [C.productionOrders, C.boms, C.workCentres] };

function natureFor(profiles: string[]): Company['nature'] {
  if (profiles.length > 1) return 'Hybrid';
  return (profiles[0] as Company['nature']) ?? 'Trading';
}

export default function BusinessProfile() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const templates = useCollection<OperatingProfileTemplate>(C.profileTemplates);
  const approvals = useCollection<ApprovalRequest>(C.approvals).filter((a) => a.docType === 'Profile Change' && a.docId === co?.id);
  const pending = approvals.find((a) => a.status === 'Pending');
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [to, setTo] = useState<string[]>(co?.profiles ?? []);
  const [reason, setReason] = useState('');
  const canChange = s.can('admin.company.edit') || s.isTenantOwner;
  if (!co) return null;
  const template = templates.find((t) => t.nature === co.nature) ?? templates.find((t) => t.nature === 'Hybrid');
  const modulesFor = (profiles: string[]) => MODULES.filter((m) => !m.platformOnly && (!m.profiles || m.profiles.some((p) => profiles.includes(p))) && s.entitled(m.id));
  const impact = useMemo(() => {
    const before = modulesFor(co.profiles).map((m) => m.id);
    const after = modulesFor(to).map((m) => m.id);
    const hides = before.filter((m) => !after.includes(m));
    const shows = after.filter((m) => !before.includes(m));
    const preserved = hides.map((m) => ({ module: m, count: (MODULE_COLLECTIONS[m] ?? []).reduce((n, col) => n + db.count(col, (r) => r.companyId === co.id), 0) }));
    const blockers: string[] = [];
    if (!to.length) blockers.push('At least one operating profile is required');
    if (hides.includes('inventory') && db.count(C.stockMovements, (r) => r.companyId === co.id) > 0 && !to.includes('Trading') && !to.includes('Manufacturing')) blockers.push('Stock ledger has movements — inventory stays read-only but cannot be hidden until stock is zero or the profile keeps Trading/Manufacturing');
    if (hides.includes('production') && db.count(C.productionOrders, (r) => r.companyId === co.id && r.status !== 'Completed' && r.status !== 'Cancelled' && r.status !== 'Closed') > 0) blockers.push('Open production orders must be completed or cancelled before removing Manufacturing');
    if (hides.includes('projects') && db.count(C.projects, (r) => r.companyId === co.id && r.status === 'Active') > 0) blockers.push('Active projects must be closed before removing Services');
    const unentitled = to.flatMap((p) => MODULES.filter((m) => m.profiles?.includes(p) && !s.entitled(m.id)).map((m) => m.label));
    return { hides, shows, preserved, blockers, unentitled: Array.from(new Set(unentitled)) };
  }, [to, co, s]);
  const rule = engine.resolveWorkflow('Profile Change', { amount: 0 });
  const unchanged = JSON.stringify([...to].sort()) === JSON.stringify([...co.profiles].sort());

  const apply = () => {
    if (impact.blockers.length) { toast.error(impact.blockers[0]); return; }
    if (reason.trim().length < 10) { toast.error('A reason of at least 10 characters is required (FR-BIZ-006)'); return; }
    const summary = `${co.profiles.join(' + ')} → ${to.join(' + ')} · ${reason.trim()}`;
    const req = engine.submitForApproval({ docType: 'Profile Change', collection: C.companies, docId: co.id, docNumber: co.code, amount: 0, summary, skipStatusUpdate: true });
    if (req) {
      db.update<ApprovalRequest>(C.approvals, req.id, { summary } as any);
      engine.audit({ action: 'profile.change_requested', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: summary });
      toast.success(`Profile change sent for approval (${req.steps[0]?.approverLabel})`, { label: 'Approvals', path: 'approvals' });
    } else {
      db.update<Company>(C.companies, co.id, { profiles: to, nature: natureFor(to), profileHistory: [...co.profileHistory, { at: new Date().toISOString(), by: s.user?.name ?? 'system', from: co.profiles, to, reason: reason.trim() }] });
      engine.audit({ action: 'profile.changed', objectType: 'Company', objectId: co.id, objectNumber: co.code, detail: summary, before: { profiles: co.profiles }, after: { profiles: to } });
      engine.notify({ type: 'system', title: `Operating profile changed for ${co.tradeName}`, body: `${co.profiles.join(' + ')} → ${to.join(' + ')}`, link: 'admin/profile' });
      toast.success('Profile applied — navigation and defaults now follow the new profile');
    }
    setOpen(false); setStep(1); setReason('');
  };

  return (
    <div className="page">
      <PageHeader title="Business profile" subtitle={`${co.legalName} · ${co.nature} · template ${template?.name ?? '—'} v${template?.templateVersion ?? '—'}`} actions={<Button variant="primary" onClick={() => { setTo(co.profiles); setStep(1); setOpen(true); }} disabled={!canChange || !!pending} reason={pending ? 'A change is awaiting approval' : canChange ? undefined : 'Requires admin.company.edit'}>Change profile</Button>} />
      {pending && <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('approvals', { id: pending.id })}>View request</Button>}>Profile change awaiting approval: {pending.summary}</Banner>}
      <div className="grid-2">
        <Card title="Current operating profile">
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>{co.profiles.map((p) => <Badge key={p} status="Active">{p}</Badge>)}<Pill tone="neutral">{co.nature}</Pill></div>
          {co.characteristics?.length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>{co.characteristics.map((c) => <span key={c} className="chip" style={{ fontSize: 11 }}>{c}</span>)}</div> : null}
          <KV items={[{ k: 'Modules shown', v: modulesFor(co.profiles).map((m) => m.label).join(', ') }, { k: 'COA template', v: template?.coaTemplate }, { k: 'Dimensions', v: template?.dimensions.join(', ') }, { k: 'Terminology', v: Object.entries(template?.terminology ?? {}).map(([k, v]) => `${k} → ${v}`).join(' · ') || 'standard' }]} />
          <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 10 }}>Navigation and defaults follow the effective profile; hidden modules remain routable and API-protected by entitlement and permission (FR-BIZ-008).</div>
        </Card>
        <Card title="Profile change history">
          {co.profileHistory.length === 0 && approvals.length === 0 ? <div style={{ fontSize: 13, color: '#5F6368' }}>No profile changes yet.</div> : (
            <Timeline items={[
              ...co.profileHistory.map((h) => ({ type: 'success' as const, event: `${h.from.join(' + ') || '—'} → ${h.to.join(' + ')}`, predicate: `by ${h.by}`, time: h.at, note: h.reason })),
              ...approvals.filter((a) => a.status !== 'Approved').map((a) => ({ type: a.status === 'Pending' ? 'info' as const : 'warning' as const, event: `Change request ${a.status.toLowerCase()}`, predicate: `by ${a.requesterName}`, time: a.completedAt ?? a.submittedAt, note: a.summary })),
            ].sort((a, b) => b.time.localeCompare(a.time))} />
          )}
        </Card>
      </div>
      <Card title="Available profile templates">
        <table className="data-table dense">
          <thead><tr><th>Template</th><th>Nature</th><th>Modules</th><th>Dimensions</th><th>Workflows</th><th>Version</th></tr></thead>
          <tbody>{templates.map((t) => <tr key={t.id} style={{ background: t.nature === co.nature ? '#F9FBFF' : undefined }}><td style={{ fontWeight: 500 }}>{t.name}{t.nature === co.nature && <Badge status="Active" style={{ marginLeft: 6 }}>current</Badge>}</td><td>{t.nature}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{t.modules.join(', ')}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{t.dimensions.join(', ')}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{t.workflows.join(', ')}</td><td>v{t.templateVersion}</td></tr>)}</tbody>
        </table>
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="Change operating profile" subtitle={`Step ${step} of 3 · ${['Choose profiles', 'Impact review', 'Reason & approval'][step - 1]}`} width={640}
        footer={<><Button variant="secondary" onClick={() => (step === 1 ? setOpen(false) : setStep((step - 1) as 1 | 2))}>{step === 1 ? 'Discard' : 'Back'}</Button>
          {step < 3 ? <Button variant="primary" onClick={() => setStep((step + 1) as 2 | 3)} disabled={unchanged || (step === 2 && impact.blockers.length > 0)} reason={unchanged ? 'Choose a different profile set' : impact.blockers.length ? 'Resolve blockers first' : undefined}>{step === 1 ? 'Review impact' : 'Continue'}</Button> : <Button variant="primary" onClick={apply} disabled={reason.trim().length < 10}>{rule ? 'Submit for approval' : 'Apply profile change'}</Button>}</>}>
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <ChipGroup label="Operating profiles" multiple value={to} onChange={setTo} options={PROFILES.map((p) => ({ value: p, label: p }))} />
            <div style={{ fontSize: 13, color: '#5F6368' }}>Resulting nature: <strong>{natureFor(to)}</strong>. Modules: {modulesFor(to).map((m) => m.label).join(', ') || '—'}.</div>
            {impact.unentitled.length > 0 && <Banner tone="warning">Not in your plan: {impact.unentitled.join(', ')}. The profile can be set, but those modules stay hidden until the plan is upgraded (FR-BIZ-004).</Banner>}
          </div>
        )}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Checklist title="Dependency & impact check" rows={[
              ...impact.shows.map((m) => ({ id: 's' + m, label: `Show ${MODULES.find((x) => x.id === m)?.label}`, status: 'Done' as const, detail: 'Module appears in navigation with its defaults' })),
              ...impact.preserved.map((p) => ({ id: 'h' + p.module, label: `Hide ${MODULES.find((x) => x.id === p.module)?.label}`, status: p.count ? 'Warning' as const : 'Done' as const, detail: p.count ? `${p.count} existing record(s) are preserved and stay readable — never deleted or reinterpreted (FR-BIZ-007)` : 'No records affected', count: p.count })),
              ...impact.blockers.map((b, i) => ({ id: 'b' + i, label: b, status: 'Blocked' as const })),
              { id: 'engines', label: 'Accounting, tax, currency and identity engines are shared', status: 'Done' as const, detail: 'No journal, stock movement or audit row changes' },
            ]} />
          </div>
        )}
        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <KV items={[{ k: 'From', v: co.profiles.join(' + ') }, { k: 'To', v: to.join(' + ') }, { k: 'Approval', v: rule ? `${rule.name} · ${rule.steps.map((st) => st.approverLabel).join(' → ')}` : 'None configured — applies immediately' }]} />
            <ReasonField value={reason} onChange={setReason} label="Reason for the change" />
            <div style={{ fontSize: 12, color: '#6E6E71' }}>Recorded in the profile history and audit log with before/after values (FR-BIZ-006). Migration steps: navigation refresh, defaults refresh, number series for new document types created lazily.</div>
          </div>
        )}
      </Drawer>
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Last changed {co.profileHistory.length ? fmtDateTime(co.profileHistory[co.profileHistory.length - 1].at) : 'never'}.</div>
    </div>
  );
}
