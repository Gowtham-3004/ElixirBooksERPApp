// Intercompany matching + "create intercompany transaction" (FR-ORG-011/012, FR-CNS-005).
// Shared by Reports › Group › Intercompany matching and Accounting › Intercompany.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, session, useCollection, useRoute, useSession } from '../../../store';
import type { Company, Journal } from '../../../store';
import {
  Badge, Banner, Button, Card, ConfirmDialog, DataTable, Drawer, EmptyState, KV, KpiTile, Money, Pill,
  SelectField, NumberField, TextField, TextArea, SectionLabel, CheckboxField, useAction, type Column,
} from '../../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, today } from '../../../lib/format';
import { IC_RULE, companyName, dueBalances, icAccountsFor, matchIntercompany, postIntercompany, tenantCompanies } from './lib';
import type { IcDocType, IntercompanyDoc } from './types';

export function IntercompanyPanel({ compact }: { compact?: boolean }) {
  const s = useSession();
  const route = useRoute();
  const docs = useCollection<IntercompanyDoc>(C.intercompanyDocs);
  const journals = useCollection<Journal>(C.journals);
  const act = useAction();
  const [create, setCreate] = useState(false);
  const [expand, setExpand] = useState<string | null>(route.params.doc ?? null);
  const [matchDoc, setMatchDoc] = useState<IntercompanyDoc | null>(null);

  const tenantIds = useMemo(() => new Set(tenantCompanies().map((c) => c.id)), [s.state.companyId]);
  const rows = useMemo(() => docs.filter((d) => tenantIds.has(d.fromCompanyId) && tenantIds.has(d.toCompanyId)).slice().sort((a, b) => b.date.localeCompare(a.date)), [docs, tenantIds]);
  const byRef = useMemo(() => {
    const m = new Map<string, IntercompanyDoc[]>();
    rows.forEach((d) => m.set(d.counterpartyRef, [...(m.get(d.counterpartyRef) ?? []), d]));
    return m;
  }, [rows]);
  const dues = useMemo(() => dueBalances(), [journals, s.state.companyId]);

  const cols: Column<IntercompanyDoc>[] = [
    { key: 'number', label: 'Document', render: (d) => (<div><span className="identifier link">{d.number}</span><div style={{ fontSize: 12, color: '#5F6368' }}>{d.type} · {fmtDate(d.date)}</div></div>), value: (d) => d.number },
    { key: 'ref', label: 'Counterparty reference', render: (d) => (<div><span className="identifier">{d.counterpartyRef}</span>{(byRef.get(d.counterpartyRef)?.length ?? 0) > 1 && <div style={{ fontSize: 11, color: '#6E6E71' }}>{byRef.get(d.counterpartyRef)!.length} documents on this reference</div>}</div>), value: (d) => d.counterpartyRef },
    { key: 'from', label: 'From company', render: (d) => (<div>{companyName(d.fromCompanyId)}<div style={{ fontSize: 11, color: '#6E6E71' }}>Due from · <span className="identifier">{db.find<any>(C.accounts, d.dueFromAccount)?.code ?? '—'}</span></div></div>), value: (d) => companyName(d.fromCompanyId) },
    { key: 'to', label: 'To company', render: (d) => (<div>{companyName(d.toCompanyId)}<div style={{ fontSize: 11, color: '#6E6E71' }}>Due to · <span className="identifier">{db.find<any>(C.accounts, d.dueToAccount)?.code ?? '—'}</span></div></div>), value: (d) => companyName(d.toCompanyId) },
    { key: 'amount', label: 'Amount', align: 'right', render: (d) => <Money value={d.amount} currency={d.currency} code />, value: (d) => d.amount },
    { key: 'baseFrom', label: 'In from-base', align: 'right', render: (d) => (<div><Money value={d.baseAmountFrom} currency={d.baseCurrencyFrom} code /><div style={{ fontSize: 11, color: '#6E6E71' }}>@ {d.rateFrom}</div></div>), value: (d) => d.baseAmountFrom },
    { key: 'baseTo', label: 'In to-base', align: 'right', render: (d) => (d.baseAmountTo ? (<div><Money value={d.baseAmountTo} currency={d.baseCurrencyTo} code /><div style={{ fontSize: 11, color: '#6E6E71' }}>@ {d.rateTo}</div></div>) : <Pill tone="warning">Not booked</Pill>), value: (d) => d.baseAmountTo },
    { key: 'journals', label: 'Journals', render: (d) => (
      <div style={{ fontSize: 12 }}>
        <div>{d.sourceJournalNumbers?.from ? <span className="identifier link" onClick={(e) => { e.stopPropagation(); nav.go(`accounting/journals/${d.sourceJournalIds.from}`); }}>{d.sourceJournalNumbers.from}</span> : '—'}</div>
        <div>{d.sourceJournalNumbers?.to ? <span className="identifier link" onClick={(e) => { e.stopPropagation(); nav.go(`accounting/journals/${d.sourceJournalIds.to}`); }}>{d.sourceJournalNumbers.to}</span> : <span style={{ color: '#8A4B0F' }}>counterparty pending</span>}</div>
      </div>
    ) },
    { key: 'matchStatus', label: 'Match', render: (d) => <Badge status={d.matchStatus === 'Matched' ? 'Matched' : d.matchStatus === 'Difference' ? 'Variance' : 'Unmatched'}>{d.matchStatus}</Badge> },
  ];

  const unmatched = rows.filter((d) => d.matchStatus === 'Unmatched');
  const differences = rows.filter((d) => d.matchStatus === 'Difference');

  return (
    <>
      {!compact && (
        <div className="grid-4">
          <KpiTile label="Intercompany documents" value={String(rows.length)} sub={`${byRef.size} counterparty references`} />
          <KpiTile label="Matched" value={String(rows.filter((d) => d.matchStatus === 'Matched').length)} sub="Both sides booked and agreed" />
          <KpiTile label="Unmatched" value={String(unmatched.length)} sub="Counterparty entry missing" />
          <KpiTile label="Differences" value={String(differences.length)} sub="Proposed as elimination difference lines" />
        </div>
      )}

      <Banner tone="info">{IC_RULE}</Banner>

      <Card
        title="Due to / due from by counterparty (FR-ORG-012)"
        actions={<Button variant="primary" size="sm" onClick={() => setCreate(true)}>Create intercompany transaction</Button>}
        padding={0}
      >
        <table className="data-table dense">
          <thead><tr><th>Company</th><th>Counterparty</th><th>Due-from account</th><th className="right">Receivable</th><th>Due-to account</th><th className="right">Payable</th><th className="right">Net</th></tr></thead>
          <tbody>
            {dues.map((d) => {
              const recvAcc = db.find<any>(C.accounts, d.receivableAccountId);
              const payAcc = db.find<any>(C.accounts, d.payableAccountId);
              return (
                <tr key={d.companyId + d.counterpartyId}>
                  <td>{companyName(d.companyId)} <span className="identifier" style={{ color: '#6E6E71' }}>{d.currency}</span></td>
                  <td>{companyName(d.counterpartyId)}</td>
                  <td>{recvAcc ? <span className="link identifier" onClick={() => openCompanyLedger(d.companyId, d.receivableAccountId!, s.state.companyId)}>{recvAcc.code} · {recvAcc.name}</span> : '—'}</td>
                  <td className="right money"><Money value={d.receivable} currency={d.currency} code /></td>
                  <td>{payAcc ? <span className="link identifier" onClick={() => openCompanyLedger(d.companyId, d.payableAccountId!, s.state.companyId)}>{payAcc.code} · {payAcc.name}</span> : '—'}</td>
                  <td className="right money"><Money value={d.payable} currency={d.currency} code /></td>
                  <td className="right money"><Money value={Math.round((d.receivable - d.payable) * 100) / 100} currency={d.currency} code tone="auto" /></td>
                </tr>
              );
            })}
            {!dues.length && <tr><td colSpan={7} style={{ color: '#6E6E71' }}>No company in this tenant has intercompany accounts configured.</td></tr>}
          </tbody>
        </table>
        <div style={{ padding: 12, fontSize: 12, color: '#6E6E71' }}>Balances are read with <span className="identifier">engine.accountBalance</span> per company and shown in that company’s own base currency — they are only ever translated inside a consolidation run.</div>
      </Card>

      {rows.length === 0
        ? <EmptyState title="No intercompany documents" description="Create one to post the matching pair of journals — one in each legal company." action={<Button variant="primary" onClick={() => setCreate(true)}>Create intercompany transaction</Button>} icon="⇄" />
        : (
          <Card title="Intercompany matching (FR-CNS-005)" padding={0}>
            <DataTable
              rows={rows}
              columns={cols}
              dense
              onRowClick={(d) => setExpand(expand === d.id ? null : d.id)}
              rowClass={(d) => (d.id === expand ? 'selected' : '')}
              rowActions={(d) => [
                { label: d.matchStatus === 'Unmatched' && !d.sourceJournalIds.to ? 'Post counterparty entry and match' : 'Match', onClick: () => setMatchDoc(d), disabled: d.matchStatus === 'Matched', reason: d.matchStatus === 'Matched' ? 'Already matched' : undefined },
                { label: 'Show explanation', onClick: () => setExpand(expand === d.id ? null : d.id) },
                { label: 'Open source journal', onClick: () => d.sourceJournalIds.from && nav.go(`accounting/journals/${d.sourceJournalIds.from}`), disabled: !d.sourceJournalIds.from },
              ]}
            />
            {expand && <IcDetail doc={rows.find((d) => d.id === expand)!} pair={byRef.get(rows.find((d) => d.id === expand)!.counterpartyRef) ?? []} />}
          </Card>
        )}

      <CreateIcDrawer open={create} onClose={() => setCreate(false)} />
      <ConfirmDialog
        open={!!matchDoc}
        onClose={() => setMatchDoc(null)}
        title={matchDoc ? `Match ${matchDoc.number}?` : ''}
        statement={matchDoc ? `Pairs the ${companyName(matchDoc.fromCompanyId)} entry with the ${companyName(matchDoc.toCompanyId)} entry on reference ${matchDoc.counterpartyRef}.` : undefined}
        consequences={[
          ...(matchDoc && !matchDoc.sourceJournalIds.to ? [{ engine: 'Journal' as const, text: `A balanced journal is posted in ${companyName(matchDoc.toCompanyId)} only — it never mixes companies (FR-ORG-011)`, tone: 'warning' as const }] : []),
          { engine: 'Journal', text: 'Each side keeps its own currency, rate and number series', tone: 'info' },
          { engine: 'Open items', text: 'Any residual difference is explained in both base currencies and proposed as an elimination difference line', tone: 'info' },
        ]}
        confirmLabel="Match documents"
        cancelLabel="Leave unmatched"
        onConfirm={async () => { if (matchDoc) await act(() => matchIntercompany(matchDoc.id), 'Intercompany documents matched'); setMatchDoc(null); }}
      />
    </>
  );
}

