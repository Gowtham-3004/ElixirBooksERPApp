// Budgets (FR-BUD-001): register + editor — FY, version/revision (Draft → Approved; revising an approved budget creates
// a new revision keeping history), dimension scope, account × 12-month grid with paste-friendly cells, import wizard.
import { Fragment, useMemo, useState } from 'react';
import { C, db, engine, nav, useSession, useCollection, useRecord } from '../../store';
import type { Account, AccountGroup } from '../../store';
import { RegisterPage, Badge, Banner, Button, ConfirmDialog, TextField, SelectField, TextArea, EntityPicker, useAccountOptions, useDimensionOptions, ImportWizard, useToast, KV, SummaryBlock, EmptyState } from '../../components/ui';
import { fmtMoney, fmtDate, fmtDateTime, fmtPeriod, round, uid } from '../../lib/format';
import type { Budget, BudgetLine } from './types';
import { periodsBetween } from '../reports/compute';

function fyPeriods(fyStart: string): string[] { return periodsBetween({ from: fyStart, to: `${parseInt(fyStart.slice(0, 4), 10) + 1}-${fyStart.slice(5, 7)}-01` }).slice(0, 12); }

export function BudgetsRegister() {
  const s = useSession();
  const toast = useToast();
  const budgets = useCollection<Budget>(C.budgets).filter((b) => !b.companyId || b.companyId === s.state.companyId).slice().sort((a, b) => b.fy.localeCompare(a.fy) || b.revision - a.revision);
  const [importOpen, setImportOpen] = useState(false);
  const canEdit = s.can('budgets.*') || s.can('budgets.budget.edit');
  const fy = s.state.fy ?? '2026-27';
  const fyStart = `${fy.slice(0, 4)}-${String(s.company?.fiscalYearStartMonth ?? 4).padStart(2, '0')}-01`;
  const create = () => { const b = db.insert<Budget>(C.budgets, { code: `BUD-${fy}`, name: `Operating budget FY ${fy}`, fy, fyStart, version: 1, revision: (budgets.filter((x) => x.fy === fy).sort((a, b) => b.revision - a.revision)[0]?.revision ?? 0) + 1, status: 'Draft', scope: {}, lines: [], totalIncome: 0, totalExpense: 0 }); nav.go(`budgets/budgets/${b.id}`); };
  return (
    <>
      <RegisterPage<Budget> title="Budgets" subtitle={`${budgets.filter((b) => b.status === 'Approved').length} approved · revising an approved budget creates a new revision and keeps the old one for history`} rows={budgets} columns={[
        { key: 'name', label: 'Budget', render: (b) => <div><div className="cell-primary link">{b.name}</div><div className="cell-secondary identifier">{b.code} · v{b.version}.{b.revision}</div></div>, sortable: true },
        { key: 'fy', label: 'FY', sortable: true },
        { key: 'scope', label: 'Scope', render: (b) => <span style={{ fontSize: 12 }}>{[b.scope.branchId && db.find<any>(C.branches, b.scope.branchId)?.name, b.scope.departmentId && db.find<any>(C.dimensions, b.scope.departmentId)?.name, b.scope.costCentreId && db.find<any>(C.dimensions, b.scope.costCentreId)?.name].filter(Boolean).join(' · ') || 'Company-wide'}</span> },
        { key: 'lines', label: 'Accounts', align: 'right', render: (b) => b.lines.length },
        { key: 'totalIncome', label: 'Income', align: 'right', render: (b) => <span className="money">{fmtMoney(b.totalIncome, s.currency)}</span> },
        { key: 'totalExpense', label: 'Expense', align: 'right', render: (b) => <span className="money">{fmtMoney(b.totalExpense, s.currency)}</span> },
        { key: 'net', label: 'Net', align: 'right', render: (b) => <span className="money" style={{ fontWeight: 600, color: b.totalIncome - b.totalExpense >= 0 ? 'var(--good)' : 'var(--danger)' }}>{fmtMoney(b.totalIncome - b.totalExpense, s.currency)}</span> },
        { key: 'status', label: 'Status', render: (b) => <Badge status={b.status === 'Superseded' ? 'Cancelled' : b.status}>{b.status}</Badge> },
        { key: 'approvedAt', label: 'Approved', render: (b) => (b.approvedAt ? `${fmtDate(b.approvedAt)} · ${b.approvedBy}` : '—') },
      ]} entity="budgets" searchKeys={['name', 'code', 'fy']}
        primaryAction={{ label: 'New budget', onClick: create, disabled: !canEdit, reason: !canEdit ? 'Requires budgets permission' : undefined }} importAction={() => setImportOpen(true)}
        tabs={[{ id: 'all', label: 'All' }, { id: 'approved', label: 'Approved', filter: (b) => b.status === 'Approved' }, { id: 'draft', label: 'Draft', filter: (b) => b.status === 'Draft' }, { id: 'history', label: 'Superseded', filter: (b) => b.status === 'Superseded' }]}
        onRowClick={(b) => nav.go(`budgets/budgets/${b.id}`)}
        rowActions={(b) => [{ label: 'Open', onClick: () => nav.go(`budgets/budgets/${b.id}`) }, { label: 'Budget vs actuals', onClick: () => nav.go('budgets/variance') }]}
        emptyTitle="No budgets" emptyDescription="Create a budget for the fiscal year or import one from CSV." />
      <ImportWizard open={importOpen} onClose={() => setImportOpen(false)} entity="Budget lines" fields={[{ key: 'accountCode', label: 'Account code', required: true }, ...fyPeriods(fyStart).map((p) => ({ key: p, label: fmtPeriod(p), type: 'number' as const }))]} duplicateKeys={['accountCode']} existing={[]} sampleRows={[{ 'Account code': '5500', ...Object.fromEntries(fyPeriods(fyStart).map((p) => [fmtPeriod(p), '20000'])) }]}
        onCommit={(rows) => {
          const accounts = db.where<Account>(C.accounts, (a) => a.companyId === s.state.companyId);
          const groups = db.get<AccountGroup>(C.accountGroups);
          const lines: BudgetLine[] = rows.map((r) => { const a = accounts.find((x) => x.code === r.accountCode); if (!a) return null; const months = fyPeriods(fyStart).map((p) => Number(r[p] || 0)); return { id: uid('bl'), accountId: a.id, accountCode: a.code, accountName: a.name, accountType: a.type, groupId: a.groupId, months, total: months.reduce((x, y) => x + y, 0) } as BudgetLine; }).filter(Boolean) as BudgetLine[];
          void groups;
          const b = db.insert<Budget>(C.budgets, { code: `BUD-${fy}-IMP`, name: `Imported budget FY ${fy}`, fy, fyStart, version: 1, revision: (budgets.filter((x) => x.fy === fy).sort((a, c) => c.revision - a.revision)[0]?.revision ?? 0) + 1, status: 'Draft', scope: {}, lines, totalIncome: lines.filter((l) => l.accountType === 'Income').reduce((x, l) => x + l.total, 0), totalExpense: lines.filter((l) => l.accountType === 'Expense').reduce((x, l) => x + l.total, 0) });
          toast.success(`Imported ${lines.length} budget lines`); nav.go(`budgets/budgets/${b.id}`);
          return lines.length;
        }} />
    </>
  );
}

