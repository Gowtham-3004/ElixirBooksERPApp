// Consolidated P&L and balance sheet in the consolidation currency with a column per company,
// eliminations, adjustments and the consolidated total (FR-RPT-012). Every figure drills to the
// contributing company ledger (FR-RPT-014, E2E-07 step 4) and the rates used are disclosed.
import { Fragment, useMemo, useState } from 'react';
import { db, C, nav, session, useCollection, useRoute, useSession } from '../../../store';
import type { Company } from '../../../store';
import { Badge, Banner, Button, Card, EmptyState, KpiTile, Modal, Pill, SelectField, Segmented, useToast } from '../../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtPeriod } from '../../../lib/format';
import { ReportFrame } from '../ReportFrame';
import { GROUP_ORDER, companyName, consolidatedRows, presentSign, runStatusTone, type StmtRow } from './lib';
import type { ConsolidationRun } from './types';

const PL_GROUPS = ['REV', 'OI', 'COGS', 'OPEX', 'FIN'];
const BS_GROUPS = ['CA', 'FA', 'CL', 'NCL', 'EQ'];

export function TranslatedStatements() {
  const s = useSession();
  const route = useRoute();
  const runs = useCollection<ConsolidationRun>(C.consolidationRuns);
  const toast = useToast();
  const translated = useMemo(() => runs.filter((r) => r.translatedLines.length > 0).sort((a, b) => (b.to + b.runVersion).localeCompare(a.to + a.runVersion)), [runs]);
  const [runId, setRunId] = useState(route.params.run || translated[0]?.id || '');
  const [view, setView] = useState<'pl' | 'bs'>(route.params.view === 'bs' ? 'bs' : 'pl');
  const [drill, setDrill] = useState<{ row: StmtRow; companyId: string } | null>(null);
  const run = runs.find((r) => r.id === runId) ?? translated[0];

  const rows = useMemo(() => (run ? consolidatedRows(run) : []), [run, runs]);
  const companies = run?.companies.filter((c) => c.included) ?? [];

  if (!run) {
    return (
      <div className="page">
        <EmptyState title="No translated run yet" description="Translate a consolidation run to see the group profit & loss and balance sheet." action={<Button variant="primary" onClick={() => nav.go('reports/consolidation/runs')}>Open consolidation runs</Button>} icon="📈" />
      </div>
    );
  }

  const groupCodes = (view === 'pl' ? PL_GROUPS : BS_GROUPS).filter((g) => rows.some((r) => r.groupCode === g));
  const visible = rows.filter((r) => groupCodes.includes(r.groupCode));
  const groupName = (code: string) => rows.find((r) => r.groupCode === code)?.groupName ?? code;

  const sum = (rs: StmtRow[], pick: (r: StmtRow) => number) => Math.round(rs.reduce((a, b) => a + pick(b), 0) * 100) / 100;
  const present = (r: StmtRow, v: number) => Math.round(v * presentSign(r.type) * 100) / 100;

  const revenue = sum(rows.filter((r) => r.groupCode === 'REV'), (r) => -r.consolidated);
  const otherIncome = sum(rows.filter((r) => r.groupCode === 'OI'), (r) => -r.consolidated);
  const cogs = sum(rows.filter((r) => r.groupCode === 'COGS'), (r) => r.consolidated);
  const opex = sum(rows.filter((r) => r.groupCode === 'OPEX'), (r) => r.consolidated);
  const finance = sum(rows.filter((r) => r.groupCode === 'FIN'), (r) => r.consolidated);
  const netProfit = Math.round((revenue + otherIncome - cogs - opex - finance) * 100) / 100;
  const totalAssets = sum(rows.filter((r) => r.groupCode === 'CA' || r.groupCode === 'FA'), (r) => r.consolidated);
  const totalLE = sum(rows.filter((r) => r.groupCode === 'CL' || r.groupCode === 'NCL' || r.groupCode === 'EQ'), (r) => -r.consolidated);
  const bsDiff = Math.round((totalAssets - (totalLE + netProfit)) * 100) / 100;

  const cell = (v: number) => (Math.abs(v) < 0.005 ? '—' : fmtMoney(v, run.currency));

  const openLedger = (row: StmtRow, companyId: string) => {
    const accountId = row.accountIds[companyId];
    if (!accountId) { toast.info(`${row.code} · ${row.name} has no ledger in ${companyName(companyId)} — it is a consolidation-only account.`); return; }
    setDrill({ row, companyId });
  };

  return (
    <ReportFrame
      id="consolidated-statements"
      title={view === 'pl' ? 'Consolidated profit & loss' : 'Consolidated balance sheet'}
      rangeLabel={`${run.number} v${run.runVersion} · ${run.period ? fmtPeriod(run.period) : `${fmtDate(run.from)} – ${fmtDate(run.to)}`} · ${run.currency}`}
      subtitle={<>Translated from each company’s own ledger without changing it (FR-RPT-012, FR-FX-014) · <Badge status={runStatusTone(run.status)}>{run.status}</Badge></>}
      filterState={{ run: run.id, view }}
      exportColumns={[{ key: 'group', label: 'Group' }, { key: 'code', label: 'Code' }, { key: 'account', label: 'Account' }, ...companies.map((c) => ({ key: c.companyId, label: `${c.companyName} (translated)` })), { key: 'eliminations', label: 'Eliminations' }, { key: 'adjustments', label: 'Adjustments' }, { key: 'consolidated', label: `Consolidated ${run.currency}` }]}
      exportRows={() => visible.map((r) => ({ group: r.groupName, code: r.code, account: r.name, ...Object.fromEntries(companies.map((c) => [c.companyId, present(r, r.byCompany[c.companyId] ?? 0)])), eliminations: present(r, r.eliminations), adjustments: present(r, r.adjustments), consolidated: present(r, r.consolidated) }))}
      filters={<>
        <SelectField label="Run" size="sm" value={run.id} onChange={setRunId} options={translated.map((r) => ({ value: r.id, label: `${r.number} v${r.runVersion} · ${r.period ? fmtPeriod(r.period) : r.to} · ${r.status}` }))} style={{ minWidth: 260 }} />
        <div><label className="field-label">Statement</label><Segmented value={view} onChange={(v) => setView(v as 'pl' | 'bs')} options={[{ value: 'pl', label: 'Profit & loss' }, { value: 'bs', label: 'Balance sheet' }]} /></div>
      </>}
      actions={<Button variant="secondary" size="sm" onClick={() => nav.go(`reports/consolidation/runs/${run.id}`)}>Open run</Button>}
    >
      {view === 'pl' ? (
        <div className="grid-4">
          <KpiTile label="Group revenue" value={fmtMoney(revenue, run.currency)} sub={`${companies.length} companies · intercompany sales eliminated`} />
          <KpiTile label="Cost of goods sold" value={fmtMoney(cogs, run.currency)} sub={`Gross profit ${fmtMoney(revenue - cogs, run.currency)}`} />
          <KpiTile label="Operating + finance costs" value={fmtMoney(opex + finance, run.currency)} sub={`incl. other income ${fmtMoney(otherIncome, run.currency)}`} />
          <KpiTile label="Group net profit" value={fmtMoney(netProfit, run.currency)} deltaTone={netProfit >= 0 ? 'good' : 'bad'} delta={revenue ? `${Math.round((netProfit / revenue) * 1000) / 10}% net margin` : undefined} sub="before tax" />
        </div>
      ) : (
        <div className="grid-4">
          <KpiTile label="Total assets" value={fmtMoney(totalAssets, run.currency)} />
          <KpiTile label="Equity & liabilities" value={fmtMoney(totalLE + netProfit, run.currency)} sub={`incl. profit for the period ${fmtMoney(netProfit, run.currency)}`} />
          <KpiTile label="Translation reserve (CTA)" value={fmtMoney(-run.cta, run.currency)} sub="Disclosed separately (FR-RPT-013)" />
          <KpiTile label="Assets − (E + L)" value={fmtMoney(bsDiff, run.currency)} delta={Math.abs(bsDiff) < 0.5 ? 'Balanced' : 'Check translation'} deltaTone={Math.abs(bsDiff) < 0.5 ? 'good' : 'bad'} />
        </div>
      )}

      <Banner tone="success">
        Source books unchanged: this statement is computed from the run’s stored translated lines. Acme and Acme Gulf journals, periods and trial balances are exactly as their own finance teams left them (FR-RPT-012, FR-CNS-004).
      </Banner>

      <Card padding={0} style={{ overflowX: 'auto' }}>
        <table className="data-table dense">
          <thead>
            <tr>
              <th style={{ minWidth: 260 }}>Particulars</th>
              {companies.map((c) => <th key={c.companyId} className="right" style={{ minWidth: 150 }}>{c.companyName}<div style={{ fontWeight: 400, fontSize: 11, color: '#6E6E71' }}>{c.baseCurrency} → {run.currency}</div></th>)}
              <th className="right" style={{ minWidth: 130 }}>Eliminations</th>
              <th className="right" style={{ minWidth: 130 }}>Adjustments</th>
              <th className="right" style={{ minWidth: 150 }}>Consolidated ({run.currency})</th>
            </tr>
          </thead>
          <tbody>
            {groupCodes.map((g) => {
              const rs = visible.filter((r) => r.groupCode === g);
              return (
                <Fragment key={g}>
                  <tr style={{ background: '#F9FBFC' }}>
                    <td style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600, color: '#5F6368' }}>{groupName(g)}</td>
                    {companies.map((c) => <td key={c.companyId} className="right money" style={{ fontWeight: 600 }}>{cell(sum(rs, (r) => present(r, r.byCompany[c.companyId] ?? 0)))}</td>)}
                    <td className="right money" style={{ fontWeight: 600 }}>{cell(sum(rs, (r) => present(r, r.eliminations)))}</td>
                    <td className="right money" style={{ fontWeight: 600 }}>{cell(sum(rs, (r) => present(r, r.adjustments)))}</td>
                    <td className="right money" style={{ fontWeight: 700 }}>{cell(sum(rs, (r) => present(r, r.consolidated)))}</td>
                  </tr>
                  {rs.map((r) => (
                    <tr key={g + r.code}>
                      <td style={{ paddingLeft: 24 }}><span className="identifier" style={{ color: '#6E6E71', marginRight: 8, fontSize: 11 }}>{r.code}</span>{r.name}</td>
                      {companies.map((c) => {
                        const v = present(r, r.byCompany[c.companyId] ?? 0);
                        const has = Math.abs(r.byCompany[c.companyId] ?? 0) >= 0.005;
                        return <td key={c.companyId} className="right money" style={{ cursor: has ? 'pointer' : undefined, color: has ? '#325CFF' : undefined }} onClick={() => has && openLedger(r, c.companyId)} title={has ? `Drill to ${companyName(c.companyId)} ledger for ${r.code}` : undefined}>{cell(v)}</td>;
                      })}
                      <td className="right money">{cell(present(r, r.eliminations))}</td>
                      <td className="right money">{cell(present(r, r.adjustments))}</td>
                      <td className="right money" style={{ fontWeight: 600 }}>{cell(present(r, r.consolidated))}</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {view === 'pl' && (
              <tr style={{ background: '#F3F6FF', fontWeight: 700 }}>
                <td>Net profit before tax</td>
                {companies.map((c) => {
                  const v = sum(rows.filter((r) => PL_GROUPS.includes(r.groupCode)), (r) => -(r.byCompany[c.companyId] ?? 0));
                  return <td key={c.companyId} className="right money">{cell(v)}</td>;
                })}
                <td className="right money">{cell(sum(rows.filter((r) => PL_GROUPS.includes(r.groupCode)), (r) => -r.eliminations))}</td>
                <td className="right money">{cell(sum(rows.filter((r) => PL_GROUPS.includes(r.groupCode)), (r) => -r.adjustments))}</td>
                <td className="right money">{cell(netProfit)}</td>
              </tr>
            )}
            {view === 'bs' && (
              <>
                <tr style={{ background: '#F3F6FF', fontWeight: 700 }}>
                  <td>Profit for the period (unappropriated)</td>
                  {companies.map((c) => <td key={c.companyId} className="right money">{cell(sum(rows.filter((r) => PL_GROUPS.includes(r.groupCode)), (r) => -(r.byCompany[c.companyId] ?? 0)))}</td>)}
                  <td className="right money">{cell(sum(rows.filter((r) => PL_GROUPS.includes(r.groupCode)), (r) => -r.eliminations))}</td>
                  <td className="right money">{cell(sum(rows.filter((r) => PL_GROUPS.includes(r.groupCode)), (r) => -r.adjustments))}</td>
                  <td className="right money">{cell(netProfit)}</td>
                </tr>
                <tr style={{ background: '#F3F6FF', fontWeight: 700 }}>
                  <td>Total assets</td>
                  {companies.map((c) => <td key={c.companyId} className="right money">{cell(sum(rows.filter((r) => r.groupCode === 'CA' || r.groupCode === 'FA'), (r) => r.byCompany[c.companyId] ?? 0))}</td>)}
                  <td className="right money">{cell(sum(rows.filter((r) => r.groupCode === 'CA' || r.groupCode === 'FA'), (r) => r.eliminations))}</td>
                  <td className="right money">{cell(sum(rows.filter((r) => r.groupCode === 'CA' || r.groupCode === 'FA'), (r) => r.adjustments))}</td>
                  <td className="right money">{cell(totalAssets)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </Card>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="Rate disclosure (FR-RPT-013)" padding={0}>
          <table className="data-table dense">
            <thead><tr><th>Company</th><th>Rate type</th><th className="right">Rate</th><th>Source</th><th>Timestamp</th></tr></thead>
            <tbody>
              {companies.flatMap((c) => ([['Closing', c.rateClosing], ['Average', c.rateAverage], ['Historical', c.rateHistorical]] as const).map(([label, i], idx) => (
                <tr key={c.companyId + label}>
                  {idx === 0 ? <td rowSpan={3} style={{ verticalAlign: 'top' }}>{c.companyName}<div style={{ fontSize: 11, color: '#6E6E71' }}>{c.baseCurrency} → {run.currency}</div></td> : null}
                  <td>{label}</td>
                  <td className="right money">{i.rate}{i.overridden ? <Pill tone="warning">override</Pill> : null}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{i.type} · {i.source}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{fmtDateTime(i.at)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </Card>
        <Card title="Translation adjustment (CTA)">
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Assets and liabilities are translated at the closing rate, income and expenses at the average rate and equity at historical rates. The resulting imbalance of <strong className="money">{fmtMoney(-run.cta, run.currency)}</strong> is carried to the foreign currency translation reserve and shown as its own line — it is never spread across other accounts (FR-RPT-013).
          </div>
          <table className="data-table dense" style={{ marginTop: 10 }}>
            <thead><tr><th>Company</th><th className="right">CTA ({run.currency})</th></tr></thead>
            <tbody>
              {companies.map((c) => <tr key={c.companyId}><td>{c.companyName}{c.baseCurrency === run.currency ? ' (no translation)' : ''}</td><td className="right money">{cell(-(run.ctaByCompany?.[c.companyId] ?? 0))}</td></tr>)}
              <tr style={{ background: '#F9FBFC', fontWeight: 700 }}><td>Total</td><td className="right money">{cell(-run.cta)}</td></tr>
            </tbody>
          </table>
        </Card>
      </div>

      <DrillModal drill={drill} run={run} onClose={() => setDrill(null)} />
      <div style={{ fontSize: 12, color: '#6E6E71' }}>Click any company figure to drill through to the journals that produced it. Scope: {s.company?.tradeName} session · group statements are always presented in {run.currency}.</div>
    </ReportFrame>
  );
}

function DrillModal({ drill, run, onClose }: { drill: { row: StmtRow; companyId: string } | null; run: ConsolidationRun; onClose: () => void }) {
  const s = useSession();
  const company = db.find<Company>(C.companies, drill?.companyId);
  const line = drill ? run.translatedLines.find((l) => l.companyId === drill.companyId && l.accountCode === drill.row.code) : undefined;
  const accountId = drill ? drill.row.accountIds[drill.companyId] : undefined;
  const needsSwitch = !!company && company.id !== s.state.companyId;
  const canSwitch = !!s.user?.companyIds.includes(company?.id ?? '');
  return (
    <Modal
      open={!!drill}
      onClose={onClose}
      title={`Drill to ${company?.tradeName ?? 'company'} ledger`}
      description={drill ? `${drill.row.code} · ${drill.row.name}` : undefined}
      width={620}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Stay in group view</Button>
        <Button variant="secondary" onClick={() => { onClose(); nav.go('reports/consolidation/drilldown', { run: run.id, company: drill?.companyId, code: drill?.row.code }); }}>Show contributing journals here</Button>
        <Button
          variant="primary"
          disabled={!accountId || (needsSwitch && !canSwitch)}
          reason={!accountId ? 'Consolidation-only account' : needsSwitch && !canSwitch ? `You do not have access to ${company?.tradeName}` : undefined}
          onClick={() => {
            if (needsSwitch && company) session.switchCompany(company.id);
            onClose();
            nav.go('accounting/ledger', { account: accountId, to: run.to });
          }}
        >
          {needsSwitch ? `Switch to ${company?.tradeName} and open ledger` : 'Open ledger'}
        </Button>
      </>}
    >
      {line && (
        <div className="kv">
          <span className="k">Company</span><span className="v">{company?.legalName} · {company?.country}</span>
          <span className="k">Source amount</span><span className="v money">{fmtMoney(line.sourceAmount, line.sourceCurrency, { code: true })}</span>
          <span className="k">Rate applied</span><span className="v">{line.rateType}{line.rate !== 1 ? ` · ${line.rate}` : ''}</span>
          <span className="k">Translated</span><span className="v money">{fmtMoney(line.translatedAmount, run.currency)}</span>
          <span className="k">As at</span><span className="v">{fmtDate(run.to)}</span>
        </div>
      )}
      {needsSwitch && <Banner tone="warning">Opening the ledger changes your working company to {company?.tradeName}. Its books, periods, banks and number series are separate from {s.company?.tradeName} — no transaction can ever span both (FR-ORG-011).</Banner>}
      {!needsSwitch && <Banner tone="info">You are already working in {company?.tradeName}; the ledger opens directly.</Banner>}
    </Modal>
  );
}

export { GROUP_ORDER };
