// AP ageing, due schedule, supplier statement and payment-proposal creation (FR-AP-001, FR-PMT-002).
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { OpenItem, Account, Supplier } from '../../store';
import { Button, Badge, DateField, SelectField, ScopeLine, KpiTile, useToast, EmptyState, Pill, Modal, SummaryBlock, DataTable, Money } from '../../components/ui';
import { fmtDate, fmtMoney, today, daysBetween, toCSV, downloadText } from '../../lib/format';
import * as A from './actions';
import { DocLink, SupplierLink } from './shared';

const BUCKETS: { key: 'current' | 'd030' | 'd3160' | 'd6190' | 'd90p'; label: string; color: string }[] = [
  { key: 'current', label: 'Current', color: 'var(--good)' }, { key: 'd030', label: '1–30 days', color: '#F97316' }, { key: 'd3160', label: '31–60 days', color: '#E07014' }, { key: 'd6190', label: '61–90 days', color: 'var(--danger)' }, { key: 'd90p', label: '>90 days', color: '#9B1B21' },
];

export function ApAgeing({ supplierId }: { supplierId?: string }) {
  const s = useSession();
  const toast = useToast();
  const items = useCollection<OpenItem>(C.openItems);
  const [asAt, setAsAt] = useState(today());
  const rows = useMemo(() => A.apAgeing(asAt), [items, asAt]);
  const sched = useMemo(() => A.dueSchedule(asAt), [items, asAt]);
  const preselect = nav.get().params.select?.split(',').filter(Boolean) ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set(preselect));
  const [proposal, setProposal] = useState(preselect.length > 0);
  const [bankId, setBankId] = useState(s.company?.defaults.bankAccountId ?? A.bankAccounts()[0]?.id);
  const [dueWithin, setDueWithin] = useState('overdue');
  const tot = (k: keyof (typeof rows)[number]) => rows.reduce((x, r) => x + (r[k] as number), 0);
  const allDebit = rows.flatMap((r) => r.items.filter((o) => o.direction === 'Debit'));
  if (supplierId) return <SupplierStatement supplierId={supplierId} asAt={asAt} />;
  const quickSelect = () => { const days = dueWithin === 'overdue' ? 0 : Number(dueWithin); setSelected(new Set(allDebit.filter((o) => daysBetween(asAt, o.dueDate) <= days).map((o) => o.id))); };
  const selectedItems = allDebit.filter((o) => selected.has(o.id));
  const create = () => { try { const b = A.createPaymentProposal({ openItemIds: Array.from(selected), bankAccountId: bankId! }); toast.success(`${b.number} created · ${fmtMoney(b.total)}`); setProposal(false); nav.go(`purchase/batches/${b.id}`); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">AP ageing</h1><div className="page-subtitle"><ScopeLine extra={`as at ${fmtDate(asAt)} · ${fmtMoney(tot('total'))} payable`} /></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}><DateField label="As at" value={asAt} onChange={setAsAt} size="sm" /><Button onClick={() => downloadText(`ap-ageing-${asAt}.csv`, toCSV(rows.map((r) => ({ supplier: r.supplier, gstin: r.gstin, current: r.current, d030: r.d030, d3160: r.d3160, d6190: r.d6190, d90p: r.d90p, credits: r.credits, total: r.total, overdue: r.overdue }))))}>Export</Button><Button variant="primary" onClick={() => setProposal(true)} disabled={!allDebit.length}>Create payment proposal</Button></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 12 }}>
        {BUCKETS.map((b) => <div key={b.key} className="kpi-tile"><div className="section-label">{b.label}</div><div style={{ fontSize: 16, fontWeight: 600, color: b.color, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(tot(b.key))}</div></div>)}
        <div className="kpi-tile"><div className="section-label">Total (net of credits)</div><div style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(tot('total'))}</div><div style={{ fontSize: 11, color: 'var(--ink-3)' }}>credits {fmtMoney(tot('credits'))}</div></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12 }}>
        <KpiTile label="Overdue now" value={fmtMoney(sched.overdue)} deltaTone="bad" delta={sched.overdue ? 'Pay first' : undefined} />
        <KpiTile label="Due next 7 days" value={fmtMoney(sched.next7)} />
        <KpiTile label="Due 8–14 days" value={fmtMoney(sched.next14)} />
        <KpiTile label="Due 15–30 days" value={fmtMoney(sched.next30)} />
        <KpiTile label="Advances held" value={fmtMoney(tot('credits'))} sub="supplier credits / advances" />
      </div>
      {rows.length === 0 ? <EmptyState title="No payables outstanding" description="Post vendor invoices to see ageing." /> : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Supplier</th>{BUCKETS.map((b) => <th key={b.key} className="right">{b.label}</th>)}<th className="right">Credits</th><th className="right">Total</th><th className="right">Overdue</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.supplierId} className="clickable" onClick={() => nav.go(`purchase/ageing/${r.supplierId}`)}>
                  <td><div className="cell-primary"><SupplierLink id={r.supplierId} name={r.supplier} /></div><div className="cell-secondary identifier">{r.gstin ?? '—'}</div></td>
                  {BUCKETS.map((b) => <td key={b.key} className="right"><span className="money" style={{ color: r[b.key] > 0 ? b.color : 'var(--ink-5)' }}>{r[b.key] > 0 ? fmtMoney(r[b.key]) : '—'}</span></td>)}
                  <td className="right"><span className="money" style={{ color: r.credits ? 'var(--good)' : 'var(--ink-5)' }}>{r.credits ? '−' + fmtMoney(r.credits) : '—'}</span></td>
                  <td className="right"><span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.total)}</span></td>
                  <td className="right">{r.overdue > 0 ? <span className="money" style={{ color: 'var(--danger)', fontWeight: 600 }}>{fmtMoney(r.overdue)}</span> : <span style={{ color: 'var(--good)', fontSize: 13 }}>✓ Current</span>}</td>
                  <td className="right"><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); nav.go(`purchase/ageing/${r.supplierId}`); }}>Statement</Button></td>
                </tr>))}
              <tr style={{ background: 'var(--surface-2)', fontWeight: 600 }}><td>Total</td>{BUCKETS.map((b) => <td key={b.key} className="right money">{fmtMoney(tot(b.key))}</td>)}<td className="right money">−{fmtMoney(tot('credits'))}</td><td className="right money">{fmtMoney(tot('total'))}</td><td className="right money" style={{ color: 'var(--danger)' }}>{fmtMoney(tot('overdue'))}</td><td /></tr>
            </tbody>
          </table>
        </div>)}
      <Modal open={proposal} onClose={() => setProposal(false)} title="Create payment proposal" description="Select the invoices to pay. Lines are grouped by supplier into a batch that goes through maker-checker approval." width={860}
        footer={<><Button onClick={() => setProposal(false)}>Cancel</Button><Button variant="primary" disabled={!selected.size || !bankId} onClick={create}>Create batch · {fmtMoney(selectedItems.reduce((x, o) => x + o.outstanding, 0))}</Button></>}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, alignItems: 'end', marginBottom: 12 }}>
          <SelectField label="Pay from" value={bankId} onChange={setBankId} options={A.bankAccounts().filter((b) => (b as Account).isBank).map((b) => ({ value: b.id, label: b.name }))} />
          <SelectField label="Quick select" value={dueWithin} onChange={setDueWithin} options={[{ value: 'overdue', label: 'Overdue only' }, { value: '7', label: 'Due within 7 days' }, { value: '14', label: 'Due within 14 days' }, { value: '30', label: 'Due within 30 days' }]} />
          <Button onClick={quickSelect}>Apply</Button>
        </div>
        <DataTable<OpenItem> rows={allDebit.sort((a, b) => a.dueDate.localeCompare(b.dueDate))} selectable selected={selected} onSelect={setSelected} dense maxHeight={360} columns={[
          { key: 'partyName', label: 'Supplier' }, { key: 'docNumber', label: 'Invoice', render: (o) => <span className="identifier">{o.docNumber}</span> }, { key: 'dueDate', label: 'Due', render: (o) => { const d = daysBetween(o.dueDate, asAt); return <span style={{ fontSize: 12 }}>{fmtDate(o.dueDate)} {d > 0 ? <Pill tone={d > 60 ? 'critical' : 'warning'}>{d} d</Pill> : <Pill tone="good">current</Pill>}</span>; } }, { key: 'outstanding', label: 'Outstanding', align: 'right', render: (o) => <Money value={o.outstanding} currency={o.currency} /> },
        ]} />
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-3)' }}>{selected.size} invoice(s) · {fmtMoney(selectedItems.reduce((x, o) => x + o.outstanding, 0))} · {new Set(selectedItems.map((o) => o.partyId)).size} supplier(s)</div>
      </Modal>
    </div>
  );
}

