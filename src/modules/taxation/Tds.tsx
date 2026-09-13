// TDS / TCS (FR-TDS-001): live register with threshold check, quarterly summary, Form 26Q/27EQ export, challan
// deposit (draft journal), certificate issue (TDS-Qn-nnn + printable Form 16A stub), TDS on salary (24Q) from payslips.
import { useMemo, useState } from 'react';
import { C, db, engine, nav, useSession, useCollection, IDS } from '../../store';
import type { TdsSection } from '../../store';
import { RegisterPage, Badge, Banner, Button, Drawer, Modal, KV, Pill, SummaryBlock, useToast, DateField, MoneyField, TextField, SelectField, Tabs, DataTable, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtPeriod, downloadText, toCSV, today } from '../../lib/format';
import { tdsRegister, quarterDue, tdsAccountBalance } from './derive';
import type { TdsRegisterRow, TdsEntry, StatutoryReturn } from './types';
import type { Payslip } from '../payroll/types';

export function TdsPage() {
  const s = useSession();
  const toast = useToast();
  const pay = useCollection<any>(C.payments); const vinv = useCollection<any>(C.vendorInvoices); const rc = useCollection<any>(C.receipts); const entries = useCollection<TdsEntry>(C.tdsEntries); const payslips = useCollection<Payslip>(C.payslips); const returns = useCollection<StatutoryReturn>(C.gstReturns);
  const fy = s.state.fy ?? '2026-27';
  const [quarter, setQuarter] = useState('');
  const [tab, setTab] = useState<'register' | 'summary' | 'salary' | 'challans'>('register');
  const [challan, setChallan] = useState(false);
  const [cert, setCert] = useState<TdsRegisterRow | null>(null);
  const [form16, setForm16] = useState<TdsRegisterRow | null>(null);
  const [cf, setCf] = useState({ date: today(), amount: 0, challanNo: '', bsr: '0510001', quarter: 'Q2', section: '194C/194J' });
  const rows = useMemo(() => tdsRegister({ fy, quarter: quarter || undefined }), [fy, quarter, pay, vinv, rc, entries]);
  const challans = entries.filter((e) => e.kind === 'Challan' && e.fy === fy);
  const summary = useMemo(() => {
    const m = new Map<string, { quarter: string; section: string; kind: string; count: number; base: number; amount: number; deposited: number; certified: number }>();
    tdsRegister({ fy }).forEach((r) => { const k = `${r.quarter}|${r.section}`; const c = m.get(k) ?? { quarter: r.quarter, section: r.section, kind: r.kindOfTax, count: 0, base: 0, amount: 0, deposited: 0, certified: 0 }; c.count++; c.base += r.base; c.amount += r.amount; if (r.status === 'Deposited' || r.status === 'Certified') c.deposited += r.amount; if (r.certificateNo) c.certified++; m.set(k, c); });
    return Array.from(m.values()).sort((a, b) => a.quarter.localeCompare(b.quarter) || a.section.localeCompare(b.section));
  }, [fy, pay, vinv, rc, entries]);
  const salary = useMemo(() => { const m = new Map<string, { quarter: string; employees: Set<string>; gross: number; tds: number }>(); payslips.filter((p) => p.status !== 'Void').forEach((p) => { const mm = parseInt(p.period.slice(5, 7), 10); const q = mm >= 4 && mm <= 6 ? 'Q1' : mm >= 7 && mm <= 9 ? 'Q2' : mm >= 10 ? 'Q3' : 'Q4'; const c = m.get(q) ?? { quarter: q, employees: new Set(), gross: 0, tds: 0 }; c.employees.add(p.employeeId); c.gross += p.line.gross; c.tds += p.line.tds; m.set(q, c); }); return Array.from(m.values()).sort((a, b) => a.quarter.localeCompare(b.quarter)); }, [payslips]);
  const canAct = s.can('taxation.*') || s.can('taxation.tds.manage');
  const export26Q = (q: string, kind: 'TDS' | 'TCS') => {
    const data = tdsRegister({ fy, quarter: q, kind }).filter((r) => r.amount > 0);
    if (!data.length) { toast.info(`No ${kind} deductions in ${q}`); return; }
    downloadText(`Form-${kind === 'TDS' ? '26Q' : '27EQ'}-${fy}-${q}.csv`, toCSV(data.map((r) => ({ deductee: r.partyName, pan: r.pan ?? 'PANNOTAVBL', section: r.section, date: r.date, base: r.base, rate: r.rate, tds: r.amount, challan: r.challanNo ?? '', certificate: r.certificateNo ?? '' }))));
    const arn = `${kind === 'TDS' ? '26Q' : '27EQ'}-${fy}${q}-${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
    db.insert<StatutoryReturn>(C.gstReturns, { type: kind === 'TDS' ? '26Q' : '27EQ', period: `${fy} ${q}`, fy, version: (returns.filter((r) => r.type === (kind === 'TDS' ? '26Q' : '27EQ') && r.period === `${fy} ${q}`).length) + 1, status: 'Generated', sections: [], totals: { taxable: data.reduce((x, r) => x + r.base, 0), cgst: 0, sgst: 0, igst: 0, cess: 0, tax: data.reduce((x, r) => x + r.amount, 0), tds: data.reduce((x, r) => x + r.amount, 0) }, generatedAt: new Date().toISOString(), generatedBy: s.user?.name ?? 'system', dueDate: quarterDue(fy, q), arn: undefined, notes: `Generated ${arn}` });
    engine.audit({ action: 'tds.return.generated', objectType: kind === 'TDS' ? 'Form 26Q' : 'Form 27EQ', objectNumber: `${fy} ${q}`, detail: `${data.length} deductees` });
    toast.success(`Form ${kind === 'TDS' ? '26Q' : '27EQ'} ${q} exported and recorded in filing history`);
  };
  const markFiled = (q: string) => {
    const gen = returns.filter((r) => r.type === '26Q' && r.period === `${fy} ${q}`).sort((a, b) => b.version - a.version)[0];
    if (!gen) { toast.error('Export Form 26Q first'); return; }
    db.update<StatutoryReturn>(C.gstReturns, gen.id, { status: 'Filed', filedAt: new Date().toISOString(), filedBy: s.user?.name, arn: `TDS26Q-${fy.replace('-', '')}${q}-${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}` });
    engine.audit({ action: 'tds.return.filed', objectType: 'Form 26Q', objectId: gen.id, objectNumber: `${fy} ${q}` });
    toast.success(`Form 26Q ${q} marked filed`);
  };
  const depositChallan = () => {
    try {
      if (cf.amount <= 0) throw new Error('Enter the challan amount');
      const j = engine.postJournal({ date: cf.date, status: 'Draft', type: 'Manual', sourceType: 'TDS Challan', sourceNumber: cf.challanNo || 'CIN pending', narration: `TDS deposit ${cf.section} · ${cf.quarter} ${fy} · challan ${cf.challanNo || 'pending'} (draft — post after bank confirmation)`, lines: [{ accountId: IDS.accTDSPayable, dr: cf.amount, narration: 'TDS deposited' }, { accountId: s.company?.defaults.bankAccountId ?? IDS.accHDFC, cr: cf.amount, narration: `Challan ${cf.challanNo}` }], idempotencyKey: `tds-challan:${cf.challanNo || Date.now()}` });
      const e = db.insert<TdsEntry>(C.tdsEntries, { kind: 'Challan', sourceType: 'Challan', sourceId: j.id, sourceNumber: cf.challanNo || j.number, date: cf.date, partyType: 'Supplier', partyName: 'Income Tax Department (CBDT)', section: cf.section, kindOfTax: 'TDS', rate: 0, base: 0, amount: cf.amount, quarter: cf.quarter, fy, challanNo: cf.challanNo || undefined, challanDate: cf.date, bsrCode: cf.bsr, journalId: j.id, journalNumber: j.number, status: 'Deposited' });
      // mark un-deposited deductions in the quarter as deposited
      rows.filter((r) => r.quarter === cf.quarter && r.status === 'Deducted').forEach((r) => {
        if (r.overlayId) db.update<TdsEntry>(C.tdsEntries, r.overlayId, { status: 'Deposited', challanNo: e.challanNo ?? j.number, challanDate: cf.date });
        else db.insert<TdsEntry>(C.tdsEntries, { kind: 'Deduction', sourceType: r.sourceType, sourceId: r.sourceId, sourceNumber: r.sourceNumber, date: r.date, partyType: r.partyType, partyId: r.partyId, partyName: r.partyName, pan: r.pan, sectionId: r.sectionId, section: r.section, kindOfTax: r.kindOfTax, rate: r.rate, base: r.base, amount: r.amount, quarter: r.quarter, fy: r.fy, status: 'Deposited', challanNo: e.challanNo ?? j.number, challanDate: cf.date });
      });
      engine.audit({ action: 'tds.challan', objectType: 'TDS Challan', objectId: e.id, objectNumber: cf.challanNo, detail: `${fmtMoney(cf.amount)} · ${j.number}` });
      toast.success(`Challan recorded · draft journal ${j.number}`, { label: 'Open journal', path: `accounting/journals/${j.id}` });
      setChallan(false);
    } catch (e: any) { toast.error(e.message); }
  };
  const issueCertificate = (r: TdsRegisterRow) => {
    const seq = entries.filter((e) => e.certificateNo?.startsWith(`${r.kindOfTax}-${r.quarter}-`)).length + 1;
    const certificateNo = `${r.kindOfTax}-${r.quarter}-${String(seq).padStart(3, '0')}`;
    if (r.overlayId) db.update<TdsEntry>(C.tdsEntries, r.overlayId, { certificateNo, certificateIssuedAt: new Date().toISOString(), status: 'Certified' });
    else db.insert<TdsEntry>(C.tdsEntries, { kind: 'Deduction', sourceType: r.sourceType, sourceId: r.sourceId, sourceNumber: r.sourceNumber, date: r.date, partyType: r.partyType, partyId: r.partyId, partyName: r.partyName, pan: r.pan, sectionId: r.sectionId, section: r.section, kindOfTax: r.kindOfTax, rate: r.rate, base: r.base, amount: r.amount, quarter: r.quarter, fy: r.fy, status: 'Certified', certificateNo, certificateIssuedAt: new Date().toISOString(), challanNo: r.challanNo });
    engine.audit({ action: 'tds.certificate', objectType: 'TDS Certificate', objectNumber: certificateNo, detail: `${r.partyName} · ${r.section} · ${fmtMoney(r.amount)}` });
    engine.notify({ type: 'system', title: `Certificate ${certificateNo} issued`, body: `${r.partyName} · ${r.section} · ${fmtMoney(r.amount)}`, link: 'taxation/tds' });
    toast.success(`Certificate ${certificateNo} issued to ${r.partyName}`);
    setCert(null);
  };
  const cols: Column<TdsRegisterRow>[] = [
    { key: 'sourceNumber', label: 'Reference', render: (r) => <div><span className="identifier link">{r.sourceNumber}</span><div className="cell-secondary">{r.sourceType}</div></div>, sortable: true },
    { key: 'date', label: 'Date', render: (r) => fmtDate(r.date), sortable: true },
    { key: 'partyName', label: 'Deductee / party', render: (r) => <div><div className="cell-primary">{r.partyName}</div><div className="cell-secondary identifier" style={{ color: r.pan ? undefined : '#C0393F' }}>{r.pan ?? 'PAN missing — 20%'}</div></div>, sortable: true },
    { key: 'section', label: 'Section', render: (r) => <Badge status="Draft">{r.section}</Badge> },
    { key: 'base', label: 'Payment / base', align: 'right', render: (r) => <span className="money">{fmtMoney(r.base, s.currency)}</span> },
    { key: 'threshold', label: 'Threshold', align: 'right', render: (r) => <span className="money" style={{ fontSize: 12, color: r.base >= r.threshold ? '#5F6368' : '#12784E' }}>{r.threshold ? fmtMoney(r.threshold, s.currency) : '—'}{r.threshold && r.base < r.threshold ? ' ✓ below' : ''}</span> },
    { key: 'rate', label: 'Rate', render: (r) => (r.amount ? `${r.rate}%` : <span style={{ color: '#5F6368' }}>Nil</span>) },
    { key: 'amount', label: 'TDS / TCS', align: 'right', render: (r) => <span className="money" style={{ fontWeight: 600, color: r.amount ? '#C0393F' : '#B0B5BF' }}>{r.amount ? fmtMoney(r.amount, s.currency) : '—'}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, r) => x + r.amount, 0), s.currency)}</span> },
    { key: 'certificateNo', label: 'Certificate', render: (r) => <span className="identifier">{r.certificateNo ?? '—'}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge status={r.status === 'Exempt' ? 'Cancelled' : r.status === 'Deducted' ? 'Posted' : r.status === 'Deposited' ? 'Settled' : 'Approved'}>{r.status}</Badge> },
  ];
  const sections = useCollection<TdsSection>(C.tdsSections);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="page" style={{ paddingBottom: 0, gap: 12 }}>
        <div className="page-header">
          <div><h1 className="page-title">TDS / TCS</h1><div className="page-subtitle">FY {fy} · {rows.length} entries · payable ledger {fmtMoney(tdsAccountBalance(), s.currency)} · {sections.filter((x) => x.status === 'Active').length} sections configured</div></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={() => export26Q(quarter || 'Q2', 'TDS')}>Form 26Q ({quarter || 'Q2'})</Button>
            <Button variant="secondary" onClick={() => export26Q(quarter || 'Q2', 'TCS')}>Form 27EQ</Button>
            <Button variant="primary" onClick={() => setChallan(true)} disabled={!canAct} reason={!canAct ? 'Requires taxation permission' : undefined}>Record challan deposit</Button>
          </div>
        </div>
        <Tabs variant="filter" value={tab} onChange={setTab} tabs={[{ id: 'register', label: 'Register', count: rows.length }, { id: 'summary', label: 'Quarterly summary' }, { id: 'challans', label: 'Challans', count: challans.length }, { id: 'salary', label: 'TDS on salary (24Q)' }]} />
      </div>
      {tab === 'register' && (
        <RegisterPage<TdsRegisterRow> title="" rows={rows} columns={cols} entity="TDS entries" searchKeys={['sourceNumber', 'partyName', 'pan', 'section']}
          headerExtra={<div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}><div><label className="field-label">Quarter</label><select className="field-input sm" value={quarter} onChange={(e) => setQuarter(e.target.value)}><option value="">All quarters</option>{['Q1', 'Q2', 'Q3', 'Q4'].map((q) => <option key={q}>{q}</option>)}</select></div>{rows.some((r) => !r.pan && r.amount) && <Banner tone="warning" style={{ flex: 1 }}>Deductees without PAN attract 20% under section 206AA.</Banner>}</div>}
          tabs={[{ id: 'all', label: 'All' }, { id: 'tds', label: 'TDS', filter: (r) => r.kindOfTax === 'TDS' && r.partyType !== 'Customer' }, { id: 'tcs', label: 'TCS / receivable', filter: (r) => r.kindOfTax === 'TCS' || r.partyType === 'Customer' }, { id: 'undeposited', label: 'To deposit', filter: (r) => r.status === 'Deducted' }, { id: 'cert', label: 'Certificate pending', filter: (r) => r.amount > 0 && !r.certificateNo }]}
          onRowClick={(r) => (r.link ? nav.go(r.link) : setForm16(r))} showTotals
          rowActions={(r) => [
            { label: 'Issue certificate', onClick: () => setCert(r), disabled: !r.amount || !!r.certificateNo || !canAct, reason: r.certificateNo ? `Issued ${r.certificateNo}` : !r.amount ? 'No deduction' : undefined },
            { label: 'Print Form 16A', onClick: () => setForm16(r), disabled: !r.certificateNo, reason: 'Issue a certificate first' },
            ...(r.link ? [{ label: 'Open source document', onClick: () => nav.go(r.link!) }] : []),
          ]}
          emptyTitle="No TDS/TCS entries" emptyDescription="Deductions derive live from posted payments, vendor invoices and receipts." />
      )}
      {tab === 'summary' && (
        <div className="page" style={{ paddingTop: 12 }}>
          <div className="grid-4">{['Q1', 'Q2', 'Q3', 'Q4'].map((q) => { const t = summary.filter((x) => x.quarter === q); const amt = t.reduce((x, y) => x + y.amount, 0); const filed = returns.find((r) => r.type === '26Q' && r.period === `${fy} ${q}` && r.status === 'Filed'); return <div key={q} className="kpi-tile"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="section-label">{q} · due {fmtDate(quarterDue(fy, q))}</span><Badge status={filed ? 'Filed' : amt ? 'Submitted' : 'Draft'}>{filed ? 'Filed' : amt ? 'Pending' : 'No data'}</Badge></div><div style={{ fontSize: 22, fontWeight: 600, fontFeatureSettings: '"tnum" 1' }}>{fmtMoney(amt, s.currency)}</div><div style={{ fontSize: 12, color: '#5F6368' }}>{t.reduce((x, y) => x + y.count, 0)} deductions · deposited {fmtMoney(t.reduce((x, y) => x + y.deposited, 0), s.currency)}</div><div style={{ display: 'flex', gap: 6, marginTop: 8 }}><Button size="sm" variant="secondary" onClick={() => export26Q(q, 'TDS')}>Export 26Q</Button>{!filed && amt > 0 && <Button size="sm" variant="primary" onClick={() => markFiled(q)}>Mark filed</Button>}</div></div>; })}</div>
          <DataTable rows={summary.map((x) => ({ ...x, id: `${x.quarter}${x.section}` }))} columns={[{ key: 'quarter', label: 'Quarter' }, { key: 'section', label: 'Section' }, { key: 'kind', label: 'Kind' }, { key: 'count', label: 'Deductions', align: 'right' }, { key: 'base', label: 'Base', align: 'right', render: (x) => <span className="money">{fmtMoney(x.base, s.currency)}</span> }, { key: 'amount', label: 'Deducted', align: 'right', render: (x) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(x.amount, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((a, b) => a + b.amount, 0), s.currency)}</span> }, { key: 'deposited', label: 'Deposited', align: 'right', render: (x) => <span className="money" style={{ color: '#12784E' }}>{fmtMoney(x.deposited, s.currency)}</span> }, { key: 'pending', label: 'To deposit', align: 'right', render: (x) => <span className="money" style={{ color: x.amount - x.deposited ? '#C0393F' : '#B0B5BF' }}>{fmtMoney(x.amount - x.deposited, s.currency)}</span> }, { key: 'certified', label: 'Certificates', align: 'right', render: (x) => `${x.certified}/${x.count}` }]} dense showTotals emptyTitle="No deductions this year" />
        </div>
      )}
      {tab === 'challans' && (
        <div className="page" style={{ paddingTop: 12 }}>
          <DataTable rows={challans} columns={[{ key: 'challanNo', label: 'Challan (CIN)', render: (c) => <span className="identifier">{c.challanNo ?? c.sourceNumber}</span> }, { key: 'date', label: 'Deposited', render: (c) => fmtDate(c.date) }, { key: 'bsrCode', label: 'BSR' }, { key: 'section', label: 'Sections' }, { key: 'quarter', label: 'Quarter' }, { key: 'amount', label: 'Amount', align: 'right', render: (c) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(c.amount, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((a, b) => a + b.amount, 0), s.currency)}</span> }, { key: 'journalNumber', label: 'Journal', render: (c) => <span className="identifier link" onClick={() => c.journalId && nav.go(`accounting/journals/${c.journalId}`)}>{c.journalNumber ?? '—'}</span> }, { key: 'status', label: 'Status', render: (c) => <Badge status="Settled">{c.status}</Badge> }]} dense showTotals emptyTitle="No challans recorded" emptyAction={<Button variant="primary" onClick={() => setChallan(true)}>Record challan deposit</Button>} />
        </div>
      )}
      {tab === 'salary' && (
        <div className="page" style={{ paddingTop: 12 }}>
          <Banner tone="info">Section 192 — computed from finalized payslips. Form 24Q is filed quarterly; the deposit follows the payroll challan cycle (7th of the following month).</Banner>
          <DataTable rows={salary.map((x) => ({ id: x.quarter, quarter: x.quarter, employees: x.employees.size, gross: x.gross, tds: x.tds, due: quarterDue(fy, x.quarter) }))} columns={[{ key: 'quarter', label: 'Quarter' }, { key: 'employees', label: 'Employees', align: 'right' }, { key: 'gross', label: 'Gross salary', align: 'right', render: (x) => <span className="money">{fmtMoney(x.gross, s.currency)}</span> }, { key: 'tds', label: 'TDS deducted (192)', align: 'right', render: (x) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(x.tds, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((a, b) => a + b.tds, 0), s.currency)}</span> }, { key: 'due', label: '24Q due', render: (x) => fmtDate(x.due) }, { key: 'act', label: '', render: (x) => <Button size="sm" variant="secondary" onClick={() => { downloadText(`Form-24Q-${fy}-${x.quarter}.csv`, toCSV(payslips.filter((p) => p.status !== 'Void').map((p) => ({ employee: p.employeeName, pan: p.pan, period: p.period, gross: p.line.gross, tds: p.line.tds })))); toast.success(`Form 24Q ${x.quarter} exported`); }}>Export 24Q</Button> }]} dense showTotals emptyTitle="No payslips yet" emptyDescription="Finalize a payroll run to see TDS on salary." />
        </div>
      )}
      <Modal open={challan} onClose={() => setChallan(false)} title="Record TDS challan deposit" description="Creates a draft journal (Dr TDS payable · Cr bank) and marks the quarter's undeposited deductions as deposited." footer={<><Button variant="secondary" onClick={() => setChallan(false)}>Cancel</Button><Button variant="primary" onClick={depositChallan}>Record deposit</Button></>}>
        <div className="grid-2">
          <DateField label="Deposit date" value={cf.date} onChange={(v) => setCf({ ...cf, date: v })} required />
          <MoneyField label="Amount" value={cf.amount} onChange={(v) => setCf({ ...cf, amount: v })} required help={`Undeposited ${fmtMoney(rows.filter((r) => r.status === 'Deducted').reduce((x, r) => x + r.amount, 0), s.currency)}`} />
          <TextField label="Challan number (CIN)" value={cf.challanNo} onChange={(v) => setCf({ ...cf, challanNo: v })} placeholder="CIN 0510001-071026-00151" />
          <TextField label="BSR code" value={cf.bsr} onChange={(v) => setCf({ ...cf, bsr: v })} />
          <SelectField label="Quarter" value={cf.quarter} onChange={(v) => setCf({ ...cf, quarter: v })} options={['Q1', 'Q2', 'Q3', 'Q4']} />
          <TextField label="Sections covered" value={cf.section} onChange={(v) => setCf({ ...cf, section: v })} />
        </div>
      </Modal>
      <Modal open={!!cert} onClose={() => setCert(null)} title={`Issue certificate to ${cert?.partyName ?? ''}`} description="Assigns the next TDS-Qn-nnn number for this quarter and records the issue in the audit trail." footer={<><Button variant="secondary" onClick={() => setCert(null)}>Cancel</Button><Button variant="primary" onClick={() => cert && issueCertificate(cert)}>Issue certificate</Button></>}>
        {cert && <KV items={[{ k: 'Deductee', v: cert.partyName }, { k: 'PAN', v: cert.pan ?? 'Missing' }, { k: 'Section', v: cert.section }, { k: 'Amount deducted', v: fmtMoney(cert.amount, s.currency) }, { k: 'Quarter', v: `${cert.quarter} ${cert.fy}` }, { k: 'Challan', v: cert.challanNo ?? <Pill tone="warning">Not deposited yet</Pill> }]} />}
      </Modal>
      <Drawer open={!!form16} onClose={() => setForm16(null)} title={`Form 16A · ${form16?.certificateNo ?? 'draft'}`} width={720} footer={<><Button variant="ghost" onClick={() => setForm16(null)}>Close</Button><Button variant="primary" onClick={() => window.print()}>Print / PDF</Button></>}>
        {form16 && (
          <div className="print-sheet" style={{ width: 'auto' }}>
            <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 14 }}>FORM NO. 16A</div>
            <div style={{ textAlign: 'center', fontSize: 11, marginBottom: 12 }}>[See rule 31(1)(b)] · Certificate under section 203 of the Income-tax Act, 1961 for tax deducted at source</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><div style={{ fontWeight: 700, fontSize: 10 }}>DEDUCTOR</div><div>{s.company?.legalName}</div><div>{s.company?.address.line1}, {s.company?.address.city}</div><div>PAN {s.company?.pan} · TAN MUMA12345B</div></div>
              <div><div style={{ fontWeight: 700, fontSize: 10 }}>DEDUCTEE</div><div>{form16.partyName}</div><div>PAN {form16.pan ?? 'PANNOTAVBL'}</div></div>
            </div>
            <table><thead><tr><th>Certificate no.</th><th>Quarter</th><th>Section</th><th>Amount paid / credited</th><th>Date</th><th>Rate</th><th>Tax deducted</th><th>Challan (CIN)</th></tr></thead><tbody><tr><td>{form16.certificateNo ?? '—'}</td><td>{form16.quarter} {form16.fy}</td><td>{form16.section}</td><td style={{ textAlign: 'right' }}>{fmtMoney(form16.base, s.currency)}</td><td>{fmtDate(form16.date)}</td><td>{form16.rate}%</td><td style={{ textAlign: 'right' }}>{fmtMoney(form16.amount, s.currency)}</td><td>{form16.challanNo ?? 'Pending'}</td></tr></tbody></table>
            <div style={{ marginTop: 16, fontSize: 10 }}>Verification: I, {s.user?.name}, in the capacity of Finance Admin, certify that a sum of {fmtMoney(form16.amount, s.currency)} has been deducted and deposited to the credit of the Central Government. Place: Mumbai · Date: {fmtDate(today())}</div>
            <div style={{ textAlign: 'right', marginTop: 24, fontSize: 10 }}>Authorised signatory</div>
          </div>
        )}
      </Drawer>
      <div className="page" style={{ paddingTop: 0 }}><SummaryBlock items={[{ label: 'Quarter due dates', value: <span style={{ fontSize: 12 }}>Q1 {fmtDate(quarterDue(fy, 'Q1'))} · Q2 {fmtDate(quarterDue(fy, 'Q2'))} · Q3 {fmtDate(quarterDue(fy, 'Q3'))} · Q4 {fmtDate(quarterDue(fy, 'Q4'))}</span> }, { label: 'Monthly deposit', value: <span style={{ fontSize: 12 }}>7th of following month ({fmtPeriod(s.state.periodCode ?? '')} → {fmtDate(`${s.state.periodCode ?? '2026-09'}-07`)})</span> }]} /></div>
    </div>
  );
}
