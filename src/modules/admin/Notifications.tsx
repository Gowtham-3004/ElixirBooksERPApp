// Notification settings (FR-NTF-001): event → template → channels table with enable toggles; delivery log with retry.
import { useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { NotificationSetting, Notification } from '../../store';
import { fmtDateTime } from '../../lib/format';
import { PageHeader, Card, Button, Badge, Toggle, Tabs, DataTable, TwoLine, useToast, TextField, Drawer, Banner } from '../../components/ui';
import type { Column } from '../../components/ui';

export default function Notifications() {
  const s = useSession();
  const toast = useToast();
  const settings = useCollection<NotificationSetting>(C.notificationSettings).filter((n) => n.companyId === s.state.companyId);
  const log = useCollection<Notification>(C.notifications).filter((n) => n.companyId === s.state.companyId || !n.companyId).sort((a, b) => b.at.localeCompare(a.at));
  const [tab, setTab] = useState<'settings' | 'log'>('settings');
  const [edit, setEdit] = useState<NotificationSetting | null>(null);
  const canEdit = s.can('admin.notifications.edit') || s.can('admin.company.edit') || s.isTenantOwner;
  const upd = (n: NotificationSetting, patch: Partial<NotificationSetting>) => { db.update<NotificationSetting>(C.notificationSettings, n.id, patch); engine.audit({ action: 'notification.setting.updated', objectType: 'NotificationSetting', objectId: n.id, objectNumber: n.event, detail: JSON.stringify(patch) }); };
  const retry = (n: Notification) => {
    db.update<Notification>(C.notifications, n.id, { status: 'sent' });
    setTimeout(() => db.update<Notification>(C.notifications, n.id, { status: 'delivered' }), 700);
    engine.audit({ action: 'notification.retried', objectType: 'Notification', objectId: n.id, objectNumber: n.title, channel: 'worker' });
    toast.success('Delivery retried');
  };
  const cols: Column<Notification>[] = [
    { key: 'at', label: 'When', render: (n) => <span style={{ fontSize: 12, color: '#5F6368', whiteSpace: 'nowrap' }}>{fmtDateTime(n.at)}</span> },
    { key: 'title', label: 'Notification', render: (n) => <TwoLine primary={n.title} secondary={n.body} /> },
    { key: 'type', label: 'Event', render: (n) => <Badge status="Draft">{n.type}</Badge> },
    { key: 'channel', label: 'Channel', render: (n) => <span style={{ fontSize: 12 }}>{n.channel ?? 'in-app'}</span> },
    { key: 'userId', label: 'Recipient', render: (n) => <span style={{ fontSize: 12, color: '#5F6368' }}>{n.userId ? db.find<any>(C.users, n.userId)?.name ?? n.userId : 'Company'}</span> },
    { key: 'read', label: 'Read', render: (n) => <span style={{ fontSize: 12, color: n.read ? '#12784E' : '#5F6368' }}>{n.read ? 'Read' : 'Unread'}</span> },
    { key: 'status', label: 'Delivery', render: (n) => <Badge status={n.status === 'delivered' ? 'Delivered' : n.status === 'failed' ? 'Failed' : n.status === 'sent' ? 'Sent' : 'Queued'}>{n.status ?? 'delivered'}</Badge> },
  ];
  return (
    <div className="page" style={{ maxWidth: 1200 }}>
      <PageHeader title="Notification settings" subtitle="Event-driven templates with per-channel delivery; failures never undo a valid posting (FR-NTF-002)" />
      <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'settings', label: 'Events & channels', count: settings.length }, { id: 'log', label: 'Delivery log', count: log.length }]} />
      {tab === 'settings' && (
        <Card padding={0} style={{ overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Event</th><th>Template</th><th style={{ textAlign: 'center' }}>In-app</th><th style={{ textAlign: 'center' }}>Email</th><th style={{ textAlign: 'center' }}>SMS</th><th>Enabled</th><th /></tr></thead>
            <tbody>
              {settings.map((n) => (
                <tr key={n.id} style={{ opacity: n.enabled ? 1 : 0.6 }}>
                  <td><TwoLine primary={n.label} secondary={<span className="identifier">{n.event} · {n.category}</span>} /></td>
                  <td style={{ fontSize: 12, color: '#5F6368', maxWidth: 360 }}>{n.template}</td>
                  {(['inApp', 'email', 'sms'] as const).map((ch) => <td key={ch} style={{ textAlign: 'center' }}><input type="checkbox" className="checkbox" checked={n.channels[ch]} disabled={!canEdit} onChange={(e) => upd(n, { channels: { ...n.channels, [ch]: e.target.checked } })} /></td>)}
                  <td><Toggle on={n.enabled} onChange={(v) => upd(n, { enabled: v })} disabled={!canEdit} /></td>
                  <td style={{ textAlign: 'right' }}><Button size="sm" variant="ghost" onClick={() => setEdit(n)} disabled={!canEdit}>Edit template</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {tab === 'log' && <DataTable rows={log} columns={cols} emptyTitle="No notifications yet" rowActions={(n) => [{ label: 'Retry delivery', onClick: () => retry(n), disabled: n.status !== 'failed', reason: n.status !== 'failed' ? 'Only failed deliveries' : undefined }, { label: n.read ? 'Mark unread' : 'Mark read', onClick: () => db.patchSilent<Notification>(C.notifications, n.id, { read: !n.read }) }]} />}
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit ? `Template · ${edit.label}` : ''} subtitle="Variables in {{double braces}} are filled from the event payload" width={520} footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Discard</Button><Button variant="primary" onClick={() => { if (edit) { upd(edit, { template: edit.template, label: edit.label }); toast.success('Template saved'); setEdit(null); } }}>Save template</Button></>}>
        {edit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField label="Label" value={edit.label} onChange={(v) => setEdit({ ...edit, label: v })} />
            <TextField label="Template" value={edit.template} onChange={(v) => setEdit({ ...edit, template: v })} />
            <Banner tone="info">Preview: {edit.template.replace(/\{\{(\w+)\}\}/g, (_, k) => ({ docType: 'Sales Invoice', docNumber: 'INV/26-27/0118', approverLabel: 'Finance Approver', actor: 'Rahul Kumar', status: 'returned', comment: 'Fix the PO reference', hours: '6', escalationRole: 'Tenant Owner', provider: 'IRP', providerRef: 'Ack 2324…', errorMessage: 'GSTIN inactive', entity: 'Items', rows: '42', errors: '3', name: 'sales-invoices', expiresAt: '20 Sep', count: '6', amount: '₹4.1 L', returnType: 'GSTR-3B', period: 'Aug 2026', dueDate: '20 Sep', device: 'Safari · iPhone', location: 'Mumbai', attempts: '3', error: 'timeout', action: 'locked' } as Record<string, string>)[k] ?? `{{${k}}}`)}</Banner>
          </div>
        )}
      </Drawer>
    </div>
  );
}
