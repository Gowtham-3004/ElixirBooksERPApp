// Generic register + drawer form for simple masters (payment terms, UOMs, reason codes,
// salespersons, HSN/SAC, TDS sections, currencies). Declarative field specs keep each
// master to a few lines while still giving validation, duplicate rules, audit and bulk actions.
import { useMemo, useState, type ReactNode } from 'react';
import { C, useCollection, useSession } from '../../store';
import type { BaseRecord } from '../../store';
import { Badge, Button, CheckboxField, DateField, Drawer, EntityPicker, MoneyField, NumberField, PercentField, RegisterPage, SelectField, TextField, useAccountOptions, useEmployeeOptions, useToast } from '../../components/ui';
import type { Column, FilterDef, MenuAction } from '../../components/ui';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, nextCode, saveMaster, statusTabs, useForm } from './shared';

export interface FieldSpec<T> {
  key: keyof T & string;
  label: string;
  type?: 'text' | 'number' | 'percent' | 'money' | 'select' | 'checkbox' | 'date' | 'account' | 'employee';
  options?: readonly string[] | { value: string; label: string }[];
  required?: boolean;
  help?: string | ((v: T) => string | undefined);
  validate?: (value: any, all: T) => string | null;
  decimals?: number;
  uppercase?: boolean;
  span?: 2;
  accountFilter?: (a: any) => boolean;
  show?: (v: T) => boolean;
}

export interface SimpleMasterConfig<T extends BaseRecord & { status?: string }> {
  collection: string;
  entity: string;         // duplicate-rule key (collection name)
  objectType: string;     // audit object type, e.g. 'Payment Term'
  title: string;
  subtitle?: (rows: T[]) => string;
  permission: string;     // masters.<x>
  columns: Column<T>[];
  fields: FieldSpec<T>[];
  blank: (rows: T[]) => Partial<T>;
  searchKeys: string[];
  filters?: FilterDef[];
  applyFilter?: (r: T, f: Record<string, any>) => boolean;
  dupFields: string[];
  label?: (r: T) => string;
  extraRowActions?: (r: T) => MenuAction[];
  extraTabs?: { id: string; label: string; filter: (r: T) => boolean }[];
  headerExtra?: ReactNode;
  actions?: ReactNode;
  noStatus?: boolean;
  drawerWidth?: number;
  companyScoped?: boolean;
  extraDrawerContent?: (v: T, set: (k: keyof T & string, val: any) => void) => ReactNode;
}

