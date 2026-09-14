// Reconciliation workbench (FR-REC-003..006, design §6.9): two panes, suggestions, 1:n / n:1 match, unmatch, adjustments, confirm + BRS report.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { Account } from '../../store';
import { Button, Badge, Pill, SelectField, DateField, useToast, EmptyState, Banner, Drawer, Modal, TextArea, DataTable } from '../../components/ui';
import { fmtDate, fmtMoney, fmtDateTime, today } from '../../lib/format';
import type { StatementLine, Reconciliation } from './types';
import * as A from './actions';
import { useConfirm, DocLink } from '../purchase/shared';
import { VoucherForm } from './Vouchers';
import { ImportStatementWizard } from './Statements';

const monthStart = (d: string) => d.slice(0, 7) + '-01';
const monthEnd = (d: string) => { const x = new Date(d.slice(0, 7) + '-01T00:00:00'); x.setMonth(x.getMonth() + 1); x.setDate(0); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

export function ReconciliationWorkbench({ params, id }: { params: Record<string, string>; id?: string }) {
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const banks = A.cashBankAccounts();
  const allLines = useCollection<StatementLine>(C.statementLines);
  const journals = useCollection<any>(C.journals);
  const recs = useCollection<Reconciliation>(C.reconciliations);
  const [account, setAccount] = useState(params.account ?? banks.find((b) => b.isBank)?.id ?? banks[0]?.id ?? '');
  const latestStm = db.where<any>(C.bankStatements, (x) => x.bankAccountId === account).sort((a, b) => b.periodTo.localeCompare(a.periodTo))[0];
  const [from, setFrom] = useState(params.from ?? (latestStm ? monthStart(latestStm.periodFrom) : monthStart(today())));
  const [to, setTo] = useState(params.to ?? (latestStm ? monthEnd(latestStm.periodTo) : monthEnd(today())));
  const [selStm, setSelStm] = useState<Set<string>>(new Set());
  const [selBook, setSelBook] = useState<Set<string>>(new Set());
  const [adjust, setAdjust] = useState<Record<string, string> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [showReport, setShowReport] = useState<Reconciliation | undefined>(id ? recs.find((r) => r.id === id) : undefined);
  const acc = db.find<Account>(C.accounts, account);
  const cur = acc?.bankDetails?.currency ?? acc?.fixedCurrency ?? s.currency;
  const summary = useMemo(() => (account ? A.reconSummary(account, from, to) : undefined), [account, from, to, allLines, journals]);
  const lines = useMemo(() => allLines.filter((l) => l.bankAccountId === account && l.date >= from && l.date <= to).sort((a, b) => a.date.localeCompare(b.date)), [allLines, account, from, to]);
  const book = useMemo(() => (account ? A.bookEntries(account, { to }) : []), [account, to, journals, allLines]);
  const suggestions = useMemo(() => { const m = new Map<string, A.Suggestion>(); lines.filter((l) => l.status === 'Unmatched').forEach((l) => { const sg = A.suggestFor(l, book); if (sg) m.set(l.id, sg); }); return m; }, [lines, book]);
  const threshold = A.bankingSettings().reconAutoSuggestThreshold;
  const stmSel = lines.filter((l) => selStm.has(l.id));
  const bookSel = book.filter((b) => selBook.has(b.journalId));
  const stmAmt = stmSel.reduce((x, l) => x + l.credit - l.debit, 0);
  const bookAmt = bookSel.reduce((x, b) => x + b.amount, 0);
  const diff = Math.round((stmAmt - bookAmt) * 100) / 100;
  const run = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const doMatch = () => run(() => { A.matchLines(Array.from(selStm), Array.from(selBook)); setSelStm(new Set()); setSelBook(new Set()); }, `${stmSel.length}:${bookSel.length} matched`);
  const acceptSuggestion = (l: StatementLine) => { const sg = suggestions.get(l.id); if (!sg) return; run(() => A.matchLines([l.id], [sg.journalId], { note: `Suggested · ${sg.confidence}% · ${sg.reason}` }), 'Matched'); };
  const openAdjust = (l?: StatementLine) => { const amount = l ? Math.abs(l.credit - l.debit) : Math.abs(diff); const dir = l ? (l.credit > 0 ? 'in' : 'out') : diff > 0 ? 'in' : 'out'; const desc = (l?.description ?? '').toUpperCase(); const charges = /CHARGE|FEE|GST ON|COMMISSION/.test(desc); const interest = /INT\b|INTEREST/.test(desc); setAdjust({ type: dir === 'in' ? 'Receipt' : charges ? 'Withdrawal' : 'Payment', account, amount: String(amount), date: l?.date ?? to, narration: l ? `${l.description} · ${l.reference ?? ''}`.trim() : `Reconciliation difference ${from}→${to}`, ref: l?.reference ?? '', line: l?.id ?? '', counter: charges ? 'acc_5400' : interest ? 'acc_4110' : '' }); };
  const confirmRec = () => run(() => { const r = A.confirmReconciliation(account, from, to, notes); setConfirmOpen(false); setShowReport(r); }, 'Reconciliation confirmed');
  const confirmedForPeriod = recs.find((r) => r.bankAccountId === account && r.periodFrom <= from && r.periodTo >= to && r.status === 'Confirmed');
  const unexplained = summary ? Math.round((summary.statementBalance - summary.adjustedBook) * 100) / 100 : 0;
  if (showReport) return <BrsReport rec={showReport} onBack={() => { setShowReport(undefined); if (id) nav.go('banking/reconciliation'); }} />;
  return (
    <div className="page" style={{ gap: 12 }}>
      <div className="page-header">
        <div><h1 className="page-title">Reconciliation workbench</h1><div className="page-subtitle">{acc?.name ?? 'Choose an account'} · {fmtDate(from)} → {fmtDate(to)} · suggestions ≥ {threshold}% are highlighted; nothing posts without confirmation (FR-REC-004)</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <Button onClick={() => setImportOpen(true)}>Import statement</Button>
          <Button variant="primary" disabled={!summary || confirmedForPeriod !== undefined} reason={confirmedForPeriod ? `Confirmed as ${confirmedForPeriod.number}` : undefined} onClick={() => setConfirmOpen(true)}>Confirm reconciliation</Button>
        </div>
      </div>
      <div className="toolbar" style={{ gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <SelectField label="Account" size="sm" value={account} onChange={(v) => { setAccount(v); setSelStm(new Set()); setSelBook(new Set()); }} options={banks.map((b) => ({ value: b.id, label: b.name }))} style={{ minWidth: 260 }} />
        <DateField label="From" size="sm" value={from} onChange={setFrom} /><DateField label="To" size="sm" value={to} onChange={setTo} />
        <div style={{ flex: 1 }} />
        <Button size="sm" onClick={() => nav.go(`banking/reconciliation?account=${account}&list=1`)} disabled={!recs.some((r) => r.bankAccountId === account)} reason={!recs.some((r) => r.bankAccountId === account) ? 'No reconciliations yet' : undefined}>Past reconciliations</Button>
        <Button size="sm" onClick={() => nav.go('banking/settings')}>Suggestion settings</Button>
      </div>
      {params.list && <PastReconciliations account={account} onOpen={(r) => setShowReport(r)} />}
      {summary && (
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 20px', display: 'flex', gap: 32, alignItems: 'center' }}>
          <div className="section-label">{acc?.bankDetails?.bankName ?? acc?.name} {acc?.bankDetails ? `••••${acc.bankDetails.accountNumber.slice(-4)}` : ''} · {fmtDate(from)} – {fmtDate(to)}</div>
          {[{ label: 'Statement', val: fmtMoney(summary.statementBalance, cur) }, { label: 'Book', val: fmtMoney(summary.bookBalance, cur) }, { label: 'Difference', val: fmtMoney(summary.difference, cur), warn: Math.abs(summary.difference) > 0.01 }, { label: 'Unmatched', val: `${summary.unmatchedStatement.length} stmt · ${summary.unmatchedBook.length} book`, warn: summary.unmatchedStatement.length + summary.unmatchedBook.length > 0 }, { label: 'Unexplained', val: fmtMoney(unexplained, cur), warn: Math.abs(unexplained) > 0.01 }].map((it) => <div key={it.label}><div className="section-label" style={{ marginBottom: 2 }}>{it.label}</div><div style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: it.warn ? 'var(--warn)' : 'var(--ink)' }}>{it.val}</div></div>)}
          {confirmedForPeriod && <Badge status="Reconciled" style={{ marginLeft: 'auto' }}>Confirmed {confirmedForPeriod.number}</Badge>}
        </div>)}
      {!lines.length && <Banner tone="info" action={<Button variant="link" onClick={() => setImportOpen(true)}>Import statement</Button>}>No statement lines for {acc?.name} in this period. Import a statement or widen the dates.</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(470px, 1fr))', gap: 12, alignItems: 'start' }}>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 13 }}>Statement lines ({lines.length})</span><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{lines.filter((l) => l.status === 'Matched').length} matched · {lines.filter((l) => l.status === 'Unmatched').length} open</span></div>
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th style={{ width: 32 }} /><th>Date</th><th>Description</th><th className="right">Amount</th><th>Status</th><th style={{ width: 40 }} /></tr></thead>
              <tbody>{lines.map((l) => { const sg = suggestions.get(l.id); const sel = selStm.has(l.id); const open = l.status === 'Unmatched'; return (
                <tr key={l.id} className={sel ? 'selected' : ''} style={{ cursor: open ? 'pointer' : undefined, opacity: l.status === 'Excluded' ? 0.5 : 1 }} onClick={() => { if (!open) return; const n = new Set(selStm); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); setSelStm(n); }}>
                  <td onClick={(e) => e.stopPropagation()}>{open && <input type="checkbox" className="checkbox" checked={sel} onChange={() => { const n = new Set(selStm); if (n.has(l.id)) n.delete(l.id); else n.add(l.id); setSelStm(n); }} />}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{fmtDate(l.date)}</td>
                  <td><div className="identifier" style={{ fontSize: 12 }}>{l.description}</div><div className="identifier" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{l.reference}</div>{sg && open && <div style={{ marginTop: 3, display: 'flex', gap: 6, alignItems: 'center' }}><Pill tone={sg.confidence >= threshold ? 'good' : 'warning'}>Suggested · {sg.confidence >= 90 ? 'High' : sg.confidence >= threshold ? 'Medium' : 'Low'} {sg.confidence}%</Pill><span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{book.find((b) => b.journalId === sg.journalId)?.docNumber} · {sg.reason}</span><button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={(e) => { e.stopPropagation(); acceptSuggestion(l); }}>Match</button></div>}{l.status === 'Matched' && <div style={{ fontSize: 11, color: 'var(--good)', marginTop: 2 }}>↔ {l.matchedDocNumber}{l.matchConfidence ? ` · ${l.matchConfidence}%` : ''}{l.matchedBy ? ` · ${l.matchedBy}` : ''}</div>}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}><span className="money" style={{ color: l.credit ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(l.credit || l.debit, cur)} <span style={{ fontSize: 10 }}>{l.credit ? 'Cr' : 'Dr'}</span></span></td>
                  <td><Badge status={l.status === 'Excluded' ? 'Cancelled' : l.status} /></td>
                  <td onClick={(e) => e.stopPropagation()}>{l.status === 'Matched' ? <button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={() => confirm.open({ title: 'Unmatch this line?', statement: `${l.description} ↔ ${l.matchedDocNumber}`, reasonRequired: true, confirmLabel: 'Unmatch', cancelLabel: 'Keep match', onConfirm: (r) => { A.unmatchLine(l.id, r); toast.success('Unmatched'); } })}>Unmatch</button> : open ? <button type="button" className="btn-link" style={{ fontSize: 11, whiteSpace: 'nowrap' }} onClick={() => openAdjust(l)}>+ Adjust</button> : null}</td>
                </tr>); })}
              {lines.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-3)', height: 64 }}>No statement lines</td></tr>}</tbody>
            </table>
          </div>
        </div>
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontWeight: 600, fontSize: 13 }}>Book entries on {acc?.code} ({book.filter((b) => !b.cleared).length} uncleared)</span><Button size="sm" variant="ghost" onClick={() => openAdjust()} disabled={!selStm.size || Math.abs(diff) < 0.005} reason={!selStm.size ? 'Select statement lines' : Math.abs(diff) < 0.005 ? 'No difference' : undefined}>+ Create adjustment for difference</Button></div>
          <div style={{ maxHeight: 520, overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th style={{ width: 32 }} /><th>Date</th><th>Document</th><th className="right">Amount</th></tr></thead>
              <tbody>{book.filter((b) => !b.cleared || (b.date >= from && b.date <= to)).map((b) => { const sel = selBook.has(b.journalId); const suggestedFor = Array.from(suggestions.entries()).find(([, sg]) => sg.journalId === b.journalId); return (
                <tr key={b.journalId} className={sel ? 'selected' : ''} style={{ cursor: !b.cleared ? 'pointer' : undefined, opacity: b.cleared ? 0.6 : 1 }} onClick={() => { if (b.cleared) return; const n = new Set(selBook); if (n.has(b.journalId)) n.delete(b.journalId); else n.add(b.journalId); setSelBook(n); }}>
                  <td onClick={(e) => e.stopPropagation()}>{!b.cleared && <input type="checkbox" className="checkbox" checked={sel} onChange={() => { const n = new Set(selBook); if (n.has(b.journalId)) n.delete(b.journalId); else n.add(b.journalId); setSelBook(n); }} />}</td>
                  <td style={{ fontSize: 12, color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>{fmtDate(b.date)}</td>
                  <td><div><span className="identifier link" style={{ fontSize: 12 }} onClick={(e) => { e.stopPropagation(); nav.go(`accounting/journals/${b.journalId}`); }}>{b.docNumber}</span> <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{b.sourceType}</span></div><div style={{ fontSize: 11, color: 'var(--ink-4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{b.partyName ? `${b.partyName} · ` : ''}{b.narration}</div>{suggestedFor && !b.cleared && <div style={{ fontSize: 11, color: 'var(--info)' }}>← suggested for {lines.find((l) => l.id === suggestedFor[0])?.description}</div>}</td>
                  <td className="right" style={{ whiteSpace: 'nowrap' }}><span className="money" style={{ color: b.amount > 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(Math.abs(b.amount), cur)} <span style={{ fontSize: 10 }}>{b.amount > 0 ? 'Cr' : 'Dr'}</span></span><div>{b.cleared ? <Badge status="Matched">Cleared</Badge> : <Badge status="Unmatched">Open</Badge>}</div></td>
                </tr>); })}
              {book.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-3)', height: 64 }}>No postings on this account</td></tr>}</tbody>
            </table>
          </div>
        </div>
      </div>
      {(selStm.size > 0 || selBook.size > 0) && (
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 16, boxShadow: '0 -4px 16px rgba(0,0,0,0.06)' }}>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{selStm.size} statement line{selStm.size === 1 ? '' : 's'} ↔ {selBook.size} book entr{selBook.size === 1 ? 'y' : 'ies'}</span>
          <span style={{ fontSize: 14, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(stmAmt, cur)} {Math.abs(diff) < 0.005 ? '=' : '≠'} {fmtMoney(bookAmt, cur)}</span>
          {Math.abs(diff) >= 0.005 && <Pill tone="warning">Difference {fmtMoney(diff, cur)}</Pill>}
          <div style={{ flex: 1 }} />
          <Button onClick={() => { setSelStm(new Set()); setSelBook(new Set()); }}>Clear</Button>
          {Math.abs(diff) >= 0.005 && selStm.size > 0 && <Button onClick={() => openAdjust()}>Create adjustment</Button>}
          <Button variant="primary" disabled={!selStm.size || !selBook.size || Math.abs(diff) >= 0.005} reason={!selStm.size || !selBook.size ? 'Select both sides' : Math.abs(diff) >= 0.005 ? 'Amounts must be equal' : undefined} onClick={doMatch}>Match</Button>
        </div>)}
      {adjust && <Drawer open onClose={() => setAdjust(null)} title="Create adjustment voucher" subtitle="Bank charges, interest, or any unexplained line — posting creates the book entry; the statement line is then matched automatically" width={900}><VoucherForm prefill={adjust} onDone={(v) => { setAdjust(null); if (adjust.line && v.journalId) { try { A.matchLines([adjust.line], [v.journalId], { note: 'Adjustment voucher' }); toast.success('Adjustment posted and matched'); } catch (e: any) { toast.error(e.message); } } }} /></Drawer>}
      {importOpen && <ImportStatementWizard defaultAccount={account} onClose={() => setImportOpen(false)} />}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title={`Confirm reconciliation · ${acc?.name}`} description={`${fmtDate(from)} → ${fmtDate(to)}`} footer={<><Button onClick={() => setConfirmOpen(false)}>Not yet</Button><Button variant="primary" disabled={Math.abs(unexplained) > 0.01} reason={Math.abs(unexplained) > 0.01 ? `Unexplained ${fmtMoney(unexplained, cur)}` : undefined} onClick={confirmRec}>Confirm reconciliation</Button></>}>
        {summary && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div className="kv"><span className="k">Statement balance</span><span className="v">{fmtMoney(summary.statementBalance, cur)}</span><span className="k">Book balance</span><span className="v">{fmtMoney(summary.bookBalance, cur)}</span><span className="k">Uncleared book entries</span><span className="v">{summary.unmatchedBook.length} · {fmtMoney(summary.unmatchedBook.reduce((x, b) => x + b.amount, 0), cur)}</span><span className="k">Unmatched statement</span><span className="v">{summary.unmatchedStatement.length} · {fmtMoney(summary.unmatchedStatement.reduce((x, l) => x + l.credit - l.debit, 0), cur)}</span><span className="k">Adjusted book</span><span className="v">{fmtMoney(summary.adjustedBook, cur)}</span><span className="k">Unexplained</span><span className="v" style={{ color: Math.abs(unexplained) > 0.01 ? 'var(--danger)' : 'var(--good)' }}>{fmtMoney(unexplained, cur)}</span></div>
          {Math.abs(unexplained) > 0.01 ? <Banner tone="danger">Book ± timing differences must equal the statement balance. Match the remaining lines or create adjustments.</Banner> : <Banner tone="success">Book balance ± timing differences = statement balance. Unmatched items are recorded as timing differences on the reconciliation statement.</Banner>}
          <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
        </div>}
      </Modal>
      {confirm.dialog}
    </div>
  );
}

function PastReconciliations({ account, onOpen }: { account: string; onOpen: (r: Reconciliation) => void }) {
  const recs = useCollection<Reconciliation>(C.reconciliations).filter((r) => r.bankAccountId === account).sort((a, b) => b.periodTo.localeCompare(a.periodTo));
  if (!recs.length) return <EmptyState compact title="No reconciliations yet" />;
  return <DataTable rows={recs} dense columns={[{ key: 'number', label: 'BRS', render: (r) => <span className="identifier link">{r.number}</span> }, { key: 'period', label: 'Period', render: (r) => `${fmtDate(r.periodFrom)} → ${fmtDate(r.periodTo)}` }, { key: 'statementBalance', label: 'Statement', align: 'right', render: (r) => fmtMoney(r.statementBalance) }, { key: 'bookBalance', label: 'Book', align: 'right', render: (r) => fmtMoney(r.bookBalance) }, { key: 'timing', label: 'Timing items', render: (r) => r.unmatchedStatement.length + r.unmatchedBook.length }, { key: 'confirmedBy', label: 'Confirmed', render: (r) => r.confirmedAt ? `${fmtDateTime(r.confirmedAt)} · ${r.confirmedBy}` : '—' }, { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Confirmed' ? 'Reconciled' : 'Draft'}>{r.status}</Badge> }]} onRowClick={onOpen} />;
}

function BrsReport({ rec, onBack }: { rec: Reconciliation; onBack: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const s = useSession();
  const unStm = rec.unmatchedStatement.reduce((x, l) => x + l.amount, 0);
  const unBook = rec.unmatchedBook.reduce((x, b) => x + b.amount, 0);
  return (
    <div className="page">
      <div className="page-header no-print"><div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={onBack}>← Workbench</button><h1 className="page-title">Bank reconciliation statement · {rec.number}</h1><div className="page-subtitle">{rec.bankAccountName} · {fmtDate(rec.periodFrom)} → {fmtDate(rec.periodTo)} · {rec.status}{rec.confirmedAt ? ` · confirmed ${fmtDateTime(rec.confirmedAt)} by ${rec.confirmedBy}` : ''}</div></div><div style={{ display: 'flex', gap: 8 }}><Button onClick={() => window.print()}>Print</Button>{rec.status === 'Confirmed' && <Button variant="danger" disabled={!s.can('banking.*') && !s.can('banking.reconciliation.reopen')} onClick={() => confirm.open({ title: `Reopen ${rec.number}?`, reasonRequired: true, confirmLabel: 'Reopen reconciliation', danger: true, onConfirm: (r) => { A.reopenReconciliation(rec.id, r); toast.success('Reopened'); onBack(); } })}>Reopen</Button>}</div></div>
      <div className="print-sheet card" style={{ padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{s.company?.legalName}</div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>Bank reconciliation statement · {rec.bankAccountName} · as at {fmtDate(rec.periodTo)}</div>
        <table className="data-table dense" style={{ marginBottom: 16 }}>
          <tbody>
            <tr><td style={{ fontWeight: 600 }}>Balance as per books (ledger {rec.bankAccountName})</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(rec.bookBalance)}</td></tr>
            <tr><td colSpan={2} style={{ background: 'var(--surface-2)', fontWeight: 600 }}>Less: payments / entries in books not yet in bank statement ({rec.unmatchedBook.filter((b) => b.amount < 0).length})</td></tr>
            {rec.unmatchedBook.filter((b) => b.amount < 0).map((b) => <tr key={b.journalId}><td style={{ paddingLeft: 24 }}><DocLink path={`accounting/journals/${b.journalId}`} number={b.number} /> · {fmtDate(b.date)} · {b.narration}</td><td className="right money">{fmtMoney(b.amount)}</td></tr>)}
            <tr><td colSpan={2} style={{ background: 'var(--surface-2)', fontWeight: 600 }}>Add: receipts in books not yet in bank statement ({rec.unmatchedBook.filter((b) => b.amount > 0).length})</td></tr>
            {rec.unmatchedBook.filter((b) => b.amount > 0).map((b) => <tr key={b.journalId}><td style={{ paddingLeft: 24 }}><DocLink path={`accounting/journals/${b.journalId}`} number={b.number} /> · {fmtDate(b.date)} · {b.narration}</td><td className="right money">−{fmtMoney(b.amount)}</td></tr>)}
            <tr><td colSpan={2} style={{ background: 'var(--surface-2)', fontWeight: 600 }}>Add / less: bank entries not yet in books ({rec.unmatchedStatement.length})</td></tr>
            {rec.unmatchedStatement.map((l) => <tr key={l.id}><td style={{ paddingLeft: 24 }}>{fmtDate(l.date)} · {l.description}</td><td className="right money">{fmtMoney(l.amount)}</td></tr>)}
            <tr><td style={{ fontWeight: 600 }}>Balance as per bank statement</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(rec.statementBalance)}</td></tr>
            <tr><td>Check: books {fmtMoney(rec.bookBalance)} − uncleared book {fmtMoney(unBook)} + unmatched bank {fmtMoney(unStm)}</td><td className="right money">{fmtMoney(rec.bookBalance - unBook + unStm)}</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>Cleared in period: {rec.clearedCount} line(s) · {fmtMoney(rec.clearedAmount)} · {rec.notes ?? ''}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, fontSize: 12 }}><span>Prepared by {rec.confirmedBy ?? '—'}</span><span>Reviewed by ______________________</span></div>
      </div>
      {confirm.dialog}
    </div>
  );
}
