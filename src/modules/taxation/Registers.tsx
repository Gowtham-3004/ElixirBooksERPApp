// GST registers (FR-CMP-006/007): B2B, B2C, Purchase/ITC, credit & debit notes — live from posted documents,
// period + registration filters, JSON/CSV export, reconciliation to tax ledgers.
import { useMemo, useState } from 'react';
import { C, nav, useSession, useCollection, db } from '../../store';
import type { Journal } from '../../store';
import { RegisterPage, Badge, Banner, Button, Pill, SummaryBlock, useToast, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPeriod, downloadText, toCSV } from '../../lib/format';
import { PeriodPicker } from '../reports/ReportFrame';
import { b2bRegister, b2cRegister, purchaseRegister, cdnRegister, sumRows, ledgerTax } from './derive';
import type { GstRegisterRow } from './types';

export type RegisterKind = 'b2b' | 'b2c' | 'itc' | 'cdn';

const META: Record<RegisterKind, { title: string; subtitle: string; fn: typeof b2bRegister; side: 'output' | 'input' }> = {
  b2b: { title: 'GST B2B register', subtitle: 'Posted sales invoices to registered persons (GSTIN)', fn: b2bRegister, side: 'output' },
  b2c: { title: 'GST B2C register', subtitle: 'Posted invoices to unregistered customers and POS bills', fn: b2cRegister, side: 'output' },
  itc: { title: 'Purchase (ITC) register', subtitle: 'Posted vendor invoices with input-tax eligibility per document', fn: purchaseRegister, side: 'input' },
  cdn: { title: 'Credit / debit notes register', subtitle: 'Posted credit notes (sales) and debit notes (purchase) — linked tax adjustments (FR-TAX-006)', fn: cdnRegister, side: 'output' },
};

export function RegistrationPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const s = useSession();
  const regs = (s.company?.registrations ?? []).filter((r) => r.type === 'GSTIN');
  return <div><label className="field-label">Registration (GSTIN)</label><select className="field-input sm" value={value} onChange={(e) => onChange(e.target.value)}><option value="">All registrations</option>{regs.map((r) => <option key={r.id} value={r.id}>{r.number} · {r.state}</option>)}</select></div>;
}

export function useTaxDocs() {
  const a = useCollection<any>(C.salesInvoices); const b = useCollection<any>(C.vendorInvoices); const c = useCollection<any>(C.creditNotes); const d = useCollection<any>(C.debitNotes); const e = useCollection<any>(C.posBills); const j = useCollection<Journal>(C.journals);
  return [a, b, c, d, e, j];
}

