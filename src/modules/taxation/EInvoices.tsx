// e-Invoices (FR-CMP-001..005) and e-Way bills (FR-L10N-004): registers, readiness, submit/retry/cancel via engine,
// bulk submit, detail drawer with IRP request/response from integration logs, validity alerts.
import { useMemo, useState } from 'react';
import { C, db, engine, nav, useSession, useCollection } from '../../store';
import type { DocHeader, IntegrationLog } from '../../store';
import { RegisterPage, Badge, Banner, Button, Drawer, ConfirmDialog, KV, Pill, useToast, TextField, NumberField, SelectField, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtDateTime, fmtPeriod } from '../../lib/format';
import { PeriodPicker } from '../reports/ReportFrame';
import { eInvoiceDocs, eWayBillDocs, taxSettings } from './derive';
import { useTaxDocs } from './Registers';

type Row = ReturnType<typeof eInvoiceDocs>[number] & { id: string; status: string; number: string; date: string; party: string; total: number };

export function EInvoices() {
  const s = useSession();
  const toast = useToast();
  const deps = useTaxDocs();
  const logs = useCollection<IntegrationLog>(C.integrationLogs);
  const [period, setPeriod] = useState('');
  const [detail, setDetail] = useState<Row | null>(null);
  const [cancelRow, setCancelRow] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const [synced, setSynced] = useState<string | null>(null);
  const rows: Row[] = useMemo(() => eInvoiceDocs({ period: period || undefined }).map((e) => ({ ...e, id: e.row.id, status: e.doc.statutory?.eInvoiceStatus ?? (e.readiness.applicable ? 'Pending' : 'Not Applicable'), number: e.doc.number, date: e.doc.date, party: e.row.party, total: e.doc.totals.total })), [period, ...deps, logs]);
  const counts = { accepted: rows.filter((r) => r.status === 'Accepted').length, pending: rows.filter((r) => r.status === 'Pending' || r.status === 'Queued').length, rejected: rows.filter((r) => r.status === 'Rejected' || r.status === 'Failed').length, cancelled: rows.filter((r) => r.status === 'Cancelled').length, na: rows.filter((r) => r.status === 'Not Applicable').length };
  const canSubmit = s.can('taxation.einvoice.submit') || s.can('taxation.*');
  const submit = (r: Row) => {
    try {
      const out = engine.submitEInvoice(r.row.collection, r.doc.id);
      if (out.statutory?.eInvoiceStatus === 'Accepted') toast.success(`IRN generated for ${r.number} · Ack ${out.statutory.ackNo}`);
      else toast.error(`${r.number} rejected: ${out.statutory?.eInvoiceError}`);
    } catch (e: any) { toast.error(e.message); }
  };
  const submitPending = () => {
    setBusy(true);
    const targets = rows.filter((r) => r.readiness.applicable && r.readiness.ok && (r.status === 'Pending' || r.status === 'Rejected' || r.status === 'Failed' || r.status === 'Queued'));
    let ok = 0, fail = 0;
    db.transaction(() => targets.forEach((r) => { try { const out = engine.submitEInvoice(r.row.collection, r.doc.id); if (out.statutory?.eInvoiceStatus === 'Accepted') ok++; else fail++; } catch { fail++; } }));
    setBusy(false);
    if (!targets.length) toast.info('Nothing ready to submit — check readiness issues');
    else toast[fail ? 'error' : 'success'](`Submitted ${targets.length}: ${ok} accepted, ${fail} rejected`);
  };
  const sync = () => { setSynced(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })); engine.audit({ action: 'einvoice.sync', objectType: 'IRP', detail: `${logs.filter((l) => l.provider === 'IRP').length} log entries re-read` }); toast.success('Synced from IRP — statuses refreshed from provider logs'); };
  const cols: Column<Row>[] = [
    { key: 'number', label: 'Document', render: (r) => <div><span className="identifier link">{r.number}</span><div className="cell-secondary">{r.doc.docType}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'party', label: 'Customer', render: (r) => <div><div className="cell-primary">{r.party}</div><div className="cell-secondary identifier">{r.row.gstin ?? '—'}</div></div> },
    { key: 'total', label: 'Amount', align: 'right', render: (r) => <span className="money">{fmtMoney(r.total, r.doc.currency)}</span> },
    { key: 'irn', label: 'IRN', render: (r) => r.doc.statutory?.irn ? <span className="identifier" title={r.doc.statutory.irn} style={{ fontSize: 10, color: '#6E6E71' }}>{r.doc.statutory.irn.slice(0, 24)}…</span> : <span style={{ color: '#B0B5BF' }}>—</span> },
    { key: 'ack', label: 'Ack no.', render: (r) => <span className="identifier" style={{ fontSize: 11 }}>{r.doc.statutory?.ackNo ?? '—'}</span> },
    { key: 'submitted', label: 'Submitted', render: (r) => <span style={{ fontSize: 12, color: '#5F6368' }}>{fmtDateTime(r.doc.statutory?.eInvoiceSubmittedAt)}</span> },
    { key: 'ready', label: 'Readiness', render: (r) => !r.readiness.applicable ? <Pill tone="neutral">N/A</Pill> : r.readiness.ok || r.status === 'Accepted' ? <Pill tone="good">Ready</Pill> : <span title={r.readiness.issues.join('; ')}><Pill tone="critical">{r.readiness.issues.length} issue{r.readiness.issues.length === 1 ? '' : 's'}</Pill></span> },
    { key: 'status', label: 'Status', render: (r) => <div><Badge status={r.status === 'Failed' ? 'Rejected' : r.status} />{(r.status === 'Rejected' || r.status === 'Failed') && r.doc.statutory?.eInvoiceError && <div style={{ fontSize: 11, color: '#C0393F', marginTop: 2, maxWidth: 220 }}>{r.doc.statutory.eInvoiceError}</div>}</div> },
    { key: 'act', label: '', render: (r) => (r.status === 'Pending' || r.status === 'Queued') && r.readiness.applicable ? <Button size="sm" variant="primary" disabled={!canSubmit || !r.readiness.ok} reason={!canSubmit ? 'Requires taxation permission' : !r.readiness.ok ? r.readiness.issues.join('; ') : undefined} onClick={(e) => { e.stopPropagation(); submit(r); }}>Submit</Button> : (r.status === 'Rejected' || r.status === 'Failed') ? <Button size="sm" variant="secondary" style={{ borderColor: '#C0393F', color: '#C0393F' }} onClick={(e) => { e.stopPropagation(); submit(r); }}>Fix and retry</Button> : null },
  ];
  const detailLogs = detail ? logs.filter((l) => l.objectId === detail.doc.id).sort((a, b) => b.at.localeCompare(a.at)) : [];
  return (
    <>
      <RegisterPage<Row> title="e-Invoices" subtitle={`IRP submission status · ${s.branch?.gstin ?? '—'} · ${period ? fmtPeriod(period) : 'all periods'}${synced ? ` · synced ${synced}` : ''}`} rows={rows} columns={cols} entity="e-invoices" searchKeys={['number', 'party']}
        actions={<><Button variant="secondary" onClick={sync}>Sync from IRP</Button><Button variant="primary" loading={busy} disabled={!canSubmit} reason={!canSubmit ? 'Requires taxation permission' : undefined} onClick={submitPending}>Submit pending</Button></>}
        headerExtra={<div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <PeriodPicker value={period} onChange={setPeriod} allowAll />
          <div style={{ display: 'flex', gap: 10, marginLeft: 8 }}>
            {[{ label: 'Accepted', n: counts.accepted, color: '#12784E', bg: '#E0F9EC' }, { label: 'Pending', n: counts.pending, color: '#3E5BA5', bg: '#EBF7FF' }, { label: 'Rejected', n: counts.rejected, color: '#C0393F', bg: '#FFE8EA' }, { label: 'Cancelled', n: counts.cancelled, color: '#5F6368', bg: '#F3F3F5' }, { label: 'Not applicable', n: counts.na, color: '#5F6368', bg: '#F3F3F5' }].map((b) => <div key={b.label} style={{ padding: '6px 14px', background: b.bg, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18, fontWeight: 700, color: b.color, fontFeatureSettings: '"tnum" 1' }}>{b.n}</span><span style={{ fontSize: 12, color: b.color, fontWeight: 500 }}>{b.label}</span></div>)}
          </div>
        </div>}
        tabs={[{ id: 'all', label: 'All' }, { id: 'pending', label: 'Pending', filter: (r) => r.status === 'Pending' || r.status === 'Queued' }, { id: 'accepted', label: 'Accepted', filter: (r) => r.status === 'Accepted' }, { id: 'rejected', label: 'Rejected', filter: (r) => r.status === 'Rejected' || r.status === 'Failed' }, { id: 'cancelled', label: 'Cancelled', filter: (r) => r.status === 'Cancelled' }]}
        onRowClick={(r) => setDetail(r)}
        rowActions={(r) => [
          { label: 'View request / response', onClick: () => setDetail(r) },
          { label: 'Open document', onClick: () => nav.go(r.row.link) },
          ...(r.status === 'Accepted' ? [{ label: 'Cancel IRN', danger: true, onClick: () => setCancelRow(r), disabled: (Date.now() - new Date(r.doc.statutory?.ackDate ?? 0).getTime()) / 3600000 > 24, reason: (Date.now() - new Date(r.doc.statutory?.ackDate ?? 0).getTime()) / 3600000 > 24 ? '24-hour window has passed — issue a credit note' : undefined }] : []),
        ]}
        emptyTitle="No e-invoice documents" emptyDescription="Posted sales invoices and credit notes to registered customers appear here." />
      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail ? `${detail.number} · e-Invoice` : ''} subtitle={detail ? `${detail.party} · ${fmtMoney(detail.total, detail.doc.currency)}` : ''} width={760}
        footer={detail && <><Button variant="ghost" onClick={() => setDetail(null)}>Close</Button><div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={() => nav.go(detail.row.link)}>Open document</Button>{(detail.status === 'Pending' || detail.status === 'Rejected' || detail.status === 'Failed') && detail.readiness.applicable && <Button variant="primary" disabled={!detail.readiness.ok} reason={detail.readiness.issues.join('; ')} onClick={() => { submit(detail); setDetail(null); }}>{detail.status === 'Pending' ? 'Submit to IRP' : 'Fix and retry'}</Button>}</div></>}>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Badge status={detail.status === 'Failed' ? 'Rejected' : detail.status} />{detail.doc.statutory?.eInvoiceError && <span style={{ color: '#C0393F', fontSize: 13 }}>{detail.doc.statutory.eInvoiceError}</span>}</div>
            {!detail.readiness.ok && detail.readiness.applicable && detail.status !== 'Accepted' && <Banner tone="warning">Readiness issues: {detail.readiness.issues.join(' · ')}</Banner>}
            <KV items={[{ k: 'IRN', v: detail.doc.statutory?.irn ? <span className="identifier" style={{ wordBreak: 'break-all', fontSize: 11 }}>{detail.doc.statutory.irn}</span> : '—' }, { k: 'Ack no. / date', v: detail.doc.statutory?.ackNo ? `${detail.doc.statutory.ackNo} · ${fmtDateTime(detail.doc.statutory.ackDate)}` : '—' }, { k: 'Signed QR', v: detail.doc.statutory?.signedQr ?? '—' }, { k: 'Seller GSTIN', v: db.find<any>(C.branches, detail.doc.branchId)?.gstin ?? '—' }, { k: 'Buyer GSTIN', v: detail.row.gstin ?? '—' }, { k: 'Idempotency key', v: <span className="identifier">einv:{detail.doc.id}</span> }, { k: 'Cancelled', v: detail.doc.statutory?.eInvoiceCancelledAt ? fmtDateTime(detail.doc.statutory.eInvoiceCancelledAt) : '—' }]} />
            <div className="section-title">Provider log (request / response)</div>
            {detailLogs.length === 0 && <div style={{ fontSize: 13, color: '#6E6E71' }}>No IRP calls yet for this document.</div>}
            {detailLogs.map((l) => (
              <div key={l.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span style={{ fontSize: 13, fontWeight: 600 }}>{l.action} · <Badge status={l.status} /></span><span style={{ fontSize: 12, color: '#6E6E71' }}>{fmtDateTime(l.at)} · {l.correlationId}</span></div>
                {l.errorMessage && <div style={{ color: '#C0393F', fontSize: 12, marginBottom: 6 }}>{l.errorCode} · {l.errorMessage}</div>}
                <div className="grid-2"><div><div className="section-label">Request · fingerprint {l.requestFingerprint}</div><pre style={{ fontSize: 11, background: '#F9FBFC', padding: 8, borderRadius: 6, overflow: 'auto', margin: 0 }}>{JSON.stringify(l.request, null, 2)}</pre></div><div><div className="section-label">Response</div><pre style={{ fontSize: 11, background: '#F9FBFC', padding: 8, borderRadius: 6, overflow: 'auto', margin: 0 }}>{JSON.stringify(l.response, null, 2)}</pre></div></div>
              </div>
            ))}
          </div>
        )}
      </Drawer>
      <ConfirmDialog open={!!cancelRow} onClose={() => setCancelRow(null)} title={`Cancel IRN for ${cancelRow?.number}`} statement="Cancels the e-invoice on the IRP within the statutory 24-hour window. The posted journal is not changed." confirmLabel="Cancel IRN" cancelLabel="Keep IRN" danger reasonRequired
        consequences={[{ engine: 'Statutory', text: 'IRN marked cancelled on the IRP and locally; signed QR no longer valid', tone: 'danger' }, { engine: 'Journal', text: 'No accounting impact — reverse or credit the document separately', tone: 'info' }, { engine: 'Notification', text: 'Audit trail records the reason', tone: 'info' }]}
        onConfirm={(reason) => { if (!cancelRow) return; engine.cancelEInvoice(cancelRow.row.collection, cancelRow.doc.id, reason); toast.success(`IRN cancelled for ${cancelRow.number}`); }} />
    </>
  );
}

