// Roles & permissions (FR-IAM-003): role cards → editor with permission matrix (module × resource × action),
// data scope, duplicate, system roles read-only, users-in-role.
import { Fragment, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Role, User } from '../../store';
import { PageHeader, Card, Button, Badge, TextField, TextArea, RadioCards, Banner, useToast, ConfirmDialog, Avatar, EmptyState, Drawer } from '../../components/ui';
import { PERMISSION_MATRIX, PERMISSION_ACTIONS, permissionCovers } from './shared';

export default function Roles({ id }: { id?: string }) {
  if (id) return <RoleEditor id={id} />;
  return <RoleCards />;
}

function RoleCards() {
  const s = useSession();
  const toast = useToast();
  const roles = useCollection<Role>(C.roles);
  const users = useCollection<User>(C.users).filter((u) => u.tenantId === s.state.tenantId);
  const canEdit = s.can('admin.roles.create') || s.can('admin.roles.*') || s.isTenantOwner;
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', description: '', code: '' });
  const create = () => {
    if (!f.name.trim()) { toast.error('Role name is required'); return; }
    const code = (f.code || f.name).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (roles.some((r) => r.code === code)) { toast.error(`Role code ${code} already exists`); return; }
    const r = db.insert<Role>(C.roles, { companyId: undefined, code, name: f.name.trim(), description: f.description.trim(), permissions: [], dataScope: 'company', isSystem: false, color: ['#325CFF', '#12784E', '#F97316', '#A855F7', '#0EA5E9', '#0D9488'][roles.length % 6] });
    engine.audit({ action: 'role.created', objectType: 'Role', objectId: r.id, objectNumber: r.code, sensitive: true });
    setOpen(false);
    nav.go(`admin/roles/${r.id}`);
  };
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader title="Roles & permissions" subtitle={`${roles.length} roles · ${roles.filter((r) => r.isSystem).length} system · customisable per tenant`} actions={<Button variant="primary" onClick={() => setOpen(true)} disabled={!canEdit} reason={canEdit ? undefined : 'Requires admin.roles.create'}>+ New role</Button>} />
      <div className="grid-2">
        {roles.map((r) => {
          const n = users.filter((u) => u.roleIds.includes(r.id)).length;
          return (
            <div key={r.id} className="card" style={{ padding: '16px 20px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start' }} onClick={() => nav.go(`admin/roles/${r.id}`)} onMouseOver={(e) => (e.currentTarget.style.borderColor = r.color ?? '#325CFF')} onMouseOut={(e) => (e.currentTarget.style.borderColor = '#EAEAEA')}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: (r.color ?? '#325CFF') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ fontSize: 16 }}>👤</span></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name} {r.isSystem && <Badge status="Locked">System</Badge>}</span>
                  <span style={{ fontSize: 12, color: '#5F6368', whiteSpace: 'nowrap' }}>{n} user{n !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ fontSize: 12, color: '#5F6368', lineHeight: 1.5 }}>{r.description}</div>
                <div style={{ fontSize: 11, color: '#6E6E71', marginTop: 6 }}>{r.code} · {r.dataScope} scope · {r.permissions.includes('*') ? 'all permissions' : `${r.permissions.length} permission rule${r.permissions.length === 1 ? '' : 's'}`}</div>
              </div>
            </div>
          );
        })}
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="New role" width={480} footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Discard</Button><Button variant="primary" onClick={create}>Create role</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <TextField label="Name" required value={f.name} onChange={(v) => setF({ ...f, name: v })} autoFocus />
          <TextField label="Code" value={f.code} onChange={(v) => setF({ ...f, code: v })} placeholder="Derived from the name" uppercase />
          <TextArea label="Description" value={f.description} onChange={(v) => setF({ ...f, description: v })} rows={2} />
          <div style={{ fontSize: 12, color: '#6E6E71' }}>Permissions are set in the editor after creation.</div>
        </div>
      </Drawer>
    </div>
  );
}

