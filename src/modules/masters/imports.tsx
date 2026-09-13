// Imports landing (FR-MDM-003, FR-IMP-001): one wizard per importable master + import log.
import { useState } from 'react';
import { C, nav, useCollection, useSession } from '../../store';
import type { Account, Customer, ExchangeRate, ImportJob, Item, PriceListEntry, Supplier } from '../../store';
import { Badge, Button, DataTable, ImportWizard, PageHeader } from '../../components/ui';
import { fmtDateTime, downloadText, toCSV } from '../../lib/format';
import { accountImport, customerImport, exchangeRateImport, itemImport, priceListEntryImport, supplierImport } from './importDefs';

type Kind = 'customers' | 'suppliers' | 'items' | 'accounts' | 'priceListEntries' | 'exchangeRates';

const CARDS: { kind: Kind | 'opening'; title: string; desc: string; icon: string; validators: string }[] = [
  { kind: 'customers', title: 'Customers', desc: 'Identity, GSTIN/PAN, address, contact, terms, credit limit', icon: '👤', validators: 'GSTIN · PAN · email · state · duplicate GSTIN' },
  { kind: 'suppliers', title: 'Suppliers', desc: 'Identity, GSTIN/PAN, address, contact, purchase terms, MSME', icon: '🏭', validators: 'GSTIN · PAN · email · duplicate GSTIN' },
  { kind: 'items', title: 'Items & services', desc: 'SKU, type, UOM, HSN/SAC, tax code, prices, reorder', icon: '📦', validators: 'Type · tax code · numeric prices · duplicate SKU' },
  { kind: 'accounts', title: 'Chart of accounts', desc: 'Code, name, group, normal balance, opening balance', icon: '📒', validators: 'Group code · Dr/Cr · duplicate code' },
  { kind: 'priceListEntries', title: 'Price list entries', desc: 'Price list, item, UOM, min qty, rate, party, effective dates', icon: '🏷️', validators: 'Price list code · item code · numeric rate' },
  { kind: 'exchangeRates', title: 'Exchange rates', desc: 'Base/quote, rate, type, effective date, source (go to Pending)', icon: '💱', validators: 'Positive rate · type · date' },
  { kind: 'opening', title: 'Opening balances', desc: 'Account and party-wise opening balances — opens the opening balances page', icon: '⚖️', validators: 'Account code · Dr/Cr · party code' },
];

export function ImportsPage() {
  const s = useSession();
  const jobs = useCollection<ImportJob>(C.importJobs).filter((j) => !j.companyId || j.companyId === s.state.companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const customers = useCollection<Customer>(C.customers);
  const suppliers = useCollection<Supplier>(C.suppliers);
  const items = useCollection<Item>(C.items);
  const accounts = useCollection<Account>(C.accounts);
  const entries = useCollection<PriceListEntry>(C.priceListEntries);
  const rates = useCollection<ExchangeRate>(C.exchangeRates);
  const [open, setOpen] = useState<Kind | null>(null);
  const canImport = s.can('masters.import') || s.can('masters.*');
  const def = open === 'customers' ? customerImport(customers) : open === 'suppliers' ? supplierImport(suppliers) : open === 'items' ? itemImport(items) : open === 'accounts' ? accountImport(accounts) : open === 'priceListEntries' ? priceListEntryImport(entries) : open === 'exchangeRates' ? exchangeRateImport(rates) : null;
  return (
    <div className="page">
      <PageHeader title="Imports" subtitle="Upload → map columns → dry-run → fix errors → commit. Every run is audited; re-importing the same file is blocked (FR-MDM-003, FR-IMP-001)." />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {CARDS.map((c) => (
          <div key={c.kind} className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 22 }}>{c.icon}</span><div style={{ fontSize: 14, fontWeight: 600 }}>{c.title}</div></div>
            <div style={{ fontSize: 12, color: '#5F6368', flex: 1 }}>{c.desc}</div>
            <div style={{ fontSize: 11, color: '#6E6E71' }}>Validators: {c.validators}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button variant="primary" size="sm" disabled={!canImport} reason={canImport ? undefined : 'Requires import permission'} onClick={() => (c.kind === 'opening' ? nav.go('accounting/opening-balances?import=1') : setOpen(c.kind))}>{c.kind === 'opening' ? 'Open page' : 'Import'}</Button>
              <span style={{ fontSize: 11, color: '#6E6E71', alignSelf: 'center' }}>{jobs.filter((j) => j.entity.toLowerCase().startsWith(c.title.toLowerCase().slice(0, 6))).length} run{jobs.filter((j) => j.entity.toLowerCase().startsWith(c.title.toLowerCase().slice(0, 6))).length === 1 ? '' : 's'}</span>
            </div>
          </div>
        ))}
      </div>
      <div>
        <div className="section-title">Import log</div>
        <DataTable<ImportJob> rows={jobs} dense emptyTitle="No imports yet" emptyDescription="Committed and cancelled import runs appear here with their row-error details." columns={[
          { key: 'createdAt', label: 'When', render: (j) => fmtDateTime(j.committedAt ?? j.createdAt) },
          { key: 'entity', label: 'Entity' },
          { key: 'fileName', label: 'File', render: (j) => <span className="identifier">{j.fileName}</span> },
          { key: 'rows', label: 'Rows', align: 'right' },
          { key: 'valid', label: 'Imported', align: 'right', render: (j) => <span style={{ color: '#12784E' }}>{j.valid}</span> },
          { key: 'errors', label: 'Errors', align: 'right', render: (j) => (j.errors ? <span style={{ color: '#C0393F' }}>{j.errors}</span> : '—') },
          { key: 'duplicates', label: 'Duplicates', align: 'right', render: (j) => (j.duplicates ? <span style={{ color: '#8A4B0F' }}>{j.duplicates}</span> : '—') },
          { key: 'by', label: 'By' },
          { key: 'status', label: 'Status', render: (j) => <Badge status={j.status} /> },
          { key: 'fingerprint', label: 'Fingerprint', render: (j) => <span className="identifier" style={{ fontSize: 11 }}>{j.fingerprint}</span> },
        ]} rowActions={(j) => [{ label: 'Download error rows (CSV)', onClick: () => downloadText(`${j.fileName}-errors.csv`, toCSV(j.errorRows)), disabled: !j.errorRows.length, reason: j.errorRows.length ? undefined : 'No errors' }]} />
      </div>
      {open && def && <ImportWizard open onClose={() => setOpen(null)} {...def} />}
    </div>
  );
}
