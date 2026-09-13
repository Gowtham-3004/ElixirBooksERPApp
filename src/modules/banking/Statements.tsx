// Bank statements (FR-REC-001/002): register + import wizard (upload → map format → validate → commit) with saved formats per bank.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../store';
import type { Account } from '../../store';
import { RegisterPage, Button, Badge, TwoLine, Drawer, SelectField, TextField, MoneyField, CheckboxField, useToast, Banner, SummaryBlock, EmptyState, DataTable } from '../../components/ui';
import { fmtDate, fmtMoney, fmtDateTime, toCSV, downloadText } from '../../lib/format';
import type { BankStatement, StatementLine, StatementFormat } from './types';
import * as A from './actions';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => { const vals = split(l); return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ''])); });
}

const SAMPLE = [{ Date: '02/09/2026', Narration: 'NEFT ARLENE TRADERS INV/26-27/0118', 'Chq./Ref.No.': 'NEFT/090210/00518', 'Withdrawal Amt.': '', 'Deposit Amt.': '236000.00', 'Closing Balance': '' }, { Date: '05/09/2026', Narration: 'CHQ 041234 GLOBAL PACKAGING', 'Chq./Ref.No.': 'CHQ/041234', 'Withdrawal Amt.': '38080.00', 'Deposit Amt.': '', 'Closing Balance': '' }];

export function Statements({ id }: { id?: string }) {
  const rows = useCollection<BankStatement>(C.bankStatements);
  const lines = useCollection<StatementLine>(C.statementLines);
  const s = useSession();
  const [wizard, setWizard] = useState(id === 'new');
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.periodTo.localeCompare(a.periodTo));
  const sel = id && id !== 'new' ? mine.find((r) => r.id === id) : undefined;
  if (sel) {
    const ls = lines.filter((l) => l.statementId === sel.id).sort((a, b) => a.date.localeCompare(b.date));
    return (
      <div className="page">
        <div className="page-header"><div><button type="button" className="btn-link" style={{ color: '#5F6368' }} onClick={() => nav.go('banking/statements')}>← Statements</button><h1 className="page-title">{sel.fileName}</h1><div className="page-subtitle">{sel.bankAccountName} · {fmtDate(sel.periodFrom)} → {fmtDate(sel.periodTo)} · imported {fmtDateTime(sel.importedAt)} by {sel.importedBy} · format {sel.format?.name ?? '—'}</div></div><div style={{ display: 'flex', gap: 8 }}><Button onClick={() => downloadText(`${sel.fileName}`, toCSV(ls.map((l) => ({ date: l.date, description: l.description, reference: l.reference, debit: l.debit, credit: l.credit, balance: l.balance, status: l.status, matched: l.matchedDocNumber }))))}>Export lines</Button><Button variant="primary" onClick={() => nav.go(`banking/reconciliation?account=${sel.bankAccountId}&from=${sel.periodFrom}&to=${sel.periodTo}`)}>Reconcile</Button></div></div>
        <SummaryBlock items={[{ label: 'Opening', value: fmtMoney(sel.openingBalance, sel.currency) }, { label: 'Credits', value: fmtMoney(sel.totalCredit, sel.currency), tone: 'good' }, { label: 'Debits', value: fmtMoney(sel.totalDebit, sel.currency), tone: 'danger' }, { label: 'Closing', value: fmtMoney(sel.closingBalance, sel.currency) }, { label: 'Lines', value: `${ls.length} · ${ls.filter((l) => l.status === 'Matched').length} matched` }, { label: 'Fingerprint', value: <span className="identifier" style={{ fontSize: 11 }}>{sel.fingerprint}</span> }]} />
        <DataTable rows={ls} dense columns={[{ key: 'date', label: 'Date', render: (l) => fmtDate(l.date) }, { key: 'description', label: 'Description', render: (l) => <span className="identifier" style={{ fontSize: 12 }}>{l.description}</span> }, { key: 'reference', label: 'Reference', render: (l) => <span className="identifier" style={{ fontSize: 11, color: '#6E6E71' }}>{l.reference}</span> }, { key: 'debit', label: 'Debit', align: 'right', render: (l) => l.debit ? <span className="money" style={{ color: '#C0393F' }}>{fmtMoney(l.debit)}</span> : '—' }, { key: 'credit', label: 'Credit', align: 'right', render: (l) => l.credit ? <span className="money" style={{ color: '#12784E' }}>{fmtMoney(l.credit)}</span> : '—' }, { key: 'balance', label: 'Balance', align: 'right', render: (l) => <span className="money">{fmtMoney(l.balance ?? 0)}</span> }, { key: 'status', label: 'Match', render: (l) => <Badge status={l.status} /> }, { key: 'matchedDocNumber', label: 'Book entry', render: (l) => <span className="identifier" style={{ fontSize: 12 }}>{l.matchedDocNumber ?? '—'}</span> }]} />
      </div>
    );
  }
  return (
    <>
      <RegisterPage<BankStatement> title="Bank statements" subtitle={`${mine.length} imported · duplicate files and lines are blocked by fingerprint`} entity="statements" rows={mine} searchKeys={['fileName', 'bankAccountName']}
        columns={[
          { key: 'fileName', label: 'File', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link" style={{ fontSize: 13 }}>{r.fileName}</span>} secondary={r.format?.name} /> },
          { key: 'bankAccountName', label: 'Account', sortable: true }, { key: 'period', label: 'Period', render: (r) => `${fmtDate(r.periodFrom)} → ${fmtDate(r.periodTo)}` },
          { key: 'openingBalance', label: 'Opening', align: 'right', render: (r) => fmtMoney(r.openingBalance, r.currency) }, { key: 'closingBalance', label: 'Closing', align: 'right', render: (r) => fmtMoney(r.closingBalance, r.currency) },
          { key: 'lineCount', label: 'Lines', align: 'right', render: (r) => { const m = lines.filter((l) => l.statementId === r.id && l.status === 'Matched').length; return <span>{r.lineCount} <span style={{ color: '#5F6368', fontSize: 12 }}>({m} matched)</span></span>; } },
          { key: 'importedAt', label: 'Imported', sortable: true, render: (r) => <TwoLine primary={fmtDateTime(r.importedAt)} secondary={r.importedBy} /> },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Imported' ? 'Unmatched' : r.status === 'Partially Reconciled' ? 'Partial' : 'Reconciled'}>{r.status}</Badge> },
        ]}
        primaryAction={{ label: 'Import statement', onClick: () => setWizard(true), disabled: !s.can('banking.statement.import') && !s.can('banking.*'), reason: !s.can('banking.statement.import') && !s.can('banking.*') ? 'Requires banking.statement.import' : undefined }} onRowClick={(r) => nav.go(`banking/statements/${r.id}`)}
        rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`banking/statements/${r.id}`) }, { label: 'Reconcile', onClick: () => nav.go(`banking/reconciliation?account=${r.bankAccountId}&from=${r.periodFrom}&to=${r.periodTo}`) }]} />
      {wizard && <ImportStatementWizard onClose={() => { setWizard(false); if (id === 'new') nav.go('banking/statements'); }} />}
    </>
  );
}

