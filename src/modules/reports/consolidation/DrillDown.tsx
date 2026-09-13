// Drill-down (FR-RPT-014, E2E-07 step 4): consolidated figure → contributing company lines → source journals.
import { useMemo, useState } from 'react';
import { db, C, nav, session, useCollection, useRoute, useSession } from '../../../store';
import type { Account, Company, Journal } from '../../../store';
import { Badge, Banner, Button, Card, EmptyState, KV, KpiTile, PageHeader, Pill, SelectField, useToast } from '../../../components/ui';
import { fmtDate, fmtMoney, fmtPeriod } from '../../../lib/format';
import { companyName, consolidatedRows, presentSign, sourceJournalsFor } from './lib';
import type { ConsolidationRun } from './types';

export function DrillDown() {
  const s = useSession();
  const route = useRoute();
  const runs = useCollection<ConsolidationRun>(C.consolidationRuns);
  const journals = useCollection<Journal>(C.journals);
  const toast = useToast();
  const translated = useMemo(() => runs.filter((r) => r.translatedLines.length > 0).sort((a, b) => (b.to + b.runVersion).localeCompare(a.to + a.runVersion)), [runs]);
  const [runId, setRunId] = useState(route.params.run || translated[0]?.id || '');
  const run = runs.find((r) => r.id === runId) ?? translated[0];
  const rows = useMemo(() => (run ? consolidatedRows(run) : []), [run, runs]);
  const [code, setCode] = useState(route.params.code || '');
  const [companyId, setCompanyId] = useState(route.params.company || '');

  if (!run) {
    return (
      <div className="page">
        <PageHeader title="Drill-down" subtitle="Consolidated figure → contributing company → source journals (FR-RPT-014)" />
        <EmptyState title="No translated run" description="Translate a consolidation run first." action={<Button variant="primary" onClick={() => nav.go('reports/consolidation/runs')}>Open consolidation runs</Button>} icon="🔍" />
      </div>
    );
  }

  const row = rows.find((r) => r.code === code) ?? rows[0];
  const sign = row ? presentSign(row.type) : 1;
  const contributors = row ? run.companies.filter((c) => c.included && Math.abs(row.byCompany[c.companyId] ?? 0) >= 0.005) : [];
  const selectedCompany = contributors.find((c) => c.companyId === companyId) ?? contributors[0];
  const line = row && selectedCompany ? run.translatedLines.find((l) => l.companyId === selectedCompany.companyId && l.accountCode === row.code) : undefined;
  const accountId = row && selectedCompany ? row.accountIds[selectedCompany.companyId] : undefined;
  const account = db.find<Account>(C.accounts, accountId);
  const srcJournals = line && accountId ? sourceJournalsFor({ companyId: line.companyId, accountId }, run) : [];
  const company = db.find<Company>(C.companies, selectedCompany?.companyId);
  const canSwitch = !!s.user?.companyIds.includes(company?.id ?? '');

  return (
    <div className="page">
      <PageHeader
        title="Drill-down"
        subtitle={<>Consolidated figure → contributing company line → source journals in that company’s own ledger (FR-RPT-014, E2E-07)</>}
        actions={<Button variant="secondary" onClick={() => nav.go('reports/consolidation/statements', { run: run.id })}>Translated statements</Button>}
      />
      <Card padding={14} className="toolbar" style={{ gap: 12, alignItems: 'flex-end' }}>
        <SelectField label="Run" size="sm" value={run.id} onChange={setRunId} options={translated.map((r) => ({ value: r.id, label: `${r.number} v${r.runVersion} · ${r.period ? fmtPeriod(r.period) : r.to}` }))} style={{ minWidth: 240 }} />
        <SelectField label="Consolidated figure" size="sm" value={row?.code ?? ''} onChange={(v) => { setCode(v); setCompanyId(''); }} options={rows.map((r) => ({ value: r.code, label: `${r.code} · ${r.name} — ${fmtMoney(r.consolidated * presentSign(r.type), run.currency)}` }))} style={{ minWidth: 380 }} />
        <SelectField label="Company" size="sm" value={selectedCompany?.companyId ?? ''} onChange={setCompanyId} options={contributors.map((c) => ({ value: c.companyId, label: c.companyName }))} style={{ minWidth: 180 }} />
      </Card>

      {!row ? <EmptyState title="Nothing to drill into" description="This run has no lines." icon="🔍" /> : (
        <>
          <div className="grid-4">
            <KpiTile label="Consolidated" value={fmtMoney(row.consolidated * sign, run.currency)} sub={`${row.code} · ${row.name}`} />
            <KpiTile label="Companies contributing" value={String(contributors.length)} sub={contributors.map((c) => c.companyName).join(', ') || '—'} />
            <KpiTile label="Eliminations" value={fmtMoney(row.eliminations * sign, run.currency)} sub="Group book only" />
            <KpiTile label="Adjustments" value={fmtMoney(row.adjustments * sign, run.currency)} sub="Consolidation journals" />
          </div>

          <Card title="Contributing company lines (FR-CNS-003)" padding={0}>
            <table className="data-table dense">
              <thead><tr><th>Company</th><th>Account</th><th>Source currency</th><th className="right">Source amount</th><th>Rate type</th><th className="right">Rate</th><th className="right">Translated ({run.currency})</th></tr></thead>
              <tbody>
                {contributors.map((c) => {
                  const l = run.translatedLines.find((x) => x.companyId === c.companyId && x.accountCode === row.code);
                  return (
                    <tr key={c.companyId} className="clickable" onClick={() => setCompanyId(c.companyId)} style={{ background: c.companyId === selectedCompany?.companyId ? '#F3F6FF' : undefined }}>
                      <td>{c.companyName}</td>
                      <td><span className="identifier">{row.code}</span> {l?.accountName ?? row.name}</td>
                      <td><span className="identifier">{l?.sourceCurrency ?? c.baseCurrency}</span></td>
                      <td className="right money">{l ? fmtMoney(l.sourceAmount * sign, l.sourceCurrency, { code: true }) : '—'}</td>
                      <td>{l ? <Pill tone={l.rateType === 'Average' ? 'neutral' : l.rateType === 'Historical' ? 'warning' : 'good'}>{l.rateType}</Pill> : '—'}</td>
                      <td className="right money">{l?.rate ?? '—'}</td>
                      <td className="right money">{fmtMoney((row.byCompany[c.companyId] ?? 0) * sign, run.currency)}</td>
                    </tr>
                  );
                })}
                {!contributors.length && <tr><td colSpan={7} style={{ color: '#6E6E71' }}>Consolidation-only account — the figure comes from eliminations or consolidation adjustments, not from a company ledger.</td></tr>}
              </tbody>
            </table>
          </Card>

          {selectedCompany && (
            <Card
              title={`Source journals in ${selectedCompany.companyName}`}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!accountId || !canSwitch}
                  reason={!accountId ? 'Consolidation-only account' : !canSwitch ? `You do not have access to ${company?.tradeName}` : undefined}
                  onClick={() => {
                    if (!accountId || !company) return;
                    if (company.id !== s.state.companyId) { session.switchCompany(company.id); toast.info(`Now working in ${company.tradeName} — its books, periods and number series are separate`); }
                    nav.go('accounting/ledger', { account: accountId, to: run.to });
                  }}
                >
                  {company && company.id !== s.state.companyId ? `Switch to ${company.tradeName} and open ledger` : 'Open ledger'}
                </Button>
              }
              padding={0}
            >
              <div style={{ padding: 12 }}>
                <KV columns={2} items={[
                  { k: 'Account', v: account ? <>{account.code} · {account.name} <Badge status={account.status} /></> : 'Consolidation-only account' },
                  { k: 'Company base currency', v: selectedCompany.baseCurrency },
                  { k: 'Balance basis', v: line && (line.type === 'Income' || line.type === 'Expense') ? `${run.plBasis === 'YTD' ? 'Movement from the start of the company financial year' : `Movement from ${fmtDate(run.from)}`} to ${fmtDate(run.to)}` : `Closing balance at ${fmtDate(run.to)}` },
                  { k: 'Translated at', v: line ? `${line.rateType}${line.rate !== 1 ? ` · ${line.rate}` : ''}` : '—' },
                ]} />
              </div>
              <table className="data-table dense">
                <thead><tr><th>Date</th><th>Journal</th><th>Type</th><th>Narration</th><th className="right">Dr</th><th className="right">Cr</th><th>Status</th></tr></thead>
                <tbody>
                  {srcJournals.slice(0, 60).map((j) => {
                    const ls = j.lines.filter((l) => l.accountId === accountId);
                    const dr = ls.reduce((a, b) => a + b.dr, 0);
                    const cr = ls.reduce((a, b) => a + b.cr, 0);
                    return (
                      <tr key={j.id} className="clickable" onClick={() => { if (company && company.id !== s.state.companyId) session.switchCompany(company.id); nav.go(`accounting/journals/${j.id}`); }}>
                        <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(j.date)}</td>
                        <td><span className="identifier link">{j.number}</span></td>
                        <td>{j.sourceType}</td>
                        <td style={{ color: '#5F6368' }}>{j.narration}</td>
                        <td className="right money">{dr ? fmtMoney(dr, j.currency, { code: j.currency !== selectedCompany.baseCurrency }) : '—'}</td>
                        <td className="right money">{cr ? fmtMoney(cr, j.currency, { code: j.currency !== selectedCompany.baseCurrency }) : '—'}</td>
                        <td><Badge status={j.status} /></td>
                      </tr>
                    );
                  })}
                  {!srcJournals.length && <tr><td colSpan={7} style={{ color: '#6E6E71' }}>No journal in {selectedCompany.companyName} touches this account in the range — the balance comes from the opening balance loaded at go-live.</td></tr>}
                </tbody>
              </table>
              {srcJournals.length > 60 && <div style={{ padding: 10, fontSize: 12, color: '#6E6E71' }}>Showing the 60 most recent of {srcJournals.length} journals — open the ledger for the full list.</div>}
            </Card>
          )}

          <Banner tone="success">Everything shown here is read from {selectedCompany?.companyName ?? 'the company'}’s own journals. Opening the ledger switches your working company; it never merges the two sets of books (FR-ORG-011, FR-FX-014).</Banner>
          <div style={{ fontSize: 12, color: '#6E6E71' }}>
            Consolidated <span className="money">{fmtMoney(row.consolidated * sign, run.currency)}</span> = {contributors.map((c) => `${c.companyName} ${fmtMoney((row.byCompany[c.companyId] ?? 0) * sign, run.currency)}`).join(' + ')}
            {row.eliminations ? ` + eliminations ${fmtMoney(row.eliminations * sign, run.currency)}` : ''}
            {row.adjustments ? ` + adjustments ${fmtMoney(row.adjustments * sign, run.currency)}` : ''}
          </div>
        </>
      )}
    </div>
  );
}
