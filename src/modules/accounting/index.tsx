// Accounting module entry: journals, recurring, books (day book / ledger / trial balance), sub-ledgers,
// opening balances, FX & revaluation, period close, settings.
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { useAccountingNav } from '../subnav';
import { JournalRegister } from './JournalRegister';
import { JournalPage } from './JournalPage';
import { JournalForm } from './JournalForm';
import { RecurringRegister } from './Recurring';
import { DayBook, LedgerPage, TrialBalancePage } from './Books';
import { SubLedgerPage } from './SubLedgers';
import { OpeningBalancesPage } from './OpeningBalances';
import { FxExposurePage, RevaluationPage } from './Fx';
import { PeriodClosePage } from './PeriodClose';
import { SettingsPage } from './Settings';
import { IntercompanyPage } from './intercompany';

export default function Module({ route }: ModuleProps) {
  const items = useAccountingNav();
  return (
    <ModuleShell module="accounting" title="Accounting" items={items} defaultSub="journals">
      {(sub) => {
        switch (sub) {
          case 'journals':
            if (route.id === 'new') return <JournalForm fromId={route.params.from} />;
            if (route.id && route.params.edit) return <JournalForm editId={route.id} />;
            if (route.id) return <JournalPage id={route.id} />;
            return <JournalRegister />;
          case 'recurring': return <RecurringRegister />;
          case 'day-book': return <DayBook />;
          case 'ledger': return <LedgerPage />;
          case 'trial-balance': return <TrialBalancePage />;
          case 'customer-ledger': return <SubLedgerPage kind="Customer" />;
          case 'supplier-ledger': return <SubLedgerPage kind="Supplier" />;
          case 'intercompany': return <IntercompanyPage />;
          case 'opening-balances': return <OpeningBalancesPage />;
          case 'fx': return <FxExposurePage />;
          case 'revaluation': return <RevaluationPage />;
          case 'period-close': return <PeriodClosePage />;
          case 'settings': return <SettingsPage />;
          default: return <JournalRegister />;
        }
      }}
    </ModuleShell>
  );
}
