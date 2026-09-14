// Retainers & advances (FR-SRV-005): record (Dr bank / Cr 2160 + customer credit open item),
// allocate to eligible posted invoices (Dr 2160 / Cr AR + settle open items), remaining balance,
// customer statement.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { DocHeader, OpenItem, Journal } from '../../store';
import { PageHeader, ScopeLine, Card, Button, Badge, Money, DataTable, Drawer, Modal, ConfirmDialog, EntityPicker, MoneyField, DateField, TextField, TextArea, SelectField, useToast, useCustomerOptions, useAccountOptions, EmptyState, KpiTile, SummaryBlock, KV, AccountingTab, ActivityTab, Tabs, Banner, RegisterPage } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import type { Retainer } from './types';
import { useRows, customerOf } from './data';
import { useContractOptions, InvoiceLink, ContractLink, Muted } from './shared';
import { recordRetainer, allocateRetainer, reverseRetainer, eligibleInvoices, newRetainer, settlePendingAllocations } from './billing';

export default function Retainers({ id, customerId }: { id?: string; customerId?: string }) {
  if (id) return <RetainerDetail id={id} />;
  return <RetainerRegister customerId={customerId} />;
}

function RetainerRegister({ customerId }: { customerId?: string }) {
  const all = useRows<Retainer>(C.retainers, (a, b) => b.receivedDate.localeCompare(a.receivedDate));
  const rows = customerId ? all.filter((r) => r.customerId === customerId) : all;
  const s = useSession();
  const toast = useToast();
  const [form, setForm] = useState<Partial<Retainer> | null>(null);
  const can = s.can('projects.retainer.record') || s.can('projects.*') || s.can('sales.receipt.create');
  const open = rows.filter((r) => r.status === 'Open');
  const remaining = open.reduce((a, r) => a + r.remaining * r.rate, 0);
  const cols: Column<Retainer>[] = [
    { key: 'number', label: 'Retainer', sortable: true, render: (r) => <div><span className="identifier link" onClick={(e) => { e.stopPropagation(); nav.go(`projects/retainers/${r.id}`); }}>{r.number}</span><div className="cell-secondary">{r.reference ?? r.notes ?? '—'}</div></div> },
    { key: 'customerName', label: 'Customer', sortable: true, render: (r) => <div>{r.customerName}{r.contractId && <div><Muted><ContractLink id={r.contractId} /></Muted></div>}</div> },
    { key: 'receivedDate', label: 'Received', sortable: true, render: (r) => fmtDate(r.receivedDate) },
    { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: (r) => <Money value={r.amount} currency={r.currency} code={r.currency !== s.currency} />, value: (r) => r.amount },
    { key: 'allocated', label: 'Allocated', align: 'right', render: (r) => <Money value={r.allocated} currency={r.currency} />, value: (r) => r.allocated },
    { key: 'remaining', label: 'Remaining', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.remaining > 0 ? 'var(--good)' : 'var(--ink-3)' }}>{fmtMoney(r.remaining, r.currency)}</span>, value: (r) => r.remaining, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.filter((x) => x.currency === s.currency).reduce((a, x) => a + x.remaining, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <div><Badge status={r.status === 'Fully allocated' ? 'Settled' : r.status === 'Reversed' ? 'Reversed' : 'Open'}>{r.status}</Badge>{r.allocations.some((a) => a.status === 'Pending') && <div><Muted>{r.allocations.filter((a) => a.status === 'Pending').length} pending on draft invoice(s)</Muted></div>}</div> },
    { key: 'journal', label: 'Journal', render: (r) => r.journalNumber ? <span className="identifier link" onClick={(e) => { e.stopPropagation(); nav.go(`accounting/journals/${r.journalId}`); }}>{r.journalNumber}</span> : <Muted>—</Muted> },
  ];
  const actions = (r: Retainer): MenuAction[] => {
    const a: MenuAction[] = [{ label: 'Open', onClick: () => nav.go(`projects/retainers/${r.id}`) }];
    if (r.status === 'Open' && r.remaining > 0) a.push({ label: 'Allocate to invoice', onClick: () => nav.go(`projects/retainers/${r.id}`) });
    a.push({ label: 'Customer statement', onClick: () => nav.go('sales/statements/' + r.customerId) });
    if (r.status !== 'Reversed' && !r.allocations.some((x) => x.status === 'Settled')) a.push({ label: 'Reverse retainer', danger: true, separator: true, onClick: () => nav.go(`projects/retainers/${r.id}`) });
    return a;
  };
  return (
    <>
      <RegisterPage<Retainer>
        title="Retainers & advances"
        subtitle={<>{open.length} open · <span className="money">{fmtMoney(remaining, s.currency)}</span> unallocated liability (GL 2160) · {s.company?.tradeName}</>}
        rows={rows}
        columns={cols}
        entity="retainers"
        searchKeys={['number', 'customerName', 'reference']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open', filter: (r) => r.status === 'Open' }, { id: 'allocated', label: 'Fully allocated', filter: (r) => r.status === 'Fully allocated' }, { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
        filters={[{ key: 'customer', label: 'Customer', type: 'select', options: Array.from(new Map(rows.map((r) => [r.customerId, r.customerName])).entries()).map(([value, label]) => ({ value, label })) }, { key: 'currency', label: 'Currency', type: 'select', options: Array.from(new Set(rows.map((r) => r.currency))).map((v) => ({ value: v, label: v })) }]}
        applyFilter={(r, f) => (!f.customer || r.customerId === f.customer) && (!f.currency || r.currency === f.currency)}
        primaryAction={{ label: 'Record retainer', onClick: () => setForm(newRetainer({ customerId })), disabled: !can, reason: can ? undefined : 'Requires projects.retainer.record' }}
        actions={<Button variant="secondary" onClick={() => { const n = settlePendingAllocations(); toast.success(n ? `${n} pending allocation(s) settled` : 'No pending allocations to settle'); }}>Settle pending allocations</Button>}
        onRowClick={(r) => nav.go(`projects/retainers/${r.id}`)}
        rowActions={actions}
        rowClass={(r) => (r.status === 'Reversed' ? 'muted' : undefined)}
      />
      {form && <RetainerForm value={form} onClose={() => setForm(null)} />}
    </>
  );
}

