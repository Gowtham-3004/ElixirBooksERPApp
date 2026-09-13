// Banking module entry — routes: banking/<sub>[/<id>]
import type { ModuleProps } from '../registry';
import { ModuleShell, NoPermission } from '../../components/ui';
import { useSession } from '../../store';
import { AccountsPage } from './Accounts';
import { Vouchers } from './Vouchers';
import { Statements } from './Statements';
import { ReconciliationWorkbench } from './Reconciliation';
import { BankingSettingsPage } from './Settings';
import { BatchRegister, BatchDetail } from '../purchase/Batches';

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  if (!s.permissions.some((p) => p.startsWith('banking.') || p === '*' || p === '*.*.view') && !s.isTenantOwner) return <NoPermission what="Banking" />;
  const items = [
    { id: 'accounts', label: 'Bank & cash accounts', group: 'Accounts' }, { id: 'vouchers', label: 'Vouchers', group: 'Accounts' },
    { id: 'statements', label: 'Statements', group: 'Reconciliation' }, { id: 'reconciliation', label: 'Reconciliation', group: 'Reconciliation' },
    { id: 'batches', label: 'Payment batches', group: 'Payments' },
    { id: 'settings', label: 'Settings', group: 'Setup' },
  ];
  return (
    <ModuleShell module="banking" title="Banking" items={items} defaultSub="accounts">
      {(sub) => {
        switch (sub) {
          case 'accounts': return <AccountsPage id={route.id} />;
          case 'vouchers': return <Vouchers id={route.id} params={route.params} />;
          case 'statements': return <Statements id={route.id} />;
          case 'reconciliation': return <ReconciliationWorkbench params={route.params} id={route.id} />;
          case 'batches': return route.id ? <BatchDetail id={route.id} /> : <BatchRegister />;
          case 'settings': return <BankingSettingsPage />;
          default: return <AccountsPage />;
        }
      }}
    </ModuleShell>
  );
}
