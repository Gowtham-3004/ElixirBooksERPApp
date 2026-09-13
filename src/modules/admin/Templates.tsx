// Document templates (FR-DOC-005/006): register + editor with governed variable palette, live PrintSheet preview,
// version bump on save, set default.
import { useMemo, useRef, useState } from 'react';
import { db, C, engine, useCollection, useSession } from '../../store';
import type { DocumentTemplate, DocHeader, Customer } from '../../store';
import { fmtDateTime, today } from '../../lib/format';
import { RegisterPage, Badge, Button, Drawer, TextField, TextArea, SelectField, Toggle, TwoLine, useToast, PrintSheet, Timeline, Card } from '../../components/ui';
import type { Column } from '../../components/ui';
import { DOC_TYPES, useCompany } from './shared';
import { IDS } from '../../store';

const VARIABLES: { group: string; vars: string[] }[] = [
  { group: 'Company', vars: ['company.legalName', 'company.tradeName', 'company.gstin', 'company.pan', 'company.address', 'company.email', 'company.phone'] },
  { group: 'Document', vars: ['doc.number', 'doc.date', 'doc.dueDate', 'doc.reference', 'doc.validUntil', 'doc.paymentTerms', 'doc.placeOfSupply'] },
  { group: 'Party', vars: ['party.name', 'party.gstin', 'party.pan', 'party.billingAddress', 'party.shippingAddress', 'party.contact'] },
  { group: 'Totals', vars: ['totals.subtotal', 'totals.tax', 'totals.total', 'totals.words', 'totals.due'] },
  { group: 'Statutory', vars: ['statutory.irn', 'statutory.ackNo', 'statutory.qr', 'statutory.ewbNo'] },
  { group: 'Bank', vars: ['bank.name', 'bank.accountMasked', 'bank.ifsc'] },
];

function sampleDoc(tpl: DocumentTemplate, companyId: string): DocHeader {
  const real = db.findBy<any>(C.salesInvoices, (d) => d.companyId === companyId && d.status === 'Posted') ?? db.findBy<any>(C.salesInvoices, (d) => d.companyId === companyId);
  if (real && tpl.docType === 'Sales Invoice') return { ...real, templateId: tpl.id, templateVersion: tpl.templateVersion };
  const cust = db.find<Customer>(C.customers, IDS.cArlene) ?? db.get<Customer>(C.customers)[0];
  const lines = [engine.newLine({ itemName: 'HR Steel Coil 4mm', hsn: '72084000', qty: 2, uom: 'MT', rate: 52000, taxRateId: IDS.taxGST18 }), engine.newLine({ itemName: 'Delivery & handling', hsn: '996511', qty: 1, uom: 'Trip', rate: 3500, taxRateId: IDS.taxGST5 })];
  const { lines: outLines, totals } = engine.computeDocument(lines, { sellerStateCode: '27', buyerStateCode: cust?.addresses[0]?.address.stateCode ?? '27', direction: 'sale', companyId });
  return engine.newDocHeader(tpl.docType, { number: `${tpl.docType.split(' ').map((w) => w[0]).join('').toUpperCase()}/26-27/0001`, date: today(), partyType: 'Customer', partyId: cust?.id, partyName: cust?.name, partySnapshot: cust ? engine.partySnapshotFor('Customer', cust.id) : undefined, lines: outLines, totals, templateId: tpl.id, templateVersion: tpl.templateVersion, paymentTerms: 'Net 30', placeOfSupply: 'Maharashtra', placeOfSupplyCode: '27', status: 'Posted' });
}

