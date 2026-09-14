// Debit notes & purchase returns (FR-PUR-040): register, form (from invoice / GRN), detail.
import { useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { ReasonCode } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, SelectField, CheckboxField, TextArea, EntityPicker, useSupplierOptions, useWarehouseOptions, LineItemGrid, TotalsLadder, AccountingTab, ActivityTab, AttachmentsPanel, RailSection, KV, useToast, Banner, EmptyState, PeriodBanner, ActionMenu, Modal } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import type { DebitNote, VendorInvoice, Grn, PurchaseReturn } from './types';
import * as A from './actions';
import { useConfirm, StandardRail, DocLink, whName } from './shared';
import { StockMovesForSource } from './Grns';

export function DebitNotes({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <DebitNoteForm invoiceId={params.invoice} grnId={params.grn} />;
  if (id) return <DebitNoteDetail id={id} />;
  return <DebitNoteRegister />;
}

function DebitNoteRegister() {
  const rows = useCollection<DebitNote>(C.debitNotes);
  const returns = useCollection<PurchaseReturn>(C.purchaseReturns);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <RegisterPage<DebitNote> title="Debit notes & purchase returns" subtitle={`${mine.length} debit notes · ${returns.length} goods returns · ${s.company?.tradeName}`} entity="debit notes" rows={mine} searchKeys={['number', 'partyName', 'invoiceNumber', 'reasonCode']}
      columns={[
        { key: 'number', label: 'Debit note', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link">{r.number}</span>} secondary={r.purchaseReturnNumber ? `Return ${r.purchaseReturnNumber}` : 'Value only'} /> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'partyName', label: 'Supplier', sortable: true, render: (r) => <TwoLine primary={r.partyName} secondary={r.partySnapshot?.gstin} mono /> },
        { key: 'invoiceNumber', label: 'Against', render: (r) => <span style={{ fontSize: 12 }}><DocLink path={r.invoiceId ? `purchase/vendor-invoices/${r.invoiceId}` : undefined} number={r.invoiceNumber} />{r.grnNumber ? <> · <DocLink path={`purchase/grn/${r.grnId}`} number={r.grnNumber} /></> : null}</span> },
        { key: 'reasonCode', label: 'Reason', render: (r) => db.find<ReasonCode>(C.reasonCodes, r.reasonCode)?.name ?? db.findBy<ReasonCode>(C.reasonCodes, (x) => x.code === r.reasonCode)?.name ?? r.reasonCode },
        { key: 'goodsReturn', label: 'Goods', render: (r) => r.goodsReturn ? <Badge status="Returned">Returned</Badge> : <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>No</span> },
        { key: 'total', label: 'Amount', align: 'right', sortable: true, value: (r) => r.totals.total, render: (r) => fmtMoney(r.totals.total, r.currency), total: (rs) => fmtMoney(rs.reduce((x, r) => x + r.totals.total, 0)) },
        { key: 'settled', label: 'Applied', render: (r) => r.status !== 'Posted' ? '—' : r.settledAgainstInvoice ? <Badge status="Settled">Against invoice</Badge> : <Badge status="Open">Credit on account</Badge> },
        { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, { id: 'returns', label: 'Goods returns', filter: (r) => r.goodsReturn }, { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
      primaryAction={{ label: 'New debit note', onClick: () => nav.go('purchase/debit-notes/new') }} onRowClick={(r) => nav.go(`purchase/debit-notes/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`purchase/debit-notes/${r.id}`) }]} />
  );
}

function DebitNoteForm({ invoiceId, grnId }: { invoiceId?: string; grnId?: string }) {
  const s = useSession();
  const toast = useToast();
  const [d, setD] = useState<DebitNote>(() => A.computeDebitNote(A.newDebitNote({ invoiceId, grnId })));
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState(!invoiceId && !grnId);
  const suppliers = useSupplierOptions();
  const whs = useWarehouseOptions();
  const reasons = db.get<ReasonCode>(C.reasonCodes).filter((r) => r.status === 'Active' && (r.category === 'Return' || r.category === 'Credit'));
  const invoices = useCollection<VendorInvoice>(C.vendorInvoices).filter((v) => v.status === 'Posted');
  const grns = useCollection<Grn>(C.grns).filter((g) => g.status === 'Posted');
  const set = (p: Partial<DebitNote>) => setD((x) => A.computeDebitNote({ ...x, ...p }));
  const post = () => { try { const out = A.postDebitNote(d); toast.success(`${out.number} posted`); nav.go(`purchase/debit-notes/${out.id}`); } catch (e: any) { setErr(e.message); } };
  const saveDraft = () => { try { const existing = db.find<DebitNote>(C.debitNotes, d.id); const out = existing ? db.update<DebitNote>(C.debitNotes, d.id, { ...d }) : db.insert<DebitNote>(C.debitNotes, { ...d, number: 'DN/DRAFT' }); toast.success('Draft saved'); nav.go(`purchase/debit-notes/${out.id}`); } catch (e: any) { setErr(e.message); } };
  const projected = (() => { try { return d.partyId && d.lines.length ? [{ accountId: 'acc_2100', dr: d.totals.total, partyName: d.partyName }, { accountId: d.goodsReturn ? 'acc_1200' : 'acc_5010', cr: d.totals.taxable }, ...(d.totals.tax ? [{ accountId: 'acc_1402', cr: d.totals.tax }] : [])] : []; } catch { return []; } })();
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.back('purchase/debit-notes')}>← Debit notes</button><h1 className="page-title">New debit note{d.goodsReturn ? ' with goods return' : ''}</h1><div className="page-subtitle">{d.invoiceNumber ? `Against ${d.invoiceNumber}` : d.grnNumber ? `Against ${d.grnNumber}` : 'Choose a posted invoice or GRN'}</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="ghost" onClick={() => nav.back('purchase/debit-notes')}>Discard</Button><Button onClick={saveDraft}>Save draft</Button><Button variant="primary" tone="good" onClick={post} disabled={!d.partyId}>Post debit note</Button></div>
      </div>
      <PeriodBanner date={d.date} />
      {err && <Banner tone="danger" onDismiss={() => setErr(null)}>{err}</Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <EntityPicker label="Supplier" required value={d.partyId} onChange={(sid) => { const sup = A.supplierOf(sid); set({ partyId: sid, partyName: sup?.name, partySnapshot: sup ? undefined : undefined, invoiceId: undefined, invoiceNumber: undefined, grnId: undefined, grnNumber: undefined, lines: [] }); }} options={suppliers} disabled={!!d.invoiceId || !!d.grnId} />
        <div><label className="field-label">Source document</label><div style={{ display: 'flex', gap: 6, alignItems: 'center', height: 36 }}>{d.invoiceNumber && <Badge status="Posted">{d.invoiceNumber}</Badge>}{d.grnNumber && <Badge status="Posted">{d.grnNumber}</Badge>}<Button size="sm" onClick={() => setPick(true)}>{d.invoiceId || d.grnId ? 'Change' : 'Pick'}</Button></div></div>
        <DateField label="Date" required value={d.date} onChange={(v) => set({ date: v })} checkPeriod />
        <SelectField label="Reason code" required value={d.reasonCode} onChange={(v) => set({ reasonCode: v })} options={reasons.map((r) => ({ value: r.code, label: `${r.code} · ${r.name}` }))} placeholder="— Reason —" />
        <div style={{ gridColumn: 'span 2' }}><CheckboxField checked={d.goodsReturn} onChange={(v) => set({ goodsReturn: v })} label="Goods are physically returned to the supplier (stock out via Purchase Return)" help="Untick for price / short-supply corrections with no stock movement" /></div>
        {d.goodsReturn && <SelectField label="Return from warehouse" required value={d.returnWarehouseId} onChange={(v) => set({ returnWarehouseId: v })} options={whs.map((w) => ({ value: w.id, label: w.primary }))} />}
        <TextArea label="Notes" value={d.notes} onChange={(v) => set({ notes: v })} style={{ gridColumn: 'span 4' }} rows={2} />
      </div>
      <LineItemGrid lines={d.lines} onChange={(lines) => set({ lines })} direction="purchase" partyId={d.partyId} currency={d.currency} showDiscount={false} showTax showWarehouse={d.goodsReturn} totals={d.totals} sourceLinked={!!(d.invoiceId || d.grnId)} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}><div className="section-title">Settlement</div><div style={{ fontSize: 13, color: 'var(--ink-2)' }}>{d.invoiceId ? <>Posted value is applied against <strong>{d.invoiceNumber}</strong> up to its outstanding; any remainder becomes a credit on {d.partyName}'s account, usable on the next payment.</> : <>No invoice linked — the full value becomes a credit open item on {d.partyName ?? 'the supplier'}.</>}</div><div style={{ marginTop: 12 }}><AccountingTab projected={projected} title="Projected journal" currency={s.currency} /></div></div>
        <div className="card" style={{ padding: 16 }}><div className="section-title">Totals</div><TotalsLadder totals={d.totals} currency={d.currency} showPaid={false} /></div>
      </div>
      <Modal open={pick} onClose={() => setPick(false)} title="Debit note against" description="Pick the posted vendor invoice (value / price corrections) or GRN (rejected / returned goods)." width={720} footer={<Button onClick={() => setPick(false)}>Continue without source</Button>}>
        <div className="section-label" style={{ marginBottom: 6 }}>Posted vendor invoices</div>
        <div className="card" style={{ overflow: 'auto', maxHeight: 220, marginBottom: 14 }}><table className="data-table dense"><tbody>{invoices.map((v) => <tr key={v.id} className="clickable" onClick={() => { setD(A.computeDebitNote(A.newDebitNote({ invoiceId: v.id }))); setPick(false); }}><td className="identifier">{v.number}</td><td>{v.partyName}</td><td>{fmtDate(v.date)}</td><td className="right money">{fmtMoney(v.totals.total, v.currency)}</td><td className="right money" style={{ color: 'var(--ink-3)' }}>due {fmtMoney(v.totals.due, v.currency)}</td></tr>)}</tbody></table></div>
        <div className="section-label" style={{ marginBottom: 6 }}>Posted GRNs</div>
        <div className="card" style={{ overflow: 'auto', maxHeight: 220 }}><table className="data-table dense"><tbody>{grns.map((g) => <tr key={g.id} className="clickable" onClick={() => { setD(A.computeDebitNote(A.newDebitNote({ grnId: g.id }))); setPick(false); }}><td className="identifier">{g.number}</td><td>{g.partyName}</td><td>{fmtDate(g.date)}</td><td><Badge status={g.qcStatus} /></td><td className="right money">{g.lines.reduce((x, l) => x + l.rejectedQty, 0)} rejected</td></tr>)}</tbody></table></div>
      </Modal>
    </div>
  );
}

function DebitNoteDetail({ id }: { id: string }) {
  const d = useRecord<DebitNote>(C.debitNotes, id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  if (!d) return <EmptyState title="Debit note not found" action={<Button onClick={() => nav.go('purchase/debit-notes')}>Back</Button>} />;
  return (
    <>
      <DocumentPage backLabel="Debit notes" onBack={() => nav.go('purchase/debit-notes')} number={d.number} badges={<><Badge status={d.status} />{d.goodsReturn && <Badge status="Returned">Goods returned</Badge>}</>} amount={{ label: 'Debit note value', value: d.totals.total, currency: d.currency }}
        rail={<StandardRail doc={d} facts={[{ k: 'Against', v: d.invoiceNumber ? <DocLink path={`purchase/vendor-invoices/${d.invoiceId}`} number={d.invoiceNumber} /> : d.grnNumber ? <DocLink path={`purchase/grn/${d.grnId}`} number={d.grnNumber} /> : '—' }, { k: 'Reason', v: db.findBy<ReasonCode>(C.reasonCodes, (x) => x.code === d.reasonCode)?.name ?? d.reasonCode }, { k: 'Return', v: d.purchaseReturnNumber ?? 'No goods movement' }, ...(d.goodsReturn ? [{ k: 'From warehouse', v: whName(d.returnWarehouseId) }] : []), { k: 'Applied', v: d.status !== 'Posted' ? '—' : d.settledAgainstInvoice ? `Against ${d.invoiceNumber}` : 'Credit on account' }]}><RailSection label="Attachments"><AttachmentsPanel objectType="Debit Note" objectId={d.id} readOnly={d.status !== 'Draft'} /></RailSection></StandardRail>}
        tabs={[
          { id: 'lines', label: 'Lines', content: <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}><LineItemGrid lines={d.lines} readOnly direction="purchase" currency={d.currency} showDiscount={false} showTax showWarehouse={d.goodsReturn} totals={d.totals} /><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}><div className="card" style={{ padding: 16 }}><KV items={[{ k: 'Notes', v: d.notes ?? '—' }]} /></div><div className="card" style={{ padding: 16 }}><TotalsLadder totals={d.totals} currency={d.currency} showPaid={false} /></div></div></div> },
          { id: 'stock', label: 'Stock', content: d.purchaseReturnId ? <StockMovesForSource sourceId={d.purchaseReturnId} /> : <EmptyState compact title="No goods movement" description="This debit note adjusts value only." /> },
          { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={d.journalId} currency={s.currency} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={d.id} correlationId={d.correlationId} /> },
        ]}
        footer={<>
          <div style={{ flex: 1 }} />
          {d.status === 'Draft' && <Button variant="primary" tone="good" onClick={() => { try { const out = A.postDebitNote(d); toast.success(`${out.number} posted`); } catch (e: any) { toast.error(e.message); } }}>Post debit note</Button>}
          {d.status === 'Posted' && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Reverse', danger: true, onClick: () => confirm.open({ title: `Reverse ${d.number}?`, consequences: [{ engine: 'Journal', text: `Reversal of ${d.journalNumber}`, tone: 'warning' }, ...(d.purchaseReturnId ? [{ engine: 'Stock', text: 'Returned goods come back into stock', tone: 'warning' as const }] : []), { engine: 'Open items', text: d.settledAgainstInvoice ? 'Invoice settlement is undone' : 'Supplier credit is closed' }], reasonRequired: true, confirmLabel: 'Reverse debit note', cancelLabel: 'Keep debit note', danger: true, onConfirm: (r) => { A.reverseDebitNote(id, r); toast.success('Reversed'); } }) }]} />}
        </>} />
      {confirm.dialog}
    </>
  );
}
