// Quotations (FR-SAL-001..004): register, form, document page with revisions.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../../store';
import type { Salesperson } from '../../../store';
import { RegisterPage, Badge, TwoLine, Identifier, Money, ConfirmDialog, useToast, DocumentPage, RailSection, ActivityTab, EmptyState, Button, PageHeader, Card, DateField, TextField, SelectField, TextArea, LineItemGrid, TotalsLadder, TaxBreakup, Banner, ActionMenu, NumberField, AttachmentsPanel, KV, Timeline } from '../../../components/ui';
import type { Column, MenuAction } from '../../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, today, stateNameOf } from '../../../lib/format';
import type { Quotation } from '../types';
import { useCompanyDocs, useDocDraft, CustomerField, PlaceOfSupplyField, CurrencyRateFields, DimensionsFields, ChargesEditor, FormFooter, ErrorSummary, usePaymentTermOptions, useSalespersonOptions, usePriceListOptions, DocDetailsTab, docHeaderRows, SalesRail, PdfPreviewModal, EmailDialog } from '../common';
import { newQuotation, saveQuotation, sendQuotation, acceptQuotation, declineQuotation, reviseQuotation, convertQuotationToOrder, expireQuotations, validateSalesDoc, recompute } from '../actions';

const TABS = ['Draft', 'Sent', 'Accepted', 'Converted', 'Expired', 'Declined'] as const;

export function QuotationRegister() {
  const rows = useCompanyDocs<Quotation>(C.quotations);
  const s = useSession();
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ kind: 'convert' | 'decline'; q: Quotation } | null>(null);
  useEffect(() => { expireQuotations(); }, []);
  const columns: Column<Quotation>[] = [
    { key: 'number', label: 'Quotation #', sortable: true, render: (r) => <Identifier link onClick={(e) => { e.stopPropagation(); nav.go(`sales/quotations/${r.id}`); }}>{r.number}</Identifier>, value: (r) => r.number },
    { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date), value: (r) => r.date },
    { key: 'validUntil', label: 'Valid until', sortable: true, render: (r) => <span style={{ color: r.validUntil && r.validUntil < today() && (r.status === 'Sent' || r.status === 'Draft') ? 'var(--danger)' : undefined }}>{fmtDate(r.validUntil)}</span>, value: (r) => r.validUntil },
    { key: 'partyName', label: 'Customer', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono />, value: (r) => r.partyName },
    { key: 'items', label: 'Items', render: (r) => `${r.lines.length} item${r.lines.length === 1 ? '' : 's'}`, value: (r) => r.lines.length },
    { key: 'total', label: 'Amount', align: 'right', sortable: true, render: (r) => <Money value={r.totals.total} currency={r.currency} code={r.currency !== s.currency} />, value: (r) => r.totals.total, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.filter((x) => x.currency === s.currency).reduce((a, x) => a + x.totals.total, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} />, value: (r) => r.status },
    { key: 'sp', label: 'Salesperson', render: (r) => db.find<Salesperson>(C.salespersons, r.salespersonId)?.name ?? '—' },
  ];
  const rowActions = (r: Quotation): MenuAction[] => [
    { label: 'Open', onClick: () => nav.go(`sales/quotations/${r.id}`) },
    ...(r.status === 'Draft' ? [{ label: 'Edit', onClick: () => nav.go(`sales/quotations/${r.id}`, { edit: 1 }) }] : []),
    ...(r.status === 'Sent' || r.status === 'Accepted' ? [{ label: 'Convert to sales order', onClick: () => setConfirm({ kind: 'convert', q: r }) }] : []),
    ...(r.status === 'Sent' || r.status === 'Expired' || r.status === 'Declined' ? [{ label: 'Revise', onClick: () => { const c = reviseQuotation(r.id); nav.go(`sales/quotations/${c.id}`, { edit: 1 }); } }] : []),
    ...(r.status === 'Sent' ? [{ label: 'Decline', danger: true, onClick: () => setConfirm({ kind: 'decline', q: r }) }] : []),
  ];
  return (
    <>
      <RegisterPage<Quotation> title="Quotations" subtitle={<>{rows.length} records · {rows.filter((r) => r.status === 'Sent').length} awaiting customer · {s.branch?.name} · FY {s.state.fy}</>} rows={rows} columns={columns} entity="quotations" searchKeys={['number', 'partyName', 'reference']} searchPlaceholder="QT number, customer…"
        tabs={[{ id: 'all', label: 'All' }, ...TABS.map((t) => ({ id: t.toLowerCase(), label: t, filter: (r: Quotation) => r.status === t }))]}
        primaryAction={{ label: 'New quotation', onClick: () => nav.go('sales/quotations/new'), disabled: !s.can('sales.quotation.create') && !s.can('sales.quotation.*'), reason: 'Requires sales.quotation.create' }}
        onRowClick={(r) => nav.go(`sales/quotations/${r.id}`)} rowActions={rowActions} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === 'convert' ? `Convert ${confirm.q.number} to a sales order?` : `Decline ${confirm?.q.number}?`} statement={confirm?.kind === 'convert' ? 'Lines, prices and the customer snapshot are copied; the quotation is marked Converted.' : 'The quotation is closed as Declined; you can still revise it later.'} confirmLabel={confirm?.kind === 'convert' ? 'Convert to order' : 'Decline quotation'} cancelLabel="Keep quotation" danger={confirm?.kind === 'decline'} reasonRequired={confirm?.kind === 'decline'}
        onConfirm={(reason) => { if (!confirm) return; if (confirm.kind === 'convert') { const so = convertQuotationToOrder(confirm.q.id); toast.success(`Sales order ${so.number} created`, { label: 'Open', path: `sales/orders/${so.id}` }); nav.go(`sales/orders/${so.id}`); } else { declineQuotation(confirm.q.id, reason); toast.success('Quotation declined'); } }} />
    </>
  );
}

