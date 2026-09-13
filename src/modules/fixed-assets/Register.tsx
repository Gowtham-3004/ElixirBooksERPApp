// Asset register (FR-AST-001) + asset detail page (identity rail, schedule, events, attachments, activity).
import { useMemo, useState } from 'react';
import { C, db, nav, useSession, useCollection, useRecord } from '../../store';
import { RegisterPage, Badge, Button, DocumentPage, RailSection, KV, DataTable, AttachmentsPanel, ActivityTab, AccountingTab, Timeline, EmptyState, Pill, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPeriod } from '../../lib/format';
import type { Asset, AssetEvent } from './types';
import { nbv, accumulated, methodLabel, projectSchedule } from './calc';
import { TransferDrawer, RevalueDrawer, DisposeDrawer } from './Events';

export function useAssets(): Asset[] {
  const s = useSession();
  return useCollection<Asset>(C.assets).filter((a) => !a.companyId || a.companyId === s.state.companyId);
}

export function AssetRegister() {
  const s = useSession();
  const assets = useAssets();
  const cats = useCollection<any>(C.assetCategories);
  const live = assets.filter((a) => a.status !== 'Disposed');
  const totals = { cost: live.reduce((x, a) => x + a.cost, 0), acc: live.reduce((x, a) => x + accumulated(a), 0), nbv: live.reduce((x, a) => x + nbv(a), 0) };
  const cols: Column<Asset>[] = [
    { key: 'number', label: 'Asset ID', render: (a) => <span className="identifier link">{a.number}</span>, sortable: true },
    { key: 'name', label: 'Name', render: (a) => <div><div className="cell-primary">{a.name}</div>{a.custodianName && <div className="cell-secondary">{a.custodianName}</div>}</div>, sortable: true },
    { key: 'categoryName', label: 'Category', sortable: true },
    { key: 'location', label: 'Location', render: (a) => <span style={{ fontSize: 12, color: '#5F6368' }}>{a.location}</span> },
    { key: 'cost', label: 'Cost', align: 'right', render: (a) => <span className="money">{fmtMoney(a.cost, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(totals.cost, s.currency)}</span>, sortable: true },
    { key: 'acc', label: 'Accum. dep.', align: 'right', render: (a) => <span className="money" style={{ color: '#C0393F' }}>{fmtMoney(accumulated(a), s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 600, color: '#C0393F' }}>{fmtMoney(totals.acc, s.currency)}</span>, value: (a) => accumulated(a) },
    { key: 'nbv', label: 'WDV / NBV', align: 'right', render: (a) => <span className="money" style={{ fontWeight: 600, color: nbv(a) === 0 ? '#B0B5BF' : '#0A0A0A' }}>{fmtMoney(nbv(a), s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(totals.nbv, s.currency)}</span>, value: (a) => nbv(a), sortable: true },
    { key: 'method', label: 'Method', render: (a) => <span style={{ fontSize: 11, color: '#5F6368' }}>{methodLabel(a)}</span> },
    { key: 'inServiceDate', label: 'In service', render: (a) => fmtDate(a.inServiceDate), sortable: true },
    { key: 'status', label: 'Status', render: (a) => <Badge status={a.status === 'New' ? 'Submitted' : a.status}>{a.status}</Badge> },
  ];
  return (
    <RegisterPage<Asset> title="Asset register" subtitle={`${live.length} assets · cost ${fmtMoney(totals.cost, s.currency)} · NBV ${fmtMoney(totals.nbv, s.currency)} · ${assets.filter((a) => a.status === 'Disposed').length} disposed`} rows={assets} columns={cols} entity="assets" searchKeys={['number', 'name', 'categoryName', 'location', 'custodianName', 'serialNo']}
      primaryAction={{ label: 'Add asset', onClick: () => nav.go('fixed-assets/capitalize') }}
      tabs={[{ id: 'live', label: 'In books', filter: (a) => a.status !== 'Disposed' }, { id: 'all', label: 'All' }, { id: 'new', label: 'New', filter: (a) => a.status === 'New' }, { id: 'full', label: 'Fully depreciated', filter: (a) => a.status === 'Fully Depreciated' }, { id: 'disposed', label: 'Disposed', filter: (a) => a.status === 'Disposed' }]}
      filters={[{ key: 'categoryId', label: 'Category', type: 'select', options: cats.map((c) => ({ value: c.id, label: c.name })) }, { key: 'location', label: 'Location', type: 'select', options: Array.from(new Set(assets.map((a) => a.location))).map((l) => ({ value: l, label: l })) }]} applyFilter={(a, v) => (!v.categoryId || a.categoryId === v.categoryId) && (!v.location || a.location === v.location)}
      onRowClick={(a) => nav.go(`fixed-assets/register/${a.id}`)} showTotals
      rowActions={(a) => [{ label: 'Open', onClick: () => nav.go(`fixed-assets/register/${a.id}`) }, { label: 'Transfer', onClick: () => nav.go(`fixed-assets/transfers?asset=${a.id}`), disabled: a.status === 'Disposed' }, { label: 'Dispose', danger: true, onClick: () => nav.go(`fixed-assets/disposals?asset=${a.id}`), disabled: a.status === 'Disposed' }]}
      emptyTitle="No assets yet" emptyDescription="Capitalize from a vendor invoice or add an asset manually." />
  );
}

export function AssetDetail({ id }: { id: string }) {
  const s = useSession();
  const a = useRecord<Asset>(C.assets, id);
  const events = useCollection<AssetEvent>(C.assetEvents).filter((e) => e.assetId === id).sort((x, y) => y.date.localeCompare(x.date) || y.createdAt.localeCompare(x.createdAt));
  const [drawer, setDrawer] = useState<'transfer' | 'revalue' | 'dispose' | null>(null);
  const [tab, setTab] = useState('overview');
  const schedule = useMemo(() => (a ? projectSchedule(a, s.state.periodCode ?? '2026-09', 36) : []), [a, s.state.periodCode]);
  if (!a) return <EmptyState title="Asset not found" action={<Button variant="secondary" onClick={() => nav.go('fixed-assets/register')}>Back to register</Button>} />;
  const custodian = db.find<any>(C.employees, a.custodianId);
  const branch = db.find<any>(C.branches, a.branchId);
  const rail = (
    <>
      <RailSection label="Identity"><KV items={[{ k: 'Category', v: a.categoryName }, { k: 'Location', v: `${a.location}${branch ? ' · ' + branch.name : ''}` }, { k: 'Custodian', v: custodian ? <span className="link" onClick={() => nav.go(`masters/employees/${custodian.id}`)}>{custodian.name}</span> : a.custodianName ?? '—' }, { k: 'Serial / qty', v: `${a.serialNo ?? '—'}${a.quantity ? ' · ' + a.quantity + ' units' : ''}` }]} /></RailSection>
      <RailSection label="Dates"><KV items={[{ k: 'Acquired', v: fmtDate(a.acquisitionDate) }, { k: 'Capitalized', v: fmtDate(a.capitalizationDate) }, { k: 'In service', v: fmtDate(a.inServiceDate) }, { k: 'Warranty', v: a.warrantyUntil ? fmtDate(a.warrantyUntil) : '—' }, ...(a.disposal ? [{ k: 'Disposed', v: fmtDate(a.disposal.date) }] : [])]} /></RailSection>
      <RailSection label="Depreciation" snapshot><KV items={[{ k: 'Method', v: methodLabel(a) }, { k: 'Useful life', v: `${a.usefulLifeYears} years` }, { k: 'Residual', v: fmtMoney(a.residual, s.currency) }, { k: 'Opening accum.', v: fmtMoney(a.openingAccumulated, s.currency) }, { k: 'Posted since', v: fmtMoney(a.postedDepreciation, s.currency) }]} /></RailSection>
      <RailSection label="Accounts & dimensions"><KV items={[{ k: 'Asset', v: db.find<any>(C.accounts, a.assetAccountId)?.name }, { k: 'Depreciation', v: db.find<any>(C.accounts, a.depreciationAccountId)?.name }, { k: 'Accumulated', v: db.find<any>(C.accounts, a.accumulatedAccountId)?.name }, ...Object.entries(a.dimensions ?? {}).map(([k, v]) => ({ k, v: <span className="dim-chip">{db.find<any>(C.dimensions, v)?.code ?? v}</span> }))]} /></RailSection>
      <RailSection label="Source"><KV items={[{ k: 'Origin', v: a.sourceType ?? 'Manual' }, { k: 'Document', v: a.sourceNumber ? <span className={a.sourceId ? 'link identifier' : 'identifier'} onClick={() => a.sourceId && nav.go(`purchase/vendor-invoices/${a.sourceId}`)}>{a.sourceNumber}</span> : '—' }, { k: 'Supplier', v: a.supplierName ?? '—' }, { k: 'Journal', v: a.journalNumber ? <span className="identifier link" onClick={() => a.journalId && nav.go(`accounting/journals/${a.journalId}`)}>{a.journalNumber}</span> : '—' }]} /></RailSection>
    </>
  );
  const tabs = [
    { id: 'overview', label: 'Overview', content: (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="grid-4">
          {[['Cost', a.cost], ['Revaluation / (impairment)', a.revaluation - a.impairment], ['Accumulated depreciation', -accumulated(a)], ['Net book value', nbv(a)]].map(([l, v]) => <div key={String(l)} className="kpi-tile"><span className="section-label">{l}</span><div className="money" style={{ fontSize: 20, fontWeight: 600, color: Number(v) < 0 ? '#C0393F' : '#0A0A0A' }}>{fmtMoney(Number(v), s.currency)}</div></div>)}
        </div>
        {a.disposal && <div className="card" style={{ padding: 16 }}><div className="section-title">Disposal</div><KV columns={2} items={[{ k: 'Date', v: fmtDate(a.disposal.date) }, { k: 'Buyer', v: a.disposal.buyer ?? '—' }, { k: 'Proceeds', v: fmtMoney(a.disposal.proceeds, s.currency) }, { k: 'NBV at disposal', v: fmtMoney(a.disposal.nbvAtDisposal, s.currency) }, { k: 'Gain / (loss)', v: <span style={{ color: a.disposal.gainLoss >= 0 ? '#12784E' : '#C0393F', fontWeight: 600 }}>{fmtMoney(a.disposal.gainLoss, s.currency)}</span> }, { k: 'Journal', v: a.disposal.journalNumber ?? '—' }, { k: 'Reason', v: a.disposal.reason }]} /></div>}
        <div className="card" style={{ padding: 16 }}><div className="section-title">Description & notes</div><div style={{ fontSize: 13 }}>{a.description ?? '—'}</div>{a.notes && <div style={{ fontSize: 12, color: '#5F6368', marginTop: 6 }}>{a.notes}</div>}</div>
      </div>) },
    { id: 'schedule', label: 'Depreciation schedule', content: schedule.length ? <DataTable rows={schedule.map((r) => ({ ...r, id: r.period }))} dense columns={[{ key: 'period', label: 'Period', render: (r) => fmtPeriod(r.period) }, { key: 'openingNbv', label: 'Opening NBV', align: 'right', render: (r) => <span className="money">{fmtMoney(r.openingNbv, s.currency)}</span> }, { key: 'depreciation', label: 'Depreciation', align: 'right', render: (r) => <span className="money" style={{ color: '#C0393F' }}>{fmtMoney(r.depreciation, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.depreciation, 0), s.currency)}</span> }, { key: 'closingNbv', label: 'Closing NBV', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.closingNbv, s.currency)}</span> }]} showTotals /> : <EmptyState compact title="Nothing left to depreciate" description={a.status === 'Disposed' ? 'Asset is disposed.' : 'Net book value has reached residual value.'} /> },
    { id: 'events', label: `Events (${events.length})`, content: <Timeline items={events.map((e) => ({ type: e.type === 'Disposed' || e.type === 'Impaired' ? 'warning' : e.type === 'Depreciated' ? 'neutral' : 'success', event: e.type, predicate: `by ${e.by}${e.status === 'Pending' ? ' · awaiting approval' : ''}`, time: e.createdAt.startsWith(e.date) ? e.createdAt : `${e.date}T10:00:00.000Z`, note: e.detail + (e.reason ? ` — ${e.reason}` : ''), meta: e.journalNumber ? <span className="link identifier" onClick={() => e.journalId && nav.go(`accounting/journals/${e.journalId}`)}>{e.journalNumber}</span> : undefined }))} /> },
    { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={a.journalId ?? a.disposal?.journalId} currency={s.currency} /> },
    { id: 'attachments', label: 'Attachments', content: <AttachmentsPanel objectType="Asset" objectId={a.id} /> },
    { id: 'activity', label: 'Activity', content: <ActivityTab objectId={a.id} correlationId={a.correlationId} /> },
  ];
  const disposed = a.status === 'Disposed';
  return (
    <>
      <DocumentPage backLabel="Asset register" onBack={() => nav.go('fixed-assets/register')} number={a.number} badges={<><Badge status={a.status === 'New' ? 'Submitted' : a.status}>{a.status}</Badge><Pill tone="neutral">{a.categoryName}</Pill>{events.some((e) => e.status === 'Pending') && <Pill tone="warning">Transfer awaiting approval</Pill>}</>}
        amount={{ label: 'Net book value', value: nbv(a), currency: s.currency }} rail={rail} tabs={tabs} activeTab={tab} onTab={setTab}
        footer={<><Button variant="secondary" onClick={() => setDrawer('transfer')} disabled={disposed}>Transfer</Button><Button variant="secondary" onClick={() => setDrawer('revalue')} disabled={disposed}>Revalue / impair</Button><Button variant="danger" onClick={() => setDrawer('dispose')} disabled={disposed} reason={disposed ? 'Already disposed' : undefined}>Dispose</Button></>} />
      <TransferDrawer asset={drawer === 'transfer' ? a : null} onClose={() => setDrawer(null)} />
      <RevalueDrawer asset={drawer === 'revalue' ? a : null} onClose={() => setDrawer(null)} />
      <DisposeDrawer asset={drawer === 'dispose' ? a : null} onClose={() => setDrawer(null)} />
    </>
  );
}

