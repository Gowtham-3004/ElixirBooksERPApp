// Expense claims (FR-EXP-001/002): register, form (lines with category → account, tax, dimensions, receipts,
// payment method), submit → workflow, approve → post journal + employee open item, reimburse; detail page with tabs.
import { useMemo, useState } from 'react';
import { C, db, engine, nav, useSession, useCollection, useRecord, IDS } from '../../store';
import type { Employee } from '../../store';
import { RegisterPage, Badge, Banner, Button, ConfirmDialog, DocumentPage, RailSection, KV, PartyRail, ApprovalsTab, AccountingTab, ActivityTab, AttachmentsPanel, TextField, TextArea, DateField, MoneyField, EntityPicker, useEmployeeOptions, useDimensionOptions, useAccountOptions, CheckboxField, Segmented, useToast, EmptyState, SummaryBlock, Modal, Pill, type Column } from '../../components/ui';
import { fmtMoney, fmtDate, fmtDateTime, today, uid, correlationId } from '../../lib/format';
import type { ExpenseClaim, ExpenseCategory, ExpenseLine } from './types';
import { newClaimLine, recomputeLine, totalsOf, currentEmployee, saveClaim, submitClaim, approveClaim, rejectClaim, postClaim, reimburseClaim, validateClaim, returnToDraft, expenseSettings } from './expenseActions';
import { checkBudget } from './control';

