// Depreciation runs (FR-AST-003/004): period picker, computed preview per asset, post (duplicate period blocked),
// run history with reverse. Also categories and asset reports.
import { useMemo, useState } from 'react';
import { C, db, nav, useSession, useCollection, IDS } from '../../store';
import type { Journal } from '../../store';
import { Badge, Banner, Button, ConfirmDialog, KpiTile, RegisterPage, Drawer, TextField, NumberField, SelectField, EntityPicker, useAccountOptions, useToast, DataTable, ScopeLine, Segmented, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPeriod, fmtDateTime, toCSV, downloadText } from '../../lib/format';
import { PeriodPicker, usePeriods } from '../reports/ReportFrame';
import type { Asset, AssetCategory, DepreciationRun, DepreciationLine } from './types';
import { computeRun, existingRun, postDepreciation, reverseDepreciation } from './actions';
import { nbv, accumulated, methodLabel, projectSchedule } from './calc';
import { fyRange, periodsBetween } from '../reports/compute';
import { useAssets } from './Register';

export function DepreciationPage() {
  const s = useSession();
  const toast = useToast();
  const runs = useCollection<DepreciationRun>(C.depreciationRuns).filter((r) => !r.companyId || r.companyId === s.state.companyId).slice().sort((a, b) => b.period.localeCompare(a.period) || b.number.localeCompare(a.number));
  const assets = useCollection<Asset>(C.assets);
  const periods = usePeriods();
  const lastPosted = runs.filter((r) => r.status === 'Posted' && !r.reversalOfId).sort((a, b) => b.period.localeCompare(a.period))[0];
  const defaultPeriod = useMemo(() => { if (!lastPosted) return s.state.periodCode ?? '2026-09'; const [y, m] = lastPosted.period.split('-').map((x) => parseInt(x, 10)); const d = new Date(y, m, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }, [lastPosted, s.state.periodCode]);
  const [period, setPeriod] = useState(defaultPeriod);
  const [selected, setSelected] = useState<DepreciationRun | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [reverse, setReverse] = useState<DepreciationRun | null>(null);
  const preview = useMemo(() => computeRun(period), [period, assets, runs]);
  const dup = existingRun(period);
  const periodRec = periods.find((p) => p.code === period);
  const canPost = s.can('fixed-assets.*') || s.can('fixed-assets.depreciation.post') || s.can('accounting.*');
  const total = preview.reduce((x, l) => x + l.depreciation, 0);
  const view = selected;
  const lines: DepreciationLine[] = view ? view.lines : preview;
  const cols: Column<DepreciationLine & { id: string }>[] = [
    { key: 'assetName', label: 'Asset', render: (l) => <div><div className="cell-primary">{l.assetName}</div><div className="cell-secondary identifier">{l.assetNumber}</div></div> },
    { key: 'categoryName', label: 'Category', render: (l) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{l.categoryName}</span> },
    { key: 'method', label: 'Method', render: (l) => <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{l.method} {l.ratePct}%</span> },
    { key: 'openingNbv', label: 'Opening WDV', align: 'right', render: (l) => <span className="money">{fmtMoney(l.openingNbv, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((x, l) => x + l.openingNbv, 0), s.currency)}</span> },
    { key: 'depreciation', label: 'Depreciation', align: 'right', render: (l) => <span className="money" style={{ color: 'var(--danger)' }}>{fmtMoney(l.depreciation, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700, color: 'var(--danger)' }}>{fmtMoney(rs.reduce((x, l) => x + l.depreciation, 0), s.currency)}</span> },
    { key: 'closingNbv', label: 'Closing WDV', align: 'right', render: (l) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(l.closingNbv, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, l) => x + l.closingNbv, 0), s.currency)}</span> },
    { key: 'note', label: '', render: (l) => (l.note ? <span style={{ fontSize: 11, color: 'var(--warn)' }}>{l.note}</span> : null) },
  ];
  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: '#FFF' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 13, fontWeight: 600 }}>Depreciation runs</span><Button size="sm" variant={selected ? 'secondary' : 'primary'} onClick={() => setSelected(null)}>New run</Button></div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {runs.map((r) => (
            <div key={r.id} onClick={() => setSelected(r)} style={{ padding: '12px 16px', borderBottom: '1px solid var(--hairline)', cursor: 'pointer', background: selected?.id === r.id ? 'var(--accent-tint)' : '#FFF', borderLeft: selected?.id === r.id ? '3px solid var(--accent)' : '3px solid transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{fmtPeriod(r.period)}{r.reversalOfId ? ' · reversal' : ''}</span><Badge status={r.status} /></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-3)' }}><span className="identifier">{r.number} · {r.assetCount} assets</span><span className="money">{fmtMoney(r.total, s.currency)}</span></div>
            </div>
          ))}
          {runs.length === 0 && <div style={{ padding: 16, fontSize: 13, color: 'var(--ink-4)' }}>No runs yet.</div>}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!view ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
              <div><h2 style={{ fontSize: 18, fontWeight: 600 }}>Run depreciation</h2><div style={{ fontSize: 12, color: 'var(--ink-3)' }}><ScopeLine extra={`${preview.length} assets · ${fmtMoney(total, s.currency)}`} /></div></div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}><PeriodPicker value={period} onChange={setPeriod} /><Button variant="secondary" onClick={() => downloadText(`depreciation-preview-${period}.csv`, toCSV(preview as any))} disabled={!preview.length}>Export preview</Button><Button variant="primary" onClick={() => setConfirm(true)} disabled={!!dup || !preview.length || !canPost || periodRec?.status === 'Locked'} reason={dup ? `Already posted as ${dup.number}` : !preview.length ? 'Nothing to depreciate' : periodRec?.status === 'Locked' ? 'Period locked' : !canPost ? 'Requires posting permission' : undefined}>Post depreciation</Button></div>
            </div>
            {dup ? <Banner tone="danger">Depreciation for {fmtPeriod(period)} is already posted as {dup.number} ({fmtMoney(dup.total, s.currency)}). Duplicate period posting is blocked — reverse it first (FR-AST-004).</Banner> : periodRec?.status === 'Locked' ? <Banner tone="warning">{periodRec.label} is locked — reopen it under Company administration before posting.</Banner> : lastPosted && period > defaultPeriod ? <Banner tone="warning">Skipping months: last posted run is {fmtPeriod(lastPosted.period)}. Post {fmtPeriod(defaultPeriod)} first to keep the schedule continuous.</Banner> : <Banner tone="info">Computed per asset from method, useful life, residual, in-service date (prorated) and prior accumulated depreciation. Fully depreciated and disposed assets are skipped.</Banner>}
            <div className="grid-4">
              <KpiTile label="Assets depreciating" value={preview.length} sub={`of ${assets.filter((a) => a.status !== 'Disposed').length} in books`} />
              <KpiTile label="Depreciation this period" value={fmtMoney(total, s.currency)} />
              <KpiTile label="Opening NBV" value={fmtMoney(preview.reduce((x, l) => x + l.openingNbv, 0), s.currency)} />
              <KpiTile label="Closing NBV" value={fmtMoney(preview.reduce((x, l) => x + l.closingNbv, 0), s.currency)} />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <div><h2 style={{ fontSize: 18, fontWeight: 600 }}>{fmtPeriod(view.period)} — depreciation schedule</h2><div style={{ fontSize: 12, color: 'var(--ink-3)' }}>{view.number} · <Badge status={view.status} /> · posted {fmtDateTime(view.postedAt)} by {view.postedBy} · journal <span className="identifier link" onClick={() => view.journalId && nav.go(`accounting/journals/${view.journalId}`)}>{view.journalNumber}</span>{view.reversalReason ? ` · ${view.reversalReason}` : ''}</div></div>
              <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={() => downloadText(`${view.number}.csv`, toCSV(view.lines as any))}>Export</Button>{view.status === 'Posted' && !view.reversalOfId && <Button variant="danger" onClick={() => setReverse(view)} disabled={!canPost}>Reverse run</Button>}</div>
            </div>
            {view.status === 'Reversed' && <Banner tone="warning">Reversed by {runs.find((r) => r.id === view.reversedById)?.number}: {view.reversalReason}</Banner>}
          </>
        )}
        <DataTable rows={lines.map((l) => ({ ...l, id: l.assetId }))} columns={cols} dense showTotals onRowClick={(l) => nav.go(`fixed-assets/register/${l.assetId}?tab=schedule`)} totalsLabel={`Totals for ${lines.length} assets`} emptyTitle="Nothing to depreciate" emptyDescription="All assets are fully depreciated, disposed or not yet in service for this period." />
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Post depreciation for ${fmtPeriod(period)}`} statement={`${preview.length} assets · ${fmtMoney(total, s.currency)}. Each asset's accumulated depreciation is updated and the schedule continues from the closing NBV.`} confirmLabel="Post depreciation" cancelLabel="Not yet" consequences={[{ engine: 'Journal', text: `Dr Depreciation & amortisation (5300) by cost centre · Cr Accumulated depreciation (1510) ${fmtMoney(total, s.currency)}`, tone: 'info' }, { engine: 'Numbering', text: 'Next DEP-RUN number allocated', tone: 'info' }, { engine: 'Statutory', text: 'Period locked against a second run; assets reaching residual value become Fully Depreciated', tone: 'warning' }]} onConfirm={() => { const r = postDepreciation(period, preview); toast.success(`${r.number} posted · ${r.journalNumber}`); setSelected(r); }} />
      <ConfirmDialog open={!!reverse} onClose={() => setReverse(null)} title={`Reverse ${reverse?.number}`} statement="Posts a linked reversal journal and rolls back each asset's accumulated depreciation. Later runs must be reversed first." confirmLabel="Reverse run" cancelLabel="Keep run" danger reasonRequired consequences={[{ engine: 'Journal', text: `Reversal of ${reverse?.journalNumber} dated today`, tone: 'danger' }, { engine: 'Statutory', text: 'Period becomes available for a corrected run', tone: 'info' }]} onConfirm={(reason) => { if (!reverse) return; reverseDepreciation(reverse, reason); toast.success('Run reversed'); setSelected(null); }} />
    </div>
  );
}

