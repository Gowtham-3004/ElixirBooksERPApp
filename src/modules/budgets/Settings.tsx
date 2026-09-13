// Expense settings: categories → accounts mapping, per-diem rates, receipt-required threshold.
import { useState } from 'react';
import { C, db, useSession, useCollection } from '../../store';
import { RegisterPage, Badge, Button, Card, Drawer, TextField, MoneyField, SelectField, EntityPicker, useAccountOptions, Toggle, useToast, KV } from '../../components/ui';
import { fmtMoney } from '../../lib/format';
import type { ExpenseCategory } from './types';
import { expenseSettings, saveExpenseSettings } from './expenseActions';

export function ExpenseSettingsPage() {
  const s = useSession();
  const toast = useToast();
  const cats = useCollection<ExpenseCategory>(C.expenseCategories).filter((c) => !c.companyId || c.companyId === s.state.companyId);
  const accOpts = useAccountOptions((a) => a.type === 'Expense');
  const liabOpts = useAccountOptions((a) => a.type === 'Liability');
  const taxOpts = useCollection<any>(C.taxRates).filter((t) => t.status === 'Active' && t.type === 'GST').map((t) => ({ value: t.id, label: t.name }));
  const [edit, setEdit] = useState<Partial<ExpenseCategory> | null>(null);
  const [st, setSt] = useState(() => expenseSettings());
  const canEdit = s.can('budgets.*') || s.isTenantOwner;
  const save = () => {
    if (!edit?.name || !edit.code || !edit.accountId) { toast.error('Code, name and account are required'); return; }
    const acc = db.find<any>(C.accounts, edit.accountId);
    if (edit.id) db.update<ExpenseCategory>(C.expenseCategories, edit.id, { ...edit, accountName: acc?.name });
    else db.insert<ExpenseCategory>(C.expenseCategories, { receiptRequired: true, status: 'Active', ...edit, accountName: acc?.name });
    toast.success('Category saved'); setEdit(null);
  };
  return (
    <>
      <RegisterPage<ExpenseCategory> title="Expense settings" subtitle="Categories map claim lines to expense accounts and default GST; per-diem categories prefill the amount" rows={cats} columns={[
        { key: 'code', label: 'Code', render: (c) => <span className="identifier">{c.code}</span> }, { key: 'name', label: 'Category', sortable: true },
        { key: 'accountId', label: 'Expense account', render: (c) => { const a = db.find<any>(C.accounts, c.accountId); return a ? `${a.code} · ${a.name}` : '—'; } },
        { key: 'taxRateId', label: 'Default GST', render: (c) => db.find<any>(C.taxRates, c.taxRateId)?.name ?? '—' },
        { key: 'perDiem', label: 'Per diem', align: 'right', render: (c) => (c.perDiem ? <span className="money">{fmtMoney(c.perDiem, s.currency)}</span> : '—') },
        { key: 'receiptRequired', label: 'Receipt', render: (c) => (c.receiptRequired ? <Badge status="Approved">Required</Badge> : <Badge status="Draft">Optional</Badge>) },
        { key: 'status', label: 'Status', render: (c) => <Badge status={c.status} /> },
      ]} entity="categories" searchKeys={['code', 'name']} primaryAction={{ label: 'New category', onClick: () => setEdit({ receiptRequired: true, status: 'Active' }), disabled: !canEdit }} onRowClick={(c) => setEdit(c)} rowActions={(c) => [{ label: 'Edit', onClick: () => setEdit(c) }, { label: c.status === 'Active' ? 'Deactivate' : 'Activate', onClick: () => db.update<ExpenseCategory>(C.expenseCategories, c.id, { status: c.status === 'Active' ? 'Inactive' : 'Active' }) }]}
        headerExtra={<Card title="Policy" actions={<Button size="sm" variant="primary" onClick={() => { saveExpenseSettings(st); toast.success('Expense policy saved'); }} disabled={!canEdit}>Save policy</Button>}>
          <div className="grid-4">
            <MoneyField label="Receipt required above" value={st.receiptRequiredAbove} onChange={(v) => setSt({ ...st, receiptRequiredAbove: v })} size="sm" />
            <MoneyField label="Per diem — domestic" value={st.perDiemDomestic} onChange={(v) => setSt({ ...st, perDiemDomestic: v })} size="sm" />
            <MoneyField label="Per diem — international" value={st.perDiemInternational} onChange={(v) => setSt({ ...st, perDiemInternational: v })} size="sm" />
            <EntityPicker label="Corporate card liability account" value={st.corporateCardAccountId} onChange={(v) => setSt({ ...st, corporateCardAccountId: v })} options={liabOpts} size="sm" />
          </div>
          <KV items={[{ k: 'Approval', v: 'Expense Claim above 5,000 routes to the manager (workflow WF-003, managed under Company administration)' }, { k: 'Employee payable', v: `${db.find<any>(C.accounts, st.employeePayableAccountId)?.code ?? '2340'} · ${db.find<any>(C.accounts, st.employeePayableAccountId)?.name ?? 'Employee Reimbursements Payable'}` }]} />
        </Card>} emptyTitle="No categories" />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${edit.name}` : 'New expense category'} width={480} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save category</Button></>}>
        {edit && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="grid-2"><TextField label="Code" required value={edit.code} onChange={(v) => setEdit({ ...edit, code: v })} uppercase /><TextField label="Name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} /></div>
          <EntityPicker label="Expense account" required value={edit.accountId} onChange={(v) => setEdit({ ...edit, accountId: v })} options={accOpts} />
          <SelectField label="Default GST" value={edit.taxRateId ?? ''} onChange={(v) => setEdit({ ...edit, taxRateId: v || undefined })} options={[{ value: '', label: 'No GST' }, ...taxOpts]} />
          <MoneyField label="Per diem (prefills amount)" value={edit.perDiem ?? 0} onChange={(v) => setEdit({ ...edit, perDiem: v || undefined })} />
          <Toggle on={!!edit.receiptRequired} onChange={(v) => setEdit({ ...edit, receiptRequired: v })} label="Receipt required on every line" />
        </div>}
      </Drawer>
    </>
  );
}
