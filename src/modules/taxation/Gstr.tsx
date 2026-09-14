// GSTR-1 and GSTR-3B preparation (FR-CMP-007): sections computed live from registers, reconciliation to tax ledgers,
// HSN summary, JSON generation, mark-as-filed with version history, period locking, payment challan (draft journal).
import { useMemo, useState } from 'react';
import { C, db, engine, nav, useSession, useCollection, useRoute, IDS } from '../../store';
import type { Journal } from '../../store';
import { Banner, Button, Badge, ConfirmDialog, KpiTile, SummaryBlock, useToast, Modal, KV } from '../../components/ui';
import { fmtMoney, fmtPeriod, fmtDate, fmtDateTime, downloadText, today, fiscalYearOf } from '../../lib/format';
import { PeriodPicker } from '../reports/ReportFrame';
import { RegistrationPicker, useTaxDocs } from './Registers';
import { gstr1Sections, gstr3bSections, setOff, ledgerTax, taxSettings, b2bRegister, b2cRegister, cdnRegister } from './derive';
import type { StatutoryReturn, ReturnSection } from './types';

function useReturnState(type: 'GSTR-1' | 'GSTR-3B') {
  const s = useSession();
  const route = useRoute();
  const [period, setPeriod] = useState(route.params.period || s.state.periodCode || '2026-09');
  const [reg, setReg] = useState('');
  const returns = useCollection<StatutoryReturn>(C.gstReturns);
  const history = returns.filter((r) => r.type === type && r.period === period && (!reg || r.registrationId === reg)).sort((a, b) => b.version - a.version);
  const filed = history.find((r) => r.status === 'Filed');
  return { s, period, setPeriod, reg, setReg, history, filed, returns };
}

function SectionTable({ sections, currency, onDrill }: { sections: ReturnSection[]; currency: string; onDrill?: (code: string) => void }) {
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <table className="data-table"><thead><tr><th>Section</th><th>Description</th><th className="right">Records</th><th className="right">Taxable value</th><th className="right">CGST</th><th className="right">SGST</th><th className="right">IGST</th><th className="right">Cess</th><th className="right">Tax</th></tr></thead>
        <tbody>{sections.map((x) => { const na = x.count === 0 && x.taxable === 0 && x.tax === 0; return (
          <tr key={x.code} style={{ opacity: na ? 0.45 : 1, cursor: onDrill && !na ? 'pointer' : undefined }} onClick={() => !na && onDrill?.(x.code)}>
            <td><span style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)' }}>{x.code}</span></td><td style={{ fontSize: 13 }}>{x.desc}</td><td className="right">{x.count || '—'}</td>
            <td className="right money">{x.taxable ? fmtMoney(x.taxable, currency) : '—'}</td><td className="right money">{x.cgst ? fmtMoney(x.cgst, currency) : '—'}</td><td className="right money">{x.sgst ? fmtMoney(x.sgst, currency) : '—'}</td><td className="right money">{x.igst ? fmtMoney(x.igst, currency) : '—'}</td><td className="right money">{x.cess ? fmtMoney(x.cess, currency) : '—'}</td><td className="right money" style={{ fontWeight: 600 }}>{x.tax ? fmtMoney(x.tax, currency) : '—'}</td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}

function History({ rows, currency }: { rows: StatutoryReturn[]; currency: string }) {
  if (!rows.length) return null;
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--hairline)' }}>Generation & filing history</div>
      <table className="data-table dense"><thead><tr><th>Version</th><th>Generated</th><th className="right">Taxable</th><th className="right">Tax</th><th className="right">Recon. diff</th><th>Status</th><th>Filed</th><th>ARN</th><th /></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td><span className="identifier">v{r.version}</span></td><td>{fmtDateTime(r.generatedAt)} · {r.generatedBy}</td><td className="right money">{fmtMoney(r.totals.taxable, currency)}</td><td className="right money">{fmtMoney(r.totals.tax, currency)}</td><td className="right money" style={{ color: r.reconciliation?.difference ? 'var(--danger)' : 'var(--good)' }}>{fmtMoney(r.reconciliation?.difference ?? 0, currency)}</td><td><Badge status={r.status === 'Superseded' ? 'Cancelled' : r.status === 'Generated' ? 'Draft' : r.status}>{r.status}</Badge></td><td>{r.filedAt ? `${fmtDateTime(r.filedAt)} · ${r.filedBy}` : '—'}</td><td><span className="identifier">{r.arn ?? '—'}</span></td><td><Button size="sm" variant="ghost" onClick={() => downloadText(`${r.type}-${r.period}-v${r.version}.json`, r.json ?? JSON.stringify(r, null, 2), 'application/json')}>JSON</Button></td></tr>)}
      </tbody></table>
    </div>
  );
}