export default function Templates() {
  const s = useSession();
  const co = useCompany();
  const toast = useToast();
  const rows = useCollection<DocumentTemplate>(C.templates).filter((t) => t.companyId === co?.id || !t.companyId);
  const [edit, setEdit] = useState<DocumentTemplate | null>(null);
  const [focus, setFocus] = useState<'header' | 'footer' | 'declaration'>('header');
  const canEdit = s.can('admin.templates.edit') || s.can('admin.templates.*') || s.isTenantOwner;
  const refs = { header: useRef<HTMLTextAreaElement>(null), footer: useRef<HTMLTextAreaElement>(null), declaration: useRef<HTMLTextAreaElement>(null) };
  if (!co) return null;
  const preview = useMemo(() => (edit ? sampleDoc(edit, co.id) : null), [edit?.id, edit?.docType, edit?.templateVersion, co.id]);

  const insertVar = (v: string) => {
    if (!edit) return;
    const token = `{{${v}}}`;
    const cur = edit[focus] ?? '';
    setEdit({ ...edit, [focus]: cur ? `${cur} ${token}` : token, variables: Array.from(new Set([...edit.variables, v])) });
  };
  const save = () => {
    if (!edit) return;
    if (!edit.name.trim()) { toast.error('Template name is required'); return; }
    const used = Array.from(new Set(`${edit.header} ${edit.footer} ${edit.declaration}`.match(/\{\{([a-zA-Z.]+)\}\}/g)?.map((m) => m.slice(2, -2)) ?? []));
    const unknown = used.filter((u) => !VARIABLES.some((g) => g.vars.includes(u)));
    if (unknown.length) { toast.error(`Unknown variable${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')} — only governed variables are allowed (FR-DOC-005)`); return; }
    const existing = rows.find((r) => r.id === edit.id);
    if (existing) {
      const changed = existing.header !== edit.header || existing.footer !== edit.footer || existing.declaration !== edit.declaration || existing.showBankDetails !== edit.showBankDetails || existing.showSignatory !== edit.showSignatory;
      const v = changed ? existing.templateVersion + 1 : existing.templateVersion;
      db.update<DocumentTemplate>(C.templates, existing.id, { ...edit, templateVersion: v, variables: used });
      if (edit.isDefault) rows.filter((r) => r.id !== existing.id && r.docType === edit.docType && r.isDefault).forEach((r) => db.update<DocumentTemplate>(C.templates, r.id, { isDefault: false }));
      engine.audit({ action: 'template.updated', objectType: 'DocumentTemplate', objectId: existing.id, objectNumber: existing.code, detail: changed ? `Version ${existing.templateVersion} → ${v} · documents already generated keep v${existing.templateVersion}` : 'Metadata saved', before: { templateVersion: existing.templateVersion }, after: { templateVersion: v } });
      toast.success(changed ? `Saved as v${v}` : 'Template saved');
    } else {
      const { id, createdAt, updatedAt, version, ...rest } = edit;
      const r = db.insert<DocumentTemplate>(C.templates, { ...rest, companyId: co.id, templateVersion: 1, variables: used });
      if (r.isDefault) rows.filter((x) => x.docType === r.docType && x.isDefault).forEach((x) => db.update<DocumentTemplate>(C.templates, x.id, { isDefault: false }));
      engine.audit({ action: 'template.created', objectType: 'DocumentTemplate', objectId: r.id, objectNumber: r.code });
      toast.success('Template created');
    }
    setEdit(null);
  };
  const setDefault = (t: DocumentTemplate) => {
    db.transaction(() => rows.filter((r) => r.docType === t.docType).forEach((r) => db.update<DocumentTemplate>(C.templates, r.id, { isDefault: r.id === t.id })));
    engine.audit({ action: 'template.default', objectType: 'DocumentTemplate', objectId: t.id, objectNumber: t.code, detail: `Default for ${t.docType}` });
    toast.success(`${t.name} is now the default ${t.docType} template`);
  };
  const usage = (t: DocumentTemplate) => db.count(C.salesInvoices, (d) => d.templateId === t.id) + db.count(C.purchaseOrders, (d) => d.templateId === t.id) + db.count(C.quotations, (d) => d.templateId === t.id);

  const columns: Column<DocumentTemplate>[] = [
    { key: 'name', label: 'Template', sortable: true, render: (t) => <TwoLine primary={<span>{t.name} {t.isDefault && <Badge status="Posted">Default</Badge>}</span>} secondary={`${t.code} · v${t.templateVersion}`} /> },
    { key: 'docType', label: 'Document type', sortable: true },
    { key: 'options', label: 'Options', render: (t) => <span style={{ fontSize: 12, color: '#5F6368' }}>{[t.showBankDetails && 'Bank details', t.showSignatory && 'Signatory'].filter(Boolean).join(' · ') || '—'}</span> },
    { key: 'variables', label: 'Variables', render: (t) => <span style={{ fontSize: 12, color: '#5F6368' }}>{t.variables.length} governed</span> },
    { key: 'usage', label: 'Used by', render: (t) => <span style={{ fontSize: 12 }}>{usage(t)} document{usage(t) === 1 ? '' : 's'}</span> },
    { key: 'updatedAt', label: 'Updated', render: (t) => <span style={{ fontSize: 12, color: '#5F6368' }}>{fmtDateTime(t.updatedAt)}</span> },
    { key: 'status', label: 'Status', render: (t) => <Badge status={t.status} /> },
  ];

  return (
    <>
      <RegisterPage<DocumentTemplate>
        title="Document templates"
        subtitle={`${rows.length} templates · every generated output stores its template version (FR-DOC-006)`}
        rows={rows}
        entity="templates"
        columns={columns}
        searchKeys={['name', 'code', 'docType']}
        tabs={[{ id: 'all', label: 'All' }, { id: 'default', label: 'Defaults', filter: (t) => t.isDefault }, { id: 'inactive', label: 'Inactive', filter: (t) => t.status === 'Inactive' }]}
        primaryAction={{ label: 'New template', onClick: () => setEdit({ id: '', createdAt: '', updatedAt: '', version: 0, companyId: co.id, code: `TPL-${String(rows.length + 1).padStart(2, '0')}`, name: '', docType: 'Sales Invoice', templateVersion: 1, header: '{{company.legalName}} · GSTIN {{company.gstin}}', footer: '', declaration: '', showBankDetails: true, showSignatory: true, variables: [], status: 'Active', isDefault: false }), disabled: !canEdit, reason: canEdit ? undefined : 'Requires admin.templates.edit' }}
        onRowClick={(t) => setEdit({ ...t })}
        rowActions={(t) => [
          { label: 'Edit', onClick: () => setEdit({ ...t }), disabled: !canEdit },
          { label: 'Set as default', onClick: () => setDefault(t), disabled: t.isDefault || t.status !== 'Active' || !canEdit },
          { label: 'Duplicate', onClick: () => setEdit({ ...t, id: '', code: `${t.code}-COPY`, name: `${t.name} (copy)`, isDefault: false, templateVersion: 1 }), disabled: !canEdit },
          { label: t.status === 'Active' ? 'Deactivate' : 'Activate', onClick: () => { db.update<DocumentTemplate>(C.templates, t.id, { status: t.status === 'Active' ? 'Inactive' : 'Active', isDefault: t.status === 'Active' ? false : t.isDefault }); engine.audit({ action: 'template.status', objectType: 'DocumentTemplate', objectId: t.id, objectNumber: t.code }); }, disabled: !canEdit || (t.isDefault && t.status === 'Active'), reason: t.isDefault && t.status === 'Active' ? 'Default template cannot be deactivated' : undefined, danger: t.status === 'Active', separator: true },
        ]}
      />
      <Drawer open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `${edit.code} · ${edit.name}` : 'New template'} subtitle={edit?.id ? `v${edit.templateVersion} · content changes create a new version` : undefined} width={1100}
        footer={<><Button variant="secondary" onClick={() => setEdit(null)}>Discard</Button><Button variant="primary" onClick={save} disabled={!canEdit}>Save template</Button></>}>
        {edit && (
          <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: 20, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <TextField label="Name" required value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} autoFocus />
              <div className="grid-2">
                <TextField label="Code" value={edit.code} onChange={(v) => setEdit({ ...edit, code: v })} uppercase disabled={!!edit.id} />
                <SelectField label="Document type" value={edit.docType} onChange={(v) => setEdit({ ...edit, docType: v })} options={DOC_TYPES} />
              </div>
              <TextArea label="Header" value={edit.header} onChange={(v) => setEdit({ ...edit, header: v })} rows={2} />
              <TextArea label="Declaration" value={edit.declaration} onChange={(v) => setEdit({ ...edit, declaration: v })} rows={3} />
              <TextArea label="Footer" value={edit.footer} onChange={(v) => setEdit({ ...edit, footer: v })} rows={2} />
              <div style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'center' }}>Insert into: <div className="segmented">{(['header', 'declaration', 'footer'] as const).map((k) => <button key={k} type="button" className={focus === k ? 'active' : ''} onClick={() => setFocus(k)}>{k}</button>)}</div></div>
              <Card title="Governed variables" padding={12}>
                {VARIABLES.map((g) => (
                  <div key={g.group} style={{ marginBottom: 8 }}>
                    <div className="section-label" style={{ marginBottom: 4 }}>{g.group}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>{g.vars.map((v) => <button key={v} type="button" className="chip" style={{ fontSize: 11 }} onClick={() => insertVar(v)} title={`Insert {{${v}}} into ${focus}`}>{v}</button>)}</div>
                  </div>
                ))}
                <div style={{ fontSize: 11, color: '#6E6E71' }}>Only these variables render; anything else is refused at save (FR-DOC-005).</div>
              </Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Toggle on={edit.showBankDetails} onChange={(v) => setEdit({ ...edit, showBankDetails: v })} label="Show bank details (masked)" />
                <Toggle on={edit.showSignatory} onChange={(v) => setEdit({ ...edit, showSignatory: v })} label="Show authorised signatory block" />
                <Toggle on={edit.isDefault} onChange={(v) => setEdit({ ...edit, isDefault: v })} label={`Default template for ${edit.docType}`} />
                <Toggle on={edit.status === 'Active'} onChange={(v) => setEdit({ ...edit, status: v ? 'Active' : 'Inactive' })} label="Active" />
              </div>
              {edit.id && (
                <Card title="Version history" padding={12}>
                  <Timeline items={Array.from({ length: edit.templateVersion }).map((_, i) => edit.templateVersion - i).map((v) => ({ type: v === edit.templateVersion ? 'success' as const : 'neutral' as const, event: `v${v}${v === edit.templateVersion ? ' (current)' : ''}`, predicate: v === edit.templateVersion ? `${usage(edit)} document(s) reference this template` : 'Superseded — documents generated with it keep their snapshot', time: v === edit.templateVersion ? edit.updatedAt : edit.createdAt }))} />
                </Card>
              )}
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="section-label">Preview · sample {edit.docType}</span>
                <Button size="sm" variant="secondary" onClick={() => window.print()}>Export PDF</Button>
              </div>
              <div style={{ border: '1px solid #EAEAEA', borderRadius: 8, padding: 8, background: '#F3F5F5', overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
                {preview && <PrintSheet doc={{ ...preview, templateId: edit.id || 'tpl_preview' }} title={edit.docType} extraHeader={<div style={{ fontSize: 10, color: '#5F6368' }}>{edit.header.replace(/\{\{company\.legalName\}\}/g, co.legalName).replace(/\{\{company\.tradeName\}\}/g, co.tradeName).replace(/\{\{company\.gstin\}\}/g, co.registrations[0]?.number ?? '—').replace(/\{\{[^}]+\}\}/g, (m) => m)}</div>} />}
              </div>
              <div style={{ fontSize: 11, color: '#6E6E71', marginTop: 6 }}>Preview uses {preview?.number} with the current company header. Declaration and footer text render from the saved template.</div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
