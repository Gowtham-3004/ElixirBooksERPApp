// Transfers, revaluation & impairment, disposals (FR-AST-005): registers + drawers that post through actions.ts.
import { useState } from 'react';
import { C, db, nav, useSession, useCollection, useRoute, IDS } from '../../store';
import { RegisterPage, Badge, Button, Drawer, ConfirmDialog, KV, TextField, DateField, MoneyField, SelectField, ReasonField, EntityPicker, useEmployeeOptions, useAccountOptions, Segmented, useToast, Toggle, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, today } from '../../lib/format';
import type { Asset, AssetEvent } from './types';
import { nbv, accumulated } from './calc';
import { transferAsset, revalueAsset, disposeAsset, applyTransfer } from './actions';

function useEvents(type: AssetEvent['type'] | AssetEvent['type'][]) {
  const s = useSession();
  const types = Array.isArray(type) ? type : [type];
  return useCollection<AssetEvent>(C.assetEvents).filter((e) => types.includes(e.type) && (!e.companyId || e.companyId === s.state.companyId)).sort((a, b) => b.date.localeCompare(a.date));
}

function AssetPicker({ value, onChange }: { value?: string; onChange: (id?: string) => void }) {
  const assets = useCollection<Asset>(C.assets).filter((a) => a.status !== 'Disposed');
  return <EntityPicker label="Asset" required value={value} onChange={(v) => onChange(v)} options={assets.map((a) => ({ id: a.id, primary: `${a.number} · ${a.name}`, secondary: `${a.categoryName} · NBV ${fmtMoney(nbv(a))}` }))} />;
}

