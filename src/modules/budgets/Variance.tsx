// Budget vs actuals (FR-BUD-002) — legacy look, live: actual from ledger, committed from approved POs, available,
// variance and utilization meters; drill to ledger. Budget control rules (FR-BUD-003) with Test panel.
import { useMemo, useState } from 'react';
import { C, db, engine, nav, useSession, useCollection } from '../../store';
import type { Journal, AccountGroup } from '../../store';
import { Banner, Button, Badge, Drawer, SelectField, NumberField, Toggle, TextArea, useToast, RegisterPage, Card, EntityPicker, useAccountOptions, MoneyField, DateField, KV, Segmented, ScopeLine } from '../../components/ui';
import { fmtMoney, fmtPct, today } from '../../lib/format';
import { RangeBar, useRange, rangeLabel, BranchPicker, drillToLedger, useReportFilters } from '../reports/ReportFrame';
import { activeBudget, budgetVsActual, type VarianceRow } from './compute';
import { checkBudget } from './control';
import type { BudgetRule, BudgetCheckResult } from './types';

export function VariancePage() {
  const s = useSession();
  const [f, set] = useReportFilters({ preset: 'YTD', period: s.state.periodCode ?? '', from: '', to: '', branchId: '' });
  const range = useRange(f);
  const journals = useCollection<Journal>(C.journals);
  const budgets = useCollection<any>(C.budgets);
  const pos = useCollection<any>(C.purchaseOrders);
  const fy = s.state.fy ?? '2026-27';
  const budget = useMemo(() => activeBudget(fy), [budgets, fy]);
  const res = useMemo(() => budgetVsActual(budget, range, { branchId: f.branchId || undefined }), [budget, range, f.branchId, journals, pos]);
  const rows: VarianceRow[] = [...res.rows, res.totals.income, res.totals.expense, res.totals.net];
  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">Budget vs actuals</h1><div className="page-subtitle"><ScopeLine extra={`FY ${fy} · ${rangeLabel(range)} · ${budget ? `${budget.code} v${budget.version}.${budget.revision}` : 'no budget'}`} /></div></div>
        <div style={{ display: 'flex', gap: 8 }}><Button variant="secondary" onClick={() => nav.go(`reports/budget-variance?preset=${f.preset}&period=${f.period}`)}>Open as report (export)</Button>{budget && <Button variant="secondary" onClick={() => nav.go(`budgets/budgets/${budget.id}`)}>Open budget</Button>}</div>
      </div>
      <div className="card toolbar" style={{ padding: '10px 14px', gap: 12, alignItems: 'flex-end' }}><RangeBar f={f} set={set} /><BranchPicker value={f.branchId} onChange={(v) => set({ branchId: v })} /></div>
      {!budget && <Banner tone="warning" action={<Button variant="link" onClick={() => nav.go('budgets/budgets')}>Create budget</Button>}>No approved budget for FY {fy} — actuals shown without budget figures.</Banner>}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table">
          <thead><tr><th>Account / cost head</th><th className="right">Budget (FY)</th><th className="right">Budget (range)</th><th className="right">Actual</th><th className="right">Committed</th><th className="right">Available</th><th className="right">Variance</th><th style={{ width: 170 }}>Utilization</th></tr></thead>
          <tbody>
            {rows.map((r, i) => { const isCalc = r.kind !== 'account'; const util = r.utilizationPct; return (
              <tr key={i} style={{ background: isCalc ? 'var(--surface-2)' : undefined, fontWeight: isCalc ? 600 : 400, cursor: r.accountId ? 'pointer' : undefined }} onClick={() => r.accountId && drillToLedger(r.accountId, range)}>
                <td style={{ paddingLeft: isCalc ? 12 : 28, fontSize: r.kind === 'group' ? 11 : 13, textTransform: r.kind === 'group' ? 'uppercase' : undefined, letterSpacing: r.kind === 'group' ? '0.04em' : undefined, color: r.kind === 'group' ? 'var(--ink-3)' : 'var(--ink)' }}>{r.code && <span className="identifier" style={{ marginRight: 6, color: 'var(--ink-4)' }}>{r.code}</span>}{r.name}</td>
                <td className="right money">{fmtMoney(r.budgetFy, s.currency)}</td><td className="right money">{fmtMoney(r.budgetPeriod, s.currency)}</td><td className="right money">{fmtMoney(r.actual, s.currency)}</td>
                <td className="right money" style={{ color: r.committed ? '#F97316' : 'var(--ink-5)' }}>{r.committed ? fmtMoney(r.committed, s.currency) : '—'}</td>
                <td className="right money">{r.type === 'Expense' ? fmtMoney(r.available, s.currency) : '—'}</td>
                <td className="right money" style={{ fontWeight: 600, color: r.favorable ? 'var(--good)' : 'var(--danger)' }}>{r.favorable ? '+' : ''}{fmtMoney(r.variance, s.currency)}</td>
                <td>{!isCalc && r.type === 'Expense' && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 9999, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.min(100, util)}%`, borderRadius: 9999, background: util > 90 ? 'var(--danger)' : util > 75 ? '#F97316' : 'var(--good)' }} /></div><span style={{ fontSize: 11, color: 'var(--ink-3)', width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{util === 999 ? '∞' : fmtPct(util, 0)}</span></div>}</td>
              </tr>); })}
            {rows.length <= 3 && res.rows.length === 0 && <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>No budget lines or actuals in this range.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-4)' }}>Actual = posted journals (ledger) · Committed = approved / partially received POs not yet received · Available = budget − actual − committed · click an account to drill to the ledger.</div>
    </div>
  );
}

export function ControlPage() {
  const s = useSession();
  const toast = useToast();
  const rules = useCollection<BudgetRule>(C.budgetRules).filter((r) => !r.companyId || r.companyId === s.state.companyId);
  const groups = useCollection<AccountGroup>(C.accountGroups).filter((g) => g.companyId === s.state.companyId && g.type === 'Expense' || g.type === 'Asset');
  const accOpts = useAccountOptions((a) => a.type === 'Expense');
  const [edit, setEdit] = useState<Partial<BudgetRule> | null>(null);
  const [test, setTest] = useState<{ accountId?: string; amount: number; date: string; scope: 'period' | 'ytd' | 'fy' }>({ amount: 25000, date: today(), scope: 'ytd' });
  const [result, setResult] = useState<BudgetCheckResult | null>(null);
  const canEdit = s.can('budgets.*') || s.isTenantOwner;
  const save = () => { if (!edit?.groupId) { toast.error('Choose an account group'); return; } const g = groups.find((x) => x.id === edit.groupId); if (edit.id) db.update<BudgetRule>(C.budgetRules, edit.id, { ...edit, groupName: g?.name ?? '' }); else db.insert<BudgetRule>(C.budgetRules, { mode: 'Warn', thresholdPct: 100, includeCommitted: true, status: 'Active', ...edit, groupName: g?.name ?? '' }); engine.audit({ action: 'budget.rule.saved', objectType: 'Budget Rule', objectNumber: g?.name, detail: `${edit.mode} at ${edit.thresholdPct}%` }); toast.success('Rule saved'); setEdit(null); };
  const run = () => { if (!test.accountId) { toast.error('Choose an account'); return; } setResult(checkBudget(test.accountId, test.amount, test.date, { scope: test.scope })); };
  return (
    <>
      <RegisterPage<BudgetRule> title="Budget control" subtitle="Per account group: Warn, Block or Override-with-approval at a utilization threshold. Other modules call checkBudget(accountId, amount, date) before committing spend (FR-BUD-003)." rows={rules} columns={[
        { key: 'groupName', label: 'Account group', render: (r) => <div><div className="cell-primary">{r.groupName}</div><div className="cell-secondary">{r.notes ?? ''}</div></div>, sortable: true },
        { key: 'mode', label: 'Mode', render: (r) => <Badge status={r.mode === 'Block' ? 'Rejected' : r.mode === 'Override' ? 'Submitted' : 'Returned'}>{r.mode === 'Override' ? 'Override with approval' : r.mode}</Badge> },
        { key: 'thresholdPct', label: 'Threshold', align: 'right', render: (r) => `${r.thresholdPct}%` },
        { key: 'includeCommitted', label: 'Counts committed POs', render: (r) => (r.includeCommitted ? 'Yes' : 'No') },
        { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
      ]} entity="rules" searchKeys={['groupName', 'mode']} primaryAction={{ label: 'New rule', onClick: () => setEdit({ mode: 'Warn', thresholdPct: 90, includeCommitted: true, status: 'Active' }), disabled: !canEdit }} onRowClick={(r) => setEdit(r)} rowActions={(r) => [{ label: 'Edit', onClick: () => setEdit(r) }, { label: r.status === 'Active' ? 'Deactivate' : 'Activate', onClick: () => db.update<BudgetRule>(C.budgetRules, r.id, { status: r.status === 'Active' ? 'Inactive' : 'Active' }) }, { label: 'Delete', danger: true, onClick: () => db.remove(C.budgetRules, r.id) }]}
        headerExtra={<Card title="Test a posting against budget control" padding={16}>
          <div className="grid-4" style={{ alignItems: 'flex-end' }}>
            <EntityPicker label="Expense account" value={test.accountId} onChange={(v) => setTest({ ...test, accountId: v })} options={accOpts} size="sm" />
            <MoneyField label="Amount" value={test.amount} onChange={(v) => setTest({ ...test, amount: v })} size="sm" />
            <DateField label="Date" value={test.date} onChange={(v) => setTest({ ...test, date: v })} size="sm" />
            <div><label className="field-label">Scope</label><Segmented value={test.scope} onChange={(v) => setTest({ ...test, scope: v })} options={[{ value: 'period', label: 'Month' }, { value: 'ytd', label: 'YTD' }, { value: 'fy', label: 'FY' }]} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}><Button variant="primary" size="sm" onClick={run}>Test</Button>{result && <Banner tone={result.mode === 'None' ? 'info' : !result.ok ? 'danger' : result.needsApproval ? 'warning' : result.message?.startsWith('Within') ? 'success' : 'warning'} style={{ flex: 1 }}>{result.message}{result.mode !== 'None' && result.budget > 0 && <span style={{ marginLeft: 8, fontSize: 12 }}>· budget {fmtMoney(result.budget, s.currency)} · actual {fmtMoney(result.actual, s.currency)} · committed {fmtMoney(result.committed, s.currency)} · available {fmtMoney(result.available, s.currency)}</span>}</Banner>}</div>
          <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 8 }}>Helper: <span className="identifier">checkBudget(accountId, amount, date, {'{ scope }'})</span> from <span className="identifier">src/modules/budgets/control.ts</span> → {'{ ok, mode, message, needsApproval, budget, actual, committed, available, utilizationPct }'}</div>
        </Card>}
        emptyTitle="No control rules" emptyDescription="Without rules, budgets are informational only." />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit rule · ${edit.groupName}` : 'New budget control rule'} width={500} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button variant="primary" onClick={save}>Save rule</Button></>}>
        {edit && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <SelectField label="Account group" required value={edit.groupId} onChange={(v) => setEdit({ ...edit, groupId: v })} options={groups.map((g) => ({ value: g.id, label: `${g.code} · ${g.name}` }))} />
          <SelectField label="Mode" value={edit.mode} onChange={(v) => setEdit({ ...edit, mode: v as any })} options={[{ value: 'Warn', label: 'Warn — allow with a warning' }, { value: 'Block', label: 'Block — refuse the posting' }, { value: 'Override', label: 'Override — allow with approval' }]} />
          <NumberField label="Threshold % of budget" value={edit.thresholdPct} onChange={(v) => setEdit({ ...edit, thresholdPct: v })} suffix="%" min={1} max={200} />
          <Toggle on={!!edit.includeCommitted} onChange={(v) => setEdit({ ...edit, includeCommitted: v })} label="Include committed purchase orders in utilization" />
          <TextArea label="Notes" value={edit.notes} onChange={(v) => setEdit({ ...edit, notes: v })} rows={2} />
          <KV items={[{ k: 'Evaluated', v: 'On expense claim submission, and by any module calling checkBudget before commit/post' }]} />
        </div>}
      </Drawer>
    </>
  );
}
