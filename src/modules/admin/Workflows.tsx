// Workflow rules (FR-WFL-001..003/005/006): register + rule designer (conditions, steps, escalation, reminders,
// material-change fields, self-approval, priority), versioning on save of Active rules, activate / retire, test panel.
import { useMemo, useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { WorkflowRule, WorkflowStep, WorkflowCondition, Role, User, Branch } from '../../store';
import { fmtDateTime, fmtMoney } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, TextField, SelectField, NumberField, MoneyField, Toggle, ChipGroup, Segmented, TwoLine, Banner, useToast, ConfirmDialog, KV, Card, EntityPicker, useUserOptions, Timeline } from '../../components/ui';
import type { Column } from '../../components/ui';
import { DOC_TYPES, useCompany } from './shared';

const FIELDS: WorkflowCondition['field'][] = ['amount', 'branchId', 'department', 'project', 'exception', 'partyId'];
const OPS: WorkflowCondition['op'][] = ['>', '>=', '<', '<=', '=', '!=', 'in'];
const MATERIAL = ['totals.total', 'partyId', 'lines', 'date', 'currency', 'branchId', 'paymentTerms', 'bankDetails', 'dimensions'];

function describe(w: WorkflowRule) {
  if (!w.conditions.length) return 'Always';
  return w.conditions.map((c) => `${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join('|') : c.field === 'amount' ? fmtMoney(Number(c.value), 'INR') : c.value}`).join(' and ');
}

