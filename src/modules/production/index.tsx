// Production module entry — routes: production/<sub>[/<id>[/edit]] (FR-MFG-001..016)
import type { ModuleProps } from '../registry';
import { ModuleShell, NoPermission } from '../../components/ui';
import { useProductionNav } from '../subnav';
import { useSession } from '../../store';
import { Overview } from './Overview';
import { BomsPage } from './Boms';
import { RoutingsPage } from './Routings';
import { WorkCentresPage } from './WorkCentres';
import { MrpPage } from './Mrp';
import { OrderRegister } from './Orders';
import { OrderForm } from './OrderForm';
import { OrderDetail } from './OrderDetail';
import { IssuesPage } from './Issues';
import { ReceiptsPage } from './Receipts';
import { QualityPage } from './Quality';
import { SubcontractingPage } from './Subcontracting';
import { WipPage } from './Wip';
import { GenealogyPage } from './Genealogy';
import { ProductionSettingsPage } from './Settings';

export default function Module({ route }: ModuleProps) {
  const s = useSession();
  const items = useProductionNav();
  if (!s.can('production.view') && !s.permissions.some((p) => p.startsWith('production.') || p === '*' || p === '*.*.view')) return <NoPermission what="Production" />;
  const id = route.id;
  const edit = route.rest[0] === 'edit';
  return (
    <ModuleShell module="production" title="Production" items={items} defaultSub="overview">
      {(sub) => {
        switch (sub) {
          case 'overview': return <Overview />;
          case 'boms': return <BomsPage id={id} params={route.params} />;
          case 'routings': return <RoutingsPage id={id} />;
          case 'work-centres': return <WorkCentresPage id={id} />;
          case 'mrp': return <MrpPage id={id} />;
          case 'orders':
            if (id === 'new') return <OrderForm params={route.params} />;
            if (id && edit) return <OrderForm id={id} params={route.params} />;
            if (id) return <OrderDetail id={id} />;
            return <OrderRegister />;
          case 'issues': return <IssuesPage id={id} params={route.params} />;
          case 'receipts': return <ReceiptsPage id={id} params={route.params} />;
          case 'quality': return <QualityPage id={id} params={route.params} />;
          case 'subcontracting': return <SubcontractingPage id={id} params={route.params} />;
          case 'wip': return <WipPage params={route.params} />;
          case 'genealogy': return <GenealogyPage params={route.params} id={id} />;
          case 'settings': return <ProductionSettingsPage />;
          default: return <Overview />;
        }
      }}
    </ModuleShell>
  );
}
