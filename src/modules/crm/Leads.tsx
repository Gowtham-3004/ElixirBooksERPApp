// Leads: register + pipeline board + form drawer + detail page (convert Won → customer + quotation).
import { useMemo, useState } from 'react';
import { db, C, engine, nav, useCollection, useRecord, useSession } from '../../store';
import type { Customer } from '../../store';
import { RegisterPage, Badge, TwoLine, Money, Button, Drawer, TextField, SelectField, NumberField, MoneyField, DateField, TextArea, EntityPicker, useUserOptions, useCustomerOptions, useToast, ConfirmDialog, PageHeader, Card, KV, Timeline, EmptyState, Segmented, Pill, KpiTile, ScopeLine, IdentifierField } from '../../components/ui';
import type { Column, MenuAction } from '../../components/ui';
import { fmtDate, fmtMoney, today, addDays, uid, INDIA_STATES, daysBetween } from '../../lib/format';
import type { Lead, LeadStage, CrmActivity } from './types';
import { LEAD_STAGES, LEAD_SOURCES } from './types';
import { logActivity } from '../sales/ar/Collections';
import { ActivityDrawer } from './Activities';

const STAGE_PROB: Record<LeadStage, number> = { New: 10, Qualified: 30, Proposal: 60, Won: 100, Lost: 0 };

export function useLeads(): Lead[] {
  const rows = useCollection<Lead>(C.leads);
  const s = useSession();
  return useMemo(() => rows.filter((l) => !l.companyId || l.companyId === s.state.companyId).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [rows, s.state.companyId]);
}

export function moveLead(id: string, stage: LeadStage, extra: Partial<Lead> = {}) {
  const l = db.find<Lead>(C.leads, id);
  if (!l) return;
  db.update<Lead>(C.leads, id, { stage, probability: STAGE_PROB[stage], wonAt: stage === 'Won' ? new Date().toISOString() : l.wonAt, lostAt: stage === 'Lost' ? new Date().toISOString() : l.lostAt, ...extra });
  engine.audit({ action: 'lead.stage_changed', objectType: 'Lead', objectId: id, objectNumber: l.name, detail: `${l.stage} → ${stage}${extra.lostReason ? ' · ' + extra.lostReason : ''}` });
}

/** Won lead → customer (quick-create or link existing) → draft quotation. */
export function convertLead(id: string, customerId?: string): { customer: Customer; lead: Lead } {
  return db.transaction(() => {
    const l = db.find<Lead>(C.leads, id);
    if (!l) throw new Error('Lead not found');
    let customer = db.find<Customer>(C.customers, customerId ?? l.customerId);
    if (!customer) {
      const c = engine.ctx();
      const st = INDIA_STATES.find((x) => x.code === (l.stateCode ?? '27'));
      customer = db.insert<Customer>(C.customers, { code: 'C-' + String(db.count(C.customers) + 1).padStart(4, '0'), name: l.company || l.name, group: 'Prospect', taxTreatment: 'Unregistered', addresses: [{ id: uid('a'), purpose: 'Both', isDefault: true, address: { line1: '—', city: l.city ?? st?.name ?? '', state: st?.name ?? '', stateCode: st?.code ?? '27', country: 'IN' } }], contacts: l.contactName ? [{ id: uid('c'), name: l.contactName, email: l.email, phone: l.phone, isDefault: true, purpose: 'General' }] : [], currency: c.currency, paymentTerms: c.company?.defaults.paymentTerms ?? 'Net 30', creditLimit: 0, creditPolicy: 'Inherit', priceListId: c.company?.defaults.priceListId, receivableAccountId: c.company?.defaults.receivableAccountId, salespersonId: undefined, status: 'Active', email: l.email, phone: l.phone, notes: `Converted from lead ${l.name}` });
      engine.audit({ action: 'customer.created', objectType: 'Customer', objectId: customer.id, objectNumber: customer.code, detail: `Quick-created from lead ${l.name}` });
    }
    const lead = db.update<Lead>(C.leads, id, { customerId: customer.id, stage: 'Won', probability: 100, wonAt: l.wonAt ?? new Date().toISOString() });
    engine.audit({ action: 'lead.converted', objectType: 'Lead', objectId: id, objectNumber: l.name, detail: `Customer ${customer.code} · ${customer.name}` });
    engine.notify({ type: 'system', title: `Lead ${l.name} converted`, body: `${customer.name} created — draft a quotation`, link: `crm/leads/${id}` });
    return { customer, lead };
  });
}

