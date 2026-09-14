// FX operations (FR-FX-005..014, E2E-06): exposure view, revaluation runs, realized gain/loss report, rate audit link.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Account, ExchangeRate, Journal, OpenItem } from '../../store';
import { Badge, Button, CheckboxField, ChipGroup, ConfirmDialog, DateField, KpiTile, Money, PageHeader, ScopeLine, SelectField, TextArea, useToast } from '../../components/ui';
import { fmtDate, fmtMoney, round, today, uid, addDays } from '../../lib/format';
import { journalLink, settings } from './lib';
import type { RevaluationItem, RevaluationRun } from './types';
import { docLinkFor } from './SubLedgers';

type Scope = 'AR' | 'AP' | 'Bank';

/** Foreign-currency exposure: open items + fixed-currency bank accounts with carrying vs current value. */
export function useExposure(asOf: string, closingRates?: Record<string, number>) {
  const s = useSession();
  const openItems = useCollection<OpenItem>(C.openItems);
  const accounts = useCollection<Account>(C.accounts);
  const journals = useCollection<Journal>(C.journals);
  const rates = useCollection<ExchangeRate>(C.exchangeRates);
  return useMemo(() => {
    const base = s.currency;
    const rateFor = (ccy: string) => closingRates?.[ccy] ?? engine.resolveRate(ccy, base, asOf).rate;
    const items: RevaluationItem[] = [];
    openItems.filter((o) => (!o.companyId || o.companyId === s.state.companyId) && o.currency !== base && o.outstanding > 0.005 && o.status !== 'Settled' && o.status !== 'Written Off' && o.date <= asOf).forEach((o) => {
      const rate = rateFor(o.currency);
      const closingBase = round(o.outstanding * rate);
      const sign = o.direction === 'Debit' ? 1 : -1;
      const kind: Scope = o.partyType === 'Customer' ? 'AR' : 'AP';
      const accountId = (o.partyType === 'Customer' ? db.find<any>(C.customers, o.partyId)?.receivableAccountId ?? s.company?.defaults.receivableAccountId : db.find<any>(C.suppliers, o.partyId)?.payableAccountId ?? s.company?.defaults.payableAccountId) as string;
      const diff = round((closingBase - o.baseOutstanding) * sign * (kind === 'AR' ? 1 : -1));
      items.push({ id: o.id, kind, ref: o.docNumber, partyName: o.partyName, accountId, partyType: o.partyType as 'Customer' | 'Supplier', partyId: o.partyId, currency: o.currency, amount: o.outstanding * sign, bookRate: o.rate, bookBase: o.baseOutstanding * sign, closingBase: closingBase * sign, difference: diff });
    });
    accounts.filter((a) => a.companyId === s.state.companyId && a.isBank && a.currencyBehaviour === 'Fixed' && a.fixedCurrency && a.fixedCurrency !== base).forEach((a) => {
      const ccy = a.fixedCurrency!;
      // Book base = opening + posted lines to date; foreign amount from line currency/base where available
      let bookBase = a.openingBalance ?? 0, fc = 0, fcKnown = false;
      journals.filter((j) => (j.status === 'Posted' || j.status === 'Reversed') && j.companyId === s.state.companyId && j.date <= asOf).forEach((j) => j.lines.forEach((l) => { if (l.accountId !== a.id) return; bookBase += l.drBase - l.crBase; if (j.currency === ccy) { fc += l.dr - l.cr; fcKnown = true; } else { const m = /([A-Z]{3})\s*([\d,]+(?:\.\d+)?)/.exec(l.narration ?? ''); if (m && m[1] === ccy) { fc += (l.drBase ? 1 : -1) * Number(m[2].replace(/,/g, '')); fcKnown = true; } } }));
      if (!fcKnown) { const r0 = engine.resolveRate(ccy, base, s.company?.openingBalanceDate ?? asOf).rate || 1; fc = round(bookBase / r0, 2); }
      const rate = rateFor(ccy);
      const closingBase = round(fc * rate);
      if (Math.abs(fc) < 0.005 && Math.abs(bookBase) < 0.005) return;
      items.push({ id: a.id, kind: 'Bank', ref: `${a.code} · ${a.name}`, accountId: a.id, currency: ccy, amount: round(fc, 2), bookRate: fc ? round(bookBase / fc, 4) : 0, bookBase: round(bookBase), closingBase, difference: round(closingBase - bookBase) });
    });
    const currencies = Array.from(new Set(items.map((i) => i.currency)));
    const latest = Object.fromEntries(currencies.map((c) => { const r = engine.resolveRate(c, base, asOf); return [c, { rate: closingRates?.[c] ?? r.rate, type: closingRates?.[c] ? 'Chosen' : r.type, source: r.source, at: r.at }]; }));
    return { items, currencies, latest, base };
  }, [openItems, accounts, journals, rates, asOf, closingRates, s.currency, s.state.companyId, s.company]);
}

