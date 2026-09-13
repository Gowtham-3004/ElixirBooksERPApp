// Quality — inspection plans, inspection register, inspection form with dispositions, QC stats (FR-MFG-013).
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { Item } from '../../store';
import { RegisterPage, PageHeader, Drawer, Button, Badge, Pill, NumberField, DateField, SelectField, TextField, TextArea, EntityPicker, useItemOptions, Tabs, KpiTile, SummaryBlock, DataTable, KV, Meter, useToast, EmptyState, ActivityTab, Segmented, type Column, type MenuAction } from '../../components/ui';
import { fmtDate, fmtDateTime, fmtPct, fmtQty, today, uid } from '../../lib/format';
import type { Disposition, InspectionCheck, InspectionPlan, InspectionResult, InspectionType, ProductionOrder, ProductionReceipt, QualityInspection, WorkCentre } from './types';
import { cancelInspection, completeInspection, createInspection, qcStats, savePlan, saveResults } from './qualityActions';
import { useConfirm, SectionCard, OrderLink, ItemLink, DocLink } from './shared';

export function QualityPage({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <NewInspection params={params} />;
  if (id) return <InspectionDetail id={id} />;
  return <QualityRegister />;
}

function QualityRegister() {
  const s = useSession();
  const cid = s.state.companyId;
  const inspections = useCollection<QualityInspection>(C.qualityInspections).filter((q) => q.companyId === cid);
  const plans = useCollection<InspectionPlan>(C.inspectionPlans).filter((p) => p.companyId === cid);
  const grns = useCollection<any>(C.grns);
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<'inspections' | 'plans' | 'stats'>('inspections');
  const [editPlan, setEditPlan] = useState<{ p?: InspectionPlan } | null>(null);
  const [fromGrn, setFromGrn] = useState(false);
  const stats = useMemo(() => qcStats(inspections), [inspections]);
  const rows = useMemo(() => inspections.slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [inspections]);
  const columns: Column<QualityInspection>[] = [
    { key: 'number', label: 'Inspection', sortable: true, render: (q) => <span className="identifier link" style={{ fontWeight: 500 }}>{q.number}</span> },
    { key: 'type', label: 'Type', sortable: true, render: (q) => <Badge status={q.type === 'Incoming' ? 'Submitted' : q.type === 'In-process' ? 'In Progress' : 'Approved'}>{q.type}</Badge> },
    { key: 'date', label: 'Date', sortable: true, render: (q) => fmtDate(q.date) },
    { key: 'itemName', label: 'Item', render: (q) => <div><div>{q.itemName}</div><div className="cell-secondary identifier">{q.batch ?? q.itemCode}</div></div> },
    { key: 'refNumber', label: 'Reference', render: (q) => <div style={{ fontSize: 12 }}>{q.refType}<div><DocLink path={refPath(q)} number={q.refNumber} /></div></div> },
    { key: 'lotQty', label: 'Lot / sample', align: 'right', render: (q) => <span className="money">{fmtQty(q.lotQty, undefined, 3)} / {q.sampleQty}</span> },
    { key: 'acceptedQty', label: 'Accepted', align: 'right', render: (q) => <span className="money" style={{ color: '#12784E' }}>{q.acceptedQty || '—'}</span> },
    { key: 'rejectedQty', label: 'Rejected', align: 'right', render: (q) => <span className="money" style={{ color: q.rejectedQty ? '#C0393F' : undefined }}>{q.rejectedQty || '—'}</span> },
    { key: 'disposition', label: 'Disposition', render: (q) => q.disposition ? <Badge status={dispositionBadge(q.disposition)}>{q.disposition}</Badge> : '—' },
    { key: 'status', label: 'Status', render: (q) => <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Badge status={q.status} />{q.outcome && <Pill tone={q.outcome === 'Pass' ? 'good' : q.outcome === 'Fail' ? 'critical' : 'warning'}>{q.outcome}</Pill>}</span> },
  ];
  const rowActions = (q: QualityInspection): MenuAction[] => [
    { label: 'Open', onClick: () => nav.go(`production/quality/${q.id}`) },
    { label: 'Open reference', onClick: () => nav.go(refPath(q) ?? 'production/quality') },
    { label: 'Cancel inspection', danger: true, onClick: () => confirm.open({ title: `Cancel ${q.number}?`, reasonRequired: true, confirmLabel: 'Cancel inspection', danger: true, onConfirm: (r) => { cancelInspection(q.id, r); toast.success('Cancelled'); } }), disabled: q.status === 'Completed' || q.status === 'Cancelled', reason: q.status === 'Completed' ? 'Completed' : q.status === 'Cancelled' ? 'Already cancelled' : undefined },
  ];
  return (
    <div>
      <div className="page" style={{ paddingBottom: 0 }}>
        <div className="page-header">
          <div><h1 className="page-title">Quality</h1><div className="page-subtitle">{stats.open} open · first-pass yield {fmtPct(stats.fpy, 1)} · {plans.length} inspection plans</div></div>
          <Tabs variant="filter" tabs={[{ id: 'inspections', label: 'Inspections', count: inspections.length }, { id: 'plans', label: 'Plans', count: plans.length }, { id: 'stats', label: 'QC stats' }]} value={tab} onChange={setTab} />
        </div>
      </div>
      {tab === 'inspections' && (
        <RegisterPage title="Inspections" subtitle={`${stats.open} open · ${stats.completed} completed · ${fmtQty(stats.rejectedQty, undefined, 3)} rejected`} rows={rows} columns={columns} entity="inspections" searchKeys={['number', 'itemName', 'refNumber', 'batch']}
          tabs={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open', filter: (q) => q.status === 'Open' || q.status === 'In Progress' }, { id: 'incoming', label: 'Incoming', filter: (q) => q.type === 'Incoming' }, { id: 'inprocess', label: 'In-process', filter: (q) => q.type === 'In-process' }, { id: 'fg', label: 'Finished goods', filter: (q) => q.type === 'Finished goods' }, { id: 'failed', label: 'Failed / partial', filter: (q) => q.outcome === 'Fail' || q.outcome === 'Partial' }]}
          primaryAction={{ label: 'New inspection', onClick: () => nav.go('production/quality/new') }} actions={<Button onClick={() => setFromGrn(true)}>Inspect a goods receipt</Button>}
          onRowClick={(q) => nav.go(`production/quality/${q.id}`)} rowActions={rowActions} />
      )}
      {tab === 'plans' && (
        <RegisterPage title="Inspection plans" subtitle="Checks, specifications and sampling per item and inspection type" rows={plans} columns={[
          { key: 'code', label: 'Plan', render: (p) => <span className="identifier link" style={{ fontWeight: 500 }}>{p.code}</span> },
          { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type', render: (p) => <Badge status={p.type === 'Incoming' ? 'Submitted' : p.type === 'In-process' ? 'In Progress' : 'Approved'}>{p.type}</Badge> },
          { key: 'itemName', label: 'Item', render: (p) => p.itemName ?? <span style={{ color: '#5F6368' }}>Any item</span> },
          { key: 'checks', label: 'Checks', render: (p) => <span style={{ fontSize: 12 }}>{p.checks.map((c) => c.name).join(' · ')}</span> },
          { key: 'samplePct', label: 'Sample %', align: 'right', render: (p) => <span className="money">{p.samplePct}%</span> },
          { key: 'status', label: 'Status', render: (p) => <Badge status={p.status} /> },
        ] as Column<InspectionPlan>[]} entity="plans" searchKeys={['code', 'name', 'itemName']} primaryAction={{ label: 'New plan', onClick: () => setEditPlan({}) }} onRowClick={(p) => setEditPlan({ p })} />
      )}
      {tab === 'stats' && <QcStats stats={stats} inspections={inspections} />}
      {editPlan && <PlanEditor plan={editPlan.p} onClose={() => setEditPlan(null)} />}
      {fromGrn && <GrnPicker grns={grns.filter((g: any) => g && g.companyId === cid && g.status === 'Posted')} onClose={() => setFromGrn(false)} />}
      {confirm.dialog}
    </div>
  );
}

function refPath(q: QualityInspection): string | undefined {
  if (q.refType === 'GRN') return `purchase/grn/${q.refId}`;
  if (q.refType === 'Purchase Order') return `purchase/orders/${q.refId}`;
  if (q.refType === 'Production Order') return `production/orders/${q.refId}`;
  if (q.refType === 'Production Receipt') return `production/receipts/${q.refId}`;
  if (q.refType === 'Subcontract Order') return `production/subcontracting/${q.refId}`;
  return undefined;
}
function dispositionBadge(d: Disposition) {
  return d === 'Accept' ? 'Approved' : d === 'Reject' || d === 'Scrap' ? 'Rejected' : d === 'Return' ? 'Returned' : 'Hold';
}

function QcStats({ stats, inspections }: { stats: ReturnType<typeof qcStats>; inspections: QualityInspection[] }) {
  const recent = inspections.filter((q) => q.status === 'Completed').slice(-10).reverse();
  return (
    <div className="page">
      <div className="grid-4">
        <KpiTile label="First-pass yield" value={fmtPct(stats.fpy, 1)} sub={`${stats.completed} completed inspections`} deltaTone={stats.fpy >= 95 ? 'good' : 'bad'} delta={stats.fpy >= 95 ? 'Above 95% target' : 'Below 95% target'} />
        <KpiTile label="Open inspections" value={stats.open} sub="Awaiting results or disposition" />
        <KpiTile label="Rejected quantity" value={fmtQty(stats.rejectedQty, undefined, 3)} sub="Across completed inspections" />
        <KpiTile label="Top failure" value={stats.topFailures[0]?.[0] ?? '—'} sub={stats.topFailures[0] ? `${stats.topFailures[0][1]} failure(s)` : 'No failures recorded'} />
      </div>
      <div className="grid-2">
        <SectionCard title="First-pass yield by inspection type">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.byType.map((t) => (
              <div key={t.type}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}><span>{t.type} <span style={{ color: '#5F6368' }}>({t.count})</span></span><span className="money">{fmtPct(t.fpy, 1)}</span></div><Meter value={t.fpy} max={100} tone={t.fpy >= 95 ? 'good' : t.fpy >= 85 ? 'warn' : 'danger'} /></div>
            ))}
          </div>
        </SectionCard>
        <SectionCard title="Top failing checks" padding={0}>
          <table className="data-table dense"><thead><tr><th>Check</th><th className="right">Failures</th></tr></thead><tbody>
            {stats.topFailures.map(([name, n]) => <tr key={name}><td>{name}</td><td className="right money">{n}</td></tr>)}
            {stats.topFailures.length === 0 && <tr><td colSpan={2} style={{ padding: 16, color: '#12784E' }}>✓ No failed checks recorded</td></tr>}
          </tbody></table>
        </SectionCard>
      </div>
      <SectionCard title="Recently completed" padding={0}>
        <table className="data-table dense"><thead><tr><th>Inspection</th><th>Type</th><th>Item</th><th>Outcome</th><th>Disposition</th><th className="right">Accepted / rejected</th><th>Inspector</th></tr></thead><tbody>
          {recent.map((q) => <tr key={q.id} className="clickable" onClick={() => nav.go(`production/quality/${q.id}`)}><td className="identifier link">{q.number}</td><td>{q.type}</td><td>{q.itemName}</td><td><Pill tone={q.outcome === 'Pass' ? 'good' : q.outcome === 'Fail' ? 'critical' : 'warning'}>{q.outcome}</Pill></td><td>{q.disposition ? <Badge status={dispositionBadge(q.disposition)}>{q.disposition}</Badge> : '—'}</td><td className="right money">{q.acceptedQty} / {q.rejectedQty}</td><td>{q.inspectorName ?? '—'}</td></tr>)}
          {recent.length === 0 && <tr><td colSpan={7} style={{ padding: 16, color: '#5F6368' }}>No completed inspections yet.</td></tr>}
        </tbody></table>
      </SectionCard>
    </div>
  );
}

function GrnPicker({ grns, onClose }: { grns: any[]; onClose: () => void }) {
  const toast = useToast();
  const create = (g: any, line: any) => {
    try {
      const q = createInspection({ type: 'Incoming', itemId: line.itemId, refType: 'GRN', refId: g.id, refNumber: g.number, refLineId: line.id, lotQty: line.acceptedQty ?? line.receivedQty ?? line.qty ?? 0, batch: line.batch, date: today() });
      toast.success(`${q.number} created`);
      nav.go(`production/quality/${q.id}`);
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <Drawer open onClose={onClose} title="Create an incoming inspection" subtitle="Pick a posted goods receipt line" width={780}>
      {grns.length === 0 ? <EmptyState compact title="No posted goods receipts" description="Goods receipts are created in the Purchase module." /> : (
        <table className="data-table dense"><thead><tr><th>GRN</th><th>Date</th><th>Supplier</th><th>Item</th><th className="right">Accepted</th><th>Batch</th><th /></tr></thead><tbody>
          {grns.slice(0, 20).flatMap((g: any) => (g.lines ?? []).map((l: any) => (
            <tr key={`${g.id}_${l.id}`}><td className="identifier">{g.number}</td><td>{fmtDate(g.date)}</td><td>{g.partyName ?? '—'}</td><td>{l.itemName}</td><td className="right money">{fmtQty(l.acceptedQty ?? l.receivedQty ?? l.qty ?? 0, undefined, 3)}</td><td className="identifier" style={{ fontSize: 12 }}>{l.batch ?? '—'}</td><td style={{ textAlign: 'right' }}><Button size="sm" onClick={() => create(g, l)}>Inspect</Button></td></tr>
          )))}
        </tbody></table>
      )}
    </Drawer>
  );
}

function PlanEditor({ plan, onClose }: { plan?: InspectionPlan; onClose: () => void }) {
  const toast = useToast();
  const items = useItemOptions((i) => i.isStock);
  const [f, setF] = useState<{ code?: string; name: string; type: InspectionType; itemId?: string; samplePct: number; status: 'Active' | 'Inactive'; checks: InspectionCheck[] }>({ code: plan?.code, name: plan?.name ?? '', type: plan?.type ?? 'Finished goods', itemId: plan?.itemId, samplePct: plan?.samplePct ?? 10, status: plan?.status ?? 'Active', checks: plan?.checks.map((c) => ({ ...c })) ?? [{ id: uid('ck'), name: '', spec: '', method: '', kind: 'Pass/Fail' }] });
  const [err, setErr] = useState<string | null>(null);
  const setCheck = (i: number, patch: Partial<InspectionCheck>) => setF({ ...f, checks: f.checks.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const submit = () => { try { const p = savePlan(f, plan?.id); toast.success(`${p.code} saved`); onClose(); } catch (e: any) { setErr(e.message); } };
  return (
    <Drawer open onClose={onClose} width={840} title={plan ? `${plan.code} · ${plan.name}` : 'New inspection plan'} subtitle="Checks applied when an inspection of this type is created"
      footer={<><div style={{ flex: 1 }} /><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save plan</Button></>}>
      {err && <div className="banner danger" style={{ marginBottom: 12 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr 1fr', gap: 12 }}>
        <TextField label="Code" value={f.code ?? ''} onChange={(v) => setF({ ...f, code: v })} placeholder="auto" uppercase />
        <TextField label="Name" required value={f.name} onChange={(v) => setF({ ...f, name: v })} />
        <SelectField label="Type" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={['Incoming', 'In-process', 'Finished goods']} />
        <NumberField label="Sample %" value={f.samplePct} onChange={(v) => setF({ ...f, samplePct: v })} decimals={0} suffix="%" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
        <EntityPicker label="Item" value={f.itemId} onChange={(v) => setF({ ...f, itemId: v })} options={items} placeholder="Any item" help="Leave blank for a generic plan" />
        <SelectField label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v as 'Active' | 'Inactive' })} options={['Active', 'Inactive']} />
      </div>
      <div className="card" style={{ marginTop: 16, overflow: 'visible' }}>
        <table className="data-table dense"><thead><tr><th style={{ width: 180 }}>Check</th><th style={{ width: 180 }}>Specification</th><th style={{ width: 160 }}>Method</th><th style={{ width: 120 }}>Kind</th><th className="right" style={{ width: 80 }}>Min</th><th className="right" style={{ width: 80 }}>Max</th><th style={{ width: 70 }}>Unit</th><th style={{ width: 36 }} /></tr></thead><tbody>
          {f.checks.map((c, i) => (
            <tr key={c.id}>
              <td><TextField value={c.name} onChange={(v) => setCheck(i, { name: v })} size="grid" /></td>
              <td><TextField value={c.spec} onChange={(v) => setCheck(i, { spec: v })} size="grid" /></td>
              <td><TextField value={c.method} onChange={(v) => setCheck(i, { method: v })} size="grid" /></td>
              <td><SelectField value={c.kind} onChange={(v) => setCheck(i, { kind: v as InspectionCheck['kind'] })} options={['Pass/Fail', 'Measurement']} size="grid" /></td>
              <td><NumberField value={c.min ?? 0} onChange={(v) => setCheck(i, { min: v })} decimals={2} size="grid" disabled={c.kind !== 'Measurement'} /></td>
              <td><NumberField value={c.max ?? 0} onChange={(v) => setCheck(i, { max: v })} decimals={2} size="grid" disabled={c.kind !== 'Measurement'} /></td>
              <td><TextField value={c.unit ?? ''} onChange={(v) => setCheck(i, { unit: v })} size="grid" disabled={c.kind !== 'Measurement'} /></td>
              <td><button type="button" className="btn-icon" onClick={() => setF({ ...f, checks: f.checks.filter((_, j) => j !== i) })}>✕</button></td>
            </tr>))}
        </tbody></table>
        <div style={{ padding: 10 }}><Button size="sm" onClick={() => setF({ ...f, checks: [...f.checks, { id: uid('ck'), name: '', spec: '', method: '', kind: 'Pass/Fail' }] })}>+ Add check</Button></div>
      </div>
    </Drawer>
  );
}

function NewInspection({ params }: { params: Record<string, string> }) {
  const s = useSession();
  const toast = useToast();
  const cid = s.state.companyId;
  const orders = useCollection<ProductionOrder>(C.productionOrders).filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status));
  const plans = useCollection<InspectionPlan>(C.inspectionPlans).filter((p) => p.companyId === cid && p.status === 'Active');
  const [type, setType] = useState<InspectionType>(params.op ? 'In-process' : 'In-process');
  const [oid, setOid] = useState(params.order ?? orders[0]?.id ?? '');
  const [opId, setOpId] = useState(params.op ?? '');
  const [planId, setPlanId] = useState('');
  const [lotQty, setLotQty] = useState(0);
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const order = orders.find((o) => o.id === oid);
  const op = order?.operations.find((x) => x.id === opId);
  const submit = () => {
    if (!order) { setErr('Choose a production order'); return; }
    try {
      const q = createInspection({ type, itemId: order.itemId, refType: 'Production Order', refId: order.id, refNumber: order.number, operationId: opId || undefined, operationName: op?.name, lotQty: lotQty || order.qty, planId: planId || undefined, date, notes });
      toast.success(`${q.number} created`);
      nav.go(`production/quality/${q.id}`);
    } catch (e: any) { setErr(e.message); }
  };
  return (
    <div className="page">
      <PageHeader title="New inspection" subtitle="In-process inspections attach to a production order operation" back={{ label: 'Quality', path: 'production/quality' }}
        actions={<><Button onClick={() => nav.go('production/quality')}>Cancel</Button><Button variant="primary" onClick={submit}>Create inspection</Button></>} />
      {err && <div className="banner danger">{err}</div>}
      <SectionCard>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <SelectField label="Type" value={type} onChange={(v) => setType(v)} options={['In-process', 'Finished goods']} help="Incoming inspections start from a goods receipt" />
          <SelectField label="Production order" required value={oid} onChange={(v) => { setOid(v); const o = orders.find((x) => x.id === v); setLotQty(o?.qty ?? 0); }} options={orders.map((o) => ({ value: o.id, label: `${o.number} · ${o.itemName}` }))} placeholder="Pick an order" allowEmpty />
          <SelectField label="Operation" value={opId} onChange={setOpId} options={[{ value: '', label: '— whole order —' }, ...(order?.operations ?? []).map((x) => ({ value: x.id, label: `${x.seq} · ${x.name}` }))]} />
          <SelectField label="Inspection plan" value={planId} onChange={setPlanId} options={[{ value: '', label: 'Default for item & type' }, ...plans.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))]} />
          <NumberField label="Lot quantity" value={lotQty || order?.qty || 0} onChange={setLotQty} decimals={3} suffix={order?.uom} />
          <DateField label="Date" value={date} onChange={setDate} />
        </div>
        <div style={{ marginTop: 12 }}><TextArea label="Notes" value={notes} onChange={setNotes} rows={2} /></div>
      </SectionCard>
    </div>
  );
}

