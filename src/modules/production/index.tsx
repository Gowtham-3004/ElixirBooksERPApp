// Production module entry — routes: production/<sub>[/<id>[/edit]] (FR-MFG-001..016)
import type { ModuleProps } from '../registry';
import { ModuleShell, NoPermission } from '../../components/ui';
import { C, useCollection, useSession } from '../../store';
import type { ProductionOrder, ProductionReceipt, QualityInspection } from './types';
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
  const orders = useCollection<ProductionOrder>(C.productionOrders);
  const inspections = useCollection<QualityInspection>(C.qualityInspections);
  const receipts = useCollection<ProductionReceipt>(C.productionReceipts);
  const cid = s.state.companyId;
  if (!s.can('production.view') && !s.permissions.some((p) => p.startsWith('production.') || p === '*' || p === '*.*.view')) return <NoPermission what="Production" />;
  const active = orders.filter((o) => o.companyId === cid && ['Released', 'In Progress', 'Partially Completed'].includes(o.status)).length;
  const openQc = inspections.filter((q) => q.companyId === cid && (q.status === 'Open' || q.status === 'In Progress')).length;
  const held = receipts.filter((r) => r.companyId === cid && r.status === 'Hold').length;
  const items = [
    { id: 'overview', label: 'Overview', group: 'Shop floor' },
    { id: 'orders', label: 'Production orders', group: 'Shop floor', badge: active },
    { id: 'issues', label: 'Material issues', group: 'Shop floor' },
    { id: 'receipts', label: 'Production receipts', group: 'Shop floor', badge: held },
    { id: 'quality', label: 'Quality', group: 'Shop floor', badge: openQc },
    { id: 'subcontracting', label: 'Subcontracting', group: 'Shop floor' },
    { id: 'mrp', label: 'MRP', group: 'Planning' },
    { id: 'boms', label: 'Bills of material', group: 'Engineering' },
    { id: 'routings', label: 'Routings', group: 'Engineering' },
    { id: 'work-centres', label: 'Work centres', group: 'Engineering' },
    { id: 'wip', label: 'WIP & costing', group: 'Costing' },
    { id: 'genealogy', label: 'Genealogy', group: 'Costing' },
    { id: 'settings', label: 'Settings', group: 'Setup' },
  ];
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
