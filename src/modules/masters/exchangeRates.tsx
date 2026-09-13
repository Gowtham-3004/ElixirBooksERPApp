// Exchange rates (FR-FX-002/003/004): register with approval states, form (manual → Pending +
// workflow), CSV import, and a "Resolve rate" tester over engine.resolveRate.
import { useState } from 'react';
import { db, C, engine, nav, useCollection, useRoute, useSession } from '../../store';
import type { ApprovalRequest, Currency, ExchangeRate } from '../../store';
import { Badge, Button, ConfirmDialog, DateField, Drawer, ImportWizard, NumberField, RegisterPage, SelectField, TextArea, TextField, TwoLine, useToast } from '../../components/ui';
import { fmtDateTime, today, fmtDate } from '../../lib/format';
import { DrawerFooter, ErrorSummary, useForm } from './shared';
import { exchangeRateImport } from './importDefs';

const TYPES: ExchangeRate['type'][] = ['Spot', 'Closing', 'Average', 'Manual', 'Historical', 'Imported'];
const NEEDS_APPROVAL: ExchangeRate['type'][] = ['Manual', 'Imported'];

export function ExchangeRateRegister() {
  const s = useSession();
  const route = useRoute();
  const toast = useToast();
  const all = useCollection<ExchangeRate>(C.exchangeRates);
  const approvals = useCollection<ApprovalRequest>(C.approvals);
  const rows = [...all].sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt)).filter((r) => !route.params.currency || r.base === route.params.currency || r.quote === route.params.currency);
  const [editing, setEditing] = useState<ExchangeRate | null | 'new'>(null);
  const [imp, setImp] = useState(false);
  const [tester, setTester] = useState(false);
  const [confirm, setConfirm] = useState<{ rate: ExchangeRate; action: 'Approve' | 'Reject' } | null>(null);
  const canApprove = s.can('accounting.fx.approve') || s.can('accounting.*') || s.can('masters.exchangerates.approve') || s.isTenantOwner;
  const canCreate = s.can('masters.exchangerates.create') || s.can('masters.*') || s.can('accounting.*');
  const pendingReq = (r: ExchangeRate) => approvals.find((a) => a.docId === r.id && a.status === 'Pending');
  const decide = (r: ExchangeRate, action: 'Approve' | 'Reject', reason: string) => {
    db.transaction(() => {
      db.update<ExchangeRate>(C.exchangeRates, r.id, { status: action === 'Approve' ? 'Approved' : 'Rejected', approvedBy: engine.ctx().userName, reason: r.reason ? `${r.reason} · ${action === 'Approve' ? 'Approved' : 'Rejected'}: ${reason}` : reason });
      const req = pendingReq(r);
      if (req) db.update<ApprovalRequest>(C.approvals, req.id, { status: action === 'Approve' ? 'Approved' : 'Rejected', completedAt: new Date().toISOString(), history: [...req.history, { at: new Date().toISOString(), by: engine.ctx().userName, action: `${action}d directly by Finance Admin`, comment: reason }] });
      engine.audit({ action: action === 'Approve' ? 'fx.rate_approved' : 'fx.rate_rejected', objectType: 'Exchange Rate', objectId: r.id, objectNumber: `${r.base}/${r.quote} ${r.rate}`, detail: reason, before: { status: r.status }, after: { status: action === 'Approve' ? 'Approved' : 'Rejected' } });
    });
    toast.success(`${r.base}/${r.quote} ${r.rate} ${action === 'Approve' ? 'approved' : 'rejected'}`);
  };
  return (
    <>
      <RegisterPage<ExchangeRate>
        title="Exchange rates"
        subtitle={`${rows.filter((r) => r.status === 'Approved').length} approved · ${rows.filter((r) => r.status === 'Pending').length} pending · base ${s.currency} · FR-FX-002/003`}
        entity="exchange rates"
        rows={rows}
        searchKeys={['base', 'quote', 'type', 'source']}
        tabs={[{ id: 'all', label: 'All', filter: () => true }, { id: 'pending', label: 'Pending approval', filter: (r) => r.status === 'Pending' }, { id: 'approved', label: 'Approved', filter: (r) => r.status === 'Approved' }, { id: 'rejected', label: 'Rejected', filter: (r) => r.status === 'Rejected' }]}
        filters={[{ key: 'pair', label: 'Currency', type: 'text' }, { key: 'type', label: 'Type', type: 'select', options: TYPES.map((t) => ({ value: t, label: t })) }, { key: 'effectiveAt', label: 'Effective', type: 'date-range' }]}
        applyFilter={(r, f) => (!f.pair || `${r.base}/${r.quote}`.toLowerCase().includes(String(f.pair).toLowerCase())) && (!f.type || r.type === f.type) && (!f.effectiveAtFrom || r.effectiveAt.slice(0, 10) >= f.effectiveAtFrom) && (!f.effectiveAtTo || r.effectiveAt.slice(0, 10) <= f.effectiveAtTo)}
        primaryAction={{ label: 'New rate', onClick: () => setEditing('new'), disabled: !canCreate, reason: canCreate ? undefined : 'Requires exchange-rate permission' }}
        importAction={() => setImp(true)}
        actions={<Button variant="tinted" onClick={() => setTester(true)}>Resolve rate</Button>}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => [
          { label: 'View', onClick: () => setEditing(r) },
          ...(r.status === 'Pending' ? [{ label: 'Approve', onClick: () => setConfirm({ rate: r, action: 'Approve' }), disabled: !canApprove, reason: canApprove ? undefined : 'Requires Finance Admin' }, { label: 'Reject', onClick: () => setConfirm({ rate: r, action: 'Reject' }), disabled: !canApprove, reason: canApprove ? undefined : 'Requires Finance Admin', danger: true }] : []),
          ...(pendingReq(r) ? [{ label: 'Open approval request', onClick: () => nav.go(`approvals?id=${pendingReq(r)!.id}`) }] : []),
          { label: 'Rate audit trail', onClick: () => nav.go(`admin/audit?object=${r.id}`), separator: true },
        ]}
        columns={[
          { key: 'pair', label: 'Pair', sortable: true, render: (r) => <TwoLine primary={<span><span className="currency-tag">{r.base}</span> → <span className="currency-tag">{r.quote}</span></span>} secondary={r.direction === 'Multiply' ? `1 ${r.base} = ${r.rate} ${r.quote}` : `${r.quote} ÷ ${r.rate}`} />, value: (r) => `${r.base}/${r.quote}` },
          { key: 'rate', label: 'Rate', align: 'right', sortable: true, render: (r) => <span className="money" style={{ fontWeight: 600 }}>{r.rate.toFixed(4)}</span> },
          { key: 'type', label: 'Type', render: (r) => <span className="pill pill-neutral">{r.type}</span> },
          { key: 'effectiveAt', label: 'Effective', sortable: true, render: (r) => fmtDateTime(r.effectiveAt) },
          { key: 'source', label: 'Source' },
          { key: 'approvedBy', label: 'Approved by', render: (r) => r.approvedBy ?? '—' },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (r.status === 'Rejected' ? 'muted' : undefined)}
      />
      {editing && <ExchangeRateForm rate={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {tester && <RateResolver onClose={() => setTester(false)} />}
      <ImportWizard open={imp} onClose={() => setImp(false)} {...exchangeRateImport(all)} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `${confirm.action} rate ${confirm.rate.base}/${confirm.rate.quote} ${confirm.rate.rate}?` : ''} statement={confirm?.action === 'Approve' ? 'Approved rates become eligible for rate resolution immediately; posted transactions are never recalculated (FR-FX-013).' : 'The rate will be excluded from resolution.'} consequences={confirm ? [{ engine: 'Workflow', text: pendingReq(confirm.rate) ? 'Pending approval request is closed with your decision' : 'No workflow request — direct Finance Admin decision is audited' }, { engine: 'Journal', text: `Future ${confirm.rate.base} postings on/after ${fmtDate(confirm.rate.effectiveAt)} may pick this ${confirm.rate.type} rate` }] : []} reasonRequired confirmLabel={confirm?.action === 'Approve' ? 'Approve rate' : 'Reject rate'} cancelLabel="Keep pending" danger={confirm?.action === 'Reject'} onConfirm={(reason) => { if (confirm) decide(confirm.rate, confirm.action, reason); }} />
    </>
  );
}

