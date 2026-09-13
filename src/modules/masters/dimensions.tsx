// Dimensions (FR-ACC-003/004): register by type, form with parent + colour, account-rule summary.
import { useMemo, useState } from 'react';
import { C, useCollection, useSession } from '../../store';
import type { Account, Dimension } from '../../store';
import { Badge, Button, DimChip, Drawer, RegisterPage, SelectField, TextField, useToast } from '../../components/ui';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, saveMaster, statusTabs, useForm } from './shared';

const TYPES: Dimension['type'][] = ['Department', 'CostCentre', 'ProfitCentre', 'Project', 'ProductLine'];
const TYPE_LABEL: Record<string, string> = { Department: 'Department', CostCentre: 'Cost centre', ProfitCentre: 'Profit centre', Project: 'Project', ProductLine: 'Product line', Branch: 'Branch', Employee: 'Employee', Customer: 'Customer', Supplier: 'Supplier' };
const PALETTE = ['#325CFF', '#12784E', '#0EA5E9', '#F97316', '#A855F7', '#8A4B0F', '#5F6368', '#C0393F', '#0D9488', '#E29A4B'];
const PREFIX: Record<string, string> = { Department: 'DEP', CostCentre: 'CC', ProfitCentre: 'PC', Project: 'PRJ', ProductLine: 'PL' };