function RoleEditor({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const role = useRecord<Role>(C.roles, id);
  const users = useCollection<User>(C.users).filter((u) => u.tenantId === s.state.tenantId && u.roleIds.includes(id));
  const [perms, setPerms] = useState<string[] | null>(null);
  const [meta, setMeta] = useState<{ name: string; description: string; dataScope: Role['dataScope'] } | null>(null);
  const [del, setDel] = useState(false);
  if (!role) return <div className="page"><EmptyState icon="🔒" title="Role not found" action={<Button variant="secondary" onClick={() => nav.go('admin/roles')}>Back to roles</Button>} /></div>;
  const current = perms ?? role.permissions;
  const m = meta ?? { name: role.name, description: role.description, dataScope: role.dataScope };
  const readOnly = role.isSystem || !(s.can('admin.roles.edit') || s.can('admin.roles.*') || s.isTenantOwner);
  const dirty = perms !== null || meta !== null;
  const all = current.includes('*');

  const has = (mod: string, res: string, act: string) => permissionCovers(current, `${mod}.${res}.${act}`);
  const toggle = (mod: string, res: string, act: string) => {
    if (readOnly) return;
    const key = `${mod}.${res}.${act}`;
    let next = current.filter((p) => p !== '*');
    // expand wildcards that cover this key so the single toggle can be removed
    const expand = (p: string) => {
      const out: string[] = [];
      const [pm, pr] = p.split('.');
      const modDef = PERMISSION_MATRIX.find((x) => x.module === pm);
      if (p === `${pm}.*`) modDef?.resources.forEach((r) => PERMISSION_ACTIONS.forEach((a) => out.push(`${pm}.${r.id}.${a}`)));
      else if (p === `${pm}.${pr}.*`) PERMISSION_ACTIONS.forEach((a) => out.push(`${pm}.${pr}.${a}`));
      else if (p.startsWith('*.')) PERMISSION_MATRIX.forEach((md) => md.resources.forEach((r) => out.push(`${md.module}.${r.id}.${p.split('.')[2]}`)));
      else out.push(p);
      return out;
    };
    if (has(mod, res, act)) {
      next = Array.from(new Set(next.flatMap(expand))).filter((p) => p !== key);
      if (current.includes('*')) next = Array.from(new Set(PERMISSION_MATRIX.flatMap((md) => md.resources.flatMap((r) => PERMISSION_ACTIONS.map((a) => `${md.module}.${r.id}.${a}`))))).filter((p) => p !== key);
    } else next = [...next, key];
    // re-collapse full resources and modules
    const collapsed: string[] = [];
    PERMISSION_MATRIX.forEach((md) => {
      const resFull = md.resources.filter((r) => PERMISSION_ACTIONS.every((a) => next.includes(`${md.module}.${r.id}.${a}`)));
      if (resFull.length === md.resources.length) { collapsed.push(`${md.module}.*`); return; }
      resFull.forEach((r) => collapsed.push(`${md.module}.${r.id}.*`));
      md.resources.filter((r) => !resFull.includes(r)).forEach((r) => PERMISSION_ACTIONS.forEach((a) => { if (next.includes(`${md.module}.${r.id}.${a}`)) collapsed.push(`${md.module}.${r.id}.${a}`); }));
    });
    next.filter((p) => !PERMISSION_MATRIX.some((md) => p.startsWith(md.module + '.'))).forEach((p) => collapsed.push(p));
    setPerms(Array.from(new Set(collapsed)));
  };
  const toggleModule = (mod: string) => {
    if (readOnly) return;
    const def = PERMISSION_MATRIX.find((x) => x.module === mod)!;
    const full = def.resources.every((r) => PERMISSION_ACTIONS.every((a) => has(mod, r.id, a)));
    const base = current.filter((p) => p !== '*' && !p.startsWith(mod + '.'));
    const expanded = current.includes('*') ? PERMISSION_MATRIX.filter((md) => md.module !== mod).map((md) => `${md.module}.*`) : base;
    setPerms(full ? expanded : [...expanded, `${mod}.*`]);
  };

  const save = () => {
    const before = { permissions: role.permissions, dataScope: role.dataScope, name: role.name };
    db.update<Role>(C.roles, role.id, { permissions: current, name: m.name.trim() || role.name, description: m.description, dataScope: m.dataScope });
    engine.audit({ action: 'role.updated', objectType: 'Role', objectId: role.id, objectNumber: role.code, detail: `${current.length} permission rule(s) · ${m.dataScope} scope · affects ${users.length} user(s)`, sensitive: true, before, after: { permissions: current, dataScope: m.dataScope, name: m.name } });
    setPerms(null); setMeta(null);
    toast.success('Role saved — effective on the next request for every user in this role');
  };
  const duplicate = () => {
    const r = db.insert<Role>(C.roles, { companyId: undefined, code: `${role.code}_COPY`, name: `${role.name} (copy)`, description: role.description, permissions: role.permissions, dataScope: role.dataScope, isSystem: false, color: role.color });
    engine.audit({ action: 'role.duplicated', objectType: 'Role', objectId: r.id, objectNumber: r.code, detail: `from ${role.code}`, sensitive: true });
    nav.go(`admin/roles/${r.id}`);
  };
  const remove = (reason: string) => {
    if (users.length) throw new Error(`${users.length} user(s) still hold this role — reassign them first`);
    db.remove(C.roles, role.id);
    engine.audit({ action: 'role.deleted', objectType: 'Role', objectId: role.id, objectNumber: role.code, detail: reason, sensitive: true });
    nav.go('admin/roles');
  };
  const count = useMemo(() => PERMISSION_MATRIX.reduce((n, md) => n + md.resources.reduce((x, r) => x + PERMISSION_ACTIONS.filter((a) => has(md.module, r.id, a)).length, 0), 0), [current]);

  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHeader back={{ label: 'Roles & permissions', path: 'admin/roles' }} title={<span>{role.name} {role.isSystem && <Badge status="Locked">System role</Badge>}</span>} subtitle={`${role.code} · ${count} granted actions · ${users.length} user${users.length === 1 ? '' : 's'}`}
        actions={<>
          <Button variant="secondary" onClick={duplicate}>Duplicate</Button>
          {!role.isSystem && <Button variant="danger" onClick={() => setDel(true)} disabled={readOnly || users.length > 0} reason={users.length ? `${users.length} user(s) hold this role` : undefined}>Delete</Button>}
          {dirty && <Button variant="ghost" onClick={() => { setPerms(null); setMeta(null); }}>Discard</Button>}
          <Button variant="primary" onClick={save} disabled={readOnly || !dirty} reason={readOnly ? (role.isSystem ? 'System roles are read-only — duplicate to customise' : 'Requires admin.roles.edit') : !dirty ? 'No changes' : undefined}>Save role</Button>
        </>} />
      {role.isSystem && <Banner tone="info">System roles are maintained by the product so guardrails (owner, auditor, finance controls) cannot be weakened. Duplicate this role to create an editable copy.</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, alignItems: 'start' }}>
        <Card title="Permission matrix" actions={all ? <Badge status="Approved">All permissions (*)</Badge> : undefined} padding={0}>
          <div style={{ overflow: 'auto' }}>
            <table className="data-table dense" style={{ minWidth: 900 }}>
              <thead><tr><th style={{ minWidth: 220 }}>Module · resource</th>{PERMISSION_ACTIONS.map((a) => <th key={a} style={{ textAlign: 'center', textTransform: 'capitalize' }}>{a}</th>)}</tr></thead>
              <tbody>
                {PERMISSION_MATRIX.map((md) => {
                  const full = md.resources.every((r) => PERMISSION_ACTIONS.every((a) => has(md.module, r.id, a)));
                  return (
                    <Fragment key={md.module}>
                      <tr style={{ background: '#F9FBFC' }}>
                        <td colSpan={PERMISSION_ACTIONS.length + 1} style={{ fontWeight: 600 }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}><input type="checkbox" className="checkbox" checked={full} disabled={readOnly} onChange={() => toggleModule(md.module)} /> {md.label} <span style={{ fontSize: 11, color: '#6E6E71', fontWeight: 400 }}>{md.module}.*</span></label>
                        </td>
                      </tr>
                      {md.resources.map((r) => (
                        <tr key={`${md.module}.${r.id}`}>
                          <td style={{ paddingLeft: 32 }}>{r.label} <span style={{ fontSize: 11, color: '#B0B5BF' }}>{r.id}</span></td>
                          {PERMISSION_ACTIONS.map((a) => (
                            <td key={a} style={{ textAlign: 'center' }}><input type="checkbox" className="checkbox" checked={has(md.module, r.id, a)} disabled={readOnly} onChange={() => toggle(md.module, r.id, a)} title={`${md.module}.${r.id}.${a}`} /></td>
                          ))}
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card title="Role">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TextField label="Name" value={m.name} onChange={(v) => setMeta({ ...m, name: v })} disabled={readOnly} />
              <TextArea label="Description" value={m.description} onChange={(v) => setMeta({ ...m, description: v })} rows={3} disabled={readOnly} />
              <RadioCards label="Data scope" value={m.dataScope} onChange={(v) => !readOnly && setMeta({ ...m, dataScope: v as Role['dataScope'] })} options={[{ value: 'company', label: 'Company', description: 'All branches' }, { value: 'branch', label: 'Branch', description: 'Assigned branches only' }, { value: 'own', label: 'Own records', description: 'Only what they created' }]} columns={1} />
            </div>
          </Card>
          <Card title="Permission strings">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{current.length ? current.map((p) => <span key={p} className="chip" style={{ fontSize: 11 }}>{p}</span>) : <span style={{ fontSize: 12, color: '#5F6368' }}>No permissions granted</span>}</div>
          </Card>
          <Card title={`Users in role · ${users.length}`}>
            {users.length === 0 && <div style={{ fontSize: 13, color: '#5F6368' }}>No users hold this role.</div>}
            {users.map((u) => (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #F5F5F5', cursor: 'pointer' }} onClick={() => nav.go(`admin/users/${u.id}`)}>
                <Avatar name={u.name} size={24} /><span style={{ flex: 1, fontSize: 13 }}>{u.name}</span><Badge status={u.status} />
              </div>
            ))}
          </Card>
        </div>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title={`Delete role ${role.name}?`} statement="The role is removed permanently. Audit history keeps its code." reasonRequired confirmLabel="Delete role" cancelLabel="Keep role" danger onConfirm={remove} />
    </div>
  );
}
