// Document-page building blocks: line-item grid, totals ladder, tax breakup,
// timelines, approvals/accounting/activity tabs, attachments, print sheet.
import { useMemo, useState, type ReactNode, useEffect, useRef } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { ApprovalRequest, Attachment, AuditEvent, DocHeader, DocLine, DocTotals, Journal, Item } from '../../store';
import { fmtMoney, fmtDateTime, fmtQty, amountInWords, fmtDate, uid } from '../../lib/format';
import { Badge, Button, Money, SnapshotTag, TwoLine, Identifier, EmptyState, Pill } from './primitives';
import { EntityPicker, NumberField, SelectField, useItemOptions, useTaxRateOptions, useWarehouseOptions, TextField } from './fields';
import { Explain, ActionMenu } from './overlays';
import { PlusIcon, XIcon, FileTextIcon, ShieldCheckIcon, LockIcon, ArrowLeftIcon, ChevronDownIcon } from '../Icons';

// ── Line item grid (design §7.8) ──────────────────────────────────────────

export interface LineGridProps {
  lines: DocLine[];
  onChange?: (lines: DocLine[]) => void;
  readOnly?: boolean;
  direction?: 'sale' | 'purchase';
  partyId?: string;
  priceListId?: string;
  currency?: string;
  showWarehouse?: boolean;
  showDiscount?: boolean;
  showTax?: boolean;
  showAccount?: boolean;
  showBatch?: boolean;
  itemFilter?: (i: Item) => boolean;
  /** source-linked: show remaining eligibility helper and cap qty */
  sourceLinked?: boolean;
  totals?: DocTotals;
  onOverride?: (line: DocLine) => void;
  extraColumns?: { key: string; label: string; render: (l: DocLine, i: number) => ReactNode; width?: number }[];
}

