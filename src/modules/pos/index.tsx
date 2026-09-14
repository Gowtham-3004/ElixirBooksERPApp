// POS module entry: full-bleed terminal at `pos` / `pos/terminal`; back-office sub-routes inside the shell.
import type { ModuleProps } from '../registry';
import { ModuleShell } from '../../components/ui';
import { POS_NAV } from '../subnav';
import Terminal from './Terminal';
import { ShiftsRegister, ShiftDetail, BillsRegister, BillDetail, ReturnsRegister, ReturnDetail, ReturnForm, PosAdmin } from './BackOffice';


export default function Module({ route }: ModuleProps) {
  const { sub, id, params } = route;
  if (!sub || sub === 'terminal') return <Terminal />;
  return (
    <ModuleShell module="pos" title="POS" items={POS_NAV} defaultSub="shifts">
      {(s) => {
        switch (s) {
          case 'shifts': return id ? <ShiftDetail key={id} id={id} /> : <ShiftsRegister />;
          case 'bills': return id ? <BillDetail key={id} id={id} /> : <BillsRegister />;
          case 'returns':
            if (id === 'new') return <ReturnForm key={`new-${params.bill ?? ''}`} billId={params.bill} />;
            return id ? <ReturnDetail key={id} id={id} /> : <ReturnsRegister />;
          case 'admin': return <PosAdmin />;
          default: return <ShiftsRegister />;
        }
      }}
    </ModuleShell>
  );
}