function InspectionDetail({ id }: { id: string }) {
  const s = useSession();
  const q = useRecord<QualityInspection>(C.qualityInspections, id);
  const wcs = useCollection<WorkCentre>(C.workCentres);
  const toast = useToast();
  const confirm = useConfirm();
  const [results, setResults] = useState<InspectionResult[] | null>(null);
  const [accepted, setAccepted] = useState<number | null>(null);
  const [rejected, setRejected] = useState<number | null>(null);
  const [disposition, setDisposition] = useState<Disposition>('Accept');
  const [inspector, setInspector] = useState('');
  const [notes, setNotes] = useState('');
  const [reworkWc, setReworkWc] = useState('');
  const [err, setErr] = useState<string | null>(null);
  if (!q) return <EmptyState title="Inspection not found" action={<Button onClick={() => nav.go('production/quality')}>Back</Button>} />;
  const rows = results ?? q.results;
  const done = q.status === 'Completed' || q.status === 'Cancelled';
  const acc = accepted ?? (q.status === 'Completed' ? q.acceptedQty : q.lotQty);
  const rej = rejected ?? (q.status === 'Completed' ? q.rejectedQty : 0);
  const receipt = q.refType === 'Production Receipt' ? db.find<ProductionReceipt>(C.productionReceipts, q.refId) : undefined;
  const setResult = (i: number, patch: Partial<InspectionResult>) => setResults(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = () => { try { saveResults(q.id, { results: rows, inspectorName: inspector || undefined, notes: notes || undefined }); toast.success('Results saved'); setResults(null); } catch (e: any) { setErr(e.message); } };
  const complete = () => confirm.open({
    title: `Complete ${q.number} with disposition "${disposition}"?`,
    statement: `${q.itemName} · lot ${fmtQty(q.lotQty, undefined, 3)} · accepted ${acc} · rejected ${rej}`,
    consequences: [
      ...(receipt ? [{ engine: 'Stock', text: disposition === 'Accept' ? `Held receipt ${receipt.number} posts ${acc} into ${receipt.warehouseId ? '' : ''}stock; rejected quantity becomes scrap` : disposition === 'Rework' ? 'A rework operation is added to the production order; the receipt stays on hold' : `Held receipt ${receipt.number} is rejected — the whole quantity becomes scrap` }] : []),
      ...(q.refType === 'GRN' && (disposition === 'Reject' || disposition === 'Scrap') ? [{ engine: 'Stock', text: 'Rejected quantity moves to the scrap yard and posts Dr 5700 / Cr inventory' }] : []),
      { engine: 'Workflow', text: 'The inspection becomes read-only' },
    ],
    confirmLabel: `Complete · ${disposition}`, cancelLabel: 'Keep open',
    onConfirm: () => { completeInspection(q.id, { acceptedQty: acc, rejectedQty: rej, disposition, inspectorName: inspector || undefined, notes: notes || undefined, results: rows, reworkWorkCentreId: reworkWc || undefined }); toast.success(`${q.number} completed`); },
  });
  return (
    <div className="page">
      <PageHeader title={q.number} subtitle={`${q.type} · ${q.itemName} · ${q.refType} ${q.refNumber} · ${fmtDate(q.date)}`} back={{ label: 'Quality', path: 'production/quality' }}
        actions={<><Badge status={q.status} />{q.outcome && <Pill tone={q.outcome === 'Pass' ? 'good' : q.outcome === 'Fail' ? 'critical' : 'warning'}>{q.outcome}</Pill>}<Button onClick={() => nav.go(refPath(q) ?? 'production/quality')}>Open {q.refType}</Button>{!done && <Button onClick={save}>Save results</Button>}{!done && <Button variant="primary" onClick={complete}>Complete inspection</Button>}</>} />
      {err && <div className="banner danger">{err}</div>}
      {receipt?.status === 'Hold' && <div className="banner warning">Receipt {receipt.number} is on hold — completing this inspection with Accept releases {acc} {receipt.uom} into stock.</div>}
      {q.status === 'Completed' && <div className="banner success">Completed {fmtDateTime(q.completedAt)} by {q.completedBy} · disposition {q.disposition}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title={`Checks (${rows.length})${q.planName ? ` · ${q.planName}` : ''}`} padding={0}>
            <table className="data-table dense"><thead><tr><th>Check</th><th>Specification</th><th style={{ width: 160 }}>Measured value</th><th style={{ width: 180 }}>Result</th><th>Note</th></tr></thead><tbody>
              {rows.map((r, i) => (
                <tr key={r.checkId}>
                  <td>{r.check}</td><td style={{ fontSize: 12, color: '#5F6368' }}>{r.spec}</td>
                  <td>{done ? <span className="money">{r.value ?? '—'}</span> : <TextField value={r.value ?? ''} onChange={(v) => setResult(i, { value: v })} size="grid" />}</td>
                  <td>{done ? <Badge status={r.pass === true ? 'Passed' : r.pass === false ? 'Rejected' : 'Draft'}>{r.pass === true ? 'Pass' : r.pass === false ? 'Fail' : 'Not recorded'}</Badge> : <Segmented value={r.pass === true ? 'pass' : r.pass === false ? 'fail' : 'none'} onChange={(v) => setResult(i, { pass: v === 'pass' ? true : v === 'fail' ? false : null })} options={[{ value: 'pass', label: 'Pass' }, { value: 'fail', label: 'Fail' }, { value: 'none', label: '—' }]} />}</td>
                  <td>{done ? r.note ?? '—' : <TextField value={r.note ?? ''} onChange={(v) => setResult(i, { note: v })} size="grid" />}</td>
                </tr>))}
              {rows.length === 0 && <tr><td colSpan={5} style={{ padding: 16, color: '#5F6368' }}>No checks on this plan — record the disposition directly.</td></tr>}
            </tbody></table>
          </SectionCard>
          {!done && (
            <SectionCard title="Disposition">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <NumberField label="Accepted qty" value={acc} onChange={setAccepted} decimals={3} max={q.lotQty} />
                <NumberField label="Rejected qty" value={rej} onChange={setRejected} decimals={3} max={q.lotQty} />
                <SelectField label="Disposition" value={disposition} onChange={(v) => setDisposition(v as Disposition)} options={['Accept', 'Reject', 'Rework', 'Scrap', 'Return', 'Hold']} help={disposition === 'Rework' ? 'Adds a rework operation to the order' : disposition === 'Hold' ? 'Keeps the inspection open' : undefined} />
                <TextField label="Inspector" value={inspector} onChange={setInspector} placeholder={q.inspectorName ?? s.user?.name ?? ''} />
              </div>
              {disposition === 'Rework' && <div style={{ marginTop: 12 }}><SelectField label="Rework work centre" value={reworkWc} onChange={setReworkWc} options={[{ value: '', label: 'First operation work centre' }, ...wcs.filter((w) => w.status === 'Active').map((w) => ({ value: w.id, label: w.name }))]} /></div>}
              <div style={{ marginTop: 12 }}><TextArea label="Notes" value={notes} onChange={setNotes} rows={2} placeholder={q.notes ?? 'Observations, deviations, corrective action…'} /></div>
            </SectionCard>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionCard title="Inspection">
            <KV items={[{ k: 'Type', v: q.type }, { k: 'Item', v: <ItemLink id={q.itemId} name={q.itemName} /> }, { k: 'Reference', v: <DocLink path={refPath(q)} number={q.refNumber} /> }, ...(q.operationName ? [{ k: 'Operation', v: q.operationName }] : []), { k: 'Lot qty', v: fmtQty(q.lotQty, undefined, 3) }, { k: 'Sample qty', v: fmtQty(q.sampleQty, undefined, 3) }, { k: 'Batch', v: q.batch ?? '—' }, { k: 'Serials', v: q.serials?.length ? `${q.serials.length}` : '—' }, { k: 'Plan', v: q.planName ?? '—' }, { k: 'Inspector', v: q.inspectorName ?? '—' }]} />
          </SectionCard>
          {q.status === 'Completed' && <SectionCard title="Outcome"><SummaryBlock style={{ flexDirection: 'column', gap: 6 }} items={[{ label: 'Accepted', value: fmtQty(q.acceptedQty, undefined, 3), tone: 'good' }, { label: 'Rejected', value: fmtQty(q.rejectedQty, undefined, 3), tone: q.rejectedQty ? 'danger' : undefined }, { label: 'Held', value: fmtQty(q.heldQty, undefined, 3) }, { label: 'Disposition', value: q.disposition ?? '—' }]} /></SectionCard>}
          <SectionCard title="Activity"><ActivityTab objectId={q.id} correlationId={q.correlationId} /></SectionCard>
        </div>
      </div>
      {confirm.dialog}
    </div>
  );
}