export function ExpensesRegister() {
  const s = useSession();
  const claims = useCollection<ExpenseClaim>(C.expenseClaims).filter((c) => !c.companyId || c.companyId === s.state.companyId).slice().sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  const me = currentEmployee();
  const canSeeAll = s.can('budgets.*') || s.can('budgets.expenses.*') || s.can('budgets.expenses.view') || s.can('payroll.*') || s.isTenantOwner;
  const visible = canSeeAll ? claims : claims.filter((c) => c.employeeId === me?.id);
  const pendingReimb = visible.filter((c) => c.status === 'Approved' && c.paymentMethod === 'Personal' && !c.reimbursedAt);
  const cols: Column<ExpenseClaim>[] = [
    { key: 'number', label: 'Claim #', render: (c) => <span className="identifier link">{c.number}</span>, sortable: true },
    { key: 'date', label: 'Date', render: (c) => fmtDate(c.date), sortable: true },
    { key: 'employeeName', label: 'Employee', render: (c) => <div><div className="cell-primary">{c.employeeName}</div><div className="cell-secondary">{c.department}</div></div>, sortable: true },
    { key: 'category', label: 'Category', render: (c) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{Array.from(new Set(c.lines.map((l) => l.categoryName))).join(', ')}</span> },
    { key: 'purpose', label: 'Description', render: (c) => <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{c.purpose}</span> },
    { key: 'amount', label: 'Amount', align: 'right', render: (c) => <span className="money">{fmtMoney(c.totals.amount, s.currency)}</span> },
    { key: 'tax', label: 'Tax', align: 'right', render: (c) => <span className="money" style={{ color: 'var(--ink-3)' }}>{c.totals.tax ? fmtMoney(c.totals.tax, s.currency) : '—'}</span> },
    { key: 'total', label: 'Total', align: 'right', render: (c) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(c.totals.total, s.currency)}</span>, total: (rs) => <span className="money" style={{ fontWeight: 700 }}>{fmtMoney(rs.reduce((x, c) => x + c.totals.total, 0), s.currency)}</span>, value: (c) => c.totals.total, sortable: true },
    { key: 'paymentMethod', label: 'Method', render: (c) => <span style={{ fontSize: 12 }}>{c.paymentMethod}</span> },
    { key: 'status', label: 'Status', render: (c) => <Badge status={c.status === 'Reimbursed' ? 'Settled' : String(c.status)}>{String(c.status)}</Badge> },
    { key: 'reimb', label: 'Reimbursed', render: (c) => c.paymentMethod === 'Corporate card' ? <span style={{ fontSize: 11, color: 'var(--ink-5)' }}>N/A</span> : c.status === 'Reimbursed' ? <Badge status="Posted">Yes</Badge> : c.status === 'Approved' ? <Badge status="Returned">Pending</Badge> : <span style={{ color: 'var(--ink-5)' }}>—</span> },
  ];
  return (
    <RegisterPage<ExpenseClaim> title="Expense claims" subtitle={`${visible.length} claims · ${fmtMoney(visible.reduce((x, c) => x + c.totals.total, 0), s.currency)} total · pending reimbursement ${fmtMoney(pendingReimb.reduce((x, c) => x + c.totals.total, 0), s.currency)}${!canSeeAll ? ' · showing your claims' : ''}`} rows={visible} columns={cols} entity="expense claims" searchKeys={['number', 'employeeName', 'purpose']}
      primaryAction={{ label: 'Submit claim', onClick: () => nav.go('budgets/expenses/new') }}
      tabs={[{ id: 'all', label: 'All' }, { id: 'draft', label: 'Draft', filter: (c) => c.status === 'Draft' }, { id: 'pending', label: 'Pending approval', filter: (c) => c.status === 'Submitted' }, { id: 'approved', label: 'Approved', filter: (c) => c.status === 'Approved' }, { id: 'unreimb', label: 'Not reimbursed', filter: (c) => c.status === 'Approved' && c.paymentMethod === 'Personal' }, { id: 'reimb', label: 'Reimbursed', filter: (c) => c.status === 'Reimbursed' }, { id: 'rejected', label: 'Rejected', filter: (c) => c.status === 'Rejected' }]}
      filters={[{ key: 'employee', label: 'Employee', type: 'select', options: Array.from(new Map(claims.map((c) => [c.employeeId, c.employeeName])).entries()).map(([v, l]) => ({ value: v, label: l })) }, { key: 'method', label: 'Method', type: 'select', options: [{ value: 'Personal', label: 'Personal' }, { value: 'Corporate card', label: 'Corporate card' }] }]} applyFilter={(c, v) => (!v.employee || c.employeeId === v.employee) && (!v.method || c.paymentMethod === v.method)}
      onRowClick={(c) => nav.go(`budgets/expenses/${c.id}`)} showTotals
      rowActions={(c) => [{ label: 'Open', onClick: () => nav.go(`budgets/expenses/${c.id}`) }, ...(c.status === 'Draft' ? [{ label: 'Edit', onClick: () => nav.go(`budgets/expenses/${c.id}?edit=1`) }] : [])]}
      emptyTitle="No expense claims" emptyDescription="Submit a claim for travel, meals, supplies and other out-of-pocket spend." />
  );
}

function blank(emp?: Employee): ExpenseClaim {
  const c = engine.ctx();
  return { id: uid('exp'), createdAt: '', updatedAt: '', version: 0, number: 'EXP/DRAFT', docType: 'Expense Claim', date: today(), branchId: emp?.branchId ?? c.branchId, employeeId: emp?.id ?? '', employeeName: emp?.name ?? '', employeeCode: emp?.code, department: emp?.department, purpose: '', status: 'Draft', lines: [], totals: { amount: 0, tax: 0, total: 0 }, currency: c.currency, paymentMethod: 'Personal', dimensions: {}, correlationId: correlationId() };
}