export function QuotationForm({ id, leadId }: { id?: string; leadId?: string }) {
  const s = useSession();
  const toast = useToast();
  const termOpts = usePaymentTermOptions();
  const spOpts = useSalespersonOptions();
  const plOpts = usePriceListOptions();
  const draft = useDocDraft<Quotation>(() => {
    if (id) { const ex = db.find<Quotation>(C.quotations, id); if (ex) return recompute(ex); }
    const lead = leadId ? db.find<any>(C.leads, leadId) : undefined;
    return newQuotation(lead ? { leadId: lead.id, partyId: lead.customerId, reference: `Lead ${lead.name}` } : {});
  }, { collection: C.quotations, save: (d, v) => saveQuotation(d, { expectedVersion: v }), autosave: true });
  const { doc, set, setLines, setCustomer } = draft;
  useEffect(() => { if (leadId && doc.partyId && !doc.partyName) setCustomer(doc.partyId); }, []);
  const errors = useMemo(() => validateSalesDoc(doc), [doc]);
  useEffect(() => { if (doc.status !== 'Draft') nav.replace(`sales/quotations/${doc.id}`); }, [doc.status, doc.id]);
  const saveDraft = () => { try { const out = draft.save(); if (out) toast.success(`Quotation ${out.number} saved`); } catch (e: any) { toast.error(e.message); } };
  const finish = () => { if (errors.length) { draft.setErrors(errors); toast.error('Fix the highlighted issues'); return; } try { const out = draft.save(); if (out) { toast.success(`Quotation ${out.number} saved`); nav.go(`sales/quotations/${out.id}`); } } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="page">
      <PageHeader back={{ label: 'Quotations', path: 'sales/quotations' }} title={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{id ? doc.number : 'New quotation'} <Badge status={doc.status} />{(doc.revision ?? 1) > 1 && <Badge status="Draft">Revision {doc.revision}</Badge>}</span>} subtitle={<>{doc.number.includes('DRAFT') ? `Will be numbered ${engine.previewNumber('Quotation', { date: doc.date, branchId: doc.branchId })} on save` : doc.number} · {s.branch?.name}</>} />
      {draft.conflict && <Banner tone="danger" action={<Button variant="link" onClick={draft.reload}>Reload</Button>}>Someone else changed this draft — reload to see their changes.</Banner>}
      {draft.errors.length > 0 && <ErrorSummary errors={draft.errors} />}
      <Card title="Customer & validity">
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16, alignItems: 'start' }}>
          <CustomerField doc={doc} onChange={setCustomer} error={draft.errors.find((e) => e.field === 'partyId')?.message} />
          <SelectField label="Billing address" value={doc.partySnapshot?.billingAddress?.line1 ?? ''} onChange={(v) => { const c = db.find<any>(C.customers, doc.partyId); const a = c?.addresses.find((x: any) => x.address.line1 === v); if (a) set({ partySnapshot: { ...doc.partySnapshot!, billingAddress: a.address, state: a.address.state, stateCode: a.address.stateCode }, placeOfSupplyCode: a.address.stateCode, placeOfSupply: a.address.state }); }} options={(db.find<any>(C.customers, doc.partyId)?.addresses ?? []).filter((a: any) => a.purpose !== 'Shipping').map((a: any) => ({ value: a.address.line1, label: `${a.address.line1}, ${a.address.city}` }))} disabled={!doc.partyId} placeholder="Default" />
          <SelectField label="Shipping address" value={doc.partySnapshot?.shippingAddress?.line1 ?? ''} onChange={(v) => { const c = db.find<any>(C.customers, doc.partyId); const a = c?.addresses.find((x: any) => x.address.line1 === v); if (a) set({ partySnapshot: { ...doc.partySnapshot!, shippingAddress: a.address } }); }} options={(db.find<any>(C.customers, doc.partyId)?.addresses ?? []).filter((a: any) => a.purpose !== 'Billing').map((a: any) => ({ value: a.address.line1, label: `${a.address.line1}, ${a.address.city}` }))} disabled={!doc.partyId} placeholder="Same as billing" />
          <DateField label="Quotation date" required value={doc.date} onChange={(v) => set({ date: v })} />
          <DateField label="Valid until" required value={doc.validUntil} onChange={(v) => set({ validUntil: v })} min={doc.date} help={doc.validUntil && doc.validUntil < today() ? 'Already past — the quotation will expire' : undefined} />
          <SelectField label="Payment terms" value={doc.paymentTerms ?? ''} onChange={(v) => set({ paymentTerms: v })} options={termOpts} />
          <SelectField label="Price list" value={doc.priceListId ?? ''} onChange={(v) => set({ priceListId: v || undefined })} options={plOpts} placeholder="Company default" />
          <SelectField label="Salesperson" value={doc.salespersonId ?? ''} onChange={(v) => set({ salespersonId: v || undefined })} options={spOpts} placeholder="—" />
          <PlaceOfSupplyField doc={doc} onChange={(code) => set({ placeOfSupplyCode: code, placeOfSupply: stateNameOf(code) })} />
          <TextField label="Customer reference" value={doc.reference ?? ''} onChange={(v) => set({ reference: v })} />
          <CurrencyRateFields doc={doc} onChange={(p) => set(p as Partial<Quotation>)} />
        </div>
      </Card>
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><div className="section-title" style={{ marginBottom: 0 }}>Lines</div><NumberField size="sm" value={Math.max(0, ...doc.lines.map((l) => l.discountPct || 0)) || 0} onChange={(pct) => set({ lines: doc.lines.map((l) => ({ ...l, discountPct: pct, discountAmt: 0 })) })} suffix="% off" min={0} max={100} style={{ width: 130 }} /></div>
        <LineItemGrid lines={doc.lines} onChange={setLines} partyId={doc.partyId} priceListId={doc.priceListId} currency={doc.currency} totals={doc.totals} />
      </section>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Charges" padding={16}><ChargesEditor charges={doc.charges} onChange={(c) => set({ charges: c })} currency={doc.currency} /></Card>
          <Card title="Terms, notes & dimensions" padding={16}><div className="grid-2" style={{ marginBottom: 12 }}><TextArea label="Terms" value={doc.terms ?? ''} onChange={(v) => set({ terms: v })} rows={3} placeholder="Delivery within 7 days of order · Prices exclusive of GST · Valid till the date above" /><TextArea label="Notes" value={doc.notes ?? ''} onChange={(v) => set({ notes: v })} rows={3} /></div><DimensionsFields value={doc.dimensions} onChange={(v) => set({ dimensions: v })} /></Card>
          {draft.persisted && <Card title="Attachments" padding={16}><AttachmentsPanel objectType="Quotation" objectId={doc.id} /></Card>}
        </div>
        <div style={{ position: 'sticky', top: 16 }}><div className="section-title">Totals</div><TotalsLadder totals={doc.totals} currency={doc.currency} baseCurrency={s.currency} rate={doc.rate} showPaid={false} /><div style={{ marginTop: 16 }}><div className="section-title">Tax breakup</div><TaxBreakup totals={doc.totals} currency={doc.currency} /></div></div>
      </div>
      <FormFooter savedAt={draft.savedAt} dirty={draft.dirty} conflict={draft.conflict} onReload={draft.reload}>
        <Button variant="ghost" onClick={() => nav.go(id ? `sales/quotations/${id}` : 'sales/quotations')}>Discard changes</Button>
        <Button variant="secondary" onClick={saveDraft}>Save draft</Button>
        <Button variant="primary" onClick={finish} data-testid="save-quotation">Save & review</Button>
      </FormFooter>
    </div>
  );
}