export function DimensionRegister() {
  const s = useSession();
  const rows = useCollection<Dimension>(C.dimensions).filter((d) => d.companyId === s.state.companyId);
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId);
  const journals = useCollection<any>(C.journals);
  const [editing, setEditing] = useState<Dimension | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const canEdit = s.can('masters.dimensions.edit') || s.can('masters.dimensions.create') || s.can('masters.*');
  const usage = useMemo(() => { const m: Record<string, number> = {}; journals.forEach((j: any) => j.lines?.forEach((l: any) => Object.values(l.dimensions ?? {}).forEach((v: any) => { m[v] = (m[v] ?? 0) + 1; }))); return m; }, [journals]);
  const ruleSummary = TYPES.map((t) => ({ t, required: accounts.filter((a) => a.requiredDimensions.includes(t)).length, prohibited: accounts.filter((a) => a.prohibitedDimensions.includes(t)).length }));
  return (
    <>
      <RegisterPage<Dimension>
        title="Dimensions"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · Branch is a system dimension stamped on every line`}
        entity="dimensions"
        rows={rows}
        searchKeys={['code', 'name', 'type']}
        tabs={[{ id: 'all', label: 'All', filter: () => true }, ...TYPES.map((t) => ({ id: t, label: TYPE_LABEL[t], filter: (r: Dimension) => r.type === t })), ...statusTabs<Dimension>().filter((t) => t.id === 'inactive')]}
        primaryAction={{ label: 'New dimension', onClick: () => setEditing('new'), disabled: !canEdit, reason: canEdit ? undefined : 'Requires dimension permission' }}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        headerExtra={<div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12 }}><span className="section-label" style={{ marginBottom: 0 }}>Account rules</span>{ruleSummary.map((r) => <span key={r.t}><strong>{TYPE_LABEL[r.t]}</strong>: required on {r.required} account{r.required === 1 ? '' : 's'}{r.prohibited ? `, prohibited on ${r.prohibited}` : ''}</span>)}<span style={{ color: '#5F6368' }}>Edit rules per account under Chart of accounts.</span></div>}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => masterRowActions({ collection: C.dimensions, objectType: 'Dimension', row: r, canEdit, onEdit: () => setEditing(r) })}
        bulkActions={(ids, sel) => bulkStatusActions(C.dimensions, 'Dimension', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Dimension', sortable: true, render: (r) => <DimChip label={`${r.code} · ${r.name}`} color={r.color} /> , value: (r) => r.name },
          { key: 'type', label: 'Type', sortable: true, render: (r) => TYPE_LABEL[r.type] ?? r.type },
          { key: 'parent', label: 'Parent', render: (r) => rows.find((p) => p.id === r.parentId)?.name ?? '—' },
          { key: 'usage', label: 'Journal lines', align: 'right', render: (r) => usage[r.id] ?? '—', value: (r) => usage[r.id] ?? 0 },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <DimensionForm dimension={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="dimensions" entityLabel="Dimensions" candidateFields={['code', 'name']} />
    </>
  );
}

function DimensionForm({ dimension, onClose }: { dimension?: Dimension; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<Dimension>(C.dimensions).filter((d) => d.companyId === s.state.companyId);
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId);
  const f = useForm<any>(dimension ? { ...dimension } : { type: 'Department', code: '', name: '', parentId: undefined, status: 'Active', color: PALETTE[rows.length % PALETTE.length] });
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const dups = useMemo(() => findDuplicates('dimensions', rows.filter((r) => r.type === f.v.type), f.v, dimension?.id), [rows, f.v.code, f.v.name, f.v.type]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const required = accounts.filter((a) => a.requiredDimensions.includes(f.v.type));
  const prohibited = accounts.filter((a) => a.prohibitedDimensions.includes(f.v.type));
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.code.trim()) e.code = 'Code is required';
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (f.v.parentId === dimension?.id) e.parentId = 'A dimension cannot be its own parent';
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const saved = saveMaster<Dimension>(C.dimensions, 'Dimension', { ...f.v, code: f.v.code.toUpperCase(), parentId: f.v.parentId || undefined }, dimension?.id, { expectedVersion: dimension?.version });
      toast.success(`${TYPE_LABEL[saved.type]} ${saved.code} ${dimension ? 'updated' : 'created'}`);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? 'Could not save'); setSaving(false); }
  };
  return (
    <Drawer open onClose={onClose} title={dimension ? `Edit ${dimension.name}` : 'New dimension'} subtitle="FR-ACC-003 · analysis dimension stamped on journal lines" width={560}
      headerRight={dimension && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={dimension ? 'Save dimension' : 'Create dimension'} disabled={blocked} /> : undefined}>
      {tab === 'history' && dimension ? <ChangeHistory objectId={dimension.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <SelectField label="Type" value={f.v.type} onChange={(v) => f.patch({ type: v, parentId: undefined, code: f.v.code || '' })} options={TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} disabled={!!dimension} />
            <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} placeholder={`${PREFIX[f.v.type] ?? 'DIM'}-001`} />
            <TextField label="Name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus style={{ gridColumn: '1 / -1' }} />
            <SelectField label="Parent" value={f.v.parentId ?? ''} onChange={(v) => f.set('parentId', v || undefined)} options={rows.filter((r) => r.type === f.v.type && r.id !== dimension?.id).map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }))} allowEmpty placeholder="— Top level —" error={f.errors.parentId} />
            <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive']} />
          </div>
          <div>
            <label className="field-label">Colour</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PALETTE.map((c) => <button key={c} type="button" onClick={() => f.set('color', c)} style={{ width: 28, height: 28, borderRadius: '50%', background: c, border: f.v.color === c ? '3px solid #0A0A0A' : '3px solid transparent', cursor: 'pointer' }} title={c} />)}
              <span style={{ alignSelf: 'center', marginLeft: 8 }}><DimChip label={`${f.v.code || 'CODE'} · ${f.v.name || 'Name'}`} color={f.v.color} /></span>
            </div>
          </div>
          <div className="card" style={{ padding: 14, fontSize: 12 }}>
            <div className="section-label" style={{ marginBottom: 6 }}>Account rules for {TYPE_LABEL[f.v.type]}</div>
            {required.length ? <div><strong>Required</strong> on: {required.map((a) => a.code).join(', ')}</div> : <div>No account requires this dimension.</div>}
            {prohibited.length ? <div style={{ marginTop: 4 }}><strong>Prohibited</strong> on: {prohibited.map((a) => a.code).join(', ')}</div> : null}
            <div style={{ color: '#5F6368', marginTop: 6 }}>Rules are set per account under Chart of accounts › Dimension rules (FR-ACC-004).</div>
          </div>
        </div>
      )}
    </Drawer>
  );
}