export function BudgetEditor({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const b = useRecord<Budget>(C.budgets, id);
  const accOpts = useAccountOptions((a) => a.type === 'Income' || a.type === 'Expense');
  const deptOpts = useDimensionOptions('Department');
  const ccOpts = useDimensionOptions('CostCentre');
  const branches = useCollection<any>(C.branches).filter((x) => x.companyId === s.state.companyId);
  const groups = useCollection<AccountGroup>(C.accountGroups);
  const [confirm, setConfirm] = useState<'approve' | 'revise' | null>(null);
  const [addAcc, setAddAcc] = useState<string | undefined>();
  const canEdit = (s.can('budgets.*') || s.can('budgets.budget.edit')) && b?.status === 'Draft';
  const canApprove = s.can('budgets.*') || s.can('budgets.budget.approve') || s.isTenantOwner;
  const periods = useMemo(() => (b ? fyPeriods(b.fyStart) : []), [b?.fyStart]);
  if (!b) return <EmptyState title="Budget not found" action={<Button onClick={() => nav.go('budgets/budgets')}>Back</Button>} />;
  const save = (patch: Partial<Budget>) => {
    const lines = patch.lines ?? b.lines;
    db.update<Budget>(C.budgets, b.id, { ...patch, lines, totalIncome: round(lines.filter((l) => l.accountType === 'Income').reduce((x, l) => x + l.total, 0)), totalExpense: round(lines.filter((l) => l.accountType === 'Expense').reduce((x, l) => x + l.total, 0)) });
  };
  const setCell = (lineId: string, i: number, v: number) => save({ lines: b.lines.map((l) => (l.id === lineId ? (() => { const months = l.months.slice(); months[i] = v; return { ...l, months, total: round(months.reduce((x, y) => x + y, 0)) }; })() : l)) });
  const paste = (lineId: string, i: number, text: string) => {
    const vals = text.split(/[\t,\n]/).map((x) => Number(x.replace(/[^0-9.\-]/g, ''))).filter((x) => !isNaN(x));
    if (vals.length <= 1) return false;
    save({ lines: b.lines.map((l) => (l.id === lineId ? (() => { const months = l.months.slice(); vals.forEach((v, k) => { if (i + k < 12) months[i + k] = v; }); return { ...l, months, total: round(months.reduce((x, y) => x + y, 0)) }; })() : l)) });
    return true;
  };
  const spread = (lineId: string, annual: number) => { const base = Math.floor(annual / 12); const months = Array(12).fill(base); months[11] = annual - base * 11; save({ lines: b.lines.map((l) => (l.id === lineId ? { ...l, months, total: annual } : l)) }); };
  const addLine = () => { const a = db.find<Account>(C.accounts, addAcc); if (!a || b.lines.some((l) => l.accountId === a.id)) return; save({ lines: [...b.lines, { id: uid('bl'), accountId: a.id, accountCode: a.code, accountName: a.name, accountType: a.type, groupId: a.groupId, months: Array(12).fill(0), total: 0 }].sort((x, y) => x.accountCode.localeCompare(y.accountCode)) }); setAddAcc(undefined); };
  const approve = () => db.transaction(() => {
    db.where<Budget>(C.budgets, (x) => x.fy === b.fy && x.status === 'Approved' && x.id !== b.id && x.companyId === b.companyId).forEach((x) => db.update<Budget>(C.budgets, x.id, { status: 'Superseded', supersededById: b.id }));
    db.update<Budget>(C.budgets, b.id, { status: 'Approved', approvedBy: s.user?.name, approvedAt: new Date().toISOString() });
    engine.audit({ action: 'budget.approved', objectType: 'Budget', objectId: b.id, objectNumber: `${b.code} v${b.version}.${b.revision}`, detail: `Income ${b.totalIncome} · expense ${b.totalExpense}` });
    engine.notify({ type: 'system', title: `Budget ${b.code} v${b.version}.${b.revision} approved`, body: 'Budget control now uses this revision', link: 'budgets/variance' });
    toast.success('Budget approved — now used for budget vs actuals and control');
  });
  const revise = () => { const nb = db.insert<Budget>(C.budgets, { ...b, id: undefined, revision: b.revision + 1, status: 'Draft', approvedAt: undefined, approvedBy: undefined, revisionOfId: b.id, supersededById: undefined, notes: `Revision of v${b.version}.${b.revision}` } as any); engine.audit({ action: 'budget.revised', objectType: 'Budget', objectId: nb.id, objectNumber: `${b.code} v${nb.version}.${nb.revision}`, detail: `From v${b.version}.${b.revision}` }); toast.success(`Revision ${nb.revision} created as draft`); nav.go(`budgets/budgets/${nb.id}`); };
  const history = db.where<Budget>(C.budgets, (x) => x.fy === b.fy && x.code === b.code && x.companyId === b.companyId).sort((x, y) => y.revision - x.revision);
  const groupOf = (gid?: string) => groups.find((g) => g.id === gid)?.name ?? 'Other';
  const grouped = Array.from(new Set(b.lines.map((l) => l.groupId))).map((gid) => ({ gid, name: groupOf(gid), lines: b.lines.filter((l) => l.groupId === gid) }));
  return (
    <div className="page">
      <div className="page-header">
        <div><button type="button" className="btn-link" style={{ color: 'var(--ink-3)', marginBottom: 6 }} onClick={() => nav.go('budgets/budgets')}>← Budgets</button><h1 className="page-title">{b.name}</h1><div className="page-subtitle">{b.code} · v{b.version}.{b.revision} · FY {b.fy} · <Badge status={b.status === 'Superseded' ? 'Cancelled' : b.status}>{b.status}</Badge>{b.approvedAt ? ` · approved ${fmtDateTime(b.approvedAt)} by ${b.approvedBy}` : ''}</div></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {b.status === 'Draft' && <Button variant="primary" onClick={() => setConfirm('approve')} disabled={!canApprove || !b.lines.length} reason={!canApprove ? 'Requires budget approval permission' : !b.lines.length ? 'Add budget lines first' : undefined}>Approve budget</Button>}
          {b.status === 'Approved' && <Button variant="primary" onClick={() => setConfirm('revise')} disabled={!s.can('budgets.*')}>Revise (new revision)</Button>}
          <Button variant="secondary" onClick={() => nav.go('budgets/variance')}>Budget vs actuals</Button>
        </div>
      </div>
      {b.status === 'Approved' && <Banner tone="info">Approved budgets are read-only. Revising creates v{b.version}.{b.revision + 1} as a draft; the current revision stays for history.</Banner>}
      <div className="grid-4">
        <TextField label="Name" value={b.name} onChange={(v) => save({ name: v })} disabled={!canEdit} />
        <SelectField label="Branch scope" value={b.scope.branchId ?? ''} onChange={(v) => save({ scope: { ...b.scope, branchId: v || undefined } })} options={[{ value: '', label: 'Company-wide' }, ...branches.map((x) => ({ value: x.id, label: x.name }))]} disabled={!canEdit} />
        <EntityPicker label="Department scope" value={b.scope.departmentId} onChange={(v) => save({ scope: { ...b.scope, departmentId: v } })} options={deptOpts} disabled={!canEdit} placeholder="All departments" />
        <EntityPicker label="Cost centre scope" value={b.scope.costCentreId} onChange={(v) => save({ scope: { ...b.scope, costCentreId: v } })} options={ccOpts} disabled={!canEdit} placeholder="All cost centres" />
      </div>
      <SummaryBlock items={[{ label: 'Income', value: fmtMoney(b.totalIncome, s.currency), tone: 'good' }, { label: 'Expense', value: fmtMoney(b.totalExpense, s.currency) }, { label: 'Net', value: fmtMoney(b.totalIncome - b.totalExpense, s.currency), tone: b.totalIncome - b.totalExpense >= 0 ? 'good' : 'danger' }, { label: 'Lines', value: b.lines.length }]} />
      {canEdit && <div className="card toolbar" style={{ padding: '10px 14px' }}><div style={{ width: 360 }}><EntityPicker label="Add account" value={addAcc} onChange={setAddAcc} options={accOpts.filter((o) => !b.lines.some((l) => l.accountId === o.id))} size="sm" /></div><Button size="sm" variant="secondary" onClick={addLine} disabled={!addAcc} style={{ marginTop: 18 }}>+ Add line</Button><div style={{ flex: 1 }} /><span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Tip: paste a row of 12 comma/tab-separated values into any month cell to fill the year.</span></div>}
      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table dense" style={{ minWidth: 1400 }}>
          <thead><tr><th style={{ position: 'sticky', left: 0, background: 'var(--surface-2)', zIndex: 2, minWidth: 220 }}>Account</th>{periods.map((p) => <th key={p} className="right" style={{ minWidth: 90 }}>{fmtPeriod(p).slice(0, 3)}</th>)}<th className="right" style={{ minWidth: 120 }}>FY total</th>{canEdit && <th />}</tr></thead>
          <tbody>
            {grouped.map((g) => (<Fragment key={g.gid ?? 'g'}>
              <tr style={{ background: 'var(--surface-2)' }}><td colSpan={14 + (canEdit ? 1 : 0)} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--ink-3)', fontWeight: 600 }}>{g.name}</td></tr>
              {g.lines.map((l) => (
                <tr key={l.id}>
                  <td style={{ position: 'sticky', left: 0, background: '#FFF', zIndex: 1 }}><div className="cell-primary"><span className="identifier" style={{ color: 'var(--ink-4)', marginRight: 6 }}>{l.accountCode}</span>{l.accountName}</div></td>
                  {l.months.map((m, i) => <td key={i} className="right">{canEdit ? <input className="field-input grid num" style={{ width: 84 }} value={m} onChange={(e) => setCell(l.id, i, Number(e.target.value) || 0)} onPaste={(e) => { if (paste(l.id, i, e.clipboardData.getData('text'))) e.preventDefault(); }} /> : <span className="money">{m ? fmtMoney(m, s.currency, { decimals: 0 }) : '—'}</span>}</td>)}
                  <td className="right money" style={{ fontWeight: 600 }}>{canEdit ? <input className="field-input grid num" style={{ width: 110 }} value={l.total} onChange={(e) => spread(l.id, Number(e.target.value) || 0)} title="Type an annual amount to spread evenly" /> : fmtMoney(l.total, s.currency, { decimals: 0 })}</td>
                  {canEdit && <td><Button size="sm" variant="ghost" onClick={() => save({ lines: b.lines.filter((x) => x.id !== l.id) })}>✕</Button></td>}
                </tr>
              ))}
            </Fragment>))}
            {b.lines.length === 0 && <tr><td colSpan={14} style={{ padding: 24, textAlign: 'center', color: 'var(--ink-4)' }}>No lines yet — add accounts above or import a CSV from the register.</td></tr>}
          </tbody>
          <tfoot><tr style={{ fontWeight: 700 }}><td style={{ position: 'sticky', left: 0, background: 'var(--surface-2)' }}>Net (income − expense)</td>{periods.map((_, i) => <td key={i} className="right money">{fmtMoney(b.lines.reduce((x, l) => x + (l.accountType === 'Income' ? l.months[i] : -l.months[i]), 0), s.currency, { decimals: 0 })}</td>)}<td className="right money">{fmtMoney(b.totalIncome - b.totalExpense, s.currency, { decimals: 0 })}</td>{canEdit && <td />}</tr></tfoot>
        </table>
      </div>
      <TextArea label="Notes" value={b.notes} onChange={(v) => save({ notes: v })} disabled={!canEdit && b.status !== 'Approved'} rows={2} />
      {history.length > 1 && <div className="card" style={{ padding: 16 }}><div className="section-title">Revision history</div><KV items={history.map((h) => ({ k: `v${h.version}.${h.revision}`, v: <span className={h.id === b.id ? undefined : 'link'} onClick={() => h.id !== b.id && nav.go(`budgets/budgets/${h.id}`)}><Badge status={h.status === 'Superseded' ? 'Cancelled' : h.status}>{h.status}</Badge> · {fmtMoney(h.totalExpense, s.currency)} expense{h.approvedAt ? ` · approved ${fmtDate(h.approvedAt)}` : ''}</span> }))} /></div>}
      <ConfirmDialog open={confirm === 'approve'} onClose={() => setConfirm(null)} title={`Approve ${b.code} v${b.version}.${b.revision}`} statement="Makes this revision the active budget for variance reporting and budget control. Any previously approved revision for this FY is superseded." confirmLabel="Approve budget" cancelLabel="Keep as draft" consequences={[{ engine: 'Workflow', text: `Status → Approved by ${s.user?.name}`, tone: 'success' }, { engine: 'Tax', text: 'Budget control rules now evaluate against this revision', tone: 'info' }]} onConfirm={approve} />
      <ConfirmDialog open={confirm === 'revise'} onClose={() => setConfirm(null)} title="Create a new revision" statement={`Copies v${b.version}.${b.revision} into draft v${b.version}.${b.revision + 1}. The approved revision stays active until the new one is approved.`} confirmLabel="Create revision" cancelLabel="Cancel" consequences={[{ engine: 'Workflow', text: 'New draft revision with full line history retained', tone: 'info' }]} onConfirm={revise} />
    </div>
  );
}
