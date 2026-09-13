// CRM activities: calls, meetings, notes, follow-ups with due dates; overdue list; drawer.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import { RegisterPage, Badge, TwoLine, Button, Drawer, TextField, SelectField, DateField, TextArea, MoneyField, EntityPicker, useCustomerOptions, useToast, KpiTile } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtDateTime, today, addDays } from '../../lib/format';
import type { CrmActivity, ActivityType, Lead } from './types';
import { ACTIVITY_TYPES } from './types';

export function ActivityDrawer({ onClose, initial, activity }: { onClose: () => void; initial?: Partial<CrmActivity>; activity?: CrmActivity }) {
  const toast = useToast();
  const s = useSession();
  const custOpts = useCustomerOptions();
  const leads = useCollection<Lead>(C.leads);
  const [a, setA] = useState<Partial<CrmActivity>>(activity ?? { type: 'Call', status: 'Open', dueAt: addDays(today(), 1), ...initial });
  const set = (p: Partial<CrmActivity>) => setA((x) => ({ ...x, ...p }));
  const done = ['Call', 'Meeting', 'Email', 'Note'].includes(a.type ?? '') && !a.dueAt;
  const save = () => {
    if (!a.subject?.trim()) { toast.error('Subject is required'); return; }
    const cust = db.find<any>(C.customers, a.customerId);
    const lead = leads.find((l) => l.id === a.leadId);
    const payload = { ...a, customerName: cust?.name, leadName: lead?.name, ownerId: a.ownerId ?? s.user?.id, ownerName: a.ownerName ?? s.user?.name ?? '', status: a.status ?? (done ? 'Done' : 'Open'), doneAt: a.status === 'Done' ? a.doneAt ?? new Date().toISOString() : undefined };
    if (activity) db.update<CrmActivity>(C.crmActivities, activity.id, payload);
    else { const out = db.insert<CrmActivity>(C.crmActivities, payload as any); engine.audit({ action: `crm.${(a.type ?? 'note').toLowerCase().replace(/\s+/g, '_')}`, objectType: a.customerId ? 'Customer' : 'Lead', objectId: a.customerId ?? a.leadId, objectNumber: cust?.name ?? lead?.name, detail: a.subject }); if (a.type === 'Follow-up' && a.dueAt) engine.notify({ type: 'due', title: `Follow-up: ${a.subject}`, body: `${cust?.name ?? lead?.name ?? ''} · due ${fmtDate(a.dueAt)}`, link: `crm/activities?id=${out.id}` }); }
    toast.success(activity ? 'Activity updated' : `${a.type} logged`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={activity ? 'Edit activity' : 'Log activity'} width={520} footer={<><Button variant="ghost" onClick={onClose}>Discard</Button><Button variant="primary" onClick={save}>{activity ? 'Save' : 'Log activity'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid-2"><SelectField label="Type" value={a.type ?? 'Call'} onChange={(v) => set({ type: v as ActivityType })} options={ACTIVITY_TYPES} /><SelectField label="Status" value={a.status ?? 'Open'} onChange={(v) => set({ status: v as any })} options={['Open', 'Done', 'Cancelled']} /></div>
        <TextField label="Subject" required value={a.subject ?? ''} onChange={(v) => set({ subject: v })} autoFocus />
        <div className="grid-2"><EntityPicker label="Customer" value={a.customerId} onChange={(id) => set({ customerId: id })} options={custOpts} placeholder="Optional" /><SelectField label="Lead" value={a.leadId ?? ''} onChange={(v) => set({ leadId: v || undefined })} options={leads.map((l) => ({ value: l.id, label: `${l.name} · ${l.company}` }))} placeholder="Optional" /></div>
        <div className="grid-2"><DateField label={a.type === 'Promise to pay' ? 'Promised by' : 'Due / scheduled'} value={a.type === 'Promise to pay' ? a.promiseDate : a.dueAt} onChange={(v) => set(a.type === 'Promise to pay' ? { promiseDate: v } : { dueAt: v })} />{a.type === 'Promise to pay' ? <MoneyField label="Promised amount" value={a.promiseAmount ?? 0} onChange={(v) => set({ promiseAmount: v })} /> : <TextField label="Outcome" value={a.outcome ?? ''} onChange={(v) => set({ outcome: v })} placeholder="Agreed, no answer, callback…" />}</div>
        <TextArea label="Notes" value={a.notes ?? ''} onChange={(v) => set({ notes: v })} rows={4} />
      </div>
    </Drawer>
  );
}

export function ActivitiesPage({ focusId }: { focusId?: string }) {
  const all = useCollection<CrmActivity>(C.crmActivities);
  const s = useSession();
  const toast = useToast();
  const rows = useMemo(() => all.filter((a) => !a.companyId || a.companyId === s.state.companyId).slice().sort((a, b) => (a.status === 'Open' ? 0 : 1) - (b.status === 'Open' ? 0 : 1) || (a.dueAt ?? a.createdAt).localeCompare(b.dueAt ?? b.createdAt)), [all, s.state.companyId]);
  const [drawer, setDrawer] = useState<CrmActivity | 'new' | null>(focusId ? (all.find((a) => a.id === focusId) ?? null) : null);
  const t = today();
  const overdue = rows.filter((a) => a.status === 'Open' && ((a.dueAt && a.dueAt < t) || (a.promiseDate && a.promiseDate < t)));
  const dueToday = rows.filter((a) => a.status === 'Open' && (a.dueAt === t || a.promiseDate === t));
  const mine = rows.filter((a) => a.status === 'Open' && a.ownerId === s.user?.id);
  const columns: Column<CrmActivity>[] = [
    { key: 'type', label: 'Type', render: (r) => <Badge status={r.type === 'Promise to pay' ? 'Approved' : r.type === 'Reminder' ? 'Returned' : r.type === 'Follow-up' ? 'Submitted' : 'Draft'}>{r.type}</Badge>, value: (r) => r.type },
    { key: 'subject', label: 'Subject', render: (r) => <TwoLine primary={r.subject} secondary={r.notes?.slice(0, 80)} />, value: (r) => r.subject },
    { key: 'who', label: 'Customer / lead', render: (r) => r.customerId ? <span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`crm/customers/${r.customerId}`); }}>{r.customerName}</span> : r.leadId ? <span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`crm/leads/${r.leadId}`); }}>{r.leadName}</span> : '—', value: (r) => r.customerName ?? r.leadName },
    { key: 'due', label: 'Due', sortable: true, render: (r) => { const d = r.promiseDate ?? r.dueAt; if (!d) return '—'; const late = r.status === 'Open' && d < t; return <span style={{ color: late ? '#C0393F' : undefined }}>{fmtDate(d)}{late ? ' · overdue' : ''}</span>; }, value: (r) => r.promiseDate ?? r.dueAt },
    { key: 'owner', label: 'Owner', render: (r) => r.ownerName },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Done' ? 'Completed' : r.status === 'Open' ? 'Open' : 'Cancelled'}>{r.status}</Badge>, value: (r) => r.status },
    { key: 'when', label: 'Logged', render: (r) => fmtDateTime(r.createdAt), value: (r) => r.createdAt },
  ];
  const rowActions = (r: CrmActivity): MenuAction[] => [
    { label: 'Edit', onClick: () => setDrawer(r) },
    ...(r.status === 'Open' ? [{ label: 'Mark done', onClick: () => { db.update<CrmActivity>(C.crmActivities, r.id, { status: 'Done', doneAt: new Date().toISOString() }); toast.success('Marked done'); } }, { label: 'Snooze 3 days', onClick: () => db.update<CrmActivity>(C.crmActivities, r.id, { dueAt: addDays(r.dueAt ?? t, 3) }) }, { label: 'Cancel', danger: true, onClick: () => db.update<CrmActivity>(C.crmActivities, r.id, { status: 'Cancelled' }) }] : []),
  ];
  return (
    <>
      <RegisterPage<CrmActivity> title="Activities" subtitle={`${rows.filter((a) => a.status === 'Open').length} open · ${overdue.length} overdue · ${mine.length} assigned to you`} rows={rows} columns={columns} entity="activities" searchKeys={['subject', 'customerName', 'leadName', 'notes']}
        headerExtra={<div className="grid-4"><KpiTile label="Overdue" value={<span style={{ color: overdue.length ? '#C0393F' : undefined }}>{overdue.length}</span>} sub="past due, still open" /><KpiTile label="Due today" value={dueToday.length} /><KpiTile label="Mine" value={mine.length} sub={s.user?.name} /><KpiTile label="Logged this week" value={rows.filter((a) => a.createdAt >= addDays(t, -7)).length} /></div>}
        tabs={[{ id: 'open', label: 'Open', filter: (r) => r.status === 'Open' }, { id: 'overdue', label: 'Overdue', filter: (r) => overdue.includes(r) }, { id: 'mine', label: 'Mine', filter: (r) => r.ownerId === s.user?.id }, { id: 'done', label: 'Done', filter: (r) => r.status === 'Done' }, { id: 'all', label: 'All' }]}
        filters={[{ key: 'type', label: 'Type', type: 'select', options: ACTIVITY_TYPES.map((x) => ({ value: x, label: x })) }]} applyFilter={(r, f) => !f.type || r.type === f.type}
        primaryAction={{ label: 'Log activity', onClick: () => setDrawer('new') }} onRowClick={(r) => setDrawer(r)} rowActions={rowActions} />
      {drawer && <ActivityDrawer onClose={() => setDrawer(null)} activity={drawer === 'new' ? undefined : drawer} />}
    </>
  );
}
