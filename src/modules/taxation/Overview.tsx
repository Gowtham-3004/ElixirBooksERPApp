// Taxation overview: liability tiles from ledger balances, filing calendar with statuses, exceptions.
import { useMemo, useState } from 'react';
import { C, nav, useSession, useCollection, IDS, engine } from '../../store';
import type { Journal } from '../../store';
import { KpiTile, Badge, ScopeLine, Checklist, Card, Segmented, Button } from '../../components/ui';
import { fmtMoney, fmtPeriod, fmtDate, today } from '../../lib/format';
import { ledgerTax, eInvoiceDocs, b2bRegister, b2cRegister, purchaseRegister, tdsRegister, quarterDue, taxSettings } from './derive';
import type { StatutoryReturn } from './types';
import { useTaxDocs } from './Registers';
import { setOff, gstr3bSections } from './derive';

export function TaxOverview() {
  const s = useSession();
  const deps = useTaxDocs();
  const returns = useCollection<StatutoryReturn>(C.gstReturns);
  const journals = useCollection<Journal>(C.journals);
  const [scope, setScope] = useState<'period' | 'balance'>('period');
  const period = s.state.periodCode ?? '2026-09';
  const settings = taxSettings();
  const data = useMemo(() => {
    const out = ledgerTax(period, 'output'), inp = ledgerTax(period, 'input');
    const g3 = gstr3bSections(period);
    const so = setOff(g3.output, g3.itc);
    const einv = eInvoiceDocs({ period });
    const rejected = einv.filter((e) => e.doc.statutory?.eInvoiceStatus === 'Rejected' || e.doc.statutory?.eInvoiceStatus === 'Failed').length;
    const pending = einv.filter((e) => e.readiness.applicable && !['Accepted', 'Cancelled'].includes(e.doc.statutory?.eInvoiceStatus ?? '')).length;
    const hsnMissing = [...b2bRegister({ period }), ...b2cRegister({ period }), ...purchaseRegister({ period })].filter((r) => r.hsnMissing).length;
    const panMissing = tdsRegister({ fy: s.state.fy }).filter((r) => !r.pan && r.amount > 0).length;
    const tds = engine.accountBalance(IDS.accTDSPayable).net;
    return { out, inp, so, rejected, pending, hsnMissing, panMissing, tds, einvCount: einv.length };
  }, [period, ...deps, journals, s.state.fy]);
  const [y, m] = period.split('-').map((x) => parseInt(x, 10));
  const nextMonth = new Date(y, m, 1);
  const dueIn = (day: number) => `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const filedFor = (type: string, p: string) => returns.find((r) => r.type === type && r.period === p && r.status === 'Filed');
  const fy = s.state.fy ?? '2026-27';
  const q = m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 ? 'Q3' : 'Q4';
  const calendar = [
    { id: 'gstr1', label: `GSTR-1 · ${fmtPeriod(period)}`, due: dueIn(settings.gstr1DueDay), filed: filedFor('GSTR-1', period), link: 'taxation/gstr1' },
    { id: 'gstr3b', label: `GSTR-3B · ${fmtPeriod(period)}`, due: dueIn(settings.gstr3bDueDay), filed: filedFor('GSTR-3B', period), link: 'taxation/gstr3b' },
    { id: 'tdsdep', label: `TDS deposit · ${fmtPeriod(period)} deductions`, due: dueIn(7), filed: undefined, link: 'taxation/tds' },
    { id: 'tds26q', label: `Form 26Q · ${fy} ${q}`, due: quarterDue(fy, q), filed: returns.find((r) => r.type === '26Q' && r.period === `${fy} ${q}` && r.status === 'Filed'), link: 'taxation/tds' },
    { id: 'pf', label: `PF ECR / ESI · ${fmtPeriod(period)}`, due: dueIn(15), filed: undefined, link: 'payroll/statutory' },
  ];
  const t = today();
  const bal = scope === 'balance';
  const outputVal = (k: 'cgst' | 'sgst' | 'igst') => (bal ? data.out[`closing${k[0].toUpperCase()}${k.slice(1)}` as 'closingCgst'] : data.out[k]);
  const inputVal = (k: 'cgst' | 'sgst' | 'igst') => (bal ? data.inp[`closing${k[0].toUpperCase()}${k.slice(1)}` as 'closingCgst'] : data.inp[k]);
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Taxation overview</h1><div className="page-subtitle"><ScopeLine extra={`GSTIN ${s.branch?.gstin ?? '—'} · ${fmtPeriod(period)}`} /></div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Segmented value={scope} onChange={setScope} options={[{ value: 'period', label: 'This period' }, { value: 'balance', label: 'Ledger balance' }]} /><Button variant="primary" onClick={() => nav.go('taxation/gstr3b')}>Prepare GSTR-3B</Button></div>
      </div>
      <div className="grid-4">
        <KpiTile label="Output CGST" value={fmtMoney(outputVal('cgst'), s.currency)} sub="2300" onClick={() => nav.go('accounting/ledger?account=acc_2300')} meta={<ScopeLine extra={bal ? 'closing balance' : fmtPeriod(period)} />} />
        <KpiTile label="Output SGST" value={fmtMoney(outputVal('sgst'), s.currency)} sub="2301" onClick={() => nav.go('accounting/ledger?account=acc_2301')} meta={<ScopeLine extra={bal ? 'closing balance' : fmtPeriod(period)} />} />
        <KpiTile label="Output IGST" value={fmtMoney(outputVal('igst'), s.currency)} sub="2302" onClick={() => nav.go('accounting/ledger?account=acc_2302')} meta={<ScopeLine extra={bal ? 'closing balance' : fmtPeriod(period)} />} />
        <KpiTile label="Input tax credit (1400–1402)" value={fmtMoney(inputVal('cgst') + inputVal('sgst') + inputVal('igst'), s.currency)} sub={`CGST ${fmtMoney(inputVal('cgst'), s.currency)} · SGST ${fmtMoney(inputVal('sgst'), s.currency)} · IGST ${fmtMoney(inputVal('igst'), s.currency)}`} onClick={() => nav.go('taxation/itc')} meta={<ScopeLine extra={bal ? 'closing balance' : fmtPeriod(period)} />} />
        <KpiTile label="Net GST payable (after set-off)" value={fmtMoney(data.so.payable.total, s.currency)} delta={data.so.payable.total > 0 ? 'Cash payment required' : 'Covered by ITC'} deltaTone={data.so.payable.total > 0 ? 'bad' : 'good'} sub={`carried ITC ${fmtMoney(data.so.carried.cgst + data.so.carried.sgst + data.so.carried.igst, s.currency)}`} onClick={() => nav.go('taxation/gstr3b')} meta={<ScopeLine extra={`from registers · ${fmtPeriod(period)}`} />} />
        <KpiTile label="TDS payable" value={fmtMoney(data.tds, s.currency)} sub="ledger 2310 · deposit by 7th" onClick={() => nav.go('taxation/tds')} meta={<ScopeLine extra="closing balance" />} />
        <KpiTile label="e-Invoices this period" value={data.einvCount} delta={data.pending ? `${data.pending} pending` : 'All submitted'} deltaTone={data.pending ? 'bad' : 'good'} sub={`${data.rejected} rejected`} onClick={() => nav.go('taxation/einvoices')} meta={<ScopeLine extra={fmtPeriod(period)} />} />
        <KpiTile label="Exceptions" value={data.rejected + data.hsnMissing + data.panMissing} delta={data.rejected + data.hsnMissing + data.panMissing ? 'Needs attention' : 'Clean'} deltaTone={data.rejected + data.hsnMissing + data.panMissing ? 'bad' : 'good'} sub={`${data.rejected} rejected IRN · ${data.hsnMissing} HSN missing · ${data.panMissing} PAN missing`} meta={<ScopeLine extra={fmtPeriod(period)} />} />
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Checklist title="Filing calendar" rows={calendar.map((c) => ({ id: c.id, label: c.label, status: c.filed ? 'Done' : c.due < t ? 'Blocked' : 'Pending', detail: c.filed ? `Filed ${fmtDate(c.filed.filedAt)} · ARN ${c.filed.arn}` : `Due ${fmtDate(c.due)}${c.due < t ? ' · overdue' : ''}`, link: c.link }))} />
        <Card title="Exceptions to clear before filing">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[
              { label: 'Rejected / failed e-invoices', n: data.rejected, link: 'taxation/einvoices', tone: 'Rejected' },
              { label: 'Pending e-invoice submissions', n: data.pending, link: 'taxation/einvoices', tone: 'Submitted' },
              { label: 'Documents with HSN/SAC missing', n: data.hsnMissing, link: 'taxation/b2b', tone: 'Returned' },
              { label: 'TDS deductees without PAN (20% rate applies)', n: data.panMissing, link: 'taxation/tds', tone: 'Returned' },
            ].map((e) => (
              <div key={e.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F5F5F5', cursor: 'pointer' }} onClick={() => nav.go(e.link)}>
                <span>{e.label}</span>
                <Badge status={e.n ? e.tone : 'Posted'}>{e.n ? `${e.n} open` : 'Clear'}</Badge>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 10 }}>Provider: {settings.provider} · e-invoice threshold {fmtMoney(settings.eInvoiceThreshold, s.currency)} · e-way bill threshold {fmtMoney(settings.eWayBillThreshold, s.currency)} · <span className="link" onClick={() => nav.go('taxation/settings')}>settings</span></div>
        </Card>
      </div>
    </div>
  );
}