type EwbRow = ReturnType<typeof eWayBillDocs>[number] & { id: string; number: string; date: string; party: string; total: number; status: string };

export function EWayBills() {
  const s = useSession();
  const toast = useToast();
  const deps = useTaxDocs();
  const deliveries = useCollection<any>(C.deliveries);
  const [period, setPeriod] = useState('');
  const [gen, setGen] = useState<EwbRow | null>(null);
  const [cancelRow, setCancelRow] = useState<EwbRow | null>(null);
  const [form, setForm] = useState({ vehicleNo: '', transporterId: '', distanceKm: 0, mode: 'Road' as 'Road' | 'Rail' | 'Air' | 'Ship' });
  const rows: EwbRow[] = useMemo(() => eWayBillDocs({ period: period || undefined }).map((e) => ({ ...e, id: e.row.id, number: e.doc.number, date: e.doc.date, party: e.row.party, total: e.doc.totals.total, status: e.doc.statutory?.ewbStatus ?? 'Pending' })), [period, ...deps, deliveries]);
  const expiring = rows.filter((r) => r.status === 'Generated' && r.doc.statutory?.ewbValidUpto && new Date(r.doc.statutory.ewbValidUpto).getTime() - Date.now() < 12 * 3600000);
  const expired = rows.filter((r) => r.status === 'Generated' && r.doc.statutory?.ewbValidUpto && new Date(r.doc.statutory.ewbValidUpto).getTime() < Date.now());
  const generate = () => {
    if (!gen) return;
    try { engine.generateEwayBill(gen.collection, gen.doc.id, form); toast.success(`e-Way bill generated for ${gen.number}`); setGen(null); setForm({ vehicleNo: '', transporterId: '', distanceKm: 0, mode: 'Road' }); }
    catch (e: any) { toast.error(e.message); }
  };
  const extend = (r: EwbRow) => {
    const d = db.find<DocHeader>(r.collection, r.doc.id)!;
    const until = new Date(Math.max(Date.now(), new Date(d.statutory?.ewbValidUpto ?? Date.now()).getTime()) + 86400000).toISOString();
    db.insert(C.integrationLogs, { provider: 'EWB', action: 'ExtendEWB', objectType: d.docType, objectId: d.id, objectNumber: d.number, requestFingerprint: 'ext' + d.id, idempotencyKey: `ewb-extend:${d.id}:${Date.now()}`, request: { EwbNo: d.statutory?.ewbNo, ExtendUpto: until, Reason: 'Transit delay' }, response: { EwbNo: d.statutory?.ewbNo, ValidUpto: until }, status: 'Accepted', providerRef: d.statutory?.ewbNo, at: new Date().toISOString(), correlationId: d.correlationId ?? 'corr_ewb' });
    db.update<DocHeader>(r.collection, d.id, { statutory: { ...d.statutory, ewbValidUpto: until, ewbStatus: 'Generated' } });
    engine.audit({ action: 'ewaybill.extended', objectType: d.docType, objectId: d.id, objectNumber: d.number, detail: `Valid until ${fmtDateTime(until)}` });
    toast.success(`Validity extended to ${fmtDateTime(until)}`);
  };
  const cols: Column<EwbRow>[] = [
    { key: 'number', label: 'Document', render: (r) => <div><span className="identifier link">{r.number}</span><div className="cell-secondary">{r.doc.docType}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'party', label: 'Consignee', render: (r) => <div><div className="cell-primary">{r.party}</div><div className="cell-secondary">{r.row.pos}</div></div> },
    { key: 'total', label: 'Value', align: 'right', render: (r) => <span className="money">{fmtMoney(r.total, r.doc.currency)}</span> },
    { key: 'ewbNo', label: 'EWB no.', render: (r) => <span className="identifier">{r.doc.statutory?.ewbNo ?? '—'}</span> },
    { key: 'vehicle', label: 'Vehicle / transporter', render: (r) => <span style={{ fontSize: 12 }}>{r.doc.statutory?.vehicleNo ?? '—'}{r.doc.statutory?.transporterId ? ` · ${r.doc.statutory.transporterId}` : ''}{r.doc.statutory?.distanceKm ? ` · ${r.doc.statutory.distanceKm} km` : ''}</span> },
    { key: 'valid', label: 'Valid until', render: (r) => { const v = r.doc.statutory?.ewbValidUpto; if (!v || r.status !== 'Generated') return '—'; const left = (new Date(v).getTime() - Date.now()) / 3600000; return <span>{fmtDateTime(v)} {left < 0 ? <Pill tone="critical">Expired</Pill> : left < 12 ? <Pill tone="warning">{Math.round(left)} h left</Pill> : null}</span>; } },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Pending' ? 'Submitted' : r.status}>{r.status}</Badge> },
    { key: 'act', label: '', render: (r) => r.status === 'Pending' || r.status === 'Cancelled' || r.status === 'Expired' ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setGen(r); }}>Generate</Button> : null },
  ];
  return (
    <>
      <RegisterPage<EwbRow> title="e-Way bills" subtitle={`Consignments ≥ ${fmtMoney(taxSettings().eWayBillThreshold, s.currency)} · ${period ? fmtPeriod(period) : 'all periods'} · ${rows.length} documents`} rows={rows} columns={cols} entity="e-way bills" searchKeys={['number', 'party']}
        headerExtra={<>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}><PeriodPicker value={period} onChange={setPeriod} allowAll /></div>
          {expired.length > 0 && <Banner tone="danger">{expired.length} e-way bill{expired.length === 1 ? '' : 's'} expired in transit — extend validity or generate a fresh bill before the vehicle moves.</Banner>}
          {expiring.length > 0 && expired.length === 0 && <Banner tone="warning">{expiring.length} e-way bill{expiring.length === 1 ? '' : 's'} expire within 12 hours.</Banner>}
        </>}
        tabs={[{ id: 'all', label: 'All' }, { id: 'pending', label: 'To generate', filter: (r) => r.status === 'Pending' }, { id: 'generated', label: 'Generated', filter: (r) => r.status === 'Generated' }, { id: 'cancelled', label: 'Cancelled / expired', filter: (r) => r.status === 'Cancelled' || r.status === 'Expired' }]}
        onRowClick={(r) => nav.go(r.row.link)}
        rowActions={(r) => [
          ...(r.status === 'Generated' ? [{ label: 'Extend validity (+24 h)', onClick: () => extend(r) }, { label: 'Cancel e-way bill', danger: true, onClick: () => setCancelRow(r) }] : [{ label: 'Generate e-way bill', onClick: () => setGen(r) }]),
          { label: 'Open document', onClick: () => nav.go(r.row.link) },
        ]}
        emptyTitle="No consignments above the e-way bill threshold" emptyDescription="Posted invoices and deliveries of ₹50,000 or more appear here." />
      <Drawer open={!!gen} onClose={() => setGen(null)} title={`Generate e-way bill · ${gen?.number ?? ''}`} subtitle={gen ? `${gen.party} · ${fmtMoney(gen.total, gen.doc.currency)}` : ''} width={520}
        footer={<><Button variant="ghost" onClick={() => setGen(null)}>Cancel</Button><Button variant="primary" onClick={generate} disabled={(!form.vehicleNo && !form.transporterId) || form.distanceKm <= 0}>Generate e-way bill</Button></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SelectField label="Mode of transport" value={form.mode} onChange={(v) => setForm({ ...form, mode: v as any })} options={['Road', 'Rail', 'Air', 'Ship']} />
          <TextField label="Vehicle number" value={form.vehicleNo} onChange={(v) => setForm({ ...form, vehicleNo: v })} placeholder="MH04KL2233" uppercase help="Required unless a transporter ID is given (Part B)" />
          <TextField label="Transporter ID (GSTIN)" value={form.transporterId} onChange={(v) => setForm({ ...form, transporterId: v })} placeholder="27AABCS9876T1Z0" uppercase />
          <NumberField label="Distance (km)" value={form.distanceKm} onChange={(v) => setForm({ ...form, distanceKm: v })} decimals={0} min={0} help="Validity: 1 day per 200 km (or part)" />
          {gen && <div style={{ fontSize: 12, color: '#6E6E71' }}>From {db.find<any>(C.branches, gen.doc.branchId)?.name} · to {gen.row.pos} · {gen.doc.lines.length} line{gen.doc.lines.length === 1 ? '' : 's'}{gen.doc.lines.some((l) => !l.hsn) && <span style={{ color: '#C0393F' }}> · HSN missing on a line</span>}</div>}
        </div>
      </Drawer>
      <ConfirmDialog open={!!cancelRow} onClose={() => setCancelRow(null)} title={`Cancel e-way bill ${cancelRow?.doc.statutory?.ewbNo ?? ''}`} statement="Cancels the e-way bill on the portal (allowed within 24 hours of generation, before the goods move)." confirmLabel="Cancel e-way bill" cancelLabel="Keep e-way bill" danger reasonRequired
        consequences={[{ engine: 'Statutory', text: 'EWB marked cancelled; a new bill is required before transport', tone: 'danger' }]}
        onConfirm={(reason) => { if (!cancelRow) return; engine.cancelEwayBill(cancelRow.collection, cancelRow.doc.id, reason); toast.success('e-Way bill cancelled'); }} />
    </>
  );
}

