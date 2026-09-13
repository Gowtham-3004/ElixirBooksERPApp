// Group structure (FR-CNS-001): the group card, its members with ownership dates and method,
// each member's independent trial-balance check, consolidation currency / standard and the rate policy.
import { useMemo, useState } from 'react';
import { db, C, nav, useCollection, useSession } from '../../../store';
import type { Account, Company, Journal } from '../../../store';
import {
  Badge, Banner, Button, Card, ConfirmDialog, DataTable, Drawer, EmptyState, KV, KpiTile, Money, PageHeader, Pill,
  SelectField, PercentField, TextField, TextArea, SectionLabel, useToast, type Column,
} from '../../../components/ui';
import { fmtDate, fmtMoney } from '../../../lib/format';
import { activeGroup, booksCheck, companyName, consolidatedChart, tenantCompanies, IC_RULE } from './lib';
import type { ConsolidationMethod, Group, GroupMember, RateType } from './types';

const METHODS: ConsolidationMethod[] = ['Full', 'Proportional', 'Equity'];
const RATE_TYPES: RateType[] = ['Closing', 'Average', 'Historical'];

export function GroupStructure() {
  const s = useSession();
  const groups = useCollection<Group>(C.groups);
  const journals = useCollection<Journal>(C.journals);
  const accounts = useCollection<Account>(C.accounts);
  const toast = useToast();
  const group = useMemo(() => activeGroup(), [groups, s.state.companyId]);
  const [edit, setEdit] = useState<{ member?: GroupMember; index: number } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [removeIdx, setRemoveIdx] = useState<number | null>(null);
  const canEdit = s.can('reports.consolidation.manage') || s.can('accounting.consolidation.manage') || s.isTenantOwner || s.can('reports.view');

  const checks = useMemo(
    () => (group?.members ?? []).map((m) => ({ member: m, check: booksCheck(m.companyId) })),
    [group, journals, accounts],
  );
  const unbalanced = checks.filter((c) => !c.check.balanced);

  if (!group) {
    return (
      <div className="page">
        <PageHeader title="Group structure" subtitle="Define a group of independently balanced legal companies (FR-CNS-001)" />
        <EmptyState title="No group defined yet" description="A group names the parent company, the consolidation currency and the member companies with their ownership periods." icon="🏛" />
      </div>
    );
  }

  const saveMember = (m: GroupMember, index: number) => {
    const members = index < 0 ? [...group.members, m] : group.members.map((x, i) => (i === index ? m : x));
    db.update<Group>(C.groups, group.id, { members }, { expectedVersion: group.version });
    toast.success(`${companyName(m.companyId)} saved in ${group.name}`);
    setEdit(null);
  };

  const cols: Column<{ member: GroupMember; check: ReturnType<typeof booksCheck> }>[] = [
    { key: 'company', label: 'Company', render: (r) => { const co = db.find<Company>(C.companies, r.member.companyId); return (<div><div style={{ fontWeight: 600 }}>{co?.tradeName ?? r.member.companyId}</div><div style={{ fontSize: 12, color: '#5F6368' }}>{co?.legalName}{co?.code ? ` · ${co.code}` : ''}{r.member.companyId === group.parentCompanyId ? ' · Parent' : ''}</div></div>); }, value: (r) => companyName(r.member.companyId) },
    { key: 'country', label: 'Country', render: (r) => db.find<Company>(C.companies, r.member.companyId)?.country ?? '—' },
    { key: 'pack', label: 'Localization', render: (r) => { const co = db.find<Company>(C.companies, r.member.companyId); return co ? `${co.localizationPack} ${co.localizationVersion}` : '—'; } },
    { key: 'currency', label: 'Base currency', render: (r) => <span className="identifier">{db.find<Company>(C.companies, r.member.companyId)?.baseCurrency ?? '—'}</span> },
    { key: 'fy', label: 'Financial year', render: (r) => { const m = db.find<Company>(C.companies, r.member.companyId)?.fiscalYearStartMonth ?? 4; return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} – ${['Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][m - 1]}`; } },
    { key: 'ownership', label: 'Ownership', align: 'right', render: (r) => `${r.member.ownershipPct}%`, value: (r) => r.member.ownershipPct },
    { key: 'method', label: 'Method', render: (r) => <Badge status={r.member.method === 'Full' ? 'Active' : r.member.method === 'Proportional' ? 'Partial' : 'Open'}>{r.member.method}</Badge> },
    { key: 'from', label: 'From', render: (r) => fmtDate(r.member.from) },
    { key: 'to', label: 'To', render: (r) => (r.member.to ? fmtDate(r.member.to) : '—') },
    { key: 'tb', label: 'Independent trial balance', render: (r) => (
      <div style={{ fontSize: 12 }}>
        <div>{r.check.balanced ? <Pill tone="good">Balanced</Pill> : <Pill tone="critical">Out by {fmtMoney(r.check.difference, db.find<Company>(C.companies, r.member.companyId)?.baseCurrency ?? 'INR')}</Pill>}</div>
        <div style={{ color: '#5F6368', marginTop: 2 }}>Dr {fmtMoney(r.check.totalDr, db.find<Company>(C.companies, r.member.companyId)?.baseCurrency ?? 'INR')} · {r.check.accounts} accounts · {r.check.journals} journals</div>
      </div>
    ) },
  ];

  const chart = consolidatedChart(group);

  return (
    <div className="page">
      <PageHeader
        title="Group structure"
        subtitle={<>Group hierarchy of independently balanced legal companies · consolidation currency <span className="identifier">{group.consolidationCurrency}</span> · {group.accountingStandard} (FR-CNS-001)</>}
        actions={<>
          <Button variant="secondary" onClick={() => setPolicyOpen(true)}>Edit rate policy</Button>
          <Button variant="primary" onClick={() => setEdit({ index: -1 })} disabled={!canEdit} reason={!canEdit ? 'Requires Finance role' : undefined}>Add member company</Button>
        </>}
      />

      <div className="grid-4">
        <KpiTile label="Members" value={String(group.members.length)} sub={`${group.members.filter((m) => m.method === 'Full').length} fully consolidated`} />
        <KpiTile label="Consolidation currency" value={group.consolidationCurrency} sub={`Parent ${companyName(group.parentCompanyId)}`} />
        <KpiTile label="Accounting standard" value={group.accountingStandard} sub={`Rate policy: income ${group.ratePolicy.income} · balance ${group.ratePolicy.balance} · equity ${group.ratePolicy.equity}`} />
        <KpiTile label="Chart of accounts" value={String(chart.length)} sub="Union of member charts + consolidation-only accounts" />
      </div>

      {unbalanced.length > 0
        ? <Banner tone="warning">{unbalanced.map((u) => companyName(u.member.companyId)).join(', ')} does not balance independently — a group may only consolidate companies whose own trial balance balances (FR-CNS-001).</Banner>
        : <Banner tone="success">Every member balances independently: each company keeps its own ledgers, periods, banks and number series and is consolidated read-only (FR-CNS-001, FR-FX-014).</Banner>}

      <Card title={<span>{group.name} <span className="identifier" style={{ fontSize: 12, color: '#6E6E71', marginLeft: 6 }}>{group.code}</span></span>} padding={0}>
        <DataTable
          rows={checks}
          columns={cols}
          rowKey={(r) => r.member.companyId}
          dense
          rowActions={(r) => [
            { label: 'Edit member', onClick: () => setEdit({ member: r.member, index: group.members.findIndex((m) => m.companyId === r.member.companyId) }) },
            { label: 'Open trial balance', onClick: () => nav.go('reports/consolidation/drilldown', { company: r.member.companyId }) },
            { label: 'Remove from group', danger: true, disabled: r.member.companyId === group.parentCompanyId, reason: r.member.companyId === group.parentCompanyId ? 'Parent company' : undefined, onClick: () => setRemoveIdx(group.members.findIndex((m) => m.companyId === r.member.companyId)) },
          ]}
        />
      </Card>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Card title="Rate policy (FR-RPT-013)" actions={<Button variant="link" onClick={() => setPolicyOpen(true)}>Edit</Button>}>
          <KV items={[
            { k: 'Income statement', v: <>{group.ratePolicy.income} rate</> },
            { k: 'Balance sheet', v: <>{group.ratePolicy.balance} rate</> },
            { k: 'Equity', v: <>{group.ratePolicy.equity} rate</> },
            { k: 'Account overrides', v: Object.keys(group.ratePolicy.accountOverrides ?? {}).length ? Object.entries(group.ratePolicy.accountOverrides).map(([code, t]) => <span key={code} className="dim-chip" style={{ marginRight: 6 }}>{code} → {t}</span>) : '—' },
          ]} />
          <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 10 }}>The translation adjustment arising from using different rates for different lines is disclosed as its own CTA line on every run (FR-RPT-013).</div>
        </Card>
        <Card title="Legal-entity boundary">
          <div style={{ fontSize: 13, color: '#0A0A0A', lineHeight: 1.6 }}>{IC_RULE}</div>
          <div style={{ marginTop: 12 }}>
            <Button variant="secondary" size="sm" onClick={() => nav.go('reports/consolidation/intercompany')}>Open intercompany matching</Button>
          </div>
          {group.notes && <div style={{ fontSize: 12, color: '#6E6E71', marginTop: 12 }}>{group.notes}</div>}
        </Card>
      </div>

      <MemberDrawer open={!!edit} group={group} member={edit?.member} index={edit?.index ?? -1} onClose={() => setEdit(null)} onSave={saveMember} />
      <RatePolicyDrawer open={policyOpen} group={group} onClose={() => setPolicyOpen(false)} />
      <ConfirmDialog
        open={removeIdx !== null}
        onClose={() => setRemoveIdx(null)}
        title={`Remove ${removeIdx !== null ? companyName(group.members[removeIdx]?.companyId) : ''} from ${group.name}?`}
        statement="The company keeps every journal, period and bank account it has. Only its membership of this group is removed."
        consequences={[
          { engine: 'Journal', text: 'No journal is created, changed or deleted in any legal company', tone: 'success' },
          { engine: 'Workflow', text: 'Existing finalized runs keep the figures they were finalized with', tone: 'info' },
        ]}
        reasonRequired
        confirmLabel="Remove member"
        cancelLabel="Keep member"
        danger
        onConfirm={(reason) => {
          if (removeIdx === null) return;
          const m = group.members[removeIdx];
          db.update<Group>(C.groups, group.id, { members: group.members.filter((_, i) => i !== removeIdx), notes: group.notes }, { expectedVersion: group.version });
          toast.success(`${companyName(m.companyId)} removed — ${reason}`);
          setRemoveIdx(null);
        }}
      />
    </div>
  );
}

function MemberDrawer({ open, group, member, index, onClose, onSave }: { open: boolean; group: Group; member?: GroupMember; index: number; onClose: () => void; onSave: (m: GroupMember, index: number) => void }) {
  const companies = useMemo(() => tenantCompanies(), [open]);
  const [companyId, setCompanyId] = useState(member?.companyId ?? '');
  const [pct, setPct] = useState(member?.ownershipPct ?? 100);
  const [method, setMethod] = useState<ConsolidationMethod>(member?.method ?? 'Full');
  const [from, setFrom] = useState(member?.from ?? '2026-01-01');
  const [to, setTo] = useState(member?.to ?? '');
  const [err, setErr] = useState<string | null>(null);
  const key = `${open}-${member?.companyId ?? 'new'}`;
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setCompanyId(member?.companyId ?? '');
    setPct(member?.ownershipPct ?? 100);
    setMethod(member?.method ?? 'Full');
    setFrom(member?.from ?? '2026-01-01');
    setTo(member?.to ?? '');
    setErr(null);
  }
  const taken = new Set(group.members.filter((_, i) => i !== index).map((m) => m.companyId));
  const options = companies.filter((c) => !taken.has(c.id)).map((c) => ({ value: c.id, label: `${c.tradeName} · ${c.country} · ${c.baseCurrency}` }));
  const check = companyId ? booksCheck(companyId) : null;
  const submit = () => {
    if (!companyId) { setErr('Choose a company from this tenant'); return; }
    if (!(pct > 0 && pct <= 100)) { setErr('Ownership must be between 0 and 100 percent'); return; }
    if (to && to < from) { setErr('Ownership end date must be after the start date'); return; }
    onSave({ companyId, ownershipPct: pct, method, from, to: to || undefined }, index);
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={index < 0 ? 'Add member company' : `Edit ${companyName(companyId)}`}
      subtitle={`${group.name} · consolidated in ${group.consolidationCurrency}`}
      width={560}
      footer={<><Button variant="secondary" onClick={onClose}>Keep group as is</Button><Button variant="primary" onClick={submit}>{index < 0 ? 'Add member' : 'Save member'}</Button></>}
    >
      {err && <Banner tone="danger">{err}</Banner>}
      <SelectField label="Company" required value={companyId} onChange={setCompanyId} options={options} placeholder="— Select a company in this tenant —" disabled={index >= 0} help="Only companies of this tenant can join the group; each keeps its own ledgers and periods." />
      <div className="grid-2" style={{ marginTop: 12 }}>
        <PercentField label="Ownership %" required value={pct} onChange={setPct} min={0} max={100} />
        <SelectField label="Consolidation method" required value={method} onChange={(v) => setMethod(v as ConsolidationMethod)} options={METHODS} help={method === 'Full' ? 'Line-by-line, 100% of balances' : method === 'Proportional' ? 'Line-by-line at the ownership share' : 'Single investment line + share of profit'} />
      </div>
      <div className="grid-2" style={{ marginTop: 12 }}>
        <div><label className="field-label">Owned from<span className="req">*</span></label><input type="date" className="field-input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="field-label">Owned to</label><input type="date" className="field-input" value={to} onChange={(e) => setTo(e.target.value)} /><div className="field-help">Leave empty while still owned</div></div>
      </div>
      {check && (
        <div style={{ marginTop: 16 }}>
          <SectionLabel>Independent balancing check</SectionLabel>
          <Card padding={12} style={{ marginTop: 6 }}>
            <KV items={[
              { k: 'Accounts', v: String(check.accounts) },
              { k: 'Posted journals', v: String(check.journals) },
              { k: 'Total debits', v: <Money value={check.totalDr} currency={db.find<Company>(C.companies, companyId)?.baseCurrency ?? 'INR'} code /> },
              { k: 'Total credits', v: <Money value={check.totalCr} currency={db.find<Company>(C.companies, companyId)?.baseCurrency ?? 'INR'} code /> },
              { k: 'Result', v: check.balanced ? <Pill tone="good">Balanced</Pill> : <Pill tone="critical">Out by {fmtMoney(check.difference)}</Pill> },
            ]} />
          </Card>
        </div>
      )}
    </Drawer>
  );
}