function SupplierStatement({ supplierId, asAt }: { supplierId: string; asAt: string }) {
  const sup = db.find<Supplier>(C.suppliers, supplierId);
  const items = useCollection<OpenItem>(C.openItems).filter((o) => o.partyId === supplierId && o.partyType === 'Supplier' && o.date <= asAt).sort((a, b) => a.date.localeCompare(b.date));
  const journals = useCollection<any>(C.journals).filter((j) => j.status === 'Posted' && j.lines.some((l: any) => l.partyId === supplierId)).sort((a, b) => a.date.localeCompare(b.date));
  if (!sup) return <EmptyState title="Supplier not found" action={<Button onClick={() => nav.go('purchase/ageing')}>Back to ageing</Button>} />;
  let running = 0;
  const ledger = journals.map((j) => { const dr = j.lines.filter((l: any) => l.partyId === supplierId).reduce((x: number, l: any) => x + l.drBase, 0); const cr = j.lines.filter((l: any) => l.partyId === supplierId).reduce((x: number, l: any) => x + l.crBase, 0); running += cr - dr; return { j, dr, cr, bal: running }; });
  const outstanding = items.filter((o) => o.status !== 'Settled').reduce((x, o) => x + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0);
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.go('purchase/ageing')}>← AP ageing</button><h1 className="page-title">Statement · {sup.name}</h1><div className="page-subtitle"><ScopeLine extra={`GSTIN ${sup.gstin ?? '—'} · ${sup.purchaseTerms} · as at ${fmtDate(asAt)}`} /></div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => nav.go(`masters/suppliers/${supplierId}`)}>Supplier master</Button><Button onClick={() => window.print()}>Print statement</Button><Button variant="primary" onClick={() => nav.go(`purchase/payments/new?supplier=${supplierId}`)}>Record payment</Button></div>
      </div>
      <SummaryBlock items={[{ label: 'Balance payable', value: fmtMoney(outstanding), tone: outstanding > 0 ? 'warn' : 'good' }, { label: 'Open invoices', value: items.filter((o) => o.direction === 'Debit' && o.status !== 'Settled').length }, { label: 'Credits / advances', value: fmtMoney(items.filter((o) => o.direction === 'Credit' && o.status !== 'Settled').reduce((x, o) => x + o.baseOutstanding, 0)) }, { label: 'Overdue', value: fmtMoney(items.filter((o) => o.direction === 'Debit' && o.status !== 'Settled' && o.dueDate < asAt).reduce((x, o) => x + o.baseOutstanding, 0)), tone: 'danger' }]} />
      <div className="card" style={{ overflow: 'hidden' }}><div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontWeight: 600, fontSize: 13 }}>Open items</div><table className="data-table dense"><thead><tr><th>Date</th><th>Document</th><th>Due</th><th className="right">Original</th><th className="right">Settled</th><th className="right">Outstanding</th><th>Status</th></tr></thead><tbody>{items.map((o) => <tr key={o.id}><td>{fmtDate(o.date)}</td><td><DocLink path={o.docType === 'Vendor Invoice' ? `purchase/vendor-invoices/${o.docId}` : o.docType === 'Debit Note' ? `purchase/debit-notes/${o.docId}` : `purchase/payments/${o.docId}`} number={o.docNumber} /> <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{o.docType}{o.direction === 'Credit' ? ' (credit)' : ''}</span></td><td>{o.direction === 'Debit' ? fmtDate(o.dueDate) : '—'}</td><td className="right money">{o.direction === 'Credit' ? '−' : ''}{fmtMoney(o.originalAmount, o.currency)}</td><td className="right money">{fmtMoney(o.originalAmount - o.outstanding, o.currency)}</td><td className="right money" style={{ fontWeight: 600 }}>{o.direction === 'Credit' ? '−' : ''}{fmtMoney(o.outstanding, o.currency)}</td><td><Badge status={o.status} /></td></tr>)}</tbody></table></div>
      <div className="card" style={{ overflow: 'hidden' }}><div style={{ padding: '10px 16px', borderBottom: '1px solid var(--line)', fontWeight: 600, fontSize: 13 }}>Supplier ledger (AP control, party-wise)</div><table className="data-table dense"><thead><tr><th>Date</th><th>Journal</th><th>Narration</th><th className="right">Debit</th><th className="right">Credit</th><th className="right">Balance</th></tr></thead><tbody>{ledger.map(({ j, dr, cr, bal }) => <tr key={j.id}><td>{fmtDate(j.date)}</td><td className="identifier link" onClick={() => nav.go(`accounting/journals/${j.id}`)}>{j.number}</td><td style={{ fontSize: 12 }}>{j.narration}</td><td className="right money">{dr ? fmtMoney(dr) : '—'}</td><td className="right money">{cr ? fmtMoney(cr) : '—'}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(bal)}</td></tr>)}{ledger.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', height: 48 }}>No postings</td></tr>}</tbody></table></div>
    </div>
  );
}
