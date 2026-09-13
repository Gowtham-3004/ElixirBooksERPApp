// Consolidation run detail: translate → adjust → eliminate → finalize / reverse
// (FR-CNS-002/003/004/006, FR-RPT-013). Legal books are only ever read.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../../store';
import type { Journal } from '../../../store';
import {
  Badge, Banner, Button, Card, ConfirmDialog, DataTable, Drawer, EmptyState, KV, KpiTile, Modal, Money, PageHeader, Pill,
  SelectField, NumberField, TextArea, SectionLabel, Tabs, Timeline, useAction, type Column,
} from '../../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtPeriod, today } from '../../../lib/format';
import {
  addManualElimination, booksSnapshot, companyName, consolidatedChart, finalizeRun, overrideRate, postAdjustment,
  postApprovedAdjustment, reverseAdjustment, reverseRun, runStatusTone, setEliminationStatus, translateRun,
} from './lib';
import type { ConsolidationJournal, ConsolidationRun, Elimination, Group, TranslatedLine } from './types';

type Tab = 'translation' | 'adjustments' | 'eliminations' | 'rates' | 'verification' | 'log';

export function RunPage({ id }: { id: string }) {
  const s = useSession();
  const run = useRecord<ConsolidationRun>(C.consolidationRuns, id);
  const group = useRecord<Group>(C.groups, run?.groupId);
  const adjustments = useCollection<ConsolidationJournal>(C.consolidationJournals).filter((j) => j.runId === id);
  const journals = useCollection<Journal>(C.journals);
  const act = useAction();
  const [tab, setTab] = useState<Tab>('translation');
  const [adjOpen, setAdjOpen] = useState(false);
  const [elimOpen, setElimOpen] = useState(false);
  const [rateEdit, setRateEdit] = useState<{ companyId: string; which: 'rateClosing' | 'rateAverage' | 'rateHistorical' } | null>(null);
  const [confirm, setConfirm] = useState<null | 'finalize' | 'reverse' | 'retranslate'>(null);
  const [rejectElim, setRejectElim] = useState<Elimination | null>(null);
  const [reverseAdj, setReverseAdj] = useState<ConsolidationJournal | null>(null);

  const live = useMemo(() => (run?.companies ?? []).filter((c) => c.included).map((c) => booksSnapshot(c.companyId)), [run, journals]);
  const consolidationInLegalBooks = useMemo(() => journals.filter((j) => j.type === 'Consolidation' || j.sourceType === 'Consolidation' || j.sourceType === 'Consolidation Adjustment').length, [journals]);

  if (!run || !group) return <div className="page"><EmptyState title="Run not found" description="It may have been removed by a data reset." action={<Button variant="primary" onClick={() => nav.go('reports/consolidation/runs')}>Back to runs</Button>} /></div>;

  const frozen = run.status === 'Final' || run.status === 'Reversed';
  const proposed = run.eliminations.filter((e) => e.status === 'Proposed');
  const accepted = run.eliminations.filter((e) => e.status === 'Accepted');
  const canAct = (s.can('reports.view') || s.isTenantOwner) && !frozen;

  const lineCols: Column<TranslatedLine>[] = [
    { key: 'company', label: 'Company', render: (l) => companyName(l.companyId), value: (l) => companyName(l.companyId) },
    { key: 'account', label: 'Account', render: (l) => (<div><span className="identifier">{l.accountCode}</span> {l.accountName}{l.note && <div style={{ fontSize: 11, color: '#6E6E71' }}>{l.note}</div>}</div>), value: (l) => l.accountCode },
    { key: 'type', label: 'Type', render: (l) => l.type },
    { key: 'src', label: 'Source amount', align: 'right', render: (l) => <Money value={l.sourceAmount} currency={l.sourceCurrency} code tone="auto" />, value: (l) => l.sourceAmount, total: (rows) => `${rows.length} lines` },
    { key: 'rateType', label: 'Rate type', render: (l) => <Pill tone={l.rateType === 'Average' ? 'neutral' : l.rateType === 'Historical' ? 'warning' : 'good'}>{l.rateType}</Pill> },
    { key: 'rate', label: 'Rate', align: 'right', render: (l) => (l.rate === 1 && l.rateType === 'Same' ? '—' : l.rate), value: (l) => l.rate },
    { key: 'ownership', label: 'Ownership', align: 'right', render: (l) => (l.ownershipFactor === 1 ? '100%' : `${Math.round(l.ownershipFactor * 100)}%`) },
    { key: 'translated', label: `Translated (${run.currency})`, align: 'right', render: (l) => <Money value={l.translatedAmount} currency={run.currency} tone="auto" />, value: (l) => l.translatedAmount, total: (rows) => <Money value={Math.round(rows.reduce((a, b) => a + b.translatedAmount, 0) * 100) / 100} currency={run.currency} tone="auto" /> },
  ];

  const chart = consolidatedChart(group);

  return (
    <div className="page">
      <PageHeader
        title={<>{run.number} {run.runVersion > 1 && <Pill tone="neutral">v{run.runVersion}</Pill>} <Badge status={runStatusTone(run.status)}>{run.status}</Badge></>}
        subtitle={<>{group.name} · {run.period ? fmtPeriod(run.period) : `${fmtDate(run.from)} – ${fmtDate(run.to)}`} · {run.currency} · {run.accountingStandard} · {run.plBasis === 'YTD' ? 'P&L year to date' : 'P&L for the range'}</>}
        back={{ label: 'Consolidation runs', path: 'reports/consolidation/runs' }}
        actions={<>
          <Button variant="secondary" onClick={() => nav.go('reports/consolidation/statements', { run: run.id })} disabled={!run.translatedLines.length} reason={!run.translatedLines.length ? 'Translate first' : undefined}>Translated statements</Button>
          {!frozen && <Button variant="secondary" onClick={() => setConfirm('retranslate')}>{run.translatedAt ? 'Re-translate' : 'Translate'}</Button>}
          {!frozen && <Button variant="primary" onClick={() => setConfirm('finalize')} disabled={!run.translatedLines.length || !!proposed.length} reason={!run.translatedLines.length ? 'Translate first' : proposed.length ? `${proposed.length} elimination(s) still proposed` : undefined}>Finalize run</Button>}
          {run.status === 'Final' && <Button variant="danger" onClick={() => setConfirm('reverse')}>Reverse run</Button>}
        </>}
      />

      <div className="grid-4">
        <KpiTile label="Translated lines" value={String(run.translatedLines.length)} sub={`${run.companies.filter((c) => c.included).length} companies`} />
        <KpiTile label={`Translation adjustment (CTA)`} value={fmtMoney(-run.cta, run.currency)} sub="Balancing figure, disclosed separately (FR-RPT-013)" deltaTone={run.cta === 0 ? 'neutral' : 'neutral'} />
        <KpiTile label="Eliminations" value={`${accepted.length} accepted`} sub={proposed.length ? `${proposed.length} awaiting decision` : 'None outstanding'} onClick={() => setTab('eliminations')} />
        <KpiTile label="Consolidation adjustments" value={String(adjustments.filter((a) => a.status === 'Posted').length)} sub="Never written to legal books (FR-CNS-004)" onClick={() => setTab('adjustments')} />
      </div>

      {run.status === 'Draft' && <Banner tone="info" action={<Button variant="link" onClick={() => setConfirm('retranslate')}>Translate now</Button>}>This run is a draft. Translating reads each company’s posted journals and converts them into {run.currency} at the rates below.</Banner>}
      {run.status === 'Reversed' && <Banner tone="warning">Reversed on {fmtDate((run.reversedAt ?? '').slice(0, 10))} — {run.reversalReason}. Every elimination and adjustment on this run was reversed with it; nothing changed in the legal books.</Banner>}
      {run.supersededById && <Banner tone="info" action={<Button variant="link" onClick={() => nav.go(`reports/consolidation/runs/${run.supersededById}`)}>Open newer version</Button>}>A newer version of this run exists (v{db.find<ConsolidationRun>(C.consolidationRuns, run.supersededById)?.runVersion ?? '—'}). This version is kept unchanged for audit.</Banner>}

      <Tabs
        tabs={[
          { id: 'translation', label: 'Translation', count: run.translatedLines.length },
          { id: 'eliminations', label: 'Eliminations', count: run.eliminations.length },
          { id: 'adjustments', label: 'Adjustments', count: adjustments.length },
          { id: 'rates', label: 'Rate disclosure' },
          { id: 'verification', label: 'Legal books untouched' },
          { id: 'log', label: 'Activity', count: run.log.length },
        ] as { id: Tab; label: string; count?: number }[]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'translation' && (
        run.translatedLines.length === 0
          ? <EmptyState title="Not translated yet" description="Translation keeps the source company, currency, amount, applied rate and translated amount for every line (FR-CNS-003)." action={<Button variant="primary" onClick={() => setConfirm('retranslate')}>Translate run</Button>} icon="🔁" />
          : (
            <>
              <Card padding={0}>
                <DataTable rows={run.translatedLines} columns={lineCols} dense showTotals totalsLabel="Sum of translated amounts = translation adjustment" maxHeight={520} stickyHeader
                  onRowClick={(l) => nav.go('reports/consolidation/drilldown', { run: run.id, company: l.companyId, code: l.accountCode })} />
              </Card>
              <Card title="Translation adjustment (CTA) by company — FR-RPT-013">
                <table className="data-table dense">
                  <thead><tr><th>Company</th><th>Base currency</th><th className="right">Closing</th><th className="right">Average</th><th className="right">Historical</th><th className="right">CTA ({run.currency})</th></tr></thead>
                  <tbody>
                    {run.companies.filter((c) => c.included).map((c) => (
                      <tr key={c.companyId}>
                        <td>{c.companyName}</td>
                        <td><span className="identifier">{c.baseCurrency}</span></td>
                        <td className="right money">{c.rateClosing.rate}</td>
                        <td className="right money">{c.rateAverage.rate}</td>
                        <td className="right money">{c.rateHistorical.rate}</td>
                        <td className="right money"><Money value={-(run.ctaByCompany?.[c.companyId] ?? 0)} currency={run.currency} tone="auto" /></td>
                      </tr>
                    ))}
                    <tr style={{ background: '#F9FBFC', fontWeight: 700 }}>
                      <td colSpan={5}>Total translation adjustment carried to the translation reserve</td>
                      <td className="right money"><Money value={-run.cta} currency={run.currency} tone="auto" /></td>
                    </tr>
                  </tbody>
                </table>
                <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 8 }}>A company whose base currency is already {run.currency} produces no translation adjustment. The reserve arises because income is translated at the average rate, assets and liabilities at closing and equity at historical rates.</div>
              </Card>
            </>
          )
      )}

      {tab === 'eliminations' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: '#5F6368' }}>Proposed from matched intercompany documents. Accepting one never touches the source books and can always be reversed (FR-CNS-006).</div>
            <Button variant="secondary" size="sm" onClick={() => setElimOpen(true)} disabled={!canAct} reason={frozen ? 'Run is frozen' : undefined}>Add elimination</Button>
          </div>
          {run.eliminations.length === 0
            ? <EmptyState title="No eliminations proposed" description="Translate the run to have intercompany balances and trading proposed for elimination." icon="✂" compact />
            : run.eliminations.map((e) => (
              <Card key={e.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 320 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge status={e.status === 'Accepted' ? 'Approved' : e.status === 'Rejected' ? 'Rejected' : e.status === 'Reversed' ? 'Reversed' : 'Pending'}>{e.status}</Badge>
                      <span className="identifier">{e.pairRef}</span>
                      <Pill tone="neutral">{e.kind}</Pill>
                    </div>
                    <div style={{ marginTop: 8, fontWeight: 600 }}>{e.description}</div>
                    <div style={{ marginTop: 8, fontSize: 13 }}>
                      <div>Dr <span className="identifier">{e.drAccountCode}</span> {e.drAccountName}{e.drCompanyId ? ` (${companyName(e.drCompanyId)})` : ''} — <span className="money">{fmtMoney(e.drAmount, run.currency)}</span></div>
                      <div>Cr <span className="identifier">{e.crAccountCode}</span> {e.crAccountName}{e.crCompanyId ? ` (${companyName(e.crCompanyId)})` : ''} — <span className="money">{fmtMoney(e.crAmount, run.currency)}</span></div>
                      {Math.abs(e.fxDifference) >= 0.005 && <div style={{ color: '#8A4B0F' }}>Difference {fmtMoney(e.fxDifference, run.currency)} → <span className="identifier">{e.differenceAccountCode}</span></div>}
                    </div>
                    {e.warning && <div style={{ marginTop: 8 }}><Pill tone="warning">{e.warning}</Pill></div>}
                    {e.reason && <div style={{ marginTop: 6, fontSize: 12, color: '#6E6E71' }}>{e.reason}{e.actedBy ? ` — ${e.actedBy}` : ''}</div>}
                    {e.sourceDocs.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <SectionLabel>Source documents ({e.sourceDocs.length})</SectionLabel>
                        <table className="data-table dense" style={{ marginTop: 4 }}>
                          <thead><tr><th>Document</th><th>Type</th><th>Date</th><th className="right">Amount</th><th>Match</th></tr></thead>
                          <tbody>{e.sourceDocs.map((d) => (
                            <tr key={d.id} className="clickable" onClick={() => nav.go('reports/consolidation/intercompany', { doc: d.id })}>
                              <td><span className="identifier link">{d.number}</span></td><td>{d.type}</td><td>{fmtDate(d.date)}</td>
                              <td className="right money">{fmtMoney(d.amount, d.currency, { code: true })}</td><td><Badge status={d.matchStatus === 'Matched' ? 'Matched' : d.matchStatus === 'Difference' ? 'Variance' : 'Unmatched'}>{d.matchStatus}</Badge></td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    <div className="money" style={{ fontSize: 18, fontWeight: 700 }}>{fmtMoney(e.amount, run.currency)}</div>
                    {e.status === 'Proposed' && <>
                      <Button variant="primary" size="sm" disabled={!canAct} reason={frozen ? 'Run is frozen' : undefined} onClick={() => act(() => setEliminationStatus(run.id, e.id, 'Accepted'), 'Elimination accepted')}>Accept elimination</Button>
                      <Button variant="secondary" size="sm" disabled={!canAct} onClick={() => setRejectElim(e)}>Reject</Button>
                    </>}
                    {e.status === 'Accepted' && <Button variant="secondary" size="sm" disabled={!canAct} reason={frozen ? 'Run is frozen' : undefined} onClick={() => setRejectElim(e)}>Reverse elimination</Button>}
                  </div>
                </div>
              </Card>
            ))}
        </>
      )}

      {tab === 'adjustments' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13, color: '#5F6368' }}>Consolidation journals live in their own book. They are never written to Acme or Acme Gulf journals and always require a reason plus workflow (FR-CNS-004).</div>
            <Button variant="secondary" size="sm" onClick={() => setAdjOpen(true)} disabled={!canAct || !run.translatedLines.length} reason={frozen ? 'Run is frozen' : !run.translatedLines.length ? 'Translate first' : undefined}>New consolidation adjustment</Button>
          </div>
          {adjustments.length === 0
            ? <EmptyState title="No consolidation adjustments" description="Use one to align accounting policies, book goodwill or record non-controlling interests at group level." icon="📘" compact />
            : adjustments.map((j) => (
              <Card key={j.id} padding={14}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 320 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="identifier">{j.number}</span><Badge status={j.status} /><span style={{ fontSize: 12, color: '#5F6368' }}>{fmtDate(j.date)}</span></div>
                    <div style={{ marginTop: 6, fontWeight: 600 }}>{j.reason}</div>
                    <table className="data-table dense" style={{ marginTop: 8 }}>
                      <thead><tr><th>Account</th><th>Narration</th><th className="right">Dr</th><th className="right">Cr</th></tr></thead>
                      <tbody>
                        {j.lines.map((l) => (<tr key={l.id}><td><span className="identifier">{l.accountCode}</span> {l.accountName}</td><td style={{ color: '#5F6368' }}>{l.narration ?? '—'}</td><td className="right money">{l.dr ? fmtMoney(l.dr, j.currency) : '—'}</td><td className="right money">{l.cr ? fmtMoney(l.cr, j.currency) : '—'}</td></tr>))}
                        <tr style={{ background: '#F9FBFC', fontWeight: 700 }}><td colSpan={2}>Total</td><td className="right money">{fmtMoney(j.totalDr, j.currency)}</td><td className="right money">{fmtMoney(j.totalCr, j.currency)}</td></tr>
                      </tbody>
                    </table>
                    {j.workflowNote && <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 8 }}>{j.workflowNote}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
                    {j.approvalId && <Button variant="secondary" size="sm" onClick={() => nav.go('approvals', { id: j.approvalId })}>Open approval</Button>}
                    {j.status === 'Approved' && <Button variant="primary" size="sm" onClick={() => act(() => postApprovedAdjustment(j.id), 'Adjustment posted to the group book')}>Post adjustment</Button>}
                    {j.status === 'Posted' && <Button variant="secondary" size="sm" disabled={!canAct} reason={frozen ? 'Run is frozen' : undefined} onClick={() => setReverseAdj(j)}>Reverse adjustment</Button>}
                  </div>
                </div>
              </Card>
            ))}
        </>
      )}

      {tab === 'rates' && (
        <Card title="Rate disclosure (FR-RPT-013, FR-CNS-003)" padding={0}>
          <table className="data-table dense">
            <thead><tr><th>Company</th><th>Pair</th><th>Rate type</th><th className="right">Rate</th><th>Source</th><th>Effective</th><th /></tr></thead>
            <tbody>
              {run.companies.filter((c) => c.included).flatMap((c) => ([
                ['rateClosing', 'Closing', c.rateClosing] as const,
                ['rateAverage', 'Average', c.rateAverage] as const,
                ['rateHistorical', 'Historical', c.rateHistorical] as const,
              ].map(([which, label, i]) => (
                <tr key={c.companyId + which}>
                  <td>{c.companyName}</td>
                  <td><span className="identifier">{c.baseCurrency} → {run.currency}</span></td>
                  <td>{label}</td>
                  <td className="right money">{i.rate}{i.overridden && <Pill tone="warning">overridden</Pill>}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{i.type} · {i.source}{i.note ? <div style={{ color: '#8A4B0F' }}>{i.note}</div> : null}{i.overridden ? <div style={{ color: '#8A4B0F' }}>was {i.overridden.original} — {i.overridden.reason} ({i.overridden.by})</div> : null}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{fmtDateTime(i.at)}</td>
                  <td className="right">{c.baseCurrency === run.currency ? '—' : <Button variant="link" size="sm" disabled={frozen} onClick={() => setRateEdit({ companyId: c.companyId, which })}>Override</Button>}</td>
                </tr>
              ))))}
            </tbody>
          </table>
          <div style={{ padding: 12, fontSize: 12, color: '#6E6E71' }}>Every rate used by this run is stored on the run itself, so a finalized run always reproduces the same statements even if the rate master changes later.</div>
        </Card>
      )}

      {tab === 'verification' && (
        <>
          <Banner tone={consolidationInLegalBooks === 0 ? 'success' : 'danger'}>
            {consolidationInLegalBooks === 0
              ? 'Verified: no consolidation journal exists in any legal company’s books. Translation, eliminations and consolidation adjustments are held in the group book only (FR-CNS-004/006, FR-FX-014).'
              : `${consolidationInLegalBooks} journal(s) of type Consolidation were found in legal books — this must never happen.`}
          </Banner>
          <Card title="Trial-balance totals of each legal company" padding={0}>
            <table className="data-table dense">
              <thead><tr><th>Company</th><th className="right">Journals at translation</th><th className="right">Total Dr at translation</th><th className="right">{run.status === 'Final' ? 'Journals at finalization' : 'Journals now'}</th><th className="right">{run.status === 'Final' ? 'Total Dr at finalization' : 'Total Dr now'}</th><th>Result</th></tr></thead>
              <tbody>
                {run.companies.filter((c) => c.included).map((c) => {
                  const pre = run.booksAtTranslate.find((b) => b.companyId === c.companyId);
                  const post = (run.status === 'Final' ? run.booksAtFinal : live)?.find((b) => b.companyId === c.companyId) ?? live.find((b) => b.companyId === c.companyId);
                  const same = pre && post && pre.journals === post.journals && Math.abs(pre.totalDr - post.totalDr) < 0.011;
                  return (
                    <tr key={c.companyId}>
                      <td>{c.companyName} <span className="identifier" style={{ color: '#6E6E71' }}>{c.baseCurrency}</span></td>
                      <td className="right money">{pre ? pre.journals : '—'}</td>
                      <td className="right money">{pre ? fmtMoney(pre.totalDr, c.baseCurrency) : '—'}</td>
                      <td className="right money">{post ? post.journals : '—'}</td>
                      <td className="right money">{post ? fmtMoney(post.totalDr, c.baseCurrency) : '—'}</td>
                      <td>{!pre ? <Pill tone="neutral">Baseline on first translation</Pill> : same ? <Pill tone="good">Unchanged</Pill> : <Pill tone="warning">{(post?.journals ?? 0) - pre.journals} journal(s) posted by the company itself</Pill>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: 12, fontSize: 12, color: '#6E6E71' }}>
              A difference here only ever comes from the company’s own operational postings (sales, purchases, payroll…), never from consolidation. {run.status === 'Final' ? 'A finalized run keeps the figures it was finalized with; create a new version to pick up later postings.' : 'Re-translate to pick them up.'}
            </div>
          </Card>
          <Card title="Group book (never part of legal books)" padding={0}>
            <table className="data-table dense">
              <thead><tr><th>Artefact</th><th className="right">Count</th><th>Stored in</th></tr></thead>
              <tbody>
                <tr><td>Consolidation adjustments</td><td className="right">{adjustments.length}</td><td><span className="identifier">consolidationJournals</span></td></tr>
                <tr><td>Eliminations</td><td className="right">{run.eliminations.length}</td><td><span className="identifier">consolidationRuns[].eliminations</span></td></tr>
                <tr><td>Translated lines</td><td className="right">{run.translatedLines.length}</td><td><span className="identifier">consolidationRuns[].translatedLines</span></td></tr>
                <tr><td>Journals written to legal companies</td><td className="right">{consolidationInLegalBooks}</td><td><span className="identifier">journals</span></td></tr>
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'log' && (
        <Card title="Activity">
          <Timeline items={run.log.slice().reverse().map((l) => ({ type: l.action === 'Finalized' ? 'success' : l.action === 'Reversed' ? 'warning' : 'info', event: l.action, predicate: l.by, time: fmtDateTime(l.at), note: l.detail }))} />
        </Card>
      )}

      <AdjustmentDrawer open={adjOpen} run={run} chart={chart} onClose={() => setAdjOpen(false)} />
      <ManualEliminationModal open={elimOpen} run={run} chart={chart} onClose={() => setElimOpen(false)} />

      <Modal open={!!rateEdit} onClose={() => setRateEdit(null)} title="Override translation rate" description="The original rate, the new rate and your reason are recorded on the run and in the audit trail (FR-RPT-013).">
        {rateEdit && <RateOverrideForm run={run} companyId={rateEdit.companyId} which={rateEdit.which} onDone={() => setRateEdit(null)} />}
      </Modal>

      <ConfirmDialog
        open={confirm === 'retranslate'}
        onClose={() => setConfirm(null)}
        title={run.translatedAt ? `Re-translate ${run.number}?` : `Translate ${run.number}?`}
        statement={`Reads the posted journals of ${run.companies.filter((c) => c.included).map((c) => c.companyName).join(' and ')} up to ${fmtDate(run.to)} and converts them into ${run.currency}.`}
        consequences={[
          { engine: 'Journal', text: 'Legal-company journals are read only — nothing is written to them', tone: 'success' },
          { engine: 'Journal', text: 'Previously translated lines and proposed eliminations are replaced', tone: 'warning' },
          { engine: 'Notification', text: 'The translation and the rates used are written to the audit trail', tone: 'info' },
        ]}
        confirmLabel={run.translatedAt ? 'Re-translate run' : 'Translate run'}
        cancelLabel="Keep as is"
        onConfirm={async () => { await act(() => translateRun(run.id), 'Run translated'); setConfirm(null); }}
      />
      <ConfirmDialog
        open={confirm === 'finalize'}
        onClose={() => setConfirm(null)}
        title={`Finalize ${run.number} v${run.runVersion}?`}
        statement="Freezes the translated lines, rates, eliminations and adjustments of this run. Re-running the same period later creates a new version and keeps this one."
        consequences={[
          { engine: 'Workflow', text: `Status becomes Final · version ${run.runVersion} is kept for audit`, tone: 'info' },
          { engine: 'Journal', text: 'A fresh check confirms every legal company’s books are unchanged since translation', tone: 'success' },
          { engine: 'Notification', text: 'Finance users are notified that the group figures are final', tone: 'info' },
        ]}
        confirmLabel="Finalize run"
        cancelLabel="Keep open"
        onConfirm={async () => { await act(() => finalizeRun(run.id), 'Run finalized'); setConfirm(null); }}
      />
      <ConfirmDialog
        open={confirm === 'reverse'}
        onClose={() => setConfirm(null)}
        title={`Reverse ${run.number}?`}
        statement="Marks the run and everything on it as reversed. The figures stay visible for audit; they simply no longer represent the group position."
        consequences={[
          { engine: 'Journal', text: 'Accepted eliminations and posted adjustments on this run are reversed', tone: 'warning' },
          { engine: 'Journal', text: 'Acme and Acme Gulf books are not touched — they never held these entries', tone: 'success' },
        ]}
        reasonRequired
        danger
        confirmLabel="Reverse run"
        cancelLabel="Keep run final"
        onConfirm={async (reason) => { await act(() => reverseRun(run.id, reason), 'Run reversed'); setConfirm(null); }}
      />
      <ConfirmDialog
        open={!!rejectElim}
        onClose={() => setRejectElim(null)}
        title={rejectElim?.status === 'Accepted' ? 'Reverse this elimination?' : 'Reject this elimination?'}
        statement={rejectElim?.description}
        consequences={[
          { engine: 'Journal', text: 'Source documents and company journals are untouched — eliminations exist only in the group book', tone: 'success' },
          { engine: 'Workflow', text: 'The decision, your reason and your name are recorded on the run', tone: 'info' },
        ]}
        reasonRequired
        confirmLabel={rejectElim?.status === 'Accepted' ? 'Reverse elimination' : 'Reject elimination'}
        cancelLabel="Keep as is"
        onConfirm={async (reason) => { if (rejectElim) await act(() => setEliminationStatus(run.id, rejectElim.id, rejectElim.status === 'Accepted' ? 'Reversed' : 'Rejected', reason), 'Elimination updated'); setRejectElim(null); }}
      />
      <ConfirmDialog
        open={!!reverseAdj}
        onClose={() => setReverseAdj(null)}
        title={`Reverse ${reverseAdj?.number}?`}
        statement={reverseAdj?.reason}
        consequences={[{ engine: 'Journal', text: 'A mirror consolidation journal is created in the group book; the original is kept', tone: 'info' }, { engine: 'Journal', text: 'No legal-company journal is affected', tone: 'success' }]}
        reasonRequired
        confirmLabel="Reverse adjustment"
        cancelLabel="Keep adjustment"
        onConfirm={async (reason) => { if (reverseAdj) await act(() => reverseAdjustment(reverseAdj.id, reason), 'Adjustment reversed'); setReverseAdj(null); }}
      />
    </div>
  );
}

function RateOverrideForm({ run, companyId, which, onDone }: { run: ConsolidationRun; companyId: string; which: 'rateClosing' | 'rateAverage' | 'rateHistorical'; onDone: () => void }) {
  const c = run.companies.find((x) => x.companyId === companyId)!;
  const act = useAction();
  const [rate, setRate] = useState(c[which].rate);
  const [reason, setReason] = useState('');
  return (
    <>
      <KV items={[
        { k: 'Company', v: `${c.companyName} · ${c.baseCurrency} → ${run.currency}` },
        { k: 'Rate type', v: which.replace('rate', '') },
        { k: 'Current', v: `${c[which].rate} (${c[which].type} · ${c[which].source})` },
      ]} />
      <div style={{ marginTop: 12 }}><NumberField label="New rate" value={rate} onChange={setRate} decimals={4} min={0} /></div>
      <div style={{ marginTop: 12 }}><TextArea label="Reason" required value={reason} onChange={setReason} rows={2} placeholder="Why does the group use a different rate than the published one?" /></div>
      <div className="modal-footer" style={{ padding: '16px 0 0' }}>
        <Button variant="secondary" onClick={onDone}>Keep published rate</Button>
        <Button variant="primary" disabled={reason.trim().length < 10} reason={reason.trim().length < 10 ? 'A reason of at least 10 characters is required' : undefined} onClick={async () => { const r = await act(() => overrideRate(run.id, companyId, which, rate, reason), 'Rate overridden — re-translate to apply'); if (r) onDone(); }}>Override rate</Button>
      </div>
    </>
  );
}

function AdjustmentDrawer({ open, run, chart, onClose }: { open: boolean; run: ConsolidationRun; chart: ReturnType<typeof consolidatedChart>; onClose: () => void }) {
  const act = useAction();
  const [date, setDate] = useState(run.to);
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState([{ code: '', dr: 0, cr: 0, narration: '' }, { code: '', dr: 0, cr: 0, narration: '' }]);
  const key = String(open);
  const [seen, setSeen] = useState(key);
  if (seen !== key) { setSeen(key); setDate(run.to); setReason(''); setRows([{ code: '', dr: 0, cr: 0, narration: '' }, { code: '', dr: 0, cr: 0, narration: '' }]); }
  const totalDr = Math.round(rows.reduce((s, r) => s + (r.dr || 0), 0) * 100) / 100;
  const totalCr = Math.round(rows.reduce((s, r) => s + (r.cr || 0), 0) * 100) / 100;
  const balanced = Math.abs(totalDr - totalCr) < 0.011 && totalDr > 0;
  const submit = async () => {
    const out = await act(() => postAdjustment(run.id, { date, reason, lines: rows.filter((r) => r.code && (r.dr || r.cr)).map((r) => ({ accountCode: r.code, accountName: chart.find((c) => c.code === r.code)?.name ?? r.code, dr: r.dr || 0, cr: r.cr || 0, narration: r.narration || undefined })) }), 'Consolidation adjustment recorded in the group book');
    if (out) onClose();
  };
  return (
    <Drawer open={open} onClose={onClose} title="New consolidation adjustment" subtitle={`${run.number} · ${run.currency} · held outside legal-company journals (FR-CNS-004)`} width={780}
      footer={<><Button variant="secondary" onClick={onClose}>Discard</Button><Button variant="primary" onClick={submit} disabled={!balanced || reason.trim().length < 10} reason={!balanced ? 'Debits must equal credits' : reason.trim().length < 10 ? 'A reason of at least 10 characters is required' : undefined}>Record adjustment</Button></>}>
      <Banner tone="info">This journal is posted to the group consolidation book only. It never appears in {run.companies.filter((c) => c.included).map((c) => c.companyName).join(' or ')} ledgers, trial balances or statutory reports.</Banner>
      <div className="grid-2">
        <div><label className="field-label">Date<span className="req">*</span></label><input type="date" className="field-input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><label className="field-label">Currency</label><input className="field-input" value={run.currency} disabled /></div>
      </div>
      <div style={{ marginTop: 12 }}><TextArea label="Reason" required value={reason} onChange={setReason} rows={2} placeholder="e.g. Align Gulf depreciation to the group Ind AS useful life" /></div>
      <div style={{ marginTop: 16 }}>
        <SectionLabel>Lines</SectionLabel>
        <table className="data-table dense" style={{ marginTop: 6 }}>
          <thead><tr><th style={{ width: '38%' }}>Account</th><th>Narration</th><th className="right" style={{ width: 130 }}>Dr</th><th className="right" style={{ width: 130 }}>Cr</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><SelectField value={r.code} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, code: v } : x)))} options={[{ value: '', label: '— Account —' }, ...chart.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))]} size="sm" /></td>
                <td><input className="field-input sm" value={r.narration} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, narration: e.target.value } : x)))} /></td>
                <td><NumberField value={r.dr} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, dr: v, cr: v ? 0 : x.cr } : x)))} size="sm" /></td>
                <td><NumberField value={r.cr} onChange={(v) => setRows(rows.map((x, j) => (j === i ? { ...x, cr: v, dr: v ? 0 : x.dr } : x)))} size="sm" /></td>
                <td>{rows.length > 2 && <Button variant="ghost" size="sm" onClick={() => setRows(rows.filter((_, j) => j !== i))}>×</Button>}</td>
              </tr>
            ))}
            <tr style={{ background: '#F9FBFC', fontWeight: 700 }}><td colSpan={2}>Total</td><td className="right money">{fmtMoney(totalDr, run.currency)}</td><td className="right money">{fmtMoney(totalCr, run.currency)}</td><td /></tr>
          </tbody>
        </table>
        <Button variant="secondary" size="sm" style={{ marginTop: 8 }} onClick={() => setRows([...rows, { code: '', dr: 0, cr: 0, narration: '' }])}>Add line</Button>
        {!balanced && totalDr + totalCr > 0 && <Banner tone="warning">Out of balance by {fmtMoney(totalDr - totalCr, run.currency)} — a consolidation journal must balance just like any other.</Banner>}
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: '#6E6E71' }}>Submitted as “Consolidation Adjustment” through the approval engine. If no workflow rule matches, it posts directly and is recorded in the audit trail.</div>
    </Drawer>
  );
}