export function ImportStatementWizard({ onClose, defaultAccount }: { onClose: () => void; defaultAccount?: string }) {
  const s = useSession();
  const toast = useToast();
  const banks = A.cashBankAccounts().filter((a) => a.isBank);
  const [step, setStep] = useState(0);
  const [account, setAccount] = useState(defaultAccount ?? banks[0]?.id ?? '');
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Record<string, string>[]>([]);
  const [text, setText] = useState('');
  const formats = A.savedFormats(account);
  const [fmt, setFmt] = useState<StatementFormat>(() => A.savedFormats(defaultAccount ?? banks[0]?.id)[0]);
  const [saveFormat, setSaveFormat] = useState(true);
  const [opening, setOpening] = useState<number>(0);
  const [closing, setClosing] = useState<number>(0);
  const acc = db.find<Account>(C.accounts, account);
  const currency = acc?.bankDetails?.currency ?? acc?.fixedCurrency ?? s.currency;
  const headers = raw.length ? Object.keys(raw[0]) : [];
  const parsed = useMemo(() => (raw.length && account ? A.parseStatementRows(raw, fmt, account) : []), [raw, fmt, account]);
  const good = parsed.filter((l) => !l.error && !l.duplicate);
  const computedClosing = Math.round((opening + good.reduce((x, l) => x + l.credit - l.debit, 0)) * 100) / 100;
  const fingerprint = A.fingerprintOf(text);
  const errors = useMemo(() => (parsed.length ? A.validateStatement(parsed, { bankAccountId: account, openingBalance: opening, closingBalance: closing, currency, fingerprint }) : []), [parsed, account, opening, closing, currency, fingerprint]);
  const warnings = useMemo(() => (parsed.length ? A.statementWarnings(parsed, { bankAccountId: account, openingBalance: opening }) : []), [parsed, account, opening]);
  const load = (t: string, name: string) => { setText(t); setFileName(name); const rows = parseCSV(t); setRaw(rows); const hs = rows.length ? Object.keys(rows[0]) : []; const match = formats.find((f) => [f.dateCol, f.descCol, f.debitCol, f.creditCol].every((c) => hs.includes(c))); if (match) setFmt(match); else setFmt({ ...fmt, dateCol: hs.find((h) => /date/i.test(h)) ?? fmt.dateCol, descCol: hs.find((h) => /narr|desc|remark|particular/i.test(h)) ?? fmt.descCol, refCol: hs.find((h) => /ref|chq|cheque|utr/i.test(h)) ?? fmt.refCol, debitCol: hs.find((h) => /withdraw|debit|dr/i.test(h)) ?? fmt.debitCol, creditCol: hs.find((h) => /deposit|credit|cr/i.test(h)) ?? fmt.creditCol, balanceCol: hs.find((h) => /balance/i.test(h)) ?? fmt.balanceCol }); const last = A.clearedBalance(account); setOpening(last); setStep(1); };
  const commit = () => { try { const stm = A.commitStatement(parsed, { bankAccountId: account, fileName, fingerprint, openingBalance: opening, closingBalance: closing, currency, format: saveFormat ? { ...fmt, name: fmt.name || `${acc?.bankDetails?.bankName ?? 'Bank'} CSV` } : fmt }); toast.success(`${stm.lineCount} lines imported`, { label: 'Reconcile', path: `banking/reconciliation?account=${account}&from=${stm.periodFrom}&to=${stm.periodTo}` }); onClose(); } catch (e: any) { toast.error(e.message); } };
  const steps = ['Upload', 'Map format', 'Validate', 'Commit'];
  const col = (label: string, key: keyof StatementFormat, required = true) => <SelectField key={key} label={label} required={required} value={(fmt[key] as string) ?? ''} onChange={(v) => setFmt({ ...fmt, [key]: v })} options={headers.map((h) => ({ value: h, label: h }))} placeholder="— Not mapped —" size="sm" />;
  return (
    <Drawer open onClose={onClose} title="Import bank statement" subtitle={steps.map((st, i) => (i === step ? `● ${st}` : `○ ${st}`)).join('   ')} width={860}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel import</Button><div style={{ display: 'flex', gap: 8 }}>{step > 0 && <Button onClick={() => setStep(step - 1)}>Back</Button>}{step === 1 && <Button variant="primary" disabled={!fmt.dateCol || !fmt.descCol || !fmt.debitCol || !fmt.creditCol} onClick={() => setStep(2)}>Validate</Button>}{step === 2 && <Button variant="primary" disabled={errors.length > 0 || !good.length} onClick={() => setStep(3)}>Review commit</Button>}{step === 3 && <Button variant="primary" disabled={errors.length > 0} onClick={commit}>Import {good.length} lines</Button>}</div></>}>
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SelectField label="Bank account" required value={account} onChange={(v) => { setAccount(v); setFmt(A.savedFormats(v)[0]); }} options={banks.map((b) => ({ value: b.id, label: `${b.name} · ${b.bankDetails?.currency ?? s.currency}` }))} help={acc ? `Book balance ${fmtMoney(A.accountBalance(acc.id).net, currency)} · last reconciled ${A.lastReconciliation(acc.id)?.periodTo ?? 'never'}` : undefined} />
          <label style={{ border: '2px dashed #DADCE0', borderRadius: 12, padding: 40, textAlign: 'center', cursor: 'pointer', color: '#5F6368' }}><input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; f.text().then((t) => load(t, f.name)); }} /><div style={{ fontSize: 28 }}>🏦</div><div style={{ fontSize: 14, color: '#0A0A0A', fontWeight: 500 }}>Drop the bank CSV here or click to choose</div><div style={{ fontSize: 12, marginTop: 4 }}>Saved formats: {formats.map((f) => f.name).join(' · ')}</div></label>
          <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={() => downloadText('statement-template.csv', toCSV(SAMPLE))}>Download template</Button><Button variant="ghost" onClick={() => load(toCSV(SAMPLE), 'sample-statement.csv')}>Load sample</Button></div>
          <Banner tone="info">Validation checks account & currency, date range, opening / closing continuity and duplicate fingerprints of the file and of each line before anything is written.</Banner>
        </div>)}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#5F6368' }}>{fileName} · {raw.length} rows · columns: {headers.join(', ')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <SelectField label="Saved format" value={formats.find((f) => f.name === fmt.name) ? fmt.name : ''} onChange={(v) => { const f = formats.find((x) => x.name === v); if (f) setFmt(f); }} options={formats.map((f) => ({ value: f.name, label: f.name }))} placeholder="Custom" size="sm" />
            <TextField label="Format name" value={fmt.name} onChange={(v) => setFmt({ ...fmt, name: v })} size="sm" />
            <SelectField label="Date format" value={fmt.dateFormat} onChange={(v) => setFmt({ ...fmt, dateFormat: v as StatementFormat['dateFormat'] })} options={['DD/MM/YYYY', 'DD-MM-YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']} size="sm" />
            {col('Date column', 'dateCol')}{col('Description column', 'descCol')}{col('Reference column', 'refCol', false)}{col('Debit (withdrawal) column', 'debitCol')}{col('Credit (deposit) column', 'creditCol')}{col('Balance column', 'balanceCol', false)}
          </div>
          <CheckboxField checked={saveFormat} onChange={setSaveFormat} label={`Remember this mapping for ${acc?.bankDetails?.bankName ?? 'this bank'}`} />
          <div className="card" style={{ overflow: 'auto', maxHeight: 220 }}><table className="data-table dense"><thead><tr><th>Date</th><th>Description</th><th>Reference</th><th className="right">Debit</th><th className="right">Credit</th></tr></thead><tbody>{parsed.slice(0, 8).map((l) => <tr key={l.row} className={l.error ? 'error-row' : ''}><td>{l.date || <span style={{ color: '#C0393F' }}>?</span>}</td><td>{l.description}</td><td className="identifier">{l.reference}</td><td className="right money">{l.debit || '—'}</td><td className="right money">{l.credit || '—'}</td></tr>)}</tbody></table></div>
        </div>)}
      {(step === 2 || step === 3) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <MoneyField label="Opening balance (per statement)" value={opening} onChange={setOpening} currency={currency} help={`Cleared book balance ${fmtMoney(A.clearedBalance(account), currency)} · book ${fmtMoney(A.accountBalance(account).net, currency)}`} />
            <MoneyField label="Closing balance (per statement)" value={closing} onChange={setClosing} currency={currency} help={`Computed from lines: ${fmtMoney(computedClosing, currency)}`} />
            <div style={{ display: 'flex', alignItems: 'flex-end' }}><Button size="sm" onClick={() => setClosing(computedClosing)}>Use computed closing</Button></div>
          </div>
          <SummaryBlock items={[{ label: 'Rows', value: parsed.length }, { label: 'Importable', value: good.length, tone: 'good' }, { label: 'Errors', value: parsed.filter((l) => l.error).length, tone: parsed.some((l) => l.error) ? 'danger' : undefined }, { label: 'Duplicates', value: parsed.filter((l) => l.duplicate).length, tone: parsed.some((l) => l.duplicate) ? 'warn' : undefined }, { label: 'Net movement', value: fmtMoney(good.reduce((x, l) => x + l.credit - l.debit, 0), currency) }]} />
          {warnings.map((w, i) => <Banner key={i} tone="warning">{w}</Banner>)}
          {errors.length > 0 ? <Banner tone="danger"><ul style={{ margin: 0, paddingLeft: 16 }}>{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></Banner> : <Banner tone="success">All checks passed — {good.length} line(s) ready to import{parsed.length - good.length ? `, ${parsed.length - good.length} skipped` : ''}.</Banner>}
          {parsed.some((l) => l.error || l.duplicate) && <div className="card" style={{ overflow: 'auto', maxHeight: 200 }}><table className="data-table dense"><thead><tr><th>Row</th><th>Issue</th></tr></thead><tbody>{parsed.filter((l) => l.error || l.duplicate).map((l) => <tr key={l.row} className={l.error ? 'error-row' : ''}><td>{l.row}</td><td style={{ color: l.error ? '#C0393F' : '#8A4B0F' }}>{l.error ?? l.duplicate}</td></tr>)}</tbody></table></div>}
          {step === 3 && <div style={{ fontSize: 13, color: '#3C4043' }}>Importing creates the statement <strong>{fileName}</strong> on <strong>{acc?.name}</strong> with {good.length} unmatched lines. Continue to the reconciliation workbench afterwards to match suggestions.</div>}
        </div>)}
      {raw.length === 0 && step > 0 && <EmptyState compact title="No rows parsed" />}
    </Drawer>
  );
}