export function CategoriesPage() {
  const s = useSession();
  const toast = useToast();
  const cats = useCollection<AssetCategory>(C.assetCategories).filter((c) => !c.companyId || c.companyId === s.state.companyId);
  const assets = useAssets();
  const accOpts = useAccountOptions();
  const [edit, setEdit] = useState<Partial<AssetCategory> | null>(null);
  const save = () => {
    if (!edit?.name || !edit.code) { toast.error('Code and name are required'); return; }
    if (edit.id) db.update<AssetCategory>(C.assetCategories, edit.id, edit); else db.insert<AssetCategory>(C.assetCategories, { assetAccountId: IDS.accPPE, depreciationAccountId: IDS.accDep, accumulatedAccountId: IDS.accAccDep, status: 'Active', method: 'WDV', ratePct: 15, usefulLifeYears: 10, ...edit });
    toast.success(`Category ${edit.name} saved`); setEdit(null);
  };
  return (
    <>
      <RegisterPage<AssetCategory> title="Asset categories" subtitle="Default method, rate, life and accounts per category — copied to the asset on capitalization" rows={cats} columns={[
        { key: 'code', label: 'Code', render: (c) => <span className="identifier">{c.code}</span> }, { key: 'name', label: 'Category', sortable: true },
        { key: 'method', label: 'Method', render: (c) => `${c.method} ${c.ratePct}%` }, { key: 'usefulLifeYears', label: 'Useful life', render: (c) => `${c.usefulLifeYears} yrs` },
        { key: 'assetAccountId', label: 'Asset account', render: (c) => db.find<any>(C.accounts, c.assetAccountId)?.name ?? c.assetAccountId },
        { key: 'depreciationAccountId', label: 'Depreciation / accumulated', render: (c) => <span style={{ fontSize: 12 }}>{db.find<any>(C.accounts, c.depreciationAccountId)?.code} / {db.find<any>(C.accounts, c.accumulatedAccountId)?.code}</span> },
        { key: 'count', label: 'Assets', align: 'right', render: (c) => assets.filter((a) => a.categoryId === c.id && a.status !== 'Disposed').length },
        { key: 'nbv', label: 'NBV', align: 'right', render: (c) => <span className="money">{fmtMoney(assets.filter((a) => a.categoryId === c.id && a.status !== 'Disposed').reduce((x, a) => x + nbv(a), 0), s.currency)}</span> },
        { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
      ]} entity="categories" searchKeys={['code', 'name']} primaryAction={{ label: 'New category', onClick: () => setEdit({ method: 'WDV', ratePct: 15, usefulLifeYears: 10, assetAccountId: IDS.accPPE, depreciationAccountId: IDS.accDep, accumulatedAccountId: IDS.accAccDep, status: 'Active' }) }} onRowClick={(c) => setEdit(c)} rowActions={(c) => [{ label: 'Edit', onClick: () => setEdit(c) }, { label: c.status === 'Active' ? 'Deactivate' : 'Activate', onClick: () => db.update<AssetCategory>(C.assetCategories, c.id, { status: c.status === 'Active' ? 'Inactive' : 'Active' }) }]} emptyTitle="No categories" />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New category'} width={520} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save category</Button></>}>
        {edit && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid-2"><TextField label="Code" required value={edit.code} onChange={(v) => setEdit({ ...edit, code: v })} uppercase /><TextField label="Name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /><SelectField label="Method" value={edit.method} onChange={(v) => setEdit({ ...edit, method: v as any })} options={['WDV', 'SLM']} /><NumberField label="Rate %" value={edit.ratePct} onChange={(v) => setEdit({ ...edit, ratePct: v })} suffix="%" /><NumberField label="Useful life (years)" value={edit.usefulLifeYears} onChange={(v) => setEdit({ ...edit, usefulLifeYears: v })} decimals={0} /></div>
          <EntityPicker label="Asset account" value={edit.assetAccountId} onChange={(v) => setEdit({ ...edit, assetAccountId: v })} options={accOpts} />
          <EntityPicker label="Depreciation expense account" value={edit.depreciationAccountId} onChange={(v) => setEdit({ ...edit, depreciationAccountId: v })} options={accOpts} />
          <EntityPicker label="Accumulated depreciation account" value={edit.accumulatedAccountId} onChange={(v) => setEdit({ ...edit, accumulatedAccountId: v })} options={accOpts} />
        </div>}
      </Drawer>
    </>
  );
}

export function AssetReports() {
  const s = useSession();
  const assets = useAssets();
  const runs = useCollection<DepreciationRun>(C.depreciationRuns);
  const journals = useCollection<Journal>(C.journals);
  const [tab, setTab] = useState<'register' | 'schedule' | 'movement'>('register');
  const fy = fyRange(`${s.state.periodCode ?? '2026-09'}-01`, s.company?.fiscalYearStartMonth ?? 4);
  const fyPeriods = periodsBetween(fy);
  const live = assets.filter((a) => a.status !== 'Disposed');
  const posted = (a: Asset, p: string) => runs.filter((r) => r.status === 'Posted' && r.period === p).flatMap((r) => r.lines).filter((l) => l.assetId === a.id).reduce((x, l) => x + l.depreciation, 0);
  const schedule = live.map((a) => { const proj = projectSchedule({ ...a, postedDepreciation: a.postedDepreciation }, s.state.periodCode ?? '2026-09', 12); return { id: a.id, a, months: fyPeriods.map((p) => (p < (s.state.periodCode ?? '2026-09') ? posted(a, p) : proj.find((x) => x.period === p)?.depreciation ?? 0)) }; });
  const movement = { opening: live.reduce((x, a) => x + a.cost + a.revaluation, 0) - assets.filter((a) => a.capitalizationDate >= fy.from && a.status !== 'Disposed').reduce((x, a) => x + a.cost, 0), additions: assets.filter((a) => a.capitalizationDate >= fy.from && a.capitalizationDate <= fy.to).reduce((x, a) => x + a.cost, 0), disposals: assets.filter((a) => a.disposal && a.disposal.date >= fy.from && a.disposal.date <= fy.to).reduce((x, a) => x + a.cost, 0), depreciation: runs.filter((r) => r.status === 'Posted' && r.period >= fy.from.slice(0, 7) && r.period <= fy.to.slice(0, 7)).reduce((x, r) => x + r.total, 0) };
  const ledgerPpe = journals.length ? (db.find<any>(C.accounts, IDS.accPPE)?.openingBalance ?? 0) + journals.filter((j) => j.status === 'Posted').flatMap((j) => j.lines).filter((l) => l.accountId === IDS.accPPE).reduce((x, l) => x + l.drBase - l.crBase, 0) : 0;
  return (
    <div className="page">
      <div className="page-header"><div><h1 className="page-title">Asset reports</h1><div className="page-subtitle"><ScopeLine extra={`FY ${s.state.fy}`} /></div></div><div style={{ display: 'flex', gap: 8 }}><Segmented value={tab} onChange={setTab} options={[{ value: 'register', label: 'Register with NBV' }, { value: 'schedule', label: 'Depreciation schedule (FY)' }, { value: 'movement', label: 'Additions & disposals' }]} /><Button variant="secondary" onClick={() => downloadText(`asset-${tab}.csv`, toCSV(tab === 'register' ? live.map((a) => ({ number: a.number, name: a.name, category: a.categoryName, cost: a.cost, accumulated: accumulated(a), nbv: nbv(a), method: methodLabel(a), inService: a.inServiceDate, status: a.status })) : tab === 'schedule' ? schedule.map((r) => ({ number: r.a.number, name: r.a.name, ...Object.fromEntries(fyPeriods.map((p, i) => [p, r.months[i]])) })) : [movement]))}>Export CSV</Button></div></div>
      {tab === 'register' && <DataTable rows={live} dense columns={[{ key: 'number', label: 'Asset', render: (a) => <div><span className="identifier link">{a.number}</span><div className="cell-secondary">{a.name}</div></div> }, { key: 'categoryName', label: 'Category' }, { key: 'cost', label: 'Gross block', align: 'right', render: (a) => <span className="money">{fmtMoney(a.cost + a.revaluation, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, a) => x + a.cost + a.revaluation, 0), s.currency)}</span> }, { key: 'acc', label: 'Accumulated', align: 'right', render: (a) => <span className="money" style={{ color: 'var(--danger)' }}>{fmtMoney(accumulated(a) + a.impairment, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, a) => x + accumulated(a) + a.impairment, 0), s.currency)}</span> }, { key: 'nbv', label: 'NBV', align: 'right', render: (a) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(nbv(a), s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, a) => x + nbv(a), 0), s.currency)}</span> }, { key: 'method', label: 'Method', render: (a) => methodLabel(a) }, { key: 'inServiceDate', label: 'In service', render: (a) => fmtDate(a.inServiceDate) }, { key: 'status', label: 'Status', render: (a) => <Badge status={a.status === 'New' ? 'Submitted' : a.status}>{a.status}</Badge> }]} showTotals onRowClick={(a) => nav.go(`fixed-assets/register/${a.id}`)} />}
      {tab === 'schedule' && <div className="card" style={{ overflow: 'auto' }}><table className="data-table dense"><thead><tr><th>Asset</th>{fyPeriods.map((p) => <th key={p} className="right">{fmtPeriod(p).slice(0, 3)}</th>)}<th className="right">FY total</th></tr></thead><tbody>{schedule.map((r) => <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => nav.go(`fixed-assets/register/${r.id}?tab=schedule`)}><td><div className="cell-primary">{r.a.name}</div><div className="cell-secondary identifier">{r.a.number}</div></td>{r.months.map((m, i) => <td key={i} className="right money" style={{ color: fyPeriods[i] < (s.state.periodCode ?? '') ? 'var(--ink)' : 'var(--ink-4)' }}>{m ? fmtMoney(m, s.currency) : '—'}</td>)}<td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(r.months.reduce((x, y) => x + y, 0), s.currency)}</td></tr>)}<tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}><td>Total</td>{fyPeriods.map((_, i) => <td key={i} className="right money">{fmtMoney(schedule.reduce((x, r) => x + r.months[i], 0), s.currency)}</td>)}<td className="right money">{fmtMoney(schedule.reduce((x, r) => x + r.months.reduce((a, b) => a + b, 0), 0), s.currency)}</td></tr></tbody></table><div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--ink-4)' }}>Posted months in black · projected months in grey.</div></div>}
      {tab === 'movement' && <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}><table className="data-table dense"><tbody>
          {[['Opening gross block', movement.opening], ['Add: additions (capitalized this FY)', movement.additions], ['Less: disposals (cost)', -movement.disposals], ['Closing gross block', movement.opening + movement.additions - movement.disposals], ['Depreciation charged this FY', movement.depreciation], ['Closing NBV (in books)', live.reduce((x, a) => x + nbv(a), 0)]].map(([l, v], i) => <tr key={i} style={{ fontWeight: i === 3 || i === 5 ? 700 : 400, background: i === 3 || i === 5 ? 'var(--surface-2)' : undefined }}><td>{l}</td><td className="right money" style={{ color: Number(v) < 0 ? 'var(--danger)' : undefined }}>{fmtMoney(Number(v), s.currency)}</td></tr>)}
        </tbody></table></div>
        <div className="card" style={{ padding: 16 }}><div className="section-title">Reconciliation to ledger</div><div style={{ fontSize: 13 }}>PPE ledger balance (1500): <strong className="money">{fmtMoney(ledgerPpe, s.currency)}</strong> · register gross block (PPE categories): <strong className="money">{fmtMoney(live.filter((a) => a.assetAccountId === IDS.accPPE).reduce((x, a) => x + a.cost + a.revaluation, 0), s.currency)}</strong></div><div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>Additions this FY: {assets.filter((a) => a.capitalizationDate >= fy.from).map((a) => a.number).join(', ') || 'none'} · Disposals: {assets.filter((a) => a.disposal && a.disposal.date >= fy.from).map((a) => a.number).join(', ') || 'none'}</div></div>
      </div>}
    </div>
  );
}
