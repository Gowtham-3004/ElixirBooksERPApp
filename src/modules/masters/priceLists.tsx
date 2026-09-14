// Price lists (FR-PRC-001..004): register, form, entries grid with inline edit, resolution tester.
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Company, Currency, Item, PriceList, PriceListEntry } from '../../store';
import { Badge, Button, CheckboxField, DateField, Drawer, EmptyState, EntityPicker, ImportWizard, Money, NumberField, PageHeader, RegisterPage, SelectField, TextField, TwoLine, useCustomerOptions, useItemOptions, useSupplierOptions, useToast } from '../../components/ui';
import { fmtDate, today, fmtMoney } from '../../lib/format';
import { ChangeHistory, DrawerFooter, DuplicateBanner, DuplicateRulesDrawer, ErrorSummary, UsagePill, bulkStatusActions, findDuplicates, masterRowActions, nextCode, saveMaster, statusTabs, useForm } from './shared';
import { priceListEntryImport } from './importDefs';

export function PriceListRegister() {
  const s = useSession();
  const rows = useCollection<PriceList>(C.priceLists).filter((p) => p.companyId === s.state.companyId);
  const entries = useCollection<PriceListEntry>(C.priceListEntries);
  const [editing, setEditing] = useState<PriceList | null | 'new'>(null);
  const [rules, setRules] = useState(false);
  const canEdit = s.can('masters.pricelists.edit') || s.can('masters.pricelists.create') || s.can('masters.pricelists.*');
  const t = today();
  return (
    <>
      <RegisterPage<PriceList>
        title="Price lists"
        subtitle={`${rows.filter((r) => r.status === 'Active').length} active · ${entries.length} entries · default: ${rows.find((r) => r.id === s.company?.defaults.priceListId)?.name ?? '—'}`}
        entity="price lists"
        rows={rows}
        searchKeys={['name', 'code', 'currency']}
        tabs={statusTabs<PriceList>([{ id: 'sales', label: 'Sales', filter: (r) => r.type === 'Sales' }, { id: 'purchase', label: 'Purchase', filter: (r) => r.type === 'Purchase' }])}
        primaryAction={{ label: 'New price list', onClick: () => setEditing('new'), disabled: !canEdit, reason: canEdit ? undefined : 'Requires price list permission' }}
        actions={<Button variant="secondary" onClick={() => setRules(true)}>Duplicate rules</Button>}
        onRowClick={(r) => nav.go(`masters/price-lists/${r.id}`)}
        rowActions={(r) => masterRowActions({ collection: C.priceLists, objectType: 'Price List', row: r, canEdit, onView: () => nav.go(`masters/price-lists/${r.id}`), onEdit: () => setEditing(r), extra: [{ label: 'Set as company default', onClick: () => { db.update<Company>(C.companies, s.company!.id, { defaults: { ...s.company!.defaults, priceListId: r.id } }); engine.audit({ action: 'company.default_pricelist', objectType: 'Company', objectId: s.company!.id, detail: r.name }); }, disabled: r.type !== 'Sales' || s.company?.defaults.priceListId === r.id }] })}
        bulkActions={(ids, sel) => bulkStatusActions(C.priceLists, 'Price List', ids, sel, canEdit)}
        columns={[
          { key: 'name', label: 'Price list', sortable: true, render: (r) => <TwoLine primary={<span>{r.name}{s.company?.defaults.priceListId === r.id && <span className="pill pill-good" style={{ marginLeft: 6 }}>Default</span>}</span>} secondary={r.code} mono /> },
          { key: 'type', label: 'Type' },
          { key: 'currency', label: 'Currency', render: (r) => <span className="currency-tag">{r.currency}</span> },
          { key: 'taxInclusive', label: 'Tax', render: (r) => (r.taxInclusive ? 'Inclusive' : 'Exclusive') },
          { key: 'validity', label: 'Validity', render: (r) => { const expired = r.validTo && r.validTo < t; const future = r.validFrom && r.validFrom > t; return <span style={{ color: expired || future ? 'var(--warn)' : undefined }}>{fmtDate(r.validFrom)} → {r.validTo ? fmtDate(r.validTo) : 'open'}{expired ? ' · expired' : future ? ' · not yet valid' : ''}</span>; } },
          { key: 'scope', label: 'Scope' },
          { key: 'priority', label: 'Priority', align: 'right', sortable: true },
          { key: 'entries', label: 'Entries', align: 'right', render: (r) => entries.filter((e) => e.priceListId === r.id).length },
          { key: 'status', label: 'Status', render: (r) => <Badge status={r.status} /> },
        ]}
      />
      {editing && <PriceListForm priceList={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={(p) => { setEditing(null); if (editing === 'new') nav.go(`masters/price-lists/${p.id}`); }} />}
      <DuplicateRulesDrawer open={rules} onClose={() => setRules(false)} entity="priceLists" entityLabel="Price lists" candidateFields={['code', 'name']} />
    </>
  );
}

export function PriceListForm({ priceList, onClose, onSaved }: { priceList?: PriceList; onClose: () => void; onSaved: (p: PriceList) => void }) {
  const s = useSession();
  const toast = useToast();
  const rows = useCollection<PriceList>(C.priceLists).filter((p) => p.companyId === s.state.companyId);
  const currencies = useCollection<Currency>(C.currencies).filter((c) => c.status === 'Active');
  const f = useForm<any>(priceList ? { ...priceList } : { code: nextCode(rows, 'PL-'), name: '', type: 'Sales', currency: s.currency, taxInclusive: false, validFrom: today(), validTo: '', scope: 'All', priority: 10, status: 'Active' });
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const dups = useMemo(() => findDuplicates('priceLists', rows, f.v, priceList?.id), [rows, f.v.code, f.v.name]);
  const blocked = dups.some((d) => d.mode === 'Block');
  const save = () => {
    const e: Record<string, string> = {};
    if (!f.v.code.trim()) e.code = 'Code is required';
    if (!f.v.name.trim()) e.name = 'Name is required';
    if (f.v.validTo && f.v.validFrom && f.v.validTo < f.v.validFrom) e.validTo = 'Valid-to must be after valid-from';
    if (!(f.v.priority >= 0)) e.priority = 'Priority must be 0 or more (lower wins)';
    f.setErrors(e);
    if (Object.keys(e).length || blocked || saving) return;
    if (dups.length && !ack) { f.setErrors({ duplicate: 'Acknowledge the possible duplicate' }); return; }
    setSaving(true);
    try {
      const saved = saveMaster<PriceList>(C.priceLists, 'Price List', { ...f.v, code: f.v.code.toUpperCase(), validTo: f.v.validTo || undefined, validFrom: f.v.validFrom || undefined }, priceList?.id, { expectedVersion: priceList?.version });
      toast.success(priceList ? `${saved.name} updated` : `Price list ${saved.code} created`);
      onSaved(saved);
    } catch (err: any) { toast.error(err?.message ?? 'Could not save'); setSaving(false); }
  };
  return (
    <Drawer open onClose={onClose} title={priceList ? `Edit ${priceList.name}` : 'New price list'} subtitle="FR-PRC-001 · type, currency, tax inclusion, validity, scope, priority" width={560}
      footer={<DrawerFooter onCancel={onClose} onSave={save} saving={saving} saveLabel={priceList ? 'Save price list' : 'Create price list'} disabled={blocked} />}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ErrorSummary errors={f.errors} />
        <DuplicateBanner hits={dups} acknowledged={ack} onAcknowledge={setAck} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TextField label="Code" required value={f.v.code} onChange={(v) => f.set('code', v.toUpperCase())} error={f.errors.code} />
          <TextField label="Name" required value={f.v.name} onChange={(v) => f.set('name', v)} error={f.errors.name} autoFocus />
          <SelectField label="Type" value={f.v.type} onChange={(v) => f.set('type', v)} options={['Sales', 'Purchase']} />
          <SelectField label="Currency" value={f.v.currency} onChange={(v) => f.set('currency', v)} options={currencies.map((c) => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
          <DateField label="Valid from" value={f.v.validFrom} onChange={(v) => f.set('validFrom', v)} />
          <DateField label="Valid to" value={f.v.validTo} onChange={(v) => f.set('validTo', v)} error={f.errors.validTo} />
          <SelectField label="Scope" value={f.v.scope} onChange={(v) => f.set('scope', v)} options={['All', 'Customer', 'Supplier', 'Branch']} help="Customer scope: only applies when assigned on the customer" />
          <NumberField label="Priority" value={f.v.priority} onChange={(v) => f.set('priority', v)} decimals={0} error={f.errors.priority} help="Lower number wins when several lists apply" />
          <SelectField label="Status" value={f.v.status} onChange={(v) => f.set('status', v)} options={['Active', 'Inactive']} />
        </div>
        <CheckboxField checked={f.v.taxInclusive} onChange={(v) => f.set('taxInclusive', v)} label="Rates are tax-inclusive" help="Taxable value is backed out of the rate at document time (MRP lists)" />
      </div>
    </Drawer>
  );
}

// ── Detail: entries grid + resolution tester ───────────────────────────────

type Draft = Partial<PriceListEntry> & { _new?: boolean };

export default function PriceListDetail({ id }: { id: string }) {
  const s = useSession();
  const toast = useToast();
  const pl = useRecord<PriceList>(C.priceLists, id);
  const entries = useCollection<PriceListEntry>(C.priceListEntries).filter((e) => e.priceListId === id);
  const items = useCollection<Item>(C.items);
  const itemOpts = useItemOptions();
  const custOpts = useCustomerOptions();
  const supOpts = useSupplierOptions();
  const [editing, setEditing] = useState(false);
  const [imp, setImp] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tab, setTab] = useState<'entries' | 'test' | 'history'>('entries');
  const [q, setQ] = useState('');
  const canEdit = s.can('masters.pricelists.edit') || s.can('masters.pricelists.*');
  if (!pl) return <EmptyState icon="🧭" title="Price list not found" action={<Button variant="primary" onClick={() => nav.go('masters/price-lists')}>Back to price lists</Button>} />;
  const partyOpts = pl.type === 'Sales' ? custOpts : supOpts;
  const filtered = entries.filter((e) => { const it = items.find((i) => i.id === e.itemId); return !q || `${it?.name} ${it?.code}`.toLowerCase().includes(q.toLowerCase()); }).sort((a, b) => (items.find((i) => i.id === a.itemId)?.name ?? '').localeCompare(items.find((i) => i.id === b.itemId)?.name ?? '') || a.minQty - b.minQty);
  const saveDraft = () => {
    if (!draft) return;
    if (!draft.itemId) { toast.error('Choose an item'); return; }
    if (!(draft.rate! > 0)) { toast.error('Rate must be positive'); return; }
    if (draft.effectiveTo && draft.effectiveFrom && draft.effectiveTo < draft.effectiveFrom) { toast.error('Effective-to must be after effective-from'); return; }
    const clash = entries.find((e) => e.id !== draft.id && e.itemId === draft.itemId && (e.uom ?? '') === (draft.uom ?? '') && e.minQty === (draft.minQty ?? 1) && (e.partyId ?? '') === (draft.partyId ?? '') && (e.effectiveFrom ?? '') === (draft.effectiveFrom ?? ''));
    if (clash) { toast.error('An identical entry (item, UOM, min qty, party, effective date) already exists'); return; }
    const it = items.find((i) => i.id === draft.itemId)!;
    const { _new, id: did, ...vals } = draft;
    saveMaster<PriceListEntry>(C.priceListEntries, 'Price List Entry', { ...vals, priceListId: id, uom: draft.uom || it.baseUom, minQty: draft.minQty ?? 1, rate: draft.rate!, effectiveFrom: draft.effectiveFrom || undefined, effectiveTo: draft.effectiveTo || undefined, partyId: draft.partyId || undefined } as any, _new ? undefined : did, { label: () => `${pl.code} · ${it.code}` });
    toast.success(`${it.name} @ ${fmtMoney(draft.rate!, pl.currency)} saved`);
    setDraft(null);
  };
  const remove = (e: PriceListEntry) => { db.remove(C.priceListEntries, e.id); engine.audit({ action: 'price_list_entry.deleted', objectType: 'Price List Entry', objectId: e.id, objectNumber: `${pl.code} · ${items.find((i) => i.id === e.itemId)?.code}`, before: e as unknown as Record<string, unknown> }); };
  const cell = (e: PriceListEntry) => (draft && draft.id === e.id ? draft : null);
  const row = (e: PriceListEntry | Draft, isDraft: boolean) => {
    const d = isDraft ? (e as Draft) : null;
    const it = items.find((i) => i.id === e.itemId);
    const uoms = it ? [it.baseUom, ...it.altUoms.map((u) => u.uom)] : [];
    if (d) {
      return (
        <tr key={e.id ?? 'new'} style={{ background: 'var(--surface-2)' }}>
          <td style={{ minWidth: 260 }}><EntityPicker value={d.itemId} onChange={(v, opt) => setDraft({ ...d, itemId: v, uom: (opt?.raw as Item | undefined)?.baseUom })} options={itemOpts} size="grid" placeholder="Item…" /></td>
          <td><select className="field-input grid" value={d.uom ?? ''} onChange={(ev) => setDraft({ ...d, uom: ev.target.value })}>{uoms.map((u) => <option key={u} value={u}>{u}</option>)}</select></td>
          <td><input className="field-input grid num" type="number" value={d.minQty ?? 1} onChange={(ev) => setDraft({ ...d, minQty: Number(ev.target.value) })} style={{ width: 90 }} /></td>
          <td><input className="field-input grid num" type="number" step="0.01" value={d.rate ?? ''} onChange={(ev) => setDraft({ ...d, rate: Number(ev.target.value) })} style={{ width: 120 }} autoFocus /></td>
          <td style={{ minWidth: 200 }}><EntityPicker value={d.partyId} onChange={(v) => setDraft({ ...d, partyId: v })} options={partyOpts} size="grid" placeholder="All parties" /></td>
          <td><input className="field-input grid" type="date" value={d.effectiveFrom ?? ''} onChange={(ev) => setDraft({ ...d, effectiveFrom: ev.target.value })} /></td>
          <td><input className="field-input grid" type="date" value={d.effectiveTo ?? ''} onChange={(ev) => setDraft({ ...d, effectiveTo: ev.target.value })} /></td>
          <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="primary" onClick={saveDraft}>Save</Button> <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button></td>
        </tr>
      );
    }
    const en = e as PriceListEntry;
    const party = en.partyId ? db.find<any>(C.customers, en.partyId)?.name ?? db.find<any>(C.suppliers, en.partyId)?.name ?? en.partyId : undefined;
    const expired = en.effectiveTo && en.effectiveTo < today();
    return (
      <tr key={en.id} className={expired ? 'muted' : ''}>
        <td><TwoLine primary={it?.name ?? en.itemId} secondary={it?.code} mono /></td>
        <td>{en.uom}</td>
        <td className="right">{en.minQty}</td>
        <td className="right"><Money value={en.rate} currency={pl.currency} /></td>
        <td>{party ? <span className="pill pill-neutral">{party}</span> : <span style={{ color: 'var(--ink-3)' }}>All</span>}</td>
        <td>{fmtDate(en.effectiveFrom)}</td>
        <td>{en.effectiveTo ? fmtDate(en.effectiveTo) : <span style={{ color: 'var(--ink-3)' }}>open</span>}</td>
        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
          <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => setDraft({ ...en })}>Edit</Button>
          <Button size="sm" variant="ghost" disabled={!canEdit} onClick={() => remove(en)} style={{ color: 'var(--danger)' }}>Remove</Button>
        </td>
      </tr>
    );
  };
  return (
    <div className="page">
      <PageHeader back={{ label: 'Price lists', path: 'masters/price-lists' }}
        title={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>{pl.name} <Badge status={pl.status} /> <span className="currency-tag">{pl.currency}</span>{pl.taxInclusive && <span className="pill pill-neutral">Tax inclusive</span>}</span>}
        subtitle={<span style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}><span className="identifier">{pl.code}</span><span>{pl.type} · scope {pl.scope} · priority {pl.priority} · {fmtDate(pl.validFrom)} → {pl.validTo ? fmtDate(pl.validTo) : 'open'}</span><UsagePill id={id} collection={C.priceLists} /></span>}
        actions={<><Button variant="secondary" onClick={() => setImp(true)} disabled={!canEdit}>Import entries</Button><Button variant="secondary" onClick={() => setEditing(true)} disabled={!canEdit}>Edit price list</Button><Button variant="primary" disabled={!canEdit || !!draft} reason={canEdit ? undefined : 'Requires price list permission'} onClick={() => { setTab('entries'); setDraft({ _new: true, minQty: 1, effectiveFrom: today() }); }}>+ Add entry</Button></>} />
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--hairline)' }}>
        {([['entries', `Entries (${entries.length})`], ['test', 'Test resolution'], ['history', 'Change history']] as const).map(([k, l]) => <button key={k} type="button" className={`doc-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'entries' && (
        <>
          <div className="toolbar"><div className="search-input" style={{ width: 280 }}><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by item…" /></div><span style={{ fontSize: 12, color: 'var(--ink-3)' }}>Party-specific entries win over general ones; higher min-qty tiers win for larger quantities.</span></div>
          <div className="card" style={{ overflow: 'auto' }}>
            <table className="data-table dense">
              <thead><tr><th>Item</th><th>UOM</th><th className="right">Min qty</th><th className="right">Rate ({pl.currency})</th><th>Party</th><th>Effective from</th><th>Effective to</th><th /></tr></thead>
              <tbody>
                {draft?._new && row(draft, true)}
                {filtered.map((e) => (cell(e) ? row(cell(e)!, true) : row(e, false)))}
                {!filtered.length && !draft && <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ink-3)', padding: 32 }}>No entries{q ? ' match' : ' yet — add one or import a CSV'}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
      {tab === 'test' && <ResolutionTester priceList={pl} />}
      {tab === 'history' && <ChangeHistory objectId={id} />}
      {editing && <PriceListForm priceList={pl} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      <ImportWizard open={imp} onClose={() => setImp(false)} {...priceListEntryImport(entries, id)} />
    </div>
  );
}

export function ResolutionTester({ priceList }: { priceList?: PriceList }) {
  const s = useSession();
  const itemOpts = useItemOptions();
  const custOpts = useCustomerOptions();
  const supOpts = useSupplierOptions();
  const lists = useCollection<PriceList>(C.priceLists);
  const [itemId, setItemId] = useState<string | undefined>(itemOpts[0]?.id);
  const [partyId, setPartyId] = useState<string | undefined>();
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(today());
  const [direction, setDirection] = useState<'sale' | 'purchase'>(priceList?.type === 'Purchase' ? 'purchase' : 'sale');
  const [uom, setUom] = useState<string>('');
  const item = db.find<Item>(C.items, itemId);
  const res = itemId ? engine.resolvePrice({ itemId, qty, uom: uom || undefined, customerId: direction === 'sale' ? partyId : undefined, supplierId: direction === 'purchase' ? partyId : undefined, priceListId: priceList?.id, date, direction }) : null;
  const customer = direction === 'sale' ? db.find<any>(C.customers, partyId) : undefined;
  const candidates = [priceList?.id, direction === 'sale' ? customer?.priceListId : undefined, direction === 'sale' ? s.company?.defaults.priceListId : undefined, ...(direction === 'purchase' ? lists.filter((l) => l.type === 'Purchase' && l.status === 'Active').map((l) => l.id) : [])].filter(Boolean) as string[];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 16 }}>
      <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="section-title">Test price resolution <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--ink-3)' }}>· FR-PRC-003</span></div>
        <SelectField label="Direction" value={direction} onChange={(v) => { setDirection(v); setPartyId(undefined); }} options={[{ value: 'sale', label: 'Sale (customer)' }, { value: 'purchase', label: 'Purchase (supplier)' }]} />
        <EntityPicker label="Item" value={itemId} onChange={(v) => { setItemId(v); setUom(''); }} options={itemOpts} />
        <EntityPicker label={direction === 'sale' ? 'Customer' : 'Supplier'} value={partyId} onChange={setPartyId} options={direction === 'sale' ? custOpts : supOpts} placeholder="Optional…" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <NumberField label="Quantity" value={qty} onChange={setQty} decimals={3} />
          <SelectField label="UOM" value={uom || item?.baseUom || ''} onChange={setUom} options={item ? [item.baseUom, ...item.altUoms.map((u) => u.uom)] : []} />
          <DateField label="Date" value={date} onChange={setDate} />
        </div>
      </div>
      <div className="card" style={{ padding: 18 }}>
        {!res ? <EmptyState compact title="Pick an item to resolve a price" /> : (
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 28, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(res.rate, priceList?.currency ?? db.find<PriceList>(C.priceLists, res.priceListId)?.currency ?? s.currency)}</span>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>per {uom || item?.baseUom}</span>
              <Badge status={res.source === 'Price list' ? 'Approved' : 'Draft'}>{res.source}</Badge>
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink)', marginTop: 8 }}>{res.priceListName ? <>Selected from <strong>{res.priceListName}</strong>{res.entryId ? <> · entry <span className="identifier">{res.entryId}</span></> : null}</> : 'No matching price list entry — item master price used'}</div>
            <div className="section-label" style={{ marginTop: 16, marginBottom: 6 }}>Resolution hierarchy (first match wins)</div>
            <ol style={{ fontSize: 13, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {candidates.map((cid, i) => { const l = lists.find((x) => x.id === cid); const hit = res.priceListId === cid; return <li key={cid + i} style={{ color: hit ? 'var(--good)' : 'var(--ink-3)', fontWeight: hit ? 600 : 400 }}>{l?.name ?? cid} <span style={{ fontWeight: 400 }}>· {i === 0 && priceList ? 'this price list' : l?.id === customer?.priceListId ? 'customer default' : l?.id === s.company?.defaults.priceListId ? 'company default' : 'active purchase list'}{l?.status !== 'Active' ? ' · inactive' : ''}{l?.validTo && l.validTo < date ? ' · expired' : ''}</span>{hit ? ' ✓' : ''}</li>; })}
              <li style={{ color: res.source === 'Item master' ? 'var(--good)' : 'var(--ink-3)', fontWeight: res.source === 'Item master' ? 600 : 400 }}>Item master {direction === 'sale' ? 'sales' : 'purchase'} price · {fmtMoney(direction === 'sale' ? item?.salesPrice ?? 0 : item?.purchasePrice ?? 0, s.currency)}{res.source === 'Item master' ? ' ✓' : ''}</li>
            </ol>
            <div className="section-label" style={{ marginTop: 16, marginBottom: 6 }}>Explanation</div>
            <ul style={{ fontSize: 13, paddingLeft: 18, color: 'var(--ink-2)' }}>{res.explanation.map((x, i) => <li key={i}>{x}</li>)}</ul>
            <div style={{ fontSize: 12, color: 'var(--ink-4)', marginTop: 12 }}>Rules: list must be active and valid on {fmtDate(date)} · entry UOM must match · min qty ≤ {qty} · party-specific entries beat general entries · highest qualifying min-qty tier wins.</div>
          </div>
        )}
      </div>
    </div>
  );
}
