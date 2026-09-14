// New / edit manual journal (FR-ACC-010..014, FR-ACC-016). Lines grid with account, Dr/Cr, amount,
// party for control accounts, dimension chips, narration; running balance banner; templates;
// attachments; Save draft / Save & submit with inline validation and idempotency.
import { useEffect, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Account, Branch, Currency, Journal, Dimension, Attachment } from '../../store';
import { AttachmentsPanel, Badge, Button, DateField, EntityPicker, PageHeader, Segmented, SelectField, TextArea, TextField, useAccountOptions, useCustomerOptions, useEmployeeOptions, useSupplierOptions, useToast } from '../../components/ui';
import { fiscalYearOf, fmtMoney, today, uid } from '../../lib/format';
import { buildJournalLines, draftTotals, journalLink, linesFromJournal, newDraftLine, toPostLines, validateDraft, type LineIssue } from './lib';
import type { DraftLine } from './types';

const DIM_TYPES: { key: string; label: string }[] = [{ key: 'Department', label: 'Dept' }, { key: 'CostCentre', label: 'Cost centre' }, { key: 'Project', label: 'Project' }];

const TEMPLATES: { id: string; label: string; narration: string; lines: (defaults: any) => Partial<DraftLine>[] }[] = [
  { id: 'bank', label: 'Bank charges', narration: 'Bank charges — HDFC CA ****1234', lines: (d) => [{ accountId: 'acc_5400', side: 'Dr' }, { accountId: d?.bankAccountId ?? 'acc_1310', side: 'Cr' }] },
  { id: 'accrual', label: 'Accrual', narration: 'Provision for expenses not yet invoiced', lines: () => [{ accountId: 'acc_5530', side: 'Dr', dimensions: { Department: 'dim_dept_fin' } }, { accountId: 'acc_2100', side: 'Cr' }] },
  { id: 'dep', label: 'Depreciation', narration: 'Depreciation for the month (SLM)', lines: () => [{ accountId: 'acc_5300', side: 'Dr' }, { accountId: 'acc_1510', side: 'Cr' }] },
  { id: 'reclass', label: 'Reclass', narration: 'Reclassification of expense', lines: () => [{ accountId: 'acc_5510', side: 'Dr', dimensions: { Department: 'dim_dept_sales' } }, { accountId: 'acc_5590', side: 'Cr' }] },
];

