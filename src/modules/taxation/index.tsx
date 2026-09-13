// Taxation module (FR-TAX-004..006, FR-TDS-001, FR-CMP-001..008).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { TaxOverview } from './Overview';
import { GstRegister } from './Registers';
import { EInvoices, EWayBills } from './EInvoices';
import { Gstr1, Gstr3b } from './Gstr';
import { TdsPage } from './Tds';
import { FilingHistory, TaxSettingsPage } from './Filings';

const ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'b2b', label: 'GST B2B register', group: 'Registers' },
  { id: 'b2c', label: 'GST B2C register', group: 'Registers' },
  { id: 'itc', label: 'Purchase (ITC) register', group: 'Registers' },
  { id: 'cdn', label: 'Credit / debit notes', group: 'Registers' },
  { id: 'einvoices', label: 'e-Invoices', group: 'Statutory integrations' },
  { id: 'eway-bills', label: 'e-Way bills', group: 'Statutory integrations' },
  { id: 'gstr1', label: 'GSTR-1', group: 'Returns' },
  { id: 'gstr3b', label: 'GSTR-3B', group: 'Returns' },
  { id: 'tds', label: 'TDS / TCS', group: 'Returns' },
  { id: 'filings', label: 'Filing history', group: 'Returns' },
  { id: 'settings', label: 'Settings', group: 'Setup' },
];

export default function Module(_props: ModuleProps) {
  return (
    <ModuleShell module="taxation" title="Taxation" items={ITEMS} defaultSub="overview">
      {(sub) => {
        switch (sub) {
          case 'b2b': return <GstRegister kind="b2b" />;
          case 'b2c': return <GstRegister kind="b2c" />;
          case 'itc': return <GstRegister kind="itc" />;
          case 'cdn': return <GstRegister kind="cdn" />;
          case 'einvoices': return <EInvoices />;
          case 'eway-bills': return <EWayBills />;
          case 'gstr1': return <Gstr1 />;
          case 'gstr3b': return <Gstr3b />;
          case 'tds': return <TdsPage />;
          case 'filings': return <FilingHistory />;
          case 'settings': return <TaxSettingsPage />;
          default: return <TaxOverview />;
        }
      }}
    </ModuleShell>
  );
}
