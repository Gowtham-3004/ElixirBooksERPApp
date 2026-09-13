// Journals register (FR-ACC-016): tabs by lifecycle state, filters, state-driven row actions.
import { useState } from 'react';
import { C, engine, nav, useCollection, useSession } from '../../store';
import type { Branch, Journal } from '../../store';
import { Badge, Button, ConfirmDialog, Money, RegisterPage, TwoLine, useToast } from '../../components/ui';
import { fmtDate, fmtMoney } from '../../lib/format';
import { journalLink, sourceLink } from './lib';

const TYPES: Journal['type'][] = ['Manual', 'Auto', 'Recurring', 'Opening', 'Reversal', 'Revaluation', 'Closing'];

export function JournalRegister() {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<Journal>(C.journals).filter((j) => j.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const branches = useCollection<Branch>(C.branches).filter((b) => b.companyId === s.state.companyId);
  const [reverse, setReverse] = useState<Journal | null>(null);
  const [del, setDel] = useState<Journal | null>(null);
  const canCreate = s.can('accounting.journal.create');
  const canPost = s.can('accounting.journal.post');
  const sources = Array.from(new Set(rows.map((j) => j.sourceType))).sort();
  const posted = rows.filter((j) => j.status === 'Posted');
  const doReverse = (j: Journal, reason: string) => { const rev = engine.reverseJournal(j.id, { reason }); toast.success(`${j.number} reversed by ${rev.number}`, { label: 'Open reversal', path: journalLink(rev.id) }); };
  return (
    <>
      <RegisterPage<Journal>
        title="Journals"
        subtitle={`${posted.length} posted · ${fmtMoney(posted.reduce((sum, j) => sum + j.totalDr, 0), s.currency)} debit turnover · ${s.company?.tradeName} · FY ${s.state.fy}`}
        entity="journals"
        rows={rows}
        searchKeys={['number', 'narration', 'sourceNumber', 'sourceType']}
        searchPlaceholder="Number, narration, source…"
        tabs={[{ id: 'all', label: 'All', filter: () => true }, { id: 'Draft', label: 'Draft', filter: (j) => j.status === 'Draft' }, { id: 'Submitted', label: 'Submitted', filter: (j) => j.status === 'Submitted' }, { id: 'Approved', label: 'Approved', filter: (j) => j.status === 'Approved' }, { id: 'Posted', label: 'Posted', filter: (j) => j.status === 'Posted' }, { id: 'Reversed', label: 'Reversed', filter: (j) => j.status === 'Reversed' }]}
        filters={[{ key: 'type', label: 'Type', type: 'select', options: TYPES.map((t) => ({ value: t, label: t })) }, { key: 'sourceType', label: 'Source', type: 'select', options: sources.map((x) => ({ value: x, label: x })) }, { key: 'date', label: 'Date', type: 'date-range' }, { key: 'branchId', label: 'Branch', type: 'select', options: branches.map((b) => ({ value: b.id, label: b.name })) }, { key: 'amount', label: 'Amount', type: 'amount-range' }]}
        applyFilter={(j, f) => (!f.type || j.type === f.type) && (!f.sourceType || j.sourceType === f.sourceType) && (!f.dateFrom || j.date >= f.dateFrom) && (!f.dateTo || j.date <= f.dateTo) && (!f.branchId || j.branchId === f.branchId) && (!f.amountMin || j.totalDr >= Number(f.amountMin)) && (!f.amountMax || j.totalDr <= Number(f.amountMax))}
        primaryAction={{ label: 'New journal', onClick: () => nav.go('accounting/journals/new'), disabled: !canCreate, reason: canCreate ? undefined : 'Requires journal create permission' }}
        actions={<><Button variant="secondary" onClick={() => nav.go('accounting/recurring')}>Recurring</Button><Button variant="secondary" onClick={() => nav.go('accounting/day-book')}>Day book</Button></>}
        onRowClick={(j) => nav.go(journalLink(j.id))}
        rowActions={(j) => {
          const a: { label: string; onClick: () => void; disabled?: boolean; reason?: string; danger?: boolean; separator?: boolean }[] = [{ label: 'Open', onClick: () => nav.go(journalLink(j.id)) }];
          if (j.status === 'Draft') a.push({ label: 'Edit', onClick: () => nav.go(`accounting/journals/${j.id}?edit=1`), disabled: !canCreate });
          if (j.status === 'Approved') a.push({ label: 'Post', onClick: () => { try { engine.postDraftJournal(j.id); toast.success(`${j.number} posted`); } catch (e: any) { toast.error(e.message); } }, disabled: !canPost, reason: canPost ? undefined : 'Requires post permission' });
          if (j.status === 'Posted') { const chk = engine.postingCheck(j.date); a.push({ label: 'Reverse', onClick: () => setReverse(j), disabled: !canPost || !chk.ok, reason: !canPost ? 'Requires post permission' : !chk.ok ? chk.reason : undefined }); }
          a.push({ label: 'Duplicate', onClick: () => nav.go(`accounting/journals/new?from=${j.id}`), disabled: !canCreate });
          const src = sourceLink(j);
          if (src) a.push({ label: `Open ${j.sourceType}`, onClick: () => nav.go(src) });
          if (j.status === 'Draft' || j.status === 'Rejected') a.push({ label: 'Delete draft', onClick: () => setDel(j), danger: true, separator: true, disabled: !canCreate });
          return a;
        }}
        columns={[
          { key: 'number', label: 'Number', sortable: true, render: (j) => <TwoLine primary={<span className="identifier link" style={{ fontWeight: 500 }}>{j.number}</span>} secondary={j.sourceNumber ? `${j.sourceType} ${j.sourceNumber}` : j.sourceType} /> },
          { key: 'date', label: 'Date', sortable: true, render: (j) => fmtDate(j.date) },
          { key: 'type', label: 'Type', render: (j) => <span className="pill pill-neutral">{j.type}</span> },
          { key: 'narration', label: 'Narration', render: (j) => <span style={{ display: 'block', maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={j.narration}>{j.narration}</span> },
          { key: 'branch', label: 'Branch', render: (j) => branches.find((b) => b.id === j.branchId)?.name ?? '—' },
          { key: 'totalDr', label: 'Debit', align: 'right', sortable: true, render: (j) => <Money value={j.totalDr} currency={s.currency} />, total: (rs) => <Money value={rs.reduce((x, j) => x + j.totalDr, 0)} currency={s.currency} /> },
          { key: 'totalCr', label: 'Credit', align: 'right', render: (j) => <Money value={j.totalCr} currency={s.currency} />, total: (rs) => <Money value={rs.reduce((x, j) => x + j.totalCr, 0)} currency={s.currency} /> },
          { key: 'currency', label: 'Ccy', render: (j) => (j.currency !== s.currency ? <span className="currency-tag" title={`@ ${j.rate}`}>{j.currency}</span> : <span style={{ color: '#B0B5BF' }}>{j.currency}</span>) },
          { key: 'status', label: 'Status', render: (j) => <Badge status={j.status} /> },
        ]}
        rowClass={(j) => (j.status === 'Reversed' || j.status === 'Rejected' ? 'muted' : undefined)}
      />
      <ConfirmDialog open={!!reverse} onClose={() => setReverse(null)} title={reverse ? `Reverse journal ${reverse.number}?` : ''} statement="This creates a linked reversal journal dated today and cannot be undone. The original stays in the ledger." danger reasonRequired confirmLabel="Reverse journal" cancelLabel="Keep journal"
        consequences={reverse ? [{ engine: 'Journal', text: `Opposite entries for ${reverse.lines.length} lines · Dr ${fmtMoney(reverse.totalCr, s.currency)} / Cr ${fmtMoney(reverse.totalDr, s.currency)}` }, { engine: 'Numbering', text: 'Next journal number is allocated to the reversal' }, ...(reverse.sourceId ? [{ engine: 'Open items', text: `Source ${reverse.sourceType} ${reverse.sourceNumber ?? ''} keeps its link; settle or cancel it separately`, tone: 'warning' as const }] : [])] : []}
        onConfirm={(reason) => { if (reverse) doReverse(reverse, reason); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={del ? `Delete draft ${del.number}?` : ''} statement="Drafts are the only journals that can be deleted. This is recorded in the audit trail." danger reasonRequired confirmLabel="Delete draft" cancelLabel="Keep draft"
        onConfirm={(reason) => { if (del) { engine.audit({ action: 'journal.deleted', objectType: 'Journal', objectId: del.id, objectNumber: del.number, detail: reason, before: { narration: del.narration, totalDr: del.totalDr } }); engine.db.remove(C.journals, del.id); toast.success('Draft deleted'); } }} />
    </>
  );
}