export function SimpleRegister<T extends BaseRecord & { status?: string }>({ cfg }: { cfg: SimpleMasterConfig<T> }) {
  const s = useSession();
  const all = useCollection<T>(cfg.collection);
  const rows = cfg.companyScoped === false ? all : all.filter((r: any) => !r.companyId || r.companyId === s.state.companyId);
  const [editing, setEditing] = useState<T | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const canEdit = s.can(`${cfg.permission}.edit`) || s.can(`${cfg.permission}.create`) || s.can(`${cfg.permission}.*`);
  return (
    <>
      <RegisterPage<T>
        title={cfg.title}
        subtitle={cfg.subtitle ? cfg.subtitle(rows) : `${rows.length} records · ${s.company?.tradeName}`}
        entity={cfg.title.toLowerCase()}
        rows={rows}
        searchKeys={cfg.searchKeys}
        tabs={cfg.noStatus ? undefined : statusTabs<any>(cfg.extraTabs as any)}
        filters={cfg.filters}
        applyFilter={cfg.applyFilter}
        primaryAction={{ label: `New ${cfg.objectType.toLowerCase()}`, onClick: () => setEditing('new'), disabled: !canEdit, reason: canEdit ? undefined : `Requires ${cfg.objectType.toLowerCase()} permission` }}
        actions={<>{cfg.actions}<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button></>}
        headerExtra={cfg.headerExtra}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => (cfg.noStatus ? [{ label: 'Edit', onClick: () => setEditing(r), disabled: !canEdit }, ...(cfg.extraRowActions?.(r) ?? [])] : masterRowActions({ collection: cfg.collection, objectType: cfg.objectType, row: r, canEdit, onEdit: () => setEditing(r), extra: cfg.extraRowActions?.(r) }))}
        bulkActions={cfg.noStatus ? undefined : (ids, sel) => bulkStatusActions(cfg.collection, cfg.objectType, ids, sel, canEdit)}
        columns={[...cfg.columns, ...(cfg.noStatus ? [] : [{ key: 'status', label: 'Status', render: (r: T) => <Badge status={r.status} /> } as Column<T>])]}
        rowClass={(r) => (!cfg.noStatus && r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <SimpleForm cfg={cfg} rows={rows} record={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity={cfg.entity} entityLabel={cfg.title} candidateFields={cfg.dupFields} />
    </>
  );
}

export function SimpleForm<T extends BaseRecord & { status?: string }>({ cfg, rows, record, onClose }: { cfg: SimpleMasterConfig<T>; rows: T[]; record?: T; onClose: () => void }) {
  const toast = useToast();
  const f = useForm<any>(record ? { ...record } : cfg.blank(rows));
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const accountOpts = useAccountOptions();
  const employeeOpts = useEmployeeOptions();
  const dups = useMemo(() => findDuplicates(cfg.entity, rows, f.v, record?.id), [rows, ...cfg.dupFields.map((k) => f.v[k])]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const save = () => {
    const e: Record<string, string> = {};
    cfg.fields.forEach((fs) => {
      if (fs.show && !fs.show(f.v)) return;
      const v = f.v[fs.key];
      if (fs.required && (v === undefined || v === null || v === '' )) e[fs.key] = `${fs.label} is required`;
      else if (fs.validate) { const m = fs.validate(v, f.v); if (m) e[fs.key] = m; }
    });
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const values: any = { ...f.v };
      cfg.fields.forEach((fs) => { if (fs.uppercase && typeof values[fs.key] === 'string') values[fs.key] = values[fs.key].toUpperCase(); if (values[fs.key] === '') values[fs.key] = undefined; });
      const saved = saveMaster<T>(cfg.collection, cfg.objectType, values, record?.id, { expectedVersion: record?.version, label: cfg.label });
      toast.success(`${cfg.objectType} ${cfg.label ? cfg.label(saved) : (saved as any).code ?? (saved as any).name} ${record ? 'updated' : 'created'}`);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? 'Could not save'); setSaving(false); }
  };
  const renderField = (fs: FieldSpec<T>) => {
    if (fs.show && !fs.show(f.v)) return null;
    const help = typeof fs.help === 'function' ? fs.help(f.v) : fs.help;
    const err = f.errors[fs.key];
    const style = fs.span === 2 ? { gridColumn: '1 / -1' } : undefined;
    const common = { label: fs.label, required: fs.required, error: err, help, style } as const;
    const v = f.v[fs.key];
    switch (fs.type) {
      case 'number': return <NumberField key={fs.key} {...common} value={v} onChange={(x) => f.set(fs.key, x)} decimals={fs.decimals ?? 2} />;
      case 'percent': return <PercentField key={fs.key} {...common} value={v} onChange={(x) => f.set(fs.key, x)} decimals={fs.decimals ?? 2} />;
      case 'money': return <MoneyField key={fs.key} {...common} value={v} onChange={(x) => f.set(fs.key, x)} />;
      case 'select': return <SelectField key={fs.key} {...common} value={v ?? ''} onChange={(x) => f.set(fs.key, x)} options={fs.options as any} allowEmpty={!fs.required} />;
      case 'checkbox': return <div key={fs.key} style={{ ...style, paddingTop: 22 }}><CheckboxField checked={!!v} onChange={(x) => f.set(fs.key, x)} label={fs.label} help={help} /></div>;
      case 'date': return <DateField key={fs.key} {...common} value={v ?? ''} onChange={(x) => f.set(fs.key, x)} />;
      case 'account': return <EntityPicker key={fs.key} {...common} value={v} onChange={(x) => f.set(fs.key, x)} options={fs.accountFilter ? accountOpts.filter((o) => fs.accountFilter!(o.raw)) : accountOpts} />;
      case 'employee': return <EntityPicker key={fs.key} {...common} value={v} onChange={(x) => f.set(fs.key, x)} options={employeeOpts} placeholder="Search employee…" />;
      default: return <TextField key={fs.key} {...common} value={v ?? ''} onChange={(x) => f.set(fs.key, fs.uppercase ? x.toUpperCase() : x)} uppercase={fs.uppercase} />;
    }
  };
  return (
    <Drawer open onClose={onClose} title={record ? `Edit ${cfg.label ? cfg.label(record) : (record as any).name ?? (record as any).code}` : `New ${cfg.objectType.toLowerCase()}`} subtitle={cfg.title} width={cfg.drawerWidth ?? 560}
      headerRight={record && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={record ? `Save ${cfg.objectType.toLowerCase()}` : `Create ${cfg.objectType.toLowerCase()}`} disabled={blocked} reason={blocked ? 'Duplicate blocked' : undefined} /> : undefined}>
      {tab === 'history' && record ? <ChangeHistory objectId={record.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} labelOf={cfg.label} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {cfg.fields.map(renderField)}
            {!cfg.noStatus && <SelectField label="Status" value={f.v.status ?? 'Active'} onChange={(x) => f.set('status', x)} options={['Active', 'Inactive']} />}
          </div>
          {cfg.extraDrawerContent?.(f.v, (k, val) => f.set(k, val))}
        </div>
      )}
    </Drawer>
  );
}

export { nextCode, C };