function ExchangeRateForm({ rate, onClose }: { rate?: ExchangeRate; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active');
  const f = useForm<any>(rate ? { ...rate, effectiveDate: rate.effectiveAt.slice(0, 10), effectiveTime: rate.effectiveAt.slice(11, 16) || '09:00' } : { base: 'USD', quote: s.currency, rate: 0, direction: 'Multiply', type: 'Spot', effectiveDate: today(), effectiveTime: '09:00', source: 'RBI reference', reason: '' });
  const [saving, setSaving] = useState(false);
  const readOnly = !!rate;
  const needsApproval = NEEDS_APPROVAL.includes(f.v.type) || !!f.v.reason;
  const latest = engine.resolveRate(f.v.base, f.v.quote, f.v.effectiveDate);
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.base || !f.v.quote) e.base = 'Choose both currencies';
    if (f.v.base === f.v.quote) e.quote = 'Base and quote must differ';
    if (!(f.v.rate > 0)) e.rate = 'Rate must be positive';
    if (!f.v.effectiveDate) e.effectiveDate = 'Effective date is required';
    if (needsApproval && (f.v.reason ?? '').trim().length < 10) e.reason = 'Manual / imported rates need a reason of at least 10 characters (FR-FX-004)';
    if (latest.rate && Math.abs(f.v.rate - latest.rate) / latest.rate > 0.1 && !f.v.reason) e.reason = `Rate deviates more than 10% from the latest ${latest.type} rate ${latest.rate} — give a reason`;
    f.setErrors(e);
    if (Object.keys(e).length || saving) return;
    setSaving(true);
    try {
      const status: ExchangeRate['status'] = needsApproval ? 'Pending' : 'Approved';
      const row = db.insert<ExchangeRate>(C.exchangeRates, { base: f.v.base, quote: f.v.quote, rate: f.v.rate, direction: f.v.direction, type: f.v.type, effectiveAt: `${f.v.effectiveDate}T${f.v.effectiveTime || '09:00'}:00.000Z`, source: f.v.source || (f.v.type === 'Manual' ? 'Manual entry' : 'Provider'), status, reason: f.v.reason || undefined, approvedBy: status === 'Approved' ? engine.ctx().userName : undefined });
      engine.audit({ action: 'fx.rate_created', objectType: 'Exchange Rate', objectId: row.id, objectNumber: `${row.base}/${row.quote} ${row.rate}`, detail: `${row.type} · ${row.source}${row.reason ? ' · ' + row.reason : ''}`, after: { rate: row.rate, type: row.type, status } });
      if (needsApproval) {
        const req = engine.submitForApproval({ docType: 'Exchange Rate', collection: C.exchangeRates, docId: row.id, docNumber: `${row.base}/${row.quote} ${row.rate}`, amount: 0, summary: `${row.type} rate ${row.base}/${row.quote} ${row.rate} effective ${f.v.effectiveDate} — ${row.reason}`, skipStatusUpdate: true });
        if (!req) db.update<ExchangeRate>(C.exchangeRates, row.id, { status: 'Approved', approvedBy: engine.ctx().userName });
        toast.success(req ? 'Rate submitted for Finance approval' : 'Rate approved (no workflow configured)', { label: 'Approvals', path: 'approvals' });
      } else toast.success(`${row.base}/${row.quote} ${row.rate} recorded`);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? 'Could not save rate'); setSaving(false); }
  };
  const ccyOpts = currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }));
  return (
    <Drawer open onClose={onClose} title={rate ? `${rate.base}/${rate.quote} ${rate.rate} · ${rate.type}` : 'New exchange rate'} subtitle={rate ? `${rate.status} · ${rate.source} · effective ${fmtDateTime(rate.effectiveAt)}` : 'Manual and imported rates need a reason and Finance approval (FR-FX-004)'} width={560}
      footer={readOnly ? <Button variant="ghost" onClick={onClose}>Close</Button> : <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={needsApproval ? 'Submit for approval' : 'Record rate'} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorSummary errors={f.errors} />
        {rate && <div className="banner info">Rates are immutable once recorded (FR-FX-013). Record a new rate with a later effective time to supersede this one.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <SelectField label="Base currency" value={f.v.base} onChange={(v) => f.set('base', v)} options={ccyOpts} disabled={readOnly} error={f.errors.base} />
          <SelectField label="Quote currency" value={f.v.quote} onChange={(v) => f.set('quote', v)} options={ccyOpts} disabled={readOnly} error={f.errors.quote} />
          <NumberField label={`Rate (1 ${f.v.base} = ? ${f.v.quote})`} value={f.v.rate} onChange={(v) => f.set('rate', v)} decimals={6} disabled={readOnly} error={f.errors.rate} help={latest.rate ? `Latest resolved: ${latest.rate} (${latest.type}, ${latest.source})` : 'No prior rate for this pair'} />
          <SelectField label="Direction" value={f.v.direction} onChange={(v) => f.set('direction', v)} options={['Multiply', 'Divide']} disabled={readOnly} />
          <SelectField label="Type" value={f.v.type} onChange={(v) => f.set('type', v)} options={TYPES} disabled={readOnly} help={NEEDS_APPROVAL.includes(f.v.type) ? 'Needs Finance approval' : 'Provider rate — approved on entry'} />
          <TextField label="Source" value={f.v.source} onChange={(v) => f.set('source', v)} disabled={readOnly} placeholder="RBI reference, HDFC deal rate…" />
          <DateField label="Effective date" required value={f.v.effectiveDate} onChange={(v) => f.set('effectiveDate', v)} disabled={readOnly} error={f.errors.effectiveDate} />
          <TextField label="Effective time (UTC)" value={f.v.effectiveTime} onChange={(v) => f.set('effectiveTime', v)} disabled={readOnly} type="time" />
        </div>
        <TextArea label={needsApproval ? 'Reason (required)' : 'Reason / note'} required={needsApproval} value={f.v.reason ?? ''} onChange={(v) => f.set('reason', v)} disabled={readOnly} error={f.errors.reason} minLength={needsApproval ? 10 : undefined} />
        {rate?.approvedBy && <div style={{ fontSize: 12, color: '#5F6368' }}>{rate.status} by {rate.approvedBy}</div>}
      </div>
    </Drawer>
  );
}

export function RateResolver({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active');
  const rates = useCollection<ExchangeRate>(C.exchangeRates);
  const [from, setFrom] = useState('USD');
  const [to, setTo] = useState(s.currency);
  const [date, setDate] = useState(today());
  const [type, setType] = useState<string>('');
  const res = engine.resolveRate(from, to, date, (type || undefined) as ExchangeRate['type'] | undefined);
  const order = type ? [type] : ['Spot', 'Closing', 'Manual', 'Imported', 'Historical', 'Average'];
  const pool = rates.filter((r) => r.status === 'Approved' && r.effectiveAt.slice(0, 10) <= date);
  const hierarchy = order.map((t) => ({ t, direct: pool.filter((r) => r.base === from && r.quote === to && r.type === t).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0], inverse: pool.filter((r) => r.base === to && r.quote === from && r.type === t).sort((a, b) => b.effectiveAt.localeCompare(a.effectiveAt))[0] }));
  const ccy = currencies.map((c) => c.code);
  return (
    <Drawer open onClose={onClose} title="Resolve rate" subtitle="Deterministic hierarchy used by every posting (FR-FX-003)" width={640} footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        <SelectField label="From" value={from} onChange={setFrom} options={ccy} />
        <SelectField label="To" value={to} onChange={setTo} options={ccy} />
        <DateField label="As of" value={date} onChange={setDate} />
        <SelectField label="Rate type" value={type} onChange={setType} options={TYPES} allowEmpty placeholder="Any (hierarchy)" />
      </div>
      <div className="card" style={{ padding: 18, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 28, fontWeight: 600, fontFeatureSettings: '"tnum" 1' }}>{res.rate ? res.rate.toFixed(6) : '—'}</span>
          <Badge status={res.rate ? 'Approved' : 'Rejected'}>{res.rate ? res.type : 'No rate'}</Badge>
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>{res.rate ? <>1 {from} = {res.rate} {to} · source <strong>{res.source}</strong> · effective {fmtDateTime(res.at)}{res.id && <> · <span className="identifier">{res.id}</span></>}</> : `No approved rate for ${from}/${to} on or before ${fmtDate(date)} — postings in ${from} will be blocked (MISSING).`}</div>
        <div className="section-label" style={{ marginTop: 16, marginBottom: 6 }}>Hierarchy (first hit wins; direct pair, then inverse, then cross via INR/USD)</div>
        <table className="data-table dense">
          <thead><tr><th>Priority</th><th>Type</th><th>Direct {from}→{to}</th><th>Inverse {to}→{from}</th></tr></thead>
          <tbody>
            {hierarchy.map((h, i) => { const hit = res.id && (h.direct?.id === res.id || h.inverse?.id === res.id); return <tr key={h.t} style={{ fontWeight: hit ? 600 : 400, color: hit ? '#12784E' : undefined }}><td>{i + 1}</td><td>{h.t}</td><td>{h.direct ? `${h.direct.rate} · ${fmtDate(h.direct.effectiveAt)}` : '—'}</td><td>{h.inverse ? `${h.inverse.rate} (→ ${(1 / h.inverse.rate).toFixed(6)}) · ${fmtDate(h.inverse.effectiveAt)}` : '—'}</td></tr>; })}
            <tr style={{ color: res.type.startsWith('Cross') ? '#12784E' : undefined, fontWeight: res.type.startsWith('Cross') ? 600 : 400 }}><td>{hierarchy.length + 1}</td><td>Cross rate</td><td colSpan={2}>via INR then USD pivot{res.type.startsWith('Cross') ? ` — ${res.type}` : ''}</td></tr>
          </tbody>
        </table>
        <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 10 }}>Only <strong>Approved</strong> rates participate. Pending manual rates are ignored until approved. Later corrections never change posted transactions (FR-FX-013).</div>
      </div>
    </Drawer>
  );
}