function RetainerForm({ value, onClose }: { value: Partial<Retainer>; onClose: () => void }) {
  const [f, setF] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  const s = useSession();
  const toast = useToast();
  const customers = useCustomerOptions();
  const banks = useAccountOptions((a) => a.isBank || a.controlType === 'Bank' || a.controlType === 'Cash');
  const contracts = useContractOptions((c) => !f.customerId || c.customerId === f.customerId);
  const set = (p: Partial<Retainer>) => setF((x) => ({ ...x, ...p }));
  const save = () => {
    try {
      const out = recordRetainer({ ...f, customerId: f.customerId ?? '', amount: f.amount ?? 0, receivedDate: f.receivedDate ?? '', bankAccountId: f.bankAccountId ?? '' });
      toast.success(`${out.number} recorded · ${out.journalNumber}`, { label: 'Open', path: `projects/retainers/${out.id}` });
      onClose();
      nav.go(`projects/retainers/${out.id}`);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <Drawer open onClose={onClose} title="Record retainer / advance" subtitle="Posts Dr bank · Cr Retainers received (2160) and creates a customer credit open item" width={620}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save} data-testid="save-retainer">Record retainer</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <EntityPicker label="Customer" required value={f.customerId || undefined} onChange={(cid) => set({ customerId: cid ?? '', currency: customerOf(cid)?.currency ?? s.currency })} options={customers} style={{ gridColumn: '1 / -1' }} recentKey="retainer-customer" />
        <EntityPicker label="Against contract" value={f.contractId} onChange={(cid) => set({ contractId: cid })} options={contracts} placeholder="Optional" />
        <SelectField label="Currency" value={f.currency} onChange={(v) => set({ currency: v })} options={(s.company?.permittedCurrencies ?? ['INR']).map((c) => ({ value: c, label: c }))} />
        <MoneyField label="Amount received" required value={f.amount} onChange={(v) => set({ amount: v })} currency={f.currency ?? s.currency} />
        <DateField label="Received date" required value={f.receivedDate} onChange={(v) => set({ receivedDate: v })} checkPeriod />
        <EntityPicker label="Bank / cash account" required value={f.bankAccountId} onChange={(a) => set({ bankAccountId: a })} options={banks} style={{ gridColumn: '1 / -1' }} />
        <TextField label="Reference (UTR / cheque)" value={f.reference} onChange={(v) => set({ reference: v })} />
        <TextArea label="Notes" value={f.notes} onChange={(v) => set({ notes: v })} rows={2} style={{ gridColumn: '1 / -1' }} />
      </div>
      <div className="banner info" style={{ marginTop: 16 }}>The retainer sits as a customer credit until it is allocated to a posted invoice. Billing runs can apply it automatically to new invoices.</div>
    </Drawer>
  );
}

