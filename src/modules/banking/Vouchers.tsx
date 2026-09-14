// Bank vouchers (FR-BNK-002): register, form (deposit / withdrawal / contra / receipt / payment / transfer), detail with print + reverse.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useRecord, useSession } from '../../store';
import type { Account } from '../../store';
import { RegisterPage, DocumentPage, Button, Badge, TwoLine, DateField, TextField, TextArea, SelectField, MoneyField, EntityPicker, useAccountOptions, useCustomerOptions, useSupplierOptions, useDimensionOptions, RadioCards, AccountingTab, ActivityTab, AttachmentsPanel, RailSection, KV, useToast, Banner, EmptyState, PeriodBanner, ActionMenu, PrintSheet } from '../../components/ui';
import { fmtDate, fmtMoney, fmtDateTime } from '../../lib/format';
import type { BankVoucher, VoucherType } from './types';
import * as A from './actions';
import { useConfirm } from '../purchase/shared';

const TYPES: { value: VoucherType; label: string; description: string }[] = [
  { value: 'Deposit', label: 'Deposit', description: 'Cash / other money into bank' }, { value: 'Withdrawal', label: 'Withdrawal', description: 'Bank → cash or expense' }, { value: 'Contra', label: 'Contra', description: 'Bank ↔ cash' },
  { value: 'Receipt', label: 'Other receipt', description: 'Income / customer advance' }, { value: 'Payment', label: 'Payment', description: 'Expense or supplier on account' }, { value: 'Transfer', label: 'Transfer', description: 'Bank → bank' },
];

export function Vouchers({ id, params }: { id?: string; params: Record<string, string> }) {
  if (id === 'new') return <VoucherForm prefill={params} />;
  if (id) return <VoucherDetail id={id} />;
  return <VoucherRegister />;
}

function VoucherRegister() {
  const rows = useCollection<BankVoucher>(C.bankVouchers);
  const s = useSession();
  const mine = rows.filter((r) => r.companyId === s.state.companyId).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  return (
    <RegisterPage<BankVoucher> title="Bank & cash vouchers" subtitle={`${mine.length} vouchers · ${s.company?.tradeName} · FY ${s.state.fy}`} entity="vouchers" rows={mine} searchKeys={['number', 'narration', 'instrumentRef', 'counterAccountName']}
      columns={[
        { key: 'number', label: 'Voucher', sortable: true, render: (r) => <TwoLine primary={<span className="identifier link">{r.number}</span>} secondary={r.instrumentRef} mono /> },
        { key: 'date', label: 'Date', sortable: true, render: (r) => fmtDate(r.date) },
        { key: 'voucherType', label: 'Type', sortable: true, render: (r) => <Badge status="Draft">{r.voucherType}</Badge> },
        { key: 'bankAccountName', label: 'Bank / cash', render: (r) => <span style={{ fontSize: 12 }}>{r.bankAccountName}</span> },
        { key: 'counterAccountName', label: 'Counter account', render: (r) => <TwoLine primary={r.counterAccountName} secondary={r.partyName} /> },
        { key: 'narration', label: 'Narration', render: (r) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{r.narration}</span> },
        { key: 'in', label: 'Money in', align: 'right', render: (r) => A.voucherDirection(r) === 'in' ? <span className="money" style={{ color: 'var(--good)' }}>{fmtMoney(r.amount, r.currency)}</span> : '—' },
        { key: 'out', label: 'Money out', align: 'right', render: (r) => A.voucherDirection(r) === 'out' ? <span className="money" style={{ color: 'var(--danger)' }}>{fmtMoney(r.amount, r.currency)}</span> : '—', total: (rs) => fmtMoney(rs.reduce((x, r) => x + (A.voucherDirection(r) === 'out' ? r.amount : -r.amount), 0)) },
        { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
      ]}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (r) => r.status === 'Draft' }, { id: 'posted', label: 'Posted', filter: (r) => r.status === 'Posted' }, ...TYPES.map((t) => ({ id: t.value, label: t.label, filter: (r: BankVoucher) => r.voucherType === t.value })), { id: 'reversed', label: 'Reversed', filter: (r) => r.status === 'Reversed' }]}
      primaryAction={{ label: 'New voucher', onClick: () => nav.go('banking/vouchers/new'), disabled: !s.can('banking.voucher.create') && !s.can('banking.*'), reason: !s.can('banking.voucher.create') && !s.can('banking.*') ? 'Requires banking.voucher.create' : undefined }} onRowClick={(r) => nav.go(`banking/vouchers/${r.id}`)} rowActions={(r) => [{ label: 'Open', onClick: () => nav.go(`banking/vouchers/${r.id}`) }]} />
  );
}