function ManualEliminationModal({ open, run, chart, onClose }: { open: boolean; run: ConsolidationRun; chart: ReturnType<typeof consolidatedChart>; onClose: () => void }) {
  const act = useAction();
  const [kind, setKind] = useState<Elimination['kind']>('Unrealised profit');
  const [description, setDescription] = useState('');
  const [dr, setDr] = useState('URP');
  const [cr, setCr] = useState('1200');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const opts = [{ value: '', label: '— Account —' }, ...chart.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))];
  return (
    <Modal open={open} onClose={onClose} title="Add elimination" description="Eliminations exist only in the group book and are always reversible (FR-CNS-006)." width={640}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!(amount > 0) || !description.trim() || reason.trim().length < 10} reason={!(amount > 0) ? 'Enter an amount' : !description.trim() ? 'Describe the elimination' : reason.trim().length < 10 ? 'A reason of at least 10 characters is required' : undefined} onClick={async () => { const r = await act(() => addManualElimination(run.id, { kind, description, drAccountCode: dr, crAccountCode: cr, amount, reason }), 'Elimination added'); if (r) onClose(); }}>Add elimination</Button></>}>
      <div className="grid-2">
        <SelectField label="Kind" value={kind} onChange={(v) => setKind(v as Elimination['kind'])} options={['Unrealised profit', 'Intercompany trading', 'Intercompany balance', 'Manual']} />
        <NumberField label="Amount" value={amount} onChange={setAmount} prefix={run.currency} />
      </div>
      <div style={{ marginTop: 12 }}><TextArea label="Description" required value={description} onChange={setDescription} rows={2} placeholder="e.g. Unrealised profit in intercompany stock still held by Acme Gulf" /></div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <SelectField label="Debit account" value={dr} onChange={setDr} options={opts} />
        <SelectField label="Credit account" value={cr} onChange={setCr} options={opts} />
      </div>
      <div style={{ marginTop: 12 }}><TextArea label="Reason" required value={reason} onChange={setReason} rows={2} placeholder="Recorded in the audit trail" /></div>
      <div style={{ marginTop: 10, fontSize: 12, color: '#6E6E71' }}>Today is {fmtDate(today())}. This elimination applies to run {run.number} only.</div>
    </Modal>
  );
}
