// Collections follow-up (FR-AR-005): overdue invoices by customer, promise-to-pay, notes, reminders, credit exposure.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../../store';
import type { Customer, OpenItem } from '../../../store';
import { Button, Badge, Pill, Drawer, SelectField, TextField, TextArea, DateField, MoneyField, useToast, KpiTile, ScopeLine, EmptyState, Meter, Timeline, EntityPicker, useCustomerOptions } from '../../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, today, daysBetween, addDays } from '../../../lib/format';
import type { CrmActivity } from '../../crm/types';
import { emailDocument } from '../actions';

export interface CollectionRow { customer: Customer; outstanding: number; overdue: number; oldest: number; items: OpenItem[]; credits: number; promise?: CrmActivity; lastActivity?: CrmActivity; openFollowUps: number }

export function useCollectionRows(customerFilter?: string): CollectionRow[] {
  const openItems = useCollection<OpenItem>(C.openItems);
  const customers = useCollection<Customer>(C.customers);
  const activities = useCollection<CrmActivity>(C.crmActivities);
  const s = useSession();
  return useMemo(() => {
    const t = today();
    return customers.filter((c) => !c.companyId || c.companyId === s.state.companyId).map((c) => {
      const items = openItems.filter((o) => o.partyType === 'Customer' && o.partyId === c.id && (o.status === 'Open' || o.status === 'Partially Settled'));
      const debit = items.filter((o) => o.direction === 'Debit');
      const outstanding = debit.reduce((a, o) => a + o.baseOutstanding, 0);
      const credits = items.filter((o) => o.direction === 'Credit').reduce((a, o) => a + o.baseOutstanding, 0);
      const overdueItems = debit.filter((o) => o.dueDate < t);
      const overdue = overdueItems.reduce((a, o) => a + o.baseOutstanding, 0);
      const oldest = overdueItems.reduce((a, o) => Math.max(a, daysBetween(o.dueDate, t)), 0);
      const acts = activities.filter((a) => a.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const promise = acts.find((a) => a.type === 'Promise to pay' && a.status === 'Open');
      return { customer: c, outstanding, overdue, oldest, items: debit.sort((a, b) => a.dueDate.localeCompare(b.dueDate)), credits, promise, lastActivity: acts[0], openFollowUps: acts.filter((a) => a.status === 'Open' && a.type !== 'Promise to pay').length };
    }).filter((r) => (customerFilter ? r.customer.id === customerFilter : r.outstanding > 0.005)).sort((a, b) => b.overdue - a.overdue || b.outstanding - a.outstanding);
  }, [openItems, customers, activities, s.state.companyId, customerFilter]);
}

export function logActivity(a: Partial<CrmActivity> & { type: CrmActivity['type']; subject: string }): CrmActivity {
  const c = engine.ctx();
  const out = db.insert<CrmActivity>(C.crmActivities, { status: 'Open', ownerId: c.userId, ownerName: c.userName, ...a });
  engine.audit({ action: `crm.${a.type.toLowerCase().replace(/\s+/g, '_')}`, objectType: a.customerId ? 'Customer' : 'Lead', objectId: a.customerId ?? a.leadId, objectNumber: a.customerName ?? a.leadName, detail: a.subject });
  return out;
}

export function sendReminder(row: CollectionRow, channel: 'email' | 'sms' = 'email') {
  const c = row.customer;
  const to = c.contacts.find((x) => x.isDefault)?.email ?? c.email ?? `${c.code.toLowerCase()}@customer.invalid`;
  const subject = `Payment reminder · ${fmtMoney(row.overdue)} overdue`;
  const body = row.items.filter((o) => o.dueDate < today()).map((o) => `${o.docNumber} due ${fmtDate(o.dueDate)} · ${fmtMoney(o.outstanding, o.currency)}`).join('\n');
  emailDocument(C.customers, { id: c.id, number: `REM-${c.code}`, docType: 'Payment Reminder', correlationId: 'collections', companyId: c.companyId } as any, to, subject, body);
  logActivity({ type: 'Reminder', subject: `${channel === 'email' ? 'Email' : 'SMS'} reminder · ${fmtMoney(row.overdue)} overdue (${row.items.filter((o) => o.dueDate < today()).length} invoices)`, notes: body, customerId: c.id, customerName: c.name, status: 'Done', doneAt: new Date().toISOString(), channel });
  engine.notify({ type: 'due', title: `Reminder sent to ${c.name}`, body: subject, link: `sales/collections?customer=${c.id}` });
}

export default function Collections({ customerId }: { customerId?: string }) {
  const rows = useCollectionRows(customerId);
  const s = useSession();
  const toast = useToast();
  const custOpts = useCustomerOptions();
  const [drawer, setDrawer] = useState<{ row: CollectionRow; mode: 'promise' | 'note' | 'followup' } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(customerId ?? null);
  const activities = useCollection<CrmActivity>(C.crmActivities);
  const cur = s.currency;
  const totOverdue = rows.reduce((a, r) => a + r.overdue, 0);
  const totOut = rows.reduce((a, r) => a + r.outstanding, 0);
  const promised = rows.reduce((a, r) => a + (r.promise?.promiseAmount ?? 0), 0);
  const brokenPromises = activities.filter((a) => a.type === 'Promise to pay' && a.status === 'Open' && a.promiseDate && a.promiseDate < today());
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Collections follow-up</h1><div className="page-subtitle"><ScopeLine extra={`${rows.filter((r) => r.overdue > 0).length} customers overdue`} /></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ width: 260 }}><EntityPicker value={customerId} onChange={(id) => nav.go('sales/collections', { customer: id })} options={custOpts} placeholder="Filter by customer…" size="sm" /></div>
          <Button variant="secondary" onClick={() => nav.go('sales/ageing')}>AR ageing</Button>
          <Button variant="primary" onClick={() => { const targets = rows.filter((r) => r.overdue > 0 && !r.promise); targets.forEach((r) => sendReminder(r)); toast.success(`${targets.length} reminder${targets.length === 1 ? '' : 's'} sent`); }} disabled={!rows.some((r) => r.overdue > 0 && !r.promise)} reason="No overdue customers without an active promise">Send reminders to all overdue</Button>
        </div>
      </div>
      <div className="grid-4">
        <KpiTile label="Total outstanding" amount={totOut} currency={cur} sub={`${rows.length} customers`} />
        <KpiTile label="Overdue" value={<span style={{ color: 'var(--danger)' }}>{fmtMoney(totOverdue, cur)}</span>} sub={totOut ? `${Math.round((totOverdue / totOut) * 100)}% of outstanding` : undefined} />
        <KpiTile label="Promised to pay" amount={promised} currency={cur} sub={`${rows.filter((r) => r.promise).length} active promises`} deltaTone="good" />
        <KpiTile label="Broken promises" value={<span style={{ color: brokenPromises.length ? 'var(--danger)' : undefined }}>{brokenPromises.length}</span>} sub="promise date passed, still open" />
      </div>
      {rows.length === 0 && <EmptyState illustration="all-done" animated title="Nothing to collect" description="No customer has an outstanding balance." />}
      {rows.map((r) => {
        const open = expanded === r.customer.id;
        const limit = r.customer.creditLimit;
        return (
          <div key={r.customer.id} className="card" style={{ overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(open ? null : r.customer.id)}>
              <div style={{ flex: 1.4, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{r.customer.name}</div><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.customer.code} · {r.customer.paymentTerms} · {r.items.length} open invoice{r.items.length === 1 ? '' : 's'}{r.lastActivity ? ` · last: ${r.lastActivity.type} ${fmtDate(r.lastActivity.createdAt)}` : ''}</div></div>
              <div style={{ width: 150, textAlign: 'right' }}><div className="section-label">Outstanding</div><div className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.outstanding, cur)}</div></div>
              <div style={{ width: 150, textAlign: 'right' }}><div className="section-label">Overdue</div><div className="money" style={{ fontWeight: 600, color: r.overdue ? 'var(--danger)' : 'var(--ink-3)' }}>{fmtMoney(r.overdue, cur)}</div>{r.oldest > 0 && <Pill tone={r.oldest > 60 ? 'critical' : 'warning'}>oldest {r.oldest} d</Pill>}</div>
              <div style={{ width: 190 }}><div className="section-label">Credit exposure</div><Meter value={r.outstanding - r.credits} max={limit || r.outstanding} /><div style={{ fontSize: 11, color: (r.outstanding - r.credits) > limit && limit > 0 ? 'var(--danger)' : 'var(--ink-4)' }}>{limit ? `${fmtMoney(r.outstanding - r.credits, cur)} of ${fmtMoney(limit, cur)}` : 'No limit set'}{r.credits ? ` · ${fmtMoney(r.credits, cur)} credit` : ''}</div></div>
              <div style={{ width: 170 }}>{r.promise ? <div style={{ fontSize: 12 }}><Badge status={r.promise.promiseDate && r.promise.promiseDate < today() ? 'Overdue' : 'Pending'}>{r.promise.promiseDate && r.promise.promiseDate < today() ? 'Promise broken' : 'Promise to pay'}</Badge><div style={{ color: 'var(--ink-3)', marginTop: 2 }}>{fmtMoney(r.promise.promiseAmount ?? 0, cur)} by {fmtDate(r.promise.promiseDate)}</div></div> : r.openFollowUps ? <Badge status="Submitted">{r.openFollowUps} follow-up{r.openFollowUps === 1 ? '' : 's'}</Badge> : <span style={{ fontSize: 12, color: 'var(--ink-5)' }}>No promise</span>}</div>
              <span style={{ color: 'var(--ink-5)' }}>{open ? '▾' : '›'}</span>
            </div>
            {open && (
              <div style={{ borderTop: '1px solid var(--hairline)', padding: 16, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><div className="section-title" style={{ marginBottom: 0 }}>Open invoices</div><div style={{ display: 'flex', gap: 6 }}><Button size="sm" variant="secondary" onClick={() => nav.go(`sales/statements/${r.customer.id}`)}>Statement</Button><Button size="sm" variant="secondary" onClick={() => nav.go('sales/receipts/new', { customer: r.customer.id })}>Record receipt</Button></div></div>
                  <table className="data-table dense" style={{ border: '1px solid var(--hairline)', borderRadius: 8 }}><thead><tr><th>Invoice</th><th>Due</th><th className="right">Outstanding</th><th /></tr></thead><tbody>{r.items.map((o) => { const od = daysBetween(o.dueDate, today()); return <tr key={o.id}><td><span className="link identifier" onClick={() => nav.go(`sales/invoices/${o.docId}`)}>{o.docNumber}</span></td><td>{fmtDate(o.dueDate)} {od > 0 && <span className="badge badge-overdue">{od}d</span>}</td><td className="right money">{fmtMoney(o.outstanding, o.currency)}</td><td><Button size="sm" variant="ghost" onClick={() => nav.go('sales/receipts/new', { customer: r.customer.id, invoice: o.docId })}>Receive</Button></td></tr>; })}</tbody></table>
                </div>
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                    <Button size="sm" variant="primary" onClick={() => setDrawer({ row: r, mode: 'promise' })}>Promise to pay</Button>
                    <Button size="sm" variant="secondary" onClick={() => setDrawer({ row: r, mode: 'note' })}>Add note / call</Button>
                    <Button size="sm" variant="secondary" onClick={() => setDrawer({ row: r, mode: 'followup' })}>Schedule follow-up</Button>
                    <Button size="sm" variant="secondary" onClick={() => { sendReminder(r); toast.success(`Reminder emailed to ${r.customer.name}`); }} disabled={r.overdue <= 0} reason="Nothing overdue">Send reminder</Button>
                  </div>
                  <div className="section-title">Activity</div>
                  <Timeline items={activities.filter((a) => a.customerId === r.customer.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8).map((a) => ({ type: a.type === 'Promise to pay' ? 'success' : a.type === 'Reminder' ? 'warning' : 'info', event: a.type, predicate: `${a.subject} · ${a.ownerName}`, time: a.createdAt, note: a.notes, meta: a.status === 'Open' && a.dueAt ? <span>Due {fmtDate(a.dueAt)} · <button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={() => { db.update<CrmActivity>(C.crmActivities, a.id, { status: 'Done', doneAt: new Date().toISOString() }); toast.success('Marked done'); }}>Mark done</button></span> : a.doneAt ? `Done ${fmtDateTime(a.doneAt)}` : undefined }))} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {drawer && <FollowUpDrawer row={drawer.row} mode={drawer.mode} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function FollowUpDrawer({ row, mode, onClose }: { row: CollectionRow; mode: 'promise' | 'note' | 'followup'; onClose: () => void }) {
  const toast = useToast();
  const [type, setType] = useState<CrmActivity['type']>(mode === 'promise' ? 'Promise to pay' : mode === 'followup' ? 'Follow-up' : 'Call');
  const [subject, setSubject] = useState(mode === 'promise' ? `Promise to pay ${fmtMoney(row.overdue || row.outstanding)}` : '');
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState(row.overdue || row.outstanding);
  const [date, setDate] = useState(addDays(today(), 7));
  const [invoiceId, setInvoiceId] = useState('');
  const save = () => {
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    const inv = row.items.find((o) => o.docId === invoiceId);
    logActivity({ type, subject, notes, customerId: row.customer.id, customerName: row.customer.name, invoiceId: inv?.docId, invoiceNumber: inv?.docNumber, promiseAmount: type === 'Promise to pay' ? amount : undefined, promiseDate: type === 'Promise to pay' ? date : undefined, dueAt: type === 'Follow-up' ? date : undefined, status: type === 'Call' || type === 'Note' || type === 'Meeting' ? 'Done' : 'Open', doneAt: type === 'Call' || type === 'Note' || type === 'Meeting' ? new Date().toISOString() : undefined });
    if (type === 'Follow-up') engine.notify({ type: 'due', title: `Follow-up ${row.customer.name}`, body: subject, link: `sales/collections?customer=${row.customer.id}` });
    toast.success(`${type} recorded for ${row.customer.name}`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={`${type} · ${row.customer.name}`} subtitle={`Outstanding ${fmtMoney(row.outstanding)} · overdue ${fmtMoney(row.overdue)}`} width={520} footer={<><Button variant="ghost" onClick={onClose}>Discard</Button><Button variant="primary" onClick={save}>Save {type.toLowerCase()}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <SelectField label="Type" value={type} onChange={(v) => setType(v as any)} options={['Call', 'Meeting', 'Email', 'Note', 'Follow-up', 'Promise to pay']} />
        <TextField label="Subject" required value={subject} onChange={setSubject} autoFocus />
        {type === 'Promise to pay' && <div className="grid-2"><MoneyField label="Promised amount" value={amount} onChange={setAmount} /><DateField label="Promised by" value={date} onChange={setDate} min={today()} /></div>}
        {type === 'Follow-up' && <DateField label="Follow up on" value={date} onChange={setDate} min={today()} />}
        <SelectField label="Related invoice" value={invoiceId} onChange={setInvoiceId} options={row.items.map((o) => ({ value: o.docId, label: `${o.docNumber} · ${fmtMoney(o.outstanding, o.currency)} · due ${fmtDate(o.dueDate)}` }))} placeholder="Whole account" />
        <TextArea label="Notes" value={notes} onChange={setNotes} rows={4} placeholder="What was discussed, who you spoke to…" />
      </div>
    </Drawer>
  );
}
