// Accounting module entry: journals, recurring, books (day book / ledger / trial balance), sub-ledgers,
// opening balances, FX & revaluation, period close, settings.
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { useCollection, useSession, C } from '../../store';
import type { Journal } from '../../store';
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
  const s = useSession();
  const drafts = useCollection<Journal>(C.journals).filter((j) => j.companyId === s.state.companyId && (j.status === 'Draft' || j.status === 'Submitted' || j.status === 'Approved')).length;
  const items = [
    { id: 'journals', label: 'Journals', group: 'Journals', badge: drafts },
    { id: 'recurring', label: 'Recurring journals', group: 'Journals' },
    { id: 'day-book', label: 'Day book', group: 'Books' },
    { id: 'ledger', label: 'Account ledger', group: 'Books' },
    { id: 'trial-balance', label: 'Trial balance', group: 'Books' },
    { id: 'customer-ledger', label: 'Customer ledger', group: 'Sub-ledgers' },
    { id: 'supplier-ledger', label: 'Supplier ledger', group: 'Sub-ledgers' },
    { id: 'intercompany', label: 'Intercompany', group: 'Sub-ledgers' },
    { id: 'opening-balances', label: 'Opening balances', group: 'Setup' },
    { id: 'settings', label: 'Settings', group: 'Setup' },
    { id: 'fx', label: 'Currencies & FX', group: 'FX' },
    { id: 'revaluation', label: 'Revaluation', group: 'FX' },
    { id: 'period-close', label: 'Period close', group: 'Close' },
  ];
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