export function ExpenseForm({ id }: { id?: string }) {
  const s = useSession();
  const toast = useToast();
  const existing = useRecord<ExpenseClaim>(C.expenseClaims, id);
  const cats = useCollection<ExpenseCategory>(C.expenseCategories).filter((c) => c.status === 'Active');
  const empOpts = useEmployeeOptions();
  const projOpts = useDimensionOptions('Project');
  const ccOpts = useDimensionOptions('CostCentre');
  const taxOpts = useCollection<any>(C.taxRates).filter((t) => t.status === 'Active' && t.type === 'GST').map((t) => ({ value: t.id, label: t.name }));
  const [c, setC] = useState<ExpenseClaim>(() => existing ?? blank(currentEmployee()));
  const [submitting, setSubmitting] = useState(false);
  const st = expenseSettings();
  const errs = validateClaim(c);
  const upd = (patch: Partial<ExpenseClaim>) => setC((prev) => { const next = { ...prev, ...patch }; return { ...next, totals: totalsOf(next.lines) }; });
  const updLine = (lid: string, patch: Partial<ExpenseLine>) => upd({ lines: c.lines.map((l) => (l.id === lid ? recomputeLine({ ...l, ...patch }) : l)) });
  const pickCat = (lid: string, catId: string) => { const cat = cats.find((x) => x.id === catId); updLine(lid, { categoryId: catId, categoryName: cat?.name ?? '', accountId: cat?.accountId ?? '', taxRateId: cat?.taxRateId, amount: cat?.perDiem && !c.lines.find((l) => l.id === lid)?.amount ? cat.perDiem : c.lines.find((l) => l.id === lid)?.amount ?? 0 }); };
  const budgetWarnings = useMemo(() => c.lines.filter((l) => l.accountId && l.amount > 0).map((l) => checkBudget(l.accountId, l.amount, c.date)).filter((r) => r.mode !== 'None' && r.message && !r.message.startsWith('Within')), [c.lines, c.date]);
  const save = () => { try { const saved = saveClaim(c); toast.success(`${saved.number} saved as draft`); nav.go(`budgets/expenses/${saved.id}`); } catch (e: any) { toast.error(e.message); } };
  const doSubmit = () => { try { const out = submitClaim(c); toast.success(out.status === 'Submitted' ? `${out.number} submitted for approval` : `${out.number} approved and posted (no workflow ≤ ₹5,000)`); nav.go(`budgets/expenses/${out.id}`); } catch (e: any) { toast.error(e.message); } setSubmitting(false); };
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)', marginBottom: 6 }} onClick={() => nav.go(id ? `budgets/expenses/${id}` : 'budgets/expenses')}>← {id ? c.number : 'Expense claims'}</button><h1 className="page-title">{id ? `Edit ${c.number}` : 'New expense claim'}</h1><div className="page-subtitle">Claims above ₹5,000 route to the manager for approval · receipts required above {fmtMoney(st.receiptRequiredAbove, s.currency)}</div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={save}>Save draft</Button><Button variant="primary" onClick={() => setSubmitting(true)} disabled={errs.length > 0} reason={errs[0]}>Submit claim</Button></div>
      </div>
      {errs.length > 0 && c.lines.length > 0 && <Banner tone="warning">{errs.length} item{errs.length === 1 ? '' : 's'} need attention: {errs.slice(0, 3).join(' · ')}</Banner>}
      {budgetWarnings.map((w, i) => <Banner key={i} tone={w.ok ? 'warning' : 'danger'}>{w.message}</Banner>)}
      <div className="grid-4">
        <EntityPicker label="Employee" required value={c.employeeId || undefined} onChange={(v) => { const e = db.find<Employee>(C.employees, v); upd({ employeeId: v ?? '', employeeName: e?.name ?? '', employeeCode: e?.code, department: e?.department, branchId: e?.branchId ?? c.branchId }); }} options={empOpts} disabled={!s.can('budgets.*') && !s.can('payroll.*') && !!currentEmployee()} help={!s.can('budgets.*') ? 'Your own employee record' : undefined} />
        <DateField label="Claim date" required value={c.date} onChange={(v) => upd({ date: v })} />
        <div><label className="field-label">Payment method</label><Segmented value={c.paymentMethod} onChange={(v) => upd({ paymentMethod: v })} options={[{ value: 'Personal', label: 'Personal (reimburse)' }, { value: 'Corporate card', label: 'Corporate card' }]} /></div>
        <EntityPicker label="Project (default for lines)" value={c.dimensions?.Project} onChange={(v) => upd({ dimensions: { ...(c.dimensions ?? {}), Project: v ?? '' } })} options={projOpts} placeholder="Optional" />
      </div>
      <TextField label="Purpose" required value={c.purpose} onChange={(v) => upd({ purpose: v })} placeholder="Client visit — Pune · Safety certification course · Team lunch" />
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense">
          <thead><tr><th style={{ width: 130 }}>Date</th><th style={{ width: 170 }}>Category</th><th>Description</th><th className="right" style={{ width: 120 }}>Amount</th><th style={{ width: 130 }}>Tax</th><th className="right" style={{ width: 100 }}>Total</th><th style={{ width: 150 }}>Project / cost centre</th><th style={{ width: 90 }}>Receipt</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {c.lines.map((l) => { const cat = cats.find((x) => x.id === l.categoryId); const needsReceipt = (cat?.receiptRequired || l.total > st.receiptRequiredAbove) && !l.hasReceipt; return (
              <tr key={l.id} className={needsReceipt || !l.categoryId || l.amount <= 0 ? 'error-row' : ''}>
                <td><input type="date" className="field-input grid" value={l.date} onChange={(e) => updLine(l.id, { date: e.target.value })} /></td>
                <td><select className="field-input grid" value={l.categoryId} onChange={(e) => pickCat(l.id, e.target.value)}><option value="">— Category —</option>{cats.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>{cat && <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>{db.find<any>(C.accounts, cat.accountId)?.code} · {db.find<any>(C.accounts, cat.accountId)?.name}</div>}</td>
                <td><input className="field-input grid" value={l.description} onChange={(e) => updLine(l.id, { description: e.target.value })} placeholder="What was it for?" /></td>
                <td className="right"><input type="number" className="field-input grid num" value={l.amount} onChange={(e) => updLine(l.id, { amount: Number(e.target.value) || 0 })} /></td>
                <td><select className="field-input grid" value={l.taxRateId ?? ''} onChange={(e) => updLine(l.id, { taxRateId: e.target.value || undefined })}><option value="">No GST</option>{taxOpts.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>{l.tax > 0 && <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>{fmtMoney(l.tax, s.currency)} input credit</div>}</td>
                <td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(l.total, s.currency)}</td>
                <td><select className="field-input grid" value={l.dimensions.Project ?? ''} onChange={(e) => updLine(l.id, { dimensions: { ...l.dimensions, Project: e.target.value } })}><option value="">Project —</option>{projOpts.map((p) => <option key={p.id} value={p.id}>{p.primary}</option>)}</select><select className="field-input grid" style={{ marginTop: 2 }} value={l.dimensions.CostCentre ?? ''} onChange={(e) => updLine(l.id, { dimensions: { ...l.dimensions, CostCentre: e.target.value } })}><option value="">Cost centre —</option>{ccOpts.map((p) => <option key={p.id} value={p.id}>{p.primary}</option>)}</select></td>
                <td><CheckboxField checked={!!l.hasReceipt} onChange={(v) => updLine(l.id, { hasReceipt: v })} label={<span style={{ fontSize: 11 }}>{needsReceipt ? <span style={{ color: 'var(--danger)' }}>required</span> : 'attached'}</span>} /></td>
                <td><Button size="sm" variant="ghost" onClick={() => upd({ lines: c.lines.filter((x) => x.id !== l.id) })}>✕</Button></td>
              </tr>); })}
          </tbody>
        </table>
        <div style={{ padding: 10, display: 'flex', gap: 8 }}><Button size="sm" variant="secondary" onClick={() => upd({ lines: [...c.lines, { ...newClaimLine(), dimensions: { ...(c.dimensions?.Project ? { Project: c.dimensions.Project } : {}) } }] })}>+ Add line</Button>{cats.filter((x) => x.perDiem).map((x) => <Button key={x.id} size="sm" variant="ghost" onClick={() => upd({ lines: [...c.lines, { ...newClaimLine(x), dimensions: { ...(c.dimensions?.Project ? { Project: c.dimensions.Project } : {}) } }] })}>+ {x.name} ({fmtMoney(x.perDiem!, s.currency)})</Button>)}</div>
      </div>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div><div className="section-title">Receipts & attachments</div>{id ? <AttachmentsPanel objectType="Expense Claim" objectId={c.id} /> : <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Save the draft to attach receipt files; tick “receipt” on each line for now.</div>}<TextArea label="Notes" value={c.notes} onChange={(v) => upd({ notes: v })} rows={2} style={{ marginTop: 12 }} /></div>
        <div className="summary-block"><div className="ladder-row"><span className="ladder-label">Amount</span><span className="ladder-value">{fmtMoney(c.totals.amount, s.currency)}</span></div><div className="ladder-row"><span className="ladder-label">GST (input credit)</span><span className="ladder-value">{fmtMoney(c.totals.tax, s.currency)}</span></div><div style={{ height: 1, background: 'var(--line-strong)', margin: '6px 0' }} /><div className="ladder-row"><span className="ladder-label" style={{ fontWeight: 600, color: 'var(--ink)' }}>Total claim</span><span className="ladder-value" style={{ fontWeight: 600, fontSize: 16 }}>{fmtMoney(c.totals.total, s.currency)}</span></div><div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>{c.totals.total > 5000 ? 'Above ₹5,000 → manager approval (WF-003)' : 'At or below ₹5,000 → auto-approved and posted on submit'} · {c.paymentMethod === 'Personal' ? 'credits employee payable (2340) for reimbursement' : 'credits the corporate card liability'}</div></div>
      </div>
      <ConfirmDialog open={submitting} onClose={() => setSubmitting(false)} title={`Submit ${fmtMoney(c.totals.total, s.currency)} expense claim`} statement={`${c.employeeName} · ${c.purpose} · ${c.lines.length} line${c.lines.length === 1 ? '' : 's'}`} confirmLabel="Submit claim" cancelLabel="Keep editing" consequences={c.totals.total > 5000 ? [{ engine: 'Workflow', text: 'Routed to your manager (Expense Claim > ₹5,000); posts on approval', tone: 'info' }, ...(budgetWarnings.length ? [{ engine: 'Tax', text: budgetWarnings.map((w) => w.message).join(' · '), tone: 'warning' as const }] : [])] : [{ engine: 'Workflow', text: 'No workflow applies — approved immediately', tone: 'success' }, { engine: 'Journal', text: `Dr expense accounts ${fmtMoney(c.totals.amount, s.currency)} + input GST · Cr ${c.paymentMethod === 'Personal' ? 'employee payable (2340)' : 'corporate card liability'}`, tone: 'info' }, ...(c.paymentMethod === 'Personal' ? [{ engine: 'Open items', text: 'Employee open item created for reimbursement', tone: 'info' as const }] : [])]} onConfirm={doSubmit} />
    </div>
  );
}