export function GstRegister({ kind }: { kind: RegisterKind }) {
  const s = useSession();
  const toast = useToast();
  const deps = useTaxDocs();
  const [period, setPeriod] = useState(s.state.periodCode ?? '2026-09');
  const [reg, setReg] = useState('');
  const meta = META[kind];
  const rows = useMemo(() => meta.fn({ period, registrationId: reg || undefined }), [kind, period, reg, ...deps]);
  const totals = useMemo(() => sumRows(rows), [rows]);
  const ledger = useMemo(() => ledgerTax(period, meta.side), [period, ...deps]);
  // reconciliation: registers on this side vs ledger movement (all output registers together for output side)
  const sideRows = useMemo(() => (meta.side === 'output' ? [...b2bRegister({ period, registrationId: reg || undefined }), ...b2cRegister({ period, registrationId: reg || undefined }), ...cdnRegister({ period, registrationId: reg || undefined }).filter((r) => r.collection === C.creditNotes)] : [...purchaseRegister({ period, registrationId: reg || undefined }), ...cdnRegister({ period, registrationId: reg || undefined }).filter((r) => r.collection === C.debitNotes)]), [kind, period, reg, ...deps]);
  const sideTotal = sumRows(sideRows);
  const diff = Math.round((sideTotal.tax - ledger.tax) * 100) / 100;
  const filed = db.findBy<any>(C.gstReturns, (r) => r.period === period && r.status === 'Filed' && (r.type === 'GSTR-1' || r.type === 'GSTR-3B'));
  const exportJson = () => { downloadText(`${kind}-${period}.json`, JSON.stringify({ gstin: s.branch?.gstin, period, generatedAt: new Date().toISOString(), rows, totals }, null, 2), 'application/json'); toast.success('JSON exported'); };
  const cols: Column<GstRegisterRow>[] = [
    { key: 'number', label: 'Document', render: (r) => <div><span className="identifier" style={{ color: r.sign < 0 ? '#C0393F' : '#325CFF' }}>{r.number}</span><div className="cell-secondary">{r.docType}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'party', label: kind === 'itc' ? 'Supplier' : 'Customer', render: (r) => <div><div className="cell-primary">{r.party}</div>{r.gstin && <div className="cell-secondary identifier">{r.gstin}</div>}</div>, sortable: true },
    { key: 'pos', label: 'POS', render: (r) => <span style={{ fontSize: 11, color: '#5F6368' }}>{r.pos}</span> },
    { key: 'taxable', label: 'Taxable', align: 'right', render: (r) => <span className="money">{fmtMoney(r.taxable, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(totals.taxable, s.currency)}</span>, sortable: true },
    { key: 'cgst', label: 'CGST', align: 'right', render: (r) => <span className="money" style={{ color: '#5F6368' }}>{r.cgst ? fmtMoney(r.cgst, s.currency) : '—'}</span>, total: () => <span className="money">{fmtMoney(totals.cgst, s.currency)}</span> },
    { key: 'sgst', label: 'SGST', align: 'right', render: (r) => <span className="money" style={{ color: '#5F6368' }}>{r.sgst ? fmtMoney(r.sgst, s.currency) : '—'}</span>, total: () => <span className="money">{fmtMoney(totals.sgst, s.currency)}</span> },
    { key: 'igst', label: 'IGST', align: 'right', render: (r) => <span className="money" style={{ color: '#5F6368' }}>{r.igst ? fmtMoney(r.igst, s.currency) : '—'}</span>, total: () => <span className="money">{fmtMoney(totals.igst, s.currency)}</span> },
    { key: 'cess', label: 'Cess', align: 'right', render: (r) => <span className="money" style={{ color: '#5F6368' }}>{r.cess ? fmtMoney(r.cess, s.currency) : '—'}</span> },
    { key: 'total', label: 'Total', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(r.total, s.currency)}</span>, total: () => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(totals.total, s.currency)}</span>, sortable: true },
    ...(kind === 'itc' ? [{ key: 'itc', label: 'ITC', render: (r: GstRegisterRow) => r.itcEligible ? <Badge status="Posted">Eligible</Badge> : <span title={r.itcIneligibleReason}><Badge status="Rejected">Ineligible</Badge></span> } as Column<GstRegisterRow>] : [{ key: 'einv', label: 'e-Invoice', render: (r: GstRegisterRow) => <Badge status={r.eInvoiceStatus === 'Failed' ? 'Rejected' : r.eInvoiceStatus} /> } as Column<GstRegisterRow>]),
    { key: 'flags', label: '', render: (r) => <span style={{ display: 'flex', gap: 4 }}>{r.hsnMissing && <Pill tone="warning" title="HSN/SAC missing on a line">HSN</Pill>}{r.reverseCharge && <Pill tone="neutral">RCM</Pill>}</span> },
  ];
  return (
    <RegisterPage<GstRegisterRow> title={meta.title} subtitle={<>{meta.subtitle} · {s.branch?.gstin ?? '—'} · {fmtPeriod(period)} · {rows.length} documents</>} rows={rows} columns={cols} entity={meta.title} exportName={`${kind}-${period}`} searchKeys={['number', 'party', 'gstin', 'pos']}
      actions={<><Button variant="secondary" size="sm" onClick={exportJson}>Export JSON</Button><Button variant="secondary" size="sm" onClick={() => downloadText(`${kind}-${period}.csv`, toCSV(rows as any, cols.filter((c) => c.key !== 'flags').map((c) => ({ key: c.key, label: String(c.label) }))))}>Export Excel (CSV)</Button></>}
      headerExtra={<>
        <div className="card toolbar" style={{ padding: '10px 14px', gap: 12, alignItems: 'flex-end' }}>
          <PeriodPicker value={period} onChange={setPeriod} />
          <RegistrationPicker value={reg} onChange={setReg} />
          <div style={{ flex: 1 }} />
          <SummaryBlock style={{ background: 'transparent', padding: 0 }} items={[{ label: 'Taxable', value: fmtMoney(totals.taxable, s.currency) }, { label: 'Tax', value: fmtMoney(totals.tax, s.currency) }, { label: 'Ledger (' + (meta.side === 'output' ? '2300–2302' : '1400–1402') + ')', value: fmtMoney(ledger.tax, s.currency) }]} />
        </div>
        {filed && <Banner tone="info">{fmtPeriod(period)} has a filed {filed.type} (ARN {filed.arn}) — tax data for this period is locked; corrections must go through an amendment in the next period.</Banner>}
        {diff === 0 ? <Banner tone="success">Reconciled: {meta.side} tax registers {fmtMoney(sideTotal.tax, s.currency)} = ledger movement {fmtMoney(ledger.tax, s.currency)} for {fmtPeriod(period)} (FR-CMP-007).</Banner> : <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('accounting/ledger', { account: meta.side === 'output' ? 'acc_2300' : 'acc_1400' })}>Open tax ledger</Button>}>Difference of {fmtMoney(diff, s.currency)} between {meta.side} tax registers ({fmtMoney(sideTotal.tax, s.currency)}) and the tax ledger movement ({fmtMoney(ledger.tax, s.currency)}) for {fmtPeriod(period)} — usually manual journals or documents posted without tax lines.</Banner>}
      </>}
      tabs={kind === 'itc' ? [{ id: 'all', label: 'All' }, { id: 'elig', label: 'Eligible', filter: (r) => !!r.itcEligible }, { id: 'inel', label: 'Ineligible', filter: (r) => r.itcEligible === false }, { id: 'rcm', label: 'Reverse charge', filter: (r) => r.reverseCharge }] : [{ id: 'all', label: 'All' }, { id: 'intra', label: 'Intra-state', filter: (r) => !r.igst }, { id: 'inter', label: 'Inter-state', filter: (r) => !!r.igst }, { id: 'hsn', label: 'HSN missing', filter: (r) => r.hsnMissing }]}
      onRowClick={(r) => nav.go(r.link)} showTotals
      emptyTitle={`No documents in ${fmtPeriod(period)}`} emptyDescription={kind === 'itc' ? 'Posted vendor invoices appear here.' : 'Posted sales documents appear here once Sales posts them.'} />
  );
}