export function VoucherForm({ prefill, existing, onDone }: { prefill?: Record<string, string>; existing?: BankVoucher; onDone?: (v: BankVoucher) => void }) {
  const s = useSession();
  const toast = useToast();
  const [v, setV] = useState<BankVoucher>(() => existing ?? A.newVoucher((prefill?.type as VoucherType) ?? 'Payment', { bankAccountId: prefill?.account, amount: prefill?.amount ? Number(prefill.amount) : undefined, date: prefill?.date, narration: prefill?.narration, instrumentRef: prefill?.ref, statementLineId: prefill?.line, counterAccountId: prefill?.counter }));
  const [errs, setErrs] = useState<string[]>([]);
  const banks = A.cashBankAccounts();
  const counterOpts = useAccountOptions(A.counterAccountFilter(v.voucherType)).filter((o) => o.id !== v.bankAccountId);
  const customers = useCustomerOptions(); const suppliers = useSupplierOptions();
  const depts = useDimensionOptions('Department');
  const counter = db.find<Account>(C.accounts, v.counterAccountId);
  const needsParty = counter?.isControl && (counter.controlType === 'AR' || counter.controlType === 'AP');
  const set = (p: Partial<BankVoucher>) => setV((d) => ({ ...d, ...p }));
  const projected = useMemo(() => (v.bankAccountId && v.counterAccountId && v.amount > 0 ? A.voucherJournalLines(v) : []), [v]);
  const post = () => { const e = A.validateVoucher(v); if (e.length) { setErrs(e); return; } try { const out = A.postVoucher(v); toast.success(`${out.number} posted`); if (onDone) onDone(out); else nav.go(`banking/vouchers/${out.id}`); } catch (err: any) { setErrs([err.message]); } };
  const saveDraft = () => { try { const out = A.saveVoucherDraft(v); toast.success('Draft saved'); nav.go(`banking/vouchers/${out.id}`); } catch (err: any) { setErrs([err.message]); } };
  const dir = A.voucherDirection(v);
  return (
    <div className="page">
      <div className="page-header">
        <div>{!onDone && <button type="button" className="btn-link" style={{ color: 'var(--ink-3)' }} onClick={() => nav.back('banking/vouchers')}>← Vouchers</button>}<h1 className="page-title">{existing ? `Edit ${existing.number}` : 'New bank / cash voucher'}</h1><div className="page-subtitle">{v.statementLineId ? 'Pre-filled from an unmatched statement line — posting creates the book entry to match against' : 'Posts a two-line journal: bank / cash against the chosen account'}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>{!onDone && <Button variant="ghost" onClick={() => nav.back('banking/vouchers')}>Discard</Button>}<Button onClick={saveDraft}>Save draft</Button><Button variant="primary" tone="good" onClick={post}>Post voucher</Button></div>
      </div>
      <PeriodBanner date={v.date} />
      {errs.length > 0 && <Banner tone="danger" onDismiss={() => setErrs([])}><ul style={{ margin: 0, paddingLeft: 16 }}>{errs.map((e, i) => <li key={i}>{e}</li>)}</ul></Banner>}
      <div className="card" style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
        <RadioCards label="Voucher type" value={v.voucherType} onChange={(t) => set({ voucherType: t as VoucherType, counterAccountId: '', counterAccountName: '', partyId: undefined, partyName: undefined, partyType: undefined, method: t === 'Contra' || t === 'Transfer' ? 'Internal' : v.method === 'Internal' ? 'NEFT' : v.method })} columns={6} options={TYPES} style={{ gridColumn: 'span 4' }} />
        <DateField label="Date" required value={v.date} onChange={(x) => set({ date: x })} checkPeriod />
        <SelectField label={dir === 'in' ? 'Into bank / cash' : 'From bank / cash'} required value={v.bankAccountId} onChange={(x) => set({ bankAccountId: x, bankAccountName: db.find<Account>(C.accounts, x)?.name ?? '' })} options={banks.map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }))} />
        <EntityPicker label={v.voucherType === 'Contra' || v.voucherType === 'Transfer' ? 'To account' : dir === 'in' ? 'Credit account (source of money)' : 'Debit account (what was paid)'} required value={v.counterAccountId} onChange={(x, o) => set({ counterAccountId: x ?? '', counterAccountName: o?.primary ?? '' })} options={counterOpts} style={{ gridColumn: 'span 2' }} />
        {needsParty && <EntityPicker label={counter?.controlType === 'AR' ? 'Customer' : 'Supplier'} required value={v.partyId} onChange={(x, o) => set({ partyId: x, partyName: o?.primary, partyType: counter?.controlType === 'AR' ? 'Customer' : 'Supplier' })} options={counter?.controlType === 'AR' ? customers : suppliers} />}
        <MoneyField label="Amount" required value={v.amount} onChange={(x) => set({ amount: x })} currency={v.currency} />
        <SelectField label="Method" value={v.method} onChange={(x) => set({ method: x as BankVoucher['method'] })} options={['NEFT', 'RTGS', 'IMPS', 'Cheque', 'UPI', 'Cash', 'Internal']} />
        <TextField label={v.method === 'Cheque' ? 'Cheque number' : 'Reference / UTR'} value={v.instrumentRef} onChange={(x) => set({ instrumentRef: x })} />
        <EntityPicker label="Department" value={v.dimensions?.Department} onChange={(x) => set({ dimensions: { ...v.dimensions, Department: x ?? '' } })} options={depts} />
        <TextArea label="Narration" required value={v.narration} onChange={(x) => set({ narration: x })} style={{ gridColumn: 'span 4' }} rows={2} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div className="card" style={{ padding: 16 }}><AccountingTab projected={projected} currency={s.currency} title="Projected journal" /></div>
        <div className="card" style={{ padding: 16 }}><div className="section-title">Attachments</div><AttachmentsPanel objectType="Bank Voucher" objectId={v.id} /></div>
      </div>
    </div>
  );
}