export function FxExposurePage() {
  const s = useSession();
  const [asOf, setAsOf] = useState(today());
  const exp = useExposure(asOf);
  const openItems = useCollection<OpenItem>(C.openItems);
  const journals = useCollection<Journal>(C.journals).filter((j) => j.companyId === s.state.companyId);
  const fxJournals = journals.filter((j) => j.sourceType === 'FX Settlement' && (j.status === 'Posted' || j.status === 'Reversed'));
  const journalFor = new Set(fxJournals.map((j) => j.sourceId));
  // Settlements whose realised difference was not posted as a journal (e.g. FX accounts unmapped at the time)
  const realized = openItems.flatMap((o) => o.settlements.filter((st) => st.fxGainLoss && !journalFor.has(st.docId)).map((st) => ({ ...st, item: o }))).sort((a, b) => b.date.localeCompare(a.date));
  const gainAccId = s.company?.defaults.fxGainAccountId, lossAccId = s.company?.defaults.fxLossAccountId;
  const ledgerGain = journals.filter((j) => (j.status === 'Posted' || j.status === 'Reversed') && j.type !== 'Revaluation').reduce((x, j) => x + j.lines.filter((l) => l.accountId === gainAccId).reduce((y, l) => y + l.crBase - l.drBase, 0), 0);
  const ledgerLoss = journals.filter((j) => (j.status === 'Posted' || j.status === 'Reversed') && j.type !== 'Revaluation').reduce((x, j) => x + j.lines.filter((l) => l.accountId === lossAccId).reduce((y, l) => y + l.drBase - l.crBase, 0), 0);
  const gain = round(ledgerGain + realized.filter((r) => r.fxGainLoss > 0).reduce((x, r) => x + r.fxGainLoss, 0));
  const loss = round(ledgerLoss + realized.filter((r) => r.fxGainLoss < 0).reduce((x, r) => x - r.fxGainLoss, 0));
  const unreal = exp.items.reduce((x, i) => x + i.difference, 0);
  const [tab, setTab] = useState<'exposure' | 'realized'>('exposure');
  return (
    <div className="page">
      <PageHeader title="Currencies & FX" subtitle={<ScopeLine extra={`base ${exp.base} · exposure as of ${fmtDate(asOf)}`} />} actions={<><Button variant="secondary" onClick={() => nav.go('masters/exchange-rates')}>Exchange rates & audit</Button><Button variant="primary" onClick={() => nav.go('accounting/revaluation')}>Revaluation runs</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiTile label="Foreign exposure" value={<Money value={exp.items.reduce((x, i) => x + Math.abs(i.bookBase), 0)} currency={exp.base} />} sub={`${exp.items.length} item(s) in ${exp.currencies.join(', ') || '—'}`} />
        <KpiTile label="Unrealised at current rates" value={<Money value={unreal} currency={exp.base} tone="auto" />} sub={exp.currencies.map((c) => `${c} ${exp.latest[c].rate} (${exp.latest[c].type})`).join(' · ') || 'No foreign items'} deltaTone={unreal >= 0 ? 'good' : 'bad'} />
        <KpiTile label="Realised gain (FY)" value={<Money value={gain} currency={exp.base} tone="positive" />} onClick={() => setTab('realized')} />
        <KpiTile label="Realised loss (FY)" value={<Money value={loss} currency={exp.base} tone={loss ? 'negative' : 'none'} />} onClick={() => setTab('realized')} />
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex' }}>{(['exposure', 'realized'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'exposure' ? 'Exposure' : 'Realised gain / loss'}</button>)}</div>
        {tab === 'exposure' && <DateField label="As of" value={asOf} onChange={setAsOf} size="sm" />}
      </div>
      {tab === 'exposure' ? (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table dense">
            <thead><tr><th>Type</th><th>Reference</th><th>Party / account</th><th>Ccy</th><th className="right">Original amount</th><th className="right">Book rate</th><th className="right">Base carrying</th><th className="right">Current rate</th><th className="right">Current value</th><th className="right">Unrealised</th></tr></thead>
            <tbody>
              {exp.items.map((i) => (
                <tr key={i.id} className="clickable" onClick={() => nav.go(i.kind === 'Bank' ? `accounting/ledger?account=${i.accountId}` : docLinkFor(db.find<OpenItem>(C.openItems, i.id)?.docType ?? '', i.id))}>
                  <td><span className="pill pill-neutral">{i.kind}</span></td><td className="identifier">{i.ref}</td><td>{i.partyName ?? '—'}</td><td><span className="currency-tag">{i.currency}</span></td>
                  <td className="right money">{fmtMoney(i.amount, i.currency, { code: true })}</td><td className="right money">{i.bookRate}</td><td className="right money">{fmtMoney(i.bookBase, exp.base)}</td><td className="right money">{exp.latest[i.currency]?.rate}</td><td className="right money">{fmtMoney(i.closingBase, exp.base)}</td>
                  <td className="right money" style={{ color: i.difference > 0 ? 'var(--good)' : i.difference < 0 ? 'var(--danger)' : undefined, fontWeight: 600 }}>{fmtMoney(i.difference, exp.base)}</td>
                </tr>
              ))}
              {!exp.items.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 28 }}>No foreign-currency open items or bank balances as of {fmtDate(asOf)}</td></tr>}
            </tbody>
            {exp.items.length > 0 && <tfoot><tr><td colSpan={6}>Totals · {exp.items.length} items</td><td className="right money">{fmtMoney(exp.items.reduce((x, i) => x + i.bookBase, 0), exp.base)}</td><td /><td className="right money">{fmtMoney(exp.items.reduce((x, i) => x + i.closingBase, 0), exp.base)}</td><td className="right money">{fmtMoney(unreal, exp.base)}</td></tr></tfoot>}
          </table>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table dense">
            <thead><tr><th>Date</th><th>Settlement</th><th>Open item</th><th>Party</th><th>Ccy</th><th className="right">Amount</th><th className="right">Invoice rate</th><th className="right">Settlement rate</th><th className="right">Gain / (loss)</th></tr></thead>
            <tbody>
              {realized.map((r) => <tr key={r.id} className="clickable" onClick={() => nav.go(docLinkFor(r.docType, r.docId))}><td>{fmtDate(r.date)}</td><td className="identifier link">{r.docNumber}</td><td className="identifier">{r.item.docNumber}</td><td>{r.item.partyName}</td><td>{r.item.currency}</td><td className="right money">{fmtMoney(r.amount, r.item.currency, { code: true })}</td><td className="right money">{r.item.rate}</td><td className="right money">{r.rate}</td><td className="right money" style={{ color: r.fxGainLoss > 0 ? 'var(--good)' : 'var(--danger)', fontWeight: 600 }}>{fmtMoney(r.fxGainLoss, exp.base)}</td></tr>)}
              {fxJournals.map((j) => { const g = j.lines.filter((l) => l.accountId === s.company?.defaults.fxGainAccountId).reduce((x, l) => x + l.crBase - l.drBase, 0); const lo = j.lines.filter((l) => l.accountId === s.company?.defaults.fxLossAccountId).reduce((x, l) => x + l.drBase - l.crBase, 0); return <tr key={j.id} className="clickable" onClick={() => nav.go(journalLink(j.id))}><td>{fmtDate(j.date)}</td><td className="identifier link">{j.sourceNumber ?? j.number}</td><td className="identifier">{j.number}</td><td>{j.lines.find((l) => l.partyName)?.partyName ?? '—'}</td><td>{j.currency}</td><td className="right">—</td><td className="right">—</td><td className="right">—</td><td className="right money" style={{ color: g - lo > 0 ? 'var(--good)' : 'var(--danger)', fontWeight: 600 }}>{fmtMoney(g - lo, exp.base)}</td></tr>; })}
              {!realized.length && !fxJournals.length && <tr><td colSpan={9} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 28 }}>No realised FX differences yet — they post automatically when a foreign-currency open item settles at a different rate (FR-FX-009)</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Acceptance example (FRD 9A): USD 10,000 invoiced at 83.20 (₹8,32,000) and settled at 84.00 (₹8,40,000) posts ₹8,000 realised gain. Rates used are audited under Masters › Exchange rates.</div>
    </div>
  );
}

