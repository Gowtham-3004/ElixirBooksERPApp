// POS terminal (design §6.7): full-bleed — shift bar · catalogue 40% · cart 35% · tender 25%.
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Customer, DocLine, Item } from '../../store';
import { Button, Segmented, NumberField, TextField, SelectField, EntityPicker, useCustomerOptions, useToast, Modal, PrintSheet, Badge, Banner, Drawer, MoneyField } from '../../components/ui';
import { fmtMoney, fmtQty, fmtDateTime, uid, today } from '../../lib/format';
import { SearchIcon, XIcon } from '../../components/Icons';
import type { PosBill, PosHeldCart, PosShift, PosTerminal, Tender, TenderType } from './types';
import { openShift, openShiftFor, catalogue, cartLine, computeCart, completeSale, validateCheckout, holdCart, resumeCart, settings } from './actions';
import { ShiftCloseDialog } from './BackOffice';

export default function Terminal() {
  const s = useSession();
  const shifts = useCollection<PosShift>(C.posShifts);
  const shift = shifts.find((x) => x.status === 'Open' && x.cashierId === s.user?.id) ?? openShiftFor(s.user?.id);
  if (!shift) return <OpenShiftScreen />;
  return <Register shift={shift} />;
}

function OpenShiftScreen() {
  const s = useSession();
  const toast = useToast();
  const terminals = useCollection<PosTerminal>(C.posTerminals).filter((t) => t.status === 'Active' && (!t.companyId || t.companyId === s.state.companyId));
  const shifts = useCollection<PosShift>(C.posShifts);
  const [terminalId, setTerminalId] = useState(terminals.find((t) => t.branchId === s.branch?.id)?.id ?? terminals[0]?.id ?? '');
  const [float, setFloat] = useState(5000);
  const busyTerminal = shifts.find((x) => x.status === 'Open' && x.terminalId === terminalId);
  const open = () => { try { const sh = openShift(terminalId, float); toast.success(`Shift ${sh.number} opened`); } catch (e: any) { toast.error(e.message); } };
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F9FBFC' }}>
      <div style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#325CFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🖥️</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>POS terminal</h2>
        <p style={{ fontSize: 14, color: '#5F6368', textAlign: 'center', margin: 0 }}>Terminal is closed. Open a cashier shift to start billing (FR-POS-001).</p>
        <div className="card" style={{ padding: 24, width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SelectField label="Terminal" value={terminalId} onChange={setTerminalId} options={terminals.map((t) => ({ value: t.id, label: `${t.code} · ${t.name}${shifts.some((x) => x.status === 'Open' && x.terminalId === t.id) ? ' · in use' : ''}` }))} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#5F6368' }}>Cashier</span><span style={{ fontWeight: 500 }}>{s.user?.name}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span style={{ color: '#5F6368' }}>Branch · warehouse</span><span style={{ fontWeight: 500 }}>{db.find<any>(C.branches, terminals.find((t) => t.id === terminalId)?.branchId)?.name ?? '—'} · {db.find<any>(C.warehouses, terminals.find((t) => t.id === terminalId)?.warehouseId)?.name ?? '—'}</span></div>
          <MoneyField label="Opening float" value={float} onChange={setFloat} />
          {busyTerminal && <Banner tone="warning">{busyTerminal.cashierName} has an open shift on this terminal since {fmtDateTime(busyTerminal.openedAt)}.</Banner>}
          <Button variant="primary" onClick={open} disabled={!terminalId || !!busyTerminal || !s.can('pos.shift.open') && !s.can('pos.*') && !s.can('pos.view')} style={{ height: 48, justifyContent: 'center', fontSize: 15 }} data-testid="open-shift">Open shift</Button>
          <Button variant="ghost" onClick={() => nav.go('pos/shifts')}>Back office · shifts, bills, returns</Button>
        </div>
      </div>
    </div>
  );
}

function Register({ shift }: { shift: PosShift }) {
  const s = useSession();
  const toast = useToast();
  const cfg = settings();
  const custOpts = useCustomerOptions();
  useCollection(C.items); useCollection(C.priceListEntries); useCollection(C.stockMovements);
  const held = useCollection<PosHeldCart>(C.posHeldCarts).filter((h) => h.shiftId === shift.id);
  const terminal = db.find<PosTerminal>(C.posTerminals, shift.terminalId);
  const [cartId, setCartId] = useState(() => uid('cart'));
  const [lines, setLines] = useState<DocLine[]>([]);
  const [customerId, setCustomerId] = useState<string | undefined>(cfg.posDefaultCustomerId);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('All');
  const [tender, setTender] = useState<TenderType | 'Mixed'>('Cash');
  const [tendered, setTendered] = useState(0);
  const [cardLast4, setCardLast4] = useState('');
  const [ref, setRef] = useState('');
  const [mixed, setMixed] = useState<Tender[]>([{ type: 'Cash', amount: 0 }, { type: 'Card', amount: 0 }]);
  const [receipt, setReceipt] = useState<PosBill | null>(null);
  const [print, setPrint] = useState(false);
  const [showHeld, setShowHeld] = useState(false);
  const [closing, setClosing] = useState(false);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const busy = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const on = () => setOnline(true), off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);

  const items = useMemo(() => catalogue(), [cfg.posPriceListId]);
  const cats = useMemo(() => ['All', ...Array.from(new Set(items.map((i) => i.group ?? 'Other')))], [items]);
  const visible = items.filter((i) => (cat === 'All' || (i.group ?? 'Other') === cat) && (!q || `${i.name} ${i.code} ${i.barcode ?? ''}`.toLowerCase().includes(q.toLowerCase())));
  const { lines: computed, totals } = useMemo(() => computeCart(lines, customerId), [lines, customerId]);
  const cust = db.find<Customer>(C.customers, customerId);
  const isWalkin = !customerId || customerId === cfg.posDefaultCustomerId;
  const tenders: Tender[] = useMemo(() => {
    if (tender === 'Mixed') return mixed.filter((t) => t.amount > 0);
    if (tender === 'Cash') return [{ type: 'Cash', amount: tendered || totals.total }];
    if (tender === 'Card') return [{ type: 'Card', amount: totals.total, last4: cardLast4, reference: ref }];
    if (tender === 'UPI') return [{ type: 'UPI', amount: totals.total, reference: ref }];
    return [{ type: 'Credit', amount: totals.total }];
  }, [tender, tendered, totals.total, cardLast4, ref, mixed]);
  const tenderSum = tenders.reduce((a, t) => a + t.amount, 0);
  const change = Math.max(0, tenderSum - totals.total);
  const errors = useMemo(() => (lines.length ? validateCheckout({ cartId, shiftId: shift.id, lines, customerId, tenders, tendered: tenderSum }) : []), [lines, customerId, tenders, tenderSum, cartId, shift.id]);

  const add = (it: Item) => { setLines((prev) => { const ex = prev.find((l) => l.itemId === it.id); if (ex) return prev.map((l) => (l.id === ex.id ? { ...l, qty: l.qty + 1 } : l)); return [...prev, cartLine(it.id, 1, customerId)]; }); };
  const setQty = (id: string, qty: number) => setLines((prev) => (qty <= 0 ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, qty } : l))));
  const setDisc = (id: string, pct: number) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, discountPct: Math.min(100, Math.max(0, pct)), discountAmt: 0 } : l)));
  const onSearchKey = (e: React.KeyboardEvent) => { if (e.key !== 'Enter') return; const exact = items.find((i) => i.barcode === q.trim() || i.code.toLowerCase() === q.trim().toLowerCase()); if (exact) { add(exact); setQ(''); } else if (visible.length === 1) { add(visible[0]); setQ(''); } };
  const newBill = () => { setCartId(uid('cart')); setLines([]); setCustomerId(cfg.posDefaultCustomerId); setTender('Cash'); setTendered(0); setCardLast4(''); setRef(''); setMixed([{ type: 'Cash', amount: 0 }, { type: 'Card', amount: 0 }]); setReceipt(null); setTimeout(() => searchRef.current?.focus(), 50); };
  const complete = () => {
    if (busy.current) return;
    if (errors.length) { toast.error(errors[0]); return; }
    busy.current = true;
    try { const bill = completeSale({ cartId, shiftId: shift.id, lines, customerId, tenders, tendered: tenderSum }); setReceipt(bill); }
    catch (e: any) { toast.error(e.message); }
    finally { busy.current = false; }
  };
  const hold = () => { if (!lines.length) return; holdCart(shift.id, cartId, lines, customerId, cust && !isWalkin ? cust.name : `Hold ${held.length + 1}`); toast.info('Cart held'); newBill(); };
  const resume = (h: PosHeldCart) => { if (lines.length) { holdCart(shift.id, cartId, lines, customerId, cust && !isWalkin ? cust.name : `Hold ${held.length + 1}`); } const r = resumeCart(h.id); if (r) { setCartId(r.cartId); setLines(r.lines); setCustomerId(r.customerId ?? cfg.posDefaultCustomerId); } setShowHeld(false); };

  if (receipt) return <ReceiptScreen bill={receipt} onNew={newBill} onPrint={() => setPrint(true)} print={print} onClosePrint={() => setPrint(false)} />;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#F7F7F7' }}>
      <div style={{ height: 48, background: '#0A0A0A', color: '#fff', display: 'flex', alignItems: 'center', gap: 16, padding: '0 16px', fontSize: 13, flexShrink: 0 }}>
        <span style={{ fontWeight: 600 }}>Terminal {terminal?.code ?? ''}</span>
        <span style={{ color: 'rgba(255,255,255,.7)' }}>Cashier {shift.cashierName}</span>
        <span style={{ color: 'rgba(255,255,255,.7)' }}>Shift opened {fmtDateTime(shift.openedAt).split(',')[0]}</span>
        <span style={{ color: 'rgba(255,255,255,.7)' }}>Float {fmtMoney(shift.openingFloat)}</span>
        <span style={{ color: 'rgba(255,255,255,.7)' }}>{shift.bills ?? 0} bills · {fmtMoney(shift.sales ?? 0)}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: online ? '#22C55E' : '#F97316' }} />{online ? 'Online' : 'Offline'}</span>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowHeld(true)} style={btnDark} data-testid="pos-held">Hold {held.length}</button>
        <button type="button" onClick={() => nav.go('pos/bills')} style={btnDark}>Back office</button>
        <button type="button" onClick={() => setClosing(true)} style={{ ...btnDark, background: '#C0393F' }} data-testid="pos-close-shift">Close shift</button>
      </div>
      {!online && <Banner tone="danger" full>Connection lost — sales are paused until reconnected.</Banner>}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* catalogue 40% */}
        <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: '1px solid #EAEAEA', background: '#FFF' }}>
          <div style={{ padding: 12, borderBottom: '1px solid #EAEAEA' }}>
            <div className="search-input" style={{ width: '100%', height: 48 }}><SearchIcon size={16} /><input ref={searchRef} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} placeholder="Scan barcode or search item / SKU… (Enter adds an exact match)" style={{ fontSize: 15 }} data-testid="pos-search" /></div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>{cats.map((c) => <button key={c} type="button" className={`chip ${cat === c ? 'selected' : ''}`} style={{ height: 36, flexShrink: 0 }} onClick={() => setCat(c)}>{c}</button>)}</div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {visible.map((it) => { const pos = it.isStock ? engine.stockPosition(it.id, terminal?.warehouseId ?? cfg.posDefaultWarehouseId ?? '') : undefined; return (
                <button key={it.id} type="button" onClick={() => add(it)} className="card" style={{ padding: 12, textAlign: 'left', cursor: 'pointer', minHeight: 96, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'inherit', border: '1px solid #EAEAEA' }} data-testid={`pos-tile-${it.code}`}>
                  <div style={{ fontSize: 10, color: '#5F6368', textTransform: 'uppercase', letterSpacing: '.04em' }}>{it.group ?? 'Other'}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{it.name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 'auto' }}><span className="money" style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(it.retailPrice)}</span><span style={{ fontSize: 10, color: pos && pos.onHand <= 0 ? '#C0393F' : '#6E6E71' }}>{pos ? `${fmtQty(pos.onHand)} ${it.baseUom}` : it.baseUom}</span></div>
                </button>); })}
              {visible.length === 0 && <div style={{ gridColumn: '1 / -1', color: '#5F6368', textAlign: 'center', padding: 32 }}>No items match</div>}
            </div>
          </div>
        </div>
        {/* cart 35% */}
        <div style={{ flex: '0 0 35%', display: 'flex', flexDirection: 'column', minWidth: 0, background: '#FFF', borderRight: '1px solid #EAEAEA' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #EAEAEA', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{lines.length} item{lines.length === 1 ? '' : 's'}</span>
            <div style={{ flex: 1 }}><EntityPicker size="sm" value={customerId} onChange={(id) => setCustomerId(id ?? cfg.posDefaultCustomerId)} options={custOpts} placeholder="Customer: Walk-in" allowClear={!isWalkin} recentKey="pos-customers" /></div>
            <Button size="sm" variant="ghost" onClick={hold} disabled={!lines.length} data-testid="pos-hold">Hold</Button>
            <Button size="sm" variant="ghost" onClick={() => setLines([])} disabled={!lines.length}>Clear</Button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {computed.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: '#B0B5BF' }}>Scan or tap items to add them</div>}
            {computed.map((l) => (
              <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr 112px 64px 90px 28px', gap: 8, alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #F5F5F5', fontSize: 13 }} data-testid="pos-cart-line">
                <div style={{ minWidth: 0 }}><div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.itemName}</div><div style={{ fontSize: 11, color: '#5F6368' }}>{fmtMoney(l.rate)} × {fmtQty(l.qty)} · GST {l.taxRate}% incl.</div></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><button type="button" style={qtyBtn} onClick={() => setQty(l.id, l.qty - 1)}>−</button><input value={l.qty} onChange={(e) => setQty(l.id, Math.max(0, Number(e.target.value) || 0))} style={{ width: 40, height: 32, textAlign: 'center', border: '1px solid #EAEAEA', borderRadius: 6, fontFamily: 'inherit', fontFeatureSettings: '"tnum" 1' }} /><button type="button" style={qtyBtn} onClick={() => setQty(l.id, l.qty + 1)}>+</button></div>
                <NumberField size="grid" value={l.discountPct} onChange={(v) => setDisc(l.id, v)} decimals={0} min={0} max={100} suffix="%" />
                <span className="money" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtMoney(l.amount)}</span>
                <button type="button" onClick={() => setQty(l.id, 0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B0B5BF', display: 'flex' }}><XIcon size={14} /></button>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #EAEAEA', padding: '10px 12px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Row k="Subtotal (incl. tax)" v={fmtMoney(totals.subtotal)} />
            {totals.discount > 0 && <Row k="Discount" v={`−${fmtMoney(totals.discount)}`} />}
            <Row k="Taxable value" v={fmtMoney(totals.taxable)} />
            {Object.entries(totals.components).map(([k, v]) => <Row key={k} k={k} v={fmtMoney(v)} />)}
            {totals.roundOff !== 0 && <Row k="Round-off" v={fmtMoney(totals.roundOff)} />}
          </div>
        </div>
        {/* tender 25% */}
        <div style={{ flex: '1 1 25%', display: 'flex', flexDirection: 'column', background: '#FFF', padding: 14, gap: 12, minWidth: 0 }}>
          <div><div className="section-label">Payable</div><div className="money" style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1 }} data-testid="pos-payable">{fmtMoney(totals.total)}</div></div>
          <Segmented size="lg" value={tender} onChange={(v) => { setTender(v); setTendered(0); }} options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }, { value: 'UPI', label: 'UPI' }, { value: 'Mixed', label: 'Mixed' }, ...(!isWalkin && cfg.posAllowCredit ? [{ value: 'Credit' as const, label: 'Credit' }] : [])]} style={{ width: '100%', display: 'grid', gridTemplateColumns: `repeat(${!isWalkin && cfg.posAllowCredit ? 5 : 4}, 1fr)` }} />
          {tender === 'Cash' && <><MoneyField label="Tendered" value={tendered || totals.total} onChange={setTendered} /><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[totals.total, Math.ceil(totals.total / 100) * 100, Math.ceil(totals.total / 500) * 500, Math.ceil(totals.total / 2000) * 2000].filter((v, i, a) => a.indexOf(v) === i).map((v) => <button key={v} type="button" className="chip" onClick={() => setTendered(v)} style={{ height: 36 }}>{fmtMoney(v)}</button>)}</div><Row k="Change" v={<span style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(change)}</span>} /></>}
          {tender === 'Card' && <><div style={{ background: 'linear-gradient(135deg,#1E293B,#334155)', color: '#fff', borderRadius: 12, padding: 14, fontSize: 12 }}><div style={{ opacity: .7 }}>CARD PAYMENT</div><div style={{ fontSize: 18, letterSpacing: 2, marginTop: 6 }}>•••• •••• •••• {cardLast4 || '____'}</div><div style={{ marginTop: 6 }}>{fmtMoney(totals.total)}</div></div><TextField label="Last 4 digits" value={cardLast4} onChange={(v) => setCardLast4(v.replace(/\D/g, '').slice(0, 4))} placeholder="1234" /><TextField label="Approval / RRN" value={ref} onChange={setRef} placeholder="Optional" /></>}
          {tender === 'UPI' && <TextField label="UPI transaction reference" required value={ref} onChange={setRef} placeholder="UPI/…" />}
          {tender === 'Credit' && <Banner tone="info">Bills to {cust?.name}'s ledger · terms {cust?.paymentTerms}{cust ? ` · exposure ${fmtMoney(engine.partyOutstanding('Customer', cust.id).outstanding)} / limit ${fmtMoney(cust.creditLimit)}` : ''}</Banner>}
          {tender === 'Mixed' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {mixed.map((t, i) => <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 28px', gap: 6, alignItems: 'end' }}><SelectField size="sm" value={t.type} onChange={(v) => setMixed((m) => m.map((x, k) => (k === i ? { ...x, type: v as TenderType } : x)))} options={[...(['Cash', 'Card', 'UPI'] as TenderType[]), ...(!isWalkin ? (['Credit'] as TenderType[]) : [])]} /><NumberField size="sm" value={t.amount} onChange={(v) => setMixed((m) => m.map((x, k) => (k === i ? { ...x, amount: v } : x)))} decimals={2} min={0} /><button type="button" className="btn-icon" onClick={() => setMixed((m) => m.filter((_, k) => k !== i))}>✕</button>{t.type === 'Card' && <TextField size="sm" value={t.last4 ?? ''} onChange={(v) => setMixed((m) => m.map((x, k) => (k === i ? { ...x, last4: v.replace(/\D/g, '').slice(0, 4) } : x)))} placeholder="Last 4" style={{ gridColumn: 'span 3' }} />}{t.type === 'UPI' && <TextField size="sm" value={t.reference ?? ''} onChange={(v) => setMixed((m) => m.map((x, k) => (k === i ? { ...x, reference: v } : x)))} placeholder="UPI ref" style={{ gridColumn: 'span 3' }} />}</div>)}
              <Button size="sm" variant="link" onClick={() => setMixed((m) => [...m, { type: 'UPI', amount: 0 }])}>+ Add tender</Button>
              <Row k="Tendered" v={<span style={{ color: Math.abs(tenderSum - totals.total) > 0.005 && tenderSum < totals.total ? '#C0393F' : '#12784E' }}>{fmtMoney(tenderSum)}</span>} />
              {tenderSum > totals.total && <Row k="Change (cash)" v={fmtMoney(change)} />}
            </div>
          )}
          <div style={{ marginTop: 'auto' }}>
            {errors.length > 0 && lines.length > 0 && <div style={{ fontSize: 12, color: '#C0393F', marginBottom: 6 }}>{errors[0]}</div>}
            <Button variant="primary" onClick={complete} disabled={!online || !lines.length || errors.length > 0} style={{ width: '100%', height: 56, justifyContent: 'center', fontSize: 16, fontWeight: 700 }} data-testid="pos-complete">Complete sale · {fmtMoney(totals.total)}</Button>
          </div>
        </div>
      </div>
      <Drawer open={showHeld} onClose={() => setShowHeld(false)} title={`Held carts (${held.length})`} width={480}>
        {held.length === 0 && <div style={{ color: '#5F6368' }}>No held carts on this shift.</div>}
        {held.map((h) => <div key={h.id} className="card" style={{ padding: 12, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ flex: 1 }}><div style={{ fontWeight: 600 }}>{h.label}</div><div style={{ fontSize: 12, color: '#5F6368' }}>{h.lines.length} item(s) · {fmtMoney(h.total)} · {fmtDateTime(h.heldAt)}{h.customerName ? ` · ${h.customerName}` : ''}</div></div><Button size="sm" variant="primary" onClick={() => resume(h)} data-testid="pos-resume">Resume</Button><Button size="sm" variant="ghost" onClick={() => db.remove(C.posHeldCarts, h.id)}>Discard</Button></div>)}
      </Drawer>
      {closing && <ShiftCloseDialog shift={shift} onClose={() => setClosing(false)} onClosed={() => { setClosing(false); toast.success('Shift closed'); }} />}
    </div>
  );
}