export function LineItemGrid({ lines, onChange, readOnly, direction = 'sale', partyId, priceListId, currency = 'INR', showWarehouse, showDiscount = true, showTax = true, showAccount, showBatch, itemFilter, sourceLinked, totals, extraColumns }: LineGridProps) {
  const items = useItemOptions(itemFilter);
  const taxOpts = useTaxRateOptions();
  const whOpts = useWarehouseOptions();
  const scope = useSession();
  const errors = useMemo(() => {
    const m: Record<string, string> = {};
    lines.forEach((l) => {
      if (!l.itemName && !l.itemId) m[l.id] = 'Choose an item';
      else if (l.qty <= 0) m[l.id] = 'Quantity must be greater than zero';
      else if (sourceLinked && l.remainingQty !== undefined && l.qty > l.remainingQty + 0.0005) m[l.id] = `Exceeds remaining eligibility of ${l.remainingQty}`;
    });
    return m;
  }, [lines, sourceLinked]);
  const update = (id: string, patch: Partial<DocLine>) => onChange?.(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLine = () => onChange?.([...lines, engine.newLine({ warehouseId: scope.company?.defaults.warehouseId, uom: 'Nos' })]);
  const remove = (id: string) => onChange?.(lines.filter((l) => l.id !== id));
  const pickItem = (lineId: string, itemId: string | undefined) => {
    if (!itemId) return update(lineId, { itemId: undefined, itemName: '' });
    const l = lines.find((x) => x.id === lineId)!;
    const fresh = engine.lineFromItem(itemId, { qty: l.qty || 1, customerId: direction === 'sale' ? partyId : undefined, supplierId: direction === 'purchase' ? partyId : undefined, priceListId, direction, warehouseId: l.warehouseId ?? scope.company?.defaults.warehouseId });
    update(lineId, { ...fresh, id: lineId });
  };
  const cols = 3 + 1 + 1 + 1 + 1 + (showDiscount ? 1 : 0) + (showTax ? 1 : 0) + (showWarehouse ? 1 : 0) + (showAccount ? 1 : 0) + (showBatch ? 1 : 0) + (extraColumns?.length ?? 0) + (readOnly ? 0 : 1);
  const errCount = Object.keys(errors).length;
  return (
    <div className="card" style={{ overflow: 'visible' }}>
      <div style={{ overflowX: 'auto' }}>
        <table className="data-table dense">
          <thead>
            <tr>
              <th style={{ width: 36 }}>#</th>
              <th style={{ minWidth: 260 }}>Item / service</th>
              <th style={{ width: 90 }}>HSN/SAC</th>
              <th className="right" style={{ width: 100 }}>Qty</th>
              <th style={{ width: 70 }}>UOM</th>
              <th className="right" style={{ width: 120 }}>Rate</th>
              {showDiscount && <th className="right" style={{ width: 80 }}>Disc %</th>}
              {showTax && <th style={{ width: 140 }}>Tax</th>}
              {showWarehouse && <th style={{ width: 150 }}>Warehouse</th>}
              {showBatch && <th style={{ width: 120 }}>Batch / Serial</th>}
              {showAccount && <th style={{ width: 160 }}>Account</th>}
              {extraColumns?.map((c) => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
              <th className="right" style={{ width: 130 }}>Amount</th>
              {!readOnly && <th style={{ width: 40 }} />}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const item = db.find<Item>(C.items, l.itemId);
              const pos = item && item.isStock && l.warehouseId ? engine.stockPosition(l.itemId!, l.warehouseId) : undefined;
              const err = errors[l.id];
              const overridden = l.listRate !== undefined && l.rate !== l.listRate;
              return (
                <tr key={l.id} className={err && !readOnly ? 'error-row' : ''}>
                  <td style={{ color: '#5F6368' }}>{i + 1}</td>
                  <td>
                    {readOnly ? (
                      <TwoLine primary={l.itemName || '—'} secondary={[l.itemCode, l.description].filter(Boolean).join(' · ')} />
                    ) : (
                      <div>
                        <EntityPicker size="grid" value={l.itemId} onChange={(id) => pickItem(l.id, id)} options={items} placeholder="Search item…" recentKey="items" />
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                          <input className="field-input" placeholder="Description (optional)" value={l.description ?? ''} onChange={(e) => update(l.id, { description: e.target.value })} style={{ height: 24, fontSize: 11, border: 'none', background: 'transparent', padding: 0, color: '#5F6368' }} />
                          {pos && <span style={{ fontSize: 11, color: direction === 'sale' && pos.available < l.qty ? '#C0393F' : '#6E6E71', whiteSpace: 'nowrap' }}>{fmtQty(pos.available)} {item?.baseUom} available</span>}
                          {sourceLinked && l.remainingQty !== undefined && <span style={{ fontSize: 11, color: '#6E6E71', whiteSpace: 'nowrap' }}>of {l.sourceQty} · {l.remainingQty} remaining</span>}
                        </div>
                        {err && <div className="field-error" style={{ marginTop: 0 }}>{err}</div>}
                      </div>
                    )}
                  </td>
                  <td><span className="identifier" style={{ fontSize: 12 }}>{l.hsn ?? '—'}</span></td>
                  <td className="right">
                    {readOnly ? <span className="money">{fmtQty(l.qty)}</span> : <NumberField size="grid" value={l.qty} onChange={(v) => update(l.id, { qty: v })} decimals={3} min={0} />}
                  </td>
                  <td>
                    {readOnly || !item ? <span style={{ fontSize: 12 }}>{l.uom}</span> : (
                      <select className="field-input grid" value={l.uom} onChange={(e) => update(l.id, { uom: e.target.value })} style={{ paddingRight: 24, backgroundPosition: 'right 6px center' }}>
                        <option value={item.baseUom}>{item.baseUom}</option>
                        {item.altUoms.map((u) => <option key={u.uom} value={u.uom}>{u.uom}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="right">
                    {readOnly ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                        <span className="money">{fmtMoney(l.rate, currency)}</span>
                        {(l.priceListName || overridden) && (
                          <span style={{ fontSize: 11, color: '#6E6E71', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                            {overridden ? <SnapshotTag label="override" /> : l.priceListName}
                            <Explain title="How this price was resolved" rows={[{ k: 'Source', v: l.priceListName ?? 'Item master' }, { k: 'List rate', v: fmtMoney(l.listRate ?? l.rate, currency) }, { k: 'Applied rate', v: fmtMoney(l.rate, currency) }, { k: 'Discount', v: `${l.discountPct}%` }, ...(l.overrideReason ? [{ k: 'Override reason', v: l.overrideReason }] : [])]} />
                          </span>
                        )}
                      </div>
                    ) : (
                      <div>
                        <NumberField size="grid" value={l.rate} onChange={(v) => update(l.id, { rate: v })} decimals={2} min={0} />
                        {overridden && <input className="field-input" placeholder="Override reason *" value={l.overrideReason ?? ''} onChange={(e) => update(l.id, { overrideReason: e.target.value })} style={{ height: 24, fontSize: 11, marginTop: 2, borderColor: l.overrideReason ? '#EAEAEA' : '#C0393F' }} />}
                        {!overridden && l.priceListName && <div style={{ fontSize: 11, color: '#6E6E71', textAlign: 'right' }}>{l.priceListName}</div>}
                      </div>
                    )}
                  </td>
                  {showDiscount && (
                    <td className="right">
                      {readOnly ? <span className="money">{l.discountPct ? `${l.discountPct}%` : '—'}</span> : <NumberField size="grid" value={l.discountPct} onChange={(v) => update(l.id, { discountPct: v, discountAmt: 0 })} decimals={2} min={0} max={100} />}
                    </td>
                  )}
                  {showTax && (
                    <td>
                      {readOnly ? (
                        <span style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center' }}>
                          {l.taxTreatment && l.taxTreatment !== 'Taxable' ? l.taxTreatment : `GST ${l.taxRate}%`}
                          <Explain title="How this tax was calculated" rows={[{ k: 'Treatment', v: l.taxTreatment ?? 'Taxable' }, { k: 'HSN/SAC', v: l.hsn ?? '—' }, { k: 'Taxable value', v: fmtMoney(l.taxable, currency) }, ...Object.entries(l.taxComponents).map(([k, v]) => ({ k, v: fmtMoney(v, currency) })), ...(l.reverseCharge ? [{ k: 'Reverse charge', v: 'Yes — payable by recipient' }] : [])]} note={`Rule ${db.find<any>(C.taxRates, l.taxRateId)?.ruleVersion ?? '—'}`} />
                        </span>
                      ) : (
                        <select className="field-input grid" value={l.taxRateId ?? ''} onChange={(e) => update(l.id, { taxRateId: e.target.value || undefined })}>
                          <option value="">No tax</option>
                          {taxOpts.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  {showWarehouse && (
                    <td>
                      {readOnly || !item?.isStock ? <span style={{ fontSize: 12 }}>{db.find<any>(C.warehouses, l.warehouseId)?.name ?? '—'}</span> : (
                        <select className="field-input grid" value={l.warehouseId ?? ''} onChange={(e) => update(l.id, { warehouseId: e.target.value || undefined })}>
                          <option value="">— Warehouse —</option>
                          {whOpts.map((w) => <option key={w.id} value={w.id}>{w.primary}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  {showBatch && (
                    <td>
                      {readOnly || item?.tracking === 'None' || !item ? <span style={{ fontSize: 12 }}>{l.batch ?? (l.serials?.length ? `${l.serials.length} serials` : '—')}</span> : item.tracking === 'Batch' ? (
                        <input className="field-input grid" placeholder="Batch no." value={l.batch ?? ''} onChange={(e) => update(l.id, { batch: e.target.value })} />
                      ) : (
                        <input className="field-input grid" placeholder="Serials, comma-separated" value={(l.serials ?? []).join(',')} onChange={(e) => update(l.id, { serials: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
                      )}
                    </td>
                  )}
                  {showAccount && (
                    <td>
                      {readOnly ? <span style={{ fontSize: 12 }}>{db.find<any>(C.accounts, l.accountId)?.name ?? '—'}</span> : (
                        <select className="field-input grid" value={l.accountId ?? ''} onChange={(e) => update(l.id, { accountId: e.target.value || undefined })}>
                          <option value="">— Account —</option>
                          {db.get<any>(C.accounts).filter((a) => a.postingAllowed && a.status === 'Active').map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                        </select>
                      )}
                    </td>
                  )}
                  {extraColumns?.map((c) => <td key={c.key}>{c.render(l, i)}</td>)}
                  <td className="right"><span className="money" style={{ fontWeight: 500 }}>{fmtMoney(l.amount, currency)}</span></td>
                  {!readOnly && (
                    <td>
                      <button type="button" className="btn-icon" onClick={() => remove(l.id)} title="Remove line" style={{ width: 28, height: 28 }}><XIcon size={12} /></button>
                    </td>
                  )}
                </tr>
              );
            })}
            {lines.length === 0 && (
              <tr><td colSpan={cols} style={{ textAlign: 'center', color: '#5F6368', height: 64 }}>No lines yet{!readOnly && ' — add one below'}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #EAEAEA', background: '#F9FBFC', fontSize: 12, color: '#5F6368', borderRadius: '0 0 12px 12px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {!readOnly && <button type="button" className="btn-link" onClick={addLine} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><PlusIcon size={12} /> Add line</button>}
          <span>{lines.length} line{lines.length === 1 ? '' : 's'}</span>
          {errCount > 0 && !readOnly && <span style={{ color: '#C0393F' }}>{errCount} line{errCount === 1 ? '' : 's'} need attention</span>}
        </div>
        {totals && (
          <span>
            Taxable <strong style={{ color: '#0A0A0A' }}>{fmtMoney(totals.taxable, currency)}</strong> · Tax <strong style={{ color: '#0A0A0A' }}>{fmtMoney(totals.tax, currency)}</strong> · <strong style={{ color: '#0A0A0A' }}>{fmtMoney(totals.total, currency)}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

// ── Totals ladder & tax breakup (design §7.9) ─────────────────────────────

export function TotalsLadder({ totals, currency = 'INR', baseCurrency, rate, extraRows, showPaid = true }: { totals: DocTotals; currency?: string; baseCurrency?: string; rate?: number; extraRows?: { label: string; value: number; tone?: 'positive' | 'negative' }[]; showPaid?: boolean }) {
  const rows: { label: string; value: number; tone?: 'positive' | 'negative'; hide?: boolean }[] = [
    { label: 'Subtotal', value: totals.subtotal },
    { label: 'Discount', value: -totals.discount, tone: 'positive', hide: !totals.discount },
    { label: 'Taxable value', value: totals.taxable },
    ...Object.entries(totals.components).map(([k, v]) => ({ label: k, value: v })),
    { label: 'Charges', value: totals.charges, hide: !totals.charges },
    { label: `TDS${totals.tdsSection ? ` (${totals.tdsSection})` : ''}`, value: -totals.tds, tone: 'positive', hide: !totals.tds },
    { label: 'Round-off', value: totals.roundOff, hide: !totals.roundOff },
    ...(extraRows ?? []),
  ];
  return (
    <div className="summary-block">
      {rows.filter((r) => !r.hide).map((r) => (
        <div key={r.label} className="ladder-row">
          <span className="ladder-label">{r.label}</span>
          <span className={`ladder-value ${r.tone ?? ''}`}>{fmtMoney(r.value, currency)}</span>
        </div>
      ))}
      <div style={{ height: 1, background: '#DADCE0', margin: '6px 0' }} />
      <div className="ladder-row">
        <span className="ladder-label" style={{ fontWeight: 600, color: '#0A0A0A' }}>Total</span>
        <span className="ladder-value" style={{ fontWeight: 600, fontSize: 16 }}>{fmtMoney(totals.total, currency)}</span>
      </div>
      {baseCurrency && baseCurrency !== currency && (
        <div className="ladder-row">
          <span className="ladder-label">Base equivalent</span>
          <span className="ladder-value" style={{ color: '#5F6368' }}>≈ {fmtMoney(totals.baseTotal, baseCurrency)} @ {rate}</span>
        </div>
      )}
      {showPaid && (totals.paid > 0 || totals.credited > 0 || totals.writtenOff > 0) && (
        <>
          {totals.paid > 0 && <div className="ladder-row"><span className="ladder-label">Paid</span><span className="ladder-value positive">−{fmtMoney(totals.paid, currency)}</span></div>}
          {totals.credited > 0 && <div className="ladder-row"><span className="ladder-label">Credited</span><span className="ladder-value positive">−{fmtMoney(totals.credited, currency)}</span></div>}
          {totals.writtenOff > 0 && <div className="ladder-row"><span className="ladder-label">Written off</span><span className="ladder-value positive">−{fmtMoney(totals.writtenOff, currency)}</span></div>}
          <div style={{ height: 1, background: '#DADCE0', margin: '6px 0' }} />
          <div className="ladder-row"><span className="ladder-label" style={{ fontWeight: 600, color: '#0A0A0A' }}>Due</span><span className="ladder-value" style={{ fontWeight: 600, fontSize: 16 }}>{fmtMoney(totals.due, currency)}</span></div>
        </>
      )}
    </div>
  );
}

export function TaxBreakup({ totals, currency = 'INR' }: { totals: DocTotals; currency?: string }) {
  if (!totals.breakup.length) return <div style={{ fontSize: 13, color: '#5F6368' }}>No tax applies.</div>;
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="data-table dense">
        <thead><tr><th>Component</th><th className="right">Rate</th><th>HSN/SAC</th><th className="right">Taxable</th><th className="right">Tax</th></tr></thead>
        <tbody>
          {totals.breakup.map((r, i) => (
            <tr key={i}><td>{r.component}</td><td className="right money">{r.rate}%</td><td className="identifier">{r.hsn}</td><td className="right money">{fmtMoney(r.taxable, currency)}</td><td className="right money">{fmtMoney(r.tax, currency)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}>Total</td><td className="right money">{fmtMoney(totals.taxable, currency)}</td><td className="right money">{fmtMoney(totals.tax, currency)}</td></tr></tfoot>
      </table>
    </div>
  );
}

// ── Timeline (design §7.13) ───────────────────────────────────────────────

export interface TimelineItem { type: 'success' | 'info' | 'warning' | 'neutral'; icon?: ReactNode; event: string; predicate?: string; time: string; note?: string; meta?: ReactNode }

export function Timeline({ items }: { items: TimelineItem[] }) {
  if (!items.length) return <div style={{ fontSize: 13, color: '#5F6368' }}>No activity yet.</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {items.map((it, i) => (
        <div key={i} className="timeline-item">
          <div className={`timeline-icon ${it.type}`}><span style={{ fontSize: 12 }}>{it.icon ?? (it.type === 'success' ? '✓' : it.type === 'info' ? '→' : it.type === 'warning' ? '!' : '•')}</span></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: '#0A0A0A' }}>{it.event}</span>
                {it.predicate && <span style={{ color: '#5F6368' }}> {it.predicate}</span>}
              </div>
              <span style={{ fontSize: 12, color: '#6E6E71', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum" 1' }}>{fmtDateTime(it.time)}</span>
            </div>
            {it.note && <div style={{ marginTop: 6, background: '#F9FBFC', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#3C4043' }}>{it.note}</div>}
            {it.meta && <div style={{ marginTop: 4, fontSize: 11, color: '#6E6E71' }}>{it.meta}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Audit timeline for an object (FR-AUD-001). */
export function ActivityTab({ objectId, correlationId, extra }: { objectId: string; correlationId?: string; extra?: TimelineItem[] }) {
  const events = useCollection<AuditEvent>(C.audit);
  const items: TimelineItem[] = useMemo(() => {
    const mine = events.filter((e) => e.objectId === objectId || (correlationId && e.correlationId === correlationId)).sort((a, b) => b.at.localeCompare(a.at));
    return [
      ...mine.map<TimelineItem>((e) => ({ type: e.result === 'Failure' || e.result === 'Denied' ? 'warning' : /post|approv|match|accept|complete/i.test(e.action) ? 'success' : 'info', event: e.action.split('.').pop()?.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) ?? e.action, predicate: `by ${e.actor} · ${e.channel}`, time: e.at, note: e.detail, meta: `Correlation ${e.correlationId}` })),
      ...(extra ?? []),
    ];
  }, [events, objectId, correlationId, extra]);
  return (
    <div>
      <div className="section-title">Activity & audit trail</div>
      <Timeline items={items} />
      {correlationId && (
        <div style={{ marginTop: 16, fontSize: 12, color: '#6E6E71', display: 'flex', gap: 8, alignItems: 'center' }}>
          Correlation ID: <span className="identifier">{correlationId}</span>
          <button type="button" className="btn-link" style={{ fontSize: 12 }} onClick={() => navigator.clipboard?.writeText(correlationId)}>Copy</button>
        </div>
      )}
    </div>
  );
}

/** Approval workflow snapshot + history (FR-WFL-003/008). */
export function ApprovalsTab({ approvalId, docId }: { approvalId?: string; docId?: string }) {
  const all = useCollection<ApprovalRequest>(C.approvals);
  const req = all.find((a) => a.id === approvalId) ?? [...all].reverse().find((a) => a.docId === docId);
  if (!req) return <EmptyState compact title="No approval workflow" description="No workflow applied to this document, or it has not been submitted yet." />;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>Approval workflow</div>
          <div style={{ fontSize: 12, color: '#5F6368' }}>{req.ruleName} · v{req.ruleVersion} · submitted {fmtDateTime(req.submittedAt)} by {req.requesterName}</div>
        </div>
        <Badge status={req.status === 'Pending' ? 'Submitted' : req.status}>{req.status}</Badge>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {req.steps.map((s, i) => (
          <div key={s.order} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, background: s.status === 'Approved' ? '#12784E' : s.status === 'Rejected' ? '#C0393F' : s.status === 'Pending' && req.currentStep === s.order ? '#325CFF' : '#F3F5F5', color: s.status === 'Approved' || s.status === 'Rejected' || (s.status === 'Pending' && req.currentStep === s.order) ? '#fff' : '#5F6368', border: s.status === 'Pending' && req.currentStep !== s.order ? '1.5px solid #DADCE0' : 'none' }}>{s.status === 'Approved' ? '✓' : s.status === 'Rejected' ? '✕' : s.order}</div>
              {i < req.steps.length - 1 && <div style={{ width: 1, flex: 1, minHeight: 24, background: '#EAEAEA', margin: '4px 0' }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 13 }}><span style={{ fontWeight: 600 }}>{s.name}</span> <span style={{ color: '#5F6368' }}>· {s.approverLabel}{s.actedBy ? ` · ${s.actedBy}` : ''}</span></div>
                <Badge status={s.status === 'Pending' ? (req.currentStep === s.order ? 'Submitted' : 'Draft') : s.status}>{s.status === 'Pending' ? (req.currentStep === s.order ? 'Awaiting' : 'Queued') : s.status}</Badge>
              </div>
              {s.actedAt && <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 2 }}>{fmtDateTime(s.actedAt)}</div>}
              {s.dueAt && s.status === 'Pending' && req.currentStep === s.order && <div style={{ fontSize: 12, color: new Date(s.dueAt) < new Date() ? '#C0393F' : '#6E6E71', marginTop: 2 }}>SLA {new Date(s.dueAt) < new Date() ? 'breached' : 'due'} {fmtDateTime(s.dueAt)}</div>}
              {s.comment && <div style={{ marginTop: 6, background: '#F9FBFC', borderRadius: 8, padding: '8px 10px', fontSize: 12 }}>{s.comment}</div>}
              {s.status === 'Skipped' && <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 2 }}>Threshold not met — step skipped</div>}
            </div>
          </div>
        ))}
      </div>
      {req.history.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="section-label" style={{ marginBottom: 8 }}>History</div>
          <Timeline items={req.history.slice().reverse().map((h) => ({ type: /approv/i.test(h.action) ? 'success' : /reject|recall/i.test(h.action) ? 'warning' : 'info', event: h.action, predicate: `by ${h.by}`, time: h.at, note: h.comment }))} />
        </div>
      )}
    </div>
  );
}

/** Posted journal for a document; drafts show the projected journal (design §6.4). */
export function AccountingTab({ journalId, projected, currency = 'INR', title }: { journalId?: string; projected?: engine.PostLine[]; currency?: string; title?: string }) {
  const journals = useCollection<Journal>(C.journals);
  const j = journals.find((x) => x.id === journalId);
  const scope = useSession();
  const lines = j ? j.lines : (projected ?? []).map((l) => { const a = db.find<any>(C.accounts, l.accountId); return { id: uid('p'), accountCode: a?.code ?? '', accountName: a?.name ?? l.accountId, dr: l.dr ?? 0, cr: l.cr ?? 0, drBase: l.dr ?? 0, crBase: l.cr ?? 0, partyName: l.partyName, dimensions: l.dimensions ?? {}, accountId: l.accountId }; });
  const totalDr = lines.reduce((s, l) => s + l.drBase, 0);
  const totalCr = lines.reduce((s, l) => s + l.crBase, 0);
  if (!j && !projected?.length) return <EmptyState compact title="Nothing posted yet" description="Post the document to generate its journal." />;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 2 }}>{title ?? (j ? 'Posted journal' : 'Projected journal')}</div>
          <div style={{ fontSize: 12, color: '#5F6368' }}>{j ? <>{<span className="link identifier" onClick={() => nav.go(`accounting/journals/${j.id}`)}>{j.number}</span>} · {fmtDate(j.date)} · {db.find<any>(C.branches, j.branchId)?.name} · {j.currency}{j.rate !== 1 ? ` @ ${j.rate}` : ''}</> : 'Nothing posted yet — this is what will post'}</div>
        </div>
        {j && <Badge status={j.status} />}
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table dense">
          <thead><tr><th>Account</th><th>Party / dimensions</th>{j && j.currency !== scope.currency && <th className="right">Dr ({j.currency})</th>}{j && j.currency !== scope.currency && <th className="right">Cr ({j.currency})</th>}<th className="right">Dr</th><th className="right">Cr</th></tr></thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id}>
                <td><span className="identifier" style={{ fontWeight: 500 }}>{l.accountCode}</span> · {l.accountName}</td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {l.partyName && <span style={{ fontSize: 12 }}>{l.partyName}</span>}
                    {Object.entries(l.dimensions ?? {}).filter(([k]) => k !== 'Branch').map(([k, v]) => <span key={k} className="dim-chip">{db.find<any>(C.dimensions, v)?.code ?? v}</span>)}
                    {!l.partyName && !Object.keys(l.dimensions ?? {}).filter((k) => k !== 'Branch').length && '—'}
                  </div>
                </td>
                {j && j.currency !== scope.currency && <td className="right money">{l.dr ? fmtMoney(l.dr, j.currency, { code: true }) : '—'}</td>}
                {j && j.currency !== scope.currency && <td className="right money">{l.cr ? fmtMoney(l.cr, j.currency, { code: true }) : '—'}</td>}
                <td className="right money">{l.drBase ? fmtMoney(l.drBase, currency) : '—'}</td>
                <td className="right money">{l.crBase ? fmtMoney(l.crBase, currency) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={j && j.currency !== scope.currency ? 4 : 2}>Total</td><td className="right money">{fmtMoney(totalDr, currency)}</td><td className="right money">{fmtMoney(totalCr, currency)}</td></tr></tfoot>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: Math.abs(totalDr - totalCr) < 0.01 ? '#12784E' : '#C0393F' }}>
        {Math.abs(totalDr - totalCr) < 0.01 ? `✓ Journal is balanced — Dr ${fmtMoney(totalDr, currency)} = Cr ${fmtMoney(totalCr, currency)} · ${currency} base currency` : `⚠ Unbalanced by ${fmtMoney(totalDr - totalCr, currency)}`}
      </div>
    </div>
  );
}

/** Attachments panel (FR-FIL-001/002). */
export function AttachmentsPanel({ objectType, objectId, readOnly }: { objectType: string; objectId: string; readOnly?: boolean }) {
  const all = useCollection<Attachment>(C.attachments);
  const mine = all.filter((a) => a.objectId === objectId);
  const scope = useSession();
  const upload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const blocked = /\.(exe|bat|sh|js|msi|cmd)$/i.test(f.name);
      const a = db.insert<Attachment>(C.attachments, { objectType, objectId, name: f.name, size: f.size, mime: f.type || 'application/octet-stream', scanState: blocked ? 'Blocked' : 'Scanning', uploadedBy: scope.user?.name ?? 'system', at: new Date().toISOString(), fileVersion: 1 });
      engine.audit({ action: 'attachment.uploaded', objectType, objectId, detail: `${f.name} (${Math.round(f.size / 1024)} KB)` });
      if (!blocked) setTimeout(() => db.patchSilent<Attachment>(C.attachments, a.id, { scanState: 'Clean' }), 1200);
    });
  };
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {mine.map((a) => (
          <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #EAEAEA', borderRadius: 8 }}>
            {a.statutory ? <ShieldCheckIcon size={14} color="#12784E" /> : <FileTextIcon size={14} color="#5F6368" />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ fontSize: 11, color: '#6E6E71' }}>{Math.round(a.size / 1024)} KB · {a.uploadedBy} · {fmtDateTime(a.at)}{a.fileVersion > 1 ? ` · v${a.fileVersion}` : ''}</div>
            </div>
            <Badge status={a.scanState} />
            {a.statutory && <span className="snapshot-tag"><ShieldCheckIcon size={10} /> statutory</span>}
            {!readOnly && !a.statutory && <ActionMenu actions={[{ label: 'Replace (new version)', onClick: () => db.update<Attachment>(C.attachments, a.id, { fileVersion: a.fileVersion + 1, at: new Date().toISOString() }) }, { label: 'Remove', danger: true, onClick: () => { db.remove(C.attachments, a.id); engine.audit({ action: 'attachment.removed', objectType, objectId, detail: a.name }); } }]} />}
          </div>
        ))}
        {mine.length === 0 && <div style={{ fontSize: 12, color: '#6E6E71' }}>No attachments</div>}
      </div>
      {!readOnly && (
        <label style={{ display: 'block', marginTop: 8, border: '1px dashed #DADCE0', borderRadius: 8, padding: 12, textAlign: 'center', fontSize: 12, color: '#5F6368', cursor: 'pointer' }}>
          <input type="file" multiple style={{ display: 'none' }} onChange={(e) => upload(e.target.files)} />
          + Attach files (PDF, images, XLSX · max 10 MB · executables blocked)
        </label>
      )}
    </div>
  );
}

// ── Document page shell (design §6.4) ─────────────────────────────────────

export interface DocumentPageProps {
  backLabel: string;
  onBack: () => void;
  number: string;
  badges?: ReactNode;
  amount?: { label: string; value: number; currency: string; base?: number; baseCurrency?: string; rate?: number };
  due?: { label: string; value: number; currency: string; dueDate?: string; overdueDays?: number };
  rail: ReactNode;
  tabs: { id: string; label: string; content: ReactNode }[];
  activeTab?: string;
  onTab?: (id: string) => void;
  footer?: ReactNode;
  banner?: ReactNode;
}

export function DocumentPage({ backLabel, onBack, number, badges, amount, due, rail, tabs, activeTab, onTab, footer, banner }: DocumentPageProps) {
  const [localTab, setLocalTab] = useState(tabs[0]?.id);
  const tab = activeTab ?? localTab;
  const setTab = onTab ?? setLocalTab;
  // phones stack the rail above the tabs; its sections start collapsed so the lines are one tap away
  const [railOpen, setRailOpen] = useState(false);
  // on phones the footer is a sideways-scrolling strip; start it scrolled to the end so the
  // primary action (rightmost, as on desktop) is what the user sees first
  const footerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = footerRef.current; if (el) el.scrollLeft = el.scrollWidth; }, [number]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {banner}
      <div className="doc-layout">
        <aside className={`doc-rail ${railOpen ? '' : 'rail-collapsed'}`}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <button type="button" className="btn-link" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 12, color: '#5F6368' }}><ArrowLeftIcon size={14} /> {backLabel}</button>
              {rail && <button type="button" className="btn-link doc-rail-toggle" style={{ marginBottom: 12, color: '#5F6368', alignItems: 'center', gap: 4 }} onClick={() => setRailOpen((v) => !v)} aria-expanded={railOpen}>{railOpen ? 'Hide details' : 'Details'} <ChevronDownIcon size={12} /></button>}
            </div>
            <div className="identifier" style={{ fontSize: 20, fontWeight: 600, color: '#0A0A0A', lineHeight: '28px' }}>{number}</div>
            {badges && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>{badges}</div>}
            {(amount || due) && (
              <div className="summary-block" style={{ marginTop: 14 }}>
                {amount && (
                  <div className="ladder-row">
                    <span className="ladder-label">{amount.label}</span>
                    <span className="ladder-value large"><Money value={amount.value} currency={amount.currency} base={amount.base} baseCurrency={amount.baseCurrency} rate={amount.rate} /></span>
                  </div>
                )}
                {due && (
                  <>
                    <div style={{ height: 1, background: '#DADCE0', margin: '6px 0' }} />
                    <div className="ladder-row">
                      <span className="ladder-label">{due.label}</span>
                      <span className="ladder-value" style={{ fontSize: 16, fontWeight: 600, color: due.value > 0 && (due.overdueDays ?? 0) > 0 ? '#C0393F' : '#0A0A0A' }}>{fmtMoney(due.value, due.currency)}</span>
                    </div>
                    {due.dueDate && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#5F6368', marginTop: 2 }}>
                        <span>{fmtDate(due.dueDate)}</span>
                        {(due.overdueDays ?? 0) > 0 && due.value > 0 && <Pill tone="critical">Overdue {due.overdueDays} d</Pill>}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
          {rail}
        </aside>
        <div className="doc-pane">
          <div className="tab-bar">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={`doc-tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="doc-body">{tabs.find((t) => t.id === tab)?.content}</div>
          {footer && <div className="doc-footer" ref={footerRef}>{footer}</div>}
        </div>
      </div>
    </div>
  );
}

export function RailSection({ label, children, snapshot }: { label: string; children: ReactNode; snapshot?: boolean }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span className="section-label">{label}</span>
        {snapshot && <SnapshotTag />}
      </div>
      {children}
    </div>
  );
}

export function PartyRail({ snapshot, name, link }: { snapshot?: DocHeader['partySnapshot']; name?: string; link?: string }) {
  const [tab, setTab] = useState<'contact' | 'billing' | 'shipping'>('billing');
  if (!snapshot && !name) return null;
  const addr = tab === 'billing' ? snapshot?.billingAddress : tab === 'shipping' ? snapshot?.shippingAddress : undefined;
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#0A0A0A' }}>{link ? <span className="link" onClick={() => nav.go(link)}>{snapshot?.name ?? name}</span> : snapshot?.name ?? name}</div>
      {snapshot?.gstin && <div className="identifier" style={{ fontSize: 12, color: '#5F6368' }}>{snapshot.gstin}</div>}
      <div style={{ fontSize: 12, color: '#5F6368', marginTop: 2 }}>{[snapshot?.taxTreatment, snapshot?.state, snapshot?.priceListName ? `Price list: ${snapshot.priceListName}` : null].filter(Boolean).join(' · ')}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: 12 }}>
        {(['contact', 'billing', 'shipping'] as const).map((t) => (
          <button key={t} type="button" className="btn-link" style={{ fontSize: 12, color: tab === t ? '#325CFF' : '#5F6368' }} onClick={() => setTab(t)}>{t === 'contact' ? 'Contact' : t === 'billing' ? 'Billing' : 'Shipping'}</button>
        ))}
      </div>
      <div style={{ fontSize: 12, color: '#3C4043', marginTop: 6, lineHeight: 1.5 }}>
        {tab === 'contact' ? (snapshot?.contact ? <>{snapshot.contact.name}<br />{snapshot.contact.email}<br />{snapshot.contact.phone}</> : '—') : addr ? <>{addr.line1}{addr.line2 ? <><br />{addr.line2}</> : null}<br />{addr.city}, {addr.state} {addr.pin}</> : '—'}
      </div>
    </div>
  );
}

// ── Print / PDF sheet (design §7.22) ──────────────────────────────────────

export function PrintSheet({ doc, title, partyLabel = 'Billed to', extraHeader }: { doc: DocHeader; title: string; partyLabel?: string; extraHeader?: ReactNode }) {
  const scope = useSession();
  const co = scope.company;
  const branch = db.find<any>(C.branches, doc.branchId);
  const tpl = db.find<any>(C.templates, doc.templateId) ?? db.findBy<any>(C.templates, (t) => t.docType === doc.docType && t.isDefault);
  const cur = doc.currency;
  return (
    <div className="print-sheet">
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0A0A0A', paddingBottom: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{co?.legalName}</div>
          <div>{co?.address.line1}, {co?.address.city}, {co?.address.state} {co?.address.pin}</div>
          {branch?.gstin && <div>GSTIN {branch.gstin} · PAN {co?.pan}</div>}
          <div>{co?.email} · {co?.phone}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 16, fontWeight: 700, textTransform: 'uppercase' }}>{title}</div>
          <div style={{ fontFeatureSettings: '"tnum" 1' }}>{doc.number}</div>
          <div>Date {fmtDate(doc.date)}{doc.dueDate ? ` · Due ${fmtDate(doc.dueDate)}` : ''}</div>
          {doc.sourceNumber && <div>Ref {doc.sourceNumber}</div>}
          {doc.reference && <div>Your ref {doc.reference}</div>}
          {extraHeader}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>{partyLabel}</div>
          <div>{doc.partySnapshot?.name ?? doc.partyName}</div>
          {doc.partySnapshot?.billingAddress && <div>{doc.partySnapshot.billingAddress.line1}, {doc.partySnapshot.billingAddress.city}, {doc.partySnapshot.billingAddress.state} {doc.partySnapshot.billingAddress.pin}</div>}
          {doc.partySnapshot?.gstin && <div>GSTIN {doc.partySnapshot.gstin}</div>}
        </div>
        <div>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Shipped to</div>
          {doc.partySnapshot?.shippingAddress ? <div>{doc.partySnapshot.shippingAddress.line1}, {doc.partySnapshot.shippingAddress.city}, {doc.partySnapshot.shippingAddress.state} {doc.partySnapshot.shippingAddress.pin}</div> : <div>As billed</div>}
        </div>
        <div>
          <div style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: 10 }}>Place of supply</div>
          <div>{doc.placeOfSupply ?? doc.partySnapshot?.state ?? '—'}{doc.placeOfSupplyCode ? ` (${doc.placeOfSupplyCode})` : ''}</div>
          {doc.paymentTerms && <div style={{ marginTop: 4 }}>Terms: {doc.paymentTerms}</div>}
        </div>
      </div>
      <table>
        <thead><tr><th>#</th><th style={{ textAlign: 'left' }}>Description</th><th>HSN/SAC</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Disc</th><th style={{ textAlign: 'right' }}>Taxable</th><th style={{ textAlign: 'right' }}>Tax</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={l.id}><td>{i + 1}</td><td>{l.itemName}{l.description ? <div style={{ color: '#5F6368' }}>{l.description}</div> : null}</td><td style={{ textAlign: 'center' }}>{l.hsn ?? ''}</td><td style={{ textAlign: 'right' }}>{fmtQty(l.qty, l.uom)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.rate, cur)}</td><td style={{ textAlign: 'right' }}>{l.discountPct ? `${l.discountPct}%` : ''}</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.taxable, cur)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.taxAmt, cur)} ({l.taxRate}%)</td><td style={{ textAlign: 'right' }}>{fmtMoney(l.amount, cur)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, gap: 24 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Amount in words</div>
          <div>{amountInWords(doc.totals.total, cur)}</div>
          {doc.totals.breakup.length > 0 && (
            <table style={{ marginTop: 8, width: 'auto' }}>
              <thead><tr><th>Component</th><th>Rate</th><th>Taxable</th><th>Tax</th></tr></thead>
              <tbody>{doc.totals.breakup.map((b, i) => <tr key={i}><td>{b.component}</td><td>{b.rate}%</td><td style={{ textAlign: 'right' }}>{fmtMoney(b.taxable, cur)}</td><td style={{ textAlign: 'right' }}>{fmtMoney(b.tax, cur)}</td></tr>)}</tbody>
            </table>
          )}
          {doc.statutory?.irn && (
            <div style={{ marginTop: 8, border: '1px solid #DADCE0', padding: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 10 }}>e-INVOICE</div>
              <div style={{ fontSize: 10, wordBreak: 'break-all' }}>IRN {doc.statutory.irn}</div>
              <div style={{ fontSize: 10 }}>Ack {doc.statutory.ackNo} · {fmtDate(doc.statutory.ackDate)}</div>
              <div style={{ width: 90, height: 90, background: 'repeating-conic-gradient(#0A0A0A 0 25%, #fff 0 50%) 50% / 12px 12px', marginTop: 6 }} title="Signed QR" />
            </div>
          )}
          {doc.statutory?.ewbNo && <div style={{ fontSize: 10, marginTop: 4 }}>e-Way bill {doc.statutory.ewbNo} · valid until {fmtDate(doc.statutory.ewbValidUpto)}</div>}
        </div>
        <div style={{ width: 260 }}>
          {[['Subtotal', doc.totals.subtotal], ['Discount', -doc.totals.discount], ['Taxable', doc.totals.taxable], ...Object.entries(doc.totals.components), ['Charges', doc.totals.charges], ['TDS', -doc.totals.tds], ['Round-off', doc.totals.roundOff]].filter(([, v]) => v !== 0).map(([k, v]) => (
            <div key={String(k)} style={{ display: 'flex', justifyContent: 'space-between' }}><span>{k}</span><span>{fmtMoney(v as number, cur)}</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, borderTop: '1px solid #0A0A0A', marginTop: 4, paddingTop: 4, fontSize: 13 }}><span>Total</span><span>{fmtMoney(doc.totals.total, cur)}</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, borderTop: '1px solid #DADCE0', paddingTop: 12, fontSize: 10 }}>
        <div style={{ maxWidth: 400 }}>
          {tpl?.showBankDetails && co?.defaults.bankAccountId && (() => { const b = db.find<any>(C.accounts, co.defaults.bankAccountId)?.bankDetails; return b ? <div>Bank: {b.bankName} · A/c •••• {String(b.accountNumber).slice(-4)} · IFSC {b.ifsc}</div> : null; })()}
          {tpl?.declaration && <div style={{ marginTop: 4 }}>{tpl.declaration}</div>}
          {doc.terms && <div style={{ marginTop: 4 }}>{doc.terms}</div>}
          {doc.notes && <div style={{ marginTop: 4 }}>{doc.notes}</div>}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>For {co?.legalName}</div>
          <div style={{ marginTop: 28 }}>Authorised signatory</div>
        </div>
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#6E6E71', marginTop: 12 }}>{tpl?.footer} · Template {tpl?.code ?? '—'} v{doc.templateVersion ?? tpl?.templateVersion ?? 1}</div>
    </div>
  );
}

export { LockIcon, Identifier, TextField, SelectField };