// ── Revaluation runs (FR-FX-010/011) ───────────────────────────────────────

export function RevaluationPage() {
  const s = useSession();
  const toast = useToast();
  const runs = useCollection<RevaluationRun>(C.revaluationRuns).filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.asOf.localeCompare(a.asOf));
  const rates = useCollection<ExchangeRate>(C.exchangeRates).filter((r) => r.status === 'Approved');
  const periods = useCollection<any>(C.periods).filter((p) => p.companyId === s.state.companyId).sort((a: any, b: any) => a.code.localeCompare(b.code));
  const cur = s.period ?? periods.find((p: any) => p.status === 'Open');
  const [asOf, setAsOf] = useState<string>(cur?.end ?? today());
  const [currency, setCurrency] = useState('USD');
  const [scope, setScope] = useState<Scope[]>(['AR', 'AP', 'Bank']);
  const [rateId, setRateId] = useState<string>('');
  const [autoReverse, setAutoReverse] = useState(true);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [reverse, setReverse] = useState<RevaluationRun | null>(null);
  const cfg = settings();
  const candidates = rates.filter((r) => r.base === currency && r.quote === s.currency && r.effectiveAt.slice(0, 10) <= asOf).sort((a, b) => (a.type === 'Closing' ? -1 : 1) - (b.type === 'Closing' ? -1 : 1) || b.effectiveAt.localeCompare(a.effectiveAt));
  const chosen = rates.find((r) => r.id === rateId) ?? candidates[0];
  const exp = useExposure(asOf, chosen ? { [currency]: chosen.rate } : undefined);
  const preview = exp.items.filter((i) => i.currency === currency && scope.includes(i.kind));
  const gain = preview.filter((i) => i.difference > 0).reduce((x, i) => x + i.difference, 0);
  const loss = preview.filter((i) => i.difference < 0).reduce((x, i) => x - i.difference, 0);
  const net = round(gain - loss);
  const period = asOf.slice(0, 7);
  const dup = runs.find((r) => r.period === period && r.currency === currency && r.status === 'Posted' && r.scope.some((x) => scope.includes(x)));
  const canPost = s.can('accounting.journal.post') || s.can('accounting.fx.post');
  const periodChk = engine.postingCheck(asOf);
  const gainAcc = db.find<Account>(C.accounts, cfg.unrealisedFxGainAccountId);
  const lossAcc = db.find<Account>(C.accounts, cfg.unrealisedFxLossAccountId);
  const post = () => {
    if (!chosen) throw new Error('No approved rate for this currency on or before the period end');
    if (dup) throw new Error(`Revaluation ${dup.number} already covers ${period} for ${currency} (${dup.scope.join('/')}) — reverse it first (FR-FX-011)`);
    if (!preview.length) throw new Error('Nothing to revalue in the selected scope');
    if (!gainAcc || !lossAcc) throw new Error('Configure unrealised FX gain/loss accounts in Accounting settings');
    const lines: engine.PostLine[] = [];
    preview.forEach((i) => {
      const d = i.difference;
      if (Math.abs(d) < 0.005) return;
      const party = i.partyType ? { partyType: i.partyType, partyId: i.partyId, partyName: i.partyName } : {};
      const narr = `${i.ref} · ${i.currency} ${Math.abs(i.amount).toLocaleString('en-IN')} × (${chosen.rate} − ${i.bookRate})`;
      // AR/Bank asset: gain → Dr asset / Cr gain; loss → Dr loss / Cr asset. AP liability: gain → Dr AP / Cr gain; loss → Dr loss / Cr AP.
      if (d > 0) lines.push({ accountId: i.accountId, dr: d, ...party, narration: narr }, { accountId: gainAcc.id, cr: d, narration: narr });
      else lines.push({ accountId: lossAcc.id, dr: -d, narration: narr }, { accountId: i.accountId, cr: -d, ...party, narration: narr });
    });
    db.transaction(() => {
      const number = engine.allocateNumber('Revaluation', { date: asOf });
      const j = engine.postJournal({ date: asOf, lines, sourceType: 'Revaluation', sourceNumber: number, narration: `Period-end revaluation of ${currency} ${scope.join('/')} at closing rate ${chosen.rate} (${period})${reason ? ' — ' + reason : ''}`, type: 'Revaluation', idempotencyKey: `reval:${currency}:${period}:${scope.join('')}:${uid('r')}`, skipPeriodCheck: !periodChk.ok && s.can('accounting.period.postclosed') });
      db.update<Journal>(C.journals, j.id, { sourceId: 'pending' });
      const run = db.insert<RevaluationRun>(C.revaluationRuns, { number, asOf, period, currency, closingRate: chosen.rate, rateId: chosen.id, scope, items: preview, gain: round(gain), loss: round(loss), net, journalId: j.id, journalNumber: j.number, autoReverse, status: 'Posted', reason });
      db.update<Journal>(C.journals, j.id, { sourceId: run.id });
      engine.audit({ action: 'revaluation.posted', objectType: 'Revaluation', objectId: run.id, objectNumber: number, detail: `${currency} @ ${chosen.rate} · ${preview.length} items · net ${fmtMoney(net, s.currency)}`, correlationId: j.correlationId });
      toast.success(`${number} posted — ${j.number}`, { label: 'Open journal', path: journalLink(j.id) });
    });
    setReason('');
  };
  const doReverse = (run: RevaluationRun, why: string) => {
    const date = addDays(run.asOf, 1);
    const rev = engine.reverseJournal(run.journalId!, { reason: why, date: engine.postingCheck(date).ok ? date : today() });
    db.update<RevaluationRun>(C.revaluationRuns, run.id, { status: 'Reversed', reversalJournalId: rev.id });
    engine.audit({ action: 'revaluation.reversed', objectType: 'Revaluation', objectId: run.id, objectNumber: run.number, detail: why });
    toast.success(`${run.number} reversed by ${rev.number}`);
  };
  return (
    <div className="page">
      <PageHeader title="Revaluation" subtitle={<ScopeLine extra="FR-FX-010/011 · unrealised gain/loss on foreign open items and bank balances" />} actions={<Button variant="secondary" onClick={() => nav.go('accounting/fx')}>FX exposure</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, alignItems: 'start' }}>
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="section-title">New revaluation run</div>
          <DateField label="Period-end date" value={asOf} onChange={setAsOf} help={`Period ${period} · ${engine.periodFor(asOf)?.status ?? 'no period'}`} />
          <SelectField label="Currency" value={currency} onChange={(v) => { setCurrency(v); setRateId(''); }} options={Array.from(new Set([...exp.currencies, ...rates.map((r) => r.base)])).filter((c) => c !== s.currency)} />
          <SelectField label="Closing rate (approved)" value={chosen?.id ?? ''} onChange={setRateId} options={candidates.map((r) => ({ value: r.id, label: `${r.rate} · ${r.type} · ${fmtDate(r.effectiveAt)} · ${r.source}` }))} placeholder={candidates.length ? undefined : 'No approved rate — add one under Masters'} help={chosen ? `${chosen.type} rate approved by ${chosen.approvedBy ?? '—'}` : undefined} />
          <ChipGroup label="Scope" multiple value={scope} onChange={setScope} options={[{ value: 'AR', label: 'Receivables' }, { value: 'AP', label: 'Payables' }, { value: 'Bank', label: 'Bank accounts' }]} />
          <CheckboxField checked={autoReverse} onChange={setAutoReverse} label="Auto-reverse on first day of next period" help="Standard policy: unrealised differences reverse; realised differences post on settlement" />
          <TextArea label="Reason / note" value={reason} onChange={setReason} rows={2} placeholder="Quarter-end close…" />
          {dup && <div className="banner danger">Duplicate: {dup.number} already revalued {currency} for {period}. Reverse it to re-run.</div>}
          {!periodChk.ok && <div className="banner warning">{periodChk.reason}</div>}
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={!canPost || !chosen || !!dup || !preview.length || (!periodChk.ok && !s.can('accounting.period.postclosed'))} reason={!canPost ? 'Requires post permission' : !chosen ? 'Approved closing rate required' : dup ? 'Duplicate run' : !preview.length ? 'Nothing to revalue' : undefined}>Post revaluation</Button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            <KpiTile label="Items in scope" value={preview.length} sub={`${currency} at ${chosen?.rate ?? '—'}`} />
            <KpiTile label="Unrealised gain" value={<Money value={gain} currency={s.currency} tone="positive" />} sub={gainAcc ? `→ ${gainAcc.code} ${gainAcc.name}` : 'Configure account'} />
            <KpiTile label="Unrealised loss" value={<Money value={loss} currency={s.currency} tone={loss ? 'negative' : 'none'} />} sub={lossAcc ? `→ ${lossAcc.code} ${lossAcc.name}` : 'Configure account'} />
          </div>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th>Type</th><th>Reference</th><th>Party / account</th><th className="right">{currency} amount</th><th className="right">Book rate</th><th className="right">Book base</th><th className="right">Closing base</th><th className="right">Gain / (loss)</th></tr></thead>
              <tbody>
                {preview.map((i) => <tr key={i.id}><td><span className="pill pill-neutral">{i.kind}</span></td><td className="identifier">{i.ref}</td><td>{i.partyName ?? '—'}</td><td className="right money">{fmtMoney(i.amount, i.currency, { code: true })}</td><td className="right money">{i.bookRate}</td><td className="right money">{fmtMoney(i.bookBase, s.currency)}</td><td className="right money">{fmtMoney(i.closingBase, s.currency)}</td><td className="right money" style={{ color: i.difference > 0 ? 'var(--good)' : i.difference < 0 ? 'var(--danger)' : undefined, fontWeight: 600 }}>{fmtMoney(i.difference, s.currency)}</td></tr>)}
                {!preview.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>No {currency} items in scope as of {fmtDate(asOf)}</td></tr>}
              </tbody>
              {preview.length > 0 && <tfoot><tr><td colSpan={5}>Preview · net</td><td className="right money">{fmtMoney(preview.reduce((x, i) => x + i.bookBase, 0), s.currency)}</td><td className="right money">{fmtMoney(preview.reduce((x, i) => x + i.closingBase, 0), s.currency)}</td><td className="right money">{fmtMoney(net, s.currency)}</td></tr></tfoot>}
            </table>
          </div>
        </div>
      </div>
      <div>
        <div className="section-title">Run history</div>
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table dense">
            <thead><tr><th>Run</th><th>Period end</th><th>Ccy</th><th className="right">Closing rate</th><th>Scope</th><th className="right">Items</th><th className="right">Gain</th><th className="right">Loss</th><th>Journal</th><th>Reversal</th><th>Status</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => { const rev = db.find<Journal>(C.journals, r.reversalJournalId); return (
                <tr key={r.id}>
                  <td className="identifier" style={{ fontWeight: 500 }}>{r.number}</td><td>{fmtDate(r.asOf)}</td><td><span className="currency-tag">{r.currency}</span></td><td className="right money">{r.closingRate}</td><td>{r.scope.join(' / ')}</td><td className="right">{r.items.length}</td>
                  <td className="right money" style={{ color: 'var(--good)' }}>{r.gain ? fmtMoney(r.gain, s.currency) : '—'}</td><td className="right money" style={{ color: 'var(--danger)' }}>{r.loss ? fmtMoney(r.loss, s.currency) : '—'}</td>
                  <td>{r.journalId ? <span className="identifier link" onClick={() => nav.go(journalLink(r.journalId!))}>{r.journalNumber}</span> : '—'}</td>
                  <td>{rev ? <span className="identifier link" onClick={() => nav.go(journalLink(rev.id))}>{rev.number} · {fmtDate(rev.date)}</span> : r.autoReverse ? <span style={{ color: 'var(--ink-3)' }}>auto on {fmtDate(addDays(r.asOf, 1))}</span> : '—'}</td>
                  <td><Badge status={r.status} /></td>
                  <td>{r.status === 'Posted' && <Button size="sm" variant="secondary" disabled={!canPost} onClick={() => setReverse(r)}>Reverse</Button>}</td>
                </tr>
              ); })}
              {!runs.length && <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 24 }}>No revaluation runs yet</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>Rates come from Masters › Exchange rates (approved only). Auto-reverse posts a linked reversal on the first day of the next period — run it from this table. Later rate corrections never change posted runs (FR-FX-013).</div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Post revaluation of ${currency} for ${period}?`} statement="An itemised revaluation journal is posted at the closing rate. It can be reversed next period." confirmLabel="Post revaluation" cancelLabel="Keep preview"
        consequences={[{ engine: 'Journal', text: `${preview.filter((i) => Math.abs(i.difference) >= 0.005).length * 2} lines dated ${fmtDate(asOf)} · gain ${fmtMoney(gain, s.currency)} → ${gainAcc?.code} · loss ${fmtMoney(loss, s.currency)} → ${lossAcc?.code}` }, { engine: 'Open items', text: 'Open-item original amounts and base carrying values are untouched; realised differences post on settlement' }, { engine: 'Numbering', text: `Run number ${engine.previewNumber('Revaluation', { date: asOf })}` }, ...(autoReverse ? [{ engine: 'Workflow', text: `Reversal expected on ${fmtDate(addDays(asOf, 1))}` }] : [])]}
        onConfirm={() => post()} />
      <ConfirmDialog open={!!reverse} onClose={() => setReverse(null)} title={reverse ? `Reverse ${reverse.number}?` : ''} statement="A linked reversal journal is posted on the first day of the following period (or today if that period is closed)." danger reasonRequired confirmLabel="Reverse revaluation" cancelLabel="Keep run"
        consequences={reverse ? [{ engine: 'Journal', text: `${reverse.journalNumber} reversed · net ${fmtMoney(-reverse.net, s.currency)}` }] : []}
        onConfirm={(why) => { if (reverse) doReverse(reverse, why); }} />
    </div>
  );
}

