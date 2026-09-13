// Projects module settings — additive keys stored on company.defaults.
import { useState } from 'react';
import { db, C, nav, useSession } from '../../store';
import type { Company } from '../../store';
import { PageHeader, ScopeLine, Card, Button, PercentField, SelectField, Toggle, useToast, Banner, KV, Badge } from '../../components/ui';
import type { ProjectsSettings, RateCard, RevenueMethod } from './types';
import { useRows, useSettings } from './data';
import { Muted } from './shared';

export default function Settings() {
  const s = useSession();
  const toast = useToast();
  const current = useSettings();
  const rateCards = useRows<RateCard>(C.rateCards);
  const items = db.where<any>(C.items, (i) => i.type === 'Service' && i.status === 'Active');
  const [f, setF] = useState<ProjectsSettings>(current);
  const [dirty, setDirty] = useState(false);
  const can = s.can('projects.settings.edit') || s.can('projects.*') || s.can('admin.company.edit');
  const set = (p: Partial<ProjectsSettings>) => { setF((x) => ({ ...x, ...p })); setDirty(true); };
  const save = () => {
    const co = s.company;
    if (!co) return;
    try {
      db.update<Company>(C.companies, co.id, { defaults: { ...co.defaults, ...f } as Company['defaults'] });
      toast.success('Projects settings saved');
      setDirty(false);
    } catch (e: any) { toast.error(e.message); }
  };
  return (
    <div className="page">
      <PageHeader title="Projects settings" subtitle={<ScopeLine extra="stored on the company defaults" />} actions={<><Button variant="ghost" onClick={() => { setF(current); setDirty(false); }} disabled={!dirty}>Discard changes</Button><Button variant="primary" onClick={save} disabled={!dirty || !can} reason={!can ? 'Requires projects.settings.edit' : !dirty ? 'No changes' : undefined} data-testid="save-settings">Save settings</Button></>} />
      {!can && <Banner tone="warning">You can view these settings but not change them.</Banner>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="Costing & profitability">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PercentField label="Allocated overhead" value={f.prjOverheadPct} onChange={(v) => set({ prjOverheadPct: v })} disabled={!can} help="Percentage of resource cost added as overhead in the profitability report" />
            <PercentField label="Default expense markup" value={f.prjExpenseMarkupPct} onChange={(v) => set({ prjExpenseMarkupPct: v })} disabled={!can} help="Pre-filled when flagging a claim line billable" />
          </div>
        </Card>
        <Card title="Billing & revenue">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SelectField label="Default rate card" value={f.prjDefaultRateCardId ?? ''} onChange={(v) => set({ prjDefaultRateCardId: v || undefined })} options={rateCards.map((r) => ({ value: r.id, label: `${r.name} (${r.currency})` }))} allowEmpty placeholder="— None —" disabled={!can} help="Used when a contract has no rate card and no per-role rates" />
            <SelectField label="Default service item" value={f.prjDefaultServiceItemId ?? ''} onChange={(v) => set({ prjDefaultServiceItemId: v || undefined })} options={items.map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` }))} allowEmpty disabled={!can} help="Line item used on generated invoices when a contract sets none" />
            <SelectField label="Default revenue method" value={f.prjRevenueMethodDefault} onChange={(v) => set({ prjRevenueMethodDefault: v as RevenueMethod })} options={[{ value: 'Auto', label: 'Auto (by billing method)' }, { value: 'Hours', label: 'Approved hours × rate' }, { value: 'Percent complete', label: '% complete' }, { value: 'Milestone', label: 'On milestone achievement' }, { value: 'Straight-line', label: 'Straight-line over term' }, { value: 'Usage', label: 'Recorded usage' }]} disabled={!can} />
            <Toggle on={f.prjRetainerAutoApply} onChange={(v) => set({ prjRetainerAutoApply: v })} disabled={!can} label="Apply retainers automatically in billing runs" help="Pre-ticks the option on the billing run page" />
          </div>
        </Card>
        <Card title="Timesheets & approval">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SelectField label="Week starts on" value={f.prjWeekStart} onChange={(v) => set({ prjWeekStart: v as 'Mon' | 'Sun' })} options={[{ value: 'Mon', label: 'Monday' }, { value: 'Sun', label: 'Sunday' }]} disabled={!can} help="Controls the weekly timesheet grid" />
            <Toggle on={f.prjTimesheetApproval} onChange={(v) => set({ prjTimesheetApproval: v })} disabled={!can} label="Require timesheet approval" help="When off, submitted timesheets are approved immediately (no workflow)" />
            <Toggle on={f.prjContractApproval} onChange={(v) => set({ prjContractApproval: v })} disabled={!can} label="Route contracts for approval" help="Contracts still follow a Contract workflow rule when one exists; with no rule they are auto-approved" />
          </div>
        </Card>
        <Card title="Accounts used">
          <KV items={[
            { k: 'Service revenue', v: acc('acc_4010') },
            { k: 'Unbilled (accrued)', v: acc('acc_1160') },
            { k: 'Deferred revenue', v: acc('acc_2400') },
            { k: 'Retainers received', v: acc('acc_2160') },
            { k: 'Receivables', v: acc(s.company?.defaults.receivableAccountId ?? 'acc_1100') },
            { k: 'Resource cost basis', v: 'Resource cost rate × approved hours (salaries remain in payroll)' },
          ]} />
          <Muted>Accounts are fixed by the chart of accounts; change them under Accounting › Chart of accounts.</Muted>
          <div style={{ marginTop: 10 }}><Button variant="secondary" size="sm" onClick={() => nav.go('accounting/coa')}>Open chart of accounts</Button></div>
        </Card>
      </div>
      <Card title="Workflow rules that apply">
        <table className="data-table dense">
          <thead><tr><th>Document</th><th>Rule</th><th>Steps</th><th>Status</th></tr></thead>
          <tbody>
            {['Timesheet', 'Contract'].map((docType) => {
              const rule = db.findBy<any>(C.workflowRules, (w) => w.docType === docType && w.status === 'Active' && w.companyId === s.state.companyId);
              return (
                <tr key={docType}>
                  <td>{docType}</td>
                  <td>{rule ? `${rule.code} · ${rule.name}` : <Muted>No rule — documents are auto-approved</Muted>}</td>
                  <td>{rule ? rule.steps.map((x: any) => x.approverLabel).join(' → ') : '—'}</td>
                  <td><Badge status={rule ? 'Active' : 'Inactive'}>{rule ? 'Active' : 'None'}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 10 }}><Button variant="secondary" size="sm" onClick={() => nav.go('admin/workflows')}>Manage workflows</Button></div>
      </Card>
      {dirty && <Banner tone="info">Unsaved changes — settings apply to {s.company?.tradeName} only.</Banner>}
      <Muted>Overhead currently adds {f.prjOverheadPct}% of resource cost to every project&apos;s cost in the profitability report.</Muted>
    </div>
  );
}

function acc(id: string) {
  const a = db.find<any>(C.accounts, id);
  return a ? `${a.code} · ${a.name}` : id;
}