function RetainerDetail({ id }: { id: string }) {
  const r = useRecord<Retainer>(C.retainers, id);
  const s = useSession();
  const toast = useToast();
  useCollection<DocHeader>(C.salesInvoices);
  useCollection<OpenItem>(C.openItems);
  const [alloc, setAlloc] = useState<{ invoiceId?: string; amount: number } | null>(null);
  const [reverse, setReverse] = useState(false);
  const [tab, setTab] = useState<'allocations' | 'accounting' | 'statement' | 'activity'>('allocations');
  const eligible = useMemo(() => (r ? eligibleInvoices(r) : []), [r]);
  if (!r) return <EmptyState icon="💰" title="Retainer not found" action={<Button variant="primary" onClick={() => nav.go('projects/retainers')}>Back to retainers</Button>} />;
  const can = s.can('projects.retainer.record') || s.can('projects.*') || s.can('sales.receipt.create');
  const oi = db.find<OpenItem>(C.openItems, r.openItemId);
  const allocCols: Column<Retainer['allocations'][number]>[] = [
    { key: 'invoice', label: 'Invoice', render: (a) => <InvoiceLink id={a.invoiceId} number={a.invoiceNumber} /> },
    { key: 'date', label: 'Date', render: (a) => fmtDate(a.date) },
    { key: 'amount', label: 'Amount', align: 'right', render: (a) => <Money value={a.amount} currency={r.currency} />, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((x, a) => x + a.amount, 0), r.currency)}</span> },
    { key: 'status', label: 'Status', render: (a) => <Badge status={a.status === 'Settled' ? 'Settled' : a.status === 'Pending' ? 'Pending' : 'Reversed'}>{a.status === 'Pending' ? 'Pending (draft invoice)' : a.status}</Badge> },
    { key: 'journal', label: 'Journal', render: (a) => a.journalNumber ? <span className="identifier link" onClick={() => nav.go(`accounting/journals/${a.journalId}`)}>{a.journalNumber}</span> : <Muted>on posting</Muted> },
  ];
  const pending = r.allocations.filter((a) => a.status === 'Pending');
  return (
    <div className="page">
      <PageHeader title={r.number} subtitle={<>{r.customerName} · received {fmtDate(r.receivedDate)} · <Badge status={r.status === 'Fully allocated' ? 'Settled' : r.status === 'Reversed' ? 'Reversed' : 'Open'}>{r.status}</Badge>{r.reference ? ` · ${r.reference}` : ''}</>} back={{ label: 'Retainers', path: 'projects/retainers' }}
        actions={<>
          {r.status !== 'Reversed' && <Button variant="secondary" onClick={() => setReverse(true)} disabled={!can || r.allocations.some((a) => a.status === 'Settled')} reason={r.allocations.some((a) => a.status === 'Settled') ? 'Settled allocations exist — reverse those invoices first' : undefined}>Reverse retainer</Button>}
          {r.remaining > 0 && r.status === 'Open' && <Button variant="primary" onClick={() => setAlloc({ amount: 0 })} disabled={!can || !eligible.length} reason={!eligible.length ? 'No posted invoice with an outstanding balance for this customer' : undefined} data-testid="allocate-retainer">Allocate to invoice</Button>}
        </>} />
      {pending.length > 0 && <Banner tone="info" action={<Button variant="link" onClick={() => { const n = settlePendingAllocations(); toast.success(n ? `${n} allocation(s) settled` : 'Invoices are still draft'); }}>Settle now</Button>}>{pending.length} allocation(s) are applied to draft invoices and settle automatically once those invoices are posted.</Banner>}
      {r.status === 'Reversed' && <Banner tone="warning">Reversed: {r.reversalReason}</Banner>}
      <SummaryBlock items={[{ label: 'Amount', value: fmtMoney(r.amount, r.currency) }, { label: 'Allocated', value: fmtMoney(r.allocated, r.currency) }, { label: 'Remaining', value: fmtMoney(r.remaining, r.currency), tone: r.remaining > 0 ? 'good' : undefined }, { label: 'Base equivalent', value: fmtMoney(r.baseAmount, s.currency) }, { label: 'Liability account', value: '2160 Retainers received' }, { label: 'Open item', value: oi ? `${oi.status} · ${fmtMoney(oi.outstanding, oi.currency)}` : '—' }]} />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'allocations', label: 'Allocations' }, { id: 'accounting', label: 'Accounting' }, { id: 'statement', label: 'Statement' }, { id: 'activity', label: 'Activity' }]} />
      {tab === 'allocations' && (
        <>
          <DataTable rows={r.allocations} columns={allocCols} dense emptyTitle="Not allocated yet" emptyDescription="Allocate this retainer to a posted invoice to reduce the customer's outstanding balance." emptyAction={r.remaining > 0 && eligible.length ? <Button variant="primary" onClick={() => setAlloc({ amount: 0 })}>Allocate to invoice</Button> : undefined} />
          {eligible.length > 0 && r.remaining > 0 && (
            <Card title="Eligible invoices">
              <table className="data-table dense"><thead><tr><th>Invoice</th><th>Date</th><th className="right">Total</th><th className="right">Outstanding</th><th /></tr></thead><tbody>
                {eligible.map(({ invoice, openItem }) => (
                  <tr key={invoice.id}><td><InvoiceLink id={invoice.id} /></td><td>{fmtDate(invoice.date)}</td><td className="right money">{fmtMoney(invoice.totals.total, invoice.currency)}</td><td className="right money">{fmtMoney(openItem.outstanding, openItem.currency)}</td><td style={{ textAlign: 'right' }}><Button size="sm" variant="tinted" onClick={() => setAlloc({ invoiceId: invoice.id, amount: Math.min(r.remaining, openItem.outstanding) })}>Allocate</Button></td></tr>
                ))}
              </tbody></table>
            </Card>
          )}
        </>
      )}
      {tab === 'accounting' && <Card><AccountingTab journalId={r.journalId} currency={s.currency} title={`Receipt journal · ${r.journalNumber ?? ''}`} /></Card>}
      {tab === 'statement' && <Statement r={r} />}
      {tab === 'activity' && <Card><ActivityTab objectId={r.id} /></Card>}
      <Modal open={!!alloc} onClose={() => setAlloc(null)} title="Allocate retainer to invoice" description={`${fmtMoney(r.remaining, r.currency)} remaining on ${r.number}. Posts Dr Retainers received · Cr Trade receivables and settles both open items.`} width={560}
        footer={<><Button variant="secondary" onClick={() => setAlloc(null)}>Cancel</Button><Button variant="primary" onClick={() => { if (!alloc?.invoiceId) return; try { allocateRetainer(r.id, alloc.invoiceId, alloc.amount); toast.success(`${fmtMoney(alloc.amount, r.currency)} allocated`); setAlloc(null); } catch (e: any) { toast.error(e.message); } }} disabled={!alloc?.invoiceId || !alloc.amount}>Allocate {alloc ? fmtMoney(alloc.amount, r.currency) : ''}</Button></>}>
        {alloc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SelectField label="Invoice" required value={alloc.invoiceId ?? ''} onChange={(v) => { const e = eligible.find((x) => x.invoice.id === v); setAlloc({ invoiceId: v, amount: e ? Math.min(r.remaining, e.openItem.outstanding) : 0 }); }} options={eligible.map(({ invoice, openItem }) => ({ value: invoice.id, label: `${invoice.number} · ${fmtDate(invoice.date)} · outstanding ${fmtMoney(openItem.outstanding, openItem.currency)}` }))} placeholder="— Choose a posted invoice —" />
            <MoneyField label="Amount" value={alloc.amount} onChange={(v) => setAlloc({ ...alloc, amount: v })} currency={r.currency} help={`Max ${fmtMoney(Math.min(r.remaining, eligible.find((x) => x.invoice.id === alloc.invoiceId)?.openItem.outstanding ?? r.remaining), r.currency)}`} />
          </div>
        )}
      </Modal>
      <ConfirmDialog open={reverse} onClose={() => setReverse(false)} title={`Reverse ${r.number}?`} statement="A reversing journal is posted and the customer credit is closed. Pending allocations on draft invoices are released." consequences={[{ engine: 'Journal', text: `Reversal of ${r.journalNumber} — Dr 2160 · Cr bank`, tone: 'warning' }, { engine: 'Open items', text: 'Customer credit open item is closed' }]} reasonRequired danger confirmLabel="Reverse retainer" cancelLabel="Keep retainer" onConfirm={(reason) => { try { reverseRetainer(r.id, reason); toast.success('Retainer reversed'); } catch (e: any) { toast.error(e.message); } }} />
    </div>
  );
}

