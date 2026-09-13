// Consolidation runs register + "New run" wizard (FR-CNS-002, FR-RPT-013).
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useSession } from '../../../store';
import type { Company, Period } from '../../../store';
import {
  Badge, Banner, Button, Card, CheckboxField, DataTable, Drawer, EmptyState, KpiTile, Money, PageHeader, Pill,
  SelectField, Segmented, NumberField, SectionLabel, useAction, type Column,
} from '../../../components/ui';
import { fmtDate, fmtPeriod, today } from '../../../lib/format';
import { activeGroup, buildRunCompanies, companyName, createRun, runStatusTone } from './lib';
import type { ConsolidationRun, Group, RunCompany } from './types';

export function RunsRegister() {
  const s = useSession();
  const groups = useCollection<Group>(C.groups);
  const runs = useCollection<ConsolidationRun>(C.consolidationRuns);
  const group = useMemo(() => activeGroup(), [groups, s.state.companyId]);
  const [wizard, setWizard] = useState<{ supersedes?: ConsolidationRun } | null>(null);
  const rows = useMemo(() => runs.filter((r) => !group || r.groupId === group.id).slice().sort((a, b) => (b.to + b.runVersion).localeCompare(a.to + a.runVersion)), [runs, group]);
  const canRun = s.can('reports.view') || s.isTenantOwner;

  const cols: Column<ConsolidationRun>[] = [
    { key: 'number', label: 'Run', render: (r) => (<div><span className="identifier link">{r.number}</span>{r.runVersion > 1 && <Pill tone="neutral">v{r.runVersion}</Pill>}<div style={{ fontSize: 12, color: '#5F6368' }}>{r.period ? fmtPeriod(r.period) : `${fmtDate(r.from)} – ${fmtDate(r.to)}`} · {r.plBasis === 'YTD' ? 'P&L year to date' : 'P&L for the period'}</div></div>), value: (r) => r.number },
    { key: 'status', label: 'Status', render: (r) => <Badge status={runStatusTone(r.status)}>{r.status}</Badge> },
    { key: 'currency', label: 'Currency', render: (r) => <span className="identifier">{r.currency}</span> },
    { key: 'standard', label: 'Standard', render: (r) => r.accountingStandard },
    { key: 'companies', label: 'Companies', render: (r) => r.companies.filter((c) => c.included).map((c) => c.companyName).join(', ') || '—' },
    { key: 'lines', label: 'Translated lines', align: 'right', render: (r) => (r.translatedLines.length ? String(r.translatedLines.length) : '—'), value: (r) => r.translatedLines.length },
    { key: 'cta', label: 'CTA', align: 'right', render: (r) => (r.translatedLines.length ? <Money value={-r.cta} currency={r.currency} tone="auto" /> : '—'), value: (r) => -r.cta },
    { key: 'elim', label: 'Eliminations', align: 'right', render: (r) => { const acc = r.eliminations.filter((e) => e.status === 'Accepted').length; const prop = r.eliminations.filter((e) => e.status === 'Proposed').length; return prop ? <Pill tone="warning">{acc} accepted · {prop} proposed</Pill> : acc ? <span>{acc} accepted</span> : '—'; }, value: (r) => r.eliminations.length },
    { key: 'adj', label: 'Adjustments', align: 'right', render: (r) => (r.adjustments.length ? String(r.adjustments.length) : '—'), value: (r) => r.adjustments.length },
    { key: 'by', label: 'Created', render: (r) => (<div style={{ fontSize: 12 }}>{fmtDate(r.createdAt.slice(0, 10))}<div style={{ color: '#5F6368' }}>{r.createdBy}</div></div>), value: (r) => r.createdAt },
  ];

  if (!group) {
    return (
      <div className="page">
        <PageHeader title="Consolidation runs" subtitle="Define period, currency, rate policy, ownership dates and included companies (FR-CNS-002)" />
        <EmptyState title="Define a group first" description="A consolidation run needs a group with at least one member company." action={<Button variant="primary" onClick={() => nav.go('reports/consolidation/group')}>Open group structure</Button>} icon="🏛" />
      </div>
    );
  }

  const finals = rows.filter((r) => r.status === 'Final');
  return (
    <div className="page">
      <PageHeader
        title="Consolidation runs"
        subtitle={<>{group.name} · consolidated in <span className="identifier">{group.consolidationCurrency}</span> · {group.accountingStandard} · legal books are read only (FR-FX-014)</>}
        actions={<Button variant="primary" onClick={() => setWizard({})} disabled={!canRun} reason={!canRun ? 'Requires Finance role' : undefined}>New run</Button>}
      />
      <div className="grid-4">
        <KpiTile label="Runs" value={String(rows.length)} sub={`${finals.length} final · ${rows.filter((r) => r.status === 'Draft').length} draft`} />
        <KpiTile label="Latest final" value={finals[0]?.number ?? '—'} sub={finals[0] ? `${fmtPeriod(finals[0].period ?? finals[0].to.slice(0, 7))} · CTA ${(-finals[0].cta).toLocaleString('en-IN')} ${finals[0].currency}` : 'No finalized run yet'} onClick={finals[0] ? () => nav.go(`reports/consolidation/runs/${finals[0].id}`) : undefined} />
        <KpiTile label="Open eliminations" value={String(rows.reduce((n, r) => n + r.eliminations.filter((e) => e.status === 'Proposed').length, 0))} sub="Accept or reject before finalizing" onClick={() => nav.go('reports/consolidation/eliminations')} />
        <KpiTile label="Adjustments" value={String(rows.reduce((n, r) => n + r.adjustments.length, 0))} sub="Held outside legal-company journals (FR-CNS-004)" />
      </div>
      {rows.length === 0
        ? <EmptyState title="No consolidation run yet" description="Create a run to translate each member company into the consolidation currency." action={<Button variant="primary" onClick={() => setWizard({})}>New run</Button>} icon="📊" />
        : (
          <Card padding={0}>
            <DataTable
              rows={rows}
              columns={cols}
              dense
              onRowClick={(r) => nav.go(`reports/consolidation/runs/${r.id}`)}
              rowClass={(r) => (r.status === 'Reversed' ? 'muted' : '')}
              rowActions={(r) => [
                { label: 'Open run', onClick: () => nav.go(`reports/consolidation/runs/${r.id}`) },
                { label: 'Translated statements', onClick: () => nav.go('reports/consolidation/statements', { run: r.id }), disabled: !r.translatedLines.length, reason: !r.translatedLines.length ? 'Not translated yet' : undefined },
                { label: 'New version of this run', onClick: () => setWizard({ supersedes: r }), disabled: !!r.supersededById, reason: r.supersededById ? 'Already superseded' : undefined, separator: true },
              ]}
            />
          </Card>
        )}
      <NewRunWizard open={!!wizard} group={group} supersedes={wizard?.supersedes} onClose={() => setWizard(null)} />
    </div>
  );
}

