// Recurring journals (FR-ACC-017): definitions, template lines, "Generate now", history.
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Journal } from '../../store';
import { Badge, Button, ConfirmDialog, DateField, Drawer, EntityPicker, Money, RegisterPage, SelectField, TextArea, TextField, TwoLine, useAccountOptions, useToast } from '../../components/ui';
import { addDays, fmtDate, fmtDateTime, fmtMoney, fmtPeriod, round, today, uid } from '../../lib/format';
import { journalLink } from './lib';
import type { RecurringJournal, RecurringJournalLine } from './types';

function nextRunAfter(d: string, freq: RecurringJournal['frequency']): string {
  const dt = new Date(d + 'T00:00:00');
  const isMonthEnd = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate() === dt.getDate();
  const months = freq === 'Monthly' ? 1 : 3;
  const n = new Date(dt.getFullYear(), dt.getMonth() + months, isMonthEnd ? 0 : dt.getDate());
  if (isMonthEnd) n.setMonth(n.getMonth() + 1, 0);
  return n.toISOString().slice(0, 10);
}

/** Generate the next journal for a definition. Returns the created journal. */
export function generateRecurring(def: RecurringJournal, opts: { date?: string } = {}): Journal {
  const date = opts.date ?? def.nextRun;
  const narration = def.narration.replace('{period}', fmtPeriod(date.slice(0, 7))).replace('{date}', fmtDate(date));
  const mode = def.mode === 'Post' && engine.postingCheck(date).ok ? 'Posted' : 'Draft';
  const j = engine.postJournal({ date, lines: def.lines.map((l) => ({ accountId: l.accountId, dr: l.dr, cr: l.cr, partyType: l.partyType, partyId: l.partyId, partyName: l.partyName, dimensions: l.dimensions, narration: l.narration })), sourceType: 'Recurring Journal', sourceId: def.id, sourceNumber: def.code, narration, type: 'Recurring', status: mode, idempotencyKey: `recurring:${def.id}:${date}` });
  db.update<Journal>(C.journals, j.id, { recurringId: def.id });
  db.update<RecurringJournal>(C.recurringJournals, def.id, { nextRun: nextRunAfter(date, def.frequency), lastRunAt: new Date().toISOString(), runCount: def.runCount + 1, generatedIds: [...def.generatedIds, j.id], status: def.endDate && nextRunAfter(date, def.frequency) > def.endDate ? 'Ended' : def.status });
  engine.audit({ action: 'recurring.generated', objectType: 'Recurring Journal', objectId: def.id, objectNumber: def.code, detail: `${j.number} for ${fmtDate(date)} (${mode})`, correlationId: j.correlationId });
  return db.find<Journal>(C.journals, j.id)!;
}

