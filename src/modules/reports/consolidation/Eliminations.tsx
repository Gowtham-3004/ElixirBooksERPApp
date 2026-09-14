// Eliminations register across every consolidation run (FR-CNS-006).
import { useMemo, useState } from 'react';
import { C, nav, useCollection } from '../../../store';
import { Badge, Banner, Button, Card, ConfirmDialog, EmptyState, KpiTile, Money, PageHeader, Pill, RegisterPage, useAction, type Column } from '../../../components/ui';
import { fmtDate, fmtMoney, fmtPeriod } from '../../../lib/format';
import { companyName, setEliminationStatus } from './lib';
import type { ConsolidationRun, Elimination } from './types';

interface Row extends Elimination { runId: string; runNumber: string; runStatus: ConsolidationRun['status']; period: string; currency: string; frozen: boolean }

export function EliminationsRegister() {
  const runs = useCollection<ConsolidationRun>(C.consolidationRuns);
  const act = useAction();
  const [act1, setAct1] = useState<{ row: Row; to: 'Rejected' | 'Reversed' } | null>(null);

  const rows: Row[] = useMemo(
    () => runs.flatMap((r) => r.eliminations.map((e) => ({ ...e, runId: r.id, runNumber: `${r.number} v${r.runVersion}`, runStatus: r.status, period: r.period ?? r.to.slice(0, 7), currency: r.currency, frozen: r.status === 'Final' || r.status === 'Reversed' }))),
    [runs],
  );

  const cols: Column<Row>[] = [
    { key: 'run', label: 'Run', render: (r) => (<div><span className="identifier link">{r.runNumber}</span><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{fmtPeriod(r.period)} · {r.runStatus}</div></div>), value: (r) => r.runNumber },
    { key: 'pairRef', label: 'Pair', render: (r) => <span className="identifier">{r.pairRef}</span> },
    { key: 'kind', label: 'Kind', render: (r) => <Pill tone="neutral">{r.kind}</Pill> },
    { key: 'description', label: 'Description', render: (r) => (<div><div>{r.description}</div>{r.warning && <div style={{ fontSize: 11, color: 'var(--warn)' }}>{r.warning}</div>}</div>), value: (r) => r.description },
    { key: 'dr', label: 'Debit', render: (r) => (<div><span className="identifier">{r.drAccountCode}</span> {r.drAccountName}{r.drCompanyId && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{companyName(r.drCompanyId)}</div>}</div>), value: (r) => r.drAccountCode },
    { key: 'cr', label: 'Credit', render: (r) => (<div><span className="identifier">{r.crAccountCode}</span> {r.crAccountName}{r.crCompanyId && <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{companyName(r.crCompanyId)}</div>}</div>), value: (r) => r.crAccountCode },
    { key: 'amount', label: 'Amount', align: 'right', render: (r) => <Money value={r.amount} currency={r.currency} />, value: (r) => r.amount, total: (rs) => fmtMoney(rs.filter((x) => x.status === 'Accepted').reduce((a, b) => a + b.amount, 0), rs[0]?.currency ?? 'INR') },
    { key: 'fx', label: 'Difference', align: 'right', render: (r) => (Math.abs(r.fxDifference) < 0.005 ? '—' : <span title={`Booked to ${r.differenceAccountCode}`}><Money value={r.fxDifference} currency={r.currency} tone="auto" /></span>), value: (r) => r.fxDifference },
    { key: 'docs', label: 'Source docs', align: 'right', render: (r) => (r.sourceDocs.length ? String(r.sourceDocs.length) : '—'), value: (r) => r.sourceDocs.length },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Accepted' ? 'Approved' : r.status === 'Rejected' ? 'Rejected' : r.status === 'Reversed' ? 'Reversed' : 'Pending'}>{r.status}</Badge> },
    { key: 'actedBy', label: 'Decided by', render: (r) => (r.actedBy ? <div style={{ fontSize: 12 }}>{r.actedBy}<div style={{ color: 'var(--ink-3)' }}>{r.actedAt ? fmtDate(r.actedAt.slice(0, 10)) : ''}</div></div> : '—'), value: (r) => r.actedBy ?? '' },
  ];

  if (!rows.length) {
    return (
      <div className="page">
        <PageHeader title="Eliminations" subtitle="Intercompany balances and trading removed at group level — never from the source books (FR-CNS-006)" />
        <EmptyState title="No eliminations yet" description="Translate a consolidation run to have intercompany balances proposed for elimination." action={<Button variant="primary" onClick={() => nav.go('reports/consolidation/runs')}>Open consolidation runs</Button>} icon="✂" />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="grid-4">
        <KpiTile label="Eliminations" value={String(rows.length)} sub={`across ${new Set(rows.map((r) => r.runId)).size} run(s)`} />
        <KpiTile label="Accepted" value={String(rows.filter((r) => r.status === 'Accepted').length)} sub="Applied to the group statements" />
        <KpiTile label="Awaiting decision" value={String(rows.filter((r) => r.status === 'Proposed').length)} sub="Blocks finalization of its run" />
        <KpiTile label="Reversed / rejected" value={String(rows.filter((r) => r.status === 'Reversed' || r.status === 'Rejected').length)} sub="Every elimination stays reversible" />
      </div>
      <Banner tone="success">Eliminations exist only in the group book. Accepting, rejecting or reversing one never writes to, edits or deletes anything in a legal company’s journals (FR-CNS-006).</Banner>
      <RegisterPage
        title="Eliminations"
        subtitle="Proposed from matched intercompany documents; each one traceable to its source documents and reversible"
        entity="elimination"
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        dense
        searchKeys={['description', 'pairRef', 'drAccountCode', 'crAccountCode', 'runNumber']}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'proposed', label: 'Proposed', filter: (r) => r.status === 'Proposed' },
          { id: 'accepted', label: 'Accepted', filter: (r) => r.status === 'Accepted' },
          { id: 'closed', label: 'Rejected / reversed', filter: (r) => r.status === 'Rejected' || r.status === 'Reversed' },
        ]}
        onRowClick={(r) => nav.go(`reports/consolidation/runs/${r.runId}`)}
        rowClass={(r) => (r.status === 'Reversed' || r.status === 'Rejected' ? 'muted' : '')}
        rowActions={(r) => [
          { label: 'Open run', onClick: () => nav.go(`reports/consolidation/runs/${r.runId}`) },
          { label: 'Accept elimination', disabled: r.frozen || r.status !== 'Proposed', reason: r.frozen ? 'Run is frozen' : r.status !== 'Proposed' ? `Already ${r.status.toLowerCase()}` : undefined, onClick: () => act(() => setEliminationStatus(r.runId, r.id, 'Accepted'), 'Elimination accepted') },
          { label: r.status === 'Accepted' ? 'Reverse elimination' : 'Reject elimination', danger: true, disabled: r.frozen || (r.status !== 'Proposed' && r.status !== 'Accepted'), reason: r.frozen ? 'Run is frozen' : undefined, onClick: () => setAct1({ row: r, to: r.status === 'Accepted' ? 'Reversed' : 'Rejected' }) },
        ]}
      />
      <Card title="How an elimination is built">
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          For every ordered pair of companies the run reads the intercompany receivable of one side and the intercompany payable of the other, translates both into the consolidation currency at that company’s closing rate, and proposes <strong>Dr intercompany payable / Cr intercompany receivable</strong>. Any residue — because the two sides were booked at different rates, or a document is unmatched — is disclosed on its own difference line rather than hidden inside the elimination. Intercompany sales and purchases within the profit-and-loss range are proposed as a second elimination, and unrealised profit in intercompany stock can be added manually on the run.
        </div>
      </Card>
      <ConfirmDialog
        open={!!act1}
        onClose={() => setAct1(null)}
        title={act1?.to === 'Reversed' ? 'Reverse this elimination?' : 'Reject this elimination?'}
        statement={act1?.row.description}
        consequences={[
          { engine: 'Journal', text: 'Source documents and company journals are untouched', tone: 'success' },
          { engine: 'Workflow', text: 'The decision, reason and your name are recorded on the run', tone: 'info' },
        ]}
        reasonRequired
        confirmLabel={act1?.to === 'Reversed' ? 'Reverse elimination' : 'Reject elimination'}
        cancelLabel="Keep as is"
        onConfirm={async (reason) => { if (act1) await act(() => setEliminationStatus(act1.row.runId, act1.row.id, act1.to, reason), 'Elimination updated'); setAct1(null); }}
      />
    </div>
  );
}