export function QuotationDetail({ id }: { id: string }) {
  const q = useRecord<Quotation>(C.quotations, id);
  const all = useCollection<Quotation>(C.quotations);
  const s = useSession();
  const toast = useToast();
  const [pdf, setPdf] = useState(false);
  const [email, setEmail] = useState(false);
  const [confirm, setConfirm] = useState<'convert' | 'decline' | 'accept' | null>(null);
  if (!q) return <EmptyState title="Quotation not found" action={<Button variant="primary" onClick={() => nav.go('sales/quotations')}>Back</Button>} />;
  const revisions = all.filter((x) => x.number.replace(/\/R\d+$/, '') === q.number.replace(/\/R\d+$/, '')).sort((a, b) => (a.revision ?? 1) - (b.revision ?? 1));
  const superseded = !!q.supersededById;
  const expired = q.validUntil && q.validUntil < today() && (q.status === 'Sent' || q.status === 'Draft');
  const run = (fn: () => void, ok: string) => { try { fn(); toast.success(ok); } catch (e: any) { toast.error(e.message); } };
  const overflow: MenuAction[] = [];
  if (q.status !== 'Converted' && !superseded) overflow.push({ label: 'Revise (new revision)', onClick: () => { const c = reviseQuotation(q.id); nav.go(`sales/quotations/${c.id}`, { edit: 1 }); } });
  if (q.status === 'Sent') overflow.push({ label: 'Mark declined', danger: true, onClick: () => setConfirm('decline') });
  const footer = superseded ? <Button variant="secondary" onClick={() => nav.go(`sales/quotations/${q.supersededById}`)}>View latest revision</Button> : (
    <>
      <ActionMenu actions={overflow} trigger={<Button variant="secondary">⋮</Button>} />
      <Button variant="secondary" onClick={() => setPdf(true)}>Download PDF</Button>
      {q.status === 'Draft' && <Button variant="secondary" onClick={() => nav.go(`sales/quotations/${q.id}`, { edit: 1 })}>Edit</Button>}
      {(q.status === 'Draft' || q.status === 'Sent') && <Button variant={q.status === 'Draft' ? 'primary' : 'secondary'} onClick={() => setEmail(true)} data-testid="send-quotation">{q.status === 'Draft' ? 'Send' : 'Resend'}</Button>}
      {q.status === 'Sent' && <Button variant="secondary" onClick={() => setConfirm('accept')} data-testid="accept-quotation">Mark accepted</Button>}
      {(q.status === 'Sent' || q.status === 'Accepted') && <Button variant="primary" onClick={() => setConfirm('convert')} disabled={!s.can('sales.order.create') && !s.can('sales.order.*')} reason="Requires sales.order.create" data-testid="convert-quotation">Convert to sales order</Button>}
      {q.status === 'Converted' && q.convertedToId && <Button variant="primary" onClick={() => nav.go(`sales/orders/${q.convertedToId}`)}>Open {q.convertedToNumber}</Button>}
    </>
  );
  return (
    <>
      <DocumentPage backLabel="Quotations" onBack={() => nav.go('sales/quotations')} number={q.number} badges={<><Badge status={q.status} />{(q.revision ?? 1) > 1 && <Badge status="Draft">Rev {q.revision}</Badge>}{expired && <Badge status="Expired">Past validity</Badge>}</>}
        amount={{ label: 'Total', value: q.totals.total, currency: q.currency, base: q.currency !== s.currency ? q.totals.baseTotal : undefined, baseCurrency: s.currency, rate: q.rate }}
        rail={<SalesRail doc={q}>{q.validUntil && <RailSection label="Validity"><div style={{ fontSize: 12, color: expired ? 'var(--danger)' : 'var(--ink-3)' }}>Until {fmtDate(q.validUntil)}{q.sentAt ? ` · sent ${fmtDate(q.sentAt)} to ${q.sentTo}` : ''}</div></RailSection>}</SalesRail>}
        banner={superseded ? <Banner tone="info" full>Superseded by a newer revision — <span className="link" onClick={() => nav.go(`sales/quotations/${q.supersededById}`)}>open it</span>.</Banner> : q.status === 'Declined' ? <Banner tone="warning" full>Declined: {q.declinedReason}</Banner> : undefined}
        tabs={[
          { id: 'details', label: 'Details', content: <DocDetailsTab doc={q} header={docHeaderRows(q)} /> },
          { id: 'revisions', label: 'Revisions', content: <div><div className="section-title">Revision history</div><Timeline items={revisions.map((r) => ({ type: r.id === q.id ? 'success' : 'neutral', event: `${r.number} · Rev ${r.revision ?? 1}`, predicate: `${r.status} · ${fmtMoney(r.totals.total, r.currency)} · by ${r.createdBy}`, time: r.createdAt, meta: r.id !== q.id ? <span className="link" onClick={() => nav.go(`sales/quotations/${r.id}`)}>Open</span> : 'This revision' }))} /></div> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={q.id} correlationId={q.correlationId} /> },
        ]}
        footer={footer} />
      <PdfPreviewModal open={pdf} onClose={() => setPdf(false)} doc={q} title="Quotation" partyLabel="Quoted to" />
      <EmailDialog open={email} onClose={() => setEmail(false)} doc={q} collection={C.quotations} onSent={(to) => run(() => sendQuotation(q.id, to), `Quotation marked Sent`)} />
      <ConfirmDialog open={confirm === 'convert'} onClose={() => setConfirm(null)} title={`Convert ${q.number} to a sales order?`} statement="Lines, prices and the customer snapshot are copied; the quotation becomes Converted." confirmLabel="Convert to order" cancelLabel="Keep quotation" consequences={[{ engine: 'Numbering', text: `Sales order ${engine.previewNumber('Sales Order')} will be created as a draft` }, { engine: 'Workflow', text: 'Submit the order to run credit and stock checks' }]} onConfirm={() => { const so = convertQuotationToOrder(q.id); toast.success(`Sales order ${so.number} created`); nav.go(`sales/orders/${so.id}`); }} />
      <ConfirmDialog open={confirm === 'accept'} onClose={() => setConfirm(null)} title={`Mark ${q.number} as accepted?`} confirmLabel="Mark accepted" cancelLabel="Not yet" onConfirm={() => run(() => acceptQuotation(q.id), 'Quotation accepted')} />
      <ConfirmDialog open={confirm === 'decline'} onClose={() => setConfirm(null)} title={`Decline ${q.number}?`} confirmLabel="Decline quotation" cancelLabel="Keep quotation" danger reasonRequired onConfirm={(r) => run(() => declineQuotation(q.id, r), 'Quotation declined')} />
    </>
  );
}

export { KV, fmtDateTime };