export function ExpenseDetail({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const c = useRecord<ExpenseClaim>(C.expenseClaims, id);
  const [confirm, setConfirm] = useState<'approve' | 'reject' | 'reimburse' | 'post' | null>(null);
  const [reimb, setReimb] = useState<{ mode: 'Bank' | 'Payroll'; date: string; reference: string; bankAccountId: string }>({ mode: 'Bank', date: today(), reference: '', bankAccountId: s.company?.defaults.bankAccountId ?? IDS.accHDFC });
  const bankOpts = useAccountOptions((a) => a.controlType === 'Bank');
  if (!c) return <EmptyState title="Claim not found" action={<Button onClick={() => nav.go('budgets/expenses')}>Back</Button>} />;
  const req = db.find<any>(C.approvals, c.approvalId);
  const canApprove = c.status === 'Submitted' && (req ? engine.canActOnApproval(req).ok : s.can('budgets.*'));
  const canFinance = s.can('budgets.*') || s.can('accounting.*') || s.can('banking.*') || s.isTenantOwner;
  const isOwner = db.find<Employee>(C.employees, c.employeeId)?.userId === s.user?.id;
  const act = (fn: () => void, msg: string) => { try { fn(); toast.success(msg); } catch (e: any) { toast.error(e.message); } };
  const rail = (
    <>
      <RailSection label="Claimant"><PartyRail name={c.employeeName} link={`masters/employees/${c.employeeId}`} /><KV items={[{ k: 'Code', v: c.employeeCode ?? '—' }, { k: 'Department', v: c.department ?? '—' }, { k: 'Branch', v: db.find<any>(C.branches, c.branchId)?.name ?? '—' }]} /></RailSection>
      <RailSection label="Claim"><KV items={[{ k: 'Date', v: fmtDate(c.date) }, { k: 'Method', v: c.paymentMethod }, { k: 'Purpose', v: c.purpose }, { k: 'Project', v: c.dimensions?.Project ? db.find<any>(C.dimensions, c.dimensions.Project)?.name : '—' }, { k: 'Submitted', v: c.submittedAt ? `${fmtDateTime(c.submittedAt)} · ${c.submittedBy}` : '—' }, { k: 'Approved', v: c.approvedAt ? `${fmtDateTime(c.approvedAt)} · ${c.approvedBy}` : '—' }]} /></RailSection>
      <RailSection label="Settlement"><KV items={[{ k: 'Journal', v: c.journalNumber ? <span className="identifier link" onClick={() => nav.go(`accounting/journals/${c.journalId}`)}>{c.journalNumber}</span> : '—' }, { k: 'Open item', v: c.openItemId ? <Badge status={db.find<any>(C.openItems, c.openItemId)?.status ?? 'Open'} /> : c.paymentMethod === 'Corporate card' ? 'Card liability' : '—' }, { k: 'Reimbursed', v: c.reimbursedAt ? `${fmtDateTime(c.reimbursedAt)} · ${c.reimbursementMode}` : c.reimbursementMode === 'Payroll' ? <Pill tone="warning">Queued for payroll</Pill> : '—' }, { k: 'Reference', v: c.reimbursementRef ?? '—' }]} /></RailSection>
    </>
  );
  const tabs = [
    { id: 'lines', label: 'Lines', content: (<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {c.status === 'Rejected' && <Banner tone="danger">Rejected: {c.rejectionReason}</Banner>}
      {c.status === 'Approved' && !c.journalId && <Banner tone="warning" action={<Button variant="link" onClick={() => setConfirm('post')}>Post now</Button>}>Approved via the approvals inbox — the accounting entry has not been posted yet.</Banner>}
      {c.notes?.startsWith('Budget:') && <Banner tone="warning">{c.notes}</Banner>}
      <div className="card" style={{ overflow: 'hidden' }}><table className="data-table dense"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Account</th><th>Dimensions</th><th className="right">Amount</th><th className="right">Tax</th><th className="right">Total</th><th>Receipt</th></tr></thead><tbody>
        {c.lines.map((l) => <tr key={l.id}><td>{fmtDate(l.date)}</td><td>{l.categoryName}</td><td>{l.description}</td><td style={{ fontSize: 12 }}>{db.find<any>(C.accounts, l.accountId)?.code} · {db.find<any>(C.accounts, l.accountId)?.name}</td><td>{Object.entries(l.dimensions).filter(([, v]) => v).map(([k, v]) => <span key={k} className="dim-chip" style={{ marginRight: 4 }}>{db.find<any>(C.dimensions, v)?.code ?? v}</span>)}</td><td className="right money">{fmtMoney(l.amount, s.currency)}</td><td className="right money">{l.tax ? fmtMoney(l.tax, s.currency) : '—'}</td><td className="right money" style={{ fontWeight: 600 }}>{fmtMoney(l.total, s.currency)}</td><td>{l.hasReceipt || l.receiptAttachmentId ? <Badge status="Posted">Yes</Badge> : <Badge status="Returned">Missing</Badge>}</td></tr>)}
      </tbody><tfoot><tr><td colSpan={5}>Totals</td><td className="right money">{fmtMoney(c.totals.amount, s.currency)}</td><td className="right money">{fmtMoney(c.totals.tax, s.currency)}</td><td className="right money" style={{ fontWeight: 700 }}>{fmtMoney(c.totals.total, s.currency)}</td><td /></tr></tfoot></table></div>
      <SummaryBlock items={[{ label: 'Lines', value: c.lines.length }, { label: 'Receipts', value: `${c.lines.filter((l) => l.hasReceipt || l.receiptAttachmentId).length}/${c.lines.length}` }, { label: 'Total', value: fmtMoney(c.totals.total, s.currency) }]} />
      <AttachmentsPanel objectType="Expense Claim" objectId={c.id} readOnly={c.status !== 'Draft' && c.status !== 'Returned'} />
    </div>) },
    { id: 'approvals', label: 'Approvals', content: <ApprovalsTab approvalId={c.approvalId} docId={c.id} /> },
    { id: 'accounting', label: 'Accounting', content: <AccountingTab journalId={c.journalId} currency={s.currency} projected={!c.journalId ? [...c.lines.map((l) => ({ accountId: l.accountId, dr: l.amount, dimensions: l.dimensions })), ...(c.totals.tax ? [{ accountId: IDS.accGSTInputCGST, dr: c.totals.tax / 2 }, { accountId: IDS.accGSTInputSGST, dr: c.totals.tax / 2 }] : []), { accountId: c.paymentMethod === 'Personal' ? IDS.accEmpPayable : IDS.accCardPayable, cr: c.totals.total, partyName: c.paymentMethod === 'Personal' ? c.employeeName : undefined }] : undefined} /> },
    { id: 'activity', label: 'Activity', content: <ActivityTab objectId={c.id} correlationId={c.correlationId} /> },
  ];
  return (
    <>
      <DocumentPage backLabel="Expense claims" onBack={() => nav.go('budgets/expenses')} number={c.number} badges={<><Badge status={c.status === 'Reimbursed' ? 'Settled' : String(c.status)}>{String(c.status)}</Badge><Pill tone="neutral">{c.paymentMethod}</Pill></>} amount={{ label: 'Claim total', value: c.totals.total, currency: s.currency }} due={c.openItemId ? { label: 'Outstanding to employee', value: db.find<any>(C.openItems, c.openItemId)?.outstanding ?? 0, currency: s.currency } : undefined} rail={rail} tabs={tabs}
        footer={<>
          {c.status === 'Draft' && <><Button variant="secondary" onClick={() => nav.go(`budgets/expenses/${c.id}?edit=1`)}>Edit</Button><Button variant="primary" onClick={() => act(() => submitClaim(c), 'Claim submitted')} disabled={validateClaim(c).length > 0} reason={validateClaim(c)[0]}>Submit claim</Button></>}
          {(c.status === 'Rejected' || c.status === 'Returned') && isOwner && <Button variant="secondary" onClick={() => act(() => returnToDraft(c), 'Claim reopened as draft')}>Reopen as draft</Button>}
          {c.status === 'Submitted' && <><Button variant="secondary" onClick={() => setConfirm('reject')} disabled={!canApprove} reason={!canApprove ? 'Not your approval step' : undefined}>Reject</Button><Button variant="primary" onClick={() => setConfirm('approve')} disabled={!canApprove} reason={!canApprove ? (req ? engine.canActOnApproval(req).reason : 'Requires budgets permission') : undefined}>Approve claim</Button></>}
          {c.status === 'Approved' && !c.journalId && <Button variant="primary" onClick={() => setConfirm('post')} disabled={!canFinance}>Post to ledger</Button>}
          {c.status === 'Approved' && c.journalId && c.paymentMethod === 'Personal' && <Button variant="primary" onClick={() => setConfirm('reimburse')} disabled={!canFinance} reason={!canFinance ? 'Requires finance permission' : undefined}>Reimburse</Button>}
        </>} />
      <ConfirmDialog open={confirm === 'approve'} onClose={() => setConfirm(null)} title={`Approve ${c.number}`} statement={`${c.employeeName} · ${fmtMoney(c.totals.total, s.currency)} · ${c.purpose}`} confirmLabel="Approve & post" cancelLabel="Not now" consequences={[{ engine: 'Workflow', text: 'Approval step recorded', tone: 'success' }, { engine: 'Journal', text: `Dr expense ${fmtMoney(c.totals.amount, s.currency)} + input GST ${fmtMoney(c.totals.tax, s.currency)} · Cr ${c.paymentMethod === 'Personal' ? 'Employee reimbursements payable (2340)' : 'corporate card liability'}`, tone: 'info' }, ...(c.paymentMethod === 'Personal' ? [{ engine: 'Open items', text: 'Employee open item created — settle via Reimburse or payroll', tone: 'info' as const }] : [])]} onConfirm={() => { approveClaim(c); toast.success(`${c.number} approved and posted`); }} />
      <ConfirmDialog open={confirm === 'reject'} onClose={() => setConfirm(null)} title={`Reject ${c.number}`} statement="The claimant is notified with your reason and can correct and resubmit." confirmLabel="Reject claim" cancelLabel="Keep pending" danger reasonRequired onConfirm={(reason) => { rejectClaim(c, reason); toast.success('Claim rejected'); }} />
      <ConfirmDialog open={confirm === 'post'} onClose={() => setConfirm(null)} title={`Post ${c.number} to ledger`} statement="Creates the expense journal and the employee open item." confirmLabel="Post claim" cancelLabel="Not now" consequences={[{ engine: 'Journal', text: `Dr expenses · Cr ${c.paymentMethod === 'Personal' ? '2340 employee payable' : 'card liability'} ${fmtMoney(c.totals.total, s.currency)}`, tone: 'info' }]} onConfirm={() => { postClaim(c); toast.success('Posted'); }} />
      <Modal open={confirm === 'reimburse'} onClose={() => setConfirm(null)} title={`Reimburse ${fmtMoney(c.totals.total, s.currency)} to ${c.employeeName}`} description="Bank: posts Dr employee payable · Cr bank and settles the open item. Payroll: adds the amount to this month's payroll inputs (settled when the run posts)." footer={<><Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button><Button variant="primary" onClick={() => { act(() => reimburseClaim(c, reimb), reimb.mode === 'Bank' ? 'Reimbursement posted' : 'Queued for payroll'); setConfirm(null); }}>{reimb.mode === 'Bank' ? 'Record payment' : 'Push to payroll'}</Button></>}>
        <Segmented value={reimb.mode} onChange={(v) => setReimb({ ...reimb, mode: v })} options={[{ value: 'Bank', label: 'Bank transfer' }, { value: 'Payroll', label: 'With next payroll' }]} />
        {reimb.mode === 'Bank' && <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}><DateField label="Payment date" value={reimb.date} onChange={(v) => setReimb({ ...reimb, date: v })} checkPeriod /><EntityPicker label="Bank account" value={reimb.bankAccountId} onChange={(v) => setReimb({ ...reimb, bankAccountId: v ?? IDS.accHDFC })} options={bankOpts} /><TextField label="Reference (UTR)" value={reimb.reference} onChange={(v) => setReimb({ ...reimb, reference: v })} placeholder="NEFT UTR / cheque no." /></div>}
        <div style={{ marginTop: 12 }}><MoneyField label="Amount" value={c.totals.total} onChange={() => undefined} disabled /></div>
        <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>Bank reimbursements are also visible under Banking as payments to employees.</div>
      </Modal>
    </>
  );
}
