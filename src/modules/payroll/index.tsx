// Payroll module (FR-PAY-001..005).
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { EmployeesPage } from './Employees';
import { StructuresPage } from './Structures';
import { InputsPage } from './Inputs';
import { RunsPage } from './Runs';
import { PayslipsPage } from './Payslips';
import { LoansPage } from './Loans';
import { StatutoryPage, PayrollSettingsPage } from './Statutory';

const ITEMS = [
  { id: 'employees', label: 'Employees' },
  { id: 'structures', label: 'Salary structures' },
  { id: 'inputs', label: 'Inputs' },
  { id: 'runs', label: 'Payroll runs' },
  { id: 'payslips', label: 'Payslips' },
  { id: 'loans', label: 'Loans & advances' },
  { id: 'statutory', label: 'Statutory' },
  { id: 'settings', label: 'Settings' },
];

export default function Module({ route }: ModuleProps) {
  return (
    <ModuleShell module="payroll" title="Payroll" items={ITEMS} defaultSub="runs">
      {(sub) => {
        switch (sub) {
          case 'employees': return <EmployeesPage />;
          case 'structures': return <StructuresPage id={route.id || undefined} />;
          case 'inputs': return <InputsPage />;
          case 'runs': return <RunsPage id={route.id || undefined} />;
          case 'payslips': return <PayslipsPage id={route.id || undefined} />;
          case 'loans': return <LoansPage />;
          case 'statutory': return <StatutoryPage />;
          case 'settings': return <PayrollSettingsPage />;
          default: return <RunsPage id={route.id || undefined} />;
        }
      }}
    </ModuleShell>
  );
}