function VoucherDetail({ id }: { id: string }) {
  const v = useRecord<BankVoucher>(C.bankVouchers, id);
  const s = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState('summary');
  if (!v) return <EmptyState title="Voucher not found" action={<Button onClick={() => nav.go('banking/vouchers')}>Back</Button>} />;
  if (v.status === 'Draft') return <VoucherForm existing={v} />;
  const printDoc = { ...v, lines: [{ id: 'l1', itemName: `${v.voucherType} · ${v.counterAccountName}`, description: v.narration, qty: 1, uom: '', rate: v.amount, discountPct: 0, discountAmt: 0, taxable: v.amount, taxRate: 0, taxAmt: 0, taxComponents: {}, amount: v.amount }], totals: { ...v.totals, subtotal: v.amount, taxable: v.amount, total: v.amount, breakup: [] }, partyName: v.partyName ?? v.counterAccountName };
  return (
    <>
      <DocumentPage backLabel="Vouchers" onBack={() => nav.go('banking/vouchers')} number={v.number} activeTab={tab} onTab={setTab} badges={<><Badge status={v.status} /><Badge status="Draft">{v.voucherType}</Badge></>} amount={{ label: A.voucherDirection(v) === 'in' ? 'Money in' : 'Money out', value: v.amount, currency: v.currency }}
        rail={<><RailSection label="Voucher"><KV items={[{ k: 'Date', v: fmtDate(v.date) }, { k: 'Bank / cash', v: v.bankAccountName }, { k: 'Account', v: v.counterAccountName }, ...(v.partyName ? [{ k: 'Party', v: v.partyName }] : []), { k: 'Method', v: `${v.method ?? '—'}${v.instrumentRef ? ' · ' + v.instrumentRef : ''}` }, { k: 'Narration', v: v.narration }, { k: 'Posted', v: v.postedAt ? `${fmtDateTime(v.postedAt)} · ${v.postedBy}` : '—' }, ...(v.reversalReason ? [{ k: 'Reversed', v: v.reversalReason }] : [])]} /></RailSection><RailSection label="Attachments"><AttachmentsPanel objectType="Bank Voucher" objectId={v.id} readOnly /></RailSection></>}
        tabs={[
          { id: 'summary', label: 'Accounting', content: <AccountingTab journalId={v.journalId} currency={s.currency} /> },
          { id: 'activity', label: 'Activity', content: <ActivityTab objectId={v.id} correlationId={v.correlationId} /> },
          { id: 'print', label: 'Print', content: <div><div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}><Button variant="primary" onClick={() => window.print()}>Print voucher</Button></div><PrintSheet doc={printDoc as any} title={`${v.voucherType} voucher`} partyLabel={A.voucherDirection(v) === 'in' ? 'Received from' : 'Paid to'} extraHeader={<div>{v.bankAccountName}</div>} /></div> },
        ]}
        footer={<><div style={{ flex: 1 }} />{v.status === 'Posted' && <ActionMenu trigger={<Button>More ▾</Button>} actions={[{ label: 'Print', onClick: () => setTab('print') }, { label: 'Reverse voucher', danger: true, onClick: () => confirm.open({ title: `Reverse ${v.number}?`, consequences: [{ engine: 'Journal', text: `Reversal of ${v.journalNumber}`, tone: 'warning' }], reasonRequired: true, confirmLabel: 'Reverse voucher', cancelLabel: 'Keep', danger: true, onConfirm: (r) => { A.reverseVoucher(id, r); toast.success('Reversed'); } }) }]} />}</>} />
      {confirm.dialog}
    </>
  );
}
