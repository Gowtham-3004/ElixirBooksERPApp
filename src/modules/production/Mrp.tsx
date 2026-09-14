// MRP — run parameters, net requirements, suggestions with accept/reject/convert, run history (FR-MFG-005/006).
import { useMemo, useState } from 'react';
import { C, nav, useCollection, useRecord, useSession } from '../../store';
import { Button, Badge, NumberField, CheckboxField, SelectField, EntityPicker, useWarehouseOptions, DataTable, SummaryBlock, ScopeLine, useToast, KpiTile, Tabs, EmptyState, Pill, Explain, type Column } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, today } from '../../lib/format';
import type { MrpParams, MrpRun, MrpSuggestion } from './types';
import { mfgSettings } from './core';
import { convertAccepted, runMrp, saveRun, setSuggestionStatus, type MrpResult } from './planning';
import { useConfirm, SectionCard, DocLink } from './shared';

export function MrpPage({ id }: { id?: string }) {
  const s = useSession();
  const cid = s.state.companyId;
  const runs = useCollection<MrpRun>(C.mrpRuns).filter((r) => r.companyId === cid).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const current = useRecord<MrpRun>(C.mrpRuns, id);
  const whs = useWarehouseOptions().filter((w) => w.raw?.type === 'Standard');
  const toast = useToast();
  const [p, setP] = useState<MrpParams>({ horizonDays: 30, includeSafetyStock: true, lotSizing: 'Lot-for-lot', warehouseId: undefined, includeDrafts: false });
  const [preview, setPreview] = useState<MrpResult | null>(null);
  const [tab, setTab] = useState<'run' | 'history'>(id ? 'run' : 'run');
  const settings = mfgSettings();
  const run = () => {
    try {
      const r = runMrp(p);
      setPreview(r);
      toast.info(`${r.details.length} items planned · ${r.suggestions.length} suggestion(s)`);
    } catch (e: any) { toast.error(e.message); }
  };
  const save = () => { if (!preview) return; const r = saveRun(p, preview); setPreview(null); nav.go(`production/mrp/${r.id}`); toast.success(`${r.number} saved — review the suggestions`); };
  if (current) return <RunDetail run={current} />;
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">MRP</h1><div className="page-subtitle"><ScopeLine extra={`${runs.length} runs · policy: ${settings.autoReleaseThreshold > 0 ? `auto-release below ${fmtMoney(settings.autoReleaseThreshold, s.currency)}` : 'review every suggestion'}`} /></div></div>
        <Tabs variant="filter" tabs={[{ id: 'run', label: 'New run' }, { id: 'history', label: 'Run history', count: runs.length }]} value={tab} onChange={setTab} />
      </div>
      {tab === 'run' && (
        <>
          <SectionCard title="Parameters">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, alignItems: 'end' }}>
              <NumberField label="Planning horizon (days)" value={p.horizonDays} onChange={(v) => setP({ ...p, horizonDays: Math.max(1, v) })} decimals={0} help={`Demand and supply up to ${fmtDate(new Date(Date.now() + p.horizonDays * 86400000).toISOString().slice(0, 10))}`} />
              <SelectField label="Lot sizing" value={p.lotSizing} onChange={(v) => setP({ ...p, lotSizing: v })} options={[{ value: 'Lot-for-lot', label: 'Lot-for-lot (exact shortfall)' }, { value: 'Fixed qty', label: 'Fixed qty (item reorder qty)' }, { value: 'Min order', label: 'Min order qty' }]} />
              <EntityPicker label="Planning warehouse" value={p.warehouseId} onChange={(v) => setP({ ...p, warehouseId: v })} options={whs} placeholder="All standard warehouses" help="Transfers are suggested only for a single warehouse" />
              <CheckboxField checked={p.includeSafetyStock} onChange={(v) => setP({ ...p, includeSafetyStock: v })} label="Include safety stock" />
              <CheckboxField checked={p.includeDrafts} onChange={(v) => setP({ ...p, includeDrafts: v })} label="Include draft sales orders" />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <Button variant="primary" onClick={run}>Run MRP</Button>
              {preview && <Button onClick={save}>Save run & review suggestions</Button>}
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Net requirement = sales demand + dependent demand (open orders + suggested production exploded through the BOM) + safety stock − (on hand − reserved + open POs + planned receipts).</span>
            </div>
          </SectionCard>
          {preview ? <ResultTables details={preview.details} suggestions={preview.suggestions} currency={s.currency} /> : <EmptyState title="Run MRP to compute net requirements" description="Suggestions are never converted automatically — you accept, reject and convert them after reviewing." icon="📐" />}
        </>
      )}
      {tab === 'history' && (
        <DataTable rows={runs} columns={[
          { key: 'number', label: 'Run', render: (r) => <span className="identifier link" style={{ fontWeight: 500 }}>{r.number}</span> },
          { key: 'date', label: 'Date', render: (r) => <span>{fmtDateTime(r.createdAt)}</span> },
          { key: 'params', label: 'Parameters', render: (r) => <span style={{ fontSize: 12 }}>{r.params.horizonDays} d · {r.params.lotSizing} · {r.params.includeSafetyStock ? 'safety stock' : 'no safety'} · {r.params.warehouseId ? 'single warehouse' : 'all warehouses'}</span> },
          { key: 'items', label: 'Items', align: 'right', render: (r) => <span className="money">{r.summary.itemsPlanned}</span> },
          { key: 'sug', label: 'Suggestions', render: (r) => <span style={{ fontSize: 12 }}>{r.summary.production} production · {r.summary.purchase} purchase · {r.summary.transfer} transfer</span> },
          { key: 'value', label: 'Est. value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.summary.value, s.currency)}</span> },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Completed' ? 'Ready' : r.status === 'Converted' ? 'Converted' : 'Partial'}>{r.status}</Badge> },
          { key: 'runBy', label: 'Run by' },
        ] as Column<MrpRun>[]} onRowClick={(r) => nav.go(`production/mrp/${r.id}`)} emptyTitle="No MRP runs yet" />
      )}
    </div>
  );
}