function openCompanyLedger(companyId: string, accountId: string, activeCompanyId?: string) {
  if (companyId !== activeCompanyId) session.switchCompany(companyId);
  nav.go('accounting/ledger', { account: accountId });
}

function IcDetail({ doc, pair }: { doc: IntercompanyDoc; pair: IntercompanyDoc[] }) {
  const jf = db.find<Journal>(C.journals, doc.sourceJournalIds.from);
  const jt = db.find<Journal>(C.journals, doc.sourceJournalIds.to);
  return (
    <div style={{ borderTop: '1px solid #EAEAEA', padding: 16, background: '#F9FBFC' }}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div>
          <SectionLabel>FX explanation</SectionLabel>
          {doc.difference
            ? <ul style={{ margin: '8px 0 0 18px', fontSize: 13, lineHeight: 1.7 }}>{doc.difference.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
            : <div style={{ fontSize: 13, color: '#6E6E71', marginTop: 8 }}>Not matched yet — match the document to compute the difference in each base currency.</div>}
          {doc.difference && Math.abs(doc.difference.diffTo) >= 0.005 && (
            <div style={{ marginTop: 10 }}><Pill tone="warning">Difference {fmtMoney(doc.difference.diffTo, doc.difference.toCurrency, { code: true })}</Pill></div>
          )}
          {pair.length > 1 && (
            <div style={{ marginTop: 14 }}>
              <SectionLabel>Documents on reference {doc.counterpartyRef}</SectionLabel>
              <table className="data-table dense" style={{ marginTop: 6 }}>
                <thead><tr><th>Document</th><th>Type</th><th>Date</th><th className="right">Amount</th><th>Match</th></tr></thead>
                <tbody>{pair.map((p) => (<tr key={p.id}><td><span className="identifier">{p.number}</span></td><td>{p.type}</td><td>{fmtDate(p.date)}</td><td className="right money">{fmtMoney(p.amount, p.currency, { code: true })}</td><td><Badge status={p.matchStatus === 'Matched' ? 'Matched' : p.matchStatus === 'Difference' ? 'Variance' : 'Unmatched'}>{p.matchStatus}</Badge></td></tr>))}</tbody>
              </table>
            </div>
          )}
        </div>
        <div>
          <SectionLabel>Both sides</SectionLabel>
          <div className="grid-2" style={{ marginTop: 8, gap: 12 }}>
            <JournalCard title={companyName(doc.fromCompanyId)} journal={jf} companyId={doc.fromCompanyId} />
            <JournalCard title={companyName(doc.toCompanyId)} journal={jt} companyId={doc.toCompanyId} />
          </div>
          <div style={{ marginTop: 10 }}>
            <KV items={[
              { k: 'Matched', v: doc.matchedAt ? `${fmtDateTime(doc.matchedAt)} · ${doc.matchedBy}` : 'Not matched' },
              { k: 'Narration', v: doc.narration ?? '—' },
            ]} />
          </div>
        </div>
      </div>
    </div>
  );
}

function JournalCard({ title, journal, companyId }: { title: string; journal?: Journal; companyId: string }) {
  const s = useSession();
  if (!journal) return (<Card padding={12}><div style={{ fontWeight: 600 }}>{title}</div><div style={{ fontSize: 12, color: '#8A4B0F', marginTop: 6 }}>No journal posted on this side yet.</div></Card>);
  return (
    <Card padding={12}>
      <div style={{ fontWeight: 600, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{title}</span>
        <span className="identifier link" onClick={() => { if (companyId !== s.state.companyId) session.switchCompany(companyId); nav.go(`accounting/journals/${journal.id}`); }}>{journal.number}</span>
      </div>
      <table className="data-table dense" style={{ marginTop: 8 }}>
        <tbody>
          {journal.lines.map((l) => (
            <tr key={l.id}><td><span className="identifier">{l.accountCode}</span> {l.accountName}</td><td className="right money">{l.dr ? fmtMoney(l.dr, journal.currency) : ''}</td><td className="right money">{l.cr ? fmtMoney(l.cr, journal.currency) : ''}</td></tr>
          ))}
          <tr style={{ fontWeight: 700 }}><td>Base ({journal.rate === 1 ? 'same' : `@ ${journal.rate}`})</td><td className="right money">{fmtMoney(journal.totalDr)}</td><td className="right money">{fmtMoney(journal.totalCr)}</td></tr>
        </tbody>
      </table>
    </Card>
  );
}

export function CreateIcDrawer({ open, onClose, defaultFrom }: { open: boolean; onClose: () => void; defaultFrom?: string }) {
  const s = useSession();
  const act = useAction();
  const companies = useMemo(() => tenantCompanies(), [open, s.state.companyId]);
  const [type, setType] = useState<IcDocType>('Invoice');
  const [from, setFrom] = useState(defaultFrom ?? s.state.companyId ?? '');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState(s.currency);
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState('');
  const [narration, setNarration] = useState('');
  const [postCounterparty, setPostCounterparty] = useState(true);
  const key = String(open);
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setType('Invoice');
    setFrom(defaultFrom ?? s.state.companyId ?? '');
    setTo(companies.find((c) => c.id !== (defaultFrom ?? s.state.companyId))?.id ?? '');
    setAmount(0);
    setCurrency(s.currency);
    setDate(today());
    setReference('');
    setNarration('');
    setPostCounterparty(true);
  }

  const fromCo = db.find<Company>(C.companies, from);
  const toCo = db.find<Company>(C.companies, to);
  const fromAcc = from ? icAccountsFor(from) : undefined;
  const toAcc = to ? icAccountsFor(to) : undefined;
  const currencies = Array.from(new Set([fromCo?.baseCurrency, toCo?.baseCurrency, 'USD', 'INR', 'AED'].filter(Boolean) as string[]));
  const rateFrom = from && currency && fromCo ? (currency === fromCo.baseCurrency ? 1 : engine.resolveRate(currency, fromCo.baseCurrency, date).rate) : 0;
  const rateTo = to && currency && toCo ? (currency === toCo.baseCurrency ? 1 : engine.resolveRate(currency, toCo.baseCurrency, date).rate) : 0;
  const periodFrom = from ? engine.postingCheck(date, from) : { ok: false, reason: 'Choose a company' };
  const periodTo = to ? engine.postingCheck(date, to) : { ok: true };
  const problems: string[] = [];
  if (from && to && from === to) problems.push('From and to must be different legal companies (FR-ORG-011)');
  if (!(amount > 0)) problems.push('Enter an amount');
  if (from && !rateFrom) problems.push(`No ${currency} → ${fromCo?.baseCurrency} rate on ${fmtDate(date)}`);
  if (to && !rateTo) problems.push(`No ${currency} → ${toCo?.baseCurrency} rate on ${fmtDate(date)}`);
  if (!periodFrom.ok) problems.push(`${companyName(from)}: ${periodFrom.reason}`);
  if (postCounterparty && !periodTo.ok) problems.push(`${companyName(to)}: ${periodTo.reason}`);
  if (fromAcc && (!fromAcc.receivable || !fromAcc.payable)) problems.push(`${companyName(from)} has no intercompany accounts`);
  if (toAcc && (!toAcc.receivable || !toAcc.payable)) problems.push(`${companyName(to)} has no intercompany accounts`);

  const preview = (side: 'from' | 'to') => {
    const a = side === 'from' ? fromAcc : toAcc;
    const cur = side === 'from' ? fromCo?.baseCurrency : toCo?.baseCurrency;
    const rate = side === 'from' ? rateFrom : rateTo;
    if (!a) return null;
    const rows = type === 'Invoice'
      ? side === 'from' ? [[a.receivable, 'Dr'], [a.sales, 'Cr']] : [[a.purchases, 'Dr'], [a.payable, 'Cr']]
      : type === 'Payment'
        ? side === 'from' ? [[a.payable, 'Dr'], [a.bank, 'Cr']] : [[a.bank, 'Dr'], [a.receivable, 'Cr']]
        : side === 'from' ? [[a.receivable, 'Dr'], [a.bank, 'Cr']] : [[a.bank, 'Dr'], [a.payable, 'Cr']];
    return (
      <Card padding={12}>
        <div style={{ fontWeight: 600 }}>{side === 'from' ? companyName(from) : companyName(to)} <span className="identifier" style={{ color: '#6E6E71' }}>{cur}</span></div>
        <table className="data-table dense" style={{ marginTop: 8 }}>
          <tbody>
            {rows.map(([acc, dc], i) => (
              <tr key={i}><td>{(acc as any)?.code ? <><span className="identifier">{(acc as any).code}</span> {(acc as any).name}</> : <span style={{ color: '#C0393F' }}>account missing</span>}</td><td className="right money">{dc === 'Dr' ? fmtMoney(amount, currency, { code: true }) : ''}</td><td className="right money">{dc === 'Cr' ? fmtMoney(amount, currency, { code: true }) : ''}</td></tr>
            ))}
            <tr style={{ fontWeight: 700 }}><td>In base @ {rate || '—'}</td><td className="right money" colSpan={2}>{rate ? fmtMoney(amount * rate, cur ?? 'INR', { code: true }) : '—'}</td></tr>
          </tbody>
        </table>
      </Card>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create intercompany transaction"
      subtitle="One balanced journal is posted in each company — never a single journal across both (FR-ORG-011)"
      width={820}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={problems.length > 0} reason={problems[0]} onClick={async () => { const d = await act(() => postIntercompany({ type, fromCompanyId: from, toCompanyId: to, amount, currency, date, reference, narration, postCounterparty }), 'Intercompany transaction posted in both companies'); if (d) onClose(); }}>Post intercompany transaction</Button></>}
    >
      <Banner tone="info">{IC_RULE}</Banner>
      <div className="grid-2">
        <SelectField label="From company" required value={from} onChange={setFrom} options={companies.map((c) => ({ value: c.id, label: `${c.tradeName} · ${c.country} · ${c.baseCurrency}` }))} help="Raises the receivable / settles the payable" />
        <SelectField label="To company" required value={to} onChange={setTo} options={companies.filter((c) => c.id !== from).map((c) => ({ value: c.id, label: `${c.tradeName} · ${c.country} · ${c.baseCurrency}` }))} help="Records the mirror payable / receipt" />
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <SelectField label="Type" required value={type} onChange={(v) => setType(v as IcDocType)} options={['Invoice', 'Payment', 'Journal']} help={type === 'Invoice' ? 'Sale by the from-company to the to-company' : type === 'Payment' ? 'From-company settles its intercompany payable' : 'Funding / recharge between the two'} />
        <SelectField label="Currency" required value={currency} onChange={setCurrency} options={currencies} />
        <NumberField label="Amount" required value={amount} onChange={setAmount} prefix={currency} />
      </div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div><label className="field-label">Date<span className="req">*</span></label><input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} />{!periodFrom.ok && <div className="field-error">{periodFrom.reason}</div>}</div>
        <TextField label="Counterparty reference" value={reference} onChange={setReference} placeholder="Auto-generated if left empty" help="Both sides are matched on this reference (FR-CNS-005)" />
      </div>
      <div style={{ marginTop: 12 }}><TextArea label="Narration" value={narration} onChange={setNarration} rows={2} placeholder="What is being charged / funded" /></div>
      <div style={{ marginTop: 12 }}>
        <CheckboxField checked={postCounterparty} onChange={setPostCounterparty} label={`Post the counterparty entry in ${companyName(to)} now`} help="Leave unticked if the other finance team books it themselves — the document stays Unmatched until they do." />
      </div>

      <div style={{ marginTop: 18 }}>
        <SectionLabel>Journals that will be posted</SectionLabel>
        <div className="grid-2" style={{ marginTop: 8 }}>
          {preview('from')}
          {postCounterparty ? preview('to') : <Card padding={12}><div style={{ fontWeight: 600 }}>{companyName(to)}</div><div style={{ fontSize: 12, color: '#8A4B0F', marginTop: 8 }}>No journal will be posted now. The intercompany document is created as Unmatched and appears in {companyName(to)}’s matching queue.</div></Card>}
        </div>
      </div>

      {problems.length > 0 && <Banner tone="warning">{problems.join(' · ')}</Banner>}
    </Drawer>
  );
}
