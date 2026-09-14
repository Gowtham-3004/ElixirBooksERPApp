// Opening balances (FR-ACC-021): entry grid per account with party breakdown for AR/AP control accounts,
// control-reconciliation panel, "Post opening balances" (delta journal, difference → Opening Balance Equity),
// CSV import via ImportWizard.
import { useEffect, useMemo, useState } from 'react';
import { db, C, engine, useCollection, useRoute, useSession } from '../../store';
import type { Account, AccountGroup, Customer, Journal, OpenItem, Supplier } from '../../store';
import { Badge, Button, ConfirmDialog, ImportWizard, KpiTile, Money, PageHeader, ScopeLine, useToast } from '../../components/ui';
import { addDays, fmtDate, fmtMoney, round, uid } from '../../lib/format';
import { journalLink, settings } from './lib';

interface PartyRow { id: string; partyType: 'Customer' | 'Supplier'; partyId: string; partyName: string; docNumber: string; amount: number; dueDate: string }

/** Effective opening balance today = COA opening + Opening-type journals. */
function effectiveOpening(a: Account, journals: Journal[]): number {
  let v = a.openingBalance ?? 0;
  const sign = a.normalBalance === 'Dr' ? 1 : -1;
  journals.filter((j) => j.type === 'Opening' && (j.status === 'Posted' || j.status === 'Reversed')).forEach((j) => j.lines.forEach((l) => { if (l.accountId === a.id) v += sign * (l.drBase - l.crBase); }));
  return round(v);
}

