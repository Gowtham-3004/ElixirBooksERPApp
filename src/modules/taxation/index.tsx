// Taxation module (FR-TAX-004..006, FR-TDS-001, FR-CMP-001..008).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { TAXATION_NAV } from '../subnav';
import { TaxOverview } from './Overview';
import { GstRegister } from './Registers';
import { EInvoices, EWayBills } from './EInvoices';
import { Gstr1, Gstr3b } from './Gstr';
import { TdsPage } from './Tds';
import { FilingHistory, TaxSettingsPage } from './Filings';


export default function Module(_props: ModuleProps) {
  return (
    <ModuleShell module="taxation" title="Taxation" items={TAXATION_NAV} defaultSub="overview">
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