function RunDetail({ run }: { run: MrpRun }) {
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<'suggestions' | 'requirements'>('suggestions');
  const counts = useMemo(() => ({ suggested: run.suggestions.filter((x) => x.status === 'Suggested').length, accepted: run.suggestions.filter((x) => x.status === 'Accepted').length, rejected: run.suggestions.filter((x) => x.status === 'Rejected').length, converted: run.suggestions.filter((x) => x.status === 'Converted').length }), [run]);
  const convert = () => confirm.open({
    title: `Convert ${counts.accepted} accepted suggestion(s)?`,
    statement: 'Purchase suggestions become Draft purchase orders grouped by preferred supplier; production suggestions become Planned production orders. Nothing is approved or released automatically.',
    consequences: [{ engine: 'Numbering', text: 'PO and production order numbers are allocated' }, { engine: 'Workflow', text: mfgSettings().autoReleaseThreshold > 0 ? `Production orders under ${fmtMoney(mfgSettings().autoReleaseThreshold, s.currency)} are auto-released by policy` : 'Orders wait for review and release' }, { engine: 'Notification', text: 'Planner is notified with links to the new documents' }],
    confirmLabel: 'Convert accepted', cancelLabel: 'Keep reviewing',
    onConfirm: () => { const r = convertAccepted(run.id); toast.success(`${r.pos.length} draft PO(s) · ${r.orders.length} production order(s)${r.skipped.length ? ` · ${r.skipped.length} skipped` : ''}`); r.skipped.forEach((m) => toast.info(m)); },
  });
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button type="button" className="btn-link" style={{ color: 'var(--ink-3)', marginBottom: 6 }} onClick={() => nav.go('production/mrp')}>← MRP runs</button>
          <h1 className="page-title">{run.number} <Badge status={run.status === 'Completed' ? 'Ready' : run.status === 'Converted' ? 'Converted' : 'Partial'}>{run.status}</Badge></h1>
          <div className="page-subtitle">Run {fmtDateTime(run.createdAt)} by {run.runBy} · horizon {run.params.horizonDays} d · {run.params.lotSizing} · {run.params.includeSafetyStock ? 'safety stock included' : 'no safety stock'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={() => nav.go('production/mrp')}>New run</Button>
          <Button variant="primary" onClick={convert} disabled={counts.accepted === 0} reason={counts.accepted === 0 ? 'Accept at least one suggestion' : undefined}>Convert accepted ({counts.accepted})</Button>
        </div>
      </div>
      <div className="grid-4">
        <KpiTile label="Items planned" value={run.summary.itemsPlanned} sub={`${run.summary.shortfalls} with shortfall`} />
        <KpiTile label="Suggestions" value={run.suggestions.length} sub={`${run.summary.production} production · ${run.summary.purchase} purchase · ${run.summary.transfer} transfer`} />
        <KpiTile label="Estimated value" amount={run.summary.value} currency={s.currency} sub="At standard / purchase price" />
        <KpiTile label="Review progress" value={`${counts.converted + counts.rejected} / ${run.suggestions.length}`} sub={`${counts.suggested} pending · ${counts.accepted} accepted · ${counts.converted} converted`} />
      </div>
      <Tabs variant="filter" tabs={[{ id: 'suggestions', label: 'Suggestions', count: run.suggestions.length }, { id: 'requirements', label: 'Net requirements', count: run.details.length }]} value={view} onChange={setView} />
      {view === 'suggestions' ? <SuggestionTable run={run} /> : <ResultTables details={run.details} suggestions={[]} currency={s.currency} onlyDetails />}
      {confirm.dialog}
    </div>
  );
}