function ReceiptScreen({ bill, onNew, onPrint, print, onClosePrint }: { bill: PosBill; onNew: () => void; onPrint: () => void; print: boolean; onClosePrint: () => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, background: '#F0FFF8' }}>
      <div style={{ fontSize: 56 }}>✅</div>
      <h2 style={{ fontSize: 24, fontWeight: 700, color: '#12784E', margin: 0 }}>Payment received</h2>
      <div className="money" style={{ fontSize: 34, fontWeight: 700 }} data-testid="pos-receipt-total">{fmtMoney(bill.totals.total)}</div>
      <div style={{ fontSize: 14, color: '#5F6368' }}><span className="identifier" data-testid="pos-receipt-number">{bill.number}</span> · {bill.tenders.map((t) => `${t.type} ${fmtMoney(t.amount)}`).join(' + ')}{bill.change ? ` · change ${fmtMoney(bill.change)}` : ''} · <Badge status="Posted" /></div>
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Journal {bill.journalNumber} · {bill.lines.length} line(s) · {bill.partyName}</div>
      <div style={{ display: 'flex', gap: 12 }}><Button variant="secondary" onClick={onPrint} style={{ height: 48 }}>Print receipt</Button><Button variant="primary" onClick={onNew} style={{ height: 48, padding: '0 32px' }} data-testid="pos-new-bill">New bill</Button></div>
      <Modal open={print} onClose={onClosePrint} title={`Receipt ${bill.number}`} width={620} footer={<><Button variant="secondary" onClick={onClosePrint}>Close</Button><Button variant="primary" onClick={() => { engine.audit({ action: 'pos.bill_printed', objectType: 'POS Bill', objectId: bill.id, objectNumber: bill.number }); window.print(); }}>Print</Button></>}>
        <div style={{ background: '#F3F5F5', padding: 12, maxHeight: '60vh', overflow: 'auto' }}><div style={{ transform: 'scale(.72)', transformOrigin: 'top left', width: 794 }}><PrintSheet doc={bill} title="Retail invoice" partyLabel="Customer" extraHeader={<div>{bill.cashierName} · {bill.tenders.map((t) => t.type).join('+')}</div>} /></div></div>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) { return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#5F6368' }}>{k}</span><span className="money">{v}</span></div>; }
const btnDark: React.CSSProperties = { background: 'rgba(255,255,255,.12)', border: 'none', color: '#fff', borderRadius: 6, padding: '0 12px', height: 32, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };
const qtyBtn: React.CSSProperties = { width: 32, height: 32, border: '1px solid #EAEAEA', borderRadius: 6, background: '#FAFAFA', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' };

export { today };