function RatePolicyDrawer({ open, group, onClose }: { open: boolean; group: Group; onClose: () => void }) {
  const toast = useToast();
  const [income, setIncome] = useState<RateType>(group.ratePolicy.income);
  const [balance, setBalance] = useState<RateType>(group.ratePolicy.balance);
  const [equity, setEquity] = useState<RateType>(group.ratePolicy.equity);
  const [standard, setStandard] = useState(group.accountingStandard);
  const [currency, setCurrency] = useState(group.consolidationCurrency);
  const [notes, setNotes] = useState(group.notes ?? '');
  const [overrides, setOverrides] = useState<Record<string, RateType>>({ ...(group.ratePolicy.accountOverrides ?? {}) });
  const [newCode, setNewCode] = useState('');
  const [newType, setNewType] = useState<RateType>('Historical');
  const chart = useMemo(() => consolidatedChart(group), [group, open]);
  const currencies = Array.from(new Set(['INR', 'AED', 'USD', ...group.members.map((m) => db.find<Company>(C.companies, m.companyId)?.baseCurrency ?? 'INR')]));
  const save = () => {
    db.update<Group>(C.groups, group.id, { consolidationCurrency: currency, accountingStandard: standard, notes, ratePolicy: { income, balance, equity, accountOverrides: overrides } }, { expectedVersion: group.version });
    toast.success('Rate policy saved — re-translate open runs to apply it');
    onClose();
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Rate policy & consolidation basis"
      subtitle="Applied on the next translation; finalized runs keep the rates they were translated with (FR-RPT-013)"
      width={640}
      footer={<><Button variant="secondary" onClick={onClose}>Keep current policy</Button><Button variant="primary" onClick={save}>Save rate policy</Button></>}
    >
      <div className="grid-2">
        <SelectField label="Consolidation currency" value={currency} onChange={setCurrency} options={currencies} />
        <SelectField label="Accounting standard" value={standard} onChange={(v) => setStandard(v as Group['accountingStandard'])} options={['Ind AS', 'IFRS']} />
      </div>
      <div className="grid-3" style={{ marginTop: 12 }}>
        <SelectField label="Income statement" value={income} onChange={(v) => setIncome(v as RateType)} options={RATE_TYPES} help="Usually Average" />
        <SelectField label="Balance sheet" value={balance} onChange={(v) => setBalance(v as RateType)} options={RATE_TYPES} help="Usually Closing" />
        <SelectField label="Equity" value={equity} onChange={(v) => setEquity(v as RateType)} options={RATE_TYPES} help="Usually Historical" />
      </div>
      <div style={{ marginTop: 18 }}>
        <SectionLabel>Account-specific overrides</SectionLabel>
        <table className="data-table dense" style={{ marginTop: 6 }}>
          <thead><tr><th>Account</th><th>Rate</th><th style={{ width: 40 }} /></tr></thead>
          <tbody>
            {Object.entries(overrides).map(([code, t]) => (
              <tr key={code}>
                <td><span className="identifier">{code}</span> · {chart.find((c) => c.code === code)?.name ?? 'Account'}</td>
                <td><SelectField value={t} onChange={(v) => setOverrides({ ...overrides, [code]: v as RateType })} options={RATE_TYPES} size="sm" /></td>
                <td><Button variant="ghost" size="sm" onClick={() => { const o = { ...overrides }; delete o[code]; setOverrides(o); }}>Remove</Button></td>
              </tr>
            ))}
            {!Object.keys(overrides).length && <tr><td colSpan={3} style={{ color: '#6E6E71' }}>No overrides — every account uses the policy above.</td></tr>}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginTop: 10 }}>
          <SelectField label="Add account" value={newCode} onChange={setNewCode} options={[{ value: '', label: '— Select account —' }, ...chart.filter((c) => !overrides[c.code]).map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))]} size="sm" style={{ flex: 1 }} />
          <SelectField label="Rate" value={newType} onChange={(v) => setNewType(v as RateType)} options={RATE_TYPES} size="sm" style={{ width: 150 }} />
          <Button variant="secondary" size="sm" onClick={() => { if (newCode) { setOverrides({ ...overrides, [newCode]: newType }); setNewCode(''); } }} disabled={!newCode} reason={!newCode ? 'Choose an account' : undefined}>Add override</Button>
        </div>
      </div>
      <div style={{ marginTop: 16 }}>
        <TextArea label="Policy notes" value={notes} onChange={setNotes} rows={3} placeholder="Disclosed with the consolidated statements" />
      </div>
      <div style={{ marginTop: 12 }}>
        <TextField label="Group name" value={group.name} onChange={() => {}} disabled help="Rename the group from Company administration" />
      </div>
    </Drawer>
  );
}