function SuggestionTable({ run }: { run: MrpRun }) {
  const s = useSession();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rows = run.suggestions;
  const act = (ids: string[], status: 'Accepted' | 'Rejected' | 'Suggested') => { setSuggestionStatus(run.id, ids, status); setSelected(new Set()); };
  const columns: Column<MrpSuggestion>[] = [
    { key: 'type', label: 'Type', render: (x) => <Badge status={x.type === 'Production' ? 'In Progress' : x.type === 'Purchase' ? 'Submitted' : 'Draft'}>{x.type}</Badge> },
    { key: 'itemName', label: 'Item', render: (x) => <div><div>{x.itemName}</div><div className="cell-secondary identifier">{x.itemCode}</div></div> },
    { key: 'qty', label: 'Qty', align: 'right', render: (x) => <span className="money">{fmtQty(x.qty, x.uom, 3)}</span> },
    { key: 'orderBy', label: 'Order by → need by', render: (x) => <span style={{ fontSize: 12 }}>{fmtDate(x.orderBy)} → {fmtDate(x.needBy)}{x.orderBy < today() && x.status !== 'Converted' && <Pill tone="critical" title="Order-by date has passed">Late</Pill>}</span> },
    { key: 'source', label: 'Source / supplier', render: (x) => <span style={{ fontSize: 12 }}>{x.type === 'Purchase' ? x.supplierName ?? 'No preferred supplier' : x.type === 'Transfer' ? 'Inter-warehouse' : 'Active BOM'}</span> },
    { key: 'reason', label: 'Reason & pegging', render: (x) => <Explain title={`${x.itemName} · ${x.qty} ${x.uom}`} rows={[{ k: 'Reason', v: x.reason }, ...x.demandRefs.map((d) => ({ k: d.type, v: `${d.number} · ${d.qty} · ${fmtDate(d.date)}` }))]} note={x.demandRefs.length ? `${x.demandRefs.length} demand reference(s)` : 'Safety-stock / replenishment driven'} /> },
    { key: 'estValue', label: 'Est. value', align: 'right', render: (x) => <span className="money">{fmtMoney(x.estValue, s.currency)}</span>, total: (r) => <span className="money">{fmtMoney(r.reduce((a, x) => a + x.estValue, 0), s.currency)}</span> },
    { key: 'status', label: 'Status', render: (x) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={x.status === 'Suggested' ? 'Pending' : x.status === 'Accepted' ? 'Approved' : x.status} />{x.convertedDocNumber && <DocLink path={x.convertedDocType === 'Purchase Order' ? `purchase/orders/${x.convertedDocId}` : x.convertedDocType === 'Production Order' ? `production/orders/${x.convertedDocId}` : undefined} number={x.convertedDocNumber} />}</span> },
    { key: 'act', label: '', render: (x) => x.status === 'Converted' ? null : <span style={{ display: 'inline-flex', gap: 4 }}>{x.status !== 'Accepted' && <Button size="sm" variant="tinted" onClick={() => act([x.id], 'Accepted')}>Accept</Button>}{x.status !== 'Rejected' && <Button size="sm" variant="tinted" tone="danger" onClick={() => act([x.id], 'Rejected')}>Reject</Button>}{x.status !== 'Suggested' && <Button size="sm" variant="ghost" onClick={() => act([x.id], 'Suggested')}>Undo</Button>}</span> },
  ];
  return (
    <div>
      {selected.size > 0 && <div className="bulk-bar" style={{ marginBottom: 8 }}><strong>{selected.size} selected</strong><Button size="sm" variant="tinted" tone="danger" onClick={() => act(Array.from(selected), 'Accepted')}>Accept</Button><Button size="sm" onClick={() => act(Array.from(selected), 'Rejected')}>Reject</Button><Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Clear</Button></div>}
      <DataTable rows={rows} columns={columns} selectable selected={selected} onSelect={setSelected} emptyTitle="No shortfalls" emptyDescription="Supply covers every demand inside the horizon." />
    </div>
  );
}