export function LeadRegister() {
  const rows = useLeads();
  const s = useSession();
  const toast = useToast();
  const [view, setView] = useState<'list' | 'board'>('list');
  const [form, setForm] = useState<Lead | 'new' | null>(null);
  const [lost, setLost] = useState<Lead | null>(null);
  const open = rows.filter((l) => l.stage !== 'Won' && l.stage !== 'Lost');
  const pipeline = open.reduce((a, l) => a + l.value, 0);
  const weighted = open.reduce((a, l) => a + (l.value * l.probability) / 100, 0);
  const columns: Column<Lead>[] = [
    { key: 'name', label: 'Lead', sortable: true, render: (r) => <TwoLine primary={<span className="link" onClick={(e) => { e.stopPropagation(); nav.go(`crm/leads/${r.id}`); }}>{r.name}</span>} secondary={r.company} />, value: (r) => r.name },
    { key: 'contact', label: 'Contact', render: (r) => <TwoLine primary={r.contactName ?? '—'} secondary={[r.email, r.phone].filter(Boolean).join(' · ')} /> },
    { key: 'source', label: 'Source', render: (r) => r.source, value: (r) => r.source },
    { key: 'stage', label: 'Stage', sortable: true, render: (r) => <Badge status={r.stage === 'Won' ? 'Approved' : r.stage === 'Lost' ? 'Rejected' : r.stage === 'Proposal' ? 'Submitted' : r.stage === 'Qualified' ? 'In Progress' : 'New'}>{r.stage}</Badge>, value: (r) => LEAD_STAGES.indexOf(r.stage) },
    { key: 'value', label: 'Value', align: 'right', sortable: true, render: (r) => <Money value={r.value} />, value: (r) => r.value, total: (rs) => <span className="money" style={{ fontWeight: 600 }}>{fmtMoney(rs.reduce((a, x) => a + x.value, 0))}</span> },
    { key: 'probability', label: 'Prob.', align: 'right', render: (r) => `${r.probability}%`, value: (r) => r.probability },
    { key: 'owner', label: 'Owner', render: (r) => r.ownerName },
    { key: 'expectedClose', label: 'Expected close', sortable: true, render: (r) => r.expectedClose ? <span style={{ color: r.expectedClose < today() && r.stage !== 'Won' && r.stage !== 'Lost' ? '#C0393F' : undefined }}>{fmtDate(r.expectedClose)}</span> : '—', value: (r) => r.expectedClose },
    { key: 'nextStep', label: 'Next step', render: (r) => r.nextStep ?? '—' },
  ];
  const rowActions = (r: Lead): MenuAction[] => {
    const idx = LEAD_STAGES.indexOf(r.stage);
    const next = idx >= 0 && idx < 2 ? LEAD_STAGES[idx + 1] : undefined;
    return [
      { label: 'Open', onClick: () => nav.go(`crm/leads/${r.id}`) },
      { label: 'Edit', onClick: () => setForm(r) },
      ...(next ? [{ label: `Move to ${next}`, onClick: () => { moveLead(r.id, next); toast.success(`${r.name} → ${next}`); } }] : []),
      ...(r.stage === 'Proposal' ? [{ label: 'Mark won & convert', onClick: () => nav.go(`crm/leads/${r.id}`, { convert: 1 }) }] : []),
      ...(r.stage !== 'Won' && r.stage !== 'Lost' ? [{ label: 'Mark lost', danger: true, onClick: () => setLost(r) }] : []),
    ];
  };
  return (
    <>
      {view === 'list' ? (
        <RegisterPage<Lead> title="Leads" subtitle={<>{open.length} open · pipeline <span className="money">{fmtMoney(pipeline)}</span> · weighted <span className="money">{fmtMoney(weighted)}</span> · {s.branch?.name}</>} rows={rows} columns={columns} entity="leads" searchKeys={['name', 'company', 'contactName', 'email', 'source']} searchPlaceholder="Lead, company, contact…"
          tabs={[{ id: 'all', label: 'All' }, ...LEAD_STAGES.map((st) => ({ id: st, label: st, filter: (r: Lead) => r.stage === st }))]}
          filters={[{ key: 'source', label: 'Source', type: 'select', options: LEAD_SOURCES.map((x) => ({ value: x, label: x })) }, { key: 'owner', label: 'Owner', type: 'select', options: Array.from(new Set(rows.map((r) => r.ownerName))).map((o) => ({ value: o, label: o })) }]} applyFilter={(r, f) => (!f.source || r.source === f.source) && (!f.owner || r.ownerName === f.owner)}
          actions={<Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Pipeline' }]} />}
          primaryAction={{ label: 'New lead', onClick: () => setForm('new') }} onRowClick={(r) => nav.go(`crm/leads/${r.id}`)} rowActions={rowActions} />
      ) : (
        <div className="page">
          <div className="page-header"><div><h1 className="page-title">Pipeline</h1><div className="page-subtitle">{open.length} open · {fmtMoney(pipeline)} · weighted {fmtMoney(weighted)}</div></div><div style={{ display: 'flex', gap: 8 }}><Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'board', label: 'Pipeline' }]} /><Button variant="primary" onClick={() => setForm('new')}>+ New lead</Button></div></div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 12, alignItems: 'start' }}>
            {LEAD_STAGES.map((st) => {
              const col = rows.filter((l) => l.stage === st);
              return (
                <div key={st} style={{ background: '#F3F5F5', borderRadius: 10, padding: 10, minHeight: 200 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}><span className="section-label" style={{ color: '#0A0A0A' }}>{st}</span><span style={{ fontSize: 11, color: '#5F6368' }}>{col.length} · {fmtMoney(col.reduce((a, l) => a + l.value, 0))}</span></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {col.map((l) => {
                      const idx = LEAD_STAGES.indexOf(l.stage);
                      const next = idx < 2 ? LEAD_STAGES[idx + 1] : undefined;
                      return (
                        <div key={l.id} className="card" style={{ padding: 10, cursor: 'pointer' }} onClick={() => nav.go(`crm/leads/${l.id}`)}>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{l.name}</div>
                          <div style={{ fontSize: 12, color: '#5F6368' }}>{l.company}</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12 }}><span className="money" style={{ fontWeight: 500 }}>{fmtMoney(l.value)}</span><span style={{ color: '#6E6E71' }}>{l.probability}% · {l.ownerName.split(' ')[0]}</span></div>
                          {l.expectedClose && <div style={{ fontSize: 11, color: l.expectedClose < today() && st !== 'Won' && st !== 'Lost' ? '#C0393F' : '#6E6E71', marginTop: 2 }}>Close {fmtDate(l.expectedClose)}</div>}
                          <div style={{ display: 'flex', gap: 4, marginTop: 8 }} onClick={(e) => e.stopPropagation()}>
                            {next && <Button size="sm" variant="secondary" onClick={() => { moveLead(l.id, next); toast.success(`→ ${next}`); }}>→ {next}</Button>}
                            {st === 'Proposal' && <Button size="sm" variant="primary" onClick={() => nav.go(`crm/leads/${l.id}`, { convert: 1 })}>Won</Button>}
                            {st !== 'Won' && st !== 'Lost' && <Button size="sm" variant="ghost" onClick={() => setLost(l)}>Lost</Button>}
                          </div>
                        </div>
                      );
                    })}
                    {col.length === 0 && <div style={{ fontSize: 12, color: '#B0B5BF', textAlign: 'center', padding: 12 }}>Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {form && <LeadDrawer lead={form === 'new' ? undefined : form} onClose={() => setForm(null)} />}
      <ConfirmDialog open={!!lost} onClose={() => setLost(null)} title={`Mark ${lost?.name} as lost?`} confirmLabel="Mark lost" cancelLabel="Keep open" danger reasonRequired onConfirm={(reason) => { moveLead(lost!.id, 'Lost', { lostReason: reason }); toast.success('Lead marked lost'); }} />
    </>
  );
}

export function LeadDrawer({ lead, onClose }: { lead?: Lead; onClose: () => void }) {
  const toast = useToast();
  const users = useUserOptions();
  const s = useSession();
  const [l, setL] = useState<Partial<Lead>>(lead ?? { stage: 'New', probability: 10, source: 'Website', value: 0, ownerId: s.user?.id, ownerName: s.user?.name ?? '', expectedClose: addDays(today(), 30), stateCode: '27' });
  const set = (p: Partial<Lead>) => setL((x) => ({ ...x, ...p }));
  const save = () => {
    if (!l.name?.trim() || !l.company?.trim()) { toast.error('Lead name and company are required'); return; }
    if (lead) { db.update<Lead>(C.leads, lead.id, l); toast.success('Lead updated'); }
    else { const out = db.insert<Lead>(C.leads, { ...l, stage: l.stage ?? 'New', probability: l.probability ?? STAGE_PROB[l.stage ?? 'New'], value: l.value ?? 0, source: l.source ?? 'Website', ownerName: l.ownerName ?? s.user?.name ?? '' } as any); engine.audit({ action: 'lead.created', objectType: 'Lead', objectId: out.id, objectNumber: out.name }); toast.success('Lead created'); }
    onClose();
  };
  return (
    <Drawer open onClose={onClose} title={lead ? `Edit ${lead.name}` : 'New lead'} width={560} footer={<><Button variant="ghost" onClick={onClose}>Discard</Button><Button variant="primary" onClick={save}>{lead ? 'Save lead' : 'Create lead'}</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid-2"><TextField label="Lead / opportunity" required value={l.name ?? ''} onChange={(v) => set({ name: v })} autoFocus placeholder="Q3 packaging supply" /><TextField label="Company" required value={l.company ?? ''} onChange={(v) => set({ company: v })} /></div>
        <div className="grid-3"><TextField label="Contact" value={l.contactName ?? ''} onChange={(v) => set({ contactName: v })} /><IdentifierField kind="EMAIL" label="Email" value={l.email ?? ''} onChange={(v) => set({ email: v })} /><TextField label="Phone" value={l.phone ?? ''} onChange={(v) => set({ phone: v })} /></div>
        <div className="grid-3"><TextField label="City" value={l.city ?? ''} onChange={(v) => set({ city: v })} /><SelectField label="State" value={l.stateCode ?? '27'} onChange={(v) => set({ stateCode: v })} options={INDIA_STATES.map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` }))} /><SelectField label="Source" value={l.source ?? 'Website'} onChange={(v) => set({ source: v })} options={LEAD_SOURCES as unknown as string[]} /></div>
        <div className="grid-3"><SelectField label="Stage" value={l.stage ?? 'New'} onChange={(v) => set({ stage: v as LeadStage, probability: STAGE_PROB[v as LeadStage] })} options={LEAD_STAGES} /><MoneyField label="Value" value={l.value ?? 0} onChange={(v) => set({ value: v })} /><NumberField label="Probability" value={l.probability ?? 10} onChange={(v) => set({ probability: v })} suffix="%" min={0} max={100} decimals={0} /></div>
        <div className="grid-2"><EntityPicker label="Owner" value={l.ownerId} onChange={(id, o) => set({ ownerId: id, ownerName: o?.primary ?? l.ownerName })} options={users} /><DateField label="Expected close" value={l.expectedClose} onChange={(v) => set({ expectedClose: v })} /></div>
        <TextField label="Next step" value={l.nextStep ?? ''} onChange={(v) => set({ nextStep: v })} placeholder="Send revised quote by Friday" />
        <TextArea label="Notes" value={l.notes ?? ''} onChange={(v) => set({ notes: v })} rows={3} />
      </div>
    </Drawer>
  );
}

export function LeadDetail({ id, convert }: { id: string; convert?: boolean }) {
  const lead = useRecord<Lead>(C.leads, id);
  const activities = useCollection<CrmActivity>(C.crmActivities).filter((a) => a.leadId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const toast = useToast();
  const custOpts = useCustomerOptions();
  const [edit, setEdit] = useState(false);
  const [act, setAct] = useState(false);
  const [conv, setConv] = useState(!!convert);
  const [existing, setExisting] = useState<string | undefined>(lead?.customerId);
  const [lost, setLost] = useState(false);
  if (!lead) return <EmptyState title="Lead not found" action={<Button variant="primary" onClick={() => nav.go('crm/leads')}>Back</Button>} />;
  const customer = db.find<Customer>(C.customers, lead.customerId);
  const idx = LEAD_STAGES.indexOf(lead.stage);
  const next = idx >= 0 && idx < 2 ? LEAD_STAGES[idx + 1] : undefined;
  const quotes = db.where<any>(C.quotations, (q) => q.leadId === lead.id || q.id === lead.quotationId);
  const doConvert = () => { try { const r = convertLead(lead.id, existing); toast.success(`${r.customer.name} ${existing ? 'linked' : 'created'} · lead won`, { label: 'Create quotation', path: `sales/quotations/new?lead=${lead.id}` }); setConv(false); } catch (e: any) { toast.error(e.message); } };
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <PageHeader back={{ label: 'Leads', path: 'crm/leads' }} title={<span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{lead.name} <Badge status={lead.stage === 'Won' ? 'Approved' : lead.stage === 'Lost' ? 'Rejected' : 'Submitted'}>{lead.stage}</Badge></span>} subtitle={`${lead.company} · ${lead.source} · owner ${lead.ownerName}${lead.expectedClose ? ` · expected close ${fmtDate(lead.expectedClose)}` : ''}`}
        actions={<>
          <Button variant="secondary" onClick={() => setAct(true)}>Log activity</Button>
          <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
          {next && <Button variant="secondary" onClick={() => { moveLead(lead.id, next); toast.success(`→ ${next}`); }}>Move to {next}</Button>}
          {lead.stage !== 'Won' && lead.stage !== 'Lost' && <Button variant="ghost" onClick={() => setLost(true)}>Mark lost</Button>}
          {lead.stage !== 'Won' && lead.stage !== 'Lost' && <Button variant="primary" onClick={() => setConv(true)}>Mark won & convert</Button>}
          {lead.stage === 'Won' && customer && <Button variant="primary" onClick={() => nav.go('sales/quotations/new', { lead: lead.id })}>Create quotation</Button>}
        </>} />
      <div className="grid-4">
        <KpiTile label="Value" value={fmtMoney(lead.value)} sub={`${lead.probability}% · weighted ${fmtMoney((lead.value * lead.probability) / 100)}`} />
        <KpiTile label="Days open" value={daysBetween(lead.createdAt.slice(0, 10), today())} sub={`since ${fmtDate(lead.createdAt)}`} />
        <KpiTile label="Activities" value={activities.length} sub={`${activities.filter((a) => a.status === 'Open').length} open`} />
        <KpiTile label="Customer" value={customer ? <span className="link" style={{ fontSize: 16 }} onClick={() => nav.go(`crm/customers/${customer.id}`)}>{customer.name}</span> : <span style={{ fontSize: 14, color: '#B0B5BF' }}>Not converted</span>} sub={customer?.code} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <Card title="Lead details"><KV items={[{ k: 'Contact', v: lead.contactName ?? '—' }, { k: 'Email', v: lead.email ?? '—' }, { k: 'Phone', v: lead.phone ?? '—' }, { k: 'Location', v: [lead.city, INDIA_STATES.find((x) => x.code === lead.stateCode)?.name].filter(Boolean).join(', ') || '—' }, { k: 'Next step', v: lead.nextStep ?? '—' }, { k: 'Notes', v: lead.notes ?? '—' }, ...(lead.lostReason ? [{ k: 'Lost reason', v: lead.lostReason }] : []), ...(quotes.length ? [{ k: 'Quotations', v: <span>{quotes.map((q) => <span key={q.id} className="link identifier" style={{ marginRight: 8 }} onClick={() => nav.go(`sales/quotations/${q.id}`)}>{q.number}</span>)}</span> }] : [])]} /></Card>
        <Card title="Activity" actions={<Button size="sm" variant="secondary" onClick={() => setAct(true)}>+ Log</Button>}><Timeline items={activities.map((a) => ({ type: a.status === 'Done' ? 'success' : 'info', event: a.type, predicate: `${a.subject} · ${a.ownerName}`, time: a.createdAt, note: a.notes, meta: a.status === 'Open' && a.dueAt ? <span>Due {fmtDate(a.dueAt)} · <button type="button" className="btn-link" style={{ fontSize: 11 }} onClick={() => db.update<CrmActivity>(C.crmActivities, a.id, { status: 'Done', doneAt: new Date().toISOString() })}>Mark done</button></span> : undefined }))} /></Card>
      </div>
      {edit && <LeadDrawer lead={lead} onClose={() => setEdit(false)} />}
      {act && <ActivityDrawer onClose={() => setAct(false)} initial={{ leadId: lead.id, leadName: lead.name, customerId: lead.customerId }} />}
      <ConfirmDialog open={lost} onClose={() => setLost(false)} title={`Mark ${lead.name} as lost?`} confirmLabel="Mark lost" cancelLabel="Keep open" danger reasonRequired onConfirm={(reason) => { moveLead(lead.id, 'Lost', { lostReason: reason }); toast.success('Lead marked lost'); }} />
      <ConfirmDialog open={conv} onClose={() => setConv(false)} title={`Convert ${lead.name}?`} statement="The lead is marked Won and linked to a customer; you can then draft a quotation without re-entering the details." confirmLabel={existing ? 'Link customer & mark won' : 'Create customer & mark won'} cancelLabel="Not yet" consequences={[{ engine: 'Workflow', text: existing ? `Links to ${db.find<Customer>(C.customers, existing)?.name}` : `Quick-creates customer "${lead.company || lead.name}" (Unregistered, complete under Masters)` }, { engine: 'Notification', text: 'Owner notified; quotation can be created next' }]} onConfirm={doConvert}>
        <EntityPicker label="Link to an existing customer (optional)" value={existing} onChange={(id) => setExisting(id)} options={custOpts} placeholder="Leave empty to quick-create" />
      </ConfirmDialog>
    </div>
  );
}

export { Pill, ScopeLine, logActivity };
