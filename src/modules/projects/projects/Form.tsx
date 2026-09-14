// Project form — auto-creates a Project dimension so journals carry it.
import { useState } from 'react';
import { db, C, nav, useRecord, useSession } from '../../../store';
import type { Customer } from '../../../store';
import { PageHeader, Card, Button, TextField, NumberField, MoneyField, SelectField, DateField, TextArea, EntityPicker, ChipGroup, useToast, useCustomerOptions, useEmployeeOptions, EmptyState, Banner } from '../../../components/ui';
import type { Project, ProjectStatus } from '../types';
import { useContractOptions } from '../shared';
import { saveProject } from '../actions';

export default function ProjectForm({ id, customerId, contractId }: { id?: string; customerId?: string; contractId?: string }) {
  const existing = useRecord<Project>(C.projects, id);
  const s = useSession();
  const toast = useToast();
  const [p, setP] = useState<Partial<Project>>(() => existing ? { ...existing } : { name: '', customerId: customerId ?? '', contractId, start: new Date().toISOString().slice(0, 10), budgetHours: 0, budgetAmount: 0, status: 'Planned', teamEmployeeIds: [] });
  const [err, setErr] = useState<string | null>(null);
  const customers = useCustomerOptions();
  const employees = useEmployeeOptions();
  const contracts = useContractOptions((c) => (!p.customerId || c.customerId === p.customerId) && c.status !== 'Cancelled');
  const set = (x: Partial<Project>) => setP((y) => ({ ...y, ...x }));
  if (id && !existing) return <EmptyState icon="📁" title="Project not found" action={<Button variant="primary" onClick={() => nav.go('projects/projects')}>Back to projects</Button>} />;
  const save = () => {
    try {
      const out = saveProject({ ...p, name: p.name ?? '', customerId: p.customerId ?? '', start: p.start ?? '' });
      toast.success(`Project ${out.code} saved · dimension ${db.find<any>(C.dimensions, out.dimensionId)?.code ?? ''}`);
      nav.go(`projects/projects/${out.id}`);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="page">
      <PageHeader title={id ? `Edit ${existing?.code}` : 'New project'} subtitle="A Project dimension is created automatically so every journal, invoice and expense can carry it" back={{ label: 'Projects', path: id ? `projects/projects/${id}` : 'projects/projects' }}
        actions={<><Button variant="ghost" onClick={() => nav.back('projects/projects')}>Discard</Button><Button variant="primary" onClick={save} data-testid="save-project">Save project</Button></>} />
      {err && <Banner tone="danger">{err}</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Project">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <TextField label="Project name" required value={p.name} onChange={(v) => set({ name: v })} autoFocus style={{ gridColumn: '1 / -1' }} />
            <EntityPicker label="Customer" required value={p.customerId || undefined} onChange={(cid) => set({ customerId: cid ?? '', customerName: db.find<Customer>(C.customers, cid)?.name, contractId: undefined })} options={customers} recentKey="project-customer" />
            <EntityPicker label="Contract" value={p.contractId} onChange={(cid) => set({ contractId: cid })} options={contracts} placeholder="Link a contract (optional)" onCreate={() => nav.go('projects/contracts/new', { customer: p.customerId, project: id })} createLabel="Create contract" />
            <EntityPicker label="Project manager" value={p.managerEmployeeId} onChange={(eid) => set({ managerEmployeeId: eid })} options={employees} help="Approves timesheets logged to this project" />
            <TextField label="Code" value={p.code} onChange={(v) => set({ code: v })} disabled={!!id} help={id ? 'Codes are immutable' : 'Blank = next PRJ number'} uppercase />
            <DateField label="Start" required value={p.start} onChange={(v) => set({ start: v })} />
            <DateField label="End" value={p.end} onChange={(v) => set({ end: v || undefined })} />
            <NumberField label="Budget hours" value={p.budgetHours} onChange={(v) => set({ budgetHours: v })} decimals={0} suffix="h" />
            <MoneyField label="Budget cost" value={p.budgetAmount} onChange={(v) => set({ budgetAmount: v })} currency={s.currency} help="Resource cost + purchases + expenses" />
            <SelectField label="Status" value={p.status} onChange={(v) => set({ status: v as ProjectStatus })} options={['Planned', 'Active', 'On Hold', 'Completed', 'Cancelled']} />
            <TextArea label="Description" value={p.description} onChange={(v) => set({ description: v })} rows={3} style={{ gridColumn: '1 / -1' }} />
          </div>
        </Card>
        <Card title="Team">
          <ChipGroup label="Assigned resources" multiple value={p.teamEmployeeIds ?? []} onChange={(v) => set({ teamEmployeeIds: v })} options={employees.filter((e) => !e.disabled).map((e) => ({ value: e.id, label: e.primary }))} />
          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 10 }}>Team members appear first in the timesheet project picker; bill rates come from the contract, rate card or resource record.</div>
        </Card>
      </div>
    </div>
  );
}
