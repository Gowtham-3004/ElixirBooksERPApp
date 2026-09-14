// Customer & supplier sub-ledgers: open items + settlements from C.openItems, control-account tie-out, drill to documents.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRoute, useSession } from '../../store';
import type { Account, Journal, OpenItem } from '../../store';
import { Badge, Button, EntityPicker, KpiTile, Money, PageHeader, ScopeLine, useCustomerOptions, useSupplierOptions } from '../../components/ui';
import { daysBetween, downloadText, fmtDate, fmtMoney, toCSV, today } from '../../lib/format';
import { accountLedger, journalLink, partyOpenItems } from './lib';

const DOC_LINK: Record<string, string> = { 'Sales Invoice': 'sales/invoices', 'Credit Note': 'sales/credit-notes', Receipt: 'sales/receipts', 'Vendor Invoice': 'purchase/vendor-invoices', 'Debit Note': 'purchase/debit-notes', Payment: 'purchase/payments', 'Opening Balance': 'accounting/opening-balances', 'POS Bill': 'pos/bills' };
export const docLinkFor = (docType: string, id: string) => (DOC_LINK[docType] ? `${DOC_LINK[docType]}/${id}` : `accounting/journals`);

export function SubLedgerPage({ kind }: { kind: 'Customer' | 'Supplier' }) {
  const s = useSession();
  const route = useRoute();
  const custOpts = useCustomerOptions();
  const supOpts = useSupplierOptions();
  const openItems = useCollection<OpenItem>(C.openItems);
  const journals = useCollection<Journal>(C.journals);
  const [partyId, setPartyId] = useState<string | undefined>(route.params.party || undefined);
  const [tab, setTab] = useState<'open' | 'all' | 'settlements'>('open');
  const opts = kind === 'Customer' ? custOpts : supOpts;
  const party = db.find<any>(kind === 'Customer' ? C.customers : C.suppliers, partyId);
  const items = useMemo(() => partyOpenItems(kind, partyId), [kind, partyId, openItems]);
  const shown = tab === 'open' ? items.filter((o) => o.status !== 'Settled' && o.status !== 'Written Off') : items;
  const settlements = items.flatMap((o) => o.settlements.map((st) => ({ ...st, item: o }))).sort((a, b) => b.date.localeCompare(a.date));
  const controlId = (kind === 'Customer' ? party?.receivableAccountId ?? s.company?.defaults.receivableAccountId : party?.payableAccountId ?? s.company?.defaults.payableAccountId) as string | undefined;
  const control = db.find<Account>(C.accounts, controlId);
  const ledger = useMemo(() => (controlId ? accountLedger(controlId, { partyId }) : null), [controlId, partyId, journals]);
  const subTotal = items.filter((o) => o.status !== 'Settled' && o.status !== 'Written Off').reduce((x, o) => x + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0);
  const overdue = items.filter((o) => o.direction === 'Debit' && o.status !== 'Settled' && o.status !== 'Written Off' && o.dueDate < today()).reduce((x, o) => x + o.baseOutstanding, 0);
  const glBal = ledger ? ledger.closing : 0;
  const tie = ledger ? glBal - subTotal : 0;
  const ageing = ['current', '1–30', '31–60', '61–90', '90+'].map((b, i) => ({ b, v: items.filter((o) => o.direction === 'Debit' && o.status !== 'Settled' && o.status !== 'Written Off').filter((o) => { const d = daysBetween(o.dueDate, today()); return i === 0 ? d <= 0 : i === 1 ? d > 0 && d <= 30 : i === 2 ? d > 30 && d <= 60 : i === 3 ? d > 60 && d <= 90 : d > 90; }).reduce((x, o) => x + o.baseOutstanding, 0) }));
  const exportCsv = () => downloadText(`${kind.toLowerCase()}-ledger-${party?.code ?? 'all'}.csv`, toCSV(shown.map((o) => ({ party: o.partyName, docType: o.docType, docNumber: o.docNumber, date: o.date, dueDate: o.dueDate, currency: o.currency, original: o.originalAmount, outstanding: o.outstanding, baseOutstanding: o.baseOutstanding, status: o.status }))));
  return (
    <div className="page">
      <PageHeader title={kind === 'Customer' ? 'Customer ledger' : 'Supplier ledger'} subtitle={<ScopeLine extra={party ? `${party.name} · ${party.code}` : `All ${kind.toLowerCase()}s`} />} actions={<><Button variant="secondary" onClick={exportCsv}>Export CSV</Button>{party && <Button variant="secondary" onClick={() => nav.go(`masters/${kind === 'Customer' ? 'customers' : 'suppliers'}/${party.id}`)}>Open {kind.toLowerCase()}</Button>}{control && <Button variant="secondary" onClick={() => nav.go(`accounting/ledger?account=${control.id}`)}>GL {control.code}</Button>}</>} />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <EntityPicker value={partyId} onChange={setPartyId} options={opts} placeholder={`All ${kind.toLowerCase()}s — search to filter…`} style={{ width: 380 }} recentKey={`subledger-${kind}`} />
        <div style={{ display: 'flex' }}>{(['open', 'all', 'settlements'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'open' ? 'Open items' : t === 'all' ? 'All items' : 'Settlements'}</button>)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiTile label={kind === 'Customer' ? 'Receivable' : 'Payable'} amount={subTotal} currency={s.currency} sub={`${shown.length} open item${shown.length === 1 ? '' : 's'}`} />
        <KpiTile label="Overdue" amount={overdue} currency={s.currency} tone={overdue ? 'negative' : 'none'} sub={ageing.filter((a) => a.v).map((a) => `${a.b}: ${fmtMoney(a.v, s.currency)}`).join(' · ') || 'Nothing overdue'} />
        <KpiTile label={`GL control ${control?.code ?? ''}`} value={ledger ? <Money value={glBal} currency={s.currency} /> : '—'} sub={control?.name} />
        <KpiTile label="Control tie-out" amount={tie} currency={s.currency} tone={Math.abs(tie) < 0.01 ? 'none' : 'negative'} sub={Math.abs(tie) < 0.01 ? '✓ Sub-ledger = control account' : 'GL − sub-ledger difference (opening balances not yet split by party, or postings without open items)'} deltaTone={Math.abs(tie) < 0.01 ? 'good' : 'bad'} />
      </div>
      {tab !== 'settlements' ? (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table dense">
            <thead><tr>{!partyId && <th>{kind}</th>}<th>Document</th><th>Date</th><th>Due</th><th>Ccy</th><th className="right">Original</th><th className="right">Settled</th><th className="right">Outstanding</th><th className="right">Base outstanding</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((o) => { const d = daysBetween(o.dueDate, today()); const settled = o.settlements.reduce((x, st) => x + st.amount, 0); return (
                <tr key={o.id} className="clickable" onClick={() => nav.go(docLinkFor(o.docType, o.docId))}>
                  {!partyId && <td><span className="link" onClick={(e) => { e.stopPropagation(); setPartyId(o.partyId); }}>{o.partyName}</span></td>}
                  <td><span className="identifier link">{o.docNumber}</span> <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{o.docType}</span></td>
                  <td>{fmtDate(o.date)}</td>
                  <td>{fmtDate(o.dueDate)} {o.direction === 'Debit' && d > 0 && o.status !== 'Settled' && <span className="pill pill-critical">{d} d</span>}</td>
                  <td>{o.currency !== s.currency ? <span className="currency-tag" title={`@ ${o.rate}`}>{o.currency}</span> : <span style={{ color: 'var(--ink-5)' }}>{o.currency}</span>}</td>
                  <td className="right money">{fmtMoney(o.direction === 'Debit' ? o.originalAmount : -o.originalAmount, o.currency, { code: o.currency !== s.currency })}</td>
                  <td className="right money" style={{ color: 'var(--ink-3)' }}>{settled ? fmtMoney(settled, o.currency, { code: o.currency !== s.currency }) : '—'}</td>
                  <td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(o.direction === 'Debit' ? o.outstanding : -o.outstanding, o.currency, { code: o.currency !== s.currency })}</td>
                  <td className="right money">{fmtMoney(o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding, s.currency)}</td>
                  <td><Badge status={o.status} /></td>
                </tr>
              ); })}
              {!shown.length && <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 28 }}>No {tab === 'open' ? 'open' : ''} items{party ? ` for ${party.name}` : ''} — open items are created when invoices post</td></tr>}
            </tbody>
            {shown.length > 0 && <tfoot><tr><td colSpan={partyId ? 7 : 8}>Totals for {shown.length} items</td><td className="right money">{fmtMoney(shown.reduce((x, o) => x + (o.direction === 'Debit' ? o.baseOutstanding : -o.baseOutstanding), 0), s.currency)}</td><td /></tr></tfoot>}
          </table>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table dense">
            <thead><tr><th>Date</th><th>Settlement</th><th>Against</th><th>Ccy</th><th className="right">Amount</th><th className="right">Rate</th><th className="right">Base</th><th className="right">FX gain / loss</th></tr></thead>
            <tbody>
              {settlements.map((st) => (
                <tr key={st.id} className="clickable" onClick={() => nav.go(docLinkFor(st.docType, st.docId))}>
                  <td>{fmtDate(st.date)}</td><td><span className="identifier link">{st.docNumber}</span> <span style={{ color: 'var(--ink-3)', fontSize: 12 }}>{st.docType}</span></td><td><span className="identifier">{st.item.docNumber}</span> · {st.item.partyName}</td><td>{st.item.currency}</td>
                  <td className="right money">{fmtMoney(st.amount, st.item.currency, { code: st.item.currency !== s.currency })}</td><td className="right money">{st.rate}</td><td className="right money">{fmtMoney(st.baseAmount, s.currency)}</td>
                  <td className="right money" style={{ color: st.fxGainLoss > 0 ? 'var(--good)' : st.fxGainLoss < 0 ? 'var(--danger)' : undefined }}>{st.fxGainLoss ? fmtMoney(st.fxGainLoss, s.currency) : '—'}</td>
                </tr>
              ))}
              {!settlements.length && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 28 }}>No settlements recorded</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {ledger && partyId && ledger.entries.length > 0 && (
        <div>
          <div className="section-title">GL postings on {control?.code} for {party?.name}</div>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th>Date</th><th>Journal</th><th>Narration</th><th className="right">Dr</th><th className="right">Cr</th><th className="right">Balance</th></tr></thead>
              <tbody>{ledger.entries.map((e) => <tr key={e.line.id} className="clickable" onClick={() => nav.go(journalLink(e.journal.id))}><td>{fmtDate(e.journal.date)}</td><td className="identifier link">{e.journal.number}</td><td>{e.line.narration ?? e.journal.narration}</td><td className="right money">{e.dr ? fmtMoney(e.dr, s.currency) : '—'}</td><td className="right money">{e.cr ? fmtMoney(e.cr, s.currency) : '—'}</td><td className="right money">{fmtMoney(e.balance, s.currency)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