export function Gstr1() {
  const st = useReturnState('GSTR-1');
  const { s, period, reg, history, filed } = st;
  const deps = useTaxDocs();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState<'sections' | 'hsn'>('sections');
  const data = useMemo(() => gstr1Sections(period, reg || undefined), [period, reg, ...deps]);
  const ledger = useMemo(() => ledgerTax(period, 'output'), [period, ...deps]);
  const totals = useMemo(() => { const rows = [...b2bRegister({ period, registrationId: reg || undefined }), ...b2cRegister({ period, registrationId: reg || undefined }), ...cdnRegister({ period, registrationId: reg || undefined }).filter((r) => r.collection === C.creditNotes)]; return rows.reduce((t, r) => ({ taxable: t.taxable + r.taxable, cgst: t.cgst + r.cgst, sgst: t.sgst + r.sgst, igst: t.igst + r.igst, cess: t.cess + r.cess, tax: t.tax + r.tax }), { taxable: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, tax: 0 }); }, [period, reg, ...deps]);
  const diff = Math.round((totals.tax - ledger.tax) * 100) / 100;
  const gstin = reg ? s.company?.registrations.find((r) => r.id === reg)?.number : s.branch?.gstin;
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  const due = `${new Date(y, m, 1).getFullYear()}-${String(new Date(y, m, 1).getMonth() + 1).padStart(2, '0')}-${String(taxSettings().gstr1DueDay).padStart(2, '0')}`;
  const payload = () => JSON.stringify({ gstin, fp: period.slice(5, 7) + period.slice(0, 4), version: 'GST3.1.0', hash: 'hash', ...Object.fromEntries(data.sections.map((x) => [x.code.toLowerCase(), { count: x.count, txval: x.taxable, camt: x.cgst, samt: x.sgst, iamt: x.igst, csamt: x.cess }])), hsn: data.hsn, generatedAt: new Date().toISOString() }, null, 2);
  const generate = (file: boolean) => {
    const version = (history[0]?.version ?? 0) + 1;
    const rec = db.transaction(() => {
      history.filter((h) => h.status !== 'Filed').forEach((h) => db.update<StatutoryReturn>(C.gstReturns, h.id, { status: 'Superseded' }));
      const r = db.insert<StatutoryReturn>(C.gstReturns, { type: 'GSTR-1', period, fy: fiscalYearOf(`${period}-01`, s.company?.fiscalYearStartMonth), registrationId: reg || s.branch?.registrationId, gstin, version, status: file ? 'Filed' : 'Generated', sections: data.sections, totals: { taxable: totals.taxable, cgst: totals.cgst, sgst: totals.sgst, igst: totals.igst, cess: totals.cess, tax: totals.tax }, reconciliation: { registerTax: totals.tax, ledgerTax: ledger.tax, difference: diff }, generatedAt: new Date().toISOString(), generatedBy: s.user?.name ?? 'system', filedAt: file ? new Date().toISOString() : undefined, filedBy: file ? s.user?.name : undefined, arn: file ? `AA${gstin?.slice(0, 2) ?? '27'}${period.slice(5, 7)}${period.slice(2, 4)}${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}M` : undefined, dueDate: due, json: payload() });
      engine.audit({ action: file ? 'gstr1.filed' : 'gstr1.generated', objectType: 'GSTR-1', objectId: r.id, objectNumber: `${period} v${version}`, detail: `Tax ${totals.tax} · recon diff ${diff}${file ? ' · ARN ' + r.arn : ''}` });
      if (file) engine.notify({ type: 'system', title: `GSTR-1 ${fmtPeriod(period)} filed`, body: `ARN ${r.arn} · tax data for ${fmtPeriod(period)} is now locked`, link: 'taxation/filings' });
      return r;
    });
    if (!file) { downloadText(`GSTR1-${period}-v${version}.json`, rec.json ?? '', 'application/json'); toast.success(`GSTR-1 v${version} generated and downloaded`); }
    else toast.success(`GSTR-1 ${fmtPeriod(period)} marked filed · ARN ${rec.arn}`, { label: 'Filing history', path: 'taxation/filings' });
  };
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">GSTR-1 {filed ? '' : 'draft'}</h1><div className="page-subtitle">{fmtPeriod(period)} · GSTIN {gstin ?? '—'} · Due {fmtDate(due)} · {data.docsIssued} documents · {history.length ? `latest v${history[0].version} (${history[0].status})` : 'not generated yet'}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => generate(false)} disabled={!!filed} reason={filed ? 'Period filed — regenerate as amendment next period' : undefined}>Generate JSON</Button>
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={!!filed || !s.can('taxation.return.file') && !s.can('taxation.*')} reason={filed ? `Filed · ARN ${filed.arn}` : !s.can('taxation.*') ? 'Requires taxation filing permission' : undefined}>Mark as filed</Button>
        </div>
      </div>
      <div className="card toolbar" style={{ padding: '10px 14px', gap: 12, alignItems: 'flex-end' }}><PeriodPicker value={period} onChange={st.setPeriod} /><RegistrationPicker value={reg} onChange={st.setReg} /></div>
      {filed ? <Banner tone="info">GSTR-1 for {fmtPeriod(period)} was filed on {fmtDate(filed.filedAt)} by {filed.filedBy} · ARN <span className="identifier">{filed.arn}</span>. Tax data for this period is locked — changes must be reported as amendments in a later period.</Banner>
        : diff === 0 ? <Banner tone="success">All B2B, B2C and CDN registers reconcile to the output tax ledger for {fmtPeriod(period)} ({fmtMoney(totals.tax, s.currency)}). Ready to generate.</Banner>
        : <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('accounting/ledger?account=acc_2300')}>Open tax ledger</Button>}>Registers total {fmtMoney(totals.tax, s.currency)} vs output tax ledger movement {fmtMoney(ledger.tax, s.currency)} — difference {fmtMoney(diff, s.currency)}. Review before filing (FR-CMP-007).</Banner>}
      <div className="grid-4">
        <KpiTile label="Taxable value" amount={totals.taxable} currency={s.currency} />
        <KpiTile label="CGST + SGST" amount={totals.cgst + totals.sgst} currency={s.currency} />
        <KpiTile label="IGST" amount={totals.igst} currency={s.currency} />
        <KpiTile label="Total tax" amount={totals.tax} currency={s.currency} sub={`ledger ${fmtMoney(ledger.tax, s.currency)}`} deltaTone={diff === 0 ? 'good' : 'bad'} delta={diff === 0 ? 'Reconciled' : `Diff ${fmtMoney(diff, s.currency)}`} />
      </div>
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)' }}>{(['sections', 'hsn'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'sections' ? 'Sections' : `HSN summary (${data.hsn.length})`}</button>)}</div>
      {tab === 'sections' ? <SectionTable sections={data.sections} currency={s.currency} onDrill={(code) => nav.go(code.startsWith('4A') || code === '6A' ? 'taxation/b2b' : code.startsWith('9B') ? 'taxation/cdn' : 'taxation/b2c')} /> : (
        <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>HSN / SAC</th><th>Description</th><th className="right">Rate</th><th className="right">Qty</th><th className="right">Taxable</th><th className="right">Tax</th></tr></thead><tbody>
          {data.hsn.map((h) => <tr key={h.hsn}><td className="identifier">{h.hsn}</td><td>{h.description}</td><td className="right">{h.rate}%</td><td className="right money">{h.qty}</td><td className="right money">{fmtMoney(h.taxable, s.currency)}</td><td className="right money">{fmtMoney(h.tax, s.currency)}</td></tr>)}
          {data.hsn.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--ink-4)' }}>No outward supplies in {fmtPeriod(period)}</td></tr>}
        </tbody></table></div>
      )}
      <History rows={history} currency={s.currency} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Mark GSTR-1 for ${fmtPeriod(period)} as filed`} statement="Records the filing with a simulated ARN and freezes tax data for the period." confirmLabel="Mark as filed" cancelLabel="Not yet"
        consequences={[{ engine: 'Statutory', text: `Version ${(history[0]?.version ?? 0) + 1} stored with sections, totals and reconciliation; ARN generated`, tone: 'success' }, { engine: 'Tax', text: `${fmtPeriod(period)} registers locked — later changes become amendments`, tone: 'warning' }, ...(diff !== 0 ? [{ engine: 'Tax', text: `Unreconciled difference of ${fmtMoney(diff, s.currency)} will be recorded with the filing`, tone: 'danger' as const }] : [])]}
        onConfirm={() => generate(true)} />
    </div>
  );
}

export function Gstr3b() {
  const st = useReturnState('GSTR-3B');
  const { s, period, reg, history, filed } = st;
  const deps = useTaxDocs();
  const journals = useCollection<Journal>(C.journals);
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [challan, setChallan] = useState(false);
  const data = useMemo(() => gstr3bSections(period, reg || undefined), [period, reg, ...deps]);
  const so = useMemo(() => setOff(data.output, data.itc), [data]);
  const out = useMemo(() => ledgerTax(period, 'output'), [period, journals]);
  const inp = useMemo(() => ledgerTax(period, 'input'), [period, journals]);
  const outputTax = data.output.cgst + data.output.sgst + data.output.igst + data.output.cess;
  const itcTax = data.itc.cgst + data.itc.sgst + data.itc.igst + data.itc.cess;
  const diff = Math.round((outputTax - out.tax) * 100) / 100;
  const gstin = reg ? s.company?.registrations.find((r) => r.id === reg)?.number : s.branch?.gstin;
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  const due = `${new Date(y, m, 1).getFullYear()}-${String(new Date(y, m, 1).getMonth() + 1).padStart(2, '0')}-${String(taxSettings().gstr3bDueDay).padStart(2, '0')}`;
  const draftChallan = history.find((h) => h.paymentJournalId);
  const createChallan = () => {
    try {
      const lines = [
        ...(so.payable.cgst ? [{ accountId: IDS.accGSTOutputCGST, dr: so.payable.cgst, narration: 'CGST paid via challan' }] : []),
        ...(so.payable.sgst ? [{ accountId: IDS.accGSTOutputSGST, dr: so.payable.sgst, narration: 'SGST paid via challan' }] : []),
        ...(so.payable.igst ? [{ accountId: IDS.accGSTOutputIGST, dr: so.payable.igst, narration: 'IGST paid via challan' }] : []),
        // ITC utilised: Cr input accounts, Dr output accounts
        ...(data.itc.cgst - so.carried.cgst ? [{ accountId: IDS.accGSTOutputCGST, dr: Math.round((data.itc.cgst - so.carried.cgst) * 100) / 100, narration: 'CGST set-off with ITC' }, { accountId: IDS.accGSTInputCGST, cr: Math.round((data.itc.cgst - so.carried.cgst) * 100) / 100, narration: 'ITC utilised' }] : []),
        ...(data.itc.sgst - so.carried.sgst ? [{ accountId: IDS.accGSTOutputSGST, dr: Math.round((data.itc.sgst - so.carried.sgst) * 100) / 100, narration: 'SGST set-off with ITC' }, { accountId: IDS.accGSTInputSGST, cr: Math.round((data.itc.sgst - so.carried.sgst) * 100) / 100, narration: 'ITC utilised' }] : []),
        ...(data.itc.igst - so.carried.igst ? [{ accountId: IDS.accGSTOutputIGST, dr: Math.round((data.itc.igst - so.carried.igst) * 100) / 100, narration: 'IGST set-off with ITC' }, { accountId: IDS.accGSTInputIGST, cr: Math.round((data.itc.igst - so.carried.igst) * 100) / 100, narration: 'ITC utilised' }] : []),
        ...(so.payable.total ? [{ accountId: s.company?.defaults.bankAccountId ?? IDS.accHDFC, cr: so.payable.total, narration: `GST challan ${fmtPeriod(period)} · PMT-06` }] : []),
      ];
      if (!lines.length) { toast.info('Nothing to pay or set off for this period'); return; }
      const j = engine.postJournal({ date: today(), status: 'Draft', type: 'Manual', sourceType: 'GST Payment', sourceNumber: `GSTR-3B ${period}`, narration: `GST liability ${fmtPeriod(period)} — ITC set-off and challan payment (draft, post from Accounting › Journals)`, lines, idempotencyKey: `gst-challan:${period}:${Date.now()}` });
      const version = history[0];
      if (version) db.update<StatutoryReturn>(C.gstReturns, version.id, { paymentJournalId: j.id, paymentJournalNumber: j.number });
      toast.success(`Draft challan journal ${j.number} created for ${fmtMoney(so.payable.total, s.currency)}`, { label: 'Open journal', path: `accounting/journals/${j.id}` });
      setChallan(false);
    } catch (e: any) { toast.error(e.message); }
  };
  const file = () => {
    const version = (history[0]?.version ?? 0) + 1;
    const r = db.transaction(() => {
      history.filter((h) => h.status !== 'Filed').forEach((h) => db.update<StatutoryReturn>(C.gstReturns, h.id, { status: 'Superseded' }));
      const rec = db.insert<StatutoryReturn>(C.gstReturns, { type: 'GSTR-3B', period, fy: fiscalYearOf(`${period}-01`, s.company?.fiscalYearStartMonth), registrationId: reg || s.branch?.registrationId, gstin, version, status: 'Filed', sections: data.sections, totals: { taxable: data.outputTaxable, ...data.output, tax: outputTax, itc: itcTax, netPayable: so.payable.total }, reconciliation: { registerTax: outputTax, ledgerTax: out.tax, difference: diff }, generatedAt: new Date().toISOString(), generatedBy: s.user?.name ?? 'system', filedAt: new Date().toISOString(), filedBy: s.user?.name, arn: `AB${gstin?.slice(0, 2) ?? '27'}${period.slice(5, 7)}${period.slice(2, 4)}${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}P`, dueDate: due, paymentJournalId: draftChallan?.paymentJournalId, paymentJournalNumber: draftChallan?.paymentJournalNumber, json: JSON.stringify({ gstin, period, sections: data.sections, setOff: so }, null, 2) });
      engine.audit({ action: 'gstr3b.filed', objectType: 'GSTR-3B', objectId: rec.id, objectNumber: `${period} v${version}`, detail: `Net payable ${so.payable.total} · ARN ${rec.arn}` });
      engine.notify({ type: 'system', title: `GSTR-3B ${fmtPeriod(period)} filed`, body: `ARN ${rec.arn} · net payable ${fmtMoney(so.payable.total, s.currency)}`, link: 'taxation/filings' });
      return rec;
    });
    toast.success(`GSTR-3B ${fmtPeriod(period)} marked filed · ARN ${r.arn}`);
  };
  const cell = (n: number, tone?: string) => <td className="right money" style={{ color: tone }}>{n ? fmtMoney(n, s.currency) : '—'}</td>;
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">GSTR-3B {filed ? '' : 'draft'}</h1><div className="page-subtitle">{fmtPeriod(period)} · GSTIN {gstin ?? '—'} · Due {fmtDate(due)} · Net payable {fmtMoney(so.payable.total, s.currency)}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => downloadText(`GSTR3B-${period}.json`, JSON.stringify({ gstin, period, sections: data.sections, setOff: so }, null, 2), 'application/json')}>Export JSON</Button>
          <Button variant="secondary" onClick={() => setChallan(true)} disabled={so.payable.total <= 0 && itcTax === 0}>Create payment challan</Button>
          <Button variant="primary" onClick={() => setConfirm(true)} disabled={!!filed} reason={filed ? `Filed · ARN ${filed.arn}` : undefined}>Mark as filed</Button>
        </div>
      </div>
      <div className="card toolbar" style={{ padding: '10px 14px', gap: 12, alignItems: 'flex-end' }}><PeriodPicker value={period} onChange={st.setPeriod} /><RegistrationPicker value={reg} onChange={st.setReg} /></div>
      {filed && <Banner tone="info">Filed on {fmtDate(filed.filedAt)} by {filed.filedBy} · ARN <span className="identifier">{filed.arn}</span>{filed.paymentJournalNumber ? ` · payment ${filed.paymentJournalNumber}` : ''} — period locked.</Banner>}
      {!filed && (diff === 0 ? <Banner tone="success">Output tax per registers reconciles to the output tax ledger for {fmtPeriod(period)}.</Banner> : <Banner tone="warning">Output tax per registers {fmtMoney(outputTax, s.currency)} vs ledger {fmtMoney(out.tax, s.currency)} — difference {fmtMoney(diff, s.currency)}. ITC ledger movement {fmtMoney(inp.tax, s.currency)} vs registers {fmtMoney(itcTax, s.currency)}.</Banner>)}
      <SectionTable sections={data.sections} currency={s.currency} onDrill={(code) => nav.go(code.startsWith('4') || code === '5' ? 'taxation/itc' : 'taxation/b2b')} />
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--hairline)' }}>6.1 ITC set-off calculator</div>
          <table className="data-table dense"><thead><tr><th>Head</th><th className="right">Output liability</th><th className="right">ITC available</th><th className="right">Paid via ITC</th><th className="right">Cash payable</th><th className="right">ITC carried</th></tr></thead><tbody>
            {(['igst', 'cgst', 'sgst', 'cess'] as const).map((k) => <tr key={k}><td style={{ fontWeight: 600 }}>{k.toUpperCase()}</td>{cell(data.output[k])}{cell(data.itc[k])}{cell(data.output[k] - so.payable[k], 'var(--good)')}{cell(so.payable[k], so.payable[k] ? 'var(--danger)' : undefined)}{cell(so.carried[k])}</tr>)}
            <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}><td>Total</td>{cell(outputTax)}{cell(itcTax)}{cell(outputTax - so.payable.total, 'var(--good)')}{cell(so.payable.total, so.payable.total ? 'var(--danger)' : 'var(--good)')}{cell(so.carried.cgst + so.carried.sgst + so.carried.igst + so.carried.cess)}</tr>
          </tbody></table>
          <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--ink-4)' }}>{so.steps.length ? so.steps.map((x) => `${x.label}: ${fmtMoney(x.amount, s.currency)}`).join(' · ') : 'No ITC utilised'} · order: IGST → CGST → SGST; CGST/SGST credit cannot cross-utilise.</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SummaryBlock items={[{ label: 'Output tax', value: fmtMoney(outputTax, s.currency) }, { label: 'ITC utilised', value: fmtMoney(outputTax - so.payable.total, s.currency), tone: 'good' }, { label: 'Net payable (cash)', value: fmtMoney(so.payable.total, s.currency), tone: so.payable.total ? 'danger' : 'good' }, { label: 'Ledger closing (2300–2302)', value: fmtMoney(out.closing, s.currency) }]} />
          {draftChallan?.paymentJournalNumber && <Banner tone="info" action={<Button variant="link" onClick={() => nav.go(`accounting/journals/${draftChallan.paymentJournalId}`)}>Open journal</Button>}>Draft challan journal {draftChallan.paymentJournalNumber} linked to this return.</Banner>}
          <History rows={history} currency={s.currency} />
        </div>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Mark GSTR-3B for ${fmtPeriod(period)} as filed`} statement="Records the filing with a simulated ARN and freezes tax data for the period." confirmLabel="Mark as filed" cancelLabel="Not yet"
        consequences={[{ engine: 'Statutory', text: `Version ${(history[0]?.version ?? 0) + 1} stored with tables 3.1/3.2/4/5/6.1 and set-off`, tone: 'success' }, { engine: 'Tax', text: `Net payable ${fmtMoney(so.payable.total, s.currency)} — create the payment challan if not yet done`, tone: so.payable.total && !draftChallan ? 'warning' : 'info' }, { engine: 'Tax', text: `${fmtPeriod(period)} locked for tax changes`, tone: 'warning' }]}
        onConfirm={file} />
      <Modal open={challan} onClose={() => setChallan(false)} title="Create payment challan (draft journal)" description="Creates a draft journal utilising ITC against output liability and paying the cash balance from the default bank account. Post it from Accounting › Journals after the PMT-06 challan is paid." footer={<><Button variant="secondary" onClick={() => setChallan(false)}>Cancel</Button><Button variant="primary" onClick={createChallan}>Create draft journal</Button></>}>
        <KV items={[{ k: 'Period', v: fmtPeriod(period) }, { k: 'ITC utilised', v: fmtMoney(outputTax - so.payable.total, s.currency) }, { k: 'Cash payable', v: fmtMoney(so.payable.total, s.currency) }, { k: 'Bank account', v: db.find<any>(C.accounts, s.company?.defaults.bankAccountId)?.name ?? 'HDFC Current Account' }, { k: 'Journal status', v: 'Draft — requires posting' }]} />
      </Modal>
    </div>
  );
}
