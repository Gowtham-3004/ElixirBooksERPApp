// Period close (FR-ACC-024, E2E-03): live checklist with drill-downs, soft-close / lock with reason, request reopen.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Account, ApprovalRequest, Journal, Period, StockMovement } from '../../store';
import { Badge, Button, CheckboxField, Checklist, ConfirmDialog, KpiTile, Money, PageHeader, ScopeLine, SelectField, useToast } from '../../components/ui';
import type { ChecklistRow } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import { journalLink, periodsOf, trialBalance } from './lib';

export function PeriodClosePage() {
  const s = useSession();
  const toast = useToast();
  const periods = periodsOf(s.state.companyId);
  const journals = useCollection<Journal>(C.journals).filter((j) => j.companyId === s.state.companyId);
  const salesInv = useCollection<any>(C.salesInvoices);
  const vendorInv = useCollection<any>(C.vendorInvoices);
  const stmtLines = useCollection<any>(C.statementLines);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const logs = useCollection<any>(C.integrationLogs);
  const moves = useCollection<StockMovement>(C.stockMovements);
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId);
  const [code, setCode] = useState(s.period?.code ?? periods.find((p) => p.status === 'Open')?.code ?? '');
  const period = periods.find((p) => p.code === code);
  const [ack, setAck] = useState(false);
  const [action, setAction] = useState<'soft' | 'lock' | 'reopen' | null>(null);
  const canClose = s.can('admin.periods.close') || s.can('admin.periods.*') || s.can('accounting.period.close') || s.can('accounting.*');
  const canLock = s.can('admin.periods.lock') || s.can('admin.periods.*') || s.can('accounting.period.lock') || s.can('accounting.*');
  const inPeriod = (d?: string) => !!period && !!d && d >= period.start && d <= period.end;

  const checks = useMemo(() => {
    if (!period) return { rows: [] as ChecklistRow[], blockers: 0 };
    const drafts = journals.filter((j) => inPeriod(j.date) && (j.status === 'Draft' || j.status === 'Submitted' || j.status === 'Approved'));
    const si = salesInv.filter((d) => (!d.companyId || d.companyId === s.state.companyId) && inPeriod(d.date) && (d.status === 'Draft' || d.status === 'Submitted' || d.status === 'Approved'));
    const vi = vendorInv.filter((d) => (!d.companyId || d.companyId === s.state.companyId) && inPeriod(d.date) && (d.status === 'Draft' || d.status === 'Submitted' || d.status === 'Approved' || d.status === 'Exception'));
    const unmatched = stmtLines.filter((l) => (!l.companyId || l.companyId === s.state.companyId) && inPeriod(l.date ?? l.valueDate) && (l.status === 'Unmatched' || l.status === 'Pending' || l.status === 'Unallocated'));
    const pend = approvals.filter((a) => (!a.companyId || a.companyId === s.state.companyId) && a.status === 'Pending' && inPeriod(a.submittedAt?.slice(0, 10)));
    const exc = logs.filter((l) => (!l.companyId || l.companyId === s.state.companyId) && inPeriod(l.at?.slice(0, 10)) && (l.status === 'Rejected' || l.status === 'Failed' || l.status === 'Timeout'));
    // stock vs ledger: inventory control accounts vs stock valuation as of period end
    const invAccounts = accounts.filter((a) => a.controlType === 'Inventory');
    const ledgerInv = invAccounts.reduce((x, a) => x + engine.accountBalance(a.id, { to: period.end }).net, 0);
    const items = Array.from(new Set(moves.filter((m) => m.date <= period.end).map((m) => m.itemId)));
    const stockVal = items.reduce((x, it) => x + engine.stockPosition(it, undefined, { asOf: period.end }).value, 0);
    const stockDiff = Math.round((ledgerInv - stockVal) * 100) / 100;
    const tb = trialBalance({ to: period.end });
    const rows: ChecklistRow[] = [
      { id: 'drafts', label: 'Unposted draft journals', status: drafts.length ? 'Blocked' : 'Done', count: drafts.length, detail: drafts.length ? `${drafts.slice(0, 3).map((d) => d.number).join(', ')}${drafts.length > 3 ? '…' : ''} — post or delete` : 'All journals dated in the period are posted', link: 'accounting/journals' },
      { id: 'si', label: 'Draft / submitted sales invoices', status: si.length ? 'Blocked' : 'Done', count: si.length, detail: si.length ? 'Post or cancel before closing' : 'No unposted sales invoices', link: 'sales/invoices' },
      { id: 'vi', label: 'Draft / submitted vendor invoices & match exceptions', status: vi.length ? 'Blocked' : 'Done', count: vi.length, detail: vi.length ? 'Resolve exceptions and post' : 'No unposted vendor invoices', link: 'purchase/vendor-invoices' },
      { id: 'bank', label: 'Unmatched bank statement lines', status: unmatched.length ? 'Warning' : 'Done', count: unmatched.length, detail: unmatched.length ? 'Reconcile in Banking' : 'Bank statements reconciled', link: 'banking/reconciliation' },
      { id: 'appr', label: 'Pending approvals', status: pend.length ? 'Warning' : 'Done', count: pend.length, detail: pend.length ? pend.slice(0, 3).map((a) => `${a.docType} ${a.docNumber}`).join(', ') : 'Approval inbox is clear for this period', link: 'approvals' },
      { id: 'int', label: 'Integration exceptions (e-invoice / e-way bill / bank)', status: exc.length ? 'Warning' : 'Done', count: exc.length, detail: exc.length ? exc.slice(0, 3).map((l) => `${l.provider} ${l.objectNumber ?? ''}: ${l.errorMessage ?? l.status}`).join(' · ') : 'No rejected or failed submissions', link: 'admin/integrations' },
      { id: 'stock', label: 'Stock valuation vs inventory ledger', status: Math.abs(stockDiff) < 1 ? 'Done' : 'Warning', detail: `Ledger ${fmtMoney(ledgerInv, s.currency)} vs stock ${fmtMoney(stockVal, s.currency)}${Math.abs(stockDiff) >= 1 ? ` — difference ${fmtMoney(stockDiff, s.currency)} (opening stock not loaded as movements or valuation entries pending)` : ' — reconciled'}`, link: 'inventory/stock' },
      { id: 'tb', label: 'Trial balance reconciles', status: tb.balanced ? 'Done' : 'Blocked', detail: tb.balanced ? `Dr ${fmtMoney(tb.totalDr, s.currency)} = Cr ${fmtMoney(tb.totalCr, s.currency)}` : `Dr ${fmtMoney(tb.totalDr, s.currency)} ≠ Cr ${fmtMoney(tb.totalCr, s.currency)}`, link: 'accounting/trial-balance' },
    ];
    return { rows, blockers: rows.filter((r) => r.status === 'Blocked').length, warnings: rows.filter((r) => r.status === 'Warning').length };
  }, [period, journals, salesInv, vendorInv, stmtLines, approvals, logs, moves, accounts, s.state.companyId, s.currency]);

  const blocked = checks.blockers > 0;
  const needsAck = !blocked && (checks as any).warnings > 0 && !ack;
  const setPeriodStatus = (status: Period['status'], actionLabel: string, reason: string) => {
    if (!period) return;
    const now = new Date().toISOString();
    db.update<Period>(C.periods, period.id, { status, lockedAt: status === 'Locked' || status === 'Soft Closed' ? now : period.lockedAt, lockedBy: status === 'Locked' || status === 'Soft Closed' ? s.user?.name : period.lockedBy, history: [...period.history, { at: now, by: s.user?.name ?? 'system', action: actionLabel, reason }] });
    engine.audit({ action: `period.${status.toLowerCase().replace(' ', '_')}`, objectType: 'Period', objectId: period.id, objectNumber: period.label, detail: reason, before: { status: period.status }, after: { status } });
    engine.notify({ type: 'system', title: `${period.label} ${actionLabel.toLowerCase()}`, body: reason, link: 'accounting/period-close' });
    toast.success(`${period.label} ${actionLabel.toLowerCase()}`);
  };
  const requestReopen = (reason: string) => {
    if (!period) return;
    const req = engine.submitForApproval({ docType: 'Period Reopen', collection: C.periods, docId: period.id, docNumber: period.label, amount: 0, summary: reason, skipStatusUpdate: true });
    if (req) { db.update<Period>(C.periods, period.id, { history: [...period.history, { at: new Date().toISOString(), by: s.user?.name ?? 'system', action: 'Reopen requested', reason }] }); toast.success(`Reopen request sent to ${req.steps[0]?.approverLabel}`, { label: 'Approvals', path: 'approvals' }); }
    else setPeriodStatus('Reopened', 'Reopened', reason);
  };
  const postedInPeriod = journals.filter((j) => inPeriod(j.date) && (j.status === 'Posted' || j.status === 'Reversed'));
  return (
    <div className="page">
      <PageHeader title="Period close" subtitle={<ScopeLine extra={period ? `${period.label} · ${period.status}` : 'Choose a period'} />} actions={<><Button variant="secondary" onClick={() => nav.go('admin/periods')}>Financial periods</Button><Button variant="secondary" onClick={() => nav.go('accounting/trial-balance')}>Trial balance</Button></>} />
      <div className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <SelectField label="Period" value={code} onChange={(v) => { setCode(v); setAck(false); }} options={periods.map((p) => ({ value: p.code, label: `${p.label} · ${p.status}` }))} size="sm" style={{ width: 240 }} />
        {period && <div style={{ display: 'flex', gap: 8, alignItems: 'center', paddingBottom: 6 }}><Badge status={period.status} /><span style={{ fontSize: 12, color: '#5F6368' }}>{fmtDate(period.start)} → {fmtDate(period.end)}{period.lockedAt ? ` · ${period.status === 'Locked' ? 'locked' : 'closed'} ${fmtDateTime(period.lockedAt)} by ${period.lockedBy}` : ''}</span></div>}
      </div>
      {period && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <KpiTile label="Posted journals" value={postedInPeriod.length} sub={<Money value={postedInPeriod.reduce((x, j) => x + j.totalDr, 0)} currency={s.currency} />} onClick={() => nav.go('accounting/day-book')} />
            <KpiTile label="Blockers" value={checks.blockers} sub={checks.blockers ? 'Must be resolved before close' : 'None'} deltaTone={checks.blockers ? 'bad' : 'good'} />
            <KpiTile label="Warnings" value={(checks as any).warnings ?? 0} sub="Can be acknowledged by Finance Admin" deltaTone={(checks as any).warnings ? 'neutral' : 'good'} />
            <KpiTile label="Status" value={period.status} sub={period.status === 'Locked' ? 'Posting disabled — request reopen' : period.status === 'Soft Closed' ? 'Only Finance Admin can post' : 'Open for posting'} />
          </div>
          <Checklist title={`Close checklist · ${period.label}`} rows={checks.rows} />
          {period.status !== 'Locked' && (checks as any).warnings > 0 && !blocked && <CheckboxField checked={ack} onChange={setAck} label="I acknowledge the warnings above and accept closing the period with them outstanding" help="Recorded in the audit trail with your name" />}
          <div className="card" style={{ padding: 16, display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#5F6368', marginRight: 'auto' }}>{blocked ? `${checks.blockers} blocker(s) — resolve them via the rows above` : needsAck ? 'Acknowledge warnings to enable closing' : 'Ready to close'}</span>
            {(period.status === 'Locked' || period.status === 'Soft Closed') && <Button variant="secondary" onClick={() => setAction('reopen')} disabled={!canClose}>Request reopen</Button>}
            {(period.status === 'Open' || period.status === 'Reopened') && <Button variant="secondary" onClick={() => setAction('soft')} disabled={!canClose || blocked || needsAck} reason={!canClose ? 'Requires period close permission' : blocked ? 'Blockers outstanding' : needsAck ? 'Acknowledge warnings first' : undefined}>Soft-close period</Button>}
            {period.status !== 'Locked' && <Button variant="danger" onClick={() => setAction('lock')} disabled={!canLock || blocked || needsAck} reason={!canLock ? 'Requires period lock permission' : blocked ? 'Blockers outstanding' : needsAck ? 'Acknowledge warnings first' : undefined}>Lock period</Button>}
          </div>
          {period.history.length > 0 && (
            <div className="card" style={{ padding: 16 }}>
              <div className="section-title">History</div>
              <table className="data-table dense"><thead><tr><th>When</th><th>Action</th><th>By</th><th>Reason</th></tr></thead><tbody>{[...period.history].reverse().map((h, i) => <tr key={i}><td>{fmtDateTime(h.at)}</td><td>{h.action}</td><td>{h.by}</td><td>{h.reason ?? '—'}</td></tr>)}</tbody></table>
            </div>
          )}
        </>
      )}
      <ConfirmDialog open={action === 'soft'} onClose={() => setAction(null)} title={`Soft-close ${period?.label}?`} statement="Operational users can no longer post into this period; Finance Admin can still post adjustments. Reversible by reopening." reasonRequired confirmLabel="Soft-close period" cancelLabel="Keep open"
        consequences={[{ engine: 'Journal', text: 'Back-posting by operational roles is refused with the period reason' }, { engine: 'Workflow', text: `${(checks as any).warnings ?? 0} warning(s) acknowledged by ${s.user?.name}` }, { engine: 'Notification', text: 'Finance team notified' }]}
        onConfirm={(reason) => setPeriodStatus('Soft Closed', 'Soft closed', reason + (ack ? ' · warnings acknowledged' : ''))} />
      <ConfirmDialog open={action === 'lock'} onClose={() => setAction(null)} title={`Lock ${period?.label}?`} statement="Locking disables all posting into the period, including Finance Admin. Reopening needs CFO approval (E2E-03)." danger reasonRequired confirmLabel="Lock period" cancelLabel="Keep period open"
        consequences={[{ engine: 'Journal', text: `${postedInPeriod.length} posted journals are frozen; drafts dated in the period can no longer be posted`, tone: 'danger' }, { engine: 'Statutory', text: 'GST / TDS returns for the period can be filed from Taxation' }, { engine: 'Workflow', text: 'Reopen requires the Period Reopen workflow (CFO)' }]}
        onConfirm={(reason) => setPeriodStatus('Locked', 'Locked', reason + (ack ? ' · warnings acknowledged' : ''))} />
      <ConfirmDialog open={action === 'reopen'} onClose={() => setAction(null)} title={`Request reopen of ${period?.label}?`} statement="A reopen request goes to the CFO. The period stays closed until approved; the decision and reason are audited." reasonRequired confirmLabel="Request reopen" cancelLabel="Keep closed"
        consequences={[{ engine: 'Workflow', text: 'Period Reopen workflow · CFO approval with comment' }, { engine: 'Notification', text: 'Approver notified; you are notified on decision' }]}
        onConfirm={(reason) => requestReopen(reason)} />
    </div>
  );
}