export function JournalForm({ editId, fromId }: { editId?: string; fromId?: string }) {
  const s = useSession();
  const toast = useToast();
  const existing = useRecord<Journal>(C.journals, editId);
  const source = db.find<Journal>(C.journals, fromId);
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId && b.status === 'Active');
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active' && (s.company?.permittedCurrencies ?? []).includes(c.code));
  const dims = useCollection<Dimension>(C.dimensions).filter((d) => d.companyId === s.state.companyId && d.status === 'Active');
  const accountOpts = useAccountOptions();
  const custOpts = useCustomerOptions();
  const supOpts = useSupplierOptions();
  const empOpts = useEmployeeOptions();
  const base = existing ?? source;
  const [draftKey] = useState(() => editId ?? uid('jvd'));
  const [date, setDate] = useState(existing?.date ?? today());
  const [branchId, setBranchId] = useState(base?.branchId ?? s.state.branchId ?? '');
  const [currency, setCurrency] = useState(base?.currency ?? s.currency);
  const [rate, setRate] = useState(base?.rate ?? 1);
  const [rateInfo, setRateInfo] = useState<{ type: string; source: string } | null>(null);
  const [narration, setNarration] = useState(base ? (source && !existing ? `Copy of ${source.number}: ${source.narration}` : base.narration) : '');
  const [reference, setReference] = useState(base?.sourceNumber ?? '');
  const [lines, setLines] = useState<DraftLine[]>(base ? linesFromJournal(base).map((l) => ({ ...l, id: uid('dl') })) : [newDraftLine({ side: 'Dr' }), newDraftLine({ side: 'Cr' })]);
  const [issues, setIssues] = useState<LineIssue[]>([]);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const totals = draftTotals(lines);
  const canCreate = s.can('accounting.journal.create') || s.can('accounting.journal.edit');
  const canSubmit = s.can('accounting.journal.submit') || canCreate;
  const locked = existing && existing.status !== 'Draft' && existing.status !== 'Rejected' && (existing.status as string) !== 'Returned';

  useEffect(() => {
    if (currency === s.currency) { setRate(1); setRateInfo(null); return; }
    const r = engine.resolveRate(currency, s.currency, date);
    if (r.rate) { setRate(r.rate); setRateInfo({ type: r.type, source: r.source }); } else setRateInfo({ type: 'Missing', source: 'No approved rate — enter manually' });
  }, [currency, date, s.currency]);

  useEffect(() => { if (touched) setIssues(validateDraft({ date, lines, narration, currency, rate })); }, [date, lines, narration, currency, rate, touched]);

  const period = engine.postingCheck(date);
  const workflow = engine.resolveWorkflow('Journal', { amount: totals.dr, branchId });
  const update = (id: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const setAccount = (id: string, accountId?: string) => {
    const acc = db.find<Account>(C.accounts, accountId);
    update(id, { accountId: accountId ?? '', partyType: acc?.controlType === 'AR' ? 'Customer' : acc?.controlType === 'AP' ? 'Supplier' : acc?.controlType === 'Employee' ? 'Employee' : undefined, partyId: undefined, partyName: undefined });
  };
  const applyTemplate = (t: (typeof TEMPLATES)[number]) => { setNarration(narration || t.narration); setLines(t.lines(s.company?.defaults).map((l) => newDraftLine({ ...l, amount: 0 }))); };
  const balanceLine = (id: string) => { const l = lines.find((x) => x.id === id); if (!l) return; const others = draftTotals(lines.filter((x) => x.id !== id)); const diff = others.dr - others.cr; update(id, { side: diff > 0 ? 'Cr' : 'Dr', amount: Math.abs(diff) }); };
  const issueFor = (lineId: string, field: string) => issues.find((i) => i.lineId === lineId && i.field === field)?.message;

  const persist = (mode: 'draft' | 'submit') => {
    if (saving) return;
    setTouched(true);
    const found = validateDraft({ date, lines, narration, currency, rate, forPost: false });
    setIssues(found);
    if (found.length) { toast.error(`${found.length} issue${found.length === 1 ? '' : 's'} to fix before saving`); return; }
    setSaving(true);
    try {
      const live = lines.filter((l) => l.accountId || l.amount).map((l) => ({ ...l, partyName: l.partyId ? (l.partyType === 'Customer' ? custOpts : l.partyType === 'Supplier' ? supOpts : empOpts).find((o) => o.id === l.partyId)?.primary : undefined }));
      let j: Journal;
      if (existing) {
        const built = buildJournalLines(toPostLines(live), { rate, currency, branchId });
        j = db.update<Journal>(C.journals, existing.id, { date, period: date.slice(0, 7), fy: fiscalYearOf(date, s.company?.fiscalYearStartMonth ?? 4), branchId, currency, rate, lines: built.lines, totalDr: built.totalDr, totalCr: built.totalCr, narration, sourceNumber: reference || undefined, status: 'Draft' }, { expectedVersion: existing.version });
        engine.audit({ action: 'journal.updated', objectType: 'Journal', objectId: j.id, objectNumber: j.number, detail: `Draft edited · Dr ${j.totalDr} / Cr ${j.totalCr}`, correlationId: j.correlationId, before: { totalDr: existing.totalDr, narration: existing.narration }, after: { totalDr: j.totalDr, narration: j.narration } });
      } else {
        j = engine.postJournal({ date, branchId, currency, rate, lines: toPostLines(live), sourceType: 'Manual Journal', sourceNumber: reference || undefined, narration, type: 'Manual', status: 'Draft', idempotencyKey: `manual:${draftKey}` });
        db.where<Attachment>(C.attachments, (a) => a.objectId === draftKey).forEach((a) => db.update<Attachment>(C.attachments, a.id, { objectId: j.id }));
      }
      if (mode === 'submit') {
        const req = engine.submitForApproval({ docType: 'Journal', collection: C.journals, docId: j.id, docNumber: j.number, amount: j.totalDr, branchId, summary: narration });
        if (!req) { const chk = engine.postingCheck(date); if (chk.ok) { engine.postDraftJournal(j.id); toast.success('No workflow applies — journal posted'); } else toast.info(`Saved as draft — ${chk.reason}`); } else toast.success('Journal submitted for approval', { label: 'Approvals', path: 'approvals' });
      } else toast.success(existing ? 'Draft updated' : `Draft ${j.number} saved`);
      nav.go(journalLink(j.id));
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save journal');
      setSaving(false);
    }
  };

  if (editId && !existing) return <div className="page"><PageHeader title="Journal not found" back={{ label: 'Journals', path: 'accounting/journals' }} /></div>;
  if (locked) return <div className="page"><PageHeader title={`${existing!.number} cannot be edited`} subtitle={`Status ${existing!.status} — only drafts and returned journals are editable. Reverse a posted journal instead.`} back={{ label: 'Open journal', path: journalLink(existing!.id) }} /></div>;
  const headerIssues = issues.filter((i) => !i.lineId);
  const baseAmt = (amt: number) => (currency === s.currency ? null : <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>≈ {fmtMoney(amt * rate, s.currency)}</span>);
  return (
    <div className="page">
      <PageHeader back={{ label: 'Journals', path: existing ? journalLink(existing.id) : 'accounting/journals' }} title={existing ? `Edit ${existing.number}` : 'New manual journal'} subtitle={`${s.company?.tradeName} · ${branches.find((b) => b.id === branchId)?.name ?? ''} · ${workflow ? `Approval: ${workflow.name}` : 'No approval workflow — drafts post directly'}`}
        actions={<>
          <Button variant="secondary" onClick={() => nav.go(existing ? journalLink(existing.id) : 'accounting/journals')}>Discard</Button>
          <Button variant="secondary" onClick={() => persist('draft')} loading={saving} disabled={!canCreate} reason={canCreate ? undefined : 'Requires journal create permission'}>Save draft</Button>
          <Button variant="primary" onClick={() => persist('submit')} loading={saving} disabled={!canSubmit || (!workflow && !period.ok)} reason={!canSubmit ? 'Requires submit permission' : !workflow && !period.ok ? period.reason : undefined}>{workflow ? 'Save & submit for approval' : 'Save & post'}</Button>
        </>} />
      {!period.ok && <div className="banner warning">{period.reason} — you can still save a draft.</div>}
      {touched && headerIssues.length > 0 && <div className="banner danger">{headerIssues.length === 1 ? '1 issue' : `${headerIssues.length} issues`}: {headerIssues.map((i) => i.message).join(' · ')}</div>}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
          <DateField label="Business date" required value={date} onChange={setDate} checkPeriod error={touched ? issues.find((i) => i.field === 'date')?.message : undefined} />
          <SelectField label="Branch" value={branchId} onChange={setBranchId} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
          <SelectField label="Currency" value={currency} onChange={setCurrency} options={currencies.map((c) => ({ value: c.code, label: c.code }))} help={rateInfo ? `${rateInfo.type} · ${rateInfo.source}` : `Base currency ${s.currency}`} />
          <TextField label={`Rate (1 ${currency} = ? ${s.currency})`} value={String(rate)} onChange={(v) => setRate(Number(v) || 0)} disabled={currency === s.currency} error={touched ? issues.find((i) => i.field === 'rate')?.message : undefined} help={currency !== s.currency ? `Base equivalent of totals: ${fmtMoney(totals.dr * rate, s.currency)}` : undefined} />
          <TextArea label="Narration" required value={narration} onChange={setNarration} rows={2} style={{ gridColumn: 'span 3' }} error={touched ? issues.find((i) => i.field === 'narration')?.message : undefined} />
          <TextField label="Reference" value={reference} onChange={setReference} placeholder="Voucher / document ref" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, fontSize: 12, color: 'var(--ink-3)' }}>
          Templates: {TEMPLATES.map((t) => <button key={t.id} type="button" className="chip" onClick={() => applyTemplate(t)}>{t.label}</button>)}
        </div>
      </div>
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 32 }}>#</th><th style={{ minWidth: 260 }}>Account</th><th style={{ width: 110 }}>Dr / Cr</th><th style={{ width: 150 }} className="right">Amount ({currency})</th><th style={{ minWidth: 200 }}>Party</th>{DIM_TYPES.map((d) => <th key={d.key} style={{ minWidth: 130 }}>{d.label}</th>)}<th style={{ minWidth: 180 }}>Narration</th><th style={{ width: 70 }} /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const acc = db.find<Account>(C.accounts, l.accountId);
              const partyOpts = l.partyType === 'Customer' ? custOpts : l.partyType === 'Supplier' ? supOpts : l.partyType === 'Employee' ? empOpts : [];
              const hasIssue = issues.some((x) => x.lineId === l.id);
              return (
                <tr key={l.id} className={touched && hasIssue ? 'error-row' : ''}>
                  <td style={{ color: 'var(--ink-3)' }}>{i + 1}</td>
                  <td>
                    <EntityPicker value={l.accountId || undefined} onChange={(v) => setAccount(l.id, v)} options={accountOpts} size="grid" placeholder="Account…" error={touched ? issueFor(l.id, 'accountId') : undefined} />
                    {acc?.isControl && <div style={{ fontSize: 11, color: 'var(--warn)', marginTop: 2 }}>Control ({acc.controlType}) — {acc.controlType === 'AR' || acc.controlType === 'AP' || acc.controlType === 'Employee' ? 'party required' : 'sub-ledger driven'}</div>}
                    {acc && acc.requiredDimensions.filter((d) => d !== 'Branch').length > 0 && <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>Requires {acc.requiredDimensions.filter((d) => d !== 'Branch').join(', ')}</div>}
                  </td>
                  <td><Segmented value={l.side} onChange={(v) => update(l.id, { side: v })} options={['Dr', 'Cr']} /></td>
                  <td className="right">
                    <input className={`field-input grid num ${touched && issueFor(l.id, 'amount') ? 'error' : ''}`} type="number" step="0.01" min={0} value={l.amount || ''} onChange={(e) => update(l.id, { amount: Number(e.target.value) })} placeholder="0.00" />
                    {baseAmt(l.amount)}
                    {touched && issueFor(l.id, 'amount') && <div className="field-error">{issueFor(l.id, 'amount')}</div>}
                  </td>
                  <td>{l.partyType ? <EntityPicker value={l.partyId} onChange={(v, opt) => update(l.id, { partyId: v, partyName: opt?.primary })} options={partyOpts} size="grid" placeholder={`${l.partyType}…`} error={touched ? issueFor(l.id, 'partyId') : undefined} /> : <span style={{ color: 'var(--ink-5)', fontSize: 12 }}>—</span>}</td>
                  {DIM_TYPES.map((d) => {
                    const req = acc?.requiredDimensions.includes(d.key);
                    const pro = acc?.prohibitedDimensions.includes(d.key);
                    return (
                      <td key={d.key}>
                        {pro ? <span style={{ color: 'var(--ink-5)', fontSize: 12 }}>n/a</span> : (
                          <select className={`field-input grid ${touched && issueFor(l.id, d.key) ? 'error' : ''}`} value={l.dimensions?.[d.key] ?? ''} onChange={(e) => update(l.id, { dimensions: { ...(l.dimensions ?? {}), ...(e.target.value ? { [d.key]: e.target.value } : {}) , ...(e.target.value ? {} : Object.fromEntries(Object.entries(l.dimensions ?? {}).filter(([k]) => k !== d.key))) } })} style={{ borderColor: req && !l.dimensions?.[d.key] ? 'var(--warn-line)' : undefined }}>
                            <option value="">{req ? `${d.label} *` : '—'}</option>
                            {dims.filter((x) => x.type === d.key).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}
                          </select>
                        )}
                      </td>
                    );
                  })}
                  <td><input className="field-input grid" value={l.narration ?? ''} onChange={(e) => update(l.id, { narration: e.target.value })} placeholder="Line narration" /></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn-icon" title="Balance this line" onClick={() => balanceLine(l.id)}>⚖</button>
                    <button type="button" className="btn-icon" title="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}><Button size="sm" variant="secondary" onClick={() => setLines((ls) => [...ls, newDraftLine({ side: totals.diff > 0 ? 'Cr' : 'Dr', amount: Math.abs(totals.diff) || 0 })])}>+ Add line</Button></td>
              <td className="right">Dr {fmtMoney(totals.dr, currency, { code: currency !== s.currency })}<br />Cr {fmtMoney(totals.cr, currency, { code: currency !== s.currency })}</td>
              <td colSpan={6}>
                {Math.abs(totals.diff) < 0.005 && totals.dr > 0 ? <Badge status="Approved">Balanced · {fmtMoney(totals.dr, currency)}</Badge> : <Badge status="Returned">Difference {fmtMoney(totals.diff, currency)} — {totals.diff > 0 ? 'credit' : 'debit'} side short</Badge>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="card" style={{ padding: 18 }}>
        <div className="section-title">Attachments</div>
        <AttachmentsPanel objectType="Journal" objectId={existing?.id ?? draftKey} />
      </div>
    </div>
  );
}