export function OpeningBalancesPage() {
  const s = useSession();
  const route = useRoute();
  const toast = useToast();
  const accounts = useCollection<Account>(C.accounts).filter((a) => a.companyId === s.state.companyId && a.status === 'Active');
  const groups = useCollection<AccountGroup>(C.accountGroups).filter((g) => g.companyId === s.state.companyId).sort((a, b) => a.order - b.order);
  const journals = useCollection<Journal>(C.journals).filter((j) => j.companyId === s.state.companyId);
  const openItems = useCollection<OpenItem>(C.openItems);
  const customers = useCollection<Customer>(C.customers).filter((c) => c.companyId === s.state.companyId);
  const suppliers = useCollection<Supplier>(C.suppliers).filter((c) => c.companyId === s.state.companyId);
  const cfg = settings();
  const obDate = s.company?.openingBalanceDate ?? '2026-04-01';
  const [grid, setGrid] = useState<Record<string, number>>({});
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [tab, setTab] = useState<'ledger' | 'ar' | 'ap'>('ledger');
  const [confirm, setConfirm] = useState(false);
  const [imp, setImp] = useState(!!route.params.import);
  const [q, setQ] = useState('');
  const canPost = s.can('accounting.journal.post') || s.can('accounting.opening.post');
  const sorted = useMemo(() => [...accounts].sort((a, b) => ((groups.find((g) => g.id === a.groupId)?.order ?? 99) - (groups.find((g) => g.id === b.groupId)?.order ?? 99)) || a.code.localeCompare(b.code)), [accounts, groups]);
  const current = useMemo(() => Object.fromEntries(sorted.map((a) => [a.id, effectiveOpening(a, journals)])), [sorted, journals]);
  useEffect(() => { setGrid((g) => ({ ...Object.fromEntries(sorted.map((a) => [a.id, current[a.id]])), ...g })); }, [current, sorted]);
  useEffect(() => {
    setParties((p) => p.length ? p : openItems.filter((o) => o.docType === 'Opening Balance' && (!o.companyId || o.companyId === s.state.companyId)).map((o) => ({ id: o.id, partyType: o.partyType as 'Customer' | 'Supplier', partyId: o.partyId, partyName: o.partyName, docNumber: o.docNumber, amount: o.direction === 'Debit' ? o.originalAmount : -o.originalAmount, dueDate: o.dueDate })));
  }, [openItems, s.state.companyId]);

  const arControl = accounts.find((a) => a.id === s.company?.defaults.receivableAccountId);
  const apControl = accounts.find((a) => a.id === s.company?.defaults.payableAccountId);
  const obe = accounts.find((a) => a.id === cfg.openingBalanceEquityAccountId);
  const retained = accounts.find((a) => a.id === cfg.retainedEarningsAccountId);
  const signed = (a: Account, v: number) => (a.normalBalance === 'Dr' ? v : -v);
  const totalDr = round(sorted.reduce((x, a) => x + Math.max(0, signed(a, grid[a.id] ?? 0)), 0));
  const totalCr = round(sorted.reduce((x, a) => x + Math.max(0, -signed(a, grid[a.id] ?? 0)), 0));
  const diff = round(totalDr - totalCr);
  const deltas = sorted.map((a) => ({ a, delta: round((grid[a.id] ?? 0) - (current[a.id] ?? 0)) })).filter((d) => Math.abs(d.delta) >= 0.005);
  const arParties = parties.filter((p) => p.partyType === 'Customer');
  const apParties = parties.filter((p) => p.partyType === 'Supplier');
  const arSum = round(arParties.reduce((x, p) => x + p.amount, 0));
  const apSum = round(apParties.reduce((x, p) => x + p.amount, 0));
  const arDiff = arControl ? round((grid[arControl.id] ?? 0) - arSum) : 0;
  const apDiff = apControl ? round((grid[apControl.id] ?? 0) - apSum) : 0;
  const alreadyPosted = journals.filter((j) => j.type === 'Opening' && j.status === 'Posted');
  const periodChk = engine.postingCheck(obDate);
  const existingOpenItemIds = new Set(openItems.filter((o) => o.docType === 'Opening Balance').map((o) => o.id));

  const post = (reason: string) => {
    if (!deltas.length && !parties.some((p) => !existingOpenItemIds.has(p.id))) throw new Error('Nothing changed — grid matches the posted opening balances');
    const lines: engine.PostLine[] = deltas.map(({ a, delta }) => { const dr = signed(a, delta) > 0 ? signed(a, delta) : 0; const cr = signed(a, delta) < 0 ? -signed(a, delta) : 0; return { accountId: a.id, dr, cr, narration: `Opening balance ${current[a.id] ? 'adjustment' : 'entry'} — was ${fmtMoney(current[a.id] ?? 0, s.currency)}` }; });
    const netDr = round(lines.reduce((x, l) => x + (l.dr ?? 0) - (l.cr ?? 0), 0));
    if (Math.abs(netDr) >= 0.005) {
      const target = obe ?? retained;
      if (!target) throw new Error('Configure an Opening Balance Equity or Retained Earnings account in Accounting settings');
      lines.push({ accountId: target.id, dr: netDr < 0 ? -netDr : 0, cr: netDr > 0 ? netDr : 0, narration: 'Unreconciled opening difference' });
    }
    db.transaction(() => {
      let j: Journal | undefined;
      if (lines.length) j = engine.postJournal({ date: obDate, lines, sourceType: 'Opening Balance', sourceNumber: `OB ${obDate}`, narration: `Opening balances ${alreadyPosted.length ? 'adjustment' : 'entry'} as at ${fmtDate(obDate)} — ${reason}`, type: 'Opening', skipPeriodCheck: !periodChk.ok && s.can('accounting.period.postclosed'), idempotencyKey: `opening:${uid('ob')}` });
      parties.filter((p) => !existingOpenItemIds.has(p.id) && p.amount !== 0).forEach((p) => engine.createOpenItem({ partyType: p.partyType, partyId: p.partyId, partyName: p.partyName, docType: 'Opening Balance', docId: j?.id ?? 'opening', docNumber: p.docNumber || `OB/${p.partyType === 'Customer' ? 'AR' : 'AP'}/${p.partyId.slice(-4).toUpperCase()}`, date: obDate, dueDate: p.dueDate || addDays(obDate, 30), currency: s.currency, originalAmount: Math.abs(p.amount), baseAmount: Math.abs(p.amount), rate: 1, direction: p.amount >= 0 ? 'Debit' : 'Credit', branchId: s.state.branchId ?? '', companyId: s.state.companyId }));
      engine.audit({ action: 'opening.posted', objectType: 'Opening Balance', objectId: j?.id, objectNumber: j?.number, detail: `${deltas.length} account(s) · difference ${fmtMoney(netDr, s.currency)} → ${(obe ?? retained)?.code ?? '—'} · ${reason}` });
      if (j) toast.success(`Opening balances posted as ${j.number}`, { label: 'Open journal', path: journalLink(j.id) });
      else toast.success('Party opening items recorded');
    });
    setParties([]);
  };

  const addParty = (kind: 'Customer' | 'Supplier') => setParties((p) => [...p, { id: uid('obp'), partyType: kind, partyId: '', partyName: '', docNumber: '', amount: 0, dueDate: addDays(obDate, 30) }]);
  const setParty = (id: string, patch: Partial<PartyRow>) => setParties((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const partyTable = (kind: 'Customer' | 'Supplier') => {
    const rows = kind === 'Customer' ? arParties : apParties;
    const master = kind === 'Customer' ? customers : suppliers;
    const control = kind === 'Customer' ? arControl : apControl;
    const d = kind === 'Customer' ? arDiff : apDiff;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className={`banner ${Math.abs(d) < 0.01 ? 'success' : 'warning'}`}>{control ? <>{control.code} · {control.name}: control {fmtMoney(grid[control.id] ?? 0, s.currency)} vs party rows {fmtMoney(kind === 'Customer' ? arSum : apSum, s.currency)} → {Math.abs(d) < 0.01 ? '✓ reconciled' : `difference ${fmtMoney(d, s.currency)} — add party rows or adjust the control account`}</> : 'No control account configured'}</div>
        <div className="card" style={{ overflow: 'auto' }}>
          <table className="data-table dense">
            <thead><tr><th style={{ minWidth: 260 }}>{kind}</th><th>Reference</th><th>Due date</th><th className="right">Amount ({kind === 'Customer' ? 'receivable' : 'payable'}; negative = advance)</th><th /></tr></thead>
            <tbody>
              {rows.map((p) => { const posted = existingOpenItemIds.has(p.id); return (
                <tr key={p.id} className={posted ? 'muted' : ''}>
                  <td>{posted ? p.partyName : <select className="field-input grid" value={p.partyId} onChange={(e) => setParty(p.id, { partyId: e.target.value, partyName: master.find((m) => m.id === e.target.value)?.name ?? '' })}><option value="">— {kind} —</option>{master.map((m) => <option key={m.id} value={m.id}>{m.code} · {m.name}</option>)}</select>}</td>
                  <td>{posted ? <span className="identifier">{p.docNumber}</span> : <input className="field-input grid" value={p.docNumber} onChange={(e) => setParty(p.id, { docNumber: e.target.value })} placeholder="Old invoice no." />}</td>
                  <td>{posted ? fmtDate(p.dueDate) : <input className="field-input grid" type="date" value={p.dueDate} onChange={(e) => setParty(p.id, { dueDate: e.target.value })} />}</td>
                  <td className="right">{posted ? <span className="money">{fmtMoney(p.amount, s.currency)}</span> : <input className="field-input grid num" type="number" step="0.01" value={p.amount || ''} onChange={(e) => setParty(p.id, { amount: Number(e.target.value) })} style={{ width: 160 }} />}</td>
                  <td>{posted ? <Badge status="Posted" /> : <Button size="sm" variant="ghost" onClick={() => setParties((x) => x.filter((y) => y.id !== p.id))}>✕</Button>}</td>
                </tr>
              ); })}
              {!rows.length && <tr><td colSpan={5} style={{ color: 'var(--ink-3)', textAlign: 'center', padding: 20 }}>No party breakdown yet — the control balance is unallocated</td></tr>}
            </tbody>
            <tfoot><tr><td><Button size="sm" variant="secondary" onClick={() => addParty(kind)}>+ Add {kind.toLowerCase()}</Button></td><td colSpan={2}>Sum of party rows</td><td className="right money">{fmtMoney(kind === 'Customer' ? arSum : apSum, s.currency)}</td><td /></tr></tfoot>
          </table>
        </div>
      </div>
    );
  };
  const filtered = sorted.filter((a) => !q || `${a.code} ${a.name}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <PageHeader title="Opening balances" subtitle={<ScopeLine extra={`as at ${fmtDate(obDate)} · ${alreadyPosted.length ? `${alreadyPosted.length} opening journal(s) posted` : 'not yet posted'}`} />}
        actions={<><Button variant="secondary" onClick={() => setImp(true)}>Import CSV</Button><Button variant="primary" onClick={() => setConfirm(true)} disabled={!canPost || (!deltas.length && !parties.some((p) => !existingOpenItemIds.has(p.id)))} reason={!canPost ? 'Requires post permission' : !deltas.length ? 'No changes to post' : undefined}>Post opening balances</Button></>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <KpiTile label="Total debits" amount={totalDr} currency={s.currency} />
        <KpiTile label="Total credits" amount={totalCr} currency={s.currency} />
        <KpiTile label="Difference" amount={diff} currency={s.currency} tone={Math.abs(diff) < 0.01 ? 'none' : 'negative'} sub={Math.abs(diff) < 0.01 ? '✓ Balanced' : `Will post to ${(obe ?? retained)?.code ?? '—'} · ${(obe ?? retained)?.name ?? 'configure in settings'}`} deltaTone={Math.abs(diff) < 0.01 ? 'good' : 'bad'} />
        <KpiTile label="Pending changes" value={deltas.length} sub={deltas.length ? `${deltas.length} account(s) differ from posted values` : 'Grid matches the ledger'} />
      </div>
      {obe && (current[obe.id] ?? 0) !== 0 && <div className="banner warning">Opening balances carry an unreconciled difference of {fmtMoney(current[obe.id] ?? 0, s.currency)} parked in {obe.code} · {obe.name}. Adjust the affected accounts and post again to clear it, or transfer it to retained earnings by manual journal.</div>}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)' }}>{([['ledger', 'Ledger accounts'], ['ar', `Customers (AR) · ${arParties.length}`], ['ap', `Suppliers (AP) · ${apParties.length}`]] as const).map(([k, l]) => <button key={k} type="button" className={`doc-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'ledger' && (
        <>
          <div className="toolbar"><div className="search-input" style={{ width: 260 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search accounts…" /></div><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Enter balances on the account's normal side. Bank, tax, inventory and control accounts are included; edit the value and post the delta.</span></div>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Side</th><th className="right">Posted opening</th><th className="right">Opening balance</th><th className="right">Change</th></tr></thead>
              <tbody>
                {filtered.map((a) => { const delta = round((grid[a.id] ?? 0) - (current[a.id] ?? 0)); return (
                  <tr key={a.id} style={Math.abs(delta) >= 0.005 ? { background: 'var(--warn-bg)' } : undefined}>
                    <td className="identifier" style={{ color: 'var(--ink-3)' }}>{a.code}</td>
                    <td>{a.name}{a.isControl && <span className="pill pill-neutral" style={{ marginLeft: 6 }}>{a.controlType}</span>}</td>
                    <td style={{ color: 'var(--ink-3)' }}>{groups.find((g) => g.id === a.groupId)?.name ?? '—'}</td>
                    <td>{a.normalBalance}</td>
                    <td className="right money" style={{ color: 'var(--ink-3)' }}>{current[a.id] ? fmtMoney(current[a.id], s.currency) : '—'}</td>
                    <td className="right"><input className="field-input grid num" type="number" step="0.01" value={grid[a.id] ?? 0} onChange={(e) => setGrid({ ...grid, [a.id]: Number(e.target.value) })} style={{ width: 160 }} disabled={!canPost || !a.postingAllowed} /></td>
                    <td className="right money" style={{ color: delta ? 'var(--warn)' : 'var(--ink-5)' }}>{delta ? fmtMoney(delta, s.currency) : '—'}</td>
                  </tr>
                ); })}
              </tbody>
              <tfoot><tr><td colSpan={4}>Totals · {sorted.length} accounts</td><td className="right money">Dr {fmtMoney(totalDr, s.currency)}</td><td className="right money">Cr {fmtMoney(totalCr, s.currency)}</td><td className="right money" style={{ color: Math.abs(diff) < 0.01 ? 'var(--good)' : 'var(--danger)' }}>{Math.abs(diff) < 0.01 ? 'Balanced' : fmtMoney(diff, s.currency)}</td></tr></tfoot>
            </table>
          </div>
        </>
      )}
      {tab === 'ar' && partyTable('Customer')}
      {tab === 'ap' && partyTable('Supplier')}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Post opening balances as at ${fmtDate(obDate)}?`} statement="An Opening-type journal is created for the changed accounts. Posted opening journals are immutable — post another adjustment to correct." reasonRequired confirmLabel="Post opening balances" cancelLabel="Keep editing"
        consequences={[{ engine: 'Journal', text: `${deltas.length} account line(s) dated ${fmtDate(obDate)}${Math.abs(diff) >= 0.005 ? ` · difference ${fmtMoney(diff, s.currency)} posted to ${(obe ?? retained)?.code ?? '—'}` : ''}`, tone: Math.abs(diff) >= 0.005 ? 'warning' : 'info' }, { engine: 'Open items', text: `${parties.filter((p) => !existingOpenItemIds.has(p.id) && p.amount).length} party opening item(s) created for AR/AP sub-ledgers` }, ...(!periodChk.ok ? [{ engine: 'Workflow', text: `${periodChk.reason} — posting uses the Finance Admin override`, tone: 'warning' as const }] : []), ...(Math.abs(arDiff) >= 0.01 || Math.abs(apDiff) >= 0.01 ? [{ engine: 'Open items', text: `Control accounts not fully allocated to parties (AR ${fmtMoney(arDiff, s.currency)}, AP ${fmtMoney(apDiff, s.currency)}) — sub-ledger tie-out will show the gap`, tone: 'warning' as const }] : [])]}
        onConfirm={(reason) => post(reason)} />
      <ImportWizard open={imp} onClose={() => setImp(false)} entity="Opening balances" duplicateKeys={[]} existing={[]}
        fields={[{ key: 'code', label: 'Account code', required: true, validate: (v) => (accounts.some((a) => a.code === v) ? null : 'Unknown account code') }, { key: 'dr', label: 'Debit', type: 'number' }, { key: 'cr', label: 'Credit', type: 'number' }, { key: 'partyType', label: 'Party type (Customer/Supplier)', validate: (v) => (!v || v === 'Customer' || v === 'Supplier' ? null : 'Customer or Supplier') }, { key: 'party', label: 'Party code' }, { key: 'ref', label: 'Reference' }, { key: 'due', label: 'Due date', type: 'date' }]}
        sampleRows={[{ 'Account code': '1310', Debit: '482000', Credit: '', 'Party type (Customer/Supplier)': '', 'Party code': '', Reference: '', 'Due date': '' }, { 'Account code': '1100', Debit: '118000', Credit: '', 'Party type (Customer/Supplier)': 'Customer', 'Party code': 'C-0001', Reference: 'INV/25-26/0099', 'Due date': obDate }, { 'Account code': '2100', Debit: '', Credit: '62000', 'Party type (Customer/Supplier)': 'Supplier', 'Party code': 'S-0006', Reference: 'BILL-4471', 'Due date': obDate }]}
        onCommit={(rows) => {
          const g = { ...grid };
          const newParties: PartyRow[] = [];
          rows.forEach((r) => {
            const a = accounts.find((x) => x.code === r.code); if (!a) return;
            const v = Number(r.dr || 0) - Number(r.cr || 0);
            if (r.partyType && r.party) { const m = (r.partyType === 'Customer' ? customers : suppliers).find((x) => x.code === r.party); if (m) newParties.push({ id: uid('obp'), partyType: r.partyType as 'Customer' | 'Supplier', partyId: m.id, partyName: m.name, docNumber: r.ref, amount: r.partyType === 'Customer' ? v : -v, dueDate: r.due || addDays(obDate, 30) }); g[a.id] = round((g[a.id] ?? 0) + (a.normalBalance === 'Dr' ? v : -v)); }
            else g[a.id] = a.normalBalance === 'Dr' ? v : -v;
          });
          setGrid(g); setParties((p) => [...p, ...newParties]); setTab('ledger');
          return rows.length;
        }} />
    </div>
  );
}