export function TransferDrawer({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const toast = useToast();
  const s = useSession();
  const empOpts = useEmployeeOptions();
  const branches = useCollection<any>(C.branches).filter((b) => b.companyId === s.state.companyId && b.status === 'Active');
  const [f, setF] = useState({ location: '', branchId: '', custodianId: '', reason: '', date: today(), approval: true });
  const submit = () => { if (!asset) return; try { const ev = transferAsset(asset, { location: f.location || undefined, branchId: f.branchId || undefined, custodianId: f.custodianId || undefined, reason: f.reason, date: f.date, requireApproval: f.approval }); toast.success(ev.status === 'Pending' ? 'Transfer submitted for approval' : 'Asset transferred'); onClose(); } catch (e: any) { toast.error(e.message); } };
  return (
    <Drawer open={!!asset} onClose={onClose} title={asset ? `Transfer ${asset.number}` : ''} subtitle={asset ? `${asset.name} · currently ${asset.location} · ${asset.custodianName ?? 'no custodian'}` : ''} width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={f.reason.trim().length < 10}>{f.approval ? 'Submit transfer' : 'Transfer asset'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label="New location" value={f.location} onChange={(v) => setF({ ...f, location: v })} placeholder={asset?.location} />
        <SelectField label="Branch" value={f.branchId} onChange={(v) => setF({ ...f, branchId: v })} options={branches.map((b) => ({ value: b.id, label: b.name }))} placeholder="Keep current branch" />
        <EntityPicker label="New custodian" value={f.custodianId || undefined} onChange={(v) => setF({ ...f, custodianId: v ?? '' })} options={empOpts} placeholder="Keep current custodian" />
        <DateField label="Effective date" value={f.date} onChange={(v) => setF({ ...f, date: v })} />
        <ReasonField value={f.reason} onChange={(v) => setF({ ...f, reason: v })} />
        <Toggle on={f.approval} onChange={(v) => setF({ ...f, approval: v })} label="Route through approval workflow" help="Uses the 'Asset Transfer' workflow if one is active; otherwise applies immediately and logs the event." />
      </div>
    </Drawer>
  );
}

export function RevalueDrawer({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const toast = useToast();
  const s = useSession();
  const [f, setF] = useState<{ kind: 'Revaluation' | 'Impairment'; amount: number; date: string; reason: string }>({ kind: 'Revaluation', amount: 0, date: today(), reason: '' });
  const [confirm, setConfirm] = useState(false);
  const after = asset ? nbv(asset) + (f.kind === 'Revaluation' ? f.amount : -f.amount) : 0;
  return (
    <>
      <Drawer open={!!asset && !confirm} onClose={onClose} title={asset ? `Revalue / impair ${asset.number}` : ''} subtitle={asset ? `${asset.name} · carrying amount ${fmtMoney(nbv(asset), s.currency)}` : ''} width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => setConfirm(true)} disabled={f.amount <= 0 || f.reason.trim().length < 10}>Review & post</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Segmented value={f.kind} onChange={(v) => setF({ ...f, kind: v })} options={[{ value: 'Revaluation', label: 'Revaluation (upward)' }, { value: 'Impairment', label: 'Impairment (loss)' }]} />
          <MoneyField label={f.kind === 'Revaluation' ? 'Revaluation surplus' : 'Impairment loss'} value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required />
          <DateField label="Date" value={f.date} onChange={(v) => setF({ ...f, date: v })} checkPeriod />
          <ReasonField value={f.reason} onChange={(v) => setF({ ...f, reason: v })} placeholder="Independent valuation report / obsolescence / damage…" />
          <KV items={[{ k: 'Carrying now', v: fmtMoney(asset ? nbv(asset) : 0, s.currency) }, { k: 'Carrying after', v: <strong>{fmtMoney(after, s.currency)}</strong> }, { k: 'Journal', v: f.kind === 'Revaluation' ? 'Dr asset cost · Cr revaluation reserve (3100)' : 'Dr impairment loss (5810) · Cr accumulated depreciation (1510)' }]} />
        </div>
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Post ${f.kind.toLowerCase()} of ${fmtMoney(f.amount, s.currency)}`} statement={`${asset?.number} ${asset?.name} — carrying amount changes to ${fmtMoney(after, s.currency)}. Future depreciation is computed on the new carrying amount.`} confirmLabel={`Post ${f.kind.toLowerCase()}`} cancelLabel="Go back" consequences={[{ engine: 'Journal', text: f.kind === 'Revaluation' ? `Dr ${db.find<any>(C.accounts, asset?.assetAccountId)?.name} · Cr Retained earnings (revaluation reserve)` : `Dr Loss on disposal / impairment (5810) · Cr Accumulated depreciation`, tone: 'info' }, { engine: 'Statutory', text: 'Event logged on the asset timeline with reason', tone: 'info' }]} onConfirm={() => { if (!asset) return; revalueAsset(asset, f); toast.success(`${f.kind} posted for ${asset.number}`); setConfirm(false); onClose(); }} />
    </>
  );
}

export function DisposeDrawer({ asset, onClose }: { asset: Asset | null; onClose: () => void }) {
  const toast = useToast();
  const s = useSession();
  const accOpts = useAccountOptions((a) => a.controlType === 'Bank' || a.controlType === 'Cash' || a.controlType === 'AR');
  const [f, setF] = useState({ date: today(), proceeds: 0, buyer: '', reason: '', receiptAccountId: s.company?.defaults.bankAccountId ?? IDS.accHDFC });
  const [confirm, setConfirm] = useState(false);
  const gain = asset ? f.proceeds - nbv(asset) : 0;
  return (
    <>
      <Drawer open={!!asset && !confirm} onClose={onClose} title={asset ? `Dispose ${asset.number}` : ''} subtitle={asset ? `${asset.name} · NBV ${fmtMoney(nbv(asset), s.currency)} · accumulated ${fmtMoney(accumulated(asset), s.currency)}` : ''} width={520} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="tinted" tone="danger" onClick={() => setConfirm(true)} disabled={f.reason.trim().length < 10}>Review disposal</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DateField label="Disposal date" value={f.date} onChange={(v) => setF({ ...f, date: v })} checkPeriod required />
          <MoneyField label="Sale proceeds" value={f.proceeds} onChange={(v) => setF({ ...f, proceeds: v })} help="0 for scrapping / write-off" />
          <TextField label="Buyer" value={f.buyer} onChange={(v) => setF({ ...f, buyer: v })} placeholder="Scrap dealer, employee buy-back, customer…" />
          <EntityPicker label="Proceeds received in" value={f.receiptAccountId} onChange={(v) => setF({ ...f, receiptAccountId: v ?? IDS.accHDFC })} options={accOpts} />
          <ReasonField value={f.reason} onChange={(v) => setF({ ...f, reason: v })} />
          <KV items={[{ k: 'Gain / (loss)', v: <strong style={{ color: gain >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(gain, s.currency)}</strong> }, { k: 'Journal', v: `Dr ${db.find<any>(C.accounts, f.receiptAccountId)?.name ?? 'bank'} ${fmtMoney(f.proceeds, s.currency)} · Dr accumulated dep ${fmtMoney(asset ? accumulated(asset) : 0, s.currency)} · Cr asset cost ${fmtMoney(asset ? asset.cost + asset.revaluation : 0, s.currency)} · ${gain >= 0 ? 'Cr gain (4130)' : 'Dr loss (5810)'}` }]} />
        </div>
      </Drawer>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Dispose ${asset?.number}`} statement="Removes the asset from the books. This cannot be undone — reverse the journal and re-capitalize to correct." confirmLabel="Dispose asset" cancelLabel="Keep asset" danger consequences={[{ engine: 'Journal', text: `Cost and accumulated depreciation written off · ${gain >= 0 ? 'gain' : 'loss'} ${fmtMoney(Math.abs(gain), s.currency)} to P&L`, tone: 'danger' }, { engine: 'Statutory', text: 'Asset status → Disposed; no further depreciation', tone: 'warning' }, { engine: 'Notification', text: 'Finance notified', tone: 'info' }]} onConfirm={() => { if (!asset) return; disposeAsset(asset, f); toast.success(`${asset.number} disposed`); setConfirm(false); onClose(); }} />
    </>
  );
}

export function TransfersPage() {
  const route = useRoute();
  const toast = useToast();
  const events = useEvents('Transferred');
  const assets = useCollection<Asset>(C.assets);
  const [asset, setAsset] = useState<Asset | null>(() => (route.params.asset ? db.find<Asset>(C.assets, route.params.asset) ?? null : null));
  const [pick, setPick] = useState<string | undefined>();
  const [pickOpen, setPickOpen] = useState(false);
  const cols: Column<AssetEvent>[] = [
    { key: 'assetNumber', label: 'Asset', render: (e) => <div><span className="identifier link">{e.assetNumber}</span><div className="cell-secondary">{e.assetName}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (e) => fmtDate(e.date), sortable: true },
    { key: 'from', label: 'From', render: (e) => <span style={{ fontSize: 12 }}>{e.from}</span> },
    { key: 'to', label: 'To', render: (e) => <span style={{ fontSize: 12 }}>{e.to}</span> },
    { key: 'reason', label: 'Reason', render: (e) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.reason}</span> },
    { key: 'by', label: 'By' },
    { key: 'status', label: 'Status', render: (e) => <Badge status={e.status === 'Pending' ? 'Submitted' : e.status ?? 'Posted'}>{e.status === 'Pending' ? 'Awaiting approval' : e.status ?? 'Posted'}</Badge> },
  ];
  return (
    <>
      <RegisterPage<AssetEvent> title="Asset transfers" subtitle={`${events.length} transfers · location, branch or custodian changes with reason and optional approval`} rows={events} columns={cols} entity="transfers" searchKeys={['assetNumber', 'assetName', 'from', 'to']}
        primaryAction={{ label: 'Transfer asset', onClick: () => setPickOpen(true) }}
        tabs={[{ id: 'all', label: 'All' }, { id: 'pending', label: 'Awaiting approval', filter: (e) => e.status === 'Pending' }]}
        onRowClick={(e) => nav.go(`fixed-assets/register/${e.assetId}?tab=events`)}
        rowActions={(e) => [{ label: 'Open asset', onClick: () => nav.go(`fixed-assets/register/${e.assetId}`) }, ...(e.status === 'Pending' ? [{ label: 'Apply (approved)', onClick: () => { const req = db.find<any>(C.approvals, e.approvalId); if (req && req.status !== 'Approved') { toast.error(`Approval ${req.status.toLowerCase()} — act on it under Approvals`); return; } applyTransfer(e); toast.success('Transfer applied'); } }, { label: 'Open approval', onClick: () => nav.go(`approvals?id=${e.approvalId}`) }] : [])]}
        emptyTitle="No transfers recorded" />
      <Drawer open={pickOpen} onClose={() => setPickOpen(false)} title="Choose asset to transfer" width={480} footer={<><Button variant="ghost" onClick={() => setPickOpen(false)}>Cancel</Button><Button variant="primary" disabled={!pick} onClick={() => { setAsset(assets.find((a) => a.id === pick) ?? null); setPickOpen(false); }}>Continue</Button></>}><AssetPicker value={pick} onChange={setPick} /></Drawer>
      <TransferDrawer asset={asset} onClose={() => setAsset(null)} />
    </>
  );
}