function ResultTables({ details, suggestions, currency, onlyDetails }: { details: MrpRun['details']; suggestions: MrpSuggestion[]; currency: string; onlyDetails?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {!onlyDetails && (
        <SectionCard title={`Suggestions (${suggestions.length}) — save the run to accept / reject`} padding={0}>
          <DataTable rows={suggestions} columns={[
            { key: 'type', label: 'Type', render: (x) => <Badge status={x.type === 'Production' ? 'In Progress' : 'Submitted'}>{x.type}</Badge> },
            { key: 'itemName', label: 'Item' }, { key: 'qty', label: 'Qty', align: 'right', render: (x) => <span className="money">{fmtQty(x.qty, x.uom, 3)}</span> },
            { key: 'needBy', label: 'Need by', render: (x) => fmtDate(x.needBy) }, { key: 'reason', label: 'Reason', render: (x) => <span style={{ fontSize: 12 }}>{x.reason}</span> },
            { key: 'estValue', label: 'Est. value', align: 'right', render: (x) => <span className="money">{fmtMoney(x.estValue, currency)}</span> },
          ] as Column<MrpSuggestion>[]} emptyTitle="No shortfalls in this horizon" />
        </SectionCard>
      )}
      <SectionCard title={`Net requirements (${details.length} items)`} padding={0}>
        <DataTable rows={details} rowKey={(d) => d.itemId} columns={[
          { key: 'itemName', label: 'Item', render: (d) => <div><div>{d.itemName}</div><div className="cell-secondary identifier">{d.itemCode}{d.hasBom ? ' · BOM' : ''}</div></div> },
          { key: 'onHand', label: 'On hand', align: 'right', render: (d) => <span className="money">{fmtQty(d.onHand, undefined, 3)}</span> },
          { key: 'reserved', label: 'Reserved', align: 'right', render: (d) => <span className="money">{fmtQty(d.reserved, undefined, 3)}</span> },
          { key: 'openPo', label: 'Open PO', align: 'right', render: (d) => <span className="money">{fmtQty(d.openPo, undefined, 3)}</span> },
          { key: 'plannedReceipts', label: 'Planned prod.', align: 'right', render: (d) => <span className="money">{fmtQty(d.plannedReceipts, undefined, 3)}</span> },
          { key: 'independentDemand', label: 'Sales demand', align: 'right', render: (d) => <span className="money">{fmtQty(d.independentDemand, undefined, 3)}</span> },
          { key: 'dependentDemand', label: 'Dependent', align: 'right', render: (d) => <span className="money">{fmtQty(d.dependentDemand, undefined, 3)}</span> },
          { key: 'safetyStock', label: 'Safety', align: 'right', render: (d) => <span className="money">{fmtQty(d.safetyStock, undefined, 3)}</span> },
          { key: 'netRequirement', label: 'Net requirement', align: 'right', sortable: true, render: (d) => <span className={`money ${d.shortfall > 0 ? 'money-negative' : ''}`} style={{ fontWeight: d.shortfall > 0 ? 600 : 400 }}>{fmtQty(d.netRequirement, d.uom, 3)}</span> },
        ] as Column<MrpRun['details'][number]>[]} emptyTitle="No items in scope" />
      </SectionCard>
      <SummaryBlock items={[{ label: 'Formula', value: 'demand + safety − (on hand − reserved + open PO + planned receipts)' }]} />
    </div>
  );
}