export function RecurringRegister() {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<RecurringJournal>(C.recurringJournals).filter((r) => r.companyId === s.state.companyId);
  const journals = useCollection<Journal>(C.journals);
  const [editing, setEditing] = useState<RecurringJournal | null | 'new'>(null);
  const [gen, setGen] = useState<RecurringJournal | null>(null);
  const [history, setHistory] = useState<RecurringJournal | null>(null);
  const canEdit = s.can('accounting.journal.create');
  const amount = (r: RecurringJournal) => r.lines.reduce((x, l) => x + l.dr, 0);
  const due = (r: RecurringJournal) => r.status === 'Active' && r.nextRun <= today();
  return (
    <>
      <RegisterPage<RecurringJournal>
        title="Recurring journals"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${rows.filter(due).length} due for generation · FR-ACC-017`}
        entity="recurring journals"
        rows={rows}
        searchKeys={['code', 'name', 'narration']}
        tabs={[{ id: 'active', label: 'Active', filter: (r) => r.status === 'Active' }, { id: 'due', label: 'Due now', filter: due }, { id: 'paused', label: 'Paused / ended', filter: (r) => r.status !== 'Active' }, { id: 'all', label: 'All', filter: () => true }]}
        primaryAction={{ label: 'New definition', onClick: () => setEditing('new'), disabled: !canEdit, reason: canEdit ? undefined : 'Requires journal create permission' }}
        actions={<Button variant="secondary" disabled={!rows.some(due) || !canEdit} onClick={() => { let n = 0; db.transaction(() => rows.filter(due).forEach((r) => { try { generateRecurring(r); n++; } catch (e: any) { toast.error(`${r.code}: ${e.message}`); } })); if (n) toast.success(`${n} journal${n === 1 ? '' : 's'} generated`); }}>Generate all due</Button>}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => [
          { label: 'Generate now', onClick: () => setGen(r), disabled: !canEdit || r.status !== 'Active', reason: r.status !== 'Active' ? `Definition is ${r.status.toLowerCase()}` : undefined },
          { label: 'History', onClick: () => setHistory(r) },
          { label: 'Edit', onClick: () => setEditing(r), disabled: !canEdit },
          r.status === 'Active' ? { label: 'Pause', onClick: () => { db.update<RecurringJournal>(C.recurringJournals, r.id, { status: 'Paused' }); engine.audit({ action: 'recurring.paused', objectType: 'Recurring Journal', objectId: r.id, objectNumber: r.code }); }, disabled: !canEdit } : { label: 'Resume', onClick: () => { db.update<RecurringJournal>(C.recurringJournals, r.id, { status: 'Active' }); engine.audit({ action: 'recurring.resumed', objectType: 'Recurring Journal', objectId: r.id, objectNumber: r.code }); }, disabled: !canEdit },
        ]}
        columns={[
          { key: 'name', label: 'Definition', sortable: true, render: (r) => <TwoLine primary={r.name} secondary={r.code} mono /> },
          { key: 'frequency', label: 'Frequency' },
          { key: 'nextRun', label: 'Next run', sortable: true, render: (r) => <span style={{ color: due(r) ? '#8A4B0F' : undefined }}>{fmtDate(r.nextRun)}{due(r) ? ' · due' : ''}</span> },
          { key: 'mode', label: 'On run', render: (r) => (r.mode === 'Post' ? <Badge status="Posted">Auto-post</Badge> : <Badge status="Draft">Create draft</Badge>) },
          { key: 'amount', label: 'Amount', align: 'right', render: (r) => <Money value={amount(r)} currency={s.currency} /> },
          { key: 'runCount', label: 'Runs', align: 'right', render: (r) => <span className="link" onClick={(e) => { e.stopPropagation(); setHistory(r); }}>{r.runCount}</span> },
          { key: 'range', label: 'Validity', render: (r) => `${fmtDate(r.startDate)} → ${r.endDate ? fmtDate(r.endDate) : 'open'}` },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Paused' ? 'On Hold' : r.status === 'Ended' ? 'Closed' : r.status} /> },
        ]}
      />
      {editing && <RecurringForm def={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!gen} onClose={() => setGen(null)} title={gen ? `Generate ${gen.name} for ${fmtDate(gen.nextRun)}?` : ''} statement={gen?.mode === 'Post' ? 'The journal posts immediately if the period is open; otherwise it is saved as a draft.' : 'A draft journal is created for review and posting.'} confirmLabel="Generate journal" cancelLabel="Not now"
        consequences={gen ? [{ engine: 'Journal', text: `${gen.lines.length} lines · ${fmtMoney(amount(gen), s.currency)} · ${gen.mode === 'Post' ? 'posted' : 'draft'} · idempotent per definition and date` }, { engine: 'Numbering', text: gen.mode === 'Post' ? 'Next journal number allocated' : 'Draft number until posted' }] : []}
        onConfirm={() => { if (gen) { const j = generateRecurring(gen); toast.success(`${j.number} generated (${j.status})`, { label: 'Open', path: journalLink(j.id) }); } }} />
      <Drawer open={!!history} onClose={() => setHistory(null)} title={history ? `${history.name} — generated journals` : ''} width={640} footer={<Button variant="ghost" onClick={() => setHistory(null)}>Close</Button>}>
        {history && (
          <table className="data-table dense">
            <thead><tr><th>Journal</th><th>Date</th><th>Status</th><th className="right">Amount</th></tr></thead>
            <tbody>{history.generatedIds.map((id) => journals.find((j) => j.id === id)).filter(Boolean).map((j) => <tr key={j!.id} className="clickable" onClick={() => nav.go(journalLink(j!.id))}><td className="identifier link">{j!.number}</td><td>{fmtDate(j!.date)}</td><td><Badge status={j!.status} /></td><td className="right money">{fmtMoney(j!.totalDr, s.currency)}</td></tr>)}{!history.generatedIds.length && <tr><td colSpan={4} style={{ color: '#5F6368' }}>Nothing generated yet</td></tr>}</tbody>
          </table>
        )}
        {history?.lastRunAt && <div style={{ fontSize: 12, color: '#5F6368', marginTop: 10 }}>Last run {fmtDateTime(history.lastRunAt)}</div>}
      </Drawer>
    </>
  );
}

function RecurringForm({ def, onClose }: { def?: RecurringJournal; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const accounts = useAccountOptions();
  const rows = useCollection<RecurringJournal>(C.recurringJournals);
  const [v, setV] = useState<Omit<RecurringJournal, keyof import('../../store').BaseRecord>>(def ? { ...def, lines: def.lines.map((l) => ({ ...l })) } : { code: `RJ-${String(rows.length + 1).padStart(3, '0')}`, name: '', frequency: 'Monthly', startDate: today(), endDate: undefined, nextRun: today(), mode: 'Draft', narration: '', lines: [{ id: uid('rjl'), accountId: '', dr: 0, cr: 0 }, { id: uid('rjl'), accountId: '', dr: 0, cr: 0 }], status: 'Active', runCount: 0, generatedIds: [] });
  const [err, setErr] = useState<string | null>(null);
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const setLine = (id: string, p: Partial<RecurringJournalLine>) => set({ lines: v.lines.map((l) => (l.id === id ? { ...l, ...p } : l)) });
  const dr = round(v.lines.reduce((x, l) => x + (l.dr || 0), 0)), cr = round(v.lines.reduce((x, l) => x + (l.cr || 0), 0));
  const save = () => {
    if (!v.name.trim()) return setErr('Name is required');
    if (!v.narration.trim()) return setErr('Narration is required ({period} is replaced with the run month)');
    if (v.lines.length < 2 || v.lines.some((l) => !l.accountId)) return setErr('Every line needs an account and there must be at least two');
    if (v.lines.some((l) => (l.dr > 0) === (l.cr > 0))) return setErr('Each line must carry either a debit or a credit amount');
    if (Math.abs(dr - cr) > 0.005) return setErr(`Template is not balanced: Dr ${dr.toFixed(2)} ≠ Cr ${cr.toFixed(2)}`);
    const ctrl = v.lines.find((l) => { const a = db.find<any>(C.accounts, l.accountId); return a?.isControl && (a.controlType === 'AR' || a.controlType === 'AP') && !l.partyId; });
    if (ctrl) return setErr('Control accounts (AR/AP) need a party — use a manual journal for party postings');
    if (v.endDate && v.endDate < v.startDate) return setErr('End date must be after start date');
    const data = { ...v, nextRun: def ? v.nextRun : v.startDate };
    if (def) { db.update<RecurringJournal>(C.recurringJournals, def.id, data); engine.audit({ action: 'recurring.updated', objectType: 'Recurring Journal', objectId: def.id, objectNumber: def.code, before: { name: def.name, lines: def.lines.length }, after: { name: v.name, lines: v.lines.length } }); }
    else { const r = db.insert<RecurringJournal>(C.recurringJournals, data); engine.audit({ action: 'recurring.created', objectType: 'Recurring Journal', objectId: r.id, objectNumber: r.code, after: { name: r.name, frequency: r.frequency } }); }
    toast.success(`Recurring journal ${v.code} saved`);
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={def ? `Edit ${def.name}` : 'New recurring journal'} subtitle="Template lines are copied to a new journal on every run" width={820}
      footer={<><Button variant="ghost" onClick={onClose}>Discard changes</Button><Button variant="primary" onClick={save}>{def ? 'Save definition' : 'Create definition'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {err && <div className="banner danger">{err}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <TextField label="Code" value={v.code} onChange={(x) => set({ code: x.toUpperCase() })} />
          <TextField label="Name" required value={v.name} onChange={(x) => set({ name: x })} style={{ gridColumn: 'span 2' }} autoFocus />
          <SelectField label="Frequency" value={v.frequency} onChange={(x) => set({ frequency: x })} options={['Monthly', 'Quarterly']} />
          <DateField label="Start (first run)" value={v.startDate} onChange={(x) => set({ startDate: x, nextRun: def ? v.nextRun : x })} help="Month-end start dates recur on month-ends" />
          <DateField label="End" value={v.endDate ?? ''} onChange={(x) => set({ endDate: x || undefined })} />
          {def && <DateField label="Next run" value={v.nextRun} onChange={(x) => set({ nextRun: x })} />}
          <SelectField label="On run" value={v.mode} onChange={(x) => set({ mode: x })} options={[{ value: 'Draft', label: 'Create draft for review' }, { value: 'Post', label: 'Post automatically (if period open)' }]} />
          <SelectField label="Status" value={v.status} onChange={(x) => set({ status: x })} options={['Active', 'Paused', 'Ended']} />
        </div>
        <TextArea label="Narration template" required value={v.narration} onChange={(x) => set({ narration: x })} rows={2} help="Placeholders: {period} → run month, {date} → run date" />
        <div>
          <div className="section-title">Template lines</div>
          <table className="data-table dense">
            <thead><tr><th style={{ minWidth: 260 }}>Account</th><th className="right">Debit</th><th className="right">Credit</th><th>Narration</th><th /></tr></thead>
            <tbody>
              {v.lines.map((l) => (
                <tr key={l.id}>
                  <td><EntityPicker value={l.accountId || undefined} onChange={(x) => setLine(l.id, { accountId: x ?? '' })} options={accounts} size="grid" placeholder="Account…" /></td>
                  <td><input className="field-input grid num" type="number" step="0.01" value={l.dr || ''} onChange={(e) => setLine(l.id, { dr: Number(e.target.value), cr: Number(e.target.value) ? 0 : l.cr })} style={{ width: 130 }} /></td>
                  <td><input className="field-input grid num" type="number" step="0.01" value={l.cr || ''} onChange={(e) => setLine(l.id, { cr: Number(e.target.value), dr: Number(e.target.value) ? 0 : l.dr })} style={{ width: 130 }} /></td>
                  <td><input className="field-input grid" value={l.narration ?? ''} onChange={(e) => setLine(l.id, { narration: e.target.value })} /></td>
                  <td><Button size="sm" variant="ghost" onClick={() => set({ lines: v.lines.filter((x) => x.id !== l.id) })}>✕</Button></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td><Button size="sm" variant="secondary" onClick={() => set({ lines: [...v.lines, { id: uid('rjl'), accountId: '', dr: 0, cr: 0 }] })}>+ Add line</Button></td><td className="right money">{fmtMoney(dr, s.currency)}</td><td className="right money">{fmtMoney(cr, s.currency)}</td><td colSpan={2}>{Math.abs(dr - cr) < 0.005 && dr > 0 ? <Badge status="Approved">Balanced</Badge> : <Badge status="Returned">Difference {fmtMoney(dr - cr, s.currency)}</Badge>}</td></tr></tfoot>
          </table>
        </div>
        {def && def.generatedIds.length > 0 && <div style={{ fontSize: 12, color: '#5F6368' }}>{def.generatedIds.length} journal(s) generated so far · last {def.lastRunAt ? fmtDateTime(def.lastRunAt) : '—'} · next {fmtDate(v.nextRun)} ({addDays(v.nextRun, 0) <= today() ? 'due' : 'scheduled'})</div>}
      </div>
    </Drawer>
  );
}
