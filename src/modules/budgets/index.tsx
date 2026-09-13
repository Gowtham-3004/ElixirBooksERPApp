// Budgets & Expenses module (FR-BUD-001..003, FR-EXP-001/002).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { BudgetsRegister, BudgetEditor } from './Budgets';
import { VariancePage, ControlPage } from './Variance';
import { ExpensesRegister, ExpenseForm, ExpenseDetail } from './Expenses';
import { ExpenseSettingsPage } from './Settings';

const ITEMS = [
  { id: 'budgets', label: 'Budgets' },
  { id: 'variance', label: 'Budget vs actuals' },
  { id: 'control', label: 'Budget control' },
  { id: 'expenses', label: 'Expense claims' },
  { id: 'settings', label: 'Expense settings' },
];

export default function Module({ route }: ModuleProps) {
  return (
    <ModuleShell module="budgets" title="Budgets & Expenses" items={ITEMS} defaultSub="variance">
      {(sub) => {
        switch (sub) {
          case 'budgets': return route.id ? <BudgetEditor id={route.id} /> : <BudgetsRegister />;
          case 'variance': return <VariancePage />;
          case 'control': return <ControlPage />;
          case 'expenses':
            if (route.id === 'new') return <ExpenseForm />;
            if (route.id && route.params.edit) return <ExpenseForm id={route.id} key={route.id} />;
            if (route.id) return <ExpenseDetail id={route.id} />;
            return <ExpensesRegister />;
          case 'settings': return <ExpenseSettingsPage />;
          default: return <VariancePage />;
        }
      }}
    </ModuleShell>
  );
}