export function NewRunWizard({ open, group, supersedes, onClose }: { open: boolean; group: Group; supersedes?: ConsolidationRun; onClose: () => void }) {
  const s = useSession();
  const periods = useCollection<Period>(C.periods);
  const companies = useCollection<Company>(C.companies);
  const run = useAction();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<'period' | 'range'>('period');
  const [period, setPeriod] = useState(supersedes?.period ?? s.state.periodCode ?? today().slice(0, 7));
  const [from, setFrom] = useState(supersedes?.from ?? '');
  const [to, setTo] = useState(supersedes?.to ?? '');
  const [plBasis, setPlBasis] = useState<'YTD' | 'Period'>(supersedes?.plBasis ?? 'YTD');
  const [excluded, setExcluded] = useState<string[]>([]);
  const [rates, setRates] = useState<Record<string, { closing: number; average: number; historical: number }>>({});
  const key = `${open}-${supersedes?.id ?? 'new'}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) { setSeen(key); setStep(0); setExcluded([]); setRates({}); setMode(supersedes && !supersedes.period ? 'range' : 'period'); setPeriod(supersedes?.period ?? s.state.periodCode ?? today().slice(0, 7)); setFrom(supersedes?.from ?? ''); setTo(supersedes?.to ?? ''); setPlBasis(supersedes?.plBasis ?? 'YTD'); }

  const range = useMemo(() => {
    if (mode === 'range' && from && to) return { from, to };
    const [y, m] = (period || today().slice(0, 7)).split('-').map((x) => parseInt(x, 10));
    return { from: `${period}-01`, to: `${period}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` };
  }, [mode, period, from, to]);

  const resolved: RunCompany[] = useMemo(() => {
    if (!open) return [];
    return buildRunCompanies(group, range).map((c) => {
      const o = rates[c.companyId];
      return {
        ...c,
        included: !excluded.includes(c.companyId),
        rateClosing: o?.closing ? { ...c.rateClosing, rate: o.closing, type: 'Manual override', source: `Override by ${s.user?.name ?? 'user'}`, overridden: { original: c.rateClosing.rate, reason: 'Entered in the new-run wizard', by: s.user?.name ?? 'user', at: new Date().toISOString() } } : c.rateClosing,
        rateAverage: o?.average ? { ...c.rateAverage, rate: o.average, type: 'Manual override', source: `Override by ${s.user?.name ?? 'user'}`, overridden: { original: c.rateAverage.rate, reason: 'Entered in the new-run wizard', by: s.user?.name ?? 'user', at: new Date().toISOString() } } : c.rateAverage,
        rateHistorical: o?.historical ? { ...c.rateHistorical, rate: o.historical, type: 'Manual override', source: `Override by ${s.user?.name ?? 'user'}`, overridden: { original: c.rateHistorical.rate, reason: 'Entered in the new-run wizard', by: s.user?.name ?? 'user', at: new Date().toISOString() } } : c.rateHistorical,
      };
    });
  }, [open, group, range, excluded, rates, companies, s.user?.name]);

  const missing = resolved.filter((c) => c.included && (!c.rateClosing.rate || !c.rateAverage.rate || !c.rateHistorical.rate));
  const periodOptions = Array.from(new Set(periods.map((p) => p.code))).sort().map((code) => ({ value: code, label: fmtPeriod(code) }));

  const submit = async (translateNow: boolean) => {
    const out = await run(() => createRun({ group, period: mode === 'period' ? period : undefined, from: range.from, to: range.to, plBasis, companies: resolved, translateNow, supersedesId: supersedes?.id }), translateNow ? 'Run created and translated' : 'Run created as draft');
    if (out) { onClose(); nav.go(`reports/consolidation/runs/${out.id}`); }
  };

  const steps = ['Period & basis', 'Companies & ownership', 'Rates', 'Review'];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={supersedes ? `New version of ${supersedes.number}` : 'New consolidation run'}
      subtitle={`${group.name} · ${group.consolidationCurrency} · ${group.accountingStandard}`}
      width={760}
      footer={<>
        <Button variant="secondary" onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</Button>
        {step < 3
          ? <Button variant="primary" onClick={() => setStep(step + 1)} disabled={step === 1 && !resolved.some((c) => c.included)} reason={step === 1 && !resolved.some((c) => c.included) ? 'Include at least one company' : undefined}>Next: {steps[step + 1]}</Button>
          : <><Button variant="secondary" onClick={() => submit(false)}>Save as draft</Button><Button variant="primary" onClick={() => submit(true)} disabled={!!missing.length} reason={missing.length ? `No rate for ${missing.map((c) => c.companyName).join(', ')}` : undefined}>Create and translate</Button></>}
      </>}
    >
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {steps.map((label, i) => (
          <span key={label} className={`pill ${i === step ? 'pill-good' : 'pill-neutral'}`} style={{ cursor: i < step ? 'pointer' : undefined }} onClick={() => i < step && setStep(i)}>{i + 1}. {label}</span>
        ))}
      </div>

      {step === 0 && (
        <>
          <div><label className="field-label">Scope</label><Segmented value={mode} onChange={(v) => setMode(v as 'period' | 'range')} options={[{ value: 'period', label: 'Single period' }, { value: 'range', label: 'Date range' }]} /></div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            {mode === 'period'
              ? <SelectField label="Period" required value={period} onChange={setPeriod} options={periodOptions} help="Periods of every member company are listed; each company keeps its own calendar." />
              : <><div><label className="field-label">From<span className="req">*</span></label><input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
                <div><label className="field-label">To<span className="req">*</span></label><input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /></div></>}
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Profit &amp; loss basis</label>
            <Segmented value={plBasis} onChange={(v) => setPlBasis(v as 'YTD' | 'Period')} options={[{ value: 'YTD', label: 'Year to date (each company’s own FY)' }, { value: 'Period', label: 'Movement in the range only' }]} />
            <div className="field-help">Balance-sheet accounts always translate at their closing balance on {fmtDate(range.to)}.</div>
          </div>
          <Banner tone="info">Members use different financial years — Acme runs Apr–Mar, Acme Gulf Jan–Dec. Year-to-date uses each company’s own year, which is what Ind AS / IFRS group reporting expects.</Banner>
        </>
      )}

      {step === 1 && (
        <>
          <SectionLabel>Included companies and ownership periods (FR-CNS-002)</SectionLabel>
          <table className="data-table dense" style={{ marginTop: 8 }}>
            <thead><tr><th style={{ width: 40 }} /><th>Company</th><th>Base</th><th className="right">Ownership</th><th>Method</th><th>Owned from</th><th>Owned to</th></tr></thead>
            <tbody>
              {buildRunCompanies(group, range).map((c) => (
                <tr key={c.companyId}>
                  <td><input type="checkbox" checked={!excluded.includes(c.companyId)} onChange={(e) => setExcluded(e.target.checked ? excluded.filter((x) => x !== c.companyId) : [...excluded, c.companyId])} /></td>
                  <td>{c.companyName}</td>
                  <td><span className="identifier">{c.baseCurrency}</span></td>
                  <td className="right">{c.ownershipPct}%</td>
                  <td><Badge status={c.method === 'Full' ? 'Active' : c.method === 'Proportional' ? 'Partial' : 'Open'}>{c.method}</Badge></td>
                  <td>{fmtDate(c.ownershipFrom)}</td>
                  <td>{c.ownershipTo ? fmtDate(c.ownershipTo) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {group.members.filter((m) => !(m.from <= range.to && (!m.to || m.to >= range.from))).map((m) => (
            <Banner key={m.companyId} tone="warning">{companyName(m.companyId)} was not owned during {fmtDate(range.from)} – {fmtDate(range.to)} and is excluded from this run.</Banner>
          ))}
        </>
      )}

      {step === 2 && (
        <>
          <SectionLabel>Rates to {group.consolidationCurrency} (FR-RPT-013)</SectionLabel>
          <div className="field-help" style={{ marginBottom: 8 }}>Resolved from the exchange-rate master for {fmtDate(range.to)}. An override is recorded on the run and written to the audit trail.</div>
          <table className="data-table dense">
            <thead><tr><th>Company</th><th>Rate</th><th className="right">Resolved</th><th>Source</th><th className="right" style={{ width: 130 }}>Override</th></tr></thead>
            <tbody>
              {resolved.filter((c) => c.included).map((c) => ([
                ['closing', 'Closing', c.rateClosing] as const,
                ['average', 'Average', c.rateAverage] as const,
                ['historical', 'Historical', c.rateHistorical] as const,
              ].map(([kind, label, info], i) => (
                <tr key={c.companyId + kind}>
                  {i === 0 && <td rowSpan={3} style={{ verticalAlign: 'top', fontWeight: 600 }}>{c.companyName}<div style={{ fontSize: 12, color: '#5F6368', fontWeight: 400 }}>{c.baseCurrency} → {group.consolidationCurrency}</div></td>}
                  <td>{label}</td>
                  <td className="right money">{info.rate ? info.rate : <Pill tone="critical">Missing</Pill>}</td>
                  <td style={{ fontSize: 12, color: '#5F6368' }}>{info.type} · {info.source}{info.note ? ` · ${info.note}` : ''}</td>
                  <td className="right">{c.baseCurrency === group.consolidationCurrency ? '—' : <NumberField value={rates[c.companyId]?.[kind] ?? 0} onChange={(v) => setRates({ ...rates, [c.companyId]: { ...(rates[c.companyId] ?? { closing: 0, average: 0, historical: 0 }), [kind]: v } })} decimals={4} size="sm" placeholder="—" />}</td>
                </tr>
              )))) }
            </tbody>
          </table>
          {missing.length > 0 && <Banner tone="danger">No rate could be resolved for {missing.map((c) => c.companyName).join(', ')} — enter an override above or publish a rate under Accounting › Currencies &amp; FX.</Banner>}
        </>
      )}

      {step === 3 && (
        <>
          <SectionLabel>Review</SectionLabel>
          <Card padding={14} style={{ marginTop: 6 }}>
            <div className="kv">
              <span className="k">Group</span><span className="v">{group.name} · {group.accountingStandard}</span>
              <span className="k">Period</span><span className="v">{mode === 'period' ? fmtPeriod(period) : `${fmtDate(range.from)} – ${fmtDate(range.to)}`}</span>
              <span className="k">P&amp;L basis</span><span className="v">{plBasis === 'YTD' ? 'Year to date (each company’s own financial year)' : 'Movement in the range only'}</span>
              <span className="k">Currency</span><span className="v">{group.consolidationCurrency}</span>
              <span className="k">Companies</span><span className="v">{resolved.filter((c) => c.included).map((c) => `${c.companyName} (${c.ownershipPct}% ${c.method})`).join(', ')}</span>
              <span className="k">Rate policy</span><span className="v">Income {group.ratePolicy.income} · Balance {group.ratePolicy.balance} · Equity {group.ratePolicy.equity}</span>
              {supersedes && <><span className="k">Supersedes</span><span className="v">{supersedes.number} v{supersedes.runVersion} — the earlier version is kept</span></>}
            </div>
          </Card>
          <Banner tone="success">Translation reads posted journals only. No journal, period or balance in Acme or Acme Gulf is created, changed or deleted by this run (FR-FX-014, FR-CNS-004).</Banner>
          <CheckboxField checked disabled onChange={() => {}} label="Disclose the translation adjustment (CTA) as its own line" help="Required by FR-RPT-013 — the balancing figure between closing, average and historical rates." />
          <div style={{ marginTop: 10, fontSize: 12, color: '#6E6E71' }}>Saving as a draft lets you review inputs before translating. You can re-translate a draft as often as you like.</div>
        </>
      )}
    </Drawer>
  );
}
