// RFQs & supplier quotations (FR-PUR-002): register, form, quote capture, comparison, award.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { DocLine, Supplier } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, TextArea, EntityPicker, useSupplierOptions, useItemOptions, NumberField, ActivityTab, RailSection, KV, useToast, Drawer, Banner, EmptyState, Pill, TextField, type Column } from '../../components/ui';
import { fmtDate, fmtMoney, fmtQty, today, addDays } from '../../lib/format';
import type { Rfq, SupplierQuote } from './types';
import * as A from './actions';
import { useConfirm, ItemLink, DocLink, SupplierLink } from './shared';

export function Rfqs({ id }: { id?: string }) {
  if (id === 'new') return <RfqForm />;
  if (id) return <RfqDetail id={id} />;
  return <RfqRegister />;
}

function RfqRegister() {
  const rows = useCollection<Rfq>(C.rfqs);
  const quotes = useCollection<SupplierQuote>(C.supplierQuotes);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  const columns: Column<Rfq>[] = [
    { key: 'number', label: 'RFQ #', sortable: true, render: (r) => <span className="identifier link">{r.number}</span> },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
    { key: 'lines', label: 'Items', render: (r) => <TwoLine primary={r.lines.map((l) => l.itemName).slice(0, 2).join(', ') + (r.lines.length > 2 ? ` +${r.lines.length - 2}` : '')} secondary={`${r.lines.length} line(s)`} /> },
    { key: 'suppliers', label: 'Suppliers', render: (r) => `${r.supplierIds.length} invited · ${quotes.filter((q) => q.rfqId === r.id).length} quoted` },
    { key: 'validUntil', label: 'Quotes due', sortable: true, render: (r) => fmtDate(r.validUntil) },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
    { key: 'po', label: 'Awarded PO', render: (r) => <DocLink path={r.poId ? `purchase/orders/${r.poId}` : undefined} number={r.poNumber} /> },
  ];
  return (
    <RegisterPage<Rfq> title="Requests for quotation" subtitle={`${mine.length} RFQs · ${s.company?.tradeName}`} entity="RFQs" rows={mine} columns={columns} searchKeys={['number', 'notes']}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'sent', label: 'Sent', filter: (r) => r.status === 'Sent' }, { id: 'quoted', label: 'Quoted', filter: (r) => r.status === 'Quoted' }, { id: 'awarded', label: 'Awarded', filter: (r) => r.status === 'Awarded' }]}
      primaryAction={{ label: 'New RFQ', onClick: () => nav.go('purchase/rfqs/new') }} onRowClick={(r) => nav.go(`purchase/rfqs/${r.id}`)}
      rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/rfqs/${r.id}`) }]} />
  );
}

function RfqForm({ existing }: { existing?: Rfq }) {
  const toast = useToast();
  const [doc, setDoc] = useState<Rfq>(() => existing ?? A.newRfq());
  const [err, setErr] = useState<string | null>(null);
  const suppliers = useSupplierOptions();
  const items = useItemOptions();
  const update = (p: Partial<Rfq>) => setDoc((d) => ({ ...d, ...p }));
  const updLine = (lid: string, p: Partial<DocLine>) => update({ lines: doc.lines.map((l) => (l.id === lid ? { ...l, ...p } : l)) });
  const save = (send: boolean) => {
    try { const saved = A.saveRfq(doc); if (send) A.sendRfq(saved.id); toast.success(`${saved.number} ${send ? 'sent' : 'saved'}`); nav.go(`purchase/rfqs/${saved.id}`); } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: '#5F6368' }} onClick={() => nav.back('purchase/rfqs')}>← RFQs</button><h1 className="page-title">{existing ? `Edit ${existing.number}` : 'New request for quotation'}</h1></div>
        <div style={{ display: 'flex', gap: 8 }}><Button onClick={() => save(false)}>Save draft</Button><Button variant="primary" onClick={() => save(true)}>Send RFQ</Button></div>
      </div>
      {err && <Banner tone="danger" onDismiss={() => setErr(null)}>{err}</Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
        <DateField label="Date" value={doc.date} onChange={(v) => update({ date: v })} required />
        <DateField label="Quotes due by" value={doc.validUntil} onChange={(v) => update({ validUntil: v })} required min={doc.date} />
        <TextField label="Linked requisition" value={doc.requisitionNumber ?? ''} onChange={() => {}} disabled />
        <div style={{ gridColumn: 'span 3' }}>
          <label className="field-label">Suppliers to invite <span className="req">*</span></label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 6 }}>
            {suppliers.filter((o) => !o.disabled).map((o) => <label key={o.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '6px 8px', border: `1px solid ${doc.supplierIds.includes(o.id) ? '#325CFF' : '#EAEAEA'}`, borderRadius: 8, background: doc.supplierIds.includes(o.id) ? '#F2F7FF' : '#fff' }}><input type="checkbox" className="checkbox" checked={doc.supplierIds.includes(o.id)} onChange={() => update({ supplierIds: doc.supplierIds.includes(o.id) ? doc.supplierIds.filter((x) => x !== o.id) : [...doc.supplierIds, o.id] })} /><TwoLine primary={o.primary} secondary={o.secondary} /></label>)}
          </div>
        </div>
        <TextArea label="Notes to suppliers" value={doc.notes} onChange={(v) => update({ notes: v })} style={{ gridColumn: 'span 3' }} rows={2} />
      </div>
      <div className="card" style={{ overflow: 'visible' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 36 }}>#</th><th style={{ minWidth: 260 }}>Item / service</th><th className="right" style={{ width: 120 }}>Qty</th><th style={{ width: 80 }}>UOM</th><th className="right" style={{ width: 140 }}>Target price</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {doc.lines.map((l, i) => (
              <tr key={l.id}><td>{i + 1}</td>
                <td><EntityPicker size="grid" value={l.itemId} onChange={(iid) => { if (!iid) return updLine(l.id, { itemId: undefined, itemName: '' }); updLine(l.id, { ...A.purchaseLine(iid, { qty: l.qty || 1 }), id: l.id }); }} options={items} recentKey="items" /></td>
                <td><NumberField size="grid" value={l.qty} onChange={(v) => updLine(l.id, { qty: v })} decimals={3} min={0} /></td><td style={{ fontSize: 12 }}>{l.uom}</td>
                <td><NumberField size="grid" value={l.rate} onChange={(v) => updLine(l.id, { rate: v })} decimals={2} min={0} /></td>
                <td><button type="button" className="btn-icon" onClick={() => update({ lines: doc.lines.filter((x) => x.id !== l.id) })}>✕</button></td></tr>
            ))}
            {doc.lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#5F6368', height: 64 }}>No lines yet</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: '10px 16px', borderTop: '1px solid #EAEAEA', background: '#F9FBFC' }}><button type="button" className="btn-link" onClick={() => update({ lines: [...doc.lines, engine.newLine({ uom: 'Nos' })] })}>+ Add line</button></div>
      </div>
    </div>
  );
}

function QuoteDrawer({ rfq, supplierId, onClose }: { rfq: Rfq; supplierId?: string; onClose: () => void }) {
  const toast = useToast();
  const existing = db.findBy<SupplierQuote>(C.supplierQuotes, (q) => q.rfqId === rfq.id && q.supplierId === supplierId);
  const [sid, setSid] = useState<string | undefined>(supplierId);
  const [form, setForm] = useState({ quoteRef: existing?.quoteRef ?? '', date: existing?.date ?? today(), validUntil: existing?.validUntil ?? addDays(today(), 30), leadTimeDays: existing?.leadTimeDays ?? 7, paymentTerms: existing?.paymentTerms ?? '', notes: existing?.notes ?? '' });
  const [rates, setRates] = useState<Record<string, number>>(() => Object.fromEntries(rfq.lines.map((l) => [l.id, existing?.lines.find((x) => x.lineId === l.id)?.rate ?? 0])));
  const options = useSupplierOptions().filter((o) => rfq.supplierIds.includes(o.id));
  const total = rfq.lines.reduce((s, l) => s + l.qty * (rates[l.id] ?? 0), 0);
  return (
    <Drawer open onClose={onClose} title={`Record quotation · ${rfq.number}`} subtitle="Enter the supplier's quoted rates per line" width={680}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => { try { A.recordQuote(rfq.id, { supplierId: sid!, ...form, rates }); toast.success('Quotation recorded'); onClose(); } catch (e: any) { toast.error(e.message); } }}>Save quotation</Button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <EntityPicker label="Supplier" required value={sid} onChange={setSid} options={options} style={{ gridColumn: 'span 2' }} />
        <TextField label="Supplier quote ref" value={form.quoteRef} onChange={(v) => setForm({ ...form, quoteRef: v })} />
        <DateField label="Quote date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
        <DateField label="Valid until" value={form.validUntil} onChange={(v) => setForm({ ...form, validUntil: v })} />
        <NumberField label="Lead time (days)" value={form.leadTimeDays} onChange={(v) => setForm({ ...form, leadTimeDays: v })} decimals={0} min={0} />
        <TextField label="Payment terms" value={form.paymentTerms} onChange={(v) => setForm({ ...form, paymentTerms: v })} placeholder="e.g. Net 30" style={{ gridColumn: 'span 2' }} />
      </div>
      <div className="card" style={{ marginTop: 14, overflow: 'hidden' }}>
        <table className="data-table dense"><thead><tr><th>Item</th><th className="right">Qty</th><th className="right" style={{ width: 140 }}>Quoted rate</th><th className="right">Amount</th></tr></thead>
          <tbody>{rfq.lines.map((l) => <tr key={l.id}><td>{l.itemName}</td><td className="right money">{fmtQty(l.qty, l.uom)}</td><td><NumberField size="grid" value={rates[l.id]} onChange={(v) => setRates({ ...rates, [l.id]: v })} decimals={2} min={0} /></td><td className="right money">{fmtMoney(l.qty * (rates[l.id] ?? 0))}</td></tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>Quote total</td><td className="right money">{fmtMoney(total)}</td></tr></tfoot></table>
      </div>
      <TextArea label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} style={{ marginTop: 12 }} rows={2} />
    </Drawer>
  );
}

function RfqDetail({ id }: { id: string }) {
  const rfq = useRecord<Rfq>(C.rfqs, id);
  const quotes = useCollection<SupplierQuote>(C.supplierQuotes).filter((q) => q.rfqId === id);
  const toast = useToast();
  const confirm = useConfirm();
  const [quoteFor, setQuoteFor] = useState<string | null | undefined>(undefined);
  const best = useMemo(() => { const m: Record<string, number> = {}; rfq?.lines.forEach((l) => { const rates = quotes.map((q) => q.lines.find((x) => x.lineId === l.id)?.rate ?? Infinity); m[l.id] = Math.min(...rates); }); return m; }, [quotes, rfq]);
  if (!rfq) return <EmptyState title="RFQ not found" action={<Button onClick={() => nav.go('purchase/rfqs')}>Back</Button>} />;
  if (nav.get().params.edit && rfq.status === 'Draft') return <RfqForm existing={rfq} />;
  const lowestTotal = quotes.length ? Math.min(...quotes.map((q) => q.total)) : 0;
  const award = (q: SupplierQuote) => confirm.open({ title: `Award ${rfq.number} to ${q.supplierName}?`, statement: `${fmtMoney(q.total)} · lead time ${q.leadTimeDays} d · valid until ${fmtDate(q.validUntil)}`, consequences: [{ engine: 'Numbering', text: 'A draft purchase order is created with the quoted rates (override reason recorded)' }, { engine: 'Workflow', text: 'Other quotations are marked rejected; RFQ becomes Awarded' }], confirmLabel: 'Award and create PO', onConfirm: () => { const po = A.awardRfq(rfq.id, q.id); toast.success(`Draft ${po.number} created`, { label: 'Open PO', path: `purchase/orders/${po.id}/edit` }); } });
  return (
    <>
      <DocumentPage backLabel="RFQs" onBack={() => nav.go('purchase/rfqs')} number={rfq.number} badges={<><Badge status={rfq.status} />{rfq.poNumber && <Badge status="Converted">PO {rfq.poNumber}</Badge>}</>}
        rail={<><RailSection label="RFQ"><KV items={[{ k: 'Date', v: fmtDate(rfq.date) }, { k: 'Quotes due', v: fmtDate(rfq.validUntil) }, { k: 'Sent', v: rfq.sentAt ? fmtDate(rfq.sentAt) : '—' }, { k: 'Requisition', v: rfq.requisitionNumber ? <DocLink path={`purchase/requisitions/${rfq.requisitionId}`} number={rfq.requisitionNumber} /> : '—' }, { k: 'Awarded PO', v: rfq.poNumber ? <DocLink path={`purchase/orders/${rfq.poId}`} number={rfq.poNumber} /> : '—' }]} /></RailSection>
          <RailSection label={`Suppliers invited (${rfq.supplierIds.length})`}><div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{rfq.supplierIds.map((sid) => { const q = quotes.find((x) => x.supplierId === sid); return <div key={sid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}><SupplierLink id={sid} />{q ? <Badge status={q.status === 'Received' ? 'Quoted' : q.status} /> : <Pill tone="neutral">Awaiting</Pill>}</div>; })}</div></RailSection></>}
        tabs={[
          { id: 'compare', label: 'Comparison', content: quotes.length === 0 ? <EmptyState compact title="No quotations yet" description="Record supplier quotations as they arrive to compare rates, totals and lead times." action={rfq.status !== 'Draft' ? <Button variant="primary" onClick={() => setQuoteFor(null)}>Record quotation</Button> : undefined} /> : (
            <div className="card" style={{ overflow: 'auto' }}>
              <table className="data-table dense">
                <thead><tr><th>Item</th><th className="right">Qty</th>{quotes.map((q) => <th key={q.id} className="right" style={{ minWidth: 150 }}><TwoLine primary={q.supplierName} secondary={`${q.quoteRef ?? '—'} · ${q.leadTimeDays} d`} /></th>)}</tr></thead>
                <tbody>{rfq.lines.map((l) => <tr key={l.id}><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money">{fmtQty(l.qty, l.uom)}</td>{quotes.map((q) => { const ql = q.lines.find((x) => x.lineId === l.id); const isBest = ql && ql.rate === best[l.id]; return <td key={q.id} className="right" style={{ background: isBest ? '#E0F9EC' : undefined }}><span className="money" style={{ fontWeight: isBest ? 600 : 400, color: isBest ? '#12784E' : undefined }}>{ql ? fmtMoney(ql.rate) : '—'}</span>{isBest && <div style={{ fontSize: 10, color: '#12784E' }}>best price</div>}</td>; })}</tr>)}
                  <tr style={{ background: '#F9FBFC', fontWeight: 600 }}><td colSpan={2}>Quote total</td>{quotes.map((q) => <td key={q.id} className="right money" style={{ color: q.total === lowestTotal ? '#12784E' : undefined }}>{fmtMoney(q.total)}</td>)}</tr>
                  <tr><td colSpan={2}>Lead time · validity · terms</td>{quotes.map((q) => <td key={q.id} className="right" style={{ fontSize: 12, color: '#5F6368' }}>{q.leadTimeDays} d · {fmtDate(q.validUntil)} · {q.paymentTerms ?? '—'}</td>)}</tr>
                  <tr><td colSpan={2}>Status</td>{quotes.map((q) => <td key={q.id} className="right"><Badge status={q.status === 'Received' ? 'Quoted' : q.status} /></td>)}</tr>
                  {rfq.status !== 'Awarded' && <tr><td colSpan={2} />{quotes.map((q) => <td key={q.id} className="right"><Button size="sm" variant={q.total === lowestTotal ? 'primary' : 'secondary'} onClick={() => award(q)}>Award</Button> <Button size="sm" variant="ghost" onClick={() => setQuoteFor(q.supplierId)}>Edit</Button></td>)}</tr>}
                </tbody>
              </table>
            </div>) },
          { id: 'lines', label: 'Requested lines', content: <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>#</th><th>Item</th><th className="right">Qty</th><th>UOM</th><th className="right">Target price</th></tr></thead><tbody>{rfq.lines.map((l, i) => <tr key={l.id}><td>{i + 1}</td><td><ItemLink id={l.itemId} name={l.itemName} /></td><td className="right money">{fmtQty(l.qty)}</td><td>{l.uom}</td><td className="right money">{l.rate ? fmtMoney(l.rate) : '—'}</td></tr>)}</tbody></table></div> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={rfq.id} correlationId={rfq.correlationId} /> },
        ]}
        footer={<>
          <div style={{ flex: 1, fontSize: 12, color: '#5F6368' }}>{rfq.notes}</div>
          {rfq.status === 'Draft' && <Button onClick={() => nav.go(`purchase/rfqs/${id}?edit=1`)}>Edit</Button>}
          {rfq.status === 'Draft' && <Button variant="primary" onClick={() => { try { A.sendRfq(id); toast.success('RFQ sent to suppliers'); } catch (e: any) { toast.error(e.message); } }}>Send RFQ</Button>}
          {(rfq.status === 'Sent' || rfq.status === 'Quoted') && <Button variant="primary" onClick={() => setQuoteFor(null)}>Record quotation</Button>}
          {(rfq.status === 'Sent' || rfq.status === 'Quoted' || rfq.status === 'Draft') && <Button variant="ghost" onClick={() => confirm.open({ title: `Cancel ${rfq.number}?`, reasonRequired: true, confirmLabel: 'Cancel RFQ', cancelLabel: 'Keep RFQ', danger: true, onConfirm: (r) => { db.update<Rfq>(C.rfqs, id, { status: 'Cancelled', cancelReason: r }); engine.audit({ action: 'rfq.cancelled', objectType: 'RFQ', objectId: id, objectNumber: rfq.number, detail: r }); } })}>Cancel</Button>}
        </>}
      />
      {confirm.dialog}
      {quoteFor !== undefined && <QuoteDrawer rfq={rfq} supplierId={quoteFor ?? undefined} onClose={() => setQuoteFor(undefined)} />}
    </>
  );
}

export type { Supplier };