function Statement({ r }: { r: Retainer }) {
  const s = useSession();
  const rows: { date: string; label: string; dr: number; cr: number; ref?: string }[] = [
    { date: r.receivedDate, label: `Retainer received · ${r.reference ?? ''}`, dr: 0, cr: r.amount, ref: r.journalNumber },
    ...r.allocations.filter((a) => a.status !== 'Reversed').map((a) => ({ date: a.date, label: `Applied to ${a.invoiceNumber}${a.status === 'Pending' ? ' (pending — invoice still draft)' : ''}`, dr: a.amount, cr: 0, ref: a.journalNumber })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  let bal = 0;
  return (
    <Card title={`Statement · ${r.customerName}`}>
      <table className="data-table dense">
        <thead><tr><th>Date</th><th>Narration</th><th>Reference</th><th className="right">Applied</th><th className="right">Received</th><th className="right">Balance</th></tr></thead>
        <tbody>{rows.map((x, i) => { bal += x.cr - x.dr; return <tr key={i}><td>{fmtDate(x.date)}</td><td>{x.label}</td><td className="identifier">{x.ref ?? '—'}</td><td className="right money">{x.dr ? fmtMoney(x.dr, r.currency) : '—'}</td><td className="right money">{x.cr ? fmtMoney(x.cr, r.currency) : '—'}</td><td className="right money">{fmtMoney(bal, r.currency)}</td></tr>; })}</tbody>
        <tfoot><tr><td colSpan={5}>Remaining credit</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(r.remaining, r.currency)}</td></tr></tfoot>
      </table>
      <Muted>Recorded {fmtDateTime(r.createdAt)} by {r.createdBy} · base equivalent {fmtMoney(r.baseAmount, s.currency)} at {r.rate}</Muted>
    </Card>
  );
}

export type { Journal };