export default function Workflows() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const rules = useCollection<WorkflowRule>(C.workflowRules).filter((w) => w.companyId === co?.id);
  const roles = useCollection<Role>(C.roles);
  const users = useUserOptions();
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === co?.id);
  const [edit, setEdit] = useState<WorkflowRule | null>(null);
  const [retire, setRetire] = useState<WorkflowRule | null>(null);
  const [test, setTest] = useState<{ docType: string; amount: number; branchId: string } | null>(null);
  const canEdit = s.can('admin.workflows.edit') || s.can('admin.workflows.*') || s.isTenantOwner;
  if (!co) return null;

  const blank = (): WorkflowRule => ({ id: '', createdAt: '', updatedAt: '', version: 0, companyId: co.id, code: `WF-${String(rules.length + 1).padStart(3, '0')}`, name: '', docType: 'Sales Invoice', conditions: [], steps: [{ order: 1, name: 'Approval', mode: 'Sequential', approverType: 'Role', approverRef: roles.find((r) => r.code === 'FIN_ADMIN')?.id ?? roles[0]?.id ?? '', approverLabel: 'Finance Admin', commentRequired: false, slaHours: 24, canDelegate: true }], ruleVersion: 1, status: 'Draft', materialChangeFields: ['totals.total', 'partyId', 'lines'], allowSelfApproval: false, priority: 10, reminders: { afterHours: 24 } });

  const save = (activate?: boolean) => {
    if (!edit) return;
    if (!edit.name.trim()) { toast.error('Rule name is required'); return; }
    if (!edit.steps.length) { toast.error('Add at least one approval step'); return; }
    if (edit.steps.some((st) => !st.approverRef && st.approverType !== 'Manager')) { toast.error('Every step needs an approver'); return; }
    const steps = edit.steps.map((st, i) => ({ ...st, order: i + 1, approverLabel: st.approverType === 'Role' ? roles.find((r) => r.id === st.approverRef)?.name ?? st.approverLabel : st.approverType === 'User' ? users.find((u) => u.id === st.approverRef)?.primary ?? st.approverLabel : st.approverType === 'Manager' ? st.approverLabel || 'Reporting manager' : st.approverLabel }));
    const existing = rules.find((r) => r.id === edit.id);
    const by = s.user?.name ?? 'system';
    if (existing) {
      const wasActive = existing.status === 'Active';
      const changed = JSON.stringify({ c: existing.conditions, s: existing.steps, e: existing.escalation, m: existing.materialChangeFields, a: existing.allowSelfApproval }) !== JSON.stringify({ c: edit.conditions, s: steps, e: edit.escalation, m: edit.materialChangeFields, a: edit.allowSelfApproval });
      const bump = wasActive && changed;
      db.update<WorkflowRule>(C.workflowRules, existing.id, { ...edit, steps, status: activate ? 'Active' : edit.status, ruleVersion: bump ? existing.ruleVersion + 1 : existing.ruleVersion, versions: bump ? [...(existing.versions ?? []), { ruleVersion: existing.ruleVersion, at: new Date().toISOString(), by, conditions: existing.conditions, steps: existing.steps, note: `Superseded by v${existing.ruleVersion + 1}` }] : existing.versions });
      engine.audit({ action: 'workflow.rule.updated', objectType: 'WorkflowRule', objectId: existing.id, objectNumber: existing.code, detail: bump ? `Rule version ${existing.ruleVersion} → ${existing.ruleVersion + 1} · in-flight requests keep their snapshot` : 'Saved', before: { ruleVersion: existing.ruleVersion }, after: { ruleVersion: bump ? existing.ruleVersion + 1 : existing.ruleVersion } });
      toast.success(bump ? `Rule saved as v${existing.ruleVersion + 1} — running approvals keep v${existing.ruleVersion}` : 'Rule saved');
    } else {
      const { id, createdAt, updatedAt, version, ...rest } = edit;
      const r = db.insert<WorkflowRule>(C.workflowRules, { ...rest, steps, status: activate ? 'Active' : 'Draft', companyId: co.id });
      engine.audit({ action: 'workflow.rule.created', objectType: 'WorkflowRule', objectId: r.id, objectNumber: r.code, detail: `${r.docType} · ${describe(r)} · ${steps.length} step(s)` });
      toast.success(`Rule ${r.code} created${activate ? ' and activated' : ''}`);
    }
    setEdit(null);
  };
  const setStatus = (w: WorkflowRule, status: WorkflowRule['status'], reason?: string) => {
    db.update<WorkflowRule>(C.workflowRules, w.id, { status });
    engine.audit({ action: status === 'Active' ? 'workflow.rule.activated' : 'workflow.rule.retired', objectType: 'WorkflowRule', objectId: w.id, objectNumber: w.code, detail: reason });
    toast.success(`${w.code} ${status.toLowerCase()}`);
  };

  const columns: Column<WorkflowRule>[] = [
    { key: 'name', label: 'Rule', sortable: true, render: (w) => <TwoLine primary={w.name} secondary={`${w.code} · v${w.ruleVersion}`} /> },
    { key: 'docType', label: 'Document type', sortable: true, render: (w) => <span style={{ color: '#5F6368' }}>{w.docType}</span> },
    { key: 'trigger', label: 'Trigger', render: (w) => <span style={{ fontSize: 12, color: '#5F6368' }}>{describe(w)}</span> },
    { key: 'steps', label: 'Steps', render: (w) => `${w.steps.length} step${w.steps.length === 1 ? '' : 's'}` },
    { key: 'approvers', label: 'Approvers', render: (w) => <span style={{ fontSize: 12, color: '#5F6368' }}>{w.steps.map((st) => st.approverLabel).join(' → ')}</span> },
    { key: 'sla', label: 'SLA · escalation', render: (w) => <span style={{ fontSize: 12, color: '#5F6368' }}>{w.steps.map((st) => `${st.slaHours}h`).join(' / ')}{w.escalation ? ` · ↑ ${roles.find((r) => r.id === w.escalation!.toRole)?.name ?? w.escalation.toRole} after ${w.escalation.afterHours}h` : ''}</span> },
    { key: 'status', label: 'Status', render: (w) => <Badge status={w.status} /> },
  ];

  const resolved = test ? engine.resolveWorkflow(test.docType, { amount: test.amount, branchId: test.branchId }) : undefined;
  const candidates = test ? rules.filter((r) => r.docType === test.docType) : [];

  return (
    <>
      <RegisterPage<WorkflowRule>
        title="Workflow rules"
        subtitle={`${rules.length} rules · ${rules.filter((r) => r.status === 'Active').length} active · resolved and snapshotted at submission (FR-WFL-003)`}
        rows={rules}
        entity="workflow rules"
        columns={columns}
        searchKeys={['name', 'code', 'docType']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'active', label: 'Active', filter: (r) => r.status === 'Active' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'retired', label: 'Retired', filter: (r) => r.status === 'Retired' }]}
        actions={<Button variant="secondary" onClick={() => setTest({ docType: 'Sales Invoice', amount: 120000, branchId: s.state.branchId ?? '' })}>Test a document</Button>}
        primaryAction={{ label: 'New rule', onClick: () => setEdit(blank()), disabled: !canEdit, reason: canEdit ? undefined : 'Requires admin.workflows.edit' }}
        onRowClick={(w) => setEdit({ ...w, steps: w.steps.map((st) => ({ ...st })), conditions: w.conditions.map((c) => ({ ...c })) })}
        rowActions={(w) => [
          { label: 'Edit', onClick: () => setEdit({ ...w }), disabled: !canEdit },
          { label: 'Activate', onClick: () => setStatus(w, 'Active'), disabled: !canEdit || w.status === 'Active' },
          { label: 'Retire', onClick: () => setRetire(w), disabled: !canEdit || w.status === 'Retired', danger: true },
          { label: 'Duplicate', onClick: () => setEdit({ ...blank(), ...w, id: '', code: `WF-${String(rules.length + 1).padStart(3, '0')}`, name: `${w.name} (copy)`, status: 'Draft', ruleVersion: 1, versions: undefined }), separator: true },
        ]}
      />

      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${edit.code} · ${edit.name || 'Rule'}` : 'New workflow rule'} subtitle={edit?.id ? `v${edit.ruleVersion} · ${edit.status}${edit.status === 'Active' ? ' · saving changes creates a new version' : ''}` : undefined} width={860}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Discard</Button><div style={{ display: 'flex', gap: 8 }}>{edit?.status !== 'Active' && <Button variant="secondary" onClick={() => save(true)} disabled={!canEdit}>Save & activate</Button>}<Button variant="primary" onClick={() => save()} disabled={!canEdit}>Save rule</Button></div></>}>
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div className="grid-3">
              <TextField label="Name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} autoFocus />
              <SelectField label="Document type" value={edit.docType} onChange={(v) => setEdit({ ...edit, docType: v })} options={DOC_TYPES} />
              <NumberField label="Priority (lower wins)" value={edit.priority} onChange={(v) => setEdit({ ...edit, priority: Math.round(v) })} decimals={0} min={1} />
            </div>

            <Card title="Conditions" actions={<Button size="sm" variant="secondary" onClick={() => setEdit({ ...edit, conditions: [...edit.conditions, { field: 'amount', op: '>', value: 50000 }] })}>+ Add condition</Button>} padding={14}>
              {edit.conditions.length === 0 && <div style={{ fontSize: 13, color: '#5F6368' }}>No conditions — the rule applies to every {edit.docType}.</div>}
              {edit.conditions.map((c, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 1.4fr auto', gap: 8, alignItems: 'end', marginBottom: 8 }}>
                  <SelectField label={i === 0 ? 'Field' : undefined} value={c.field} onChange={(v) => setEdit({ ...edit, conditions: edit.conditions.map((x, j) => (j === i ? { ...x, field: v as WorkflowCondition['field'], value: v === 'amount' ? 0 : '' } : x)) })} options={FIELDS} size="sm" />
                  <SelectField label={i === 0 ? 'Op' : undefined} value={c.op} onChange={(v) => setEdit({ ...edit, conditions: edit.conditions.map((x, j) => (j === i ? { ...x, op: v as WorkflowCondition['op'] } : x)) })} options={OPS} size="sm" />
                  {c.field === 'amount' ? <MoneyField label={i === 0 ? 'Value' : undefined} value={Number(c.value)} onChange={(v) => setEdit({ ...edit, conditions: edit.conditions.map((x, j) => (j === i ? { ...x, value: v } : x)) })} size="sm" currency={co.baseCurrency} />
                    : c.field === 'branchId' ? <SelectField label={i === 0 ? 'Value' : undefined} value={String(c.value)} onChange={(v) => setEdit({ ...edit, conditions: edit.conditions.map((x, j) => (j === i ? { ...x, value: v } : x)) })} options={branches.map((b) => ({ value: b.id, label: b.name }))} size="sm" placeholder="—" />
                    : c.field === 'exception' ? <SelectField label={i === 0 ? 'Value' : undefined} value={String(c.value)} onChange={(v) => setEdit({ ...edit, conditions: edit.conditions.map((x, j) => (j === i ? { ...x, value: v } : x)) })} options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]} size="sm" />
                    : <TextField label={i === 0 ? 'Value' : undefined} value={String(c.value)} onChange={(v) => setEdit({ ...edit, conditions: edit.conditions.map((x, j) => (j === i ? { ...x, value: c.op === 'in' ? v.split(',').map((x) => x.trim()) : v } : x)) })} size="sm" placeholder={c.op === 'in' ? 'a, b, c' : undefined} />}
                  <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, conditions: edit.conditions.filter((_, j) => j !== i) })}>✕</Button>
                </div>
              ))}
            </Card>

            <Card title="Approval steps" actions={<Button size="sm" variant="secondary" onClick={() => setEdit({ ...edit, steps: [...edit.steps, { order: edit.steps.length + 1, name: `Step ${edit.steps.length + 1}`, mode: 'Sequential', approverType: 'Role', approverRef: roles[0]?.id ?? '', approverLabel: roles[0]?.name ?? '', commentRequired: false, slaHours: 24, canDelegate: true }] })}>+ Add step</Button>} padding={14}>
              {edit.steps.map((st, i) => {
                const upd = (p: Partial<WorkflowStep>) => setEdit({ ...edit, steps: edit.steps.map((x, j) => (j === i ? { ...x, ...p } : x)) });
                return (
                  <div key={i} className="card" style={{ padding: 12, marginBottom: 10, background: '#F9FBFC' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>Step {i + 1}</span>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => { const st2 = [...edit.steps]; [st2[i - 1], st2[i]] = [st2[i], st2[i - 1]]; setEdit({ ...edit, steps: st2 }); }}>↑</Button>
                        <Button size="sm" variant="ghost" disabled={i === edit.steps.length - 1} onClick={() => { const st2 = [...edit.steps]; [st2[i + 1], st2[i]] = [st2[i], st2[i + 1]]; setEdit({ ...edit, steps: st2 }); }}>↓</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, steps: edit.steps.filter((_, j) => j !== i) })}>Remove</Button>
                      </div>
                    </div>
                    <div className="grid-3" style={{ gap: 10 }}>
                      <TextField label="Step name" value={st.name} onChange={(v) => upd({ name: v })} size="sm" />
                      <div><label className="field-label">Mode</label><Segmented value={st.mode} onChange={(v) => upd({ mode: v as WorkflowStep['mode'] })} options={['Sequential', 'Parallel']} /></div>
                      <SelectField label="Approver type" value={st.approverType} onChange={(v) => upd({ approverType: v as WorkflowStep['approverType'], approverRef: v === 'Manager' ? 'manager' : '', approverLabel: v === 'Manager' ? 'Reporting manager' : '' })} options={['Role', 'User', 'Group', 'Manager']} size="sm" />
                      {st.approverType === 'Role' && <SelectField label="Role" value={st.approverRef} onChange={(v) => upd({ approverRef: v, approverLabel: roles.find((r) => r.id === v)?.name ?? '' })} options={roles.map((r) => ({ value: r.id, label: r.name }))} size="sm" placeholder="—" />}
                      {st.approverType === 'User' && <EntityPicker label="User" value={st.approverRef || undefined} onChange={(id, o) => upd({ approverRef: id ?? '', approverLabel: o?.primary ?? '' })} options={users} size="sm" />}
                      {st.approverType === 'Group' && <TextField label="Group" value={st.approverLabel} onChange={(v) => upd({ approverRef: v.toLowerCase().replace(/\s+/g, '-'), approverLabel: v })} size="sm" placeholder="e.g. Finance leads" />}
                      {st.approverType === 'Manager' && <TextField label="Label" value={st.approverLabel} onChange={(v) => upd({ approverLabel: v })} size="sm" help="Resolved from the requester's reporting line" />}
                      <NumberField label="SLA (hours)" value={st.slaHours} onChange={(v) => upd({ slaHours: Math.max(1, Math.round(v)) })} decimals={0} min={1} size="sm" />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 20 }}>
                        <Toggle on={st.commentRequired} onChange={(v) => upd({ commentRequired: v })} label="Comment required" />
                        <Toggle on={st.canDelegate} onChange={(v) => upd({ canDelegate: v })} label="Can delegate" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </Card>

            <div className="grid-2">
              <Card title="Escalation & reminders" padding={14}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Toggle on={!!edit.escalation} onChange={(v) => setEdit({ ...edit, escalation: v ? { afterHours: 48, toRole: roles.find((r) => r.code === 'OWNER')?.id ?? roles[0]?.id ?? '', notify: true } : undefined })} label="Escalate when the SLA is breached" />
                  {edit.escalation && (
                    <div className="grid-2" style={{ gap: 10 }}>
                      <NumberField label="After (hours)" value={edit.escalation.afterHours} onChange={(v) => setEdit({ ...edit, escalation: { ...edit.escalation!, afterHours: Math.max(1, Math.round(v)) } })} decimals={0} size="sm" />
                      <SelectField label="Escalate to role" value={edit.escalation.toRole} onChange={(v) => setEdit({ ...edit, escalation: { ...edit.escalation!, toRole: v } })} options={roles.map((r) => ({ value: r.id, label: r.name }))} size="sm" />
                      <Toggle on={edit.escalation.notify} onChange={(v) => setEdit({ ...edit, escalation: { ...edit.escalation!, notify: v } })} label="Notify escalation role" />
                    </div>
                  )}
                  <NumberField label="Reminder after (hours, 0 = none)" value={edit.reminders?.afterHours ?? 0} onChange={(v) => setEdit({ ...edit, reminders: v > 0 ? { afterHours: Math.round(v) } : undefined })} decimals={0} size="sm" />
                </div>
              </Card>
              <Card title="Material change & policy" padding={14}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <ChipGroup label="Fields that restart approval when changed (FR-WFL-006)" multiple value={edit.materialChangeFields} onChange={(v: string[]) => setEdit({ ...edit, materialChangeFields: v })} options={MATERIAL} />
                  <Toggle on={edit.allowSelfApproval} onChange={(v) => setEdit({ ...edit, allowSelfApproval: v })} label="Allow self-approval" help="Off by default (FRD §22). Turning it on is audited." />
                </div>
              </Card>
            </div>

            {edit.versions && edit.versions.length > 0 && (
              <Card title="Version history" padding={14}>
                <Timeline items={[{ type: 'success', event: `v${edit.ruleVersion} (current)`, predicate: `${edit.steps.length} step(s) · ${describe(edit)}`, time: edit.updatedAt }, ...edit.versions.slice().reverse().map((v) => ({ type: 'neutral' as const, event: `v${v.ruleVersion}`, predicate: `${v.steps.length} step(s) · ${v.steps.map((st) => st.approverLabel).join(' → ')} · by ${v.by}`, time: v.at, note: v.note }))]} />
              </Card>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={!!retire} onClose={() => setRetire(null)} title={`Retire ${retire?.code} · ${retire?.name}?`} statement="New submissions no longer match this rule. Requests already in flight keep their snapshot and finish normally." consequences={[{ engine: 'Workflow', text: `${retire?.docType} documents fall through to the next matching rule, or post directly when none matches`, tone: 'warning' }]} reasonRequired confirmLabel="Retire rule" cancelLabel="Keep rule" danger onConfirm={(reason) => { if (retire) setStatus(retire, 'Retired', reason); }} />

      <Drawer open={!!test} onClose={() => setTest(null)} title="Test a document" subtitle="Simulates workflow resolution for a hypothetical document (no request is created)." width={560}>
        {test && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SelectField label="Document type" value={test.docType} onChange={(v) => setTest({ ...test, docType: v })} options={DOC_TYPES} />
            <div className="grid-2">
              <MoneyField label="Amount" value={test.amount} onChange={(v) => setTest({ ...test, amount: v })} currency={co.baseCurrency} />
              <SelectField label="Branch" value={test.branchId} onChange={(v) => setTest({ ...test, branchId: v })} options={branches.map((b) => ({ value: b.id, label: b.name }))} allowEmpty placeholder="Any" />
            </div>
            {resolved ? (
              <div className="card" style={{ padding: 14, background: '#F2F7FF' }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Resolves to {resolved.code} · {resolved.name} (v{resolved.ruleVersion})</div>
                <KV items={[{ k: 'Trigger', v: describe(resolved) }, { k: 'Priority', v: resolved.priority }, { k: 'Self-approval', v: resolved.allowSelfApproval ? 'Allowed' : 'Blocked' }]} />
                <div className="section-label" style={{ margin: '10px 0 6px' }}>Steps that would run</div>
                {resolved.steps.map((st) => {
                  const skip = st.approverLabel.includes('above') && /₹\s?(\d+)L/.test(st.approverLabel) && test.amount < Number(RegExp.$1) * 100000;
                  return <div key={st.order} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid #E4EAF5' }}><span>{st.order}. {st.name} · {st.approverLabel}{st.commentRequired ? ' · comment' : ''}</span><span style={{ color: '#5F6368' }}>{skip ? 'skipped (threshold)' : `SLA ${st.slaHours}h`}</span></div>;
                })}
                {resolved.escalation && <div style={{ fontSize: 12, color: '#8A4B0F', marginTop: 8 }}>Escalates to {roles.find((r) => r.id === resolved.escalation!.toRole)?.name} after {resolved.escalation.afterHours}h.</div>}
              </div>
            ) : (
              <Banner tone="info">No active rule matches — a {test.docType} of {fmtMoney(test.amount, co.baseCurrency)} would post directly without approval.</Banner>
            )}
            {candidates.length > 0 && <div style={{ fontSize: 12, color: '#6E6E71' }}>Candidates for {test.docType}: {candidates.map((c) => `${c.code} (${c.status}, p${c.priority})`).join(', ')}</div>}
          </div>
        )}
      </Drawer>
    </>
  );
}
