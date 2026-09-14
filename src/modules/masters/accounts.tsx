// Chart of accounts (FR-ACC-001/002): grouped register with balances, account form, group editor.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useSession } from '../../store';
import type { Account, AccountGroup, Currency } from '../../store';
import { Badge, Button, CheckboxField, ChipGroup, Drawer, ImportWizard, Money, MoneyField, RegisterPage, SelectField, TextField, TwoLine, useToast } from '../../components/ui';
import { validateIFSC } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, bulkStatusActions, findDuplicates, masterRowActions, referenceCount, saveMaster, useForm } from './shared';
import { accountImport } from './importDefs';

const TYPES: Account['type'][] = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];
const CONTROL_TYPES: NonNullable<Account['controlType']>[] = ['AR', 'AP', 'Bank', 'Cash', 'Inventory', 'Tax', 'Employee', 'FixedAsset', 'WIP'];
const DIMENSION_TYPES = ['Department', 'CostCentre', 'ProfitCentre', 'Project', 'ProductLine', 'Employee', 'Customer', 'Supplier'];

export function AccountRegister() {
  const s = useSession();
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId);
  const groups = useCollection<AccountGroup>(C.accountGroups).filter((g) => g.companyId === s.state.companyId).sort((a, b) => a.order - b.order);
  const journals = useCollection<any>(C.journals);
  const [editing, setEditing] = useState<Account | null | 'new'>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [rules, setRules] = useState(false);
  const [imp, setImp] = useState(false);
  const canEdit = s.can('masters.accounts.edit') || s.can('masters.accounts.create') || s.can('accounting.coa.*') || s.can('masters.*');
  const balances = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, engine.accountBalance(a.id)])), [accounts, journals]);
  const rows = useMemo(() => [...accounts].sort((a, b) => ((groups.find((g) => g.id === a.groupId)?.order ?? 99) - (groups.find((g) => g.id === b.groupId)?.order ?? 99)) || a.code.localeCompare(b.code)), [accounts, groups]);
  const totals = TYPES.map((t) => ({ t, n: accounts.filter((a) => a.type === t && a.status === 'Active').length, net: accounts.filter((a) => a.type === t).reduce((sum, a) => sum + (balances[a.id]?.net ?? 0), 0) }));
  return (
    <>
      <RegisterPage<Account>
        title="Chart of accounts"
        subtitle={`${accounts.filter((a) => a.status === 'Active').length} active accounts in ${groups.length} groups · balances as of today · ${s.currency}`}
        entity="accounts"
        rows={rows}
        searchKeys={['code', 'name', 'subType']}
        tabs={[{ id: 'all', label: 'All', filter: () => true }, ...TYPES.map((t) => ({ id: t, label: t === 'Income' ? 'Income' : t === 'Expense' ? 'Expenses' : t === 'Asset' ? 'Assets' : t === 'Liability' ? 'Liabilities' : 'Equity', filter: (r: Account) => r.type === t })), { id: 'control', label: 'Control', filter: (r) => r.isControl }, { id: 'inactive', label: 'Inactive', filter: (r) => r.status !== 'Active' }]}
        filters={[{ key: 'groupId', label: 'Group', type: 'select', options: groups.map((g) => ({ value: g.id, label: g.name })) }, { key: 'controlType', label: 'Control type', type: 'select', options: CONTROL_TYPES.map((c) => ({ value: c, label: c })) }, { key: 'posting', label: 'Posting', type: 'select', options: [{ value: 'yes', label: 'Posting allowed' }, { value: 'no', label: 'Header / no posting' }] }]}
        applyFilter={(r, f) => (!f.groupId || r.groupId === f.groupId) && (!f.controlType || r.controlType === f.controlType) && (!f.posting || (f.posting === 'yes' ? r.postingAllowed : !r.postingAllowed))}
        primaryAction={{ label: 'New account', onClick: () => setEditing('new'), disabled: !canEdit, reason: canEdit ? undefined : 'Requires chart-of-accounts permission' }}
        importAction={() => setImp(true)}
        actions={<><Button variant="secondary" onClick={() => setGroupsOpen(true)}>Account groups</Button><Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button></>}
        headerExtra={<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{totals.map((t) => <span key={t.t} className="pill pill-neutral" title={`${t.n} active accounts`}>{t.t}: <Money value={t.net} currency={s.currency} compact /></span>)}</div>}
        onRowClick={(r) => setEditing(r)}
        rowActions={(r) => masterRowActions({ collection: C.accounts, objectType: 'Account', row: r, canEdit, onEdit: () => setEditing(r), extra: [{ label: 'Account ledger', onClick: () => nav.go(`accounting/ledger?account=${r.id}`) }, { label: 'Trial balance', onClick: () => nav.go('accounting/trial-balance') }] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.accounts, 'Account', ids, sel, canEdit)}
        columns={[
          { key: 'code', label: 'Code', sortable: true, width: 90, render: (r) => <span className="identifier" style={{ fontWeight: 600 }}>{r.code}</span> },
          { key: 'name', label: 'Account', sortable: true, render: (r) => <TwoLine primary={<span className="link">{r.name}</span>} secondary={[groups.find((g) => g.id === r.groupId)?.name, r.subType].filter(Boolean).join(' · ')} /> },
          { key: 'type', label: 'Type', render: (r) => <span>{r.type} <span style={{ color: 'var(--ink-3)', fontSize: 11 }}>· {r.normalBalance}</span></span> },
          { key: 'flags', label: 'Flags', render: (r) => <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>{r.isControl && <span className="pill pill-warning" title="Control account — manual postings need a party">Control · {r.controlType}</span>}{!r.postingAllowed && <span className="pill pill-neutral">Header</span>}{r.currencyBehaviour !== 'Base' && <span className="currency-tag">{r.currencyBehaviour === 'Fixed' ? r.fixedCurrency : 'Any ccy'}</span>}{r.requiredDimensions.length > 0 && <span className="pill pill-neutral" title={`Requires ${r.requiredDimensions.join(', ')}`}>Dims: {r.requiredDimensions.join(', ')}</span>}</span> },
          { key: 'opening', label: 'Opening', align: 'right', render: (r) => (r.openingBalance ? <Money value={r.openingBalance} currency={s.currency} /> : '—'), value: (r) => r.openingBalance ?? 0 },
          { key: 'balance', label: 'Balance', align: 'right', sortable: true, render: (r) => { const b = balances[r.id]; return b ? <span className="money">{b.net === 0 ? '0.00' : <Money value={Math.abs(b.net)} currency={s.currency} />}<span style={{ color: 'var(--ink-3)', fontSize: 11, marginLeft: 4 }}>{b.net === 0 ? '' : b.net > 0 ? r.normalBalance : r.normalBalance === 'Dr' ? 'Cr' : 'Dr'}</span></span> : '—'; }, value: (r) => balances[r.id]?.net ?? 0 },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
        rowClass={(r) => (r.status !== 'Active' ? 'muted' : undefined)}
      />
      {editing && <AccountForm account={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {groupsOpen && <GroupEditor onClose={() => setGroupsOpen(false)} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="accounts" entityLabel="Chart of accounts" candidateFields={['code', 'name']} />
      <ImportWizard open={imp} onClose={() => setImp(false)} {...accountImport(accounts)} />
    </>
  );
}

export function AccountForm({ account, onClose }: { account?: Account; onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId);
  const groups = useCollection<AccountGroup>(C.accountGroups).filter((g) => g.companyId === s.state.companyId).sort((a, b) => a.order - b.order);
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active');
  const f = useForm<any>(account ? { ...account, bankDetails: account.bankDetails ? { ...account.bankDetails } : { bankName: '', accountNumber: '', ifsc: '', branch: '', currency: s.currency } } : { code: '', name: '', groupId: groups[0]?.id, type: groups[0]?.type ?? 'Asset', subType: '', normalBalance: 'Dr', isControl: false, controlType: undefined, postingAllowed: true, currencyBehaviour: 'Base', fixedCurrency: undefined, requiredDimensions: [], prohibitedDimensions: [], status: 'Active', openingBalance: 0, isBank: false, bankDetails: { bankName: '', accountNumber: '', ifsc: '', branch: '', currency: s.currency } });
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [tab, setTab] = useState<'form' | 'history'>('form');
  const dups = useMemo(() => findDuplicates('accounts', accounts, f.v, account?.id), [accounts, f.v.code, f.v.name]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const postings = account ? referenceCount(account.id, C.accounts) : 0;
  const setGroup = (gid: string) => { const g = groups.find((x) => x.id === gid); f.patch({ groupId: gid, type: g?.type ?? f.v.type, normalBalance: g ? (g.type === 'Asset' || g.type === 'Expense' ? 'Dr' : 'Cr') : f.v.normalBalance }); };
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.code.trim()) e.code = 'Code is required';
    else if (!/^\d{4,6}$/.test(f.v.code)) e.code = 'Code should be 4–6 digits';
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (!f.v.groupId) e.groupId = 'Group is required';
    if (f.v.isControl && !f.v.controlType) e.controlType = 'Choose the control type';
    if (f.v.currencyBehaviour === 'Fixed' && !f.v.fixedCurrency) e.fixedCurrency = 'Choose the fixed currency';
    if (f.v.requiredDimensions.some((d: string) => f.v.prohibitedDimensions.includes(d))) e.requiredDimensions = 'A dimension cannot be both required and prohibited';
    if (f.v.isBank && f.v.bankDetails.ifsc && validateIFSC(f.v.bankDetails.ifsc)) e.bankDetails = validateIFSC(f.v.bankDetails.ifsc)!;
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const values = { ...f.v, subType: f.v.subType || undefined, controlType: f.v.isControl ? f.v.controlType : undefined, fixedCurrency: f.v.currencyBehaviour === 'Fixed' ? f.v.fixedCurrency : undefined, bankDetails: f.v.isBank ? f.v.bankDetails : undefined, openingBalance: f.v.openingBalance || undefined };
      const saved = saveMaster<Account>(C.accounts, 'Account', values, account?.id, { expectedVersion: account?.version, label: (a) => `${a.code} · ${a.name}` });
      toast.success(`Account ${saved.code} ${account ? 'updated' : 'created'}`);
      onClose();
    } catch (err: any) { toast.error(err?.message ?? 'Could not save account'); setSaving(false); }
  };
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
  return (
    <Drawer open onClose={onClose} title={account ? `${account.code} · ${account.name}` : 'New account'} subtitle="FR-ACC-001 · type, normal balance, currency behaviour, posting eligibility, control flag, dimension rules" width={760}
      headerRight={account && <div style={{ display: 'flex' }}>{(['form', 'history'] as const).map((t) => <button key={t} type="button" className={`filter-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{t === 'form' ? 'Details' : 'Change history'}</button>)}</div>}
      footer={tab === 'form' ? <DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={account ? 'Save account' : 'Create account'} disabled={blocked} reason={blocked ? 'Duplicate blocked' : undefined} left={account ? <Button variant="ghost" onClick={() => nav.go(`accounting/ledger?account=${account.id}`)}>View ledger</Button> : undefined} /> : undefined}>
      {tab === 'history' && account ? <ChangeHistory objectId={account.id} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <ErrorSummary errors={f.errors} />
          <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} labelOf={(a) => `${a.code} · ${a.name}`} />
          {postings > 0 && <div className="banner info">Referenced by {postings} posted document{postings === 1 ? '' : 's'} — type, normal balance and control flag are locked to protect the ledger.</div>}
          <div style={grid}>
            <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.replace(/\D/g, ''))} error={f.errors.code} disabled={postings > 0} />
            <TextField label="Name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
            <SelectField label="Group" required value={f.v.groupId ?? ''} onChange={setGroup} options={groups.map((g) => ({ value: g.id, label: `${g.code} · ${g.name} (${g.type})` }))} error={f.errors.groupId} disabled={postings > 0} />
            <TextField label="Sub-type" value={f.v.subType} onChange={(v) => f.set('subType', v)} help="Optional classification, e.g. Current asset, Direct expense" />
            <SelectField label="Type" value={f.v.type} onChange={(v) => f.set('type', v)} options={TYPES} disabled={postings > 0} />
            <SelectField label="Normal balance" value={f.v.normalBalance} onChange={(v) => f.set('normalBalance', v)} options={['Dr', 'Cr']} disabled={postings > 0} help={f.v.type === 'Asset' && f.v.normalBalance === 'Cr' ? 'Contra-asset (e.g. accumulated depreciation)' : undefined} />
            <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive']} />
            <MoneyField label="Opening balance" value={f.v.openingBalance ?? 0} onChange={(v) => f.set('openingBalance', v)} currency={s.currency} help={`On the ${f.v.normalBalance} side as of ${s.company?.openingBalanceDate ?? 'books start'}`} />
          </div>
          <section>
            <div className="section-title">Posting rules</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <CheckboxField checked={f.v.postingAllowed} onChange={(v) => f.set('postingAllowed', v)} label="Posting allowed" help="Header / summary accounts reject every posting" />
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <CheckboxField checked={f.v.isControl} onChange={(v) => f.set('isControl', v)} label="Control account" help="Sub-ledger driven — manual journals must name a party (FR-ACC-002)" disabled={postings > 0} />
                {f.v.isControl && <SelectField label="Control type" value={f.v.controlType ?? ''} onChange={(v) => f.set('controlType', v)} options={CONTROL_TYPES} error={f.errors.controlType} size="sm" style={{ width: 200 }} />}
              </div>
            </div>
          </section>
          <section>
            <div className="section-title">Currency behaviour</div>
            <div style={grid}>
              <SelectField label="Behaviour" value={f.v.currencyBehaviour} onChange={(v) => f.set('currencyBehaviour', v)} options={[{ value: 'Base', label: 'Base currency only' }, { value: 'Any', label: 'Any permitted currency (AR/AP, intercompany)' }, { value: 'Fixed', label: 'Fixed foreign currency (EEFC / foreign bank)' }]} />
              {f.v.currencyBehaviour === 'Fixed' && <SelectField label="Fixed currency" value={f.v.fixedCurrency ?? ''} onChange={(v) => f.set('fixedCurrency', v)} options={currencies.filter((c) => c.code !== s.currency).map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} error={f.errors.fixedCurrency} />}
            </div>
          </section>
          <section>
            <div className="section-title">Dimension rules <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· FR-ACC-004</span></div>
            <ChipGroup label="Required on every posting" multiple value={f.v.requiredDimensions} onChange={(v) => f.set('requiredDimensions', v)} options={DIMENSION_TYPES.map((d) => ({ value: d, label: d }))} />
            <div style={{ height: 10 }} />
            <ChipGroup label="Prohibited" multiple value={f.v.prohibitedDimensions} onChange={(v) => f.set('prohibitedDimensions', v)} options={DIMENSION_TYPES.map((d) => ({ value: d, label: d }))} />
            {f.errors.requiredDimensions && <div className="field-error">{f.errors.requiredDimensions}</div>}
          </section>
          <section>
            <CheckboxField checked={f.v.isBank} onChange={(v) => f.patch({ isBank: v, isControl: v ? true : f.v.isControl, controlType: v ? 'Bank' : f.v.controlType })} label="Bank account" help="Enables reconciliation and payment batches in Banking" />
            {f.v.isBank && (
              <div style={{ ...grid, marginTop: 12 }}>
                <TextField label="Bank" value={f.v.bankDetails.bankName} onChange={(v) => f.set('bankDetails', { ...f.v.bankDetails, bankName: v })} />
                <TextField label="Branch" value={f.v.bankDetails.branch} onChange={(v) => f.set('bankDetails', { ...f.v.bankDetails, branch: v })} />
                <TextField label="Account number" value={f.v.bankDetails.accountNumber} onChange={(v) => f.set('bankDetails', { ...f.v.bankDetails, accountNumber: v.replace(/\D/g, '') })} />
                <TextField label="IFSC" value={f.v.bankDetails.ifsc} onChange={(v) => f.set('bankDetails', { ...f.v.bankDetails, ifsc: v.toUpperCase() })} error={f.errors.bankDetails} uppercase />
                <SelectField label="Account currency" value={f.v.bankDetails.currency} onChange={(v) => f.set('bankDetails', { ...f.v.bankDetails, currency: v })} options={currencies.map((c) => c.code)} />
              </div>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

function GroupEditor({ onClose }: { onClose: () => void }) {
  const s = useSession();
  const toast = useToast();
  const groups = useCollection<AccountGroup>(C.accountGroups).filter((g) => g.companyId === s.state.companyId).sort((a, b) => a.order - b.order);
  const accounts = useCollection<Account>(C.accounts);
  const [draft, setDraft] = useState<Partial<AccountGroup> | null>(null);
  const canEdit = s.can('masters.accounts.edit') || s.can('masters.*');
  const save = () => {
    if (!draft) return;
    if (!draft.code?.trim() || !draft.name?.trim()) { toast.error('Code and name are required'); return; }
    if (groups.some((g) => g.id !== draft.id && g.code.toLowerCase() === draft.code!.trim().toLowerCase())) { toast.error(`Group code ${draft.code} already exists`); return; }
    saveMaster<AccountGroup>(C.accountGroups, 'Account Group', { code: draft.code!.trim().toUpperCase(), name: draft.name!.trim(), type: draft.type ?? 'Asset', order: draft.order ?? (groups[groups.length - 1]?.order ?? 0) + 10, parentId: draft.parentId }, draft.id, { label: (g) => g.code });
    setDraft(null);
  };
  return (
    <Drawer open onClose={onClose} title="Account groups" subtitle="Groups drive statement layout order and the default type of new accounts" width={640}
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" disabled={!canEdit || !!draft} onClick={() => setDraft({ code: '', name: '', type: 'Asset', order: (groups[groups.length - 1]?.order ?? 0) + 10 })}>+ New group</Button></>}>
      <div className="card" style={{ overflow: 'hidden' }}>
        <table className="data-table dense">
          <thead><tr><th>Order</th><th>Code</th><th>Name</th><th>Type</th><th className="right">Accounts</th><th /></tr></thead>
          <tbody>
            {[...groups, ...(draft && !draft.id ? [draft as AccountGroup] : [])].map((g) => {
              const editing = draft && (draft.id === g.id || (!draft.id && !g.id));
              const n = accounts.filter((a) => a.groupId === g.id).length;
              if (editing) return (
                <tr key={g.id ?? 'new'} style={{ background: 'var(--surface-2)' }}>
                  <td><input className="field-input grid num" type="number" value={draft!.order ?? 0} onChange={(e) => setDraft({ ...draft!, order: Number(e.target.value) })} style={{ width: 70 }} /></td>
                  <td><input className="field-input grid" value={draft!.code ?? ''} onChange={(e) => setDraft({ ...draft!, code: e.target.value.toUpperCase() })} style={{ width: 90 }} /></td>
                  <td><input className="field-input grid" value={draft!.name ?? ''} onChange={(e) => setDraft({ ...draft!, name: e.target.value })} autoFocus /></td>
                  <td><select className="field-input grid" value={draft!.type} onChange={(e) => setDraft({ ...draft!, type: e.target.value as AccountGroup['type'] })} disabled={n > 0}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></td>
                  <td className="right">{n || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="primary" onClick={save}>Save</Button> <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></td>
                </tr>
              );
              return (
                <tr key={g.id}>
                  <td className="identifier">{g.order}</td>
                  <td className="identifier" style={{ fontWeight: 600 }}>{g.code}</td>
                  <td>{g.name}</td>
                  <td>{g.type}</td>
                  <td className="right">{n || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setDraft({ ...g })}>Edit</Button>
                    <Button size="sm" variant="ghost" disabled={!canEdit || n > 0} title={n > 0 ? `${n} accounts use this group` : undefined} style={{ color: 'var(--danger)' }} onClick={() => { db.remove(C.accountGroups, g.id); engine.audit({ action: 'account_group.deleted', objectType: 'Account Group', objectId: g.id, objectNumber: g.code, before: g as unknown as Record<string, unknown> }); }}>Delete</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Drawer>
  );
}