export function RevaluationPage() {
  const s = useSession();
  const events = useEvents(['Revalued', 'Impaired']);
  const assets = useCollection<Asset>(C.assets);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [pick, setPick] = useState<string | undefined>();
  const [pickOpen, setPickOpen] = useState(false);
  const cols: Column<AssetEvent>[] = [
    { key: 'assetNumber', label: 'Asset', render: (e) => <div><span className="identifier link">{e.assetNumber}</span><div className="cell-secondary">{e.assetName}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (e) => fmtDate(e.date), sortable: true },
    { key: 'type', label: 'Type', render: (e) => <Badge status={e.type === 'Revalued' ? 'Approved' : 'Returned'}>{e.type === 'Revalued' ? 'Revaluation' : 'Impairment'}</Badge> },
    { key: 'amount', label: 'Amount', align: 'right', render: (e) => <span className="money" style={{ fontWeight: 600, color: (e.amount ?? 0) >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(e.amount ?? 0, s.currency)}</span> },
    { key: 'detail', label: 'Carrying amount', render: (e) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{e.detail}</span> },
    { key: 'reason', label: 'Reason', render: (e) => <span style={{ fontSize: 12 }}>{e.reason}</span> },
    { key: 'journalNumber', label: 'Journal', render: (e) => <span className="identifier link" onClick={(ev) => { ev.stopPropagation(); e.journalId && nav.go(`accounting/journals/${e.journalId}`); }}>{e.journalNumber ?? '—'}</span> },
  ];
  return (
    <>
      <RegisterPage<AssetEvent> title="Revaluation & impairment" subtitle="Upward revaluations credit the revaluation reserve; impairments charge 5810 and raise accumulated depreciation" rows={events} columns={cols} entity="revaluations" searchKeys={['assetNumber', 'assetName', 'reason']}
        primaryAction={{ label: 'Revalue / impair', onClick: () => setPickOpen(true) }}
        onRowClick={(e) => nav.go(`fixed-assets/register/${e.assetId}?tab=events`)} emptyTitle="No revaluations or impairments" />
      <Drawer open={pickOpen} onClose={() => setPickOpen(false)} title="Choose asset" width={480} footer={<><Button variant="ghost" onClick={() => setPickOpen(false)}>Cancel</Button><Button variant="primary" disabled={!pick} onClick={() => { setAsset(assets.find((a) => a.id === pick) ?? null); setPickOpen(false); }}>Continue</Button></>}><AssetPicker value={pick} onChange={setPick} /></Drawer>
      <RevalueDrawer asset={asset} onClose={() => setAsset(null)} />
    </>
  );
}

export function DisposalsPage() {
  const s = useSession();
  const route = useRoute();
  const assets = useCollection<Asset>(C.assets).filter((a) => !a.companyId || a.companyId === s.state.companyId);
  const disposed = assets.filter((a) => a.status === 'Disposed' && a.disposal).sort((a, b) => b.disposal!.date.localeCompare(a.disposal!.date));
  const [asset, setAsset] = useState<Asset | null>(() => (route.params.asset ? db.find<Asset>(C.assets, route.params.asset) ?? null : null));
  const [pick, setPick] = useState<string | undefined>();
  const [pickOpen, setPickOpen] = useState(false);
  const cols: Column<Asset>[] = [
    { key: 'number', label: 'Disposal', render: (a, i) => <div><span className="identifier link">DISP-{String(disposed.length - i).padStart(3, '0')}</span><div className="cell-secondary">{a.disposal?.buyer ?? '—'}</div></div> },
    { key: 'name', label: 'Asset', render: (a) => <div><div className="cell-primary">{a.name}</div><div className="cell-secondary identifier">{a.number}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (a) => fmtDate(a.disposal?.date), value: (a) => a.disposal?.date, sortable: true },
    { key: 'cost', label: 'Original cost', align: 'right', render: (a) => <span className="money">{fmtMoney(a.cost, s.currency)}</span> },
    { key: 'nbv', label: 'WDV at disposal', align: 'right', render: (a) => <span className="money">{fmtMoney(a.disposal?.nbvAtDisposal ?? 0, s.currency)}</span> },
    { key: 'proceeds', label: 'Sale proceeds', align: 'right', render: (a) => <span className="money">{fmtMoney(a.disposal?.proceeds ?? 0, s.currency)}</span> },
    { key: 'gain', label: 'Gain / (loss)', align: 'right', render: (a) => <span className="money" style={{ fontWeight: 700, color: (a.disposal?.gainLoss ?? 0) >= 0 ? 'var(--good)' : 'var(--danger)' }}>{(a.disposal?.gainLoss ?? 0) >= 0 ? '+' : ''}{fmtMoney(a.disposal?.gainLoss ?? 0, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, a) => x + (a.disposal?.gainLoss ?? 0), 0), s.currency)}</span> },
    { key: 'journal', label: 'Journal', render: (a) => <span className="identifier">{a.disposal?.journalNumber ?? '—'}</span> },
    { key: 'status', label: 'Status', render: () => <Badge status="Posted" /> },
  ];
  return (
    <>
      <RegisterPage<Asset> title="Asset disposals" subtitle={`${disposed.length} disposal records · gain to 4130, loss to 5810`} rows={disposed} columns={cols} entity="disposals" searchKeys={['number', 'name']}
        primaryAction={{ label: 'Record disposal', onClick: () => setPickOpen(true) }}
        onRowClick={(a) => nav.go(`fixed-assets/register/${a.id}`)} showTotals emptyTitle="No disposals" />
      <Drawer open={pickOpen} onClose={() => setPickOpen(false)} title="Choose asset to dispose" width={480} footer={<><Button variant="ghost" onClick={() => setPickOpen(false)}>Cancel</Button><Button variant="primary" disabled={!pick} onClick={() => { setAsset(assets.find((a) => a.id === pick) ?? null); setPickOpen(false); }}>Continue</Button></>}><AssetPicker value={pick} onChange={setPick} /></Drawer>
      <DisposeDrawer asset={asset} onClose={() => setAsset(null)} />
    </>
  );
}

